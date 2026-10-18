/*
 * Edit mode across a reload. Saving anything the player builds from (panels, ids,
 * captions) reloads the page; this is what puts the author back where they were: in
 * edit mode, with the same chapters open, at the same scroll.
 *
 * sessionStorage, so it is per tab and gone when the tab closes. The pencil's script
 * (scripts/lerpit-editor.mjs) reads ON_KEY to decide whether to start edit mode on load.
 */

const RESUME_KEY = 'lerpit-editor:resume';
export const ON_KEY = 'lerpit-editor:on';

export type Resume = { path: string; open: string[]; scrollY: number };

export function markOn(path: string) {
  try {
    sessionStorage.setItem(ON_KEY, path);
  } catch {}
}

export function stashResume(resume: Resume) {
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify({ ...resume, at: Date.now() }));
    sessionStorage.setItem(ON_KEY, resume.path);
  } catch {}
}

/** The stashed state for this page, if it was stashed in the last minute. */
export function readResume(path: string): Resume | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(RESUME_KEY) ?? 'null');
    if (value && value.path === path && Date.now() - value.at < 60_000) return value;
  } catch {}
  return null;
}

/**
 * Keeps the dev server from reloading this tab while it holds unsaved work.
 *
 * A save from another editor (VS Code, say) makes the content watcher reload every open
 * tab, which would throw the author's unsaved edits away. Vite's client hands the reload
 * payload to its listeners before it compares `payload.path` with the page, so pointing
 * the path at a page nobody is on makes this tab sit the reload out. The next save here
 * then meets the changed file and asks what to do with it.
 */
export function holdReloads(holding: () => boolean) {
  import.meta.hot?.on('vite:beforeFullReload', (payload: { path?: string }) => {
    if (!holding()) return;
    payload.path = '/__lerpit-editor-held__.html';
    import('./dom').then(({ toast }) => toast('A file changed on disk. Your unsaved edits stay; saving will ask which to keep.', 'info', 7000));
  });
}

/**
 * Creates something and goes to its page, in edit mode.
 *
 * Creating a collection or a lerpette changes the content tree, which makes the dev
 * server reload every tab, and that reload can reach this tab before the create's reply
 * does. Reloading here then would cancel the navigation and leave the author on the old
 * page, so this tab sits out every reload from before the request until it has left.
 */
export async function createAndGo(create: () => Promise<{ href: string }>) {
  let holding = true;
  import.meta.hot?.on('vite:beforeFullReload', (payload: { path?: string }) => {
    if (holding) payload.path = '/__lerpit-editor-held__.html';
  });
  try {
    const { href } = await create();
    markOn(href);
    location.href = href;
  } catch (error) {
    holding = false;
    throw error;
  }
}

/** Forgets the open chapters; `leave` also turns edit mode off for the next load. */
export function clearResume(leave = false) {
  try {
    sessionStorage.removeItem(RESUME_KEY);
    if (leave) sessionStorage.removeItem(ON_KEY);
  } catch {}
}
