/*
 * The local editor's entry point. Nothing loads it until the pencil button beside the
 * L/P switch is pressed (or a reload resumes edit mode); the button and its script are
 * put on the page by the dev server only (scripts/lerpit-editor.mjs), so a production
 * page has no way to reach this module.
 */

import './editor.css';
import { toast } from './dom';
import { markOn } from './resume';

let started = false;

export async function start() {
  if (started) return;
  started = true;
  document.getElementById('lerpit-edit-button')?.setAttribute('aria-pressed', 'true');
  markOn(location.pathname);
  try {
    const player = document.querySelector<HTMLElement>('[data-lerpette-player][data-collection][data-lerpette]');
    if (player) {
      const { startLesson } = await import('./lessonEditor');
      await startLesson(player, player.dataset.collection!, player.dataset.lerpette!);
      return;
    }
    const showcases = document.querySelectorAll<HTMLElement>('.archive-collection[data-collection]');
    if (document.querySelector('.sheet--collection') && showcases.length === 1) {
      const { startCollection } = await import('./collectionEditor');
      await startCollection(showcases[0], showcases[0].dataset.collection!);
      return;
    }
    if (document.querySelector('.collection-header')) {
      const { startLibrary } = await import('./collectionEditor');
      await startLibrary();
      return;
    }
    toast('There is nothing on this page the editor knows how to edit.', 'info');
    started = false;
  } catch (error) {
    started = false;
    toast(`The editor could not start: ${(error as Error).message}`, 'bad', 8000);
    throw error;
  }
}
