import type { MathJson } from '../ir';

export const isArr = (v: MathJson | undefined): v is MathJson[] => Array.isArray(v);
export const isStr = (v: MathJson | undefined): v is string => typeof v === 'string';
export const headOf = (v: MathJson | undefined): string | undefined =>
  isArr(v) && isStr(v[0]) ? v[0] : undefined;
export const isHead = (v: MathJson | undefined, h: string): v is MathJson[] =>
  headOf(v) === h;

// The matrix-valued walk shared by emission and the matrixNames
// pre-scan: a `Matrix` literal or a `isMatrixLeaf` name, or a
// composition that stays a matrix — a sum/negation of matrix terms, a
// product/quotient/power with a matrix factor, or a matrix-returning
// op (transpose/adjoint/inverse). `isMatrixLeaf` decides what a bare
// name resolves to (scope-bound at emission, sequential at pre-scan).
export function matrixValuedNode(
  node: MathJson | undefined,
  isMatrixLeaf: (name: string) => boolean,
): boolean {
  if (isHead(node, 'Matrix')) return true;
  if (isStr(node)) return isMatrixLeaf(node);
  if (!isArr(node)) return false;
  const operands = node.slice(1) as MathJson[];
  switch (headOf(node)) {
    case 'Add':
      return operands.every((a) => matrixValuedNode(a, isMatrixLeaf));
    case 'Negate':
    case 'Transpose':
    case 'ConjugateTranspose':
    case 'Inverse':
      return matrixValuedNode(node[1], isMatrixLeaf);
    case 'Multiply':
    case 'Divide':
    case 'Power':
      return operands.some((a) => matrixValuedNode(a, isMatrixLeaf));
    case 'D':
      // A partial derivative differentiates the body elementwise —
      // matrix-valued exactly when the body is (a vector field's
      // `D_x f` is its Jacobian column/row).
      return matrixValuedNode(node[1], isMatrixLeaf);
    case 'Apply':
    case 'call':
      // `f(…)` is matrix-valued when f's def returns a matrix —
      // isMatrixLeaf covers matrixFns entries.
      return isStr(node[1]) && isMatrixLeaf(node[1]);
    case 'Gradient':
      // `\nabla` always emits a 1×3 Matrix.
      return true;
    case 'TotalD':
      // `\D` on a matrix body differentiates elementwise / Jacobians —
      // matrix-valued; on a scalar body it's a scalar unless several
      // free vars force the Jacobian row (caught at emission by the
      // `.jacobian(` text check in emitStatement).
      return matrixValuedNode(node[1], isMatrixLeaf);
    case 'CircleTimes':
    case 'CirclePlus':
    case 'HadamardProduct':
      // Kronecker product, direct sum and elementwise product of
      // matrices are matrices.
      return operands.some((a) => matrixValuedNode(a, isMatrixLeaf));
    case 'CircledAst':
      // `u \times v` emits a vector when an operand is one — a matrix
      // node or a bracket list (which wraps in sp.Matrix).
      return operands.some(
        (a) => matrixValuedNode(a, isMatrixLeaf) || isHead(a, 'List'),
      );
    default:
      return false;
  }
}

export function numText(node: MathJson): string {
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object' && node !== null && 'num' in node)
    return String((node as { num: unknown }).num);
  return String(node);
}

// CE's empty-argument marker (or a hole/absent slot).
export const missingArg = (n: MathJson | undefined): boolean =>
  n === undefined || n === 'Nothing' || isHead(n, 'Error');

// Numeric literal node — number or `{num: "..."}`.
export const isNum = (v: MathJson | undefined): boolean =>
  typeof v === 'number' ||
  (typeof v === 'object' && v !== null && 'num' in v);

// Concrete integer value of a numeric literal, else undefined.
export const asInt = (v: MathJson | undefined): number | undefined => {
  const n =
    typeof v === 'number'
      ? v
      : isNum(v)
        ? Number(numText(v as MathJson))
        : NaN;
  return Number.isInteger(n) ? n : undefined;
};

// `RealNumbers_{0}`-style names: a `_0`/`_{0}` subscript marks the ±0
// variant of a number set. Returns the base name, else undefined.
export const stripZeroSuffix = (s: string): string | undefined =>
  s.endsWith('_{0}')
    ? s.slice(0, -4)
    : s.endsWith('_0')
      ? s.slice(0, -2)
      : undefined;


// CE wraps calculus bodies as ["Function", body, x] (x binds the operator
// variable). Unwrap to the plain body + the bound parameter list.
export function unwrapLambda(node: MathJson): { body: MathJson; params: string[] } {
  if (isHead(node, 'Function') && node.length >= 3)
    return {
      body: node[1],
      params: node.slice(2).filter(isStr),
    };
  return { body: node, params: [] };
}

