import { Pause, Play, RotateCcw, StepForward } from 'lucide-static';
import { Pane } from 'tweakpane';
import { createReadingsCard, type Readings, type ReadingsCard } from '../readings/readings';
import type { ReadingsView } from '../readings/view';
import './chrome.css';

/*
 * The stage's own chrome: the controls card with pause and restart in the top right,
 * the readings card in the top left, and the caption band at the foot.
 *
 * These used to belong to the 3D runtime, which is why only 3D chapters had them. They
 * belong to the stage instead, the slot the player owns, so every chapter gets them
 * whatever panel it draws into: a 2D sketch can graph its energy, a table can have a
 * slider, and pause and restart mean the same thing everywhere.
 *
 * Each chapter gets its own set of cards (an owner). Moving to another chapter hides
 * the set rather than destroying it, so coming back finds the cards as the reader
 * left them; restarting a chapter rebuilds its cards but keeps the reader's choices
 * (folded or not, which reading is showing, the slider values). A chapter seen for the
 * first time starts as its own code asks.
 */

export type ControlsOptions = {
  /** Start with the controls showing rather than folded. */
  expanded?: boolean;
};

/** What a chapter's code reaches the stage through. */
export type StageOwner = {
  /** The tweakpane in the top-right card, made on first call. Starts folded. */
  controls(options?: ControlsOptions): Pane;
  /** The readings in the top-left card, made on first call. See readings/readings.ts. */
  readings(): Readings;
  /**
   * The band at the foot of the stage. The last value set stands. `fault` marks it as
   * the chapter's own error rather than its caption: shown amber, over any pin.
   */
  caption(value: string, fault?: boolean): void;
  /**
   * A caption the author fixed outside the code (control.toml's `[caption]`), shown in
   * place of whatever the code says. null lets the code speak again.
   */
  pin(value: string | null): void;
  /** Offer a restart button that calls this, or take it away with null. */
  restartable(run: (() => void) | null): void;
  /**
   * Offer a pause/resume toggle that calls this with the next paused state, or take it
   * away with null. `startPaused` shows it as paused already: a run that begins held.
   */
  pausable(run: ((paused: boolean) => void) | null, startPaused?: boolean): void;
  /** Offer a step button that pauses and calls this once per press, or take it away with null. */
  steppable(run: (() => void) | null): void;
  /** The chapter has finished adding readings: apply the starting view. */
  settle(): void;
  /** Sample the readings that are due. Once per frame, after the frame was drawn. */
  tick(now: number): void;
  /** Put this chapter's cards and caption on the stage. */
  show(): void;
  /** Take them off again, keeping them for the next show(). */
  hide(): void;
  /**
   * Throw the cards away. `keepChoices` is a restart: the reader's folds, reading and
   * slider values are remembered and handed to the next cards this owner builds.
   */
  reset(keepChoices: boolean): void;
};

export type StageChrome = {
  owner(id: string): StageOwner;
  /** Forget an owner entirely, cards and choices. */
  drop(id: string): void;
  dropAll(): void;
};

export type StageChromeOptions = {
  /** Top-right corner. */
  tray: HTMLElement;
  /** Top-left corner. */
  readings: HTMLElement;
  setCaption(value: string, fault?: boolean): void;
};

/** Stage choices are kept under these, one map per owner. */
const KEY = {
  controlsCollapsed: 'stage:controls-collapsed',
  readings: 'stage:readings',
  pane: 'stage:pane'
} as const;

let controlsIds = 0;

export function createStageChrome(options: StageChromeOptions): StageChrome {
  const owners = new Map<string, StageOwner & { dispose(): void }>();
  let shown: string | null = null;

  const make = (id: string) => {
    /** What the reader chose, kept across a restart and cleared by a fresh start. */
    const choices = new Map<string, unknown>();
    let caption = '';
    let faulted = false;
    let pinned: string | null = null;
    const writeCaption = () => options.setCaption(faulted ? caption : pinned ?? caption, faulted);
    let restartRun: (() => void) | null = null;
    let pauseRun: ((paused: boolean) => void) | null = null;
    /** The button's own toggle state: presentation only, the runtime is told on every flip. */
    let paused = false;

    // Each corner's contents live in a wrapper that takes no box of its own, so the
    // cards lay out exactly as if they were the corner's direct children.
    const trayItems = document.createElement('div');
    trayItems.style.display = 'contents';
    const readingItems = document.createElement('div');
    readingItems.style.display = 'contents';

    let card: HTMLElement | null = null;
    let head: HTMLElement | null = null;
    let restartButton: HTMLButtonElement | null = null;
    let pauseButton: HTMLButtonElement | null = null;
    let stepButton: HTMLButtonElement | null = null;
    let stepRun: (() => void) | null = null;
    let pane: Pane | null = null;
    let readingsCard: ReadingsCard | null = null;

    const ensureCard = () => {
      if (card && head) return { card, head };
      card = document.createElement('div');
      card.className = 'lerpette-stage__card';
      head = document.createElement('div');
      head.className = 'lerpette-stage__card-head';
      card.append(head);
      trayItems.append(card);
      return { card, head };
    };

    /** The card goes once nothing is left in it. */
    const dropEmptyCard = () => {
      if (card && !pane && !pauseButton && !stepButton && !restartButton) {
        card.remove();
        card = null;
        head = null;
      }
    };

    const syncRestart = () => {
      if (!restartRun) {
        restartButton?.remove();
        restartButton = null;
        dropEmptyCard();
        return;
      }

      if (restartButton) return;
      const parts = ensureCard();
      restartButton = document.createElement('button');
      restartButton.type = 'button';
      restartButton.className = 'lerpette-stage__icon';
      restartButton.setAttribute('aria-label', 'Restart');
      restartButton.title = 'Restart';
      restartButton.innerHTML = RotateCcw;
      restartButton.querySelector('svg')?.setAttribute('aria-hidden', 'true');
      restartButton.addEventListener('click', () => restartRun?.());
      parts.head.append(restartButton);
    };

    // To restart's left: a toggle, so its own icon/aria-pressed are presentation state
    // kept here, the same way the controls title keeps its own fold state.
    const applyPauseState = () => {
      if (!pauseButton) return;
      pauseButton.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
      pauseButton.title = paused ? 'Resume' : 'Pause';
      pauseButton.setAttribute('aria-pressed', String(paused));
      pauseButton.innerHTML = paused ? Play : Pause;
      pauseButton.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    };

    const syncPause = () => {
      if (!pauseRun) {
        pauseButton?.remove();
        pauseButton = null;
        dropEmptyCard();
        return;
      }

      if (pauseButton) return;
      const parts = ensureCard();
      pauseButton = document.createElement('button');
      pauseButton.type = 'button';
      pauseButton.className = 'lerpette-stage__icon';
      pauseButton.addEventListener('click', () => {
        paused = !paused;
        applyPauseState();
        pauseRun?.(paused);
      });
      parts.head.append(pauseButton);
      applyPauseState();
    };

    // Between pause and restart. Stepping a running chapter pauses it first, so one
    // press is one step and the button beside it says so.
    const syncStep = () => {
      if (!stepRun) {
        stepButton?.remove();
        stepButton = null;
        dropEmptyCard();
        return;
      }

      if (stepButton) return;
      const parts = ensureCard();
      stepButton = document.createElement('button');
      stepButton.type = 'button';
      stepButton.className = 'lerpette-stage__icon';
      stepButton.setAttribute('aria-label', 'Step');
      stepButton.title = 'Step one frame';
      stepButton.innerHTML = StepForward;
      stepButton.querySelector('svg')?.setAttribute('aria-hidden', 'true');
      stepButton.addEventListener('click', () => {
        if (!paused && pauseRun) {
          paused = true;
          applyPauseState();
          pauseRun(true);
        }
        stepRun?.();
      });
      parts.head.append(stepButton);
    };

    const owner: StageOwner & { dispose(): void } = {
      controls(opts: ControlsOptions = {}) {
        if (pane) return pane;
        const parts = ensureCard();

        const container = document.createElement('div');
        container.className = 'lerpette-stage__card-body lerpette-stage__controls';
        container.id = `lerpette-controls-${++controlsIds}`;
        parts.card.append(container);

        const title = document.createElement('button');
        title.type = 'button';
        title.className = 'lerpette-stage__card-title';
        title.textContent = 'Controls';
        title.setAttribute('aria-controls', container.id);
        const setCollapsed = (collapsed: boolean) => {
          parts.card.classList.toggle('is-collapsed', collapsed);
          title.setAttribute('aria-expanded', String(!collapsed));
          title.title = collapsed ? 'Show controls' : 'Hide controls';
          choices.set(KEY.controlsCollapsed, collapsed);
        };
        title.addEventListener('click', () => setCollapsed(!parts.card.classList.contains('is-collapsed')));
        parts.head.prepend(title);
        const restored = choices.get(KEY.controlsCollapsed) as boolean | undefined;
        setCollapsed(restored ?? !opts.expanded);

        pane = new Pane({ container });
        return pane;
      },

      readings() {
        if (!readingsCard) {
          const restored = (choices.get(KEY.readings) as ReadingsView | undefined) ?? null;
          readingsCard = createReadingsCard(readingItems, restored, (view) => choices.set(KEY.readings, view));
        }
        return readingsCard.readings;
      },

      caption(value, fault = false) {
        caption = value;
        faulted = fault;
        if (shown === id) writeCaption();
      },

      pin(value) {
        pinned = value;
        if (shown === id) writeCaption();
      },

      restartable(run) {
        restartRun = run;
        syncRestart();
      },

      pausable(run, startPaused = false) {
        pauseRun = run;
        paused = startPaused;
        syncPause();
        applyPauseState();
      },

      steppable(run) {
        stepRun = run;
        syncStep();
      },

      settle() {
        readingsCard?.settle();
        // Slider values the reader set before a restart go back on the new pane, which
        // the chapter has rebuilt with its own defaults by now.
        const saved = choices.get(KEY.pane);
        if (saved && pane) {
          try {
            pane.importState(saved as never);
          } catch {
            // A chapter whose controls changed shape since: keep its own defaults.
          }
        }
        choices.delete(KEY.pane);
      },

      tick(now) {
        readingsCard?.tick(now);
      },

      show() {
        if (shown && shown !== id) owners.get(shown)?.hide();
        shown = id;
        options.tray.append(trayItems);
        options.readings.append(readingItems);
        writeCaption();
      },

      hide() {
        trayItems.remove();
        readingItems.remove();
        if (shown === id) shown = null;
      },

      reset(keepChoices) {
        if (keepChoices && pane) {
          choices.set(KEY.pane, pane.exportState());
        }
        if (!keepChoices) choices.clear();
        pane?.dispose();
        pane = null;
        readingsCard?.remove();
        readingsCard = null;
        card?.remove();
        card = null;
        head = null;
        restartButton = null;
        pauseButton = null;
        stepButton = null;
        paused = false;
        // A fresh run has not failed yet; its own caption, if it sets one, replaces the error.
        faulted = false;
        trayItems.replaceChildren();
        readingItems.replaceChildren();
        // Pause and restart are offered by the runtime, not by the cards, so they
        // survive them; pause always comes back unpaused, since a fresh run is running.
        syncPause();
        syncStep();
        syncRestart();
      },

      dispose() {
        owner.reset(false);
        restartRun = null;
        pauseRun = null;
        stepRun = null;
        caption = '';
        faulted = false;
        owner.hide();
      }
    };

    return owner;
  };

  return {
    owner(id) {
      let found = owners.get(id);
      if (!found) {
        found = make(id);
        owners.set(id, found);
      }
      return found;
    },
    drop(id) {
      owners.get(id)?.dispose();
      owners.delete(id);
    },
    dropAll() {
      owners.forEach((owner) => owner.dispose());
      owners.clear();
    }
  };
}
