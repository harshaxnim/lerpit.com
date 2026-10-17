import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Stylesheets are spread across the site and the modules that own their markup now, so
 * the rules that used to hold by living in one file are checked here instead.
 */

const SHEETS = [
  'website/src/styles/global.css',
  'lerpettes/libs/live-code/js/liveCode.css',
  'lerpettes/framework/stage/chrome.css',
  'lerpettes/framework/panels/textPanels.css',
  'lerpettes/framework/panels/panelStack.css'
];
const BREAKPOINTS = new Set(['1180px', '1181px', '900px', '640px', '600px']);

const read = (file: string) => fs.readFileSync(path.resolve(file), 'utf8');

describe('stylesheets', () => {
  it('use only the breakpoints listed in :root', () => {
    for (const file of [...SHEETS, 'scripts/dev-view-toggle.mjs']) {
      for (const match of read(file).matchAll(/@media[^{]*?\((?:max|min)-width:\s*([\d.]+px)\)/g)) {
        expect(BREAKPOINTS.has(match[1]), `${file}: ${match[0]}`).toBe(true);
      }
    }
  });

  it('every module sheet is imported by its module', () => {
    const imports: Record<string, string[]> = {
      'lerpettes/libs/live-code/js/liveCode.css': ['lerpettes/libs/live-code/js/fileEditor.ts'],
      'lerpettes/framework/stage/chrome.css': ['lerpettes/framework/stage/chrome.ts'],
      'lerpettes/framework/panels/textPanels.css': ['lerpettes/framework/panels/table/tablePanel.ts', 'lerpettes/framework/panels/readout/readoutPanel.ts'],
      'lerpettes/framework/panels/panelStack.css': ['lerpettes/framework/panels/panelStack.ts']
    };
    for (const [sheet, owners] of Object.entries(imports)) {
      for (const owner of owners) expect(read(owner), owner).toContain(`/${path.basename(sheet)}'`);
    }
  });

  it('leaves no module styles behind in global.css', () => {
    const global = read('website/src/styles/global.css').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const prefix of ['.live-code', '.lerpette-reading', '.lerpette-stage__card', '.lerpette-table', '.lerpette-readout', '.lerpette-panel__box']) {
      expect(global.includes(`${prefix}`), prefix).toBe(false);
    }
  });

  it('writes status colours as tokens, not hex', () => {
    for (const file of SHEETS.slice(1)) expect(read(file), file).not.toMatch(/#2f6b46/i);
  });
});
