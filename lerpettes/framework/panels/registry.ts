import type { LerpettePanel } from './panel';

/**
 * The panels a document may name.
 *
 * Every entry is a dynamic import rather than a static one, which is the only reason a
 * lesson that draws a 2D sketch does not also ship three.js's orbit controls and the
 * table panel. The bundler splits on these, so a page carries exactly the panels its
 * chapters asked for.
 *
 * Adding a panel is one line here and one folder beside it. Nothing else in the site
 * knows any panel's name: content.ts checks a heading's names against PANEL_NAMES and
 * reports an unknown one as an authoring problem, and the player asks this registry.
 */
const LOADERS: Record<string, () => Promise<LerpettePanel<never>>> = {
  canvas: () => import('./canvas/canvasPanel').then((m) => m.canvasPanel as LerpettePanel<never>),
  viewport2d: () => import('./viewport2d/viewport2dPanel').then((m) => m.viewport2dPanel as LerpettePanel<never>),
  viewport3d: () => import('./viewport3d/viewport3dPanel').then((m) => m.viewport3dPanel as LerpettePanel<never>),
  table: () => import('./table/tablePanel').then((m) => m.tablePanel as LerpettePanel<never>),
  readout: () => import('./readout/readoutPanel').then((m) => m.readoutPanel as LerpettePanel<never>)
};

/**
 * What each panel calls itself, without loading it.
 *
 * The tab strip is written before the first frame, which is before any dynamic import
 * has resolved, so the label cannot live only inside the module. It is duplicated
 * rather than derived, and a test (panelRegistry.test.ts) keeps the two equal.
 */
export const PANEL_LABELS: Record<string, string> = {
  canvas: 'Viewport',
  viewport2d: 'Viewport',
  viewport3d: 'Viewport 3D',
  table: 'Table',
  readout: 'Readout'
};

/** The panel a chapter gets when neither its heading nor its code names one. */
export const DEFAULT_PANEL = 'canvas';

/** Every name a heading may use, for error messages that can list the alternatives. */
export const PANEL_NAMES: readonly string[] = Object.keys(LOADERS);

export function isPanelName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(LOADERS, name);
}

/** Load one panel, or null when the document named something that does not exist. */
export async function loadPanel(name: string): Promise<LerpettePanel<never> | null> {
  const loader = LOADERS[name];
  return loader ? loader() : null;
}
