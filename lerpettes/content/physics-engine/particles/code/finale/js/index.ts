/// <reference types="vite/client" />
import { createStage } from '@lerpit/framework/chapter';
import { colors } from '@lerpit/framework/theme';
import { readSoftBody, picturePoints, addPicture, corners, type Particle, type Spring, type AngleSpring, type Picture, type SoftBody } from './load';
import STAPLER from '../assets/stapler.txt?raw';
import BOBBLEHEAD from '../assets/bobblehead.txt?raw';

const JELLY_PICTURE = new URL('../assets/jelly.png', import.meta.url).href;
const PLATE_PICTURE = new URL('../assets/plate.png', import.meta.url).href;
const DWIGHT_PICTURE = new URL('../assets/dwight.png', import.meta.url).href;

// What the stage can shake: a body file, the picture stretched over it, and the plate it sits on, if any.
type Thing = { caption: string; body: string; picture: string; plate: string | null };
const THINGS: Record<'jello' | 'bobblehead', Thing> = {
  jello: { caption: 'Dwight\'s favourite dessert.\nDrag the plate.', body: STAPLER, picture: JELLY_PICTURE, plate: PLATE_PICTURE },
  bobblehead: { caption: 'Dwight, with his head on a spring.\nDrag him.', body: BOBBLEHEAD, picture: DWIGHT_PICTURE, plate: null },
};
type ThingName = keyof typeof THINGS;

const ANGLE_K = 0.5; // angle springs' stiffness, as a share of k'
const PLATE = { x: 0, y: -0.154, rx: 0.56, ry: 0.19 }; // the plate at rest, roughly an ellipse

// Until someone grabs the plate, it shakes by itself, and it starts again 10 s after they let go.
const IDLE_SECONDS = 10;
// The shake, as [time, plate x]: push right, hold, push left, hold, back to the middle. Repeats every 1.6 s.
const SHAKE: [number, number][] = [[0, 0], [0.12, 0.13], [0.6, 0.13], [0.75, -0.13], [1.35, -0.13], [1.5, 0], [1.6, 0]];

const shakeX = (t: number) => {
  const time = t % 1.6;
  for (let i = 1; i < SHAKE.length; i++) {
    const [t0, x0] = SHAKE[i - 1], [t1, x1] = SHAKE[i];
    if (time <= t1) return x0 + ((time - t0) / (t1 - t0)) * (x1 - x0);
  }
  return 0;
};

const distance = (a: Particle, b: Particle) => Math.hypot(b.x - a.x, b.y - a.y);

// Whether (x, y) is inside the triangle abc: on the same side of all three edges.
type Point = { x: number; y: number };
const insideTriangle = (x: number, y: number, a: Point, b: Point, c: Point) => {
  const side = (p: Point, q: Point) => Math.sign((q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x));
  return side(a, b) === side(b, c) && side(b, c) === side(c, a);
};

const applySpring = ({ a, b, rest, stiffness }: Spring, k: number, damping: number) => {
  const length = distance(a, b);
  const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
  const stretchSpeed = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
  const f = k * stiffness * (length / rest - 1) + damping * (stretchSpeed / rest);
  a.fx += f * ux; a.fy += f * uy;
  b.fx -= f * ux; b.fy -= f * uy;
};

// The angle at j, from the thread j→i round to the thread j→k.
const angle = (i: Particle, j: Particle, k: Particle) => {
  const ax = i.x - j.x, ay = i.y - j.y;
  const bx = k.x - j.x, by = k.y - j.y;
  return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
};

// Turn i and k back towards the rest angle, pushing each square to its thread, and j the other way.
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
  caption: THINGS.jello.caption,

  state: () => ({
    thing: 'jello' as ThingName,
    k: 750, damping: 13, stepMs: 0.5, showSprings: false,
    bodies: { jello: readSoftBody(THINGS.jello.body), bobblehead: readSoftBody(THINGS.bobblehead.body) } as Record<ThingName, SoftBody>,
    plate: { x: 0, y: 0 },
    dragging: false,
    grip: { x: 0, y: 0 },
    time: 0,
    leftover: 0, // time not yet simulated, less than one step
    lastTouched: -IDLE_SECONDS,
    pictures: null as Record<ThingName, { body: Picture; plate: Picture | null }> | null,
  }),

  setup(s, ctx) {
    // Each body in its file is at rest.
    for (const body of Object.values(s.bodies)) {
      for (const spring of body.springs) spring.rest = distance(spring.a, spring.b);
      for (const corner of body.angles) {
        corner.rest = angle(corner.i, corner.j, corner.k);
        corner.stiffness = ANGLE_K * Math.min(distance(corner.i, corner.j), distance(corner.k, corner.j));
      }
    }

    ctx.controls().addBinding(s, 'thing', {
      label: 'Simulate',
      options: { 'Jello stapler': 'jello', 'Bobblehead': 'bobblehead' },
      pinned: true,
    }).on('change', () => {
      s.plate = { x: 0, y: 0 };
      ctx.caption(THINGS[s.thing].caption);
    });
    ctx.controls().addBinding(s, 'k', { label: 'Spring Constant $k_s$', min: 50, max: 2000, step: 50 });
    ctx.controls().addBinding(s, 'damping', { label: 'Damping Constant $k_d$', min: 0, max: 20, step: 0.5 });
    ctx.controls().addBinding(s, 'showSprings', { label: 'Show Springs' });    ctx.controls().addBinding(s, 'stepMs', { label: 'Step Size $\\Delta t$ (ms)', min: 0.1, max: 2, step: 0.05 });
    ctx.readings().fps();
  },

  // A press on the body or its plate drags the plate.
  grab(s, ctx) {
    const body = s.bodies[s.thing];
    const points = picturePoints(body);
    const { ux: x, uy: y } = ctx.input;
    const onBody = body.triangles.some(([a, b, c]) => insideTriangle(x, y, points[a], points[b], points[c]));
    const px = (x - s.plate.x - PLATE.x) / PLATE.rx, py = (y - s.plate.y - PLATE.y) / PLATE.ry;
    const onPlate = THINGS[s.thing].plate !== null && px * px + py * py < 1;

    s.dragging = onBody || onPlate;
    s.grip = { x: s.plate.x - x, y: s.plate.y - y };
    return s.dragging;
  },

  step(s, dt, ctx) {
    const { particles, springs, angles } = s.bodies[s.thing];

    if (ctx.input.released) s.dragging = false;

    // Every step is the same length of time, whatever the frame rate: a frame adds its time to
    // what is left over, and we take whole steps until less than one step remains.
    const sdt = s.stepMs / 1000;
    s.leftover += dt;
    while (s.leftover >= sdt) {
      s.leftover -= sdt;
      s.time += sdt;

      if (s.dragging) {
        s.plate = { x: ctx.input.ux + s.grip.x, y: ctx.input.uy + s.grip.y };
        s.lastTouched = s.time;
      } else if (s.time - s.lastTouched > IDLE_SECONDS) {
        // Glide towards the shake rather than jump, so the plate eases back from wherever it was left.
        const glide = sdt * 20;
        s.plate.x += (shakeX(s.time - s.lastTouched - IDLE_SECONDS) - s.plate.x) * glide;
        s.plate.y += (0 - s.plate.y) * glide;
      }
      for (const p of particles) {
        if (p.fixed) { p.x = p.x0 + s.plate.x; p.y = p.y0 + s.plate.y; }
      }

      for (const p of particles) { p.fx = 0; p.fy = 0; }
      for (const spring of springs) applySpring(spring, s.k, s.damping);
      for (const corner of angles) applyAngleSpring(corner, s.k);

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
    // Every thing's pictures are made up front; draw shows the one being simulated.
    build(sketch, s) {
      const make = (name: ThingName) => {
        const body = s.bodies[name];
        const plate = THINGS[name].plate;
        return {
          plate: plate ? addPicture(sketch, plate, body.picture, corners(body.picture)) : null,
          body: addPicture(sketch, THINGS[name].picture, body.picture, picturePoints(body), body.triangles),
        };
      };
      s.pictures = { jello: make('jello'), bobblehead: make('bobblehead') };
    },

    draw(sketch, s) {
      for (const name of ['jello', 'bobblehead'] as ThingName[]) {
        const body = s.bodies[name];
        s.pictures?.[name].plate?.draw(sketch, corners(body.picture, s.plate.x, s.plate.y), name === s.thing);
        s.pictures?.[name].body.draw(sketch, picturePoints(body), name === s.thing && !s.showSprings);
      }

      const { particles, springs } = s.bodies[s.thing];
      if (s.showSprings) {
        for (const { a, b } of springs) sketch.line(a.x, a.y, b.x, b.y, { color: colors.slate, width: 1 });
        for (const p of particles) sketch.circle(p.x, p.y, 3, { color: p.fixed ? colors.blue : colors.orange });
      }
    },
  },
});
