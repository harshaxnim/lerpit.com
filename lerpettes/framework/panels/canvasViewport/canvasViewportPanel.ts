import type { LerpettePanelKind, LerpettePanelSlot } from '../types';

/** What a runtime drawing into the canvas viewport is handed. */
export type CanvasViewportSurface = {
  canvas: HTMLCanvasElement;
  /**
   * Top-right corner of the viewport, for chrome a runtime owns rather than the panel:
   * create3DRuntime puts its controls card here, restart button included. Handing it
   * over replaces the old arrangement where the runtime reached out of its host and
   * queried the player's markup.
   */
  tray: HTMLElement;
  /** Top-left corner: what the step reports rather than what the reader sets, such as
   *  graphs, counters and frame rate. */
  monitors: HTMLElement;
};

export const canvasViewportPanel: LerpettePanelKind<CanvasViewportSurface> = {
  label: 'Viewport',
  hostClass: 'lerpette-panel--canvas',

  create(slot: LerpettePanelSlot): CanvasViewportSurface {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', `Live render for ${slot.lessonTitle}`);

    const tray = document.createElement('div');
    tray.className = 'lerpette-panel__tray';

    const monitors = document.createElement('div');
    monitors.className = 'lerpette-panel__monitors';

    slot.host.append(canvas, monitors, tray);
    return { canvas, tray, monitors };
  },

  destroy(surface: CanvasViewportSurface) {
    // Drop the backing store now rather than waiting for the node to be collected.
    surface.canvas.width = 0;
    surface.canvas.height = 0;
  }
};
