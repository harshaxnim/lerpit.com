import { describe, expect, it } from 'vitest';
import { GROUNDS, toRgb } from '../cardArt/palette';
import { STYLE_IDS, assignStyles, cardArt } from '../cardArt';

/**
 * The card generator is pure and runs at build time, so everything worth
 * asserting can be asserted without a browser. What is being tested is the set
 * of properties the design actually rests on: that a document always gets the
 * same card, that a collection reads as one series, that no input takes the
 * build down, and that no ramp anywhere has stock showing through it.
 */

const doc = (over: Partial<Parameters<typeof cardArt>[0]> = {}) => ({
  title: 'Simple body dynamics',
  collection: 'Physics engine',
  summary: 'Integrators, forces and the order you apply them in.',
  date: '2026-03-25',
  chapters: 4,
  ...over
});

/** Every fill, stroke and stop colour the card emits. */
const colours = (svg: string): string[] =>
  [...svg.matchAll(/(?:fill|stroke|stop-color)="([^"]+)"/g)]
    .map((m) => m[1]!)
    // a url(#id) is a reference to a def, not a colour, and its id is unique
    // per card by design
    .filter((c) => c !== 'none' && !c.startsWith('url('));

describe('cardArt', () => {
  it('gives the same document the same card every time', () => {
    const a = cardArt(doc());
    const b = cardArt(doc());
    expect(a.body).toBe(b.body);
    expect(a.style).toBe(b.style);
    expect(a.ground.id).toBe(b.ground.id);
  });

  it('renders every style without a broken number in it', () => {
    for (const style of STYLE_IDS) {
      const art = cardArt(doc(), { style });
      expect(art.style, style).toBe(style);
      expect(art.body, style).not.toMatch(/NaN|undefined|Infinity/);
      expect(art.body.length, style).toBeGreaterThan(200);
    }
  });

  it('puts real colour on every style, not just the stock', () => {
    for (const style of STYLE_IDS) {
      const art = cardArt(doc(), { style });
      const inked = colours(art.body).filter((c) => c.startsWith('hsl'));
      // the sheet's panels carry four to eight distinct hues; three is the floor
      expect(new Set(inked).size, style).toBeGreaterThanOrEqual(3);
    }
  });

  it('reads a collection as one series and a document as one issue', () => {
    const one = cardArt(doc({ title: 'Why LerpIt?', summary: 'a', chapters: 5 }));
    const two = cardArt(doc({ title: 'How LerpIt?', summary: 'bb', chapters: 6 }));
    // same collection: same style, stock and voice
    expect(two.style).toBe(one.style);
    expect(two.ground.id).toBe(one.ground.id);
    expect(two.face.id).toBe(one.face.id);
    expect(two.palette).toBe(one.palette);
    // different document: different card
    expect(two.body).not.toBe(one.body);
  });

  it('spreads styles across collections rather than piling onto a few', () => {
    const names = [
      'Physics engine', 'Meta', 'Rendering', 'Shaders', 'Optimisation', 'Audio',
      'Networking', 'Geometry', 'Lighting', 'Animation', 'Input handling',
      'Collision', 'Particles', 'Terrain', 'Interface', 'Fluids', 'Cloth',
      'Pathfinding', 'Compute', 'Editor'
    ];
    const styles = new Set(names.map((collection) => cardArt(doc({ collection })).style));
    // twenty draws from twenty styles collide by the birthday problem; the
    // expected distinct count is near thirteen, so ten is a real floor
    expect(styles.size).toBeGreaterThanOrEqual(10);
  });

  it('leaves no gap in a ramp: every gradient covers its whole run', () => {
    for (const style of STYLE_IDS) {
      const art = cardArt(doc(), { style });
      for (const grad of art.body.matchAll(/<linearGradient[^>]*>(.*?)<\/linearGradient>/g)) {
        const offsets = [...grad[1]!.matchAll(/offset="([\d.]+)%"/g)].map((m) => Number(m[1]));
        expect(offsets.length, style).toBeGreaterThan(1);
        expect(offsets[0], style).toBeCloseTo(0, 5);
        expect(offsets.at(-1), style).toBeCloseTo(100, 5);
        // a stop never starts after the previous one ended
        for (let i = 1; i < offsets.length; i++) {
          expect(offsets[i]!, `${style} stop ${i}`).toBeGreaterThanOrEqual(offsets[i - 1]! - 1e-6);
        }
      }
    }
  });

  it('no longer offers the three styles that were cut', () => {
    for (const gone of ['drip', 'overlap', 'bend', 'shadow', 'echo']) {
      expect(STYLE_IDS).not.toContain(gone);
    }
    expect(STYLE_IDS).toHaveLength(15);
  });

  it('steps the repeated glyph far enough under its own stroke to leave no gap', () => {
    // This is the invariant the whole family rests on. A copy has to overlap the
    // one before it, and the thinnest part of a letter is a horizontal bar around
    // a ninth of its cap height. Deriving the copy count from the band count
    // instead is what used to put stock between the colours.
    const fontSize = (svg: string) => Number(svg.match(/font-size="([\d.]+)"/)![1]);
    const baseline = (svg: string) => Number(svg.match(/<text x="[\d.-]+" y="([\d.-]+)"/)![1]);

    const gaps = (positions: number[]) =>
      positions
        .slice(1)
        .map((p, i) => Math.abs(p - positions[i]!))
        .reduce((a, b) => Math.max(a, b), 0);

    const spill = cardArt(doc(), { style: 'spill' });
    const drops = [...spill.body.matchAll(/translate\(0 ([\d.-]+)\)/g)].map((m) => Number(m[1]));
    expect(drops.length).toBeGreaterThan(8);
    expect(gaps(drops)).toBeLessThanOrEqual(fontSize(spill.body) * 0.12);

  });

  it('keeps every caption legible on its own stock', () => {
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (hex: string) => {
      const [r, g, b] = toRgb(hex);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    for (const ground of GROUNDS) {
      const a = luminance(ground.bg);
      const b = luminance(ground.ink);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      expect(ratio, ground.id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('survives every shape of broken document', () => {
    const cases: Parameters<typeof cardArt>[0][] = [
      { title: '' },
      { title: 'x' },
      { title: '   ', collection: '   ', date: 'nonsense', chapters: -3 },
      { title: '&<>"— ünïcode', collection: 'A & B', chapters: 0 },
      { title: 'a '.repeat(120), summary: 'z'.repeat(5000), chapters: 999 },
      { title: '4', collection: '4', date: '2026-13-45', chapters: 1 }
    ];
    for (const input of cases) {
      for (const style of STYLE_IDS) {
        const art = cardArt(input, { style });
        expect(art.body, `${style} / ${input.title}`).not.toMatch(/NaN|undefined|Infinity/);
        // an unescaped bracket or ampersand from the document breaks the SVG open
        for (const node of art.body.matchAll(/<text[^>]*>([^<]*)<\/text>/g)) {
          expect(node[1], `${style} / ${input.title}`).not.toMatch(/[<>]/);
          expect(node[1], `${style} / ${input.title}`).not.toMatch(/&(?!(amp|lt|gt|quot|#\d+);)/);
        }
      }
    }
  });

  it('hands back the same caption data whatever was drawn above it', () => {
    // the information block is identical on every card; nothing about it varies
    // with the style, and no style writes any of it into its own plate
    for (const style of STYLE_IDS) {
      const art = cardArt(doc(), { style });
      expect(art.titleLines.join(' '), style).toBe('SIMPLE BODY DYNAMICS');
      expect(art.titleSize, style).toBeGreaterThan(8);
      expect(art.viewBox, style).toBe('0 0 300 292');
      // the plate never sets the document's own words
      expect(art.body, style).not.toContain('SIMPLE BODY');
      expect(art.body, style).not.toContain('Physics engine');
      expect(art.body, style).not.toContain('2026.03.25');
    }
  });

  it('lets variation be switched off so the whole set obeys the options', () => {
    const a = cardArt(doc({ title: 'One' }), { style: 'angle', variation: 0, palette: 'Tape label 1981' });
    const b = cardArt(doc({ title: 'Two' }), { style: 'angle', variation: 0, palette: 'Tape label 1981' });
    expect(colours(a.body).sort()).toEqual(colours(b.body).sort());
  });
});

describe('cardArt def ids', () => {
  it('gives every card its own, because they share a page', () => {
    // SVG resolves a duplicate id to the first in the document, so two cards
    // from one collection with one style would clip each other's artwork.
    const ids = (svg: string) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]!);
    const a = cardArt(doc({ title: 'Why LerpIt?' }), { style: 'orb' });
    const b = cardArt(doc({ title: 'How LerpIt?' }), { style: 'orb' });
    const overlap = ids(a.body).filter((id) => ids(b.body).includes(id));
    expect(overlap).toEqual([]);
  });
});

describe('assignStyles', () => {
  const NAMES = ['Physics engine', 'Meta', 'Rendering', 'Shaders', 'Optimisation',
    'Audio', 'Networking', 'Geometry', 'Lighting', 'Animation', 'Collision', 'Particles'];

  it('gives every collection a style nobody else has', () => {
    const map = assignStyles(NAMES);
    expect(map.size).toBe(NAMES.length);
    expect(new Set(map.values()).size).toBe(NAMES.length);
  });

  it('is the same map every time', () => {
    expect([...assignStyles(NAMES)]).toEqual([...assignStyles(NAMES)]);
    // and does not depend on the order it was handed the names
    expect([...assignStyles([...NAMES].reverse())].sort()).toEqual([...assignStyles(NAMES)].sort());
  });

  it('keeps going past the number of styles instead of running out', () => {
    const many = Array.from({ length: 47 }, (_, i) => `Collection ${i}`);
    const map = assignStyles(many);
    expect(map.size).toBe(47);
    for (const style of map.values()) expect(STYLE_IDS).toContain(style);
    // The claim list resets each time it empties, so the most any one style can
    // be used is the number of resets. Derived from the style count rather than
    // written in, or it goes stale the next time a style is added or cut.
    const counts = new Map<string, number>();
    for (const s of map.values()) counts.set(s, (counts.get(s) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(Math.ceil(47 / STYLE_IDS.length));
  });

  it('survives duplicates and empty names', () => {
    const map = assignStyles(['Meta', 'Meta', '', '   ', 'Meta']);
    expect(map.size).toBe(2);
    expect(map.get('Meta')).toBeTruthy();
  });

  it('agrees with the standalone draw for a collection that gets its first choice', () => {
    // one name cannot collide with anything, so the assignment must match what
    // cardArt picks on its own
    const solo = assignStyles(['Rendering']).get('Rendering');
    expect(cardArt({ title: 'T', collection: 'Rendering' }).style).toBe(solo);
  });
});
