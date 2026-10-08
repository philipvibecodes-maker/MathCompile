// Normalized IR -> nerdamer input for the calculator's interim rows.
//
// The interim engine shows best-effort answers while SymPy boots. This
// emitter reads the same normalized IR codegen emits from — bounds arrive
// as Limits nodes and `d v` differentials are already parked on the
// Integrate body — so no latex re-reading happens here. Return contract:
//   string  — nerdamer input to evaluate
//   ''      — the statement can't produce a real value (half-empty
//             bounds): poison the interim row, no fallback
//   null    — no coverage: the caller falls back to nerdamer's own
//             convertFromLaTeX on the statement's latex (`leaf`)
// A null anywhere inside an expression propagates to the statement, which
// then tries `leaf` wholesale — partial translation never mixes engines.

import { firstFreeCapital } from '../compile/codegen';
import { isDiffMark, unquote, type MathJson } from '../compile/ir';
import { isStatsName } from '../compile/stats';
// nerdamer spellings come from the same registry codegen reads — the
// interim can't drift from the real engine's name tables.
import {
  NERDAMER_CONSTANTS,
  NERDAMER_FUNCS,
  NERDAMER_INVERSE_FUNCS,
} from '../compile/notation';

export interface NerdamerExpr {
  toString(): string;
  toTeX(): string;
}
export interface Nerdamer {
  (input: string): NerdamerExpr;
  convertFromLaTeX(latex: string): NerdamerExpr;
}

// nerdamer's own latex reader — the fallback for statements the IR
// emitter doesn't cover. Simple algebra comes through fine; on a parse
// failure the braces-stripped text is close enough for a best-effort row.
export function leaf(src: string, nerdamer: Nerdamer): string {
  try {
    return nerdamer.convertFromLaTeX(src).toString();
  } catch {
    return src.replace(/[{}]/g, '');
  }
}

const isArr = (v: MathJson | undefined): v is MathJson[] => Array.isArray(v);
const isStr = (v: MathJson | undefined): v is string => typeof v === 'string';
const headOf = (v: MathJson | undefined): string | undefined =>
  isArr(v) && isStr(v[0]) ? v[0] : undefined;
const isHead = (v: MathJson | undefined, h: string): v is MathJson[] =>
  headOf(v) === h;

// CE's empty-argument marker (or a hole/absent slot).
const missing = (n: MathJson | undefined): boolean =>
  n === undefined || n === 'Nothing' || isHead(n, 'Error');

// CE constant names -> nerdamer's spelling (the registry's `nerdamer`
// field). Everything else stays a symbol name — a bare `EulerGamma`
// interim row beats dropping it.
const CONSTANTS = NERDAMER_CONSTANTS;

// Function heads -> nerdamer function names (registry `nerdamer`
// field). Heads not listed fall to `null` (the statement retries via
// `leaf`).
const FUNCS = NERDAMER_FUNCS;

// \sin^{-1}(x)-style Apply callees — nerdamer's inverse names
// (registry `nerdamerInverse` field).
const INVERSE_FUNCS = NERDAMER_INVERSE_FUNCS;

// A symbol name as a nerdamer identifier — prime ticks and subscript
// braces aren't legal there (x' -> x_prime, x_{n+1} -> x_n_1).
function nameText(s: string): string {
  const t = unquote(s) ?? s;
  const out = t.replaceAll("'", '_prime').replace(/[^A-Za-z0-9_]+/g, '_');
  return out === '' ? '_' : out;
}

// Free symbol names inside an expression — used to infer an integral's
// variable when no `d v` pair or Limits slot names one. Constants,
// 'Nothing', quoted literals, and callee/limit-var name slots don't
// count (mirrors codegen's freeNames).
function freeNames(node: MathJson, acc = new Set<string>()): string[] {
  if (isStr(node)) {
    if (
      CONSTANTS[node] === undefined &&
      node !== 'Nothing' &&
      !node.startsWith("'")
    )
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

// CE wraps calculus bodies as ["Function", body, x] (x binds the operator
// variable). Unwrap to the plain body.
const unwrapLambda = (node: MathJson | undefined): MathJson | undefined =>
  isHead(node, 'Function') && node.length >= 3 ? node[1] : node;

// Peel `d v` factor pairs off an integrand, at the deepest level they sit
// (x sin(x) dx nests the pair inside Sin's argument) — the interim
// counterpart of codegen's peelDeep. Returns names innermost-first (the
// parked `\iint` order) plus the pair-free body.
function peelDiffs(body: MathJson): { body: MathJson; vars: string[] } {
  const stripTail = (factors: MathJson[]): string[] => {
    const found: string[] = [];
    while (
      factors.length >= 2 &&
      isStr(factors[factors.length - 1]) &&
      isDiffMark(factors[factors.length - 2])
    ) {
      const name = factors.pop() as string;
      factors.pop();
      found.unshift(name);
    }
    return found;
  };
  const peelNode = (
    node: MathJson,
  ): { node: MathJson; names: string[] } => {
    if (isHead(node, 'Multiply')) {
      const factors = node.slice(1);
      const names = stripTail(factors);
      if (names.length > 0 && factors.length >= 1)
        return {
          node:
            factors.length === 1 ? factors[0] : ['Multiply', ...factors],
          names,
        };
      const last = factors[factors.length - 1];
      if (last === undefined) return { node, names: [] };
      const r = peelNode(last);
      if (r.names.length === 0) return { node, names: [] };
      const out = [...factors.slice(0, -1), r.node];
      return {
        node: out.length === 1 ? out[0] : (['Multiply', ...out] as MathJson),
        names: r.names,
      };
    }
    if (isArr(node) && node.length >= 2) {
      for (let i = node.length - 1; i >= 1; i--) {
        const r = peelNode(node[i]);
        if (r.names.length > 0) {
          const out = [...node];
          out[i] = r.node;
          return { node: out as MathJson, names: r.names };
        }
      }
    }
    return { node, names: [] };
  };
  if (!isHead(body, 'Multiply') || body.length < 3) return { body, vars: [] };
  const factors = body.slice(1);
  const names = stripTail(factors);
  if (names.length > 0 && factors.length >= 1)
    return {
      body: factors.length === 1 ? factors[0] : ['Multiply', ...factors],
      vars: names,
    };
  const last = factors[factors.length - 1];
  if (last === undefined) return { body, vars: [] };
  const r = peelNode(last);
  if (r.names.length === 0) return { body, vars: [] };
  const out = [...factors.slice(0, -1), r.node];
  return {
    body: out.length === 1 ? out[0] : ['Multiply', ...out],
    vars: r.names,
  };
}

// Precedence levels for parenthesization — nerdamer parses the usual
// infix grammar, so children tighter than the context need no parens.
const P_ADD = 10;
const P_MUL = 20;
const P_UNARY = 30;
const P_POW = 40;

// Child-precedence table: what `emit` produces per head, so callers can
// wrap. Heads not listed are atoms or calls.
const PREC: Record<string, number> = {
  Add: P_ADD,
  Subtract: P_ADD,
  Negate: P_UNARY,
  Multiply: P_MUL,
  Divide: P_MUL,
  // The quotient shapes Rational/Log emit need parens wherever a
  // quotient's numerator isn't the whole operand.
  Rational: P_MUL,
  Log: P_MUL,
  Power: P_UNARY,
};

interface Ctx {
  takeConst: () => string;
}

// Emit one normalized statement/expression node. See the file header for
// the string/''/null contract.
function emit(node: MathJson | undefined, ctx: Ctx): string | null {
  if (node === undefined) return null;
  if (typeof node === 'number') return String(node);
  if (isStr(node)) {
    if (node === 'Nothing') return null;
    return CONSTANTS[node] ?? nameText(node);
  }
  if (typeof node === 'object' && !isArr(node)) {
    const n = node as { num?: unknown };
    return n.num !== undefined ? String(n.num) : null;
  }
  if (!isArr(node)) return null;
  const h = headOf(node);
  if (h === undefined) return null;
  const args = node.slice(1);

  // Emit every child flat (operands of a call/group need no parens);
  // '' (poison) and null propagate.
  const subs = (ns: MathJson[]): string[] | null | '' => {
    const out: string[] = [];
    for (const n of ns) {
      const s = emit(n, ctx);
      if (s === null || s === '') return s;
      out.push(s);
    }
    return out;
  };
  const sub = (n: MathJson | undefined): string | null => emit(n, ctx);
  // Emit a child and wrap it in parens when its head's precedence is
  // under the slot's p.
  const child = (n: MathJson | undefined, p: number): string | null => {
    const s = emit(n, ctx);
    if (s === null || s === '') return s;
    const cp = isArr(n) ? PREC[headOf(n) ?? ''] : undefined;
    return cp !== undefined && cp < p ? `(${s})` : s;
  };

  switch (h) {
    case 'Add': {
      const ts = subs(args);
      return ts === null || ts === '' ? ts : ts.join('+');
    }
    case 'Negate': {
      const s = child(args[0], P_POW);
      return s === null || s === '' ? s : `-${s}`;
    }
    case 'Subtract': {
      // Defensive — normalization folds Subtract to Add+Negate.
      const l = child(args[0], P_ADD);
      const r = child(args[1], P_POW);
      return l === null || l === '' || r === null || r === ''
        ? l === '' || r === '' ? '' : null
        : `${l}-${r}`;
    }
    case 'Multiply': {
      const parts: string[] = [];
      for (const a of args) {
        const s = child(a, P_MUL);
        if (s === null || s === '') return s;
        parts.push(s);
      }
      return parts.join('*');
    }
    case 'Divide': {
      const l = child(args[0], P_MUL);
      const r = child(args[1], P_UNARY);
      return l === null || l === '' || r === null || r === ''
        ? l === '' || r === '' ? '' : null
        : `${l}/${r}`;
    }
    case 'Power': {
      // Base and exponent must read as atoms: bare `2^3^2` and `-2^2`
      // mean something else under `^`'s precedence.
      const b = child(args[0], P_POW);
      const e = child(args[1], P_POW);
      return b === null || b === '' || e === null || e === ''
        ? b === '' || e === '' ? '' : null
        : `${b}^${e}`;
    }
    case 'Rational': {
      const ts = subs(args);
      return ts === null || ts === '' ? ts : ts.join('/');
    }
    case 'Root':
      // \sqrt[n]{x} — nerdamer spells it nthroot(x, n).
      if (args.length === 2) {
        const ts = subs(args);
        return ts === null || ts === '' ? ts : `nthroot(${ts.join(', ')})`;
      }
      return null;
    case 'Binomial': {
      // nerdamer has no binomial — the factorial expansion evaluates for
      // numbers and stays readable for symbols.
      if (args.length !== 2) return null;
      const ts = subs(args);
      if (ts === null || ts === '') return ts;
      const [a, b] = ts;
      // The expansion is a quotient — self-parenthesized so it stays
      // atomic under division/power (`1/\binom{5}{2}` isn't 1/fact/…).
      return `(factorial(${a})/(factorial(${b})*factorial(${a}-${b})))`;
    }
    case 'Log': {
      // codegen defaults \log to base 10 (sp.log(x, 10)) — the interim
      // spells it as the change-of-base quotient to match (nerdamer's
      // log takes no base argument).
      if (args.length === 1) {
        const s = sub(args[0]);
        return s === null || s === '' ? s : `log(${s})/log(10)`;
      }
      if (args.length === 2) {
        const ts = subs(args);
        return ts === null || ts === '' ? ts : `log(${ts[0]})/log(${ts[1]})`;
      }
      return null;
    }
    case 'List':
    case 'Tuple':
    case 'Set': {
      const ts = subs(args);
      return ts === null || ts === '' ? ts : `[${ts.join(', ')}]`;
    }
    case 'Integrate': {
      const lim = isHead(args[1], 'Limits') ? args[1].slice(1) : null;
      const rawBody = unwrapLambda(args[0]);
      const peeled = rawBody === undefined
        ? { body: rawBody, vars: [] as string[] }
        : peelDiffs(rawBody);
      const body = peeled.body;
      // Variable: the Limits slot when filled, else the innermost peeled
      // `d v` name, else the body's only free symbol.
      let v = isStr(lim?.[0]) && !missing(lim?.[0]) ? (lim?.[0] as string) : undefined;
      let extra = peeled.vars.filter((n) => n !== v);
      if (v === undefined) {
        if (extra.length > 0) {
          v = extra[0];
          extra = extra.slice(1);
        } else {
          const free = body === undefined ? [] : freeNames(body);
          if (free.length === 1) v = free[0];
          else return null;
        }
      }
      const vars = [v, ...extra];
      const hasLo = !missing(lim?.[1]);
      const hasHi = !missing(lim?.[2]);
      // Half bounds are an error on the real engine — poison the interim
      // rather than guess definite vs indefinite.
      if (hasLo !== hasHi) return '';
      const f = sub(body);
      if (f === null || f === '') return f;
      if (hasLo) {
        const lo = sub(lim?.[1]);
        const hi = sub(lim?.[2]);
        if (lo === null || lo === '' || hi === null || hi === '')
          return lo === '' || hi === '' ? '' : null;
        // A lone bound pair applies to every variable — \iint_a^b reads
        // as a square region (same rule as codegen).
        let acc = `defint(${f}, ${lo}, ${hi}, ${nameText(vars[0])})`;
        for (const w of vars.slice(1))
          acc = `defint(${acc}, ${lo}, ${hi}, ${nameText(w)})`;
        return acc;
      }
      // Indefinite: nested calls with a constant per level so an inner
      // `+ C` integrates through (integrate(f, x) + C) — parenthesized
      // so it stays bound to its integral inside a larger expression.
      let acc = `(integrate(${f}, ${nameText(vars[0])})+${ctx.takeConst()})`;
      for (const w of vars.slice(1))
        acc = `(integrate(${acc}, ${nameText(w)})+${ctx.takeConst()})`;
      return acc;
    }
    case 'Sum':
    case 'Product': {
      const word = h === 'Sum' ? 'sum' : 'product';
      const lim = isHead(args[1], 'Limits') ? args[1].slice(1) : null;
      // SymPy has no boundless sum and neither does the interim — a
      // missing/half-written bound poisons the row instead of guessing.
      if (!lim || missing(lim[0]) || missing(lim[1]) || missing(lim[2]))
        return '';
      const i = lim[0];
      if (!isStr(i)) return '';
      const f = sub(unwrapLambda(args[0]));
      const lo = sub(lim[1]);
      const hi = sub(lim[2]);
      if (f === '' || lo === '' || hi === '') return '';
      if (f === null || lo === null || hi === null) return null;
      return `${word}(${f}, ${nameText(i)}, ${lo}, ${hi})`;
    }
    case 'Limit': {
      // ['Limit', ['Function', body, x], a, dir?] — a one-sided limit
      // (dir ±1) has no nerdamer spelling; a two-sided guess at a
      // discontinuity would contradict the real engine, so no row.
      if (isHead(args[0], 'Function')) {
        if (args[2] !== undefined) return '';
        const fn = args[0];
        const v = isStr(fn[2]) ? fn[2] : 'x';
        const f = sub(fn[1]);
        const a = sub(args[1]);
        if (f === '' || a === '') return '';
        if (f === null || a === null) return null;
        return `limit(${f}, ${nameText(v)}, ${a})`;
      }
      // Defensive flat form: ['Limit', expr, x, a, dir?].
      if (args.length >= 3 && isStr(args[1])) {
        if (args[3] !== undefined) return '';
        const f = sub(args[0]);
        const a = sub(args[2]);
        if (f === '' || a === '') return '';
        if (f === null || a === null) return null;
        return `limit(${f}, ${nameText(args[1])}, ${a})`;
      }
      const free = args[0] === undefined ? [] : freeNames(args[0]);
      if (args.length === 2 && free.length === 1) {
        const f = sub(args[0]);
        const a = sub(args[1]);
        if (f === '' || a === '') return '';
        if (f === null || a === null) return null;
        return `limit(${f}, ${nameText(free[0])}, ${a})`;
      }
      return null;
    }
    case 'D': {
      // \frac{d f}{d x} / \partial_x — D(body, x[, n]); \frac{d^n}{dx^n}
      // normalizes to nested D nodes — fold same-var links into the
      // order arg (codegen does the same fold).
      let f0 = args[0];
      const x0 = args[1];
      const n0 = args[2];
      // `nested` counts inner same-var D links peeled off the body; the
      // outer node contributes its own order (n0, defaulting to 1).
      let nested = 0;
      while (isHead(f0, 'D') && f0[2] === x0 && f0[3] === undefined) {
        nested++;
        f0 = f0[1];
      }
      const xv = isStr(x0) && !missing(x0) ? nameText(x0) : null;
      if (xv === null) return null;
      // A bare name body is a function of the variable (mirrors
      // codegen's D rule): diff(f, x) evaluates to 0, diff(f(x), x)
      // stays a derivative.
      const fx =
        isStr(f0) && nameText(f0) !== xv && CONSTANTS[f0] === undefined
          ? `${nameText(f0)}(${xv})`
          : sub(f0);
      if (fx === null || fx === '') return fx;
      if (n0 === undefined || missing(n0))
        return nested === 0
          ? `diff(${fx}, ${xv})`
          : `diff(${fx}, ${xv}, ${1 + nested})`;
      const n = sub(n0);
      if (n === null || n === '') return n;
      return nested === 0
        ? `diff(${fx}, ${xv}, ${n})`
        : `diff(${fx}, ${xv}, ${n}+${nested})`;
    }
    case 'Apply': {
      const callee = args[0];
      if (isHead(callee, 'InverseFunction')) {
        // \sin^{-1}(x) — the base name maps to the a- spelling.
        const base = isStr(callee[1]) ? INVERSE_FUNCS[callee[1]] : undefined;
        if (base === undefined) return null;
        const ts = subs(args.slice(1));
        return ts === null || ts === '' ? ts : `${base}(${ts.join(', ')})`;
      }
      if (isHead(callee, 'Derivative')) {
        // f'(x) — nerdamer evaluates diff of an unknown f(x) to `f`,
        // a wrong row; no interim is better than a wrong one.
        return null;
      }
      if (isStr(callee)) {
        const ts = subs(args.slice(1));
        return ts === null || ts === ''
          ? ts
          : `${nameText(callee)}(${ts.join(', ')})`;
      }
      return null;
    }
    case 'Minimum':
    case 'Maximum':
      // \min_{x} f is an extremum over the bound var, not pointwise
      // min(a,b) — nerdamer has no form for it, and `min(body, x)`
      // would compare the wrong operands. No interim is better than a
      // wrong one.
      return '';
    case 'call': {
      // Unknown/word-op heads (\mathrm{tr}, user functions) — nerdamer
      // keeps unknown calls symbolic, so `tr(A)` still displays.
      if (args.length === 0 || !isStr(args[0])) return null;
      const name = unquote(args[0]) ?? args[0];
      // scipy.stats builtins — nerdamer reads the unknown multi-letter
      // call as a product (`normcdf(1.96)` -> 1.96*normcdf). No interim
      // row is better than a misleading one.
      if (isStatsName(name)) return '';
      const ts = subs(args.slice(1));
      return ts === null || ts === '' ? ts : `${nameText(name)}(${ts.join(', ')})`;
    }
    case 'Equal': {
      const ts = subs(args);
      return ts === null || ts === '' ? ts : ts.join(' = ');
    }
    case 'Assign': {
      // Statement form: lhs = rhs (tuple lhs `x,y = …` emits as a list).
      const l = sub(args[0]);
      const r = sub(args[1]);
      if (l === '' || r === '') return '';
      if (l === null || r === null) return null;
      return `${l} = ${r}`;
    }
    case 'Def': {
      // \text{def} f(x) = body — displays as the defining equation.
      if (!isStr(args[0])) return null;
      const params = isHead(args[1], 'List') ? args[1].slice(1) : [];
      if (!params.every(isStr)) return null;
      const b = sub(args[2]);
      if (b === null || b === '') return b;
      const sig = params.map((p) => nameText(p)).join(', ');
      return `${nameText(args[0])}(${sig}) = ${b}`;
    }
    case 'WhereBlock': {
      // `expr \text{ where } cond` — the interim row is the expression;
      // the conditions have no nerdamer form.
      const REL = new Set([
        'Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater',
        'GreaterEqual', 'NotLess', 'NotGreater', 'NotLessEqual',
        'NotGreaterEqual', 'Element', 'NotElement', 'Subset',
        'SubsetEqual', 'Superset', 'SupersetEqual', 'IdenticallyEqual',
        'Congruent',
      ]);
      return args.length > 1 &&
        args.slice(0, -1).every((k) => REL.has(headOf(k) ?? ''))
        ? emit(args[args.length - 1], ctx)
        : null;
    }
    default:
      if (FUNCS[h] !== undefined) {
        const ts = subs(args);
        return ts === null || ts === '' ? ts : `${FUNCS[h]}(${ts.join(', ')})`;
      }
      return null;
  }
}

// `ir` is a normalized statement node (one Block child) — or the whole
// cell IR for a single-statement cell. `takeConst` hands out the constant
// of integration letters (see interimConstNames).
export function irToNerdamer(
  ir: MathJson,
  takeConst: () => string,
): string | null {
  return emit(ir, { takeConst });
}

// The per-cell constant-of-integration allocator: seeds the used-name
// set with every string token in the cell (heads included — the same
// reservation allNames makes for codegen) so `+ C` never collides, then
// hands out the first free capital per integral level via the rule
// codegen's nextConstName shares.
export function interimConstNames(
  ir: MathJson | undefined,
  reserved: Set<string> = new Set(),
): () => string {
  const used = new Set(reserved);
  const walk = (n: MathJson | undefined): void => {
    if (isStr(n)) used.add(n);
    else if (isArr(n)) for (const c of n) walk(c);
  };
  walk(ir);
  return () => firstFreeCapital(used);
}
