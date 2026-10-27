import { DECLINE,type NormalizeCtx,type NormalizeRule } from './ir/context';
import { describeCommand,describeError,issue } from './ir/diagnostics';
import { dQuotient,foldDQuotient,foldTotalD,hasTotalDMark,isDiffMark,tdQuotient } from './ir/differentials';
import {
addNode,
assignNode,
callNode,
defNode,
isNegateNode,
isPowerNode,
negateNode,powerNode
} from './ir/normalized';
import { delimiterArgs,flattenSubscript,head,isArray,isDelimiterGroup,isParenTuple,isString,isSymbolString,isUnexpectedCommand,paramName,unquote } from './ir/shapes';
import { solveMarkedStatement } from './ir/solvers';
import type { Issue,MathJson,NormalizeOptions,NormResult } from './ir/types';
export { isDiffMark } from './ir/differentials';
export { extractPythonBlocks,latexToStatementStrings,parseCellLatex } from './ir/parse';
export { unquote } from './ir/shapes';
export type { Issue,MathJson,NormalizeOptions,NormResult,PairTupleMode,RawMathJson } from './ir/types';
// MathJSON IR: LaTeX -> Compute Engine parse -> normalized IR.
//
// The editor (vendored MathQuill) produces LaTeX only; parsing is delegated
// entirely to @cortex-js/compute-engine (`ce.parse`), which yields the
// Compute Engine MathJSON vocabulary the codegen consumes. No custom LaTeX
// parser lives here — vocabulary gaps are handled downstream via the
// `['call', head, ...]` escape hatch, never by patching the parse.
//
// normalizeIR() is the validation/normalization pass between raw MathJSON
// and codegen: it flattens variants CE emits (Subtract, chained Equal,
// Subscript nodes), resolves statement-level `=` into Assign/Def, and
// reports malformed/unsupported fragments as issues instead of throwing.
//
// Cells parse with `canonical: false` so the user's term order is preserved
// (a * 2 stays Multiply(a, 2), not Multiply(2, a)); non-canonical MathJSON
// has more surface shapes — InvisibleOperator for implicit multiply /
// function application, Tuple for operator bounds, Subtract/Divide kept
// unflattened — which this pass folds back into the canonical vocabulary.

// The name tables below are derived views over the notation registry —
// each name lives once in src/compile/notation.ts.
import {
CALL_RENAMED,
CE_CONSTANTS,
KNOWN_HEADS,
MATRIX_WORD_OPS,
SET_LEAF,
} from './notation';

// TeX spacing commands CE wraps in nodes (`\,` -> HorizontalSpacing).
// They carry no value — dropped from implicit-multiplication chains so
// `x\,y` stays `x * y` instead of leaking `sp.HorizontalSpacing`.
const SPACING_HEADS = new Set([
  'HorizontalSpacing', 'Spacing', 'Space', 'TextSpace', 'Quad', 'Qquad',
]);
const isSpacing = (v: MathJson): boolean => {
  const h = head(v);
  return h !== undefined && SPACING_HEADS.has(h);
};

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
const isDefMark = (v: MathJson): boolean => {
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
const splitPlotMark = (n: MathJson): MathJson | undefined => {
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
function defMarkedShape(
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
const REL_CHAIN = new Set([
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
function chainLinear(node: MathJson[]): { ops: string[]; args: MathJson[] } {
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
function underVarDomain(under: MathJson): { v: MathJson; domain?: MathJson } {
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
function flattenEqual(node: MathJson[]): MathJson[] {
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
function normalizeStatementEqual(
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

// ————————————————————————————————————————————————————————————————————
// normalize() rules — the head-dispatched folds as an ordered list.
//
// Every custom fold the normalizer applies to a MathJSON node is a
// NormalizeRule: a name, the decision it encodes (`why`), a pure shape
// test (`when`), and the `rewrite`. The list order IS the dispatch order
// — a rule placed too early shadows later patterns, which is the failure
// mode the positional if-chain hid. `NORMALIZE_RULES.map(r => r.name)`
// enumerates every custom fold; the names are the deletion checklist
// when a design decision is reversed.
//
// `when` must stay a pure function — normalization is side-effectful
// (issues, declaredFns), so `when` may never call `ctx.norm`.
//
// A `rewrite` returns the rewritten node, or DECLINE when the shape
// matched but the fold doesn't apply — dispatch then continues to later
// rules (and ultimately the KNOWN_HEADS passthrough / `call` hatch),
// mirroring an `if` whose inner test failed and fell through the chain.

const NO_NAMES: ReadonlySet<string> = new Set();

// Accent marks that denote distinct variables — \hat{x}, \vec{v},
// \bar{z} (CE 'Mean'), \tilde{t} ('OverTilde') — become suffixed symbol
// names (x_hat, v_vec, ...) rather than collapsing to the unmarked name.
// \dot{x} isn't here: CE already lowers it to D(x, t) before this pass.
const ACCENT_SUFFIX: Record<string, string> = {
  OverHat: 'hat',
  OverVector: 'vec',
  OverBar: 'bar',
  Mean: 'bar', // \bar{z}
  Overline: 'bar',
  Overarc: 'arc',
  OverDot: 'dot',
  OverDDot: 'ddot',
  OverTilde: 'tilde',
  Overtilde: 'tilde',
  UnderBar: 'ubar', // \underline{x}
  OverRightArrow: 'vec', // \overrightarrow{v}
  OverLeftArrow: 'vec', // \overleftarrow{v}
};

// Exported so tests can enumerate the folds (name-uniqueness and the
// coverage probe in compile.test.ts) — not mutated by callers.
// `\nabla` reaches CE as an unexpected-command Error (the
// nabla-gradient latex rule leaves it alone before \cdot/\bullet/
// \times); inside a vector op it becomes the Nabla head so codegen can
// emit divergence/curl. CircleMinus is the \bullet disguise (\nabla\cdot
// arrives pre-rewritten to \nabla\bullet); CircledAst the \times one.
const isNablaError = (v: MathJson | undefined): boolean =>
  isArray(v) &&
  head(v) === 'Error' &&
  isArray(v[2]) &&
  head(v[2]) === 'LatexString' &&
  v[2][1] === "'\\nabla'";

export const NORMALIZE_RULES: NormalizeRule[] = [
  {
    name: 'nabla-vector-op',
    why: 'translate the \nabla Error operand in \nabla\\cdot/\\times into the Nabla head so codegen sees divergence/curl instead of an error',
    when: (h, node) =>
      (h === 'CircleMinus' || h === 'CircledAst') &&
      (node as MathJson[]).slice(1).some(isNablaError),
    rewrite: (node, ctx) => [
      head(node),
      ...(node as MathJson[])
        .slice(1)
        .map((a) => (isNablaError(a) ? (['Nabla'] as MathJson) : ctx.norm(a))),
    ] as MathJson,
  },
  {
    name: 'eval-bar',
    // \left. f \right|_{a}^{b}: CE emits the evaluation bar as
    // Power(Subscript(EvaluateAt(f), a), b) — fold back into
    // ['EvaluateAt', f, lo, hi] so codegen can emit the substitution
    // difference. Single-bound forms keep the other slot 'Nothing'.
    // Must precede the generic Subscript/Power rules below — the SupSub
    // wrapper is a bar, not a real subscript or exponent.
    why: 'fold the CE Power/Subscript-wrapped EvaluateAt back into a 3-arg EvaluateAt',
    when: (h, node) =>
      (h === 'Power' &&
        node.length === 3 &&
        isArray(node[1]) &&
        ((head(node[1]) === 'Subscript' &&
          node[1].length === 3 &&
          isArray(node[1][1]) &&
          head(node[1][1]) === 'EvaluateAt') ||
          head(node[1]) === 'EvaluateAt')) ||
      (h === 'Subscript' &&
        node.length === 3 &&
        isArray(node[1]) &&
        head(node[1]) === 'EvaluateAt'),
    rewrite: (node, ctx) => {
      const h = head(node);
      if (h === 'Power' && isArray(node[1]) && head(node[1]) === 'Subscript') {
        const sub = node[1];
        const at = sub[1] as MathJson[];
        return [
          'EvaluateAt',
          ctx.norm(at[1]),
          ctx.norm(sub[2]),
          ctx.norm(node[2]),
        ];
      }
      const at = node[1] as MathJson[];
      return h === 'Subscript'
        ? ['EvaluateAt', ctx.norm(at[1]), ctx.norm(node[2]), 'Nothing']
        : ['EvaluateAt', ctx.norm(at[1]), 'Nothing', ctx.norm(node[2])];
    },
  },
  {
    name: 'matrix-rows',
    // CE emits a stray text-literal row marker ('..') as a trailing
    // Matrix arg — keeping it treated an extra row and produced
    // mismatched dimensions at runtime. (Subsumes the delimiter-style
    // text-literal strip the old chain repeated later, which was dead
    // code — this check already returned for every Matrix node.)
    why: 'drop non-row args CE parks on Matrix nodes',
    when: (h) => h === 'Matrix',
    rewrite: (node, ctx) => [
      'Matrix',
      ...node
        .slice(1)
        .filter(isArray)
        .map((n) => ctx.norm(n)),
    ],
  },
  {
    name: 'nth-derivative',
    // `f^{(3)}(x)` — a parenthesized superscript on a name is the nth
    // derivative, not a power: fold Power(f, Delimiter(n)) into the
    // Derivative node the Apply path already knows how to emit.
    why: 'Power(name, Delimiter(n)) is an nth derivative, not a power',
    when: (h, node) =>
      h === 'Power' &&
      node.length === 3 &&
      isString(node[1]) &&
      isArray(node[2]) &&
      head(node[2]) === 'Delimiter' &&
      node[2].length === 2,
    rewrite: (node, ctx) => [
      'Derivative',
      node[1],
      ctx.norm((node[2] as MathJson[])[1]),
    ],
  },
  {
    name: 'prime-name',
    // `a'` / `x'` unapplied: a primed variable name, not sp.prime.
    why: 'a bare Prime node is a primed variable name',
    when: (h, node) => h === 'Prime' && node.length >= 2 && isString(node[1]),
    rewrite: (node) => {
      const ticks = typeof node[2] === 'number' ? node[2] : 1;
      return `${node[1]}${"'".repeat(ticks)}`;
    },
  },
  {
    name: 'subscript-sign',
    // x_{-} / x_{+} — subscript sign; same composite-subscript naming as
    // x_{i,j} (otherwise the head flags 'unknown head "Subminus"').
    why: 'x_{±} flattens to a composite symbol name like x_{i,j}',
    when: (h, node) =>
      (h === 'Subminus' || h === 'Subplus') && node.length === 2,
    rewrite: (node, ctx) =>
      `${flattenSubscript(ctx.norm(node[1]))}_{${head(node) === 'Subminus' ? '-' : '+'}}`,
  },
  {
    name: 'under-var-bound',
    // \min_{x} f / \max_{x} f: CE folds the underscript into the body as
    // InvisibleOperator('_', under, ...bodyFactors) — the factor list is
    // (underscript, body parts like `f` + `(x)`). Split it back out and
    // rebuild the body through the InvisibleOperator branch so the body
    // folds the same way as a top-level juxtaposition; codegen then
    // sees (body, var, domain?) rather than sp.Min(_ * x * f) with a
    // garbage `_` symbol in it.
    why: "split the '_' underscript out of a fused min/max body",
    when: (h, node) =>
      (h === 'Min' ||
        h === 'Max' ||
        h === 'Infimum' ||
        h === 'Supremum') &&
      node.length === 2 &&
      isArray(node[1]) &&
      head(node[1]) === 'InvisibleOperator' &&
      node[1][1] === '_',
    rewrite: (node, ctx) => {
      const h = head(node) as string;
      // Keep every factor after the bound var — `\max_{x} f(x)` parses
      // as ('_', x, f, (x)) and dropping the delimiter loses the apply.
      const io = node[1] as MathJson[];
      const under = io[2];
      const rest = io.slice(3);
      const bodyN = ctx.norm(
        rest.length === 0
          ? 'Nothing'
          : rest.length === 1
            ? rest[0]
            : (['InvisibleOperator', ...rest] as MathJson),
      );
      const { v, domain } = underVarDomain(under);
      const head2 = h === 'Min' ? 'Minimum' : h === 'Max' ? 'Maximum' : h;
      return domain === undefined
        ? [head2, bodyN, ctx.norm(v, false, false, true)]
        : [
            head2,
            bodyN,
            ctx.norm(v, false, false, true),
            ctx.norm(domain),
          ];
    },
  },
  {
    name: 'brace-annotation',
    // \underbrace{x}_{a} parses as Subscript(UnderBrace(x), a) — the
    // label is an annotation, not a subscript of x: unwrap to the body.
    // \overbrace{x}^{a} similarly parses as Power(OverBrace(x), a) —
    // `a` is a label, not an exponent (it emitted (x)**a before).
    // Must precede `subscript-name` and the Power rules — the bound is
    // not real.
    why: 'under/over-brace labels are annotations — unwrap to the body',
    when: (h, node) =>
      (h === 'Subscript' || h === 'Power') &&
      node.length === 3 &&
      isArray(node[1]) &&
      (head(node[1]) === 'UnderBrace' || head(node[1]) === 'OverBrace'),
    rewrite: (node, ctx) => ctx.norm((node[1] as MathJson[])[1]),
  },
  {
    name: 'rel-chain',
    // a < b <= c / x > y > z etc. — CE nests (sometimes right-,
    // sometimes left-) and mixes heads across a chain; codegen needs
    // the flat pairwise form since sp.Lt(Lt(a,b), c) raises at eval.
    // Equal has its own flattenEqual path (statement-position `=`
    // handling runs in normalize() before rule dispatch). A chain that
    // stays ≤2 operands emits the flattened head — every REL_CHAIN head
    // is a KNOWN_HEAD, so this matches the old fall-through tail.
    why: 'linearize nested/mixed relation chains into an And of pairs',
    when: (h) => REL_CHAIN.has(h),
    rewrite: (node, ctx) => {
      const h = head(node) as string;
      const { ops, args } = chainLinear(node);
      if (args.length > 2)
        return [
          'And',
          ...ops.map((op, i) =>
            ctx.norm([op, args[i], args[i + 1]] as MathJson),
          ),
        ];
      return [h, ...args.map((n) => ctx.norm(n))];
    },
  },
  {
    name: 'solve-mark',
    // `\text{solve}`/`\text{dsolve}`/`\text{pdesolve}` statements —
    // parseCellLatex strips the marker word and wraps the rest as
    // ['SolveMark', kind, node]; this lowers it to Solve/DSolve/
    // PDESolve. Must run before statement-equal so the equations inside
    // stay Equal, not Assign.
    why: 'statement-level \\text{solve}/\\text{dsolve}/\\text{pdesolve} marker lowers to a solver head',
    when: (h) => h === 'SolveMark',
    rewrite: (node, ctx) => {
      if (!ctx.atStatement) {
        ctx.issue(
          'error',
          'a \\text{solve}/\\text{dsolve} marker only reads at the start of a statement',
        );
        return ['Error', `'misplaced-solve-mark'`];
      }
      return solveMarkedStatement(
        isString(node[1]) ? node[1] : 'solve',
        node[2],
        ctx,
      );
    },
  },
  {
    name: 'statement-equal',
    // Statement-level `=` disambiguation — `x = rhs` assigns, a
    // def-marked `f(x) = rhs` defines, anything else stays an equation.
    // Runs before operand normalization because the target shape
    // decides the reading.
    why: 'statement-position Equal resolves to Assign/Def',
    when: (h, _node, ctx) => ctx.atStatement && h === 'Equal',
    rewrite: (node, ctx) =>
      normalizeStatementEqual(node, (n) => ctx.norm(n)),
  },
  {
    name: 'colon-def',
    // `g: (x,y) \mapsto body` — CE types a named function declaration
    // as Colon(name, Function(body, params...)). That's a def like
    // `\text{def} g(x) = body`, not a Colon(...) call (which sympifies
    // the emitted lambda and dies). A `\text{def}`-marked name lands as
    // InvisibleOperator('def', g).
    why: 'Colon(name, Function(...)) at statement level is a def',
    when: (h, node, ctx) => {
      if (!(ctx.atStatement && h === 'Colon' && node.length === 3))
        return false;
      const colonName = isString(node[1])
        ? node[1]
        : defMarkedShape(node[1])?.name;
      return (
        colonName !== undefined &&
        isArray(node[2]) &&
        head(node[2]) === 'Function' &&
        node[2].slice(2).every((p) => paramName(p) !== undefined)
      );
    },
    rewrite: (node, ctx) => {
      const colonName = isString(node[1])
        ? node[1]
        : (defMarkedShape(node[1])?.name as string);
      const fn = node[2] as MathJson[];
      return [
        'Def',
        colonName,
        ['List', ...fn.slice(2).map((p) => paramName(p) as string)],
        ctx.norm(fn[1]),
      ];
    },
  },
  {
    name: 'subtract',
    // CE already emits Add/Negate instead of Subtract under canonical
    // parse; non-canonical keeps Subtract, so normalize the variant
    // either way. Nested Add (x - (3 - y)-style terms) is flattened to
    // the canonical multi-term shape.
    why: 'Subtract(a, b) -> Add(a, Negate(b))',
    when: (h, node) => h === 'Subtract' && node.length === 3,
    rewrite: (node, ctx) => addNode(
      ctx.norm(node[1]), negateNode(ctx.norm(node[2])),
    ),
  },
  {
    name: 'grouping-unwrap',
    // Grouping-only wrappers CE mints from \boxed, \underbrace,
    // \overbrace — the semantics live in the wrapped expression, so
    // collapse to it. Annotated's second arg is a styling-attrs dict.
    why: 'decorative wrapper heads collapse to the wrapped expression',
    when: (h) =>
      h === 'UnderBrace' || h === 'OverBrace' || h === 'Annotated',
    rewrite: (node, ctx) => ctx.norm(node[1]),
  },
  {
    name: 'accent-name',
    // See ACCENT_SUFFIX above — a decorated symbol becomes a suffixed
    // name rather than collapsing to the unmarked one.
    why: 'accent-decorated symbols mint a distinct suffixed name',
    when: (h, node) =>
      ACCENT_SUFFIX[h] !== undefined && node.length >= 2,
    rewrite: (node, ctx) =>
      `${flattenSubscript(ctx.norm(node[1]))}_${ACCENT_SUFFIX[head(node) as string]}`,
  },
  {
    name: 'arc-name',
    // \widehat{AB} / \arc{AB}: CE reads the decoration as the
    // arc/segment AB — a distinct marked symbol, not the product A·B.
    // A single arg is just a wide hat over one symbol.
    why: 'Arc(args) mints a combined marked name (AB_arc / A_hat)',
    when: (h, node) =>
      h === 'Arc' && (node.length === 2 || node.length === 3),
    rewrite: (node) =>
      node.length === 3
        ? `${flattenSubscript(node[1])}${flattenSubscript(node[2])}_arc`
        : `${flattenSubscript(node[1])}_hat`,
  },
  {
    name: 'add-flatten',
    why: 'flatten nested Add into the canonical multi-term shape',
    when: (h) => h === 'Add',
    rewrite: (node, ctx) => [
      'Add',
      ...node
        .slice(1)
        .map((n) => ctx.norm(n))
        .flatMap((n): MathJson[] =>
          isArray(n) && head(n) === 'Add' ? n.slice(1) : [n],
        ),
    ],
  },
  {
    name: 'implicit-product',
    // InvisibleOperator is the non-canonical implicit-application head:
    // `x y` / `2x` are multiplication — and so is `f(x)` (f·x): the
    // parenthesized group is just a factor. Function defs need the
    // `\text{def}` marker; derivative/inverse applications (f'(x),
    // \sin^{-1}(x)) arrive as real Apply nodes from CE, not here.
    why: 'fold a juxtaposition chain: def-declare, apply, iterated-integral repark, matrix word-op, d-quotient, imaginary i',
    when: (h, node) => h === 'InvisibleOperator' && node.length >= 3,
    rewrite: (node, ctx) => {
      // Spacing commands (x\,y) carry no value — they would otherwise
      // leak into the product as `sp.HorizontalSpacing`.
      const items = node.slice(1).filter((n) => !isSpacing(n));
      if (items.length === 0) return 'Nothing';
      if (items.length === 1) return ctx.norm(items[0], ctx.atStatement);
      // `\text{def} f(x)` — a declaration with no `=`: the marker names
      // the function so `f'(x)`/operand forms still apply it.
      if (ctx.atStatement && isDefMark(items[0])) {
        const def = defMarkedShape(['InvisibleOperator', ...items]);
        if (def) return ['Declare', def.name, ['List', ...def.params]];
      }
      const last = items[items.length - 1];
      // firstNorm caches norm(items[0]) for the callee check so a
      // flagging first factor (e.g. a broken \foo) isn't reported twice.
      let firstNorm: MathJson | undefined;
      const fn = items[0];
      if (isDelimiterGroup(last)) {
        const callArgs = delimiterArgs(last).map((n) => ctx.norm(n));
        const mid = items.slice(1, -1).map((n) => ctx.norm(n));
        // Still applied when the callee is more than a bare name: a
        // name the worksheet already defined (`g(2)` after
        // `\text{def} g(x) = …`/`f := x↦…` — declaredFns is populated
        // in statement order, so a forward reference still multiplies),
        // an upright word (\mathrm{foo}(x)/\text{foo}(x) — font-grouped
        // names arrive as one multi-char token; typed letters never
        // fuse into a single token), or a \mapsto lambda in parens
        // ((x↦x²)(3)).
        if (isString(fn) && ctx.declaredFns.has(fn))
          return [
            'Apply',
            fn,
            ...(mid.length === 0 ? callArgs : [...mid, ...callArgs]),
          ];
        if (isString(fn) && fn.length > 1 && !hasTotalDMark(fn)) {
          // `\nabla f(x)` — the grad word applied through juxtaposition
          // is the gradient of the whole product, not a grad(f,x) call.
          if (fn === 'grad' && mid.length > 0) {
            const parts = [...mid, ...callArgs];
            return [
              'Gradient',
              parts.length === 1
                ? parts[0]
                : (['Multiply', ...parts] as MathJson),
            ];
          }
          if (mid.length === 0)
            return ctx.norm([fn, ...callArgs] as MathJson[], ctx.atStatement);
          firstNorm = ctx.norm(fn);
          return ['Apply', firstNorm, ...mid, ...callArgs];
        }
        if (isArray(fn) && !hasTotalDMark(fn)) {
          firstNorm = ctx.norm(fn);
          const fnHead = head(firstNorm);
          if (
            fnHead === 'Function' ||
            fnHead === 'Derivative' ||
            fnHead === 'InverseFunction'
          )
            return ['Apply', firstNorm, ...mid, ...callArgs];
        }
      }
      // Fold `()` groups into the factor list — `f(x)` reads as f·x. A
      // paren tuple keeps its own value (an open interval at two
      // elements, a row matrix beyond): `f(x,y)` is f·(x,y), not f·x·y.
      const flatItems = items.flatMap((n): MathJson[] =>
        isDelimiterGroup(n) && !isParenTuple(n) ? delimiterArgs(n) : [n],
      );
      // `\iint f dx dy` / `\iiint` — a single sign binds only the FIRST
      // differential; the rest land as `d v` pairs in the juxtaposition.
      // Repark every pair inside the integral so codegen sees one
      // iterated integral instead of `∫f dx * d * y`.
      if (isArray(flatItems[0]) && head(flatItems[0]) === 'Integrate') {
        const inner = ctx.norm(flatItems[0]) as MathJson[];
        const integ =
          isArray(inner) && head(inner) === 'Integrate' ? inner : null;
        const rest = flatItems.slice(1);
        const pairs: MathJson[] = [];
        if (
          integ &&
          rest.length >= 2 &&
          rest.every(
            (n, i) =>
              (i % 2 === 0 && isDiffMark(n)) ||
              (i % 2 === 1 && isString(n)),
          )
        ) {
          for (const n of rest) pairs.push(n);
          const integBody = integ.length > 1 ? integ[1] : 'Nothing';
          const lims = integ.length > 2 ? integ[2] : 'Nothing';
          return [
            'Integrate',
            ['Multiply', integBody, ...pairs],
            lims,
          ];
        }
      }
      // `\D` — the `\text{D}` mark must fold before each factor norms:
      // norming unquotes 'D' to an ordinary D symbol. `\D_x f`,
      // `\frac{\D f}{\D x} g`, `\frac{\D}{\D x} f`, `\D f`.
      const td = foldTotalD(flatItems, ctx);
      if (td) return td;
      const args = flatItems.map((n) =>
        n === fn && firstNorm !== undefined ? firstNorm : ctx.norm(n),
      );
      // `\nabla f` — lowered to `\operatorname{grad}` by the latex
      // rewrite — binds the rest of the juxtaposition as the
      // gradient's argument, not a product factor.
      if (args[0] === 'grad')
        return [
          'Gradient',
          args.length === 2
            ? args[1]
            : (['Multiply', ...args.slice(1)] as MathJson),
        ];
      // `\mathrm{trace}(M)`-style word ops fused to a matrix literal
      // arrive as InvisibleOperator(word, Matrix) — a method call, not
      // a product (the Delimiter-less pmatrix shape). On a bare name
      // (`\mathrm{eigenvects} A`) it folds to the same `call` node the
      // parenthesized form produces — codegen's matrix-method branch
      // mints the MatrixSymbol.
      if (args.length === 2) {
        const [w, m] =
          isString(args[0]) && MATRIX_WORD_OPS.has(args[0])
            ? ([args[0], args[1]] as const)
            : isString(args[1]) && MATRIX_WORD_OPS.has(args[1])
              ? ([args[1], args[0]] as const)
              : [undefined, undefined];
        if (w !== undefined && isArray(m) && head(m as MathJson) === 'Matrix')
          return ['MatrixMethod', w, m as MathJson];
        if (w !== undefined && isString(m))
          return ['call', w, m as MathJson];
        // `\mathrm{f}\left(\begin{pmatrix}…\end{pmatrix}\right)` — a
        // registered python def applied to a self-delimiting operand
        // arrives Delimiter-less (the pmatrix absorbs the parens), the
        // same shape as the word-op fold above: call it, don't multiply.
        if (isString(args[0]) && ctx.pyFns.has(args[0]))
          return ['call', args[0], args[1]];
      }
      const folded = foldDQuotient(args);
      if (folded) {
        return folded.length === 1 ? folded[0] : ['Multiply', ...folded];
      }
      // `2i` — and `\pi i`, `e^{i\pi}` (i alongside a number or a named
      // constant) — mean the imaginary unit, matching the canonical
      // Complex-node output. `xi`/`ij` keep i as a symbol.
      const imaginary =
        args.includes('i') &&
        args.some(
          (a) => typeof a === 'number' || CE_CONSTANTS.has(a as string),
        );
      return [
        'Multiply',
        ...args.map((a) => (imaginary && a === 'i' ? 'ImaginaryUnit' : a)),
      ];
    },
  },
  {
    name: 'multiply',
    // Two folds share the head. A canonical product can still carry a
    // `\text{d}` quotient — the same fold as the implicit-product path
    // above. And `\mathrm{trace}(A)`, `\mathrm{rank}(A)`, ... on a
    // matrix literal: CE fuses the operator word and the matrix into a
    // bare product. Only fold word-op when the operand is literally a
    // Matrix — a word * symbol stays a product (and `\mathrm{trace}(M)`
    // on a symbol reaches sp.trace through the call path). The old
    // chain ran the two checks far apart; no rule between them matches
    // a Multiply head, so they merge here without changing dispatch.
    why: 'd-quotient fold, then matrix word-op fold, else plain product',
    when: (h) => h === 'Multiply',
    rewrite: (node, ctx) => {
      // Same `\D` fold as the implicit-product path, on the raw
      // children before 'D' unquotes.
      const td = foldTotalD(
        node
          .slice(1)
          .flatMap((n): MathJson[] =>
            isDelimiterGroup(n) ? delimiterArgs(n) : [n],
          ),
        ctx,
      );
      if (td) return td;
      const args = node.slice(1).map((n) => ctx.norm(n));
      const folded = foldDQuotient(args);
      if (folded)
        return folded.length === 1 ? folded[0] : ['Multiply', ...folded];
      if (node.length === 3) {
        const [w, m] =
          isString(node[1]) && MATRIX_WORD_OPS.has(node[1])
            ? ([node[1], node[2]] as const)
            : isString(node[2]) && MATRIX_WORD_OPS.has(node[2])
              ? ([node[2], node[1]] as const)
              : [undefined, undefined];
        if (w !== undefined && isArray(m) && head(m) === 'Matrix')
          return ['MatrixMethod', w, ctx.norm(m)];
        // A bare name — `\mathrm{rank} A` — is the same call node the
        // parenthesized spelling produces (codegen mints the
        // MatrixSymbol). A defined scalar still flows through and gets
        // the honest "needs a matrix" flag there.
        if (w !== undefined && isString(m))
          return ['call', w, ctx.norm(m)];
      }
      return DECLINE;
    },
  },
  {
    name: 'total-d-quotient',
    // A standalone `\frac{\D f}{\D x}` — the 'D'-marked quotient, read
    // on the raw children before norming unquotes the marks. Not the
    // total-derivative notation; folds to TotalD(body, x) so codegen
    // flags it and emits the plausible partial.
    why: 'a \\text{D}-quotient Divide folds to TotalD(body, x[, order]) — flagged',
    when: (h, node) => h === 'Divide' && node.length === 3,
    rewrite: (node, ctx) => {
      const q = tdQuotient(node[1], node[2]);
      if (q && q.body !== undefined)
        return q.order !== undefined
          ? [
              'TotalD',
              ctx.norm(q.body),
              ctx.norm(q.x, false, false, true),
              ctx.norm(q.order),
            ]
          : ['TotalD', ctx.norm(q.body), ctx.norm(q.x, false, false, true)];
      return DECLINE;
    },
  },
  {
    name: 'gradient-call',
    // `\operatorname{grad}(x)` — the `\nabla` rewrite target in call
    // position — folds to Gradient(body).
    why: 'a grad(...) call folds to Gradient(body)',
    when: (h, node) => h === 'grad' && node.length === 2,
    rewrite: (node, ctx) => ['Gradient', ctx.norm(node[1])],
  },
  {
    name: 'divide-quotient',
    // A standalone `\frac{df}{dx}` (no surrounding product) — the same
    // quotient fold, directly on the Divide node.
    why: 'a d-quotient Divide folds to D(body, x[, order])',
    when: (h, node) => h === 'Divide' && node.length === 3,
    rewrite: (node, ctx) => {
      const q = dQuotient(ctx.norm(node[1]), ctx.norm(node[2]));
      if (q && q.body !== undefined)
        return q.order !== undefined
          ? ['D', q.body, q.x, q.order]
          : ['D', q.body, q.x];
      return DECLINE;
    },
  },
  {
    name: 'operator-bounds',
    // Non-canonical \int/\sum/\prod take Tuple bounds (or a bare
    // variable for indefinite integrals); fold into the canonical
    // Limits shape. BigUnion/BigIntersection carry the same Tuple
    // bounds as \sum/\prod — the tail below folds them to Limits too.
    why: 'Tuple/bare-variable operator bounds fold to a Limits node',
    when: (h) =>
      h === 'Integrate' ||
      h === 'Sum' ||
      h === 'Product' ||
      h === 'BigUnion' ||
      h === 'BigIntersection',
    rewrite: (node, ctx) => {
      const h = head(node) as string;
      // Iterated integrals nest under the outer sign and park EVERY
      // differential in the innermost body — `\int_0^1\int_0^x y dy dx`
      // parses as Integrate(Integrate(y·d·y·d·x, (_,0,x)), (_,0,1)).
      // Peel trailing `'d'` var pairs off the innermost body — the last
      // pair binds the outermost integral — then rebuild the chain with
      // each integral's variable in its Limits slot.
      if (h === 'Integrate') {
        const chain: MathJson[][] = [];
        let inner: MathJson = node;
        while (isArray(inner) && head(inner) === 'Integrate') {
          chain.push(inner as MathJson[]);
          inner = inner[1];
        }
        if (chain.length > 1) {
          const innerBody = ctx.norm(inner);
          const factors =
            isArray(innerBody) && head(innerBody) === 'Multiply'
              ? innerBody.slice(1)
              : [innerBody];
          const vars: MathJson[] = [];
          while (
            vars.length < chain.length &&
            factors.length >= 2 &&
            isDiffMark(factors[factors.length - 2]) &&
            isString(factors[factors.length - 1]) &&
            factors[factors.length - 1] !== 'Nothing'
          ) {
            vars.push(factors.pop() as string);
            factors.pop();
          }
          if (
            vars.length === chain.length &&
            chain.every((n) => n[2] === 'Nothing' || n[2] === undefined)
          ) {
            // Boundless chain — repark every pair innermost-first on one
            // Integrate node so codegen emits a single iterated integral
            // with ONE +C (nested nodes would each append their own).
            const pairs: MathJson[] = [];
            for (let i = vars.length - 1; i >= 0; i--)
              pairs.push('d', vars[i]);
            return ['Integrate', ['Multiply', ...factors, ...pairs], 'Nothing'];
          }
          if (vars.length === chain.length) {
            // vars[k] is chain[k]'s variable (vars[0] = outermost).
            let body: MathJson =
              factors.length === 1
                ? factors[0]
                : factors.length > 1
                  ? ['Multiply', ...factors]
                  : 'Nothing';
            for (let i = chain.length - 1; i >= 0; i--) {
              const lim = chain[i][2];
              const lims =
                isArray(lim) && head(lim) === 'Tuple'
                  ? [
                      ctx.norm(lim[1] ?? 'Nothing', false, false, true),
                      ctx.norm(lim[2] ?? 'Nothing', false, true),
                      ctx.norm(lim[3] ?? 'Nothing', false, true),
                    ]
                  : isString(lim)
                    ? [lim, 'Nothing', 'Nothing']
                    : ['Nothing', 'Nothing', 'Nothing'];
              body = [
                'Integrate',
                body,
                [
                  'Limits',
                  lims[0] === 'Nothing' ? vars[i] : lims[0],
                  lims[1],
                  lims[2],
                ],
              ];
            }
            return body;
          }
        }
      }
      // `\iiint`/`{\iiiint}` — one sign binds every following `d v`:
      // Integrate(body, 'x','y','z'). Repark all pairs on the body so
      // codegen emits one iterated integral with a single +C.
      if (
        h === 'Integrate' &&
        node.length > 3 &&
        node.slice(2).every((n) => isString(n))
      ) {
        const intBody = ctx.norm(node[1]);
        const pairs: MathJson[] = [];
        for (const v of node.slice(2)) pairs.push('d', v);
        return ['Integrate', ['Multiply', intBody, ...pairs], 'Nothing'];
      }
      const body = ctx.norm(node[1]);
      const lim = node[2];
      if (isArray(lim) && head(lim) === 'Tuple') {
        return [
          h,
          body,
          [
            'Limits',
            // Shorter tuples leave slots absent rather than 'Nothing'
            // (e.g. `\sum_{i=1}^{ }` -> Tuple(i, 1)) — fill them so codegen
            // sees a uniform 3-slot Limits.
            ctx.norm(lim[1] ?? 'Nothing', false, false, true),
            ctx.norm(lim[2] ?? 'Nothing', false, true),
            ctx.norm(lim[3] ?? 'Nothing', false, true),
          ],
        ];
      }
      if (isString(lim))
        return [h, body, ['Limits', lim, 'Nothing', 'Nothing']];
      return [h, body, ...node.slice(2).map((n) => ctx.norm(n))];
    },
  },
  {
    name: 'log-base',
    // Lb/Lg are the non-canonical base-2/base-10 log heads.
    why: 'Lb/Lg fold to Log(x, 2|10)',
    when: (h) => h === 'Lb' || h === 'Lg',
    rewrite: (node, ctx) => [
      'Log',
      ctx.norm(node[1]),
      head(node) === 'Lb' ? 2 : 10,
    ],
  },
  {
    name: 'sequence-list',
    why: "fold CE's Sequence comma-list to the List codegen lowers",
    when: (h) => h === 'Sequence',
    rewrite: (node, ctx) => [
      'List',
      ...node.slice(1).map((n) => ctx.norm(n)),
    ],
  },
  {
    name: 'd-name-slots',
    // D(body, x): the variable is a name slot, not a value.
    why: 'D arguments after the body are variable-name slots',
    when: (h) => h === 'D',
    rewrite: (node, ctx) => [
      'D',
      ctx.norm(node[1]),
      ...node.slice(2).map((n) => ctx.norm(n, false, false, true)),
    ],
  },
  {
    name: 'apply-head',
    // Derivative/PartialDerivative/Apply: the first operand is the
    // applied name — a name slot, not a value.
    why: 'the callee slot of Derivative/PartialDerivative/Apply is a name',
    when: (h) =>
      h === 'Derivative' || h === 'PartialDerivative' || h === 'Apply',
    rewrite: (node, ctx) => [
      head(node) as string,
      ctx.norm(node[1], false, false, true),
      ...node.slice(2).map((n) => ctx.norm(n)),
    ],
  },
  {
    name: 'subscript-name',
    // a_{n+1} -> 'a_{n+1}'. Normalize the base first so decorative
    // wrappers (UnderBrace, accent marks) resolve to their flattened
    // name before the subscript suffix is appended — hence ordered
    // after `brace-annotation` and `accent-name`.
    why: 'Subscript flattens to a composite symbol name',
    when: (h, node) => h === 'Subscript' && node.length === 3,
    rewrite: (node, ctx) => {
      const base = flattenSubscript(ctx.norm(node[1]));
      const sub = flattenSubscript(node[2]);
      // A non-name base (\binom{n}{k}_{n=3}) or a subscript position
      // that isn't name-able flattens to '?' — a '?'-riddled name
      // mangles to `sym`/strips silently. Emit the base instead.
      if (base.includes('?') || sub.includes('?')) {
        ctx.issue('note', 'complex subscript — showing the base');
        return ctx.norm(node[1]);
      }
      return `${base}_{${sub}}`;
    },
  },
  {
    name: 'lambda',
    // Lambda node: ["Function", body, param1, ...]. Unwrap a Block body
    // so Integrate/Limit can read it directly.
    why: 'mapsto lambdas normalize body + name-slot params; Typed signature at statement level is a def',
    when: (h) => h === 'Function',
    rewrite: (node, ctx) => {
      const body = node[1];
      const unwrapped =
        isArray(body) && head(body) === 'Block' && body.length === 2
          ? body[1]
          : body;
      // `f: x \mapsto body` — the other half of the colon-declaration
      // shape: the signature slot is Typed(name, params...). At
      // statement level bind the name like `f(params) = body`; inside
      // an expression it stays an anonymous lambda. Read the raw slot
      // (not its normalize) so the signature doesn't emit Typed/literal
      // notes on the way to a shape that discards it.
      const sig = node[2];
      if (
        ctx.atStatement &&
        node.length === 3 &&
        isArray(sig) &&
        head(sig) === 'Typed' &&
        sig.length >= 3
      ) {
        const name = paramName(sig[1]);
        const sigParams = sig
          .slice(2)
          .map((p) => paramName(p) as string | undefined);
        if (name !== undefined && sigParams.every((p) => p !== undefined))
          return [
            'Def',
            name,
            ['List', ...(sigParams as string[])],
            ctx.norm(unwrapped),
          ];
      }
      const params = node
        .slice(2)
        .map((p) => ctx.norm(p, false, false, true));
      return ['Function', ctx.norm(unwrapped), ...params];
    },
  },
  {
    name: 'limits',
    // ["Limits", var, lo, hi] — Nothing bounds are legal (indefinite);
    // the var is a name slot, not a value.
    why: 'Limits bounds may be Nothing; the var slot is a name',
    when: (h) => h === 'Limits',
    rewrite: (node, ctx) => [
      'Limits',
      ctx.norm(node[1], false, false, true),
      ctx.norm(node[2], false, true),
      ctx.norm(node[3], false, true),
    ],
  },
  {
    name: 'delimiter-unwrap',
    // Parenthesized group — CE wraps (a+b) as ["Delimiters", inner, ...];
    // keep the inner expression. A paren tuple lowers to its tuple
    // value: 2 elements to the open Interval, more to a 1×n row Matrix.
    why: 'Delimiter/Delimiters unwrap to the grouped expression; a paren tuple folds to Interval (2) or row Matrix (n)',

    when: (h) => h === 'Delimiters' || h === 'Delimiter',
    rewrite: (node, ctx) => {
      if (!isParenTuple(node)) return ctx.norm(node[1], ctx.atStatement);
      const els = (node[1] as MathJson[])
        .slice(1)
        .map((n) => ctx.norm(n));
      // A 2-tuple is the open interval by default — the same Interval
      // node CE mints for `x \in (a,b)` — or the row matrix in
      // pair-matrix mode.
      if (els.length === 2 && ctx.pairTuple !== 'matrix')
        return ['Interval', ['Open', els[0]], ['Open', els[1]]];
      // Longer tuples (and pairs in pair-matrix mode) are 1×n row
      // matrices — the shape a one-row \begin{pmatrix} literal lowers to.
      return ['Matrix', ['List', ['List', ...els]]];
    },
  },
  {
    name: 'open-interval-pair',
    // In pair-matrix mode `(a,b)` means the row matrix everywhere, so
    // the Interval node CE mints for `x \in (a,b)` membership — and
    // the one intervalBind makes for `v = (a,b)` — lowers to the same
    // 1×2 matrix. Closed `[a,b]` intervals carry no Open marks and
    // stay intervals.
    why: 'pair-matrix mode lowers Interval(Open,Open) to the 1×2 row matrix',
    when: (h, node, ctx) =>
      ctx.pairTuple === 'matrix' &&
      h === 'Interval' &&
      node.length === 3 &&
      isArray(node[1]) &&
      head(node[1]) === 'Open' &&
      isArray(node[2]) &&
      head(node[2]) === 'Open',
    rewrite: (node, ctx) => [
      'Matrix',
      [
        'List',
        [
          'List',
          ctx.norm((node[1] as MathJson[])[1]),
          ctx.norm((node[2] as MathJson[])[1]),
        ],
      ],
    ],
  },
  {
    name: 'assign-chain',
    // `x := y := 5` — `:=>`-nested Assign isn't a value (codegen would
    // emit sp.Assign, which doesn't exist). Flatten to sequential
    // statements: y = 5, x = y.
    why: 'nested Assign flattens to sequential Block statements',
    when: (h, node) =>
      h === 'Assign' &&
      node.length === 3 &&
      isArray(node[2]) &&
      head(node[2]) === 'Assign',
    rewrite: (node, ctx) => [
      'Block',
      ctx.norm(node[2], ctx.atStatement),
      ['Assign', node[1], (node[2] as MathJson[])[1]],
    ],
  },
  {
    name: 'set-decoration',
    // S^{+} / S^{-} / S^{*}: the positive/negative/nonzero part of a
    // standard set — Intersect(S, half) / Complement(S, {0}). The
    // S^{\times} spelling lands as an Error exponent on Power — same
    // multiplicative-group reading (nonzero elements). Anything else
    // keeps the 'call' stub (a decorated non-set has no set meaning).
    why: 'a decorated standard-set leaf folds to its part set',
    when: (h, node) => {
      if (
        (h === 'Superplus' || h === 'Superminus' || h === 'Superstar') &&
        node.length === 2
      )
        return isString(node[1]) && SET_LEAF.has(node[1]);
      return (
        h === 'Power' &&
        node.length === 3 &&
        isString(node[1]) &&
        SET_LEAF.has(node[1]) &&
        // `^{\times}` reads as an Error after latex.ts's times-cross
        // rewrite mints `\circledast`; keep the raw \times/\otimes
        // Error shapes for IR that bypasses parseCellLatex.
        (isArray(node[2]) &&
          head(node[2]) === 'Error' &&
          isArray(node[2][2]) &&
          isString(node[2][2][1]) &&
          (node[2][2][1] === "'\\times'" ||
            node[2][2][1] === "'\\otimes'" ||
            node[2][2][1] === "'\\circledast'"))
      );
    },
    rewrite: (node) => {
      const h = head(node);
      if (h === 'Superplus')
        return ['Intersection', node[1], 'PositiveNumbers'];
      if (h === 'Superminus')
        return ['Intersection', node[1], 'NegativeNumbers'];
      return ['SetMinus', node[1], ['Set', 0]];
    },
  },
  {
    name: 'invop-unwrap',
    // `\text{if }x` (common in \begin{cases} conditions) fuses the
    // label into an InvisibleOperator application — the operator has no
    // sympy meaning; unwrap to the operand. Sits after
    // `implicit-product` (length >= 3) — the guards are disjoint.
    why: 'a 2-node InvisibleOperator unwraps to its operand',
    when: (h, node) => h === 'InvisibleOperator' && node.length === 2,
    rewrite: (node, ctx) =>
      ctx.norm(node[1], ctx.atStatement, ctx.allowNothing),
  },
  {
    name: 'unit-power',
    // M^{\mathrm{T}} / M^{\mathrm{H}}: CE wraps the superscript text as
    // a `__unit__` node — read it as transpose / adjoint rather than an
    // unknown-unit call.
    why: '__unit__ exponents T/H/†/C fold to Transpose/ConjugateTranspose/Conjugate',
    when: (h, node) =>
      h === 'Power' &&
      node.length === 3 &&
      isArray(node[2]) &&
      head(node[2]) === '__unit__' &&
      isString(node[2][1]),
    rewrite: (node, ctx) => {
      const unit = (node[2] as MathJson[])[1];
      if (unit === 'T') return ['Transpose', ctx.norm(node[1])];
      if (unit === 'H' || unit === '†')
        return ['ConjugateTranspose', ctx.norm(node[1])];
      if (unit === 'C')
        return ['call', 'Conjugate', ctx.norm(node[1])];
      return DECLINE;
    },
  },
];

export function normalizeIR(
  json: MathJson | undefined,
  declaredFns?: Set<string>,
  opts: NormalizeOptions = {},
): NormResult {
  const issues: Issue[] = [];
  const pushIssue = (severity: Issue['severity'], message: string) => {
    issues.push(issue(severity, message));
  };
  if (json === undefined) return { ok: true, ir: undefined, issues };
  // Tracks whether the current Block is the outermost (\displaylines)
  // one — only its children count as input lines.
  let blockDepth = 0;

  // Names declared callable by statements seen so far, in cell order —
  // `f(x) = …`, `f(x) := …`, `f: x \mapsto …`, `g: (x,y) \mapsto …`.
  // Calls to one of these aren't "unknown head" (the flag at the tail
  // consults this), and a forward reference still flags because the
  // declaration hasn't been scanned yet. A worksheet compile passes the
  // accumulating set so names declared by earlier cells apply here.
  declaredFns ??= new Set<string>();

  const normalize = (
    node: MathJson,
    atStatement: boolean,
    allowNothing = false,
    asName = false,
  ): MathJson => {
    if (isString(node)) {
      // `asName` marks slots where a string is a variable/operator name
      // (assignment targets, def params, integral variables) rather than a
      // value — no constant or literal mapping applies there.
      if (asName) return node;
      if (isUnexpectedCommand(node)) {
        // Bare marker outside a Power/Subscript pair (the quoted source is
        // recovered there) — flag generically and keep it an Error node so
        // codegen drops the statement.
        pushIssue('error', 'incomplete or unsupported command');
        return ['Error', "'unexpected-command'"];
      }
      const text = isString(node) ? unquote(node) : undefined;
      if (text !== undefined) {
        pushIssue('note', `text literal "${text}" treated as a symbol`);
        return text;
      }
      if (node === 'Nothing') {
        // 'Nothing' is CE's empty-argument marker. Inside Limits bounds it
        // means an indefinite operator (\int f dx) — legitimate input, not
        // a hole — so it is only an error elsewhere.
        if (!allowNothing)
          pushIssue('error', 'empty slot — fill it in or delete it');
        return node;
      }
      // Non-canonical parse leaves `e` as a bare symbol; it is always
      // Euler's constant (sp.E), never a variable.
      if (node === 'e') return 'ExponentialE';
      return node;
    }
    if (!isArray(node)) {
      if (
        typeof node === 'object' &&
        node !== null &&
        !Array.isArray(node) &&
        'str' in node
      ) {
        // {str: "..."} wrapper — same handling as a text literal.
        const inner = String((node as { str: unknown }).str);
        pushIssue('note', `text literal "${inner}" treated as a symbol`);
        return inner;
      }
      return node;
    }

    const h = head(node);
    if (h === undefined) {
      pushIssue('error', 'malformed node without a head');
      return node;
    }

    // \; \, \: etc. produce HorizontalSpacing nodes — pure layout, not
    // operands. Strip them from every node's argument list; a bare spacing
    // node on its own degrades to the empty-slot path.
    if (h === 'HorizontalSpacing') return 'Nothing';
    node = [
      node[0],
      ...node
        .slice(1)
        .filter((c) => !(isArray(c) && head(c) === 'HorizontalSpacing')),
    ];
    if (node.length === 1) return 'Nothing';

    if (h === 'Error') {
      pushIssue('error', describeError(node));
      return node;
    }

    // `\int_{a}^{b}` (or empty-bounds `\int_{ }^{ }`) with nothing after it:
    // CE can't make an Integrate node and instead leaves the 'unexpected-
    // command' marker symbol holding bounds, with the source in a sibling
    // LatexString (`['Power', 'unexpected-command', ['LatexString', …]]`).
    if (node.length >= 3 && isUnexpectedCommand(node[1])) {
      const src =
        isArray(node[2]) && head(node[2]) === 'LatexString' && isString(node[2][1])
          ? (unquote(node[2][1]) ?? node[2][1]).trim()
          : '';
      pushIssue(
        'error',
        describeCommand(src, src ? ` "${src}"` : ''),
      );
      return ['Error', "'unexpected-command'"];
    }

    // A LatexString rides inside CE error shapes as the quoted source
    // fragment — anything reaching normal normalization is a fragment of
    // a broken expression; flag rather than emit a LatexString symbol.
    if (h === 'LatexString') {
      pushIssue('error', 'incomplete or unsupported command');
      return ['Error', "'unexpected-command'"];
    }

    if (h === 'Block' || h === 'WhereBlock') {
      // The outermost Block is the \displaylines wrapper — each child is
      // one input line, so issues raised inside it get stamped with the
      // line's index for line-anchored reporting. (WhereBlock children
      // are fragments of a single line — never top-level lines.)
      const top = h === 'Block' && blockDepth === 0;
      blockDepth++;
      const kids = node.slice(1).map((n, i) => {
        const issuesAt = issues.length;
        const norm = normalize(n, true);
        if (top)
          for (const iss of issues.slice(issuesAt))
            if (iss.line === undefined) iss.line = i;
        return norm;
      });
      blockDepth--;
      return [h, ...kids];
    }

    // a = b = c arrives right-nested as Equal(a, Equal(b, c)); flatten
    // into a multi-arg Equal before dispatch so `statement-equal` and
    // the declaredFns pre-scan below see the chained-relation shape and
    // never mistake the nested form for an assignment.
    if (h === 'Equal') node = flattenEqual(node);
    // `\text{plot} <stmt-expr>` — strip the marker before any other
    // statement rule sees the node; it binds the whole expression
    // (see splitPlotMark).
    if (atStatement) {
      const rest = splitPlotMark(node);
      if (rest !== undefined) {
        // `\text{plot} f \text{ for } cond` — the for-clause is the
        // sampling domain; peel it off the plotted expression.
        if (isArray(rest) && head(rest) === 'Comprehension' && rest.length === 3)
          return ['Plot', normalize(rest[1], false), normalize(rest[2], false)];
        return ['Plot', normalize(rest, false)];
      }
    }

    // Declaration pre-scan: statement-level shapes that bind a callable
    // name (`\text{def}` def/decl, mapsto declaration,
    // `f := (x \mapsto …)`) — recorded before the statement normalizes
    // so the name is visible to calls inside it and in later statements.
    // Kept in normalize() itself: it populates the ctx the rules below
    // read, and fires for heads no rule's `when` would match first.
    if (atStatement) {
      let decl: string | undefined;
      if (h === 'Equal' && isArray(node[1]))
        decl = defMarkedShape(node[1])?.name;
      else if (h === 'InvisibleOperator') decl = defMarkedShape(node)?.name;
      else if (
        h === 'Colon' &&
        isString(node[1]) &&
        isArray(node[2]) &&
        head(node[2]) === 'Function'
      )
        decl = node[1];
      else if (
        h === 'Function' &&
        isArray(node[2]) &&
        head(node[2]) === 'Typed'
      )
        decl = paramName(node[2][1]);
      else if (
        h === 'Assign' &&
        isString(node[1]) &&
        isArray(node[2]) &&
        head(node[2]) === 'Function'
      )
        decl = node[1];
      // `f = x \mapsto body` (with `=`, not `:=`) binds a callable the
      // same way — without this `f(2)` in a later statement flags
      // 'unknown head' even though the cell defines f.
      else if (
        h === 'Equal' &&
        isString(node[1]) &&
        isArray(node[2]) &&
        head(node[2]) === 'Function'
      )
        decl = node[1];
      if (decl !== undefined) declaredFns.add(decl);
    }

    const ctx: NormalizeCtx = {
      declaredFns,
      pyFns: opts.pyFns ?? NO_NAMES,
      pairTuple: opts.pairTuple ?? 'interval',
      atStatement,
      allowNothing,
      asName,
      norm: (n, at = false, an = false, nm = false) =>
        normalize(n, at, an, nm),
      issue: pushIssue,
    };
    for (const rule of NORMALIZE_RULES) {
      if (!rule.when(h, node, ctx)) continue;
      const out = rule.rewrite(node, ctx);
      if (out !== DECLINE) return out;
    }

    if (!KNOWN_HEADS.has(h)) {
      // Heads codegen remaps to real SymPy functions (sp.conjugate,
      // sp.factorial2, ...) aren't "unknown" — flagging them would warn
      // about a stub that never reaches the output. A worksheet-declared
      // name isn't unknown either — `f(3)` after `f(x) = …` calls the
      // def the cell already made.
      if (!CALL_RENAMED.has(h) && !declaredFns.has(h) && !opts.pyFns?.has(h))
        pushIssue('note', `unknown head "${h}" — emitted as ${h}(...)`);
      return callNode(h, ...node.slice(1).map((n) => normalize(n, false)));
    }

    // Common checked shapes have typed construction; other vocabulary and
    // noncanonical arities retain the existing permissive path below.
    if (isPowerNode(node))
      return powerNode(normalize(node[1], false), normalize(node[2], false));
    if (isNegateNode(node))
      return negateNode(normalize(node[1], false));
    return [h, ...node.slice(1).map((n) => normalize(n, false))];
  };


  const ir = normalize(json, true);
  return { ok: !issues.some((i) => i.severity === 'error'), ir, issues };
}
