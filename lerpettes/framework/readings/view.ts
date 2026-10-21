/*
 * How the readings card is showing: all of it, or shrunk to one reading. Kept apart from the DOM so the rules for which one a step starts in can be
 * tested without one.
 */

export type ReadingsMode = 'expanded' | 'mini';

export type ReadingsView = {
  mode: ReadingsMode;
  /** The reading a mini card shows, by label. null means the first. */
  mini: string | null;
};

/** What a step gets when its code says nothing: the first reading, alone. */
export const DEFAULT_VIEW: ReadingsView = { mode: 'mini', mini: null };

/**
 * The view a card starts in.
 *
 * What the reader left it as wins, but only on a restart of the same step, which is
 * the only time the runtime passes it in; a new chapter starts from what its own code
 * asked for (expand(), mini()), and failing that from the default. A mini
 * view always resolves to a reading the step has: a label it never added falls back
 * to the first.
 */
export function resolveReadingsView(
  restored: ReadingsView | null,
  authored: ReadingsView | null,
  labels: readonly string[]
): ReadingsView {
  const view = restored ?? authored ?? DEFAULT_VIEW;
  // Two modes only. Anything else (a 'collapsed' left by an older build) reads as mini,
  // the smaller of the two.
  if (view.mode === 'expanded') {
    return { mode: 'expanded', mini: null };
  }

  const mini = view.mini != null && labels.includes(view.mini) ? view.mini : (labels[0] ?? null);
  return { mode: 'mini', mini };
}
