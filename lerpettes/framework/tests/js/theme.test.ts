import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { colorFamilies, colors, CSS_TOKENS, hex, palette, randomColor, setCollectionColors, type ColorName } from '../../theme';

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

describe('colors', () => {
  it('names the site’s accents and tokens as themselves', () => {
    expect(colors.orange).toBe(palette.accentWarm);
    expect(colors.blue).toBe(palette.accent);
    expect(colors.ink).toBe(palette.ink);
  });

  it('gives every colour a light and a dark version, lighter and darker than it', () => {
    const lightness = (value: string) => {
      const n = parseInt(value.slice(1), 16);
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    for (const name of Object.keys(colors).filter((key) => key !== 'light' && key !== 'dark') as ColorName[]) {
      expect(colors[name], name).toMatch(/^#[0-9a-f]{6}$/);
      expect(colors.light[name], name).toMatch(/^#[0-9a-f]{6}$/);
      expect(lightness(colors.dark[name]), name).toBeLessThanOrEqual(lightness(colors[name]));
      if (lightness(colors[name]) < 200) expect(lightness(colors.light[name]), name).toBeGreaterThan(lightness(colors[name]));
    }
  });

  it('only ever names colours that exist', () => {
    for (const names of Object.values(colorFamilies)) for (const name of names) expect(colors[name], name).toBeDefined();
  });
});

describe('randomColor', () => {
  it('gives the same number the same colour, every time', () => {
    expect(randomColor(3)).toBe(randomColor(3));
    expect(randomColor(3, { from: 'warm' })).toBe(randomColor(3, { from: 'warm' }));
  });

  it('gives the first numbers all different colours before any repeats', () => {
    const n = colorFamilies.all.length;
    const first = Array.from({ length: n }, (_, i) => randomColor(i));
    expect(new Set(first).size).toBe(n);
    expect(randomColor(n)).toBe(randomColor(0));
  });

  it('picks only from the family or names it is given, in the tone asked for', () => {
    const warm = new Set(colorFamilies.warm.map((name) => colors[name]));
    for (let i = 0; i < 40; i += 1) expect(warm.has(randomColor(i, { from: 'warm' }))).toBe(true);
    for (let i = 0; i < 10; i += 1) expect([colors.light.orange, colors.light.blue]).toContain(randomColor(i, { from: ['orange', 'blue'], tone: 'light' }));
    expect(Object.values(colors).includes(randomColor() as never)).toBe(true);
  });

  it('draws from the collection’s palette for the collection family, and from all without one', () => {
    setCollectionColors([]);
    expect(randomColor(1, { from: 'collection' })).toBe(randomColor(1));

    const collection = ['#e7752c', '#a51e4d', '#63164d'];
    setCollectionColors(collection);
    expect(Array.from({ length: 6 }, (_, i) => randomColor(i, { from: 'collection' }))).toEqual([...collection, ...collection]);
    const light = randomColor(0, { from: 'collection', tone: 'light' });
    expect(light).not.toBe(collection[0]);
    expect(colors.light.collection[0]).toBe(light);
    expect(light).toMatch(/^#[0-9a-f]{6}$/);
    setCollectionColors([]);
  });

  it('lists the collection’s colours on colors, read when asked for, in every tone', () => {
    setCollectionColors([]);
    expect(colors.collection).toEqual(colorFamilies.all.map((name) => colors[name]));

    setCollectionColors(['#E7752C', '#a51e4d']);
    expect(colors.collection).toEqual(['#e7752c', '#a51e4d']);
    expect(colors.light.collection).toHaveLength(2);
    expect(colors.dark.collection[1]).not.toBe('#a51e4d');
    // A list, not a name: it never shows up among the named colours.
    expect(Object.keys(colors)).not.toContain('collection');
    expect(() => (colors.collection as string[]).push('#000000')).toThrow();
    setCollectionColors([]);
  });

  it('copes with negative and fractional numbers', () => {
    expect(colorFamilies.all.map((name) => colors[name])).toContain(randomColor(-1));
    expect(randomColor(2.7)).toBe(randomColor(2));
  });
});
