import type { LerpettePanel } from '../panel';
import type { LerpettePanelSlot } from '../types';

/**
 * Lines of monospace text. The simplest thing a panel can be, and the one to reach for
 * when the answer is a number rather than a shape.
 *
 * It exists as its own panel rather than as a table with one column because the two
 * read completely differently: a table is a grid you scan down, a readout is a few
 * labelled values you glance at while something else moves.
 */

export type ReadoutTarget = {
  /** One line. Called in order; the panel keeps them in that order. */
  line(value: string): void;
};

const bundles = new WeakMap<ReadoutTarget, { host: HTMLElement; lines: string[] }>();

export const readoutPanel: LerpettePanel<ReadoutTarget> = {
  name: 'readout',
  label: 'Readout',
  hostClass: 'lerpette-panel--readout',
  cadence: 'change',
  members: { required: ['draw'], optional: [] },

  create(slot: LerpettePanelSlot): ReadoutTarget {
    const pre = document.createElement('pre');
    pre.className = 'lerpette-readout';
    pre.setAttribute('aria-label', `Readout for ${slot.lessonTitle}`);
    slot.host.append(pre);

    const target: ReadoutTarget = {
      line(value) {
        bundles.get(target)?.lines.push(value);
      }
    };

    bundles.set(target, { host: pre, lines: [] });
    return target;
  },

  begin(target) {
    const bundle = bundles.get(target);
    if (bundle) {
      bundle.lines = [];
    }
  },

  end(target) {
    const bundle = bundles.get(target);
    if (!bundle) {
      return;
    }

    // One write rather than a node per line: this runs on every state change, and
    // replaceChildren on a growing list is what makes a readout flicker.
    bundle.host.textContent = bundle.lines.join('\n');
  },

  destroy(target) {
    bundles.delete(target);
  }
};
