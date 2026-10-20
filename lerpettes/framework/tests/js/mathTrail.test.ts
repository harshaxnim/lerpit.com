import { describe, expect, it } from 'vitest';
import { clamp, lerp, wrap } from '../../math';
import { Trail } from '../../trail';

describe('math helpers', () => {
  it('clamps, lerps and wraps', () => {
    expect(clamp(5, -1, 1)).toBe(1);
    expect(clamp(-5, -1, 1)).toBe(-1);
    expect(lerp(2, 4, 0.5)).toBe(3);
    expect(wrap(1.25, 1)).toBeCloseTo(-0.75);
    expect(wrap(-1.25, 1)).toBeCloseTo(0.75);
    expect(wrap(0.5, 1)).toBeCloseTo(0.5);
    // In range: exactly unchanged, so `!==` detects a wrap.
    expect(wrap(0.1 + 0.2, 1.7)).toBe(0.1 + 0.2);
  });
});

describe('Trail', () => {
  it('keeps the newest max points, oldest first', () => {
    const t = Trail.create(3);
    for (let i = 0; i < 5; i += 1) Trail.push(t, i, -i);
    expect(t.points).toEqual([[2, -2], [3, -3], [4, -4]]);
    Trail.clear(t);
    expect(t.points).toEqual([]);
  });

  it('survives the copy every run makes of the state', () => {
    const copy = structuredClone({ path: Trail.create(2) }).path;
    Trail.push(copy, 1, 1);
    expect(copy).toEqual({ max: 2, points: [[1, 1]] });
  });
});
