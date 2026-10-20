/**
 * A trail: the last `max` positions of something moving, oldest first.
 *
 *   import { Trail } from '@lerpit/framework/trail';
 *
 *   state: { x: 0, y: 0, path: Trail.create(300) },
 *   step(s, dt) { ...; Trail.push(s.path, s.x, s.y); },
 *   viewport2d: { draw(sketch, s) { sketch.trail(s.path, { color: colors.orange }); } }
 *
 * `Trail` is both the type and the functions, so one import covers both.
 *
 * Plain data rather than a class with methods, because the state is copied with
 * structuredClone on every run, and a copy keeps fields but loses methods. So a trail
 * sits in a state declaration like any number would, and restart empties it.
 */
export type Trail = { max: number; points: [number, number][] };

export const Trail = {
  /** An empty trail that keeps up to `max` points. */
  create(max = 300): Trail {
    return { max, points: [] };
  },

  /** Adds a point, dropping the oldest once there are more than `max`. */
  push(t: Trail, x: number, y: number): void {
    t.points.push([x, y]);
    if (t.points.length > t.max) t.points.splice(0, t.points.length - t.max);
  },

  /** Forgets every point, for a jump (a wrap, a reset) the trail should not draw across. */
  clear(t: Trail): void {
    t.points.length = 0;
  }
};
