/**
 * What the player lends the panels in its column. The player owns the slot — its box,
 * its sticky geometry, the mobile drawer, the tab strip and the stage chrome — and a
 * panel owns everything inside the box it is given.
 */
export type LerpettePanelSlot = {
  /** The box the panel fills. */
  host: HTMLElement;
  /**
   * The strip across the top of the column. The player owns the element and the panel
   * stack writes the tabs into it, so one panel and several produce the same shape.
   */
  tabs: HTMLElement;
  /** The caption band at the foot of the stage. */
  setCaption: (value: string) => void;
  /** Scratch space shared by every runtime on this stack, for as long as it stands. */
  shared: Map<string, unknown>;
  /** The lesson's title, for accessible names on whatever the panel builds. */
  lessonTitle: string;
};
