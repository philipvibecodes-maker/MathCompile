import type { MathJson } from '../ir';
import { isArr, isStr, headOf, isHead, matrixValuedNode } from './nodes';

// Names bound by Assign/Def anywhere in the IR (pre-scan). Distinguishes
// worksheet-declared calls (`f(x)` when `f` is defined here) from the
// `sp.<head>` escape hatch. Exported for the interim engine, which
// reserves the same declared names when allocating constants of
// integration so its letters match the real program's.
export function collectDeclared(
  ir: MathJson,
  declared: Set<string>,
  declaredFns: Set<string>,
): void {
  const collect = (n: MathJson) => {
    if (!isArr(n)) return;
    const h = headOf(n);
    if (h === 'Assign' && isStr(n[1])) declared.add(n[1]);
    if ((h === 'Def' || h === 'Declare') && isStr(n[1])) {
      declared.add(n[1]);
      declaredFns.add(n[1]);
    }
    // `f: x ↦ body` — the typed/Colon def forms mirror emitStatement's.
    const typed = isArr(n[2]) && headOf(n[2]) === 'call' ? n[2] : undefined;
    if (
      h === 'Function' &&
      isArr(typed) &&
      typed[1] === 'Typed' &&
      isStr(typed[2])
    ) {
      declared.add(typed[2]);
      declaredFns.add(typed[2]);
    }
    if (
      h === 'call' &&
      n[1] === 'Colon' &&
      isStr(n[2]) &&
      isHead(n[3], 'Function')
    ) {
      declared.add(n[2]);
      declaredFns.add(n[2]);
    }
    if (h === 'Block' || h === 'WhereBlock')
      n.slice(1).forEach(collect);
  };
  collect(ir);
}

// Names bound to a matrix value by the end of the IR — `A.det()`,
// `A.norm()` etc. are valid on the emitted `A = <matrix>`. A later
// `A = <non-matrix>` rebinds the name back to a scalar, so a name only
// counts when its last assignment is a matrix. Same leaf rule as
// emission: a Matrix literal, an `I_n` identity (unless that name is
// itself bound), or an earlier matrix-bound name.
export function collectMatrices(ir: MathJson, matrixNames: Set<string>): void {
  const defined = new Set<string>();
  const collect = (n: MathJson) => {
    if (!isArr(n)) return;
    const h = headOf(n);
    if (h === 'Assign' && isStr(n[1])) {
      if (
        matrixValuedNode(
          n[2],
          (s) => matrixNames.has(s) || (!defined.has(s) && /^I_\d+$/.test(s)),
        )
      )
        matrixNames.add(n[1]);
      else matrixNames.delete(n[1]);
      defined.add(n[1]);
    }
    if (h === 'Block') n.slice(1).forEach(collect);
  };
  collect(ir);
}

