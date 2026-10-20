import { describe, expect, it } from 'vitest';
import { EigenvalueDecomposition, Matrix, SingularValueDecomposition, determinant, solve } from '../../linalg';

describe('linalg', () => {
  const A = new Matrix([[4, 1], [1, 3]]);

  it('solves a system', () => {
    const x = solve(A, Matrix.columnVector([1, 2]));
    expect(A.mmul(x).to1DArray().map((v) => +v.toFixed(10))).toEqual([1, 2]);
  });

  it('decomposes', () => {
    expect(determinant(A)).toBeCloseTo(11);
    const values = [...new EigenvalueDecomposition(A).realEigenvalues].sort((a, b) => a - b);
    expect(values[0]).toBeCloseTo((7 - Math.sqrt(5)) / 2);
    expect(values[1]).toBeCloseTo((7 + Math.sqrt(5)) / 2);
    expect(new SingularValueDecomposition(A).diagonal[0]).toBeCloseTo((7 + Math.sqrt(5)) / 2);
  });
});
