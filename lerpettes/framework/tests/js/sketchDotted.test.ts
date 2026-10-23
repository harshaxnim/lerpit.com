import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// The atlas rasterises glyphs on a canvas, which tests run without; shapes only need its
// plain white patch.
vi.mock('../../panels/viewport2d/glyphAtlas', () => ({
  createGlyphAtlas: () => ({
    texture: new THREE.Texture(),
    solid: { u: 0, v: 0 },
    glyph: () => ({ u0: 0, v0: 0, u1: 0, v1: 0, width: 0, height: 0, advance: 0, left: 0 }),
    onGrow: null,
    flush() {},
    dispose() {}
  })
}));

const { createSketch2D } = await import('../../panels/viewport2d/sketch2d');

const W = 200;
const H = 100;
const DOT = 8 * 3;

/** Draws one frame and returns the dots it wrote: centre (reader pixels, y down) and alpha. */
function frame(draw: (sketch: ReturnType<typeof createSketch2D>['api']) => void, width = W) {
  const scene = new THREE.Scene();
  const sketch = createSketch2D(scene, () => {});
  sketch.begin(width, H);
  draw(sketch.api);
  sketch.end();
  const geometry = (scene.children[0] as THREE.Mesh).geometry;
  const position = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  const count = geometry.drawRange.count;
  return { count, position, color };
}

function dotsOf(f: ReturnType<typeof frame>) {
  const out: { x: number; y: number; a: number }[] = [];
  for (let i = 0; i < f.count; i += DOT) out.push({ x: f.position.getX(i), y: H - f.position.getY(i), a: f.color.getW(i) });
  return out;
}

describe('sketch, dotted: true', () => {
  it('draws a line as evenly spaced dots that start and end on its ends', () => {
    const f = frame((s) => s.pixels.line(0, 10, 100, 10, { width: 1, dotted: true }));
    expect(f.count % DOT).toBe(0);
    const d = dotsOf(f);
    expect(d.length).toBeGreaterThan(10);
    expect(d[0].x).toBeCloseTo(0);
    expect(d.at(-1)!.x).toBeCloseTo(100);
    const gaps = d.slice(1).map((p, i) => p.x - d[i].x);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]);
    expect(d.every((p) => p.y === 10)).toBe(true);
  });

  it('maps units the same way the solid calls do', () => {
    const f = frame((s) => s.line(-1, 0, 1, 0, { width: 1, dotted: true }));
    const d = dotsOf(f);
    expect(d[0].x).toBeCloseTo(0);
    expect(d.at(-1)!.x).toBeCloseTo(W);
    expect(d[0].y).toBeCloseTo(H / 2);
  });

  it('keeps one spacing across the corners of a path', () => {
    const d = dotsOf(frame((s) => s.pixels.path([[0, 0], [30, 0], [30, 30]], { width: 1, dotted: true })));
    const gaps = d.slice(1).map((p, i) => Math.hypot(p.x - d[i].x, p.y - d[i].y));
    // A gap that turns the corner is a chord, a little shorter than the walked step.
    const step = Math.max(...gaps);
    for (const g of gaps) expect(g).toBeGreaterThan(step * 0.7);
    expect(d.at(-1)).toMatchObject({ x: 30, y: 30 });
  });

  it('closes a rect and a circle without a doubled dot', () => {
    const rect = dotsOf(frame((s) => s.pixels.rect(10, 10, 60, 40, { dotted: true })));
    const first = rect[0], last = rect.at(-1)!;
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeGreaterThan(1);
    const circle = dotsOf(frame((s) => s.pixels.circle(100, 50, 20, { dotted: true })));
    for (const p of circle) expect(Math.hypot(p.x - 100, p.y - 50)).toBeCloseTo(20, 0);
    const c0 = circle[0], cn = circle.at(-1)!;
    expect(Math.hypot(c0.x - cn.x, c0.y - cn.y)).toBeGreaterThan(1);
  });

  it('fades a dotted trail from its oldest dot to its newest', () => {
    const d = dotsOf(frame((s) => s.pixels.trail([[0, 0], [50, 0], [100, 0]], { width: 1, dotted: true })));
    for (let i = 1; i < d.length; i += 1) expect(d[i].a).toBeGreaterThan(d[i - 1].a);
    expect(d.at(-1)!.a).toBe(1);
    const solid = dotsOf(frame((s) => s.pixels.trail([[0, 0], [100, 0]], { width: 1, fade: false, dotted: true })));
    expect(solid.every((p) => p.a === 1)).toBe(true);
  });

  it('keeps an arrow’s head solid', () => {
    const plain = frame((s) => s.pixels.line(0, 0, 100, 0, { width: 1, dotted: true })).count;
    const arrow = frame((s) => s.pixels.arrow(0, 0, 100, 0, { width: 1, dotted: true })).count;
    // Two strokes of two triangles each.
    expect(arrow - plain).toBe(12);
  });

  it('leaves the solid calls as they were', () => {
    expect(frame((s) => s.pixels.line(0, 0, 100, 0)).count).toBe(6);
    expect(frame((s) => s.circle(0, 0, 5)).count).toBe(32 * 3);
  });

  it('reads colour and width from the options', () => {
    const f = frame((s) => s.pixels.line(0, 50, 100, 50, { color: 0xff0000, width: 10 }));
    expect([f.color.getX(0), f.color.getY(0), f.color.getZ(0)]).toEqual([1, 0, 0]);
    const ys = Array.from({ length: 6 }, (_, i) => f.position.getY(i));
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10);
  });
});

describe('sizes scale with the panel', () => {
  /** How far the first circle written reaches from its centre, in pixels. */
  const reach = (f: ReturnType<typeof frame>) => Math.abs(f.position.getX(1) - f.position.getX(0));

  it('draws a size at its own pixels on a 600px panel, and in proportion on others', () => {
    expect(reach(frame((s) => s.circle(0, 0, 10), 600))).toBeCloseTo(10);
    expect(reach(frame((s) => s.circle(0, 0, 10), 300))).toBeCloseTo(5);
    expect(reach(frame((s) => s.circle(0, 0, 10), 1200))).toBeCloseTo(20);
  });

  it('keeps a shape the same size in units at every width', () => {
    const units = (w: number) => reach(frame((s) => s.circle(0, 0, 10), w)) / (w / 2);
    expect(units(356)).toBeCloseTo(units(597));
  });

  it('scales line widths, and says by how much', () => {
    const thickness = (w: number) => {
      const f = frame((s) => s.line(-1, 0, 1, 0, { width: 4 }), w);
      const ys = Array.from({ length: 6 }, (_, i) => f.position.getY(i));
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(thickness(600)).toBeCloseTo(4);
    expect(thickness(300)).toBeCloseTo(2);
    const scene = new THREE.Scene();
    const sketch = createSketch2D(scene, () => {});
    sketch.begin(300, H);
    expect(sketch.api.scale).toBeCloseTo(0.5);
  });

  it('leaves the pixel face in plain pixels', () => {
    expect(reach(frame((s) => s.pixels.circle(50, 50, 10), 300))).toBeCloseTo(10);
  });
});
