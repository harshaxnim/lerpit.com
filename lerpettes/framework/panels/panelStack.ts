import type { LerpettePanel } from './panel';
import type { ViewSize } from './contract';
import type { LerpettePanelSlot } from './types';
import { loadPanel, PANEL_LABELS, PANEL_NAMES } from './registry';

/**
 * Several panels in one column.
 *
 * The player owns the slot: its box, its sticky geometry, the mobile drawer. This owns
 * what goes inside when a chapter names more than one panel, which is a strip of tabs
 * and one box per panel with only the chosen one on screen.
 *
 * Tabs rather than a split or a tiling layout, for now. The column is already a drawer
 * below 1180px, where a split has nowhere to go, and a tab strip is a pattern the
 * editor in the prose already uses, so a reader meets it twice rather than learning two
 * things. Which panel the reader chose is remembered by name, so scrolling into the
 * next chapter that also has a table keeps showing the table.
 */

export type MountedPanel<Target = unknown> = {
  panel: LerpettePanel<Target>;
  target: Target;
  /** The box this panel draws into, which is what its size is measured from. */
  box: HTMLElement;
};

export type PanelStack = {
  panels: MountedPanel[];
  /** The panel on screen, or null when the chapter declared none. */
  active(): MountedPanel | null;
  show(name: string): void;
  sizeOf(mounted: MountedPanel): ViewSize;
  destroy(): void;
  /** Names the document asked for that no panel answers to. */
  unknown: string[];
};

const MAX_PIXEL_RATIO = 2;

function measure(box: HTMLElement): ViewSize {
  return {
    width: Math.max(0, box.clientWidth),
    height: Math.max(0, box.clientHeight),
    dpr: Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_PIXEL_RATIO)
  };
}

export async function createPanelStack(
  slot: LerpettePanelSlot,
  names: readonly string[],
  onShow: (mounted: MountedPanel) => void
): Promise<PanelStack> {
  const mounted: MountedPanel[] = [];
  const unknown: string[] = [];

  // The strip is the player's, not ours: one element across the top of the column for
  // every chapter, so switching between a one-panel chapter and a three-panel one does
  // not move the panel underneath.
  const strip = slot.tabs;

  /**
   * The tabs go up before anything is loaded.
   *
   * Which panels a chapter has is written in its heading, so it is known synchronously;
   * only the code behind them has to be fetched. Emptying the strip first and filling it
   * after the imports resolved left it blank for as long as the network took, which read
   * as a flicker on every chapter change. Building the whole strip and swapping it in one
   * operation means it goes from the previous chapter's tabs straight to this one's, with
   * nothing in between.
   *
   * A tab is inert until its panel has loaded. Pressing one before then would ask to show
   * a panel that does not exist yet, and doing nothing is better than an error.
   */
  const buttons = new Map<string, HTMLButtonElement>();
  for (const name of names) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lerpette-stage__tab';
    button.dataset.panel = name;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(name === names[0]));
    button.textContent = PANEL_LABELS[name] ?? name;
    button.disabled = true;
    buttons.set(name, button);
  }

  strip.replaceChildren(...buttons.values());

  const stage = document.createElement('div');
  stage.className = 'lerpette-panel__stage';

  for (const name of names) {
    const panel = await loadPanel(name);
    if (!panel) {
      unknown.push(name);
      buttons.get(name)?.remove();
      buttons.delete(name);
      continue;
    }

    const box = document.createElement('div');
    box.className = `lerpette-panel__box ${panel.hostClass}`;
    box.dataset.panel = panel.name;
    stage.append(box);

    // The panel is handed its own box as the host, so a panel never has to know it is
    // one of several and never reaches outside what it was given.
    const target = await panel.create({ ...slot, host: box }, measure(box));
    mounted.push({ panel, target, box } as MountedPanel);
  }

  // The strip shows even for a single panel. It is what names the column now that the
  // slot's corner label has stood down, and a chapter that gains a second panel then
  // changes nothing about where the reader looks.
  // The strip is the player's and already sits above the host; only the stage is ours.
  slot.host.append(stage);

  let activeName = mounted[0]?.panel.name ?? '';

  const paint = () => {
    for (const entry of mounted) {
      // hidden rather than display:none so a panel's box still measures when it is the
      // one about to be shown; the stage gives every box the same grid cell.
      entry.box.classList.toggle('is-active', entry.panel.name === activeName);
    }

    strip.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      const on = button.dataset.panel === activeName;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
    });
  };

  const show = (name: string) => {
    const found = mounted.find((entry) => entry.panel.name === name);
    if (!found || activeName === name) {
      return;
    }

    activeName = name;
    paint();
    onShow(found);
  };

  for (const entry of mounted) {
    const button = buttons.get(entry.panel.name);
    if (!button) {
      continue;
    }

    // The label the registry knew is replaced by the panel's own, which is the one that
    // counts; they agree today and this is what keeps them agreeing if one changes.
    button.textContent = entry.panel.label;
    // A lone tab names the column rather than offering a choice.
    button.disabled = mounted.length === 1;
    button.addEventListener('click', () => show(entry.panel.name));
  }

  paint();

  return {
    panels: mounted,
    unknown,
    active: () => mounted.find((entry) => entry.panel.name === activeName) ?? null,
    show,
    sizeOf: (entry) => measure(entry.box),
    destroy() {
      for (const entry of mounted) {
        entry.panel.destroy?.(entry.target as never, { ...slot, host: entry.box });
      }
      mounted.length = 0;
      // The strip is lent and deliberately left as it is. Tearing down happens before
      // the next chapter has loaded, so emptying here would blank the strip for the
      // whole of that load. Whoever comes next replaces its contents in one operation,
      // which is the only way the reader never sees it empty.
      stage.remove();
    }
  };
}

/** For an authoring message that can say what the alternatives were. */
export const KNOWN_PANELS = PANEL_NAMES;
