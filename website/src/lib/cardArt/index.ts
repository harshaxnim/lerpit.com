/**
 * One generated card per document, in the Betamax idiom.
 *
 * The collection is the series and the document is the issue. Everything that
 * makes two cards look like they came from the same place — which style, which
 * palette, which stock, which voice — is read off the collection name. Everything
 * inside that style is read off the document.
 *
 * The seam is `cardArt(input)`: a plain object in, a plate of SVG and the tokens
 * for its caption out. It deliberately does not take a LerpetteMixtape, so a
 * collection cover or an Open Graph image route can call it with the same five
 * fields and get the same card without a mixtape to hand.
 *
 * This runs at build time only. No client JavaScript, no dependency.
 */

import type { Face, Ground } from './palette';
import {
  FACES, GROUNDS, GROUND_BAG, HEAVY_FACES, NEUTRAL_LIGHT, NEUTRAL_SAT, PRESETS,
  buildRamp, clamp, measure, packLines
} from './palette';
import type { DrawContext } from './styles';
import { COL, DRAW, H, M, PLATE, STYLES, STYLE_IDS, VOICE, W, WANTS_DARK } from './styles';

export { STYLES, STYLE_IDS } from './styles';
export type { StyleSpec } from './styles';

export type CardInput = {
  title: string;
  /** Collection name. Falls back to a constant so an orphan still gets a card. */
  collection?: string | undefined;
  summary?: string | undefined;
  /** ISO date; only its digits are used. */
  date?: string | undefined;
  chapters?: number | undefined;
};

export type CardArt = {
  style: string;
  styleLabel: string;
  palette: string;
  ground: Ground;
  face: Face;
  /** The plate, as the inner markup of an `<svg>` carrying `viewBox`. */
  body: string;
  /** viewBox for that svg. Every style stops at the plate; the caption under
   *  it is identical on every card, whatever was drawn above. */
  viewBox: string;
  /** Title packed to the caption measure. */
  titleLines: string[];
  /** Caption title size in px at the card's natural 300px width. */
  titleSize: number;
  /** Height of the art plate in card units; the rest is caption. */
  plateHeight: number;
  width: number;
  height: number;
};

/**
 * The salt the style decision is drawn with. Surveyed across twenty collection
 * names, 37 spreads over sixteen distinct styles where the original 1 managed
 * fifteen. Changing it renumbers every collection's style, so it is a
 * deliberate reseed and not something to nudge.
 */
const STYLE_SALT = 37;

// ---------------------------------------------------------------- hashing

/** xmur3: a string to one well-mixed 32-bit seed. */
function strHash(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * One hash has to decide half a dozen independent things — which style, which
 * palette, which stock, which voice — and `h % 20` next to `h % 7` next to
 * `h >>> 3 % 8` are not independent at all: two collections that land on the
 * same style tend to land on the same palette too. A murmur3 finaliser with a
 * different salt per decision gives each one its own well-spread stream.
 */
function mix(h: number, salt: number): number {
  let x = (h ^ Math.imul(salt + 1, 2654435761)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Hand out styles across the whole library at once.
 *
 * Picking a style per collection from its own name is uniform but independent,
 * and independent draws collide: twelve collections drawing from twenty styles
 * land on about nine distinct ones, so a library page shows the same poster
 * three times over. Assigning across the set gives twelve.
 *
 * Each collection ranks all twenty styles by its own hash, then the set is
 * walked and each collection takes the best style nobody ahead of it has
 * claimed. Past twenty collections the claim list resets, so the twenty-first
 * starts the cycle again rather than running out.
 *
 * The walk is in hash order rather than alphabetical, so renaming a collection
 * near the top of the alphabet does not cascade through everything below it.
 * Adding a collection can still move another one's style: that is what
 * collision-free assignment costs, and there is no way to have both.
 */
function rankStyles(seed: number): string[] {
  return STYLE_IDS
    .map((id, i) => ({ id, key: mix(seed, STYLE_SALT + i) }))
    .sort((a, b) => a.key - b.key || a.id.localeCompare(b.id))
    .map((x) => x.id);
}

export function assignStyles(collections: readonly string[]): Map<string, string> {
  const unique = [...new Set(collections.map((c) => c?.trim() || 'Lerpette'))];
  const order = unique
    .map((name) => ({ name, seed: strHash(name) }))
    .sort((a, b) => a.seed - b.seed || a.name.localeCompare(b.name));

  const out = new Map<string, string>();
  let taken = new Set<string>();
  for (const { name, seed } of order) {
    const ranked = rankStyles(seed);
    let pick = ranked.find((id) => !taken.has(id));
    if (!pick) {
      taken = new Set();
      pick = ranked[0]!;
    }
    taken.add(pick);
    out.set(name, pick);
  }
  return out;
}

// ---------------------------------------------------------------- defaults

/**
 * The knobs, as the prototype settled them. Measuring the reference sheet put
 * numbers on most of these: saturation 52 to 85 across its panels, lightness 36
 * to 61, hue span 120 to 300. One set of settings cannot span that, so the
 * document's hash swings each card around the default rather than every card
 * sharing it. `variation: 0` hands all of that back.
 */
export type CardOptions = {
  baseHue: number;
  span: number;
  sat: number;
  light: number;
  alternate: number;
  bands: number;
  angle: number;
  position: number;
  curve: number;
  spread: number;
  blend: number;
  variation: number;
  /** Force a style id, a palette id, a ground id or a face id. */
  style?: string | undefined;
  palette?: string | undefined;
  ground?: string | undefined;
  face?: string | undefined;
};

export const CARD_DEFAULTS: CardOptions = {
  baseHue: -1,
  span: 210,
  sat: NEUTRAL_SAT,
  light: NEUTRAL_LIGHT + 2,
  alternate: 14,
  bands: 7,
  angle: -1,
  position: 0,
  curve: 45,
  spread: 55,
  blend: 0,
  variation: 68
};

// ---------------------------------------------------------------- the card

export function cardArt(input: CardInput, options: Partial<CardOptions> = {}): CardArt {
  const o: CardOptions = { ...CARD_DEFAULTS, ...options };

  const title = input.title?.trim() || 'Untitled';
  const collection = input.collection?.trim() || 'Lerpette';
  const summary = input.summary ?? '';
  const date = /^\d{4}-\d{2}-\d{2}/.test(input.date ?? '') ? input.date!.slice(0, 10) : '';
  const chapters = clamp(Math.round(input.chapters ?? 0), 0, 99);

  const collHash = strHash(collection);
  const titleHash = strHash(title);
  const dateHash = strHash(date || title);
  const bodyHash = strHash(summary || title);
  const words = title.split(/\s+/).filter(Boolean);

  // --- what the collection decides -----------------------------------------
  // A caller that can see the whole library passes the style in, from
  // assignStyles above. On its own — one card, an Open Graph route — this falls
  // back to an independent draw from the collection name.
  // one ranking serves both paths, so a collection drawing on its own lands on
  // exactly the style the library-wide assignment would give it if nothing else
  // had claimed it first
  const style = STYLES[o.style ?? ''] ? o.style! : rankStyles(collHash)[0]!;
  const spec = STYLES[style]!;

  const generated = mix(collHash, 2) % 6 === 0;
  const palette = PRESETS.find((p) => p.id === o.palette)?.id
    ?? (generated ? null : PRESETS[mix(collHash, 3) % PRESETS.length]!.id);

  const darkOnly = WANTS_DARK.has(style);
  const darkPool = GROUNDS.filter((g) => g.dark);
  const ground = GROUNDS.find((g) => g.id === o.ground)
    ?? (darkOnly
      ? darkPool[mix(collHash, 4) % darkPool.length]!
      : GROUNDS.find((g) =>
          g.id === GROUND_BAG[(mix(collHash, 4) + STYLE_IDS.indexOf(style) * 7) % GROUND_BAG.length]
        )!);

  // the styles where the letterform is the artwork take only the heavy faces
  const heavy = spec.family === 'type';
  const face = FACES.find((f) => f.id === o.face)
    ?? (heavy
      ? FACES[HEAVY_FACES[mix(collHash, 5) % HEAVY_FACES.length]!]!
      : FACES[(mix(collHash, 5) + (VOICE[style] ?? 0)) % FACES.length]!);

  // --- what the document decides -------------------------------------------
  const v = clamp(o.variation, 0, 100) / 100;
  const swing = (h: number, mid: number, range: number): number =>
    Math.round(mid + v * ((h % (range * 2 + 1)) - range));

  // the sheet's own span never drops below 120 degrees or past 300
  const rawSpan = swing(mix(titleHash, 10), o.span, 120);
  const span = Math.sign(rawSpan || 1) * clamp(Math.abs(rawSpan), 120, 300);
  const sat = swing(mix(bodyHash, 11), o.sat, 16);
  const light = swing(mix(dateHash, 12), o.light, 13);
  const bandBase = Math.max(-4, swing(mix(bodyHash, 13), o.bands, 3));
  const position = clamp(swing(mix(titleHash, 14), o.position, 55), -100, 100);
  const curve = clamp(swing(mix(bodyHash, 15), o.curve, 30), 0, 100);
  const spread = clamp(swing(mix(dateHash, 16), o.spread, 26), 10, 95);
  const angle = o.angle < 0 ? -64 + (titleHash % 92) : o.angle;

  const ramp = buildRamp({
    source: palette,
    baseHue: o.baseHue < 0 ? titleHash % 360 : o.baseHue,
    span, sat, light,
    alternate: o.alternate
  });

  // Every style draws into the plate and nothing draws its own information.
  // The caption below it is the same block on every card, so a shelf reads as
  // one set of labels however different the pictures above them are.
  const artHeight = PLATE;
  // Unique per card, not per collection. Several cards from one collection sit
  // on the same page and share a style, so a uid built from the collection
  // alone collides: SVG resolves a duplicate id to the first one in the
  // document, and every later card ends up clipped by its neighbour's circle.
  const uid = `bx${((collHash ^ titleHash ^ dateHash) >>> 0).toString(36)}`;

  const context: DrawContext = {
    title, collection, date, chapters, words,
    titleHash, dateHash, bodyHash,
    ramp, face,
    ink: ground.ink,
    paper: ground.bg,
    artHeight, angle, position, curve, spread,
    blend: o.blend,
    uid,
    bands: (lo, hi, mul = 1) => clamp(Math.round((chapters + bandBase) * mul), lo, hi)
  };

  const art = DRAW[style]!(context);

  // Ink spread. A hard vector edge is the one thing no printed poster has: ink
  // wicks into the stock and the edge picks up a fraction of a millimetre either
  // side. Half a pixel is enough; any more and the bands look out of focus
  // rather than printed. The warm cast and the grain are not here — they belong
  // to the card, not the artwork, and live in one CSS rule so that every card
  // gets exactly the same press treatment.
  const body =
    `<defs><clipPath id="${uid}p"><rect width="${W}" height="${artHeight}"/></clipPath>` +
    `<filter id="${uid}b" x="-12%" y="-12%" width="124%" height="124%">` +
    `<feGaussianBlur stdDeviation="0.5"/></filter></defs>` +
    `<rect width="${W}" height="${artHeight}" fill="${ground.bg}"/>` +
    `<g clip-path="url(#${uid}p)" filter="url(#${uid}b)">${art}</g>`;

  const titleLines = packLines(title, words.length > 2 ? 2 : 1, face);
  const titleSize = Math.min(29, COL / Math.max(...titleLines.map((l) => measure(l, face))));

  return {
    style,
    styleLabel: spec.label,
    palette: palette ?? 'generated',
    ground, face, body,
    viewBox: `0 0 ${W} ${artHeight}`,
    titleLines, titleSize,
    plateHeight: artHeight,
    width: W,
    height: H
  };
}

export { COL, H, M, PLATE, W };
