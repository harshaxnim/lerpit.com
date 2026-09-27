/**
 * Colour, stock and type metrics for the generated lerpette card.
 *
 * Everything here was measured off the reference sheet for the Betamax trend
 * (Philip VanDusen, "14 Trends in Graphic Design for 2020") rather than chosen:
 * twelve posters, sampled panel by panel with a colour quantiser. Two findings
 * shape the whole model.
 *
 * The first is that almost nothing on that sheet is at full chroma, and the sets
 * hold together by lightness rather than by hue. The LOVE ramp sits at one
 * lightness the whole way round the wheel and simply lets saturation fall off as
 * it goes cool; the 40 poster is a full spectrum whose lightness drops from 47
 * to 32 on the way.
 *
 * The second is that picking hexes off a poster gives a set hotter than the
 * poster. The eye reads a panel's chroma against the cream and the near-black
 * sitting in it, and those get dropped when you pick swatches — so the neutrals
 * are members of the ramps here, and each set is compressed back towards the
 * saturation its own panel measures.
 */

export type Hsl = [h: number, s: number, l: number];

export type Ground = {
  id: string;
  /** Stock colour. */
  bg: string;
  /** Ink dark enough to clear 4.5:1 on that stock; the worst pair is 8.1:1. */
  ink: string;
  dark: boolean;
};

export type Face = {
  id: string;
  /** Family stack for the `font-family` property. */
  css: string;
  weight: number;
  /** Mean advance relative to Archivo Black, measured off the live face. */
  width: number;
  /** Cap height as a fraction of the em, measured off the live face. */
  cap: number;
};

export type Preset = {
  id: string;
  /** Mean saturation of the chromatic pixels on the panel this came from. */
  sat: number;
  hues: string[];
};

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

const rad = (deg: number): number => (deg * Math.PI) / 180;

export const PRESETS: Preset[] = [
  {
    id: 'Love drop 1974',
    sat: 61,
    hues: ['#F2BB58', '#EE8B5E', '#E76363', '#D26193', '#C658A5', '#846EB0', '#6E85C0', '#588FC6', '#5FB0C6', '#424242']
  },
  {
    // the D-C60 label strip, in the order the label printed it, dark band included
    id: 'Tape label 1981',
    sat: 58,
    hues: ['#8FC64D', '#E7D121', '#3A3730', '#DC2158', '#21C6D1', '#DCDCD1']
  },
  {
    // the nested-corner panel: cool and dark through to warm and light
    id: 'Furnishing 1974',
    sat: 85,
    hues: ['#00164D', '#2C4258', '#00638F', '#3E8C93', '#6EA59A', '#F2DCB0', '#F2A563', '#E76E2C', '#E23A1E']
  },
  {
    // Perspective for the 70s, where every line is knocked well off full chroma
    id: 'Perspective 1970',
    sat: 52,
    hues: ['#C65879', '#D19A42', '#215879', '#A52C4D', '#3779A5', '#796E2C', '#6E2C16', '#4D8F6E', '#D1D1C6']
  },
  {
    // the 90min videocassette label: a warm ramp only, and the sheet's narrowest
    id: '90min 1982',
    sat: 79,
    hues: ['#F2B021', '#E7752C', '#E7212C', '#A51E4D', '#63164D', '#161616']
  },
  {
    // COLOR SURF, printed on kraft, so nothing in it is allowed to be bright
    id: 'Color surf 1979',
    sat: 54,
    hues: ['#219A84', '#D10B42', '#D19A42', '#4D8F37', '#4D6379', '#B5573A', '#211600']
  },
  {
    // the 40 poster: a full spectrum, but the lightness falls away as it goes cool
    id: 'Spectrum drop 1975',
    sat: 72,
    hues: ['#F2C600', '#F27921', '#E71621', '#D10B84', '#842184', '#4B2C86', '#2C2C79', '#0079A5', '#0F9BB5', '#F2E7DC', '#211616']
  }
];

export const GROUNDS: Ground[] = [
  { id: 'cream', bg: '#F2EDE2', ink: '#221F1B', dark: false },
  { id: 'bone', bg: '#E4DFD3', ink: '#1C1B18', dark: false },
  { id: 'white', bg: '#FCFCFA', ink: '#141414', dark: false },
  { id: 'kraft', bg: '#D6BF9A', ink: '#241B10', dark: false },
  { id: 'tan', bg: '#C5AD87', ink: '#20180E', dark: false },
  { id: 'black', bg: '#0D0D0D', ink: '#F2EDE2', dark: true },
  { id: 'soot', bg: '#1A1714', ink: '#F0E9DB', dark: true },
  { id: 'navy', bg: '#0E1B3A', ink: '#F0EADC', dark: true }
];

/**
 * Twenty slots, four of them dark, because the sheet runs four of twelve panels
 * on black or navy and two styles here are forced dark on top of that. Twenty is
 * also coprime with the step the style index takes through it, so twenty styles
 * walk every slot once instead of piling onto four of them.
 */
export const GROUND_BAG = [
  'cream', 'black', 'bone', 'kraft', 'white', 'cream', 'navy', 'bone',
  'soot', 'tan', 'cream', 'white', 'bone', 'kraft', 'cream', 'white',
  'kraft', 'cream', 'bone', 'tan'
];

/**
 * The sheet speaks in at least four voices: a heavy condensed grotesk on the 40
 * and LOVE posters, a neutral Helvetica on the two tape labels, a fat rounded
 * face on COLOR SURF and a geometric Avant Garde on the numerals. The literature
 * on the period names exactly those — ITC Avant Garde Gothic, Cooper Black, ITC
 * Bauhaus — and these are the closest faces that are free to serve.
 */
export const FACES: Face[] = [
  { id: 'Archivo Black', css: "'Archivo Black', Impact, sans-serif", weight: 400, width: 1.0, cap: 0.69 },
  { id: 'Anton', css: "'Anton', Impact, sans-serif", weight: 400, width: 0.62, cap: 0.86 },
  { id: 'Poppins', css: "'Poppins', Futura, sans-serif", weight: 900, width: 0.92, cap: 0.71 },
  { id: 'Bowlby One', css: "'Bowlby One', Impact, sans-serif", weight: 400, width: 0.99, cap: 0.74 }
];

/**
 * The two heavy faces. A ramp falling off a condensed letterform has nothing to
 * fall off, so the styles where the letterform is the artwork draw only these.
 */
export const HEAVY_FACES = [0, 3];

export const MONO = "'IBM Plex Mono', ui-monospace, monospace";

// ---------------------------------------------------------------- conversion

export const toRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
];

export function rgbToHsl([r, g, b]: [number, number, number]): Hsl {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l * 100];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

export const css = ([h, s, l]: Hsl): string =>
  `hsl(${(((h % 360) + 360) % 360).toFixed(1)} ${clamp(s, 0, 100).toFixed(1)}% ${clamp(l, 0, 100).toFixed(1)}%)`;

/** Lightness out of an `hsl()` string, for picking the extremes of a ramp. */
const lightnessOf = (colour: string): number => {
  const m = colour.match(/([\d.]+)%\)$/);
  return m ? Number(m[1]) : 50;
};

// ---------------------------------------------------------------- the model

/** Where the two knobs sit when they are doing nothing to a sampled palette. */
export const NEUTRAL_SAT = 52;
export const NEUTRAL_LIGHT = 50;

/**
 * A poster's chroma is not one number. Scaling a sampled set so its mean lands
 * on the panel's mean still leaves members at a hundred, and it is those that
 * read as neon however good the average looks. So the set is compressed towards
 * the target rather than scaled to it, and nothing is let past a ceiling. The
 * extra trim is honest too: the swatches came off a JPEG of a printed thing, and
 * compression pushes chroma up, so a set picked that way is hotter than the ink
 * ever was.
 */
const SAT_CEIL = 84;
const SAT_TRIM = 0.88;
const SAT_SQUEEZE = 0.55;

/**
 * Real ink does not hold one saturation and one lightness the whole way round
 * the wheel, and a ramp that does is exactly what a test card looks like. On
 * every poster on the sheet the yellows are light and the blues are dark, and
 * the blues have given up a third of their chroma, because that is what the
 * pigments do. The generated ramp carries the same curve; the knobs move the
 * middle of it rather than flattening it.
 */
const naturalLight = (h: number): number => 15 * Math.cos(rad(h - 52));
const naturalSat = (h: number): number => 11 * Math.cos(rad(h - 30));

export type RampOptions = {
  /** A preset id, or null for a ramp generated from the base hue. */
  source: string | null;
  baseHue: number;
  span: number;
  sat: number;
  light: number;
  /** Light-against-dark rhythm between neighbours, 0-100. */
  alternate: number;
};

/** A ramp, as a function of position in it: `ramp(i, n)`. */
export type Ramp = (i: number, n: number) => string;

export function buildRamp(o: RampOptions): Ramp {
  const generated = o.source === null;
  let members: Hsl[] | null = null;

  if (!generated) {
    const preset = PRESETS.find((p) => p.id === o.source) ?? PRESETS[0]!;
    const raw = preset.hues.map((hex) => rgbToHsl(toRgb(hex)));
    // compress towards the saturation the poster itself measures, over the
    // members that carry chroma at all — the neutrals have to stay neutral
    const chromatic = raw.filter((x) => x[1] > 18);
    const mean = chromatic.reduce((a, x) => a + x[1], 0) / Math.max(1, chromatic.length);
    const target = preset.sat * SAT_TRIM;
    members = raw.map(([h, s, l]): Hsl =>
      [h, s > 18 ? clamp(target + (s - mean) * SAT_SQUEEZE, 0, SAT_CEIL) : s, l]);
  }

  const alt = (o.alternate / 100) * (generated ? 1 : 0.4);
  // a sampled palette already sits where its poster sits, so the knob can knock
  // it a long way back and barely push it up
  const offset = generated ? 0 : clamp(o.sat - NEUTRAL_SAT, -26, 4);

  return (i, n) => {
    let h: number;
    let s: number;
    let l: number;
    if (generated || members === null) {
      h = o.baseHue + (n <= 1 ? 0 : (i / n) * o.span);
      s = o.sat + naturalSat(h);
      l = o.light + naturalLight(h);
    } else {
      const p = members[((i % members.length) + members.length) % members.length]!;
      h = p[0];
      s = p[1] + (p[1] > 18 ? offset : 0);
      l = p[2] + (o.light - NEUTRAL_LIGHT);
    }
    return css([h, clamp(s, 0, SAT_CEIL), l * (i % 2 ? 1 - alt * 0.42 : 1 + alt * 0.14)]);
  };
}

/**
 * The lightest member of a set. A sampled palette can be mostly dark, and a wire
 * drawn in one of its dark members on a black ground is not a wire.
 */
export function lightest(ramp: Ramp, n: number): string {
  let best = ramp(0, n);
  let bl = -1;
  for (let i = 0; i < n; i++) {
    const c = ramp(i, n);
    const l = lightnessOf(c);
    if (l > bl) {
      bl = l;
      best = c;
    }
  }
  return best;
}

/** The darkest member, for shades and slices that must not be the stock. */
export function darkest(ramp: Ramp, n: number): string {
  let best = ramp(0, n);
  let bl = 999;
  for (let i = 0; i < n; i++) {
    const c = ramp(i, n);
    const l = lightnessOf(c);
    if (l < bl) {
      bl = l;
      best = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------- type metrics

/**
 * Archivo Black advances, measured rather than guessed, with a per-face scalar
 * on top. A poster sets its type to the measure, so a line has to be sized
 * against the width it is going to fill.
 */
const ADVANCE: Record<string, number> = {
  A: 0.72, B: 0.7, C: 0.7, D: 0.74, E: 0.62, F: 0.6, G: 0.74, H: 0.76, I: 0.33,
  J: 0.57, K: 0.71, L: 0.59, M: 0.92, N: 0.77, O: 0.78, P: 0.67, Q: 0.79, R: 0.71,
  S: 0.66, T: 0.62, U: 0.74, V: 0.7, W: 1.0, X: 0.7, Y: 0.66, Z: 0.62,
  ' ': 0.28, '-': 0.38, '.': 0.31, ',': 0.31, '?': 0.6, '!': 0.33, '/': 0.42,
  '&': 0.78, "'": 0.26
};

/** Width of a string in ems, in a given face. */
export const measure = (text: string, face: Face): number =>
  [...text.toUpperCase()].reduce(
    (a, c) => a + (ADVANCE[c] ?? (/[0-9]/.test(c) ? 0.68 : 0.62)),
    0
  ) * face.width;

/**
 * Pack words into at most `lines` lines of roughly equal measure, so that
 * setting every line to the same width distorts none of them much.
 */
export function packLines(text: string, lines: number, face: Face): string[] {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const target = measure(words.join(' '), face) / lines;
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    const joined = `${current} ${word}`;
    if (measure(joined, face) > target * 1.1 && out.length < lines - 1) {
      out.push(current);
      current = word;
    } else {
      current = joined;
    }
  }
  out.push(current);
  return out;
}
