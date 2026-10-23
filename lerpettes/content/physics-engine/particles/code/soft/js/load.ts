import * as THREE from 'three';
import type { Sketch2D } from '@lerpit/framework/panels/viewport2d/sketch2d';

/*
 * Reading a soft body from a text file, the way an OBJ file is read: one thing per line,
 * a letter saying what it is, then its numbers (see assets/stapler.txt). And drawing a
 * picture on the stage, either whole or stretched over the body's triangles.
 */

export type Particle = { x: number; y: number; vx: number; vy: number; fx: number; fy: number; mass: number; fixed: boolean; x0: number; y0: number };
export type Spring = { a: Particle; b: Particle; rest: number };
/** At particle j, between the threads to i and to k. */
export type AngleSpring = { i: Particle; j: Particle; k: Particle; rest: number; stiffness: number };
export type Box = { left: number; bottom: number; right: number; top: number };
export type SoftBody = { particles: Particle[]; springs: Spring[]; angles: AngleSpring[]; triangles: [number, number, number][]; picture: Box };

/** The body as the file has it. Rest lengths, rest angles and stiffness are left at 0 for the stage to fill in. */
export function readSoftBody(text: string): SoftBody {
  const body: SoftBody = { particles: [], springs: [], angles: [], triangles: [], picture: { left: -1, bottom: -1, right: 1, top: 1 } };
  const p = body.particles;
  for (const line of text.split('\n')) {
    const [kind, ...rest] = line.trim().split(/\s+/);
    const n = rest.map(Number);
    if (kind === 'picture') body.picture = { left: n[0], bottom: n[1], right: n[2], top: n[3] };
    if (kind === 'p' || kind === 'f') p.push({ x: n[0], y: n[1], vx: 0, vy: 0, fx: 0, fy: 0, mass: n[2], fixed: kind === 'f', x0: n[0], y0: n[1] });
    if (kind === 's') body.springs.push({ a: p[n[0]], b: p[n[1]], rest: 0 });
    if (kind === 'a') body.angles.push({ i: p[n[0]], j: p[n[1]], k: p[n[2]], rest: 0, stiffness: 0 });
    if (kind === 't') body.triangles.push([n[0], n[1], n[2]]);
  }
  return body;
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
