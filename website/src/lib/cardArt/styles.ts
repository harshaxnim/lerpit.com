/**
 * The twenty styles, counted off the Betamax reference sheet rather than
 * invented. Thirteen posters sit on that sheet and counting what they actually
 * do gives a much shorter and much more specific list than "rainbow ribbons":
 *
 *   the rainbow falls off the type   four of thirteen. The glyphs are solid
 *                                    dark and the spectrum drops out of their
 *                                    bottom edge, straight down, as on the 40
 *                                    poster.
 *   the flat band block              two of thirteen, both tape labels. Five or
 *                                    six flat full-width bands, a dark one among
 *                                    them, inside a cream spec sheet.
 *   nested rounded corners           two. Concentric rounded rectangles anchored
 *                                    to a corner, or pipes bending into a side.
 *   the parallel sine set            one, and it is the whole lower half.
 *   plus the wheel, the fan, the overlap and the sleeve.
 *
 * Every one of them is hard-edged and flat, and none of them has stock showing
 * between the colours. There is deliberately no parameter that can open a gap in
 * a ramp: it is the single thing that reads as not-Betamax.
 */

import type { Face, Ramp } from './palette';
import { clamp, darkest, lightest, measure } from './palette';

export const W = 300;
export const H = 420;
/** Margin the small type is locked to. */
export const M = 20;
export const COL = W - M * 2;
/** Height of the art plate on a style that gets a caption under it. */
export const PLATE = 292;

const rad = (deg: number): number => (deg * Math.PI) / 180;
const f1 = (v: number): string => (Math.round(v * 10) / 10).toString();
const esc = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type StyleFamily = 'type' | 'pack' | 'geo' | 'pic';

export type StyleSpec = {
  /** What the rainbow is attached to. */
  family: StyleFamily;
  /** Human name, used in the trace and in any picker. */
  label: string;
};

export const STYLES: Record<string, StyleSpec> = {
  // the rainbow falls off the letterform
  spill: { family: 'type', label: 'spill' },
  // packaging: the plate is the furniture off a tape label, without its type
  label: { family: 'pack', label: 'cassette label' },
  spec: { family: 'pack', label: 'spec sheet' },
  sleeve: { family: 'pack', label: 'video sleeve' },
  bars: { family: 'pack', label: 'band block' },
  // flat geometry
  angle: { family: 'geo', label: 'angled lines' },
  nest: { family: 'geo', label: 'nested corners' },
  surf: { family: 'geo', label: 'sine set' },
  arc: { family: 'geo', label: 'concentric arcs' },
  chevron: { family: 'geo', label: 'chevrons' },
  stripe: { family: 'geo', label: 'vertical bands' },
  // the picture structures
  wheel: { family: 'pic', label: 'rainbow wheel' },
  fan: { family: 'pic', label: 'fanned wedge' },
  grid: { family: 'pic', label: 'perspective grid' },
  orb: { family: 'pic', label: 'radiant orb' }
};

export const STYLE_IDS = Object.keys(STYLES);

/** Which of the four voices each style leans towards. */
export const VOICE: Record<string, number> = {
  label: 0, spec: 0, bars: 1, sleeve: 1, spill: 1, angle: 1,
  nest: 2, arc: 2, surf: 3, chevron: 3, stripe: 0, wheel: 2,
  fan: 3, grid: 0, orb: 1
};

/** Styles that only exist on a dark stock; a grid of wires needs black. */
export const WANTS_DARK = new Set(['sleeve', 'grid']);

export type DrawContext = {
  title: string;
  collection: string;
  date: string;
  chapters: number;
  /** Whole-word split of the title, for initials. */
  words: string[];
  titleHash: number;
  dateHash: number;
  bodyHash: number;
  ramp: Ramp;
  face: Face;
  ink: string;
  paper: string;
  /** Height of the drawing area: the plate, or the whole card for `own`. */
  artHeight: number;
  angle: number;
  position: number;
  curve: number;
  spread: number;
  blend: number;
  /** Unique id prefix for defs inside this card. */
  uid: string;
  /** Band count, clamped to what this style can carry. */
  bands: (lo: number, hi: number, mul?: number) => number;
};

// ---------------------------------------------------------------- helpers

/** A solid block of display type, every line set to the same measure. */
function typeBlock(
  lines: string[], x: number, firstBaseline: number, size: number,
  lineHeight: number, width: number, fill: string, face: Face, extra = ''
): string {
  return lines
    .map((line, i) =>
      `<text x="${f1(x)}" y="${f1(firstBaseline + i * lineHeight)}" fill="${fill}"` +
      ` font-size="${f1(size)}" font-family="${face.css}" font-weight="${face.weight}"` +
      ` textLength="${f1(width)}" lengthAdjust="spacingAndGlyphs" ${extra}>${esc(line)}</text>`)
    .join('');
}

/**
 * A split fountain: the ink tray loaded with several colours at once so they
 * bleed into one another on the roller, which is the technique the whole rainbow
 * canon came out of. At blend 0 the stops sit hard against each other and this
 * is a stack of flat bands; at 100 it is one continuous pour. Either way there
 * is no stock between them.
 */
function fountain(
  id: string, cols: string[], x1: number, y1: number, x2: number, y2: number, blend: number
): string {
  const n = cols.length;
  const b = blend / 100;
  let stops = '';
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const z = (i + 1) / n;
    const mid = (a + z) / 2;
    stops +=
      `<stop offset="${f1((a + (mid - a) * b) * 100)}%" stop-color="${cols[i]}"/>` +
      `<stop offset="${f1((z - (z - mid) * b) * 100)}%" stop-color="${cols[i]}"/>`;
  }
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"` +
    ` x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}">${stops}</linearGradient>`;
}

const rampColours = (c: DrawContext, n: number): string[] =>
  Array.from({ length: n }, (_, i) => c.ramp(i, n));

/**
 * The series mark: the collection's initials, at most three. The collection is
 * what the card belongs to, and a mark is the one thing on a shelf that should
 * be the same on every spine in a set — the lerpette's own title is right below
 * it in the caption and does not need saying twice.
 *
 * A one-word collection gives a single letter, which is the strongest of the
 * lot: the D-C60 label is one letter in a box, and "40" is two.
 */
function token(c: DrawContext): string {
  const words = c.collection.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  const initials = words.map((w) => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return initials.slice(0, 3) || 'L';
}

/**
 * How big the mark can be. Sizing it purely to the column makes a one or two
 * letter token enormous, and then there is no plate left for the ramp to fall
 * through — the mark and its own drop have to share the height. Capping the cap
 * height at a little under half the plate keeps the two in proportion whether
 * the token is one letter or three.
 */
function markSize(tok: string, c: DrawContext, width: number): number {
  return Math.min(width / measure(tok, c.face), (c.artHeight * 0.46) / c.face.cap);
}

/**
 * One machine behind three styles. A solid dark token sits on the plate and the
 * same token repeats behind it through the ramp — stretched downward off its own
 * cap line (LOVE), translated straight down (40) or thrown on a fixed diagonal
 * (the numerals poster).
 *
 * Every copy has to overlap the one before it or the stock shows through between
 * them, and nothing on the reference sheet ever shows stock through a ramp. The
 * thinnest part of a letter is a horizontal bar around a ninth of its cap
 * height, so that sets the step; the copy count then falls out of how far the
 * ramp has to travel, and a colour band is a run of copies rather than a single
 * one. Deriving it the other way round — copies from the band count — is what
 * put gaps in it.
 */
function repeated(c: DrawContext): string {
  const bands = c.bands(5, 14);
  const tok = token(c);
  const size = markSize(tok, c, COL);
  const natural = size * measure(tok, c.face);
  // A one or two letter mark has far less presence on the plate than a three,
  // and it cannot be fixed with height — the cap is already against its limit.
  // Widening the letterform gives the width back without making it taller, and
  // it is the period's own move: the blank-tape survey calls out "stretched
  // sans serifs" as a motif in its own right.
  const target = Math.min(COL, natural * clamp(1 + (3 - tok.length) * 0.11, 1, 1.25));
  const stretch = natural > 0 ? target / natural : 1;
  const x = (W - natural) / 2;
  const cap = size * c.face.cap;
  const capY = 24;
  const base = capY + cap;
  const foot = c.artHeight + 8;
  const one = (fill: string): string => typeBlock([tok], x, base, size, 0, natural, fill, c.face);

  const travel = foot - base;
  const step = Math.max(1.2, size * 0.09);
  const copies = clamp(Math.ceil(travel / step), bands, 320);

  let out = '';
  for (let i = copies - 1; i >= 0; i--) {
    const t = (i + 1) / copies;
    const band = Math.min(bands - 1, Math.floor((i * bands) / copies));
    out += `<g transform="translate(0 ${f1(travel * t)})">${one(c.ramp(band, bands))}</g>`;
  }
  out += one(c.ink);
  // the widening is one scale about the centre line, over the mark and every
  // copy of it at once, so the drop stays exactly under the letter it fell from
  return `<g transform="translate(${W / 2} 0) scale(${stretch.toFixed(4)} 1) translate(${f1(-W / 2)} 0)">${out}</g>`;
}

// ---------------------------------------------------------------- the styles

export const DRAW: Record<string, (c: DrawContext) => string> = {
  spill: (c) => repeated(c),

  /**
   * The furniture off a D-C60 label: the tagged square, the ruled write-on
   * lines, the two checkboxes and the block of flat bands. The type that sat
   * under all of that on the real label now lives in the caption, the same
   * caption every other style gets, so the plate is pure graphic.
   */
  label(c) {
    const n = c.bands(4, 8);
    const A = c.artHeight;
    const tag = 66;
    let out = `<rect x="${M}" y="${M}" width="${tag}" height="${tag}" fill="${c.ramp(0, n)}"/>`;
    for (let i = 0; i < 4; i++) {
      out += `<rect x="${M + tag + 16}" y="${M + 14 + i * 15}" width="${W - M * 2 - tag - 16}"` +
        ` height="1.4" fill="${c.ink}" opacity=".34"/>`;
    }
    for (let i = 0; i < 2; i++) {
      out += `<rect x="${M + tag + 16}" y="${M + tag - 18 + i * 13}" width="9" height="9"` +
        ` fill="none" stroke="${c.ink}" stroke-width="1.3" opacity=".7"/>`;
    }
    const top = M + tag + 34;
    const depth = A - top - 34;
    out += fountain(`${c.uid}f`, rampColours(c, n).map((_, i) => c.ramp(i + 1, n)),
      0, top, 0, top + depth, c.blend) +
      `<rect x="0" y="${f1(top)}" width="${W}" height="${f1(depth)}" fill="url(#${c.uid}f)"/>`;
    out += `<rect x="${M}" y="${f1(A - 22)}" width="${W - M * 2}" height="1.4" fill="${c.ink}" opacity=".3"/>`;
    return out;
  },

  /**
   * The 90min videocassette, reduced to its marks: the chip tags along the top,
   * the band block low on the sheet, and the barcode holding the corner down.
   */
  spec(c) {
    const n = c.bands(4, 8);
    const A = c.artHeight;
    let out = '';
    let x = M;
    for (const w of [26, 17, 44]) {
      out += `<rect x="${f1(x)}" y="${M}" width="${w}" height="15" fill="${c.ink}"/>`;
      x += w + 7;
    }
    const top = A * 0.34;
    const depth = A * 0.42;
    out += fountain(`${c.uid}f`, rampColours(c, n), 0, top, 0, top + depth, c.blend) +
      `<rect x="0" y="${f1(top)}" width="${W}" height="${f1(depth)}" fill="url(#${c.uid}f)"/>`;
    out += `<rect x="${M}" y="${f1(A - 30)}" width="14" height="14" fill="none"` +
      ` stroke="${c.ink}" stroke-width="1.7"/>`;
    let bx = W - M;
    for (let i = 0; i < 24; i++) {
      const bw = 1 + ((c.titleHash >>> i) % 3);
      bx -= bw + 1.5;
      out += `<rect x="${f1(bx)}" y="${f1(A - 30)}" width="${f1(bw)}" height="14" fill="${c.ink}"/>`;
    }
    return out;
  },

  /**
   * The T-120 box: the ribbon running across a dark sleeve, with the spine
   * strip down one edge. The spec type that ran up that spine is gone — it was
   * information, and information belongs in the caption now.
   */
  sleeve(c) {
    const n = c.bands(9, 26, 2.2);
    const A = c.artHeight;
    const spine = 30;
    const zone = A * 0.95;
    const wB = zone / n;
    let bars = '';
    for (let i = 0; i < n; i++) {
      bars += `<rect x="-240" y="${f1(A * 0.46 - zone / 2 + i * wB)}" width="800"` +
        ` height="${f1(wB)}" fill="${c.ramp(i, n)}"/>`;
    }
    return `<g transform="rotate(${f1((c.angle % 44) - 22)} 150 ${f1(A * 0.46)})">${bars}</g>` +
      `<rect x="${W - spine}" y="0" width="${spine}" height="${f1(A)}" fill="rgba(0,0,0,.55)"/>` +
      `<rect x="${W - spine}" y="0" width="1.4" height="${f1(A)}" fill="#F2EDE2" opacity=".35"/>`;
  },

  /**
   * Nothing but the band block, full bleed, with one window of bare stock cut
   * across it — the label window a tape box left for the writing. The bands are
   * cut by it rather than stopping at it, so the stack still reads as one run.
   */
  bars(c) {
    const n = c.bands(5, 14);
    const A = c.artHeight;
    const windowH = A * 0.14;
    const windowY = clamp(A * 0.52 + (c.position / 100) * A * 0.26, 24, A - windowH - 24);
    let out = fountain(`${c.uid}f`, rampColours(c, n), 0, -10, 0, A + 10, c.blend) +
      `<rect x="0" y="-10" width="${W}" height="${f1(A + 20)}" fill="url(#${c.uid}f)"/>`;
    out += `<rect x="0" y="${f1(windowY)}" width="${W}" height="${f1(windowH)}" fill="${c.paper}"/>`;
    return out;
  },

  /**
   * Straight parallel lines at an angle: the single most common blank-tape motif.
   * Built in rotated space and spun into place, so the angle never changes the
   * widths or the spacing.
   */
  angle(c) {
    const n = c.bands(4, 26);
    const pitch = (c.artHeight * 1.5) / n;
    const span = n * pitch;
    const y0 = c.artHeight / 2 - span / 2 + (c.position / 100) * c.artHeight * 0.4;
    const body = fountain(`${c.uid}f`, rampColours(c, n), 0, y0, 0, y0 + span, c.blend) +
      `<rect x="-220" y="${f1(y0)}" width="740" height="${f1(span)}" fill="url(#${c.uid}f)"/>`;
    return `<g transform="rotate(${f1(c.angle)} ${W / 2} ${f1(c.artHeight / 2)})">${body}</g>`;
  },

  /**
   * Concentric rounded corners nesting into one point.
   *
   * Every arc has to share a centre or the corners stop being concentric, which
   * fixes the arithmetic: step the corner one pitch inward and the radius one
   * pitch with it. The centre is then placed far enough from the plate's own
   * corner that the outermost band's curve is fully on the sheet — that curve is
   * the whole motif, and anchoring the set tight to a corner pushed it off the
   * edge where it could not be seen. Everything runs off the two far edges, so
   * no other corner of any band is ever visible.
   */
  nest(c) {
    // Few and wide. The reference panel carries eight bands across the sheet and
    // its innermost block is nearly half the panel, so the ribbon reads as a
    // broad stripe rather than as a contour line. Sharing the ribbon count with
    // the linear styles gave a dozen thin ones instead, which is the same
    // drawing at the wrong scale.
    const n = c.bands(3, 7, 0.45);
    const A = c.artHeight;
    // the centre sits well in from the corner, which both keeps the outermost
    // curve on the plate and leaves room for the bands to be thick
    const cx = W * (0.20 + (c.spread / 100) * 0.09);
    const cy = A * (0.18 + (c.spread / 100) * 0.09);
    const rMax = Math.min(W - 12 - cx, A - 12 - cy);
    // the innermost shape is a large solid block, not a dot
    // Where the set converges. Starting this large made every ring read as a
    // fat rounded corner with no tightening through the run; the nest wants to
    // arrive somewhere. Dropping it also widens the bands, since the same
    // number of rings now spans more radius.
    const rMin = rMax * (0.05 + (1 - c.curve / 100) * 0.2);
    // The field is the first colour in the run, not the stock. A nest sitting on
    // bare paper has a seam where the progression stops, and the reference panel
    // has none — its outermost band IS the field, edge to edge, with every ring
    // nesting into it. So the ramp is asked for one more colour than there are
    // rings and the plate is flooded with it before anything is drawn.
    const pitch = n > 1 ? (rMax - rMin) / (n - 1) : 0;
    let out = `<rect x="0" y="0" width="${W}" height="${f1(A)}" fill="${c.ramp(0, n + 1)}"/>`;
    for (let i = 0; i < n; i++) {
      const r = rMax - i * pitch;
      out += `<rect x="-280" y="-280" width="${f1(cx + r + 280)}" height="${f1(cy + r + 280)}"` +
        ` rx="${f1(r)}" fill="${c.ramp(i + 1, n + 1)}"/>`;
    }
    // four orientations, from one set of numbers
    const flipX = (c.titleHash >>> 3) % 2 === 1;
    const flipY = (c.titleHash >>> 5) % 2 === 1;
    const tf = `translate(${flipX ? W : 0} ${flipY ? A : 0}) scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`;
    return flipX || flipY ? `<g transform="${tf}">${out}</g>` : out;
  },

  /**
   * COLOR SURF: a thick set of parallel sine bands filling the lower half and
   * running off both edges, about one and a half periods across the sheet.
   */
  surf(c) {
    const n = c.bands(6, 22, 1.8);
    const lam = W / (0.9 + (c.curve / 100) * 1.4);
    const phase = (c.titleHash % 628) / 100;
    const amp = 10 + (c.curve / 100) * 26;
    // the set bleeds off the bottom of the plate rather than floating on it
    const zone = c.artHeight * (0.46 + (c.spread / 100) * 0.5);
    const pitch = zone / n;
    const y0 = c.artHeight - zone + pitch / 2 + amp * 0.5 + (c.position / 100) * c.artHeight * 0.3;
    let out = '';
    for (let i = 0; i < n; i++) {
      const y = y0 + i * pitch;
      const pts: string[] = [];
      for (let s = 0; s <= 34; s++) {
        const x = -24 + (s / 34) * (W + 48);
        pts.push(`${f1(x)} ${f1(y + Math.sin((x / lam) * Math.PI * 2 + phase) * amp)}`);
      }
      out += `<path d="M${pts.join('L')}" fill="none" stroke="${c.ramp(i, n)}"` +
        ` stroke-width="${f1(pitch)}"/>`;
    }
    return out;
  },

  /**
   * Concentric arcs with the centre well off the sheet, so the card holds one
   * shallow segment of a much larger rainbow rather than a bullseye.
   */
  arc(c) {
    const n = c.bands(4, 20);
    const cx = W * (-0.35 + ((c.titleHash % 170) / 100));
    const cy = c.artHeight * (1.25 + (c.position / 100) * 0.55);
    const pitch = (c.artHeight * 1.5) / n;
    let out = '';
    let r = c.artHeight * 0.42 + (c.dateHash % 50);
    for (let i = 0; i < n; i++) {
      out += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="none"` +
        ` stroke="${c.ramp(i, n)}" stroke-width="${f1(pitch)}"/>`;
      r += pitch;
    }
    return out;
  },

  chevron(c) {
    const n = c.bands(4, 20);
    const apexX = W * (0.18 + ((c.titleHash % 64) / 100));
    const drop = clamp(Math.tan(rad(clamp(Math.abs(c.angle) % 80, 12, 58))), 0.22, 1.0);
    const pitch = (c.artHeight * 1.2) / n;
    const up = (c.titleHash >>> 9) % 2 === 0 ? 1 : -1;
    let out = '';
    let y = up > 0 ? -c.artHeight * 0.1 : c.artHeight * 1.1;
    for (let i = 0; i < n; i++) {
      out += `<path d="M-30 ${f1(y + (apexX + 30) * drop * up)} L${f1(apexX)} ${f1(y)}` +
        ` L${f1(W + 30)} ${f1(y + (W + 30 - apexX) * drop * up)}" fill="none"` +
        ` stroke="${c.ramp(i, n)}" stroke-width="${f1(pitch)}" stroke-linejoin="miter"/>`;
      y += pitch * up;
    }
    return out;
  },

  stripe(c) {
    const n = c.bands(4, 22);
    return fountain(`${c.uid}f`, rampColours(c, n), 0, 0, W, 0, c.blend) +
      `<rect x="0" y="0" width="${W}" height="${f1(c.artHeight)}" fill="url(#${c.uid}f)"/>`;
  },

  wheel(c) {
    const n = c.bands(5, 24);
    const cx = W / 2 + (c.position / 100) * W * 0.45;
    const cy = c.artHeight * (0.5 + (c.spread / 100 - 0.5) * 0.7);
    const R = 460;
    const sweep = 360 / n;
    let out = '';
    for (let i = 0; i < n; i++) {
      const a1 = rad(c.angle + i * sweep);
      const a2 = rad(c.angle + (i + 1) * sweep + 0.3);
      out += `<path d="M${f1(cx)} ${f1(cy)} L${f1(cx + Math.cos(a1) * R)} ${f1(cy + Math.sin(a1) * R)}` +
        ` A${R} ${R} 0 0 1 ${f1(cx + Math.cos(a2) * R)} ${f1(cy + Math.sin(a2) * R)}Z"` +
        ` fill="${c.ramp(i, n)}"/>`;
    }
    return out;
  },

  /**
   * The lamp: a dark half disc with a hole punched in it, standing on a fan of
   * wedges. Mirror symmetry is what makes this an object rather than a pattern,
   * so the wedges are laid out in pairs about the centre.
   */
  fan(c) {
    const n = c.bands(9, 24);
    const cx = W / 2;
    const R = W * 0.4;
    const cy = R + 12;
    const apex = c.artHeight - 4;
    const half = Math.ceil(n / 2);
    let out = '';
    for (let i = 0; i < half; i++) {
      for (const s of [-1, 1]) {
        const x1 = cx + (s * (R * i)) / half;
        const x2 = cx + (s * (R * (i + 1))) / half;
        out += `<path d="M${f1(cx)} ${f1(apex)} L${f1(x1)} ${f1(cy)} L${f1(x2)} ${f1(cy)}Z"` +
          ` fill="${c.ramp(i, half)}"/>`;
      }
    }
    // the shade takes the darkest member of the ramp rather than flat ink, so the
    // card does not go three quarters neutral the moment the fan is small
    const shade = darkest(c.ramp, n);
    out += `<path d="M${f1(cx - R)} ${f1(cy)} A${f1(R)} ${f1(R)} 0 0 1 ${f1(cx + R)} ${f1(cy)}Z" fill="${shade}"/>`;
    out += `<circle cx="${f1(cx)}" cy="${f1(cy - R * 0.44)}" r="${f1(R * 0.26)}" fill="${c.paper}"/>`;
    out += `<rect x="${f1(cx - 1.4)}" y="${f1(cy)}" width="2.8" height="${f1(c.artHeight * 0.24)}" fill="${shade}"/>`;
    out += `<circle cx="${f1(cx)}" cy="${f1(cy + c.artHeight * 0.24)}" r="5" fill="${shade}"/>`;
    return out;
  },

  grid(c) {
    const n = c.bands(4, 16);
    const hz = c.artHeight * (0.44 + (c.position / 100) * 0.2);
    const vpx = W / 2 + ((c.titleHash % 60) - 30);
    let out = fountain(`${c.uid}f`, rampColours(c, n), 0, 0, 0, hz, c.blend) +
      `<rect x="0" y="0" width="${W}" height="${f1(hz)}" fill="url(#${c.uid}f)"/>`;
    const wire = lightest(c.ramp, n);
    for (let i = -7; i <= 7; i++) {
      out += `<line x1="${f1(vpx)}" y1="${f1(hz)}" x2="${f1(vpx + i * 104)}" y2="${f1(c.artHeight)}"` +
        ` stroke="${wire}" stroke-width="1.1"/>`;
    }
    let y = hz;
    let step = 2.2;
    while (y < c.artHeight) {
      out += `<line x1="0" y1="${f1(y)}" x2="${W}" y2="${f1(y)}" stroke="${wire}" stroke-width="1.1"/>`;
      y += step;
      step *= 1.46;
    }
    return out + `<rect x="0" y="${f1(hz - 1.6)}" width="${W}" height="3.2" fill="${wire}"/>`;
  },

  orb(c) {
    const n = c.bands(5, 18);
    const cx = W / 2 + (c.position / 100) * W * 0.3;
    const cy = c.artHeight * 0.42;
    const R = c.artHeight * (0.26 + (c.curve / 100) * 0.16);
    const seaTop = cy + R * 0.25;
    const seaCols = Array.from({ length: n }, (_, i) => c.ramp(n - 1 - i, n));
    let out = fountain(`${c.uid}s`, seaCols, 0, seaTop, 0, c.artHeight, c.blend) +
      `<rect x="0" y="${f1(seaTop)}" width="${W}" height="${f1(c.artHeight - seaTop)}" fill="url(#${c.uid}s)"/>`;
    // the sun is banded through the same ramp and then sliced, which is the only
    // reason it reads as a sunset rather than as a dot
    let disc = fountain(`${c.uid}d`, rampColours(c, n), 0, cy - R, 0, cy + R, c.blend) +
      `<rect x="${f1(cx - R)}" y="${f1(cy - R)}" width="${f1(R * 2)}" height="${f1(R * 2)}" fill="url(#${c.uid}d)"/>`;
    // the slices are a darker member of the ramp, not the stock punched through:
    // letting the paper up through it would be the one gap on the card
    const slice = darkest(c.ramp, n);
    let y = cy - R * 0.1;
    let cut = 2.2;
    while (y < cy + R) {
      disc += `<rect x="${f1(cx - R)}" y="${f1(y)}" width="${f1(R * 2)}" height="${f1(cut)}" fill="${slice}"/>`;
      y += cut + 8;
      cut *= 1.38;
    }
    return `<clipPath id="${c.uid}c"><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R)}"/></clipPath>` +
      out + `<g clip-path="url(#${c.uid}c)">${disc}</g>`;
  }
};
