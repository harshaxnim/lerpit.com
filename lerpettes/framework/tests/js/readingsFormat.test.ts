import { describe, expect, it } from 'vitest';
import { formatReading, fraction, graphRange, vectorComponents } from '@lerpit/framework/monitors/format';

const FIGURE_SPACE = ' ';
const MINUS = '−';

describe('formatReading', () => {
  it('keeps a fixed number of digits and a sign slot, so values never shift sideways', () => {
    expect(formatReading(1.5)).toBe(`${FIGURE_SPACE}1.50`);
    expect(formatReading(-1.5)).toBe(`${MINUS}1.50`);
    expect(formatReading(1.5).length).toBe(formatReading(-1.5).length);
  });

  it('honours digits, including counts at zero', () => {
    expect(formatReading(58, 0)).toBe(`${FIGURE_SPACE}58`);
    expect(formatReading(3.14159, 3)).toBe(`${FIGURE_SPACE}3.142`);
  });

  it('shows a dash for anything that is not a finite number', () => {
    for (const value of [NaN, Infinity, -Infinity, undefined, null, '3', {}]) {
      expect(formatReading(value)).toBe('—');
    }
  });

  it('switches to exponent form for very large and very small values', () => {
    expect(formatReading(1234567, 1)).toBe(`${FIGURE_SPACE}1.2e6`);
    expect(formatReading(-0.000042)).toBe(`${MINUS}4.20e${MINUS}5`);
  });

  it('leaves zero alone', () => {
    expect(formatReading(0)).toBe(`${FIGURE_SPACE}0.00`);
  });
});

describe('vectorComponents', () => {
  it('reads arrays, typed arrays and {x, y, z}', () => {
    expect(vectorComponents([1, 2, 3])).toEqual([1, 2, 3]);
    expect(vectorComponents(new Float32Array([1, 2, 3]))).toEqual([1, 2, 3]);
    expect(vectorComponents({ x: 1, y: 2, z: 3 })).toEqual([1, 2, 3]);
  });

  it('fills what is missing with NaN, which reads as a dash', () => {
    expect(vectorComponents([1, 2])).toEqual([1, 2, NaN]);
    expect(vectorComponents(null)).toEqual([NaN, NaN, NaN]);
  });
});

describe('graphRange', () => {
  it('keeps both ends when the author fixed them', () => {
    expect(graphRange([5, 500], 0, 250)).toEqual([0, 250]);
  });

  it('pads an open range around the data', () => {
    const [low, high] = graphRange([10, 20]);
    expect(low).toBeLessThan(10);
    expect(high).toBeGreaterThan(20);
  });

  it('keeps a fixed end and lets the other follow', () => {
    const [low, high] = graphRange([10, 20], 0);
    expect(low).toBe(0);
    expect(high).toBeGreaterThan(20);
  });

  it('gives a constant value a band rather than a flat line on the floor', () => {
    const [low, high] = graphRange([2, 2, 2]);
    expect(low).toBeLessThan(2);
    expect(high).toBeGreaterThan(2);
  });

  it('ignores non-finite samples and survives having none', () => {
    expect(graphRange([NaN, Infinity])).toEqual([0, 1]);
  });
});

describe('fraction', () => {
  it('clamps to [0, 1] and reads NaN as empty', () => {
    expect(fraction(0.5, 0, 1)).toBe(0.5);
    expect(fraction(2, 0, 1)).toBe(1);
    expect(fraction(-1, 0, 1)).toBe(0);
    expect(fraction(NaN, 0, 1)).toBe(0);
    expect(fraction(1, 1, 1)).toBe(0);
  });
});
