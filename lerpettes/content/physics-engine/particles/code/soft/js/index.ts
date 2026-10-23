/// <reference types="vite/client" />
import { createStage } from '@lerpit/framework/chapter';
import { colors } from '@lerpit/framework/theme';
import { readSoftBody, addPicture, corners, type Particle, type Spring, type AngleSpring, type Picture } from './load';
import STAPLER from '../assets/stapler.txt?raw';

const JELLY_PICTURE = new URL('../assets/jelly.png', import.meta.url).href;
const PLATE_PICTURE = new URL('../assets/plate.png', import.meta.url).href;

const ANGLE_K = 0.5; // angle springs' stiffness, as a share of k
const PLATE = { x: 0, y: -0.154, rx: 0.56, ry: 0.19 }; // the plate at rest, roughly an ellipse

const distance = (a: Particle, b: Particle) => Math.hypot(b.x - a.x, b.y - a.y);

// Whether (x, y) is inside the triangle abc: on the same side of all three edges.
const insideTriangle = (x: number, y: number, a: Particle, b: Particle, c: Particle) => {
  const side = (p: Particle, q: Particle) => Math.sign((q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x));
  return side(a, b) === side(b, c) && side(b, c) === side(c, a);
};

// The angle at j, from the thread j→i round to the thread j→k.
const angle = (i: Particle, j: Particle, k: Particle) => {
  const ax = i.x - j.x, ay = i.y - j.y;
  const bx = k.x - j.x, by = k.y - j.y;
  return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
};

const applySpring = ({ a, b, rest }: Spring, k: number, damping: number) => {
  const length = distance(a, b);
  const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
  const stretchSpeed = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
  const f = k * (length - rest) + damping * stretchSpeed;
  a.fx += f * ux; a.fy += f * uy;
  b.fx -= f * ux; b.fy -= f * uy;
};

const applyAngleSpring = ({ i, j, k, rest, stiffness }: AngleSpring, springK: number) => {
  const change = angle(i, j, k) - rest;
  const bend = Math.atan2(Math.sin(change), Math.cos(change));
  const torque = springK * stiffness * bend;
  const ax = i.x - j.x, ay = i.y - j.y, la2 = ax * ax + ay * ay;
  const bx = k.x - j.x, by = k.y - j.y, lb2 = bx * bx + by * by;
  const fix = (-ay * torque) / la2, fiy = (ax * torque) / la2;
  const fkx = (by * torque) / lb2, fky = (-bx * torque) / lb2;
  i.fx += fix; i.fy += fiy;
  k.fx += fkx; k.fy += fky;
  j.fx -= fix + fkx; j.fy -= fiy + fky;
};

export default createStage({
  caption: 'A stapler set in jelly\nDrag the plate, or pull the jelly.',

  state: () => ({
    k: 4000, damping: 40, substeps: 8, web: false,
    body: readSoftBody(STAPLER),
    plate: { x: 0, y: 0 },
    held: null as Particle | null,
    draggingPlate: false,
    grip: { x: 0, y: 0 },
    pictures: null as { jelly: Picture; plate: Picture } | null,
  }),

  setup(s, ctx) {
    // The jelly in the file is at rest.
    for (const spring of s.body.springs) spring.rest = distance(spring.a, spring.b);
    for (const corner of s.body.angles) {
      corner.rest = angle(corner.i, corner.j, corner.k);
      corner.stiffness = ANGLE_K * Math.min(distance(corner.i, corner.j), distance(corner.k, corner.j)) ** 2;
    }

    ctx.controls().addBinding(s, 'k', { label: 'k', min: 200, max: 4000, step: 50 });
    ctx.controls().addBinding(s, 'damping', { label: 'Damping', min: 0, max: 40, step: 1 });
    ctx.controls().addBinding(s, 'web', { label: 'Show the web' });
    ctx.controls().addBinding(s, 'substeps', { label: 'Sub-steps', min: 1, max: 50, step: 1 });
    ctx.readings().fps();
  },

  // A press on the jelly pulls its nearest particle; a press on the plate drags the plate.
  grab(s, ctx) {
    const { particles, triangles } = s.body;
    const { ux: x, uy: y } = ctx.input;
    const onJelly = triangles.some(([a, b, c]) => insideTriangle(x, y, particles[a], particles[b], particles[c]));
    const px = (x - s.plate.x - PLATE.x) / PLATE.rx, py = (y - s.plate.y - PLATE.y) / PLATE.ry;
    const onPlate = px * px + py * py < 1;

    s.held = null;
    if (onJelly) {
      let nearest = Infinity;
      for (const p of particles) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (!p.fixed && d < nearest) { nearest = d; s.held = p; }
      }
    }
    s.draggingPlate = !s.held && onPlate;
    const grabbed = s.held ?? s.plate;
    s.grip = { x: grabbed.x - x, y: grabbed.y - y };
    return s.held !== null || s.draggingPlate;
  },

  step(s, dt, ctx) {
    const { particles, springs, angles } = s.body;

    const { ux: x, uy: y } = ctx.input;
    if (ctx.input.released) { s.held = null; s.draggingPlate = false; }

    if (s.draggingPlate) s.plate = { x: x + s.grip.x, y: y + s.grip.y };
    for (const p of particles) {
      if (p.fixed) { p.x = p.x0 + s.plate.x; p.y = p.y0 + s.plate.y; }
    }

    const sdt = dt / s.substeps;
    for (let n = 0; n < s.substeps; n++) {
      for (const p of particles) { p.fx = 0; p.fy = 0; }
      for (const spring of springs) applySpring(spring, s.k, s.damping);
      for (const corner of angles) applyAngleSpring(corner, s.k);
      if (s.held) {
        s.held.fx += s.k * (x + s.grip.x - s.held.x) - s.damping * s.held.vx;
        s.held.fy += s.k * (y + s.grip.y - s.held.y) - s.damping * s.held.vy;
      }

      for (const p of particles) {
        if (p.fixed) continue;
        p.vx += (p.fx / p.mass) * sdt;
        p.vy += (p.fy / p.mass) * sdt;
        p.x += p.vx * sdt;
        p.y += p.vy * sdt;
      }
    }
  },

  viewport2d: {
    build(sketch, s) {
      const box = s.body.picture;
      s.pictures = {
        plate: addPicture(sketch, PLATE_PICTURE, box, corners(box)),
        jelly: addPicture(sketch, JELLY_PICTURE, box, s.body.particles, s.body.triangles),
      };
    },

    draw(sketch, s) {
      const { particles, springs, picture } = s.body;
      s.pictures?.plate.draw(sketch, corners(picture, s.plate.x, s.plate.y));
      s.pictures?.jelly.draw(sketch, particles, !s.web);

      if (s.web) {
        for (const { a, b } of springs) sketch.line(a.x, a.y, b.x, b.y, { color: colors.slate, width: 1 });
        for (const p of particles) sketch.circle(p.x, p.y, 3, { color: p.fixed ? colors.blue : colors.orange });
      }
    },
  },
});
