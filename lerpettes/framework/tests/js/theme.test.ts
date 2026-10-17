import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CSS_TOKENS, hex, palette } from '../../theme';

/** The :root block of the site's stylesheet, token by token. */
function rootTokens(): Map<string, string> {
  const css = fs.readFileSync(path.resolve('website/src/styles/global.css'), 'utf8');
  const block = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
  const tokens = new Map<string, string>();
  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens.set(match[1], match[2].trim());
  return tokens;
}

function rgbOf(value: string): string {
  const hexMatch = value.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) return value.toLowerCase();
  const rgb = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!rgb) throw new Error(`not a colour: ${value}`);
  return `#${rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
}

describe('the palette', () => {
  it('matches the stylesheet, colour for colour', () => {
    const tokens = rootTokens();
    for (const [name, token] of Object.entries(CSS_TOKENS)) {
      const css = tokens.get(token);
      expect(css, `${token} is missing from :root`).toBeDefined();
      expect(rgbOf(css!), name).toBe(palette[name as keyof typeof palette]);
    }
  });

  it('has a number for three.js for every colour', () => {
    expect(hex.accentWarm).toBe(0xd17041);
    expect(Object.keys(hex)).toEqual(Object.keys(palette));
  });
});
