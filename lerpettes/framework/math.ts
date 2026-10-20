/** The scalar helpers every simulation ends up writing for itself. */

/** `v` held inside `[min, max]`. */
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** From `a` at `t = 0` to `b` at `t = 1`. */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * `v` folded back into `[-r, r)`, as if the range were a loop: going past one end comes
 * back in at the other, by however far it overshot. For things that leave the screen
 * and reappear on the opposite side.
 *
 *   wrap(1.25, 1)  // -0.75: 0.25 past the right edge, so 0.25 in from the left
 *   wrap(-1.25, 1) //  0.75
 *   wrap(3.5, 1)   // -0.5: any number of laps, not just one
 *   wrap(0.5, 1)   //  0.5: inside already, unchanged
 *
 * A plain `%` is not enough: in JavaScript `-1.25 % 2` is `-1.25`, not `0.75`, so the
 * modulo is taken twice to land negative numbers in range too. A value already in range
 * comes back exactly as it was, not off by rounding, so `wrap(v, r) !== v` is a reliable
 * test for "it went off the edge".
 */
export const wrap = (v: number, r: number) =>
  v >= -r && v < r ? v : ((((v + r) % (2 * r)) + 2 * r) % (2 * r)) - r;
