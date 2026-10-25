import * as THREE from 'three';
import type { Sketch2D } from '@lerpit/framework/panels/viewport2d/sketch2d';

/*
 * Reading a soft body from a text file, the way an OBJ file is read: one thing per line,
 * a letter saying what it is, then its numbers (see assets/stapler.txt). And drawing a
 * picture on the stage, either whole or stretched over the body's triangles.
 */

export type Particle = { x: number; y: number; vx: number; vy: number; fx: number; fy: number; mass: number; fixed: boolean; x0: number; y0: number };
/** `stiffness` is the spring's share of k′: 1 unless the file gives another. */
export type Spring = { a: Particle; b: Particle; rest: number; stiffness: number };
/** An angle spring at `j`, keeping the angle between the threads j→i and j→k. */
export type AngleSpring = { i: Particle; j: Particle; k: Particle; rest: number; stiffness: number };
export type Box = { left: number; bottom: number; right: number; top: number };
/**
 * A corner of the picture that is not a particle. It is carried by
 * - one particle: it keeps its offset (`dx`, `dy`) from it;
 * - two: it moves and turns with the line between them but keeps its size, so a face does
 *   not grow or shrink as the spring between them stretches. `along` and `up` are distances
 *   from the line's middle, along the line and square to it;
 * - three: it keeps its place relative to their triangle, even outside it, stretching with
 *   it: `along` of the way from `by[0]` towards `by[1]`, plus `up` of the way towards `by[2]`.
 */
export type PicturePoint = { by: Particle[]; dx: number; dy: number; along: number; up: number };
export type SoftBody = { particles: Particle[]; springs: Spring[]; angles: AngleSpring[]; points: PicturePoint[]; triangles: [number, number, number][]; picture: Box };

/** The body as the file has it. Rest lengths, rest angles and angle stiffness are left at 0 for the stage to fill in. */
export function readSoftBody(text: string): SoftBody {
  const body: SoftBody = { particles: [], springs: [], angles: [], points: [], triangles: [], picture: { left: -1, bottom: -1, right: 1, top: 1 } };
  const p = body.particles;
  for (const line of text.split('\n')) {
    const [kind, ...rest] = line.trim().split(/\s+/);
    const n = rest.map(Number);
    if (kind === 'picture') body.picture = { left: n[0], bottom: n[1], right: n[2], top: n[3] };
    if (kind === 'p' || kind === 'f') p.push({ x: n[0], y: n[1], vx: 0, vy: 0, fx: 0, fy: 0, mass: n[2], fixed: kind === 'f', x0: n[0], y0: n[1] });
    if (kind === 's') body.springs.push({ a: p[n[0]], b: p[n[1]], rest: 0, stiffness: n.length > 2 ? n[2] : 1 });
    if (kind === 'a') body.angles.push({ i: p[n[0]], j: p[n[1]], k: p[n[2]], rest: 0, stiffness: 0 });
    if (kind === 'v')body.points.push(pictureAt(n[0], n[1], n.slice(2).map((i) => p[i])));
    if (kind === 't') body.triangles.push([n[0], n[1], n[2]]);
  }
  return body;
}

function pictureAt(x: number, y: number, by: Particle[]): PicturePoint {
  const [a, b, c] = by;
  if (!b) return { by, dx: x - a.x, dy: y - a.y, along: 0, up: 0 };
  if (!c) {
    const { ux, uy, mx, my } = lineAt(a, b);
    return { by, dx: 0, dy: 0, along: (x - mx) * ux + (y - my) * uy, up: (y - my) * ux - (x - mx) * uy };
  }
  const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - a.x, vy = c.y - a.y;
  const det = ux * vy - uy * vx;
  return { by, dx: 0, dy: 0, along: ((x - a.x) * vy - (y - a.y) * vx) / det, up: (ux * (y - a.y) - uy * (x - a.x)) / det };
}

/** The line from a to b: its middle, and which way it points (one unit long). */
function lineAt(a: Particle, b: Particle) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return { ux: (b.x - a.x) / length, uy: (b.y - a.y) / length, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}

/** Where the picture's corners are now: every particle, then every picture point. Triangles count them in that order. */
export function picturePoints({ particles, points }: SoftBody): { x: number; y: number }[] {
  return [
    ...particles,
    ...points.map(({ by: [a, b, c], dx, dy, along, up }) => {
      if (!b) return { x: a.x + dx, y: a.y + dy };
      if (!c) {
        const { ux, uy, mx, my } = lineAt(a, b);
        return { x: mx + along * ux - up * uy, y: my + along * uy + up * ux };
      }
      return { x: a.x + along * (b.x - a.x) + up * (c.x - a.x), y: a.y + along * (b.y - a.y) + up * (c.y - a.y) };
    }),
  ];
}

/** A picture in the scene, moved (or hidden) by `draw` each frame. */
export type Picture = { draw(sketch: Sketch2D, points: { x: number; y: number }[], visible?: boolean): void };

/**
 * The picture at `url`, filling `box`, stretched over `triangles` of `points` (where they
 * are now is where the picture's pixels go). Without triangles, it is the box itself, and
 * `points` are its four corners, moved however the caller likes.
 */
export function addPicture(sketch: Sketch2D, url: string, box: Box, points: { x: number; y: number }[], triangles: [number, number, number][] = [[0, 1, 2], [0, 2, 3]]): Picture {
  const uv = points.flatMap((q) => [(q.x - box.left) / (box.right - box.left), (q.y - box.bottom) / (box.top - box.bottom)]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points.length * 3), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(triangles.flat());
  const material = new THREE.MeshBasicMaterial({ map: texture(url), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  sketch.scene.add(mesh);
  return {
    draw(sketch, points, visible = true) {
      mesh.visible = visible;
      // Units to the scene's pixels: the origin mid-panel, y up, half the width per unit.
      mesh.position.set(sketch.width / 2, sketch.height / 2, 0);
      mesh.scale.set(sketch.unit, sketch.unit, 1);
      const at = geometry.getAttribute('position') as THREE.BufferAttribute;
      points.forEach((q, i) => at.setXY(i, q.x, q.y));
      at.needsUpdate = true;
    },
  };
}

/** The four corners of a box, in the order `addPicture` takes them. */
export function corners({ left, bottom, right, top }: Box, dx = 0, dy = 0) {
  return [{ x: left + dx, y: bottom + dy }, { x: right + dx, y: bottom + dy }, { x: right + dx, y: top + dy }, { x: left + dx, y: top + dy }];
}

// Each picture is loaded once per page and kept, so restarting the stage reloads nothing.
const textures = new Map<string, THREE.Texture>();
function texture(url: string) {
  if (!textures.has(url)) {
    const map = new THREE.TextureLoader().load(url);
    map.colorSpace = THREE.SRGBColorSpace;
    textures.set(url, map);
  }
  return textures.get(url)!;
}
