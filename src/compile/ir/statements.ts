import { KNOWN_HEADS } from '../notation';
import { assignNode,defNode } from './normalized';
import { delimiterArgs,head,isArray,isDelimiterGroup,isParenTuple,isSpacing,isString,isSymbolString,unquote } from './shapes';
import type { MathJson } from './types';

// f(x, y) shape: lowercase-ish head applied to bare symbols. Canonical CE
// encodes application as ["name", arg1, ...]; non-canonical parses give
// InvisibleOperator("name", Delimiter(args...)) — both resolve to a Def.
function functionDefShape(
  node: MathJson,
): { name: string; params: string[] } | null {
  if (!isArray(node) || node.length < 2) return null;
  // A builtin or structural head applied to symbols is an application,
  // not a def: `\frac{dN}{dt} = rN`, `|x| = cases`, and `sp = 5` (CE reads
  // `sp` as juxtaposed s·p) must stay equations — they would otherwise
  // `def D(N, t)` / `def Abs(x)` / `def InvisibleOperator(s, p)` and
  // shadow SymPy.
  if (
    isSymbolString(node[0]) &&
    !KNOWN_HEADS.has(node[0]) &&
    node[0] !== 'call' &&
    node[0] !== 'InvisibleOperator'
  ) {
    const params = node.slice(1);
    // `D` is CE's derivative operator head (\dot{x}, \frac{dy}{dx}) —
    // `D(x,t) = rhs` is an ODE equation, never `def D(x,t)`.
    if (node[0] !== 'D' && params.every(isSymbolString))
      return { name: node[0], params };
  }
  if (head(node) === 'InvisibleOperator' && node.length === 3) {
    const [, fn, delim] = node;
    if (
      isSymbolString(fn) &&
      !KNOWN_HEADS.has(fn) &&
      isDelimiterGroup(delim)
    ) {
      const params = delimiterArgs(delim);
      if (params.every(isSymbolString)) return { name: fn, params };
    }
  }
  return null;
}

// `\text{def}` arrives as a text literal 'def' — the statement-level
// marker that asks for a function def. `f(x)` alone now reads as f·x, so
// the sig shape only binds when the marker prefixes it.
export const isDefMark = (v: MathJson): boolean => {
  const t = isString(v) ? unquote(v) : undefined;
  return t !== undefined && t.trim() === 'def';
};

// `\text{plot}` arrives as a text literal 'plot' — the statement-level
// marker that asks for a plot of the expression after it.
const isPlotMark = (v: MathJson): boolean => {
  const t = isString(v) ? unquote(v) : undefined;
  return t !== undefined && t.trim() === 'plot';
};

// `\text{plot} <stmt-expr>` — the marker is a bare factor that binds the
// WHOLE statement (`\text{plot} x^2 + y^2` plots x²+y², not just x²):
// CE parses the mark into the leftmost InvisibleOperator item, so the
// strip walks the node's left spine and lifts it out. Returns the
// statement expression with the mark removed, or undefined when there
// is no leading plot mark.
export const splitPlotMark = (n: MathJson): MathJson | undefined => {
  if (!isArray(n)) return undefined;
  if (head(n) === 'InvisibleOperator') {
    const items = n.slice(1).filter((x) => !isSpacing(x));
    if (items.length >= 2 && isPlotMark(items[0]))
      // The tail re-normalizes as an InvisibleOperator so the usual
      // juxtaposition rules still apply — `\plot g(x)` applies the
      // declared g to x (Apply), it is not g·(x).
      return items.length === 2
        ? items[1]
        : (['InvisibleOperator', ...items.slice(1)] as MathJson);
    return undefined;
  }
  const left = splitPlotMark(n[1]);
  if (left === undefined) return undefined;
  return [head(n), left, ...n.slice(2)] as MathJson;
};

// Statement `\text{def} f(x)…`: the marker lands as the first factor of
// an InvisibleOperator chain (also inside an Equal lhs). Returns the
// signature when what's left is a name (+args); a bare `\text{def} f`
// declares f with no params.
export function defMarkedShape(
  node: MathJson,
): { name: string; params: string[] } | null {
  if (!isArray(node) || head(node) !== 'InvisibleOperator') return null;
  if (node.length < 3 || !isDefMark(node[1])) return null;
  const rest = node.slice(2);
  if (rest.length === 1 && isSymbolString(rest[0]))
    return { name: rest[0], params: [] };
  return functionDefShape(['InvisibleOperator', ...rest] as MathJson[]);
}

// Heads that read as an adjacent-pair chain when nested or multi-arg:
// `x > y > z` arrives right-nested (Greater(x, Greater(y, z))), `a < b <= c`
// cross-nests (LessEqual(Less(a, b), c)), `a != b != c` nests NotEqual —
// every relation head except Equal (flattenEqual handles it separately,
// since statement-level `=` is the assignment path).
export const REL_CHAIN = new Set([
  'Less',
  'LessEqual',
  'Greater',
  'GreaterEqual',
  'NotEqual',
]);

// Linearize a (possibly nested/mixed) relation chain into parallel
// (ops, operands) lists: ops[i] relates args[i] and args[i+1]. A nested
// chain operand contributes its own pairs; the op between an operand
// group boundary and the next arg is this node's head.
export function chainLinear(node: MathJson[]): { ops: string[]; args: MathJson[] } {
  const h = head(node) as string;
  const ops: string[] = [];
  const args: MathJson[] = [];
  node.slice(1).forEach((a, i) => {
    if (i > 0) ops.push(h);
    if (isArray(a) && REL_CHAIN.has(head(a) ?? '')) {
      const sub = chainLinear(a);
      args.push(...sub.args);
      ops.push(...sub.ops);
    } else {
      args.push(a);
    }
  });
  return { ops, args };
}

// ---- \text{solve} / \text{dsolve} / \text{pdesolve} statements -------
//
// The marker word is stripped in parseCellLatex; the rest of the
// statement parses normally and arrives wrapped as
// ['SolveMark', kind, node]. This pass splits the item list (comma
// lists, a {set}, a \begin{cases} Interval of equations, or a single
// node) into equations, dependent-variable specs (`y`, `y(x)`,
// `u(x,t)`), and initial conditions (`y(0)=1`, `y'(0)=0`), then
// rewrites prime and subscript derivative notation on the names that
// turned out to be dependent variables so the equation nodes codegen
// sees are all D/Derivative-shaped.

// A solve statement's item list — every spelling of "these equations":
// comma-separated, a {set}, a \begin{cases} block (a 2-row cases lands
// as Interval via bracketIntervals), or the one bare node.
export function underVarDomain(under: MathJson): { v: MathJson; domain?: MathJson } {
  if (!isArray(under)) return { v: under };
  const uh = head(under);
  if (uh === 'Element' && under.length === 3)
    return { v: under[1], domain: under[2] };
  // \min_{i=lo}^{hi}: the underscript `i=lo` and overscript `hi` fold
  // into Power(Equal(i, lo), hi) — recover (v, [lo, hi]). This is an
  // integer index range (like \sum bounds), NOT a real interval.
  if (
    uh === 'Power' &&
    isArray(under[1]) &&
    head(under[1]) === 'Equal' &&
    under[1].length === 3 &&
    isSymbolString(under[1][1])
  )
    return { v: under[1][1], domain: ['IntegerRange', under[1][2], under[2]] };
  if (
    uh === 'Less' ||
    uh === 'LessEqual' ||
    uh === 'Greater' ||
    uh === 'GreaterEqual'
  ) {
    const a = under.slice(1);
    const vi = a.findIndex(isSymbolString);
    if (vi < 0) return { v: under };
    const strict = uh === 'Less' || uh === 'Greater';
    const mark = (b: MathJson): MathJson => (strict ? ['Open', b] : b);
    const NEG_INF: MathJson = ['Negate', 'PositiveInfinity'];
    if (a.length === 2) {
      const other = a[1 - vi];
      // `x >= a` / `a <= x` place a lower bound; `x <= a` / `a >= x` upper.
      const isLower =
        uh === 'Greater' || uh === 'GreaterEqual' ? vi === 0 : vi === 1;
      const bound = mark(other);
      return {
        v: a[vi],
        domain: isLower
          ? ['Interval', bound, 'PositiveInfinity']
          : ['Interval', NEG_INF, bound],
      };
    }
    if (a.length === 3 && vi === 1) {
      const lo =
        uh === 'Greater' || uh === 'GreaterEqual'
          ? a[2]
          : a[0];
      const hi =
        uh === 'Greater' || uh === 'GreaterEqual'
          ? a[0]
          : a[2];
      return { v: a[vi], domain: ['Interval', mark(lo), mark(hi)] };
    }
  }
  return { v: under };
}

// a = b = c arrives right-nested as Equal(a, Equal(b, c)); flatten into a
// multi-arg Equal so codegen sees the chained-relation shape (sp.And of
// pairwise Eq) and never mistakes the nested form for an assignment.
export function flattenEqual(node: MathJson[]): MathJson[] {
  const args = node
    .slice(1)
    .flatMap((a): MathJson[] =>
      isArray(a) && head(a) === 'Equal' ? flattenEqual(a).slice(1) : [a],
    );
  return ['Equal', ...args];
}

// Disambiguate statement-level `Equal`: `x = rhs` assigns, `f(x) = rhs`
// defines a function, anything else stays an equation. Nested Equal is
// always an equation (sp.Eq) — only statement position assigns.
export function normalizeStatementEqual(
  node: MathJson[],
  normalizeExpr: (n: MathJson) => MathJson,
): MathJson {
  const [, lhs, rhs] = node;
  if (node.length === 3) {
    // `x := y := 5` — chain-assign binds left-to-right, and `Assign`
    // isn't a value. Flatten to sequential statements: y = 5, x = y.
    const mkAssign = (lhsN: MathJson): MathJson => {
      const rhsN = normalizeExpr(rhs);
      if (isArray(rhsN) && head(rhsN) === 'Assign')
        return ['Block', rhsN, ['Assign', lhsN, rhsN[1]]];
      return typeof lhsN === 'string'
        ? assignNode(lhsN, rhsN)
        : ['Assign', lhsN, rhsN];
    };
    if (isSymbolString(lhs)) return mkAssign(lhs);
    // x' = rhs / x'' = rhs — a primed-variable assignment, not a
    // `def Prime(x)` (functionDefShape would match the Prime(x) shape).
    if (
      isArray(lhs) &&
      head(lhs) === 'Prime' &&
      lhs.length >= 2 &&
      isSymbolString(lhs[1]) &&
      lhs.slice(2).every((t) => typeof t === 'number')
    )
      return mkAssign(normalizeExpr(lhs));
    // (x, y) = (1, 2) — a symbol-tuple target assigns via python
    // unpacking; anything else stays an equation. Read the raw shape
    // (Delimiter(Sequence(...)) or List) so `f(x) = ...` on the next
    // branch isn't normalized into a flagged `call`.
    const tuple = (() => {
      const members = isDelimiterGroup(lhs)
        ? delimiterArgs(lhs)
        : isArray(lhs) && (head(lhs) === 'Sequence' || head(lhs) === 'List')
          ? lhs.slice(1)
          : null;
      return members !== null &&
        members.length > 1 &&
        members.every(isSymbolString)
        ? (members as string[])
        : null;
    })();
    if (tuple) {
      // A paren-tuple rhs unpacks from its element list — the tuple's
      // own value (Interval/Matrix) isn't destructure-iterable for a
      // 2-element open interval.
      const unpackRhs = isParenTuple(rhs)
        ? (['List', ...delimiterArgs(rhs).map(normalizeExpr)] as MathJson)
        : normalizeExpr(rhs);
      return isArray(unpackRhs) && head(unpackRhs) === 'Assign'
        ? ['Block', unpackRhs, ['Assign', ['List', ...tuple], unpackRhs[1]]]
        : ['Assign', ['List', ...tuple], unpackRhs];
    }
    // `\text{def} f(x) = body` — the marker restores the function-def
    // reading; a bare `f(x) = body` is now an ordinary equation
    // (f·x = body, parens multiply like everywhere else).
    const def = defMarkedShape(lhs);
    if (def)
      return defNode(def.name, def.params, normalizeExpr(rhs));
  }
  return ['Equal', ...node.slice(1).map(normalizeExpr)];
}

