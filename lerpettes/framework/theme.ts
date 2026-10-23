/*
 * The site's colours, for code that draws.
 *
 * CSS reads these as custom properties on :root in website/src/styles/global.css; a
 * canvas, a three.js material or a lesson's sketch reads them here. The two are the
 * same values written twice, because a stylesheet cannot import a module, and a test
 * (framework/tests/js/theme.test.ts) fails the moment they disagree. Lessons import
 * from here rather than copying a hex, so a palette change reaches every route.
 */

export const palette = {
  /** The sheet every page is printed on. */
  paper: '#fdfbf4',
  paperDeep: '#f7f3e7',
  /** Body text and the darkest marks. */
  ink: '#20313f',
  /** Secondary text, axes, quiet strokes. */
  muted: '#506270',
  /** The blue of links, the active tab and a primary line. */
  accent: '#2e6da4',
  /** The warm counterpoint: the moving thing, the highlighted thing. */
  accentWarm: '#d17041',
  /** Rules and grid lines, as a solid colour (the CSS token adds alpha). */
  line: '#5183ad',
  warn: '#8a5a00'
} as const;

export type PaletteName = keyof typeof palette;

/** The same colours as numbers, for three.js, which wants 0xRRGGBB. */
export const hex = Object.fromEntries(
  Object.entries(palette).map(([name, value]) => [name, parseInt(value.slice(1), 16)])
) as { readonly [K in PaletteName]: number };

/** Which CSS custom property each colour mirrors, for the test that keeps them equal. */
export const CSS_TOKENS: { readonly [K in PaletteName]: string } = {
  paper: '--paper',
  paperDeep: '--paper-deep',
  ink: '--ink',
  muted: '--muted',
  accent: '--accent',
  accentWarm: '--accent-warm',
  // --line is rgba(81, 131, 173, 0.42): this is its colour without the alpha.
  line: '--line',
  warn: '--warn'
};

/*
 * Colours to draw with, by name.
 *
 *   import { colors, randomColor } from '@lerpit/framework/theme';
 *
 *   sketch.circle(x, y, 12, { color: colors.orange });
 *   sketch.path(trail, { color: colors.light.orange });   // the same hue, toward the paper
 *   sketch.line(0, 0, vx, vy, { color: colors.dark.blue });
 *   sketch.circle(x, y, 12, { color: colors.collection[0] }); // the collection's palette, as a list
 *   ball.color = randomColor(i, { from: 'warm' });
 *
 * Every common colour name is here, but none of them is the CSS keyword: each is toned
 * to sit on the panel's paper beside the site's ink and accents, the way the header
 * stripe and the card palettes are. `orange` and `blue` are the site's two accents
 * exactly, and `ink`, `muted` and `line` are its tokens. Each is a '#rrggbb' string,
 * which a sketch, a three.js material and CSS all take.
 */
const base = {
  // The site's own.
  ink: palette.ink,
  muted: palette.muted,
  line: palette.line,
  paper: palette.paper,

  // Neutrals, darkest to lightest.
  black: '#1c2229',
  charcoal: '#36414b',
  slate: '#5d6b77',
  gray: '#808c96',
  grey: '#808c96',
  silver: '#adb6bd',
  cream: '#f1e7d0',
  white: '#fffdf8',

  // Reds and pinks.
  maroon: '#782e35',
  crimson: '#a8323d',
  red: '#c4473e',
  rose: '#c95670',
  pink: '#e08aa0',
  coral: '#df6f59',
  salmon: '#e58f78',
  peach: '#efb38e',

  // Oranges, yellows and browns.
  rust: '#a9502f',
  orange: palette.accentWarm,
  amber: '#e0912f',
  gold: '#d3a52b',
  mustard: '#c3962d',
  yellow: '#e6c445',
  khaki: '#b8aa72',
  beige: '#dccaa4',
  tan: '#c7a57a',
  sand: '#b8945d',
  brown: '#7d5537',
  chocolate: '#5c3c2a',

  // Greens.
  lime: '#9bb947',
  olive: '#7a7e39',
  green: '#4f8a4b',
  forest: '#2f5e3a',
  sage: '#8ea889',
  mint: '#8dcdb2',

  // Blue-greens and blues.
  teal: '#2f8c8a',
  turquoise: '#3aa5a0',
  cyan: '#4ea8c5',
  sky: '#6ba6d5',
  blue: palette.accent,
  navy: '#1f3a63',
  indigo: '#3f4f8f',

  // Purples.
  violet: '#7a60b0',
  purple: '#7a4f99',
  plum: '#6c477f',
  lavender: '#a99bc9',
  magenta: '#b1457e',
  berry: '#a8466e'
} as const;

export type ColorName = keyof typeof base;

/*
 * light and dark keep the hue and move the lightness, in OKLCH, which is what keeps a
 * light orange orange rather than the washed-out pink that mixing with white gives.
 */
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklch(value: string): [number, number, number] {
  const n = parseInt(value.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function fromOklch([L, C, H]: [number, number, number]): string {
  const A = C * Math.cos(H);
  const B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
  return `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** Most of the way to the paper, with half the colour: for trails, fills and halos. */
const lighten = (value: string) => {
  const [L, C, H] = toOklch(value);
  return fromOklch([L + (0.93 - L) * 0.55, C * 0.5, H]);
};

/** A fifth darker: for outlines, small marks, and a second series beside the first. */
const darken = (value: string) => {
  const [L, C, H] = toOklch(value);
  return fromOklch([L * 0.78, C * 0.95, H]);
};

const mapColors = (fn: (value: string) => string) =>
  Object.fromEntries(Object.entries(base).map(([name, value]) => [name, fn(value)])) as Record<ColorName, string>;

/** A colour per name, and the collection's palette as a list, in one tone. */
type ColorSet = Readonly<Record<ColorName, string>> & {
  /**
   * The colours of this lesson's collection, in the palette's order: what its
   * control.toml's `palette` names, or what its name draws. The 'all' family's colours
   * where there is no collection (a test, a page with no lesson).
   */
  readonly collection: readonly string[];
};

/** Named colours, plus the collection's, which are read when asked for, not at import. */
const colorSet = (named: Record<ColorName, string>, tone: Tone): ColorSet =>
  Object.defineProperty(named, 'collection', { get: () => collectionList(tone), enumerable: false }) as ColorSet;

export const colors: ColorSet & {
  readonly light: ColorSet;
  readonly dark: ColorSet;
} = Object.assign(colorSet({ ...base }, 'base'), {
  light: colorSet(mapColors(lighten), 'light'),
  dark: colorSet(mapColors(darken), 'dark')
});

/**
 * What randomColor picks from. `all` is the hues that stand out on the paper; the
 * neutrals and the near-whites are left out of every family, since a ball drawn in
 * cream is a ball nobody can see.
 */
export const colorFamilies = {
  all: ['red', 'coral', 'orange', 'amber', 'gold', 'lime', 'green', 'teal', 'turquoise', 'sky', 'blue', 'indigo', 'violet', 'purple', 'magenta', 'rose'],
  warm: ['red', 'crimson', 'rose', 'coral', 'salmon', 'orange', 'rust', 'amber', 'gold', 'mustard', 'magenta', 'berry'],
  cool: ['teal', 'turquoise', 'cyan', 'sky', 'blue', 'navy', 'indigo', 'violet', 'purple', 'plum', 'lavender', 'mint'],
  earth: ['rust', 'brown', 'chocolate', 'tan', 'sand', 'khaki', 'olive', 'mustard', 'sage', 'forest', 'teal', 'maroon']
} satisfies Record<string, ColorName[]>;

/**
 * The colours of the lesson's collection: the palette control.toml's `palette` names,
 * or the one the collection's name draws (collectionPalette in website/src/lib/cardArt).
 * The whole collection is drawn in it, its cards and its panels alike. The player sets
 * it before a chapter loads (website/src/lib/playerClient.ts).
 */
let collectionColors: readonly string[] = [];
const collectionTones = new Map<Tone, readonly string[]>();

type Tone = 'base' | 'light' | 'dark';

/**
 * For the player. Lessons read these as colors.collection (and colors.light.collection,
 * colors.dark.collection), or pick from them with randomColor(i, { from: 'collection' }).
 */
export function setCollectionColors(list: readonly string[]): void {
  collectionColors = list.filter((value) => /^#[0-9a-f]{6}$/i.test(value)).map((value) => value.toLowerCase());
  collectionTones.clear();
}

/** The collection's colours in one tone, made once per tone. 'all' stands in for none. */
function collectionList(tone: Tone): readonly string[] {
  let list = collectionTones.get(tone);
  if (!list) {
    const source = collectionColors.length > 0 ? collectionColors : colorFamilies.all.map((name) => base[name]);
    list = Object.freeze(tone === 'light' ? source.map(lighten) : tone === 'dark' ? source.map(darken) : [...source]);
    collectionTones.set(tone, list);
  }
  return list;
}

export type ColorFamily = keyof typeof colorFamilies | 'collection';

export type RandomColorOptions = {
  /**
   * A family, or the names to pick from. All of them, by default. 'collection' is
   * the palette of this lesson's collection; 'all' stands in where there is none.
   */
  from?: ColorFamily | readonly ColorName[];
  /** Pick the light or dark version instead. */
  tone?: 'light' | 'dark';
};

/** A fixed shuffle per family, so neighbouring numbers get colours far apart. */
const shuffles = new Map<string, readonly ColorName[]>();
function shuffled(names: readonly ColorName[]): readonly ColorName[] {
  const key = names.join(',');
  let order = shuffles.get(key);
  if (!order) {
    const copy = [...names];
    let seed = 0x9e3779b9;
    for (let i = copy.length - 1; i > 0; i -= 1) {
      seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
      const j = seed % (i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    order = copy;
    shuffles.set(key, order);
  }
  return order;
}

/**
 * A colour from the palette, never one from outside it.
 *
 * Give it a number, a ball's index say, and the same number always gets the same
 * colour, so a restart or a reload keeps every ball its own. Consecutive numbers walk
 * a fixed shuffle of the family, so the first ten balls are ten different colours
 * before any repeats. With no number it is random each call.
 *
 *   balls.forEach((ball, i) => (ball.color = randomColor(i)));
 *   randomColor(i, { from: 'cool', tone: 'light' });
 *   randomColor(i, { from: ['orange', 'blue'] });
 *   randomColor();
 */
export function randomColor(n?: number, options: RandomColorOptions = {}): string {
  if (options.from === 'collection' && collectionColors.length > 0) {
    // The palette's own order already alternates light against dark, so it is kept.
    const list = collectionList(options.tone ?? 'base');
    const index = n === undefined ? Math.floor(Math.random() * list.length) : ((Math.floor(n) % list.length) + list.length) % list.length;
    return list[index];
  }

  const from = options.from === 'collection' ? 'all' : options.from;
  const names = typeof from === 'string' ? colorFamilies[from] : from ?? colorFamilies.all;
  if (names.length === 0) return colors.orange;
  const order = shuffled(names);
  const index = n === undefined ? Math.floor(Math.random() * order.length) : ((Math.floor(n) % order.length) + order.length) % order.length;
  const name = order[index];
  return options.tone ? colors[options.tone][name] : colors[name];
}
