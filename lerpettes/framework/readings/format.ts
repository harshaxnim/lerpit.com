/*
 * The arithmetic behind the readings, kept apart from the DOM so it can be tested
 * without one.
 */

/** A figure space: as wide as a digit, so a sign slot holds its width with no sign in it. */
const FIGURE_SPACE = ' ';
const MINUS = '−';

/**
 * A number as a reading shows it: a fixed count of digits, so a changing value never
 * shifts sideways, and a sign slot that is always there, for the same reason. Values
 * too large or too small for that switch to exponent form. Anything that is not a
 * finite number is a dash, never "NaN".
 *
 * `round: true` keeps small values in fixed form, rounded to zero, for a value that
 * swings through zero (a graph's): exponent form there would flick in and out, and
 * change width, on every crossing.
 */
export function formatReading(value: unknown, digits = 2, { round = false } = {}): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }

  const magnitude = Math.abs(value);
  // A value that shows as zero gets no minus sign: "−0.0" reads as a different number.
  const sign = value < 0 && !(round && Number(magnitude.toFixed(digits)) === 0) ? MINUS : FIGURE_SPACE;
  if (magnitude !== 0 && (magnitude >= 1e5 || (!round && magnitude < 10 ** -Math.max(digits, 3)))) {
    return sign + magnitude.toExponential(Math.max(digits, 1)).replace('e+', 'e').replace('e-', `e${MINUS}`);
  }

  return sign + magnitude.toFixed(digits);
}

/** [x, y, z] or {x, y, z}, as three numbers. Missing components are NaN, so they read as dashes. */
export function vectorComponents(value: unknown): [number, number, number] {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const list = value as ArrayLike<number>;
    return [list[0] ?? NaN, list[1] ?? NaN, list[2] ?? NaN];
  }

  if (value && typeof value === 'object') {
    const v = value as { x?: number; y?: number; z?: number };
    return [v.x ?? NaN, v.y ?? NaN, v.z ?? NaN];
  }

  return [NaN, NaN, NaN];
}

/**
 * The vertical range a graph draws over. Either end the author fixed is kept; an end
 * left open follows the samples, padded so the line never sits on the frame. A
 * constant value gets a band around it rather than collapsing to a flat line on the
 * floor.
 */
export function graphRange(values: number[], min?: number, max?: number, keepInView: number[] = []): [number, number] {
  if (min != null && max != null) {
    return [min, max];
  }

  // `keepInView` values count as data: the range always reaches them but still grows to
  // fit, unlike `min` and `max`, which are hard edges that cut off what lies beyond.
  const finite = [...values, ...keepInView].filter(Number.isFinite);
  if (finite.length === 0) {
    return [min ?? 0, max ?? 1];
  }

  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const pad = (high - low) * 0.1 || Math.abs(low) * 0.1 || 1;
  return [min ?? low - pad, max ?? high + pad];
}

/** Where a value sits between two bounds, clamped to [0, 1]. NaN reads as empty. */
export function fraction(value: number, min: number, max: number): number {
  const f = (value - min) / (max - min);
  return Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : 0;
}
