import { describe, expect, it } from 'vitest';
import { DEFAULT_PANEL, isPanelName, loadPanel, PANEL_LABELS, PANEL_NAMES } from '../../panels/registry';

describe('the panel registry', () => {
  it('knows the canvas beside the named panels', () => {
    expect(PANEL_NAMES).toEqual(['canvas', 'viewport2d', 'viewport3d', 'table', 'readout']);
    expect(isPanelName(DEFAULT_PANEL)).toBe(true);
  });

  it('rejects names it does not have, including inherited object keys', () => {
    expect(isPanelName('viewpoint2d')).toBe(false);
    expect(isPanelName('toString')).toBe(false);
    expect(isPanelName('none')).toBe(false);
  });

  it('labels every panel without loading it, and the label agrees with the module', async () => {
    for (const name of PANEL_NAMES) {
      const panel = await loadPanel(name);
      expect(panel?.name).toBe(name);
      expect(PANEL_LABELS[name]).toBe(panel?.label);
      expect(panel?.members.required).toContain('draw');
    }
  });

  it('gives a scene panel a scope and leaves repainting panels without one', async () => {
    for (const name of ['viewport2d', 'viewport3d']) {
      expect(typeof (await loadPanel(name))?.scope).toBe('function');
    }
    for (const name of ['canvas', 'table', 'readout']) {
      expect((await loadPanel(name))?.scope).toBeUndefined();
    }
  });

  it('loads nothing for an unknown name', async () => {
    expect(await loadPanel('nope')).toBeNull();
  });
});
