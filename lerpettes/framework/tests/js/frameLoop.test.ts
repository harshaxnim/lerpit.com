import { describe, expect, it } from 'vitest';
import { clampDelta, isDrawable, measure, MAX_FRAME_SECONDS, MAX_PIXEL_RATIO } from '../../runtimes/frameLoop';

/**
 * The loop itself is DOM, but the four decisions it exists to settle are arithmetic.
 * They are the ones that were previously made differently in four places, so they are
 * the ones worth pinning down.
 */
describe('measure', () => {
  it('caps the pixel ratio, which is what the 2D sketch got right and the rest did not', () => {
    expect(measure(100, 50, 3).dpr).toBe(MAX_PIXEL_RATIO);
    expect(measure(100, 50, 2).dpr).toBe(2);
    expect(measure(100, 50, 1.5).dpr).toBe(1.5);
  });

  it('never reports a ratio below 1, whatever the browser claims', () => {
    expect(measure(100, 50, 0).dpr).toBe(1);
    expect(measure(100, 50, Number.NaN).dpr).toBe(1);
    expect(measure(100, 50, 0.5).dpr).toBe(1);
  });

  it('never reports a negative size', () => {
    expect(measure(-10, -4, 1)).toMatchObject({ width: 0, height: 0 });
  });

  it('passes ordinary sizes through', () => {
    expect(measure(736, 420, 2)).toEqual({ width: 736, height: 420, dpr: 2 });
  });
});

describe('clampDelta', () => {
  it('converts to seconds', () => {
    expect(clampDelta(16)).toBeCloseTo(0.016, 5);
  });

  it('caps a long gap, so a backgrounded tab does not integrate one enormous step', () => {
    expect(clampDelta(5000)).toBe(MAX_FRAME_SECONDS);
    expect(clampDelta(34)).toBe(MAX_FRAME_SECONDS);
  });

  it('treats a non-advancing clock as no time passing rather than as a negative step', () => {
    expect(clampDelta(0)).toBe(0);
    expect(clampDelta(-16)).toBe(0);
    expect(clampDelta(Number.NaN)).toBe(0);
    expect(clampDelta(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('isDrawable', () => {
  it('is false for a collapsed panel, which is what a closed drawer looks like', () => {
    expect(isDrawable({ width: 0, height: 400, dpr: 2 })).toBe(false);
    expect(isDrawable({ width: 400, height: 0, dpr: 2 })).toBe(false);
  });

  it('is true once the panel has both dimensions', () => {
    expect(isDrawable({ width: 1, height: 1, dpr: 1 })).toBe(true);
  });
});
