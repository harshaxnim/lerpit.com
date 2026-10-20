/**
 * Linear algebra: dense matrices and their decompositions, from ml-matrix.
 *
 *   import { Matrix, solve, EigenvalueDecomposition } from '@lerpit/framework/linalg';
 *
 *   const A = new Matrix([[4, 1], [1, 3]]);
 *   const x = solve(A, Matrix.columnVector([1, 2]));     // A x = b
 *   const { realEigenvalues, eigenvectorMatrix } = new EigenvalueDecomposition(A);
 *   A.mmul(B); A.transpose(); A.get(i, j); A.to2DArray();
 *
 * Its own module, apart from `math`, because ml-matrix is one ~150 KB CommonJS file the
 * bundler cannot trim: a chapter that only wants `clamp` should not download it.
 *
 * Every operation allocates a new Matrix. That is fine for setting a system up or a
 * few solves a frame; a hot inner loop over thousands of particles wants plain numbers
 * (or C++, see docs/authoring.md).
 */
export {
  Matrix,
  solve,
  inverse,
  determinant,
  pseudoInverse,
  LuDecomposition,
  QrDecomposition,
  CholeskyDecomposition,
  EigenvalueDecomposition,
  SingularValueDecomposition
} from 'ml-matrix';
