import type { MathJson } from '../ir';
import { CONSTANTS } from '../notation';
import { isStr, isArr, headOf, isNum, asInt } from './nodes';

// Free symbol names inside an expression — used to infer the variable of
// an integral written without a differential. Constants, the CE 'Nothing'
// marker, and callee names (f in f(t), call heads) don't count.
export function freeNames(node: MathJson, acc = new Set<string>()): string[] {
  if (isStr(node)) {
    if (!CONSTANTS[node] && node !== 'Nothing' && !node.startsWith("'"))
      acc.add(node);
    return [...acc];
  }
  if (!isArr(node)) return [...acc];
  const h = headOf(node);
  if (h === 'Function') {
    // Lambda: body names minus the bound params.
    freeNames(node[1], acc);
    for (const p of node.slice(2)) if (isStr(p)) acc.delete(p);
    return [...acc];
  }
  // The variable slot of Limits and the callee of Apply/call are names,
  // not free symbols.
  const skip = h === 'Limits' || h === 'Apply' || h === 'call' ? 1 : 0;
  for (const child of node.slice(1 + skip)) freeNames(child, acc);
  return [...acc];
}

// int-valued literals: num nodes plus (integer) Negates, products, sums, and
// powers of them — `10^6/3` must emit `Rational(10**6, 3)`
// so it stays exact instead of a float.
export function isIntExpr(v: MathJson | undefined): boolean {
  if (isNum(v)) return asInt(v) !== undefined;
  if (!isArr(v)) return false;
  const h = headOf(v);
  if (h === 'Negate') return isIntExpr(v[1]);
  if (h === 'Power' || h === 'Multiply' || h === 'Add')
    return v.slice(1).every(isIntExpr);
  return false;
}

// Every bare name token under the node — cellBody uses it to reserve the
// cell's names so constants of integration never shadow them.
export function allNames(node: MathJson, acc: Set<string>): void {
  if (isStr(node)) {
    acc.add(node);
    return;
  }
  if (isArr(node)) for (const child of node) allNames(child, acc);
}

// The next constant-of-integration letter: first capital not in `used`
// (C, else D, E, …). `used` is mutated — the returned letter is claimed.
// Exhausted alphabet falls back to reusing C — nothing else is left to
// give. Shared with the interim engine so both pick the same letter
// for the same cell.
export function firstFreeCapital(used: Set<string>): string {
  for (let code = 'C'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
    const name = String.fromCharCode(code);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  return 'C';
}
