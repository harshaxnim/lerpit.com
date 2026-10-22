import type { EditorLayer } from '@lerpit/framework/runtimes/editorLayer';
import { sourceLocation } from '@lerpit/framework/runtimes/errorLocation';
import { isLocalView } from '@lerpit/framework/runtimes/localView';
import { setCollectionColors } from '@lerpit/framework/theme';
import { captionHtml } from './player/caption';
import { createPageChrome } from './player/pageChrome';
import { createStagePlayer, initialPanelLabel, type ClientStep } from './player/stagePlayer';

/**
 * A lesson page in the browser: the page chrome (footnotes, byline, which section is
 * active, the drawer) and the stage player (panels and runtimes), wired together.
 * Each is its own module; this file only decides what one tells the other.
 */

type PlayerConfig = {
  lessonTitle: string;
  steps: ClientStep[];
  /** The colours of this lesson's collection, for randomColor's 'collection' family. */
  collectionColors?: string[];
};

const initializedPlayers = new WeakSet<HTMLElement>();

function readPlayerConfig(root: HTMLElement): PlayerConfig | null {
  const configEl = root.querySelector<HTMLScriptElement>('[data-player-config]');
  if (!configEl?.textContent) return null;
  try {
    return JSON.parse(configEl.textContent) as PlayerConfig;
  } catch {
    return null;
  }
}

/*
 * Under npm run dev, a saved lesson file reloads only the pages playing that lesson;
 * the server says which lesson it was (lerpit-watcher in astro.config.mjs).
 */
if (import.meta.hot) {
  import.meta.hot.on('lerpit:lesson-code', (changed: { collection: string; lerpette: string }) => {
    const playing = Array.from(document.querySelectorAll<HTMLElement>('[data-lerpette-player]')).some(
      (root) => root.dataset.collection === changed.collection && root.dataset.lerpette === changed.lerpette
    );
    if (playing) window.location.reload();
  });
}

export function initLerpettePlayers() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-lerpette-player]')) {
    if (initializedPlayers.has(root)) continue;
    const config = readPlayerConfig(root);
    const host = root.querySelector<HTMLElement>('[data-panel-host]');
    // No stage means no chapter has anything to show: the page stays prose.
    if (!config || config.steps.length === 0 || !host) continue;
    initializedPlayers.add(root);
    initPlayer(root, host, config);
  }
}

function initPlayer(root: HTMLElement, host: HTMLElement, config: PlayerConfig) {
  const { steps, lessonTitle } = config;
  // Before any chapter loads, so its first randomColor(i, { from: 'collection' }) has them.
  if (config.collectionColors) setCollectionColors(config.collectionColors);
  const stepIds = new Set(steps.map((step) => step.id));
  const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-section-id]'));
  const caption = root.querySelector<HTMLElement>('[data-stage-status]');
  const firstStepId = steps[0].id;

  const stage = createStagePlayer({
    host,
    tabs: root.querySelector<HTMLElement>('[data-panel-tabs]') ?? document.createElement('div'),
    caption,
    lessonTitle,
    steps,
    sectionFor: (stepId) => sections.find((el) => el.dataset.sectionId === stepId),
    onPanel: (label, isNew) => page.setPanel(label, isNew)
  });

  /**
   * Activations are serialized. Each awaits a module load, possibly a stack swap and a
   * mount, and scrolling fast can start the next before the last has finished;
   * interleaving them would leave the panel and the runtime disagreeing about which
   * chapter is on screen.
   */
  let chain: Promise<void> = Promise.resolve();
  const activate = (stepId: string) => {
    chain = chain
      .then(() => stage.activate(stepId))
      .catch((error: unknown) => {
        console.error(`[lerpette] step "${stepId}" failed to activate`, error);
        // The scroll sync already moved on optimistically; let it retry this section.
        page.forget();
        if (!caption) return;
        // Under npm run dev, code that does not parse arrives as a SyntaxError naming the
        // file and line (chapterSyntaxErrors in astro.config.mjs). That is for the
        // author, so local view only; public view says what a reader would be told.
        const said = captionHtml(error instanceof SyntaxError && isLocalView()
          ? `This chapter's code does not parse:\n\`${error.message}\``
          : 'This step failed to load.');
        caption.innerHTML = said;
        caption.classList.add('is-fault');
        // Code that threw while loading or mounting gets its message and line, once the
        // source map is read, unless another chapter has taken the caption since.
        if (error instanceof SyntaxError || !(error instanceof Error)) return;
        void sourceLocation(error).then((at) => {
          if (at && caption.innerHTML === said) caption.innerHTML = captionHtml(`This chapter's code threw:\n\`${at}: ${error.message}\``);
        });
      });
    return chain;
  };

  const onSection = (sectionId: string) => {
    page.setActive(sectionId);
    // The intro shows the first chapter's stage: it is what the article opens on.
    void activate(sectionId === 'intro' || !stepIds.has(sectionId) ? firstStepId : sectionId);
  };

  const page = createPageChrome({
    root,
    titles: new Map(steps.map((step) => [step.id, step.title])),
    onSection,
    onDrawer: () => stage.resize()
  });

  // Named before the first frame, which is before any panel has loaded: the worst case
  // is then a labelled box that says what went wrong, not an unnamed empty one.
  page.setPanel(initialPanelLabel(steps), false);

  /**
   * Every code box on the page, built now rather than when its chapter becomes active,
   * so a reader scrolling past a chapter sees the code it is about. Activation waits on
   * this: a runtime claims its boxes while mounting, which happens once.
   */
  const idle = new Map(steps.filter((step) => step.idleStatus).map((step) => [step.id, step.idleStatus!]));
  // The editor is CodeMirror and a TypeScript compiler: most of this page's script by
  // weight. A lesson with no code box in its prose never loads it.
  const editors: Promise<EditorLayer | null> = root.querySelector('[data-lerpit-code]')
    ? import('@lerpit/framework/runtimes/editorLayer').then(({ createEditorLayer }) =>
        createEditorLayer({
          sections,
          codePathFor: (stepId) => steps.find((step) => step.id === stepId)?.codePath ?? null,
          idleStatusFor: (stepId) => idle.get(stepId),
          // Pressing run on a chapter scrolled away builds into a panel nobody is looking
          // at, so it is made the active one first.
          activate: (stepId) => activate(stepId)
        })
      )
    : Promise.resolve(null);
  stage.setEditors(editors);

  const onResize = () => {
    stage.resize();
    page.sync();
  };
  // Coming back to the browser tab resumes the chapter; it never rebuilds it.
  const onVisibility = () => {
    if (!document.hidden) stage.resume();
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);

  window.addEventListener('pagehide', () => {
    void editors.then((layer) => layer?.destroy());
    stage.destroy();
    page.destroy();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  const hash = decodeURIComponent(window.location.hash.replace('#', ''));
  onSection(stepIds.has(hash) ? hash : 'intro');
  page.sync();
}
