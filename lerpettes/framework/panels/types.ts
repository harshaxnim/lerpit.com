/**
 * A panel is whatever fills the player's right-hand column. The player owns the slot
 * — its box, its sticky geometry, the mobile drawer — and a panel kind owns everything
 * inside it. Adding a kind means adding a module here; the player never learns its name.
 */

/** What the player lends a panel. The player owns all of it. */
export type LerpettePanelSlot = {
  /** The box the panel fills. The player empties it again after destroy(). */
  host: HTMLElement;
  /**
   * The strip across the top of the column. Slot chrome, like the caption: the player
   * owns the element and whoever is driving writes the tabs into it, so one panel and
   * several panels produce the same shape and the same height.
   */
  tabs: HTMLElement;
  /** The caption band under the panel's label. Slot chrome: panels and runtimes both write it. */
  setCaption: (value: string) => void;
  /** Scratch space shared by every runtime bound to this panel instance. */
  shared: Map<string, unknown>;
  /** The lesson's title, for accessible names on whatever the panel builds. */
  lessonTitle: string;
};

/**
 * One kind of right panel.
 *
 * Every member is written as a method, not an arrow property. Under strictFunctionTypes
 * that makes the parameters bivariant, which is what lets the player hold a
 * LerpettePanelKind<unknown> while a lesson hands it a LerpettePanelKind<CanvasViewportSurface>.
 */
export type LerpettePanelKind<Surface> = {
  /** What the panel is called. The corner label and the drawer toggle both read this. */
  label: string;
  /** Modifier class the player puts on the host for this panel's lifetime. */
  hostClass: string;
  /** Build the panel's DOM inside slot.host and return what runtimes talk to. */
  create(slot: LerpettePanelSlot): Surface | Promise<Surface>;
  /** The slot box changed size. Runs before the active runtime's own resize. */
  resize?(surface: Surface, slot: LerpettePanelSlot): void;
  /** Release what removing the DOM will not: GL contexts, observers, timers. */
  destroy?(surface: Surface, slot: LerpettePanelSlot): void;
};
