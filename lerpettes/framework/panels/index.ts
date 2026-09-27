import { canvasViewportPanel } from './canvasViewport/canvasViewportPanel';
import type { LerpettePanelKind } from './types';

export type { LerpettePanelKind, LerpettePanelSlot } from './types';
export { canvasViewportPanel } from './canvasViewport/canvasViewportPanel';
export type { CanvasViewportSurface } from './canvasViewport/canvasViewportPanel';

/**
 * A step that names no panel gets the canvas viewport, which is what every lesson
 * written before panels existed expects. This line is the only place that default
 * lives; moving lessons onto a different fallback is a one-line change here.
 *
 * The parameter is structural rather than LerpetteStepRuntime so that panels/ stays
 * importable from framework/types.ts without the two importing each other. `any` is
 * confined to this signature: it is the one point where the player, which cannot know
 * any panel's surface type, meets modules that do.
 */
export function resolveStepPanel(runtime: {
  panel?: LerpettePanelKind<any>;
}): LerpettePanelKind<any> {
  return runtime.panel ?? canvasViewportPanel;
}
