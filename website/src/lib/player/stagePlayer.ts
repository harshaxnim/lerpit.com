import { createPanelStack, DEFAULT_PANEL, PANEL_LABELS, type PanelStack } from '@lerpit/framework/panels';
import { createChapterRuntime } from '@lerpit/framework/runtimes/createChapterRuntime';
import type { EditorLayer } from '@lerpit/framework/runtimes/editorLayer';
import { createStageChrome } from '@lerpit/framework/stage/chrome';
import type { LerpetteRuntimeContext, LerpetteStepRuntime } from '@lerpit/framework/types';
import { loadLerpetteStepRuntime } from '../runtimeLoader';
import { captionHtml } from './caption';

/**
 * The stage: the right-hand column, and what runs in it.
 *
 * The player owns the slot (the box, the tab strip, the caption band and the corner
 * cards) and the panel stack inside it. Chapters own nothing here but their runtime.
 * Chapters that name the same panels share one stack, so scrolling between them keeps
 * the GL contexts, the open tab and the column itself; a chapter that names different
 * panels gets a new stack, and every runtime mounted on the old one is disposed first.
 *
 * Each chapter's runtime is made once and kept for the page's life. Leaving a chapter
 * pauses it, coming back resumes it, and coming back to the browser tab resumes it
 * without rebuilding anything.
 */

/** The slice of a step the player needs in the browser, as LerpettePlayer.astro projects it. */
export type ClientStep = {
  id: string;
  title: string;
  runtimeImportKey: string;
  /** Whose runtime shows while this chapter is active: its own id or its nearest neighbour's. */
  runtimeStepId: string;
  assetBasePath: string;
  codePath: string;
  /** Panels this chapter declared in its heading. Empty means its code decides. */
  panels: string[];
  /** control.toml's caption for this chapter, which wins over the code's. */
  caption?: string;
  idleStatus?: string;
};

export type StagePlayerOptions = {
  host: HTMLElement;
  tabs: HTMLElement;
  caption: HTMLElement | null;
  lessonTitle: string;
  steps: ClientStep[];
  /** The chapter's section, for the code boxes in it. */
  sectionFor(stepId: string): HTMLElement | undefined;
  /**
   * What is behind the drawer changed: for its label, and for the shimmer that tells a
   * reader on a phone the panel they cannot see is now showing another chapter.
   */
  onPanel(label: string, newChapter: boolean): void;
};

export type StagePlayer = {
  /** Show this chapter's runtime. Serialized by the caller. */
  activate(stepId: string): Promise<void>;
  resize(): void;
  /** The reader came back to this browser tab. */
  resume(): void;
  /** The page's code boxes, once built. Activation waits for these before mounting. */
  setEditors(ready: Promise<EditorLayer | null>): void;
  /** Whose runtime is on screen, for anyone deciding whether to activate again. */
  activeOwner(): string | null;
  destroy(): void;
};

const SLOT_CLASS = 'lerpette-stage__panel';

export function createStagePlayer(options: StagePlayerOptions): StagePlayer {
  const { host, tabs, lessonTitle } = options;
  const stepsById = new Map(options.steps.map((step) => [step.id, step]));

  // The two corners belong to the slot, not to any panel, so they are made once and
  // put back into the box each time a new stack is built in it.
  const tray = document.createElement('div');
  tray.className = 'lerpette-panel__tray';
  const readings = document.createElement('div');
  readings.className = 'lerpette-panel__readings';

  const writeCaption = (value: string, fault = false) => {
    if (!options.caption) return;
    options.caption.innerHTML = captionHtml(value);
    options.caption.classList.toggle('is-fault', fault);
  };
  const chrome = createStageChrome({ tray, readings, setCaption: writeCaption });

  const runtimes = new Map<string, LerpetteStepRuntime<any>>();
  const mounted = new Set<string>();
  let stack: PanelStack | null = null;
  let stackKey = '';
  let shared = new Map<string, unknown>();
  let active: string | null = null;
  /** The tab the reader last chose, carried to the next stack that has it. */
  let preferredTab: string | null = null;
  let editors: EditorLayer | null = null;
  let editorsReady: Promise<unknown> = Promise.resolve();
  let lastLabel = '';

  const ownerOf = (stepId: string) => stepsById.get(stepId)?.runtimeStepId || stepId;

  const ctxFor = (stepId: string): LerpetteRuntimeContext<any> => {
    const step = stepsById.get(stepId);
    if (!step || !stack) throw new Error(`No stage for step "${stepId}".`);
    const section = options.sectionFor(stepId);
    const stage = chrome.owner(stepId);
    return {
      host,
      tabs,
      lessonTitle,
      shared,
      setCaption: (value: string) => stage.caption(value),
      currentStepId: stepId,
      codePath: step.codePath,
      codeHosts: section ? [...section.querySelectorAll<HTMLElement>('[data-lerpit-code]')] : [],
      editors: editors ?? undefined,
      surface: stack.panels[0]?.target,
      panels: stack,
      stage,
      resolveAssetUrl(relativePath: string) {
        return new URL(relativePath, new URL(step.assetBasePath, window.location.origin)).toString();
      }
    };
  };

  const runtimeFor = async (owner: string): Promise<LerpetteStepRuntime<any>> => {
    const cached = runtimes.get(owner);
    if (cached) return cached;
    const step = stepsById.get(owner)!;
    // A chapter with panels in its heading and no module of its own still runs: its
    // code comes from the boxes in its prose, or it is an empty stage it names.
    const runtime = step.runtimeImportKey ? await loadLerpetteStepRuntime(step.runtimeImportKey) : createChapterRuntime({});
    runtimes.set(owner, runtime);
    return runtime;
  };

  const panelNamesFor = (owner: string, runtime: LerpetteStepRuntime<any>): string[] => {
    const declared = stepsById.get(owner)?.panels ?? [];
    if (declared.length > 0) return declared;
    if (runtime.panels && runtime.panels.length > 0) return [...runtime.panels];
    return [DEFAULT_PANEL];
  };

  const announcePanel = (newChapter: boolean) => {
    lastLabel = stack?.active()?.panel.label ?? lastLabel;
    options.onPanel(lastLabel, newChapter);
  };

  /**
   * Take the old stack down and stand the new one up. Runtimes dispose before `shared`
   * is dropped, because that map is where a runtime may park live handles; losing it
   * first would leak them with no way left to reach them.
   */
  const swapStack = async (names: string[]) => {
    for (const id of mounted) {
      runtimes.get(id)?.dispose?.(ctxFor(id));
      chrome.drop(id);
    }
    mounted.clear();

    if (stack) {
      preferredTab = stack.active()?.panel.name ?? preferredTab;
      stack.destroy();
    }
    host.replaceChildren();
    host.className = `${SLOT_CLASS} lerpette-panel--stack`;
    shared = new Map();

    const slot = {
      host,
      tabs,
      lessonTitle,
      shared,
      setCaption: (value: string) => (active ? chrome.owner(active).caption(value) : writeCaption(value))
    };
    stack = await createPanelStack(slot, names, (shown) => {
      // A tab the reader chose: remember it, and bring the panel up to date, since a
      // panel nobody was looking at was not being drawn.
      preferredTab = shown.panel.name;
      if (active) runtimes.get(active)?.resize?.(ctxFor(active));
      announcePanel(false);
    }, preferredTab);
    stackKey = names.join(',');
    host.append(readings, tray);
  };

  /**
   * Take everything off the stage. A chapter that fails to come up leaves it blank
   * rather than still showing the chapter before it; the next activation builds anew.
   */
  const clearStage = () => {
    for (const id of mounted) {
      try {
        runtimes.get(id)?.dispose?.(ctxFor(id));
      } catch {
        // Already failing; one runtime failing to clean up must not stop the rest.
      }
      chrome.drop(id);
    }
    mounted.clear();
    if (stack) {
      preferredTab = stack.active()?.panel.name ?? preferredTab;
      stack.destroy();
      stack = null;
    }
    host.replaceChildren();
    stackKey = '';
    shared = new Map();
    active = null;
  };

  const enter = async (owner: string) => {
    const runtime = await runtimeFor(owner);
    const names = panelNamesFor(owner, runtime);

    if (active) {
      const leaving = active;
      // Nothing is on screen until the next chapter has entered, so an activation
      // that fails part-way leaves no runtime half-running.
      active = null;
      await runtimes.get(leaving)?.exit?.(ctxFor(leaving));
      chrome.owner(leaving).hide();
    }

    if (names.join(',') !== stackKey) await swapStack(names);

    const stage = chrome.owner(owner);
    stage.pin(stepsById.get(owner)?.caption ?? null);

    if (!mounted.has(owner)) {
      // The boxes have to exist before a runtime can claim them.
      await editorsReady;
      await runtime.mount(ctxFor(owner));
      mounted.add(owner);
    }

    stage.show();
    await runtime.enter?.(ctxFor(owner));
    active = owner;
    announcePanel(true);
  };

  return {
    async activate(stepId) {
      const owner = ownerOf(stepId);
      if (owner === active || !stepsById.has(owner)) return;
      try {
        await enter(owner);
      } catch (error) {
        clearStage();
        chrome.drop(owner);
        // A chapter that loaded but failed to mount builds afresh next time too.
        runtimes.delete(owner);
        throw error;
      }
    },

    resize() {
      if (active) runtimes.get(active)?.resize?.(ctxFor(active));
    },

    resume() {
      if (active) runtimes.get(active)?.resume?.(ctxFor(active));
    },

    setEditors(ready) {
      editorsReady = ready.then((layer) => {
        editors = layer;
      });
    },

    activeOwner: () => active,

    destroy() {
      for (const id of mounted) {
        try {
          runtimes.get(id)?.dispose?.(ctxFor(id));
        } catch {
          // The page is going away; one runtime failing to clean up must not stop the rest.
        }
      }
      mounted.clear();
      chrome.dropAll();
      stack?.destroy();
      stack = null;
    }
  };

}

/** The label the drawer shows before anything has loaded. */
export function initialPanelLabel(steps: ClientStep[]): string {
  const first = steps.find((step) => step.panels.length > 0)?.panels[0] ?? DEFAULT_PANEL;
  return PANEL_LABELS[first] ?? 'Panel';
}
