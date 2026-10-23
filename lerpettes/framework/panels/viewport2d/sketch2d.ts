import * as THREE from 'three';
import { createGlyphAtlas } from './glyphAtlas';
import { colors as theme } from '../../theme';
import type { Trail } from '../../trail';

/**
 * An immediate-mode face on a retained-mode engine.
 *
 * three.js holds a scene of objects between frames, which means the honest way to draw
 * a changing picture with it is to create meshes once, find them again next frame, set
 * their properties, and dispose of them when they are no longer wanted. That is fine
 * for a 3D scene, where the objects are the subject. It is miserable for a 2D sketch,
 * where the subject is a line whose length is a number in the state, and where a
 * reader's exercise is four lines of physics rather than scene bookkeeping.
 *
 * So the panel does the bookkeeping and the reader does not.
 *
 * Everything a frame draws is written as triangles into one growing vertex buffer and
 * drawn in a single call: position, colour and texture coordinate per vertex. This used
 * to be one mesh per shape and a canvas texture per label, and that does not survive
 * contact with a real sketch: a 300-point trail was 300 draw calls, each with
 * three.js's per-object work (a transparent double-sided material is even drawn twice,
 * recompiling its program key both times), and a readout uploaded a texture every
 * frame. Measured on meta/perf-lab, 3,000 lines took 62ms a frame that way.
 *
 * Text is quads over a glyph atlas (glyphAtlas.ts), so it shares the buffer. Shapes
 * sample the atlas's plain white patch, glyphs are white, and the vertex colour does
 * the rest. Order in the buffer is the order of the calls, so painting works the way a
 * 2D context does: a later call covers an earlier one, text included.
 *
 * Nothing is created per frame once a scene has reached its high-water mark: the
 * buffer grows by doubling and is kept, glyphs are rasterised once, and there is no
 * `dispose` a reader can forget.
 *
 * Two coordinate systems, because a diagram has two kinds of number in it:
 *
 *   - Positions are in units, the way the maths is written: the origin in the middle,
 *     x from -1 at the left edge to 1 at the right, y up to `ctx.view.halfHeight`.
 *     `sketch.circle(s.x, s.y, 8)` puts a particle where the state says it is.
 *   - Sizes are in pixels as drawn on a 600px-wide panel (about a desktop's): a radius,
 *     a line's width, an arrowhead. They scale with the panel, so a phone's narrower
 *     panel shows the same picture smaller rather than the same dots on a smaller
 *     picture; the positions shrink with it, and the sizes have to as well. Text does
 *     not scale: a label stays legible whatever size the panel is.
 *
 * `sketch.pixels` is the same set of calls in plain pixels (origin top left, y down),
 * for anything laid out against the panel's edges rather than the maths. Its sizes are
 * plain pixels too, unscaled.
 *
 * Every call takes where and how big as arguments, and everything else (colour, width,
 * dotted, ...) in an options object, all of it optional:
 *
 *   sketch.line(-1, rest, 1, rest, { color: colors.gray, width: 1, dotted: true });
 *
 * `dotted: true` draws a row of round dots instead: a guide, a rest length, a path not
 * taken. Lines, paths and trails become dots along them; a circle or a rect becomes a
 * dotted outline; an arrow keeps a solid head so it still points. The dots are spread
 * evenly so both ends of an open line land on one.
 *
 * The camera underneath is an ordinary y-up orthographic one in pixels, because a
 * y-flipped frustum reverses winding order and silently culls every face.
 */

/** Colours arrive as 0xrrggbb from a reader, or as a CSS string when that is easier. */
export type Paint = number | string;

/** Points as `[[x, y], ...]` or a flat `[x, y, x, y, ...]`. */
export type Points = ReadonlyArray<readonly [number, number]> | readonly number[];

/**
 * How a stroke or a shape is drawn. `width` is in pixels (1.5 unless given); `dotted`
 * draws it as a row of dots, or a filled shape as a dotted outline whose dots `width`
 * sizes.
 */
export type StrokeOptions = { color?: Paint; width?: number; dotted?: boolean };

/** The drawing calls, in whichever coordinates the object they hang off uses. */
export type Draw2D = {
  /** A filled rectangle from corner `x1, y1` to the opposite corner `x2, y2`. */
  rect(x1: number, y1: number, x2: number, y2: number, options?: StrokeOptions): void;
  /** A filled circle centred on `x, y`. The radius is in pixels. */
  circle(x: number, y: number, radius: number, options?: StrokeOptions): void;
  /** A straight line of real width, unlike WebGL's own, which ignores it. */
  line(x1: number, y1: number, x2: number, y2: number, options?: StrokeOptions): void;
  /** A line from `x1, y1` with an arrowhead at `x2, y2`. The head grows with the width. */
  arrow(x1: number, y1: number, x2: number, y2: number, options?: StrokeOptions): void;
  /** A run of connected segments. */
  path(points: Points, options?: StrokeOptions): void;
  /**
   * A path that fades in from transparent at its first point to `color` at its last:
   * the history a moving thing leaves behind, oldest first. See `Trail` in
   * `@lerpit/framework/trail` for keeping one. `fade: false` draws it solid, as `path`.
   * `style: 'dots'` draws a dot at each point instead of joining them (dot radius 1.5×
   * `width`), for showing the samples themselves rather than the curve through them;
   * `dotted: true` spaces dots evenly along it instead, whatever the samples.
   *
   *   sketch.trail(points, { color: colors.orange, width: 1, fade: false });
   */
  trail(points: Points | Trail, options?: StrokeOptions & { fade?: boolean; style?: 'line' | 'dots' }): void;
  /** A line of text. `x` is where it starts; the line is centred on `y`. `size` in pixels, 12 unless given. */
  text(value: string, x: number, y: number, options?: { color?: Paint; size?: number }): void;
};

export type Sketch2D = Draw2D & {
  /** The same calls in pixels: origin at the top left, y down. */
  pixels: Draw2D;
  /**
   * The x and y axes through the origin, edge to edge, x red and y green as in 3D, with
   * a tick and a label every `ticks` units (0.5 unless given; 0 for none).
   */
  axes(ticks?: number): void;
  /** Units to pixels, for mixing the two: `sketch.pixels.text('A', sketch.px(x) + 6, ...)`. */
  px(x: number): number;
  py(y: number): number;
  /** Pixels per unit: half the panel's width. */
  unit: number;
  /**
   * What a size is multiplied by on this panel: its width over 600. A size in units, for
   * placing something against a drawn shape: `radius * sketch.scale / sketch.unit`.
   */
  scale: number;
  /**
   * The band under the tabs, for a sentence about what the panel is showing.
   *
   * Unlike everything else here it is not redrawn each frame: the last value set is
   * the one that stands, so setting it once in `build` is enough and setting it every
   * frame is also fine. Text, not pixels, so it is selectable and readable aloud.
   */
  caption(value: string): void;
  /**
   * The scene itself, for a chapter that wants three.js rather than this. It is the
   * chapter's own: what it adds in `build` is emptied when the chapter runs again.
   */
  scene: THREE.Scene;
  /** The panel box in pixels. */
  width: number;
  height: number;
};

/** Segments in a full circle, as many as the circle mesh this replaced. */
const CIRCLE_SEGMENTS = 32;
const CIRCLE_COS = Float32Array.from({ length: CIRCLE_SEGMENTS + 1 }, (_, i) => Math.cos((i / CIRCLE_SEGMENTS) * Math.PI * 2));
const CIRCLE_SIN = Float32Array.from({ length: CIRCLE_SEGMENTS + 1 }, (_, i) => Math.sin((i / CIRCLE_SEGMENTS) * Math.PI * 2));
/** Segments in one dot of a dotted stroke. */
const DOT_SEGMENTS = 8;
/** What a shape is drawn in when no colour is given. */
const ACCENT = 0x2e6da4;
/** The panel width at which a size is drawn at its own number of pixels. */
const REFERENCE_WIDTH = 600;

/**
 * Floats per vertex: x, y, z, r, g, b, a, u, v. Interleaved, so a frame is one upload.
 * The colour has four components, so three.js blends by the vertex's alpha.
 */
const STRIDE = 9;

/** Parsed colours, so a CSS string is not parsed again for every shape of every frame. */
const COLOR_CACHE_LIMIT = 512;

export function createSketch2D(scene: THREE.Scene, setCaption: (value: string) => void) {
  const colors = new Map<Paint, THREE.Color>();
  const atlas = createGlyphAtlas();
  let data = new Float32Array(STRIDE * 3 * 1024);
  let buffer = new THREE.InterleavedBuffer(data, STRIDE).setUsage(THREE.DynamicDrawUsage);
  let count = 0;
  let caption = '';
  let width = 0;
  let height = 0;

  const geometry = new THREE.BufferGeometry();
  const bind = () => {
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute('color', new THREE.InterleavedBufferAttribute(buffer, 4, 3));
    geometry.setAttribute('uv', new THREE.InterleavedBufferAttribute(buffer, 2, 7));
  };
  bind();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      // Depth is meaningless in a flat sketch; order is the order of the calls.
      depthTest: false,
      depthWrite: false,
      // For the glyphs' edges, a trail's fade, and anything a chapter adds to the scene
      // to sort against.
      transparent: true,
      // A rect with a negative width faces away; drawn either way, in one pass.
      side: THREE.DoubleSide,
      forceSinglePass: true
    })
  );
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);

  // The atlas doubled mid-frame: what this frame already wrote points at the old layout.
  atlas.onGrow = (factor) => {
    for (let i = 0; i < count; i += 1) {
      const at = i * STRIDE;
      data[at + 7] *= factor;
      data[at + 8] = 1 - (1 - data[at + 8]) * factor;
    }
  };

  const colorOf = (paint: Paint): THREE.Color => {
    let color = colors.get(paint);
    if (!color) {
      if (colors.size >= COLOR_CACHE_LIMIT) colors.clear();
      color = new THREE.Color(paint as never);
      colors.set(paint, color);
    }
    return color;
  };

  /** Room for `vertices` more, doubling the buffer if it must. */
  const reserve = (vertices: number) => {
    const need = (count + vertices) * STRIDE;
    if (need <= data.length) return;
    let size = data.length;
    while (size < need) size *= 2;
    const next = new Float32Array(size);
    next.set(data.subarray(0, count * STRIDE));
    data = next;
    // A bigger array is a new GL buffer. Disposing first gives the old one back; three
    // uploads the geometry again the next time it draws it.
    geometry.dispose();
    buffer = new THREE.InterleavedBuffer(data, STRIDE).setUsage(THREE.DynamicDrawUsage);
    bind();
  };

  const vertex = (x: number, y: number, color: THREE.Color, u: number, v: number, alpha = 1) => {
    const i = count * STRIDE;
    data[i] = x;
    data[i + 1] = y;
    data[i + 2] = 0;
    data[i + 3] = color.r;
    data[i + 4] = color.g;
    data[i + 5] = color.b;
    data[i + 6] = alpha;
    data[i + 7] = u;
    data[i + 8] = v;
    count += 1;
  };

  /** Two triangles over four corners in world space, in order around the quad, solid. */
  const quad = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, color: THREE.Color, alpha = 1) => {
    reserve(6);
    const { u, v } = atlas.solid;
    vertex(ax, ay, color, u, v, alpha);
    vertex(bx, by, color, u, v, alpha);
    vertex(cx, cy, color, u, v, alpha);
    vertex(ax, ay, color, u, v, alpha);
    vertex(cx, cy, color, u, v, alpha);
    vertex(dx, dy, color, u, v, alpha);
  };

  /** Reader y counts down from the top; the camera counts up from the bottom. */
  const worldY = (y: number) => height - y;

  const segment = (x1: number, y1: number, x2: number, y2: number, color: THREE.Color, lineWidth: number, alpha = 1) => {
    const ay = worldY(y1);
    const by = worldY(y2);
    const dx = x2 - x1;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      return;
    }

    // Half the width, perpendicular to the segment.
    const nx = (-dy / length) * (lineWidth / 2);
    const ny = (dx / length) * (lineWidth / 2);
    quad(x1 + nx, ay + ny, x2 + nx, by + ny, x2 - nx, by - ny, x1 - nx, ay - ny, color, alpha);
  };

  /**
   * Arrowhead strokes swept back from `x2, y2`, in pixels; never more than 40% of the
   * arrow. `lineWidth` arrives scaled, and `k` scales the rest of the head with it.
   */
  const head = (x1: number, y1: number, x2: number, y2: number, color: THREE.Color, lineWidth: number, k = 1) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const size = Math.min(4 * k + 2 * lineWidth, 0.4 * Math.hypot(x2 - x1, y2 - y1));
    segment(x2, y2, x2 - size * Math.cos(a - 0.45), y2 - size * Math.sin(a - 0.45), color, lineWidth);
    segment(x2, y2, x2 - size * Math.cos(a + 0.45), y2 - size * Math.sin(a + 0.45), color, lineWidth);
  };

  /** Calls `fn` for each consecutive pair of points, in pixels after `map`. */
  const pairs = (points: Points, toX: (x: number) => number, toY: (y: number) => number, fn: (i: number, n: number, x1: number, y1: number, x2: number, y2: number) => void) => {
    if (points.length > 0 && typeof points[0] === 'number') {
      const flat = points as readonly number[];
      const n = flat.length / 2 - 1;
      for (let i = 0; i < n; i += 1) {
        fn(i, n, toX(flat[2 * i]), toY(flat[2 * i + 1]), toX(flat[2 * i + 2]), toY(flat[2 * i + 3]));
      }
      return;
    }
    const list = points as ReadonlyArray<readonly [number, number]>;
    const n = list.length - 1;
    for (let i = 0; i < n; i += 1) {
      fn(i, n, toX(list[i][0]), toY(list[i][1]), toX(list[i + 1][0]), toY(list[i + 1][1]));
    }
  };

  const same = (v: number) => v;
  const px = (x: number) => width / 2 + (width / 2) * x;
  const py = (y: number) => height / 2 - (width / 2) * y;

  /**
   * Dots along a run of pixel points (reader y, down), spaced evenly over its whole
   * length so an open run starts and ends on a dot. A closed run leaves out the dot
   * that would land back on its start. `fade` gives each dot the alpha of how far
   * along it is, as a trail's line does.
   */
  const dots = (xs: number[], ys: number[], c: THREE.Color, lineWidth: number, closed = false, fade = false) => {
    let total = 0;
    for (let i = 1; i < xs.length; i += 1) total += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    const radius = Math.max(0.75, lineWidth * 0.75);
    if (total === 0) {
      if (xs.length) pixelCircle(xs[0], ys[0], radius, c, 1, DOT_SEGMENTS);
      return;
    }
    // Centre to centre: the gap between two dots is a little wider than a dot.
    const gaps = Math.max(1, Math.round(total / (radius * 5)));
    const step = total / gaps;
    const last = closed ? gaps - 1 : gaps;
    let k = 0, walked = 0;
    for (let i = 1; i < xs.length && k <= last; i += 1) {
      const dx = xs[i] - xs[i - 1], dy = ys[i] - ys[i - 1];
      const length = Math.hypot(dx, dy);
      // The last dot is placed by the loop's end, not by rounding that falls short of it.
      while (k <= last && (k * step <= walked + length + 1e-6 || i === xs.length - 1)) {
        const t = length === 0 ? 0 : Math.min(1, (k * step - walked) / length);
        pixelCircle(xs[i - 1] + dx * t, ys[i - 1] + dy * t, radius, c, fade ? (k + 1) / (last + 1) : 1, DOT_SEGMENTS);
        k += 1;
      }
      walked += length;
    }
  };

  /** Pixel points from a reader's `Points`, mapped by `toX` and `toY`. */
  const mapped = (points: Points, toX: (x: number) => number, toY: (y: number) => number) => {
    const xs: number[] = [], ys: number[] = [];
    const flat = points.length > 0 && typeof points[0] === 'number';
    const n = flat ? points.length / 2 : points.length;
    for (let i = 0; i < n; i += 1) {
      const [x, y] = flat ? [(points as readonly number[])[2 * i], (points as readonly number[])[2 * i + 1]] : (points as ReadonlyArray<readonly [number, number]>)[i];
      xs.push(toX(x));
      ys.push(toY(y));
    }
    return { xs, ys };
  };

  /** What sizes are multiplied by on this panel. */
  const scale = () => width / REFERENCE_WIDTH;

  /**
   * The drawing calls, with positions mapped to pixels by `toX` and `toY`. `scaled`
   * multiplies every size but text by the panel's scale; the pixel face leaves them be.
   */
  const drawIn = (toX: (x: number) => number, toY: (y: number) => number, scaled: boolean): Draw2D => ({
    rect(x1, y1, x2, y2, { color = ACCENT, width = 1.5, dotted = false } = {}) {
      if (dotted) {
        const ax = toX(x1), ay = toY(y1), bx = toX(x2), by = toY(y2);
        dots([ax, bx, bx, ax, ax], [ay, ay, by, by, ay], colorOf(color), width * (scaled ? scale() : 1), true);
        return;
      }
      const ax = toX(x1), ay = worldY(toY(y1)), bx = toX(x2), by = worldY(toY(y2));
      quad(ax, ay, bx, ay, bx, by, ax, by, colorOf(color));
    },
    circle(x, y, radius, { color = ACCENT, width = 1.5, dotted = false } = {}) {
      const k = scaled ? scale() : 1;
      if (dotted) {
        const cx = toX(x), cy = toY(y), xs: number[] = [], ys: number[] = [];
        for (let i = 0; i <= CIRCLE_SEGMENTS * 2; i += 1) {
          const a = (i / (CIRCLE_SEGMENTS * 2)) * Math.PI * 2;
          xs.push(cx + Math.cos(a) * radius * k);
          ys.push(cy + Math.sin(a) * radius * k);
        }
        dots(xs, ys, colorOf(color), width * k, true);
        return;
      }
      pixelCircle(toX(x), toY(y), radius * k, colorOf(color));
    },
    line(x1, y1, x2, y2, { color = ACCENT, width = 1.5, dotted = false } = {}) {
      const lineWidth = width * (scaled ? scale() : 1);
      if (dotted) {
        dots([toX(x1), toX(x2)], [toY(y1), toY(y2)], colorOf(color), lineWidth);
        return;
      }
      segment(toX(x1), toY(y1), toX(x2), toY(y2), colorOf(color), lineWidth);
    },
    arrow(x1, y1, x2, y2, { color = ACCENT, width = 1.5, dotted = false } = {}) {
      const k = scaled ? scale() : 1;
      const c = colorOf(color);
      const ax = toX(x1), ay = toY(y1), bx = toX(x2), by = toY(y2);
      if (dotted) dots([ax, bx], [ay, by], c, width * k);
      else segment(ax, ay, bx, by, c, width * k);
      head(ax, ay, bx, by, c, width * k, k);
    },
    path(points, { color = ACCENT, width = 1.5, dotted = false } = {}) {
      const lineWidth = width * (scaled ? scale() : 1);
      const c = colorOf(color);
      if (dotted) {
        const { xs, ys } = mapped(points, toX, toY);
        dots(xs, ys, c, lineWidth);
        return;
      }
      pairs(points, toX, toY, (_i, _n, ax, ay, bx, by) => segment(ax, ay, bx, by, c, lineWidth));
    },
    trail(source, { color = ACCENT, width = 1.5, fade = true, style = 'line', dotted = false } = {}) {
      const lineWidth = width * (scaled ? scale() : 1);
      const c = colorOf(color);
      const points = 'points' in source ? source.points : source;
      // The fade is transparency, not a mix toward the paper: an old stretch lets
      // whatever is under it show through, another trail included, on any background.
      if (style === 'dots') {
        // One dot per sample, so the gaps between them show how far each step jumped.
        const flat = points.length > 0 && typeof points[0] === 'number';
        const n = flat ? points.length / 2 : points.length;
        for (let i = 0; i < n; i += 1) {
          const [x, y] = flat ? [(points as readonly number[])[2 * i], (points as readonly number[])[2 * i + 1]] : (points as ReadonlyArray<readonly [number, number]>)[i];
          pixelCircle(toX(x), toY(y), lineWidth * 1.5, c, fade ? (i + 1) / n : 1);
        }
        return;
      }
      if (dotted) {
        const { xs, ys } = mapped(points, toX, toY);
        dots(xs, ys, c, lineWidth, false, fade);
        return;
      }
      pairs(points, toX, toY, (i, n, ax, ay, bx, by) => {
        segment(ax, ay, bx, by, c, lineWidth, fade ? (i + 1) / n : 1);
      });
    },
    text(value, x, y, { color = 0x506270, size = 12 } = {}) {
      pixelText(value, toX(x), toY(y), colorOf(color), size);
    }
  });

  /** `segments` divides 32: a dot a pixel or two across needs only a few of them. */
  const pixelCircle = (x: number, y: number, radius: number, c: THREE.Color, alpha = 1, segments = CIRCLE_SEGMENTS) => {
    const cy = worldY(y);
    const stride = CIRCLE_SEGMENTS / segments;
    reserve(segments * 3);
    const { u, v } = atlas.solid;
    for (let i = 0; i < CIRCLE_SEGMENTS; i += stride) {
      vertex(x, cy, c, u, v, alpha);
      vertex(x + CIRCLE_COS[i] * radius, cy + CIRCLE_SIN[i] * radius, c, u, v, alpha);
      vertex(x + CIRCLE_COS[i + stride] * radius, cy + CIRCLE_SIN[i + stride] * radius, c, u, v, alpha);
    }
  };

  const pixelText = (value: string, x: number, y: number, c: THREE.Color, size: number) => {
    if (!value) {
      return;
    }
    const centre = worldY(y);
    let pen = x;
    for (const char of value) {
      const g = atlas.glyph(char, size);
      if (char.trim()) {
        reserve(6);
        const left = pen - g.left;
        const right = left + g.width;
        const top = centre + g.height / 2;
        const bottom = centre - g.height / 2;
        vertex(left, top, c, g.u0, g.v1);
        vertex(right, top, c, g.u1, g.v1);
        vertex(right, bottom, c, g.u1, g.v0);
        vertex(left, top, c, g.u0, g.v1);
        vertex(right, bottom, c, g.u1, g.v0);
        vertex(left, bottom, c, g.u0, g.v0);
      }
      pen += g.advance;
    }
  };

  /** A tick value as a short label: 0.5, -1, 1.25. */
  const tickLabel = (v: number) => String(Math.round(v * 1000) / 1000);

  const api: Sketch2D = {
    ...drawIn(px, py, true),
    pixels: drawIn(same, same, false),
    scene,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get unit() {
      return width / 2;
    },
    get scale() {
      return scale();
    },
    px,
    py,

    axes(ticks = 0.5) {
      const ox = px(0), oy = py(0);
      const xColor = colorOf(theme.red);
      const yColor = colorOf(theme.green);
      // Lines scale like any shape; the labels, being text, do not.
      const s = scale();
      segment(0, oy, width, oy, xColor, 1.5 * s);
      head(0, oy, width, oy, xColor, 1.5 * s, s);
      segment(ox, height, ox, 0, yColor, 1.5 * s);
      head(ox, height, ox, 0, yColor, 1.5 * s, s);
      pixelText('x', width - 12, oy + 14, xColor, 12);
      pixelText('y', ox + 10, 10, yColor, 12);
      if (!(ticks > 0)) return;

      const tick = 4 * s;
      const label = colorOf(theme.muted);
      const reachX = 1, reachY = height / width;
      // From the origin outwards, so a tick lands on 0 whatever the step; the last
      // step before each edge is skipped, where the arrowhead and the name sit.
      for (let k = 1; k * ticks < reachX - ticks / 2; k += 1) {
        for (const v of [k * ticks, -k * ticks]) {
          const x = px(v);
          segment(x, oy - tick, x, oy + tick, xColor, s);
          pixelText(tickLabel(v), x - 6, oy + 14, label, 10);
        }
      }
      for (let k = 1; k * ticks < reachY - ticks / 2; k += 1) {
        for (const v of [k * ticks, -k * ticks]) {
          const y = py(v);
          segment(ox - tick, y, ox + tick, y, yColor, s);
          pixelText(tickLabel(v), ox + 8, y, label, 10);
        }
      }
    },

    caption(value) {
      // Written through only when it changed. This is called from inside a frame, and
      // writing the same string sixty times a second would drop the reader's selection
      // on every one of them.
      if (value === caption) {
        return;
      }

      caption = value;
      setCaption(value);
    }
  };

  return {
    api,

    /** Start a frame: nothing drawn yet. */
    begin(nextWidth: number, nextHeight: number) {
      width = nextWidth;
      height = nextHeight;
      count = 0;
    },

    /**
     * End a frame: upload what was written, and any glyphs rasterised for it.
     * Says whether the frame drew anything at all, through this face.
     */
    end(): boolean {
      geometry.setDrawRange(0, count);
      mesh.visible = count > 0;
      // Only the part this frame wrote goes to the GPU, not the whole buffer.
      buffer.clearUpdateRanges();
      buffer.addUpdateRange(0, count * STRIDE);
      buffer.needsUpdate = true;
      atlas.flush();
      return count > 0;
    },

    /** How many objects this face has put in the scene. */
    objectCount() {
      return 1;
    },

    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      atlas.dispose();
      colors.clear();
    }
  };
}
