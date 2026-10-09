// Normalized IR -> target codegen.
//
// The `python` target emits executable SymPy. Cells are compiled
// independently: each cell's output is a standalone script — the import
// line (`from sympy import *` by default, or `import sympy as sp` with
// `sp.` qualifiers when `importAll` is off), `x = Symbol('x')`/
// `f = Function('f')` def lines for every free name the cell uses, then
// its statements. `program` joins all cell bodies under one import for
// the copy-everything button. Any head the mapping table doesn't cover
// falls through to the escape hatch `<head>(args)` so users are never
// blocked by vocabulary gaps.
//
// Statement-level heads (Assign, Def, Block, Solve, Piecewise/Which) are
// Python-only: for the javascript/glsl/c targets the compiler returns an
// error diagnostic instead of code. The expression subset for those
// targets is future work.

import type { Issue, MathJson, NormResult } from './ir';
import { isDiffMark, normalizeIR, unquote } from './ir';
import { CALC_RUNTIME_PY } from './calc-runtime';
// The name tables below are derived views over the notation registry —
// each name lives once in src/compile/notation.ts.
import {
  CALL_RENAMES,
  CE_DISPLAY_NAMES,
  CONSTANTS,
  INVERSE_FUNCS,
  LEAF_SETS,
  MATRIX_METHODS,
  SET_CONSTRAINTS,
  SETISH_SYMBOLS,
  SP_BUILTIN_CALL,
  SP_FUNCS,
  SP_FUNC_MIN_ARGS,
} from './notation';

export interface CellInput {
  json?: MathJson;
}

export interface CompileResult {
  ok: boolean;
  /** The whole worksheet as one script — the import line once, then
   * each cell's body (defs + statements) under a `# cell N` comment. */
  program: string;
  /** The program's import statement — `from sympy import *` (default) or
   * `import sympy as sp` when `importAll` is off. */
  importLine: string;
  /** Standalone script lines per cell — the import line, then that
   * cell's def + statement lines (parallel to the input cells). */
  cellLines: string[][];
  /** Normalization + codegen issues per cell (parallel to the inputs). */
  cellIssues: Issue[][];
  /** Normalized IR per cell. */
  normalized: NormResult[];
  issues: Issue[];
}

// ------------------------------------------------------------------
// Python identifiers

const PY_KEYWORDS = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from',
  'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not',
  'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  'None', 'True', 'False',
]);

// Names the emitted program itself defines: `sp` is the module alias
// (`import sympy as sp`) and the mc_* helpers come from CALC_RUNTIME_PY
// in the calc prelude — a user name colliding with any of them would
// clobber the machinery, so each mangles to a trailing-underscore form.
const RESERVED_IDENTS = new Set([
  'sp',
  'mc_deg',
  'mc_doit',
  'mc_simplify',
  'mc_order',
  'clean_and_simplify',
]);

// CE tags font-styled letters with a per-piece suffix: `\mathrm{a}` ->
// `a_upright`, `\mathbf{x}` -> `x_bold`, `a_{\mathrm{i}}` -> `a_i_upright`.
// Rewrite each tagged piece to the latex command's prefix so the python
// identifier reads like what was typed — `mathrm_a`, `x_mathrm_i`,
// `mathrm_a_mathrm_i` for `\mathrm{a}_{\mathrm{i}}`.
const FONT_TAG_CMD: Record<string, string> = {
  upright: 'mathrm',
  italic: 'mathit',
  bold: 'mathbf',
  calligraphic: 'mathcal',
  script: 'mathscr',
  sansserif: 'mathsf',
  monospace: 'mathtt',
  fraktur: 'mathfrak',
};
const FONT_TAG =
  /(^|_)([A-Za-z]+)_(upright|italic|bold|calligraphic|script|sansserif|monospace|fraktur)(?=_|$)/g;

// Mangle an arbitrary symbol name (e.g. `a_{n+1}`) into a valid python
// identifier that consistently refers to that symbol.
function pyIdent(name: string): string {
  name = name.replace(
    FONT_TAG,
    (_, lead, piece, tag) => `${lead}${FONT_TAG_CMD[tag]}_${piece}`,
  );
  if (RESERVED_IDENTS.has(name)) return `${name}_`;
  if (/^[A-Za-z_]\w*$/.test(name) && !PY_KEYWORDS.has(name)) return name;
  // Prime ticks are meaningful (x' is a distinct variable, not x) —
  // translate them to _prime before the generic strip eats them.
  let out = name
    .replaceAll("'", '_prime')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (out === '') out = 'sym';
  if (/^\d/.test(out)) out = `_${out}`;
  if (PY_KEYWORDS.has(out) || RESERVED_IDENTS.has(out)) out += '_';
  return out;
}

// Statement-position heads that only lower to Python.
const STATEMENT_HEADS = new Set([
  'Assign', 'Def', 'Declare', 'Block', 'WhereBlock', 'Which', 'Piecewise',
  'PythonSource',
]);
const CMP_NESTABLE_HEADS = new Set([
  'Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual',
]);
const STATEMENT_CALL_HEADS = new Set(['solve', 'Solve', 'piecewise', 'Piecewise']);

// Set-valued operator heads — setish only when every operand is too
// (Subsets/Supersets are predicates, not sets, so they don't appear here).
const SETISH_OP_HEADS = new Set([
  'Union', 'Intersection', 'SetMinus', 'Complement',
]);

// Heads that emit a Boolean — the only predicates ConditionSet accepts.
const BOOLISH_HEADS = new Set([
  'Element', 'NotElement', 'Equal', 'NotEqual', 'IdenticallyEqual',
  'Less', 'LessEqual', 'Greater', 'GreaterEqual', 'NotLess',
  'NotLessEqual', 'NotGreater', 'NotGreaterEqual', 'Divides',
  'NotDivides', 'Subset', 'SubsetEqual', 'Superset', 'SupersetEqual',
  'NotSubset', 'NotSubsetNotEqual', 'NotSuperset',
  'NotSupersetNotEqual', 'And', 'Or', 'Not', 'Xor', 'Implies',
  'Equivalent',
]);

// Emission scope — the name tables codegen carries plus the issue sink.
// The trackers are grouped by what they answer, not into one map: their
// lifetimes genuinely differ (worksheet vs cell vs call-stack) and a
// naive merge would alias them. All mutation goes through the facade
// methods below — reads stay direct field access — so multi-tracker
// updates like Assign's value rebind are a single transition.
class Scope {
  /** `import sympy as sp` mode: emit `sp.` qualifiers. With
   * `from sympy import *` (the default) names emit unqualified. */
  qualified: boolean;
  /** Name-binding facts — who is declared and who is bound so far.
   * Worksheet-lifetime under compileCellsForCalc (one scope threads
   * down the cells); cell-lifetime under compileWorksheet (a fresh
   * scope per cell). */
  readonly decls: {
    /** Names defined by Assign/Def anywhere in the worksheet
     * (pre-scan; distinguishes worksheet functions from the sp.<head>
     * escape hatch). */
    declared: Set<string>;
    /** Pre-scanned subset of `declared` bound by a function def
     * (`f(x)=…`, `f: x↦…`) — lets `f^{(n)}` read as a derivative
     * before the def emits. */
    declaredFns: Set<string>;
    /** Names bound so far in emission order (Assign/Def targets plus
     * every name that has had a `= sp.Symbol`/`sp.Function` line
     * emitted). */
    defined: Set<string>;
  };
  /** Emission bookkeeping — minted python identifiers and transient
   * emission state. The ident maps share the scope's lifetime;
   * `bound`/`lambdaBound`/`emitting` are call-stack-lifetime — swapped
   * wholesale (save/restore) by withBound/withBoundOnly/
   * withLambdaBound/withEmitting, never mutated in place — and
   * `constNames` accumulates over the scope's lifetime. */
  readonly emit: {
    /** Free symbol name -> emitted python identifier,
     * insertion-ordered. A def line is emitted in the cell where the
     * name is first needed. */
    symbols: Map<string, string>;
    /** Names used as functions (f'(x), Apply callees) ->
     * sp.Function lines. */
    functions: Map<string, string>;
    /** Names used as matrices (\det A, \operatorname{tr}(A)) ->
     * `sp.MatrixSymbol` def lines. */
    matrices: Map<string, string>;
    /** Argument list recorded for a function name at its decl/call
     * site (`\dot{x}` -> `x` of `t`, `dy/dx` of `x`, `def f(x,y)`,
     * `f(x)`). A bare Function name in operand position (a call arg,
     * arithmetic) raises TypeError, so later references emit the
     * applied form `f(x)`. */
    fnArgs: Map<string, MathJson[]>;
    /** Python-local bound names (Def params) while inside a def body.
     * Call-stack-lifetime: see withBound/withBoundOnly. */
    bound: Set<string>;
    /** Operator-bound variables while inside a
     * Sum/Product/Integrate/Limit (`i` in \sum_{i}) — a bound `i` stays
     * an ordinary Symbol instead of resolving to the imaginary unit.
     * Call-stack-lifetime: see withLambdaBound. */
    lambdaBound: Set<string>;
    /** Function names currently emitting their applied form — guards
     * `f`/`g` mutual-reference cycles (`f` in g's args, `g` in f's).
     * Call-stack-lifetime: see withEmitting. */
    emitting: Set<string>;
    /** Names reserved for constants of integration — cellBody seeds
     * it with every name the cell uses so `C` (then D, E, …) never
     * collides. Each indefinite integral takes and reserves the next
     * free capital. */
    constNames: Set<string>;
  };
  /** Value-kind typing — what a bound name's value IS. Same
   * worksheet-vs-cell lifetime as `decls`. */
  readonly kinds: {
    /** Assigned names whose value is a matrix (`A = [[..]]`, `B = A`) —
     * usable as matrices by `.det()`/`.norm()` etc., and an Eq display
     * for these collapses to literal False. */
    matrixNames: Set<string>;
    /** Assigned names whose value is a set (`A = \{1,2\}`) — later set
     * ops take them as operands directly, not FiniteSet(A) singletons. */
    setNames: Set<string>;
    /** Assigned names whose value is enumerable-finite (`A = \{1,2\}`,
     * `B = A`, `C = {1,2} \cup {3}`) — a quantifier `∀x ∈ A` can fold
     * to `And(*(p.subs(x, e) for e in A))` instead of an unevaluated
     * symbolic Implies. */
    finiteNames: Set<string>;
    /** Assigned names whose value is a python list (`B = [0,1]` — a
     * `List` IR node, not a sympy Set) — set ops must splat it
     * (`sp.FiniteSet(*B)`); `FiniteSet(B)` raises TypeError. */
    listNames: Set<string>;
    /** Dependent variables — names declared as functions through
     * derivative notation (`\dot{x}`, `D(x,t)`, `y'`, `f^{(n)}`). A
     * bare reference is the value `x(t)`, never the unapplied
     * function — they're exempt from callArg's eta-expansion (`f(x)`
     * in `\dot{x} = f(x)` emits `f(x(t))`, not
     * `f(Lambda(t, x(t)))`). */
    depVars: Set<string>;
    /** Symbol kwargs inferred from memberships
     * (`x \in \mathbb{R}` -> `real=True`) applied to this cell's
     * Symbol def lines. */
    assumptions: Map<string, Set<string>>;
    /** Names whose membership pins them to a matrix space
     * (`A \in \mathbb{R}^{2\times2}`) -> emitted `sp.MatrixSymbol`
     * dims. */
    matrixDims: Map<string, [string, string]>;
  };
  issues: Issue[];
  /** Unprefixed issues bucketed per cell (parallel to the inputs). */
  cellIssues: Issue[][];
  /** 1-based cell label for codegen-time issues; 0 = program level. */
  cell: number;
  /** Errors flagged during this cell's emission — a statement that bumps
   * it is dropped instead of emitting `sp.Error(...)`/`None` fragments. */
  errorCount = 0;

  constructor(
    qualified: boolean,
    declared: Set<string>,
    declaredFns: Set<string>,
    matrixNames: Set<string>,
    issues: Issue[],
    cellIssues: Issue[][],
    cell: number,
  ) {
    this.qualified = qualified;
    this.decls = { declared, declaredFns, defined: new Set() };
    this.emit = {
      symbols: new Map(),
      functions: new Map(),
      matrices: new Map(),
      fnArgs: new Map(),
      bound: new Set(),
      lambdaBound: new Set(),
      emitting: new Set(),
      constNames: new Set(),
    };
    this.kinds = {
      matrixNames,
      setNames: new Set(),
      finiteNames: new Set(),
      listNames: new Set(),
      depVars: new Set(),
      assumptions: new Map(),
      matrixDims: new Map(),
    };
    this.issues = issues;
    this.cellIssues = cellIssues;
    this.cell = cell;
  }

  flag(severity: Issue['severity'], message: string): void {
    if (severity === 'error') this.errorCount += 1;
    this.issues.push({
      severity,
      message: this.cell > 0 ? `cell ${this.cell}: ${message}` : message,
    });
    if (this.cell > 0)
      this.cellIssues[this.cell - 1].push({ severity, message });
  }

  // ---- facade mutations -------------------------------------------------

  /** Pre-scan a cell's IR for the names its statements bind: every
   * Assign/Def target into `decls.declared`/`declaredFns`, and the
   * names whose last assignment is matrix-valued into
   * `kinds.matrixNames`. */
  scanDecls(ir: MathJson): void {
    collectDeclared(ir, this.decls.declared, this.decls.declaredFns);
    collectMatrices(ir, this.kinds.matrixNames);
  }

  /** `name` is bound from this point in emission order — Assign/Def
   * targets and names whose decl lines just emitted. */
  markDefined(name: string): void {
    this.decls.defined.add(name);
  }

  markDefinedAll(names: Iterable<string>): void {
    for (const name of names) this.markDefined(name);
  }

  /** `f = x \mapsto …` (and friends) mark the name callable in the
   * pre-scan sense so a later `f(…)` call-folds like a def'd name. */
  declareFn(name: string): void {
    this.decls.declaredFns.add(name);
  }

  /** Claim `name` as a function — the Def/Declare/colon-def binding
   * transition: bound, minted a `functions` ident, and (with params)
   * the arg list a later bare `f` emits applied. */
  claimFunction(name: string, params: MathJson[] = []): void {
    this.decls.defined.add(name);
    this.emit.functions.set(name, pyIdent(name));
    if (params.length > 0) this.emit.fnArgs.set(name, params);
  }

  /** Record an applied call's argument list — a later bare `f` operand
   * emits `f(<args>)` (an unapplied UndefinedFunction operand raises
   * TypeError). */
  noteCallArgs(name: string, args: MathJson[]): void {
    if (args.length > 0) this.emit.fnArgs.set(name, args);
  }

  /** Mark `name` a dependent variable (derivative-notation decls:
   * `\dot{x}`, `y'`, `f^{(n)}`, `D(f,x)`) — `fnArgs` and `depVars`
   * move together: the name reads as the applied `x(t)` ever after. */
  noteDepVar(name: string, args: MathJson[]): void {
    this.emit.fnArgs.set(name, args);
    this.kinds.depVars.add(name);
  }

  /** Bind `name` to an assigned value — the whole transition in one
   * place: bound, every value-kind set refreshed to the RHS's typing
   * (a rebind to a scalar drops stale kind entries), and function
   * residue cleared (`fnArgs`/`depVars`) since the name is a value now
   * — later references emit `x`, not `x(t)`. `functions` deliberately
   * keeps its entry: it still carries a pending `x = sp.Function` decl
   * line for statements that applied the name before this Assign. */
  bindAssigned(
    name: string,
    value: { matrix: boolean; set: boolean; finite: boolean; list: boolean },
  ): void {
    this.decls.defined.add(name);
    for (const [names, on] of [
      [this.kinds.matrixNames, value.matrix],
      [this.kinds.setNames, value.set],
      [this.kinds.finiteNames, value.finite],
      [this.kinds.listNames, value.list],
    ] as const) {
      if (on) names.add(name);
      else names.delete(name);
    }
    this.emit.fnArgs.delete(name);
    this.kinds.depVars.delete(name);
  }

  /** Membership-derived Symbol kwargs accumulate for a
   * first-referenced name (`x \in \mathbb{R}` before any def ->
   * `real=True`). */
  assume(member: string, kwargs: Iterable<string>): void {
    const acc = this.kinds.assumptions.get(member) ?? new Set<string>();
    for (const k of kwargs) acc.add(k);
    this.kinds.assumptions.set(member, acc);
  }

  /** `A \in \mathbb{R}^{m\times n}` pins the member to emitted
   * `sp.MatrixSymbol` dims — the membership is the only place the
   * member's shape is stated. */
  pinMatrixDims(member: string, dims: [string, string]): void {
    this.kinds.matrixDims.set(member, dims);
  }

  /** Reserve every name a cell uses so constants of integration mint
   * only free capitals (`C`, else `D`, `E`, …). */
  reserveConstNames(ir: MathJson): void {
    allNames(ir, this.emit.constNames);
    for (const name of this.decls.declared) this.emit.constNames.add(name);
  }

  // ---- call-stack bindings (save/restore — never in-place) ---------

  /** Run `fn` with `vars` added to the Python-local bound set
   * (lambda params). Restored on return — including a throw. */
  withBound<T>(vars: readonly string[], fn: () => T): T {
    if (vars.length === 0) return fn();
    const saved = this.emit.bound;
    this.emit.bound = new Set([...saved, ...vars]);
    try {
      return fn();
    } finally {
      this.emit.bound = saved;
    }
  }

  /** Run `fn` with `vars` as the WHOLE bound set — a `def f(x,y)`
   * param list shadows outer bindings wholesale, not cumulatively. */
  withBoundOnly<T>(vars: readonly string[], fn: () => T): T {
    const saved = this.emit.bound;
    this.emit.bound = new Set(vars);
    try {
      return fn();
    } finally {
      this.emit.bound = saved;
    }
  }

  /** Run `fn` with `vars` added to the operator-bound set
   * (Sum/Product/Integrate/Limit/D variables — a bound `i` stays an
   * ordinary Symbol instead of resolving to the imaginary unit). */
  withLambdaBound<T>(vars: readonly string[], fn: () => T): T {
    if (vars.length === 0) return fn();
    const saved = this.emit.lambdaBound;
    this.emit.lambdaBound = new Set([...saved, ...vars]);
    try {
      return fn();
    } finally {
      this.emit.lambdaBound = saved;
    }
  }

  /** Cycle guard for the applied-form emit: `name` counts as emitting
   * for `fn`'s duration so a second hop (`f` in g's args, `g` in f's)
   * doesn't recurse. */
  withEmitting<T>(name: string, fn: () => T): T {
    this.emit.emitting.add(name);
    try {
      return fn();
    } finally {
      this.emit.emitting.delete(name);
    }
  }
}

const isArr = (v: MathJson | undefined): v is MathJson[] => Array.isArray(v);
const isStr = (v: MathJson | undefined): v is string => typeof v === 'string';
const headOf = (v: MathJson | undefined): string | undefined =>
  isArr(v) && isStr(v[0]) ? v[0] : undefined;
const isHead = (v: MathJson | undefined, h: string): v is MathJson[] =>
  headOf(v) === h;

// The matrix-valued walk shared by emission and the matrixNames
// pre-scan: a `Matrix` literal or a `isMatrixLeaf` name, or a
// composition that stays a matrix — a sum/negation of matrix terms, a
// product/quotient/power with a matrix factor, or a matrix-returning
// op (transpose/adjoint/inverse). `isMatrixLeaf` decides what a bare
// name resolves to (scope-bound at emission, sequential at pre-scan).
function matrixValuedNode(
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
    default:
      return false;
  }
}

function numText(node: MathJson): string {
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object' && node !== null && 'num' in node)
    return String((node as { num: unknown }).num);
  return String(node);
}

// CE's empty-argument marker (or a hole/absent slot).
const missingArg = (n: MathJson | undefined): boolean =>
  n === undefined || n === 'Nothing' || isHead(n, 'Error');

// Numeric literal node — number or `{num: "..."}`.
const isNum = (v: MathJson | undefined): boolean =>
  typeof v === 'number' ||
  (typeof v === 'object' && v !== null && 'num' in v);

// Concrete integer value of a numeric literal, else undefined.
const asInt = (v: MathJson | undefined): number | undefined => {
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
const stripZeroSuffix = (s: string): string | undefined =>
  s.endsWith('_{0}')
    ? s.slice(0, -4)
    : s.endsWith('_0')
      ? s.slice(0, -2)
      : undefined;

// Python precedence levels for parenthesization.
const PREC_LOW = 0; // expression statements, call args
const PREC_ADD = 10;
const PREC_MUL = 20;
const PREC_UNARY = 30;
const PREC_POW = 40;
const PREC_ATOM = 90;

class Emitter {
  scope: Scope;
  constructor(scope: Scope) {
    this.scope = scope;
  }

  /** `sp.` qualifier prefix — empty under `from sympy import *`. */
  private get sp(): string {
    return this.scope.qualified ? 'sp.' : '';
  }

  /** Does this node name a worksheet-declared matrix? A Matrix literal
   * is already handled by `isHead(…, 'Matrix')` at the call site. */
  private matrixRef(node: MathJson | undefined): boolean {
    return (
      isStr(node) &&
      (this.scope.kinds.matrixNames.has(node) || this.scope.kinds.matrixDims.has(node))
    );
  }

  /** `I_<n>` with a whole-number subscript is the n×n identity —
   * returns the dim or null. An explicit `I_n = …` binding wins
   * (`defined` covers assign/def targets). */
  private identityDim(node: MathJson | undefined): string | null {
    if (!isStr(node) || this.scope.decls.defined.has(node)) return null;
    const m = /^I_(\d+)$/.exec(node);
    return m ? m[1] : null;
  }

  /** Is this node matrix-valued? A `Matrix` literal, a declared matrix
   * name, or a composition that stays a matrix: a sum/negation of
   * matrix terms, a product/quotient/power with a matrix factor, or a
   * matrix-returning op (transpose/adjoint/inverse). `minted` also
   * counts MatrixSymbol-minted names — only for value-typing (matrixRef
   * leaves them out because MatrixExpr lacks the .norm()/.trace()
   * method surface some callers emit). */
  matrixValued(node: MathJson | undefined, minted = false): boolean {
    return matrixValuedNode(
      node,
      (name) =>
        this.matrixRef(name) ||
        (minted && this.scope.emit.matrices.has(name)) ||
        this.identityDim(name) !== null,
    );
  }

  /** matrixValued AND every matrix leaf is a `Matrix` literal — the
   * concrete-Matrix methods (`.rank()`, `.norm()`, `.eigenvals()`…)
   * exist there but not on sympy MatrixExpr. */
  private concreteMatrix(node: MathJson | undefined): boolean {
    if (isHead(node, 'Matrix') || this.identityDim(node)) return true;
    if (!isArr(node)) return false;
    const operands = node.slice(1) as MathJson[];
    switch (headOf(node)) {
      case 'Add':
        return operands.every((a) => this.concreteMatrix(a));
      case 'Negate':
      case 'Transpose':
      case 'ConjugateTranspose':
      case 'Inverse':
        return this.concreteMatrix(node[1]);
      case 'Multiply':
      case 'Divide':
      case 'Power':
        return operands.some((a) => this.concreteMatrix(a));
      default:
        return false;
    }
  }

  /** A matrix body's `m, n` dims (as MatrixSymbol args) — literal
   * `Matrix` nodes read them statically; declared `A \in R^{mxn}` names
   * carry them in matrixDims; cell-assigned matrices fall back to
   * `*A.shape` so the dims resolve when the program runs. Non-matrices
   * get null. */
  private matrixShape(node: MathJson | undefined): string | null {
    if (isHead(node, 'Matrix')) {
      const rows =
        node.length === 2 && isHead(node[1], 'List')
          ? node[1].slice(1)
          : node.slice(1);
      const cols =
        rows.length > 0 && isHead(rows[0], 'List') ? rows[0].length - 1 : 1;
      return `${rows.length}, ${cols}`;
    }
    if (isStr(node)) {
      const dim = this.scope.kinds.matrixDims.get(node);
      if (dim) return `${dim[0]}, ${dim[1]}`;
      if (this.scope.kinds.matrixNames.has(node))
        return `*${this.emit(node)}.shape`;
    }
    return null;
  }

  /** SymPy constant: qualified in `import sympy as sp` mode; Python
   * builtins (True/False) and literals stay unqualified either way. */
  private constName(c: string): string {
    if (c === 'True' || c === 'False') return c;
    return c.startsWith('-') ? `-${this.sp}${c.slice(1)}` : `${this.sp}${c}`;
  }

  private alloc(map: Map<string, string>, name: string): string {
    const existing = map.get(name);
    if (existing) return existing;
    let ident = pyIdent(name);
    // Different symbol names can mangle to the same ident (a_{n} vs a_n) —
    // disambiguate deterministically by first-seen order.
    let n = 2;
    const used = (v: string) =>
      this.scope.emit.symbols.has(v) ||
      [...this.scope.emit.symbols.values()].includes(v) ||
      [...this.scope.emit.functions.values()].includes(v) ||
      [...this.scope.emit.matrices.values()].includes(v);
    while (used(ident)) ident = `${pyIdent(name)}_${n++}`;
    map.set(name, ident);
    return ident;
  }

  private sym(name: string): string {
    // A bare `i` in value position is the imaginary unit (i^2 -> -1,
    // e^{i\pi} -> -1); only a bound operator/def variable or an
    // `i = …` assignment keeps it an ordinary symbol.
    if (
      name === 'i' &&
      !this.scope.decls.defined.has(name) &&
      !this.scope.emit.bound.has(name)
    ) {
      return this.scope.emit.lambdaBound.has(name)
        ? this.alloc(this.scope.emit.symbols, name)
        : `${this.sp}I`;
    }
    if (this.scope.emit.bound.has(name)) return pyIdent(name);
    if (this.scope.emit.functions.has(name)) {
      const ident = this.scope.emit.functions.get(name)!;
      const argNodes = this.scope.emit.fnArgs.get(name);
      if (argNodes === undefined || this.scope.emit.emitting.has(name))
        return ident;
      // Bare function name in arithmetic position (`f + 1`) — emit the
      // applied form `f(x)` recorded at the decl/call site: the pointwise
      // reading matches, and the bare name can't sympify anyway. Call-arg
      // position (`g(f)`, `sin(f)`) is handled in applyArgs, which emits
      // the unapplied eta form `sp.Lambda(x, f(x))`. The emitting guard
      // breaks f/g mutual-reference cycles on the second hop.
      return this.scope.withEmitting(
        name,
        () => `${ident}(${argNodes.map((a) => this.emit(a)).join(', ')})`,
      );
    }
    if (this.scope.decls.defined.has(name)) return pyIdent(name);
    // `v^T A v` — `v` was claimed by the matrix tier (Transpose), so a
    // later bare `v` is the SAME name, not a new symbol: reuse the
    // MatrixSymbol ident instead of minting `v_2`.
    if (this.scope.emit.matrices.has(name))
      return this.scope.emit.matrices.get(name)!;
    const idDim = this.identityDim(name);
    if (idDim) return `${this.sp}eye(${idDim})`;
    return this.alloc(this.scope.emit.symbols, name);
  }

  // A name used as a function (f in f'(x)) needs sp.Function, not
  // sp.symbols — symbols aren't callable.
  private fn(name: string): string {
    if (this.scope.decls.defined.has(name)) {
      // `x = 5` then `\dot{x}` — the name is already a bound value;
      // `x(t)` raises TypeError at exec. Def'd/lambda-bound names stay
      // callable (call-fold).
      if (!this.scope.decls.declaredFns.has(name))
        this.scope.flag('error', `${name} is bound to a value — not callable`);
      return pyIdent(name);
    }
    return this.alloc(this.scope.emit.functions, name);
  }

  // Whether a name reads as a function for `^{(n)}` derivative notation:
  // def'd (`f(x)=…`/`f: x↦…`), already used in call position, or fully
  // undeclared — like `r(x)`, callee use itself makes it a function.
  // A name bound as a variable (symbol, assign target) is not.
  private isFunctionish(name: string): boolean {
    return (
      this.scope.emit.functions.has(name) ||
      this.scope.decls.declaredFns.has(name) ||
      (!this.scope.emit.symbols.has(name) && !this.scope.decls.defined.has(name))
    );
  }

  // A name used as a matrix (\det A) needs sp.MatrixSymbol — det/trace
  // of a bare Symbol raises in the worker. Names already bound (an
  // earlier `A = …` assignment) reuse their own ident instead.
  private mat(name: string): string {
    if (this.scope.decls.defined.has(name)) return pyIdent(name);
    const dim = this.identityDim(name);
    if (dim) return `${this.sp}eye(${dim})`;
    return this.alloc(this.scope.emit.matrices, name);
  }

  // Emit the argument of a matrix-valued op (det/trace): a bare
  // identifier becomes a MatrixSymbol unless it is already a scalar
  // Symbol/Function here — then flag rather than crash in the worker.
  private matrixArg(node: MathJson, op: string): string | null {
    if (!isStr(node)) return this.emit(node, PREC_ATOM);
    if (
      this.scope.emit.symbols.has(node) ||
      this.scope.emit.functions.has(node) ||
      (this.scope.decls.defined.has(node) &&
        !this.scope.kinds.matrixNames.has(node) &&
        !this.scope.kinds.matrixDims.has(node))
    ) {
      this.scope.flag('error', `${op} needs a matrix — ${node} is a scalar here`);
      return this.emit(node, PREC_ATOM);
    }
    return this.mat(node);
  }

  /** Lower `x cmp b`/`b cmp x` into a real domain emit for
   * `expr for x <cond>` — returns [domain code, var name] or
   * undefined when neither side is a bare variable. */
  private relationalDomain(
    cond: MathJson | undefined,
  ): [string, string] | undefined {
    if (!isArr(cond) || cond.length !== 3) return undefined;
    const head = headOf(cond) ?? '';
    let v: string;
    let b: MathJson;
    let dir = head;
    if (isStr(cond[1])) {
      v = cond[1];
      b = cond[2];
    } else if (isStr(cond[2])) {
      v = cond[2];
      b = cond[1];
      dir =
        head === 'Greater'
          ? 'Less'
          : head === 'Less'
            ? 'Greater'
            : head === 'GreaterEqual'
              ? 'LessEqual'
              : head === 'LessEqual'
                ? 'GreaterEqual'
                : head;
    } else {
      return undefined;
    }
    const rhs = this.emit(b);
    const sp = this.sp;
    switch (dir) {
      case 'Greater':
        return [`${sp}Interval.open(${rhs}, ${sp}oo)`, v];
      case 'GreaterEqual':
        return [`${sp}Interval(${rhs}, ${sp}oo)`, v];
      case 'Less':
        return [`${sp}Interval.open(-${sp}oo, ${rhs})`, v];
      case 'LessEqual':
        return [`${sp}Interval(-${sp}oo, ${rhs})`, v];
      case 'Equal':
        return [`${sp}FiniteSet(${rhs})`, v];
      case 'NotEqual':
        return [`${sp}Complement(${sp}S.Reals, ${sp}FiniteSet(${rhs}))`, v];
      default:
        return undefined;
    }
  }

  private isNegated(node: MathJson): boolean {
    if (headOf(node) === 'Negate') return true;
    if (typeof node === 'number') return node < 0;
    if (typeof node === 'object' && node !== null && 'num' in node)
      return String((node as { num: unknown }).num).startsWith('-');
    return false;
  }

  /** A positive integer literal — the only `Power` exponent a set can
   * take (`S.Reals**2` is a ProductSet; `S.Reals**n` raises). */
  private isPosInt(v: MathJson | undefined): v is number {
    return typeof v === 'number' && Number.isInteger(v) && v > 0;
  }

  /** Domain constraints a set operand implies for a member symbol.
   * `assuming` marks memberships that need a `with assuming(...)` block
   * (the member's domain can't be expressed by the set itself). */
  private constraintsFor(set: MathJson | undefined): {
    kwargs: string[];
    preds: string[];
    assuming: boolean;
  } | null {
    if (isStr(set)) {
      const c = SET_CONSTRAINTS[set];
      return c ? { ...c, assuming: false } : null;
    }
    // A real interval constrains its members to the reals.
    if (isHead(set, 'Interval'))
      return { kwargs: ['real=True'], preds: ['real'], assuming: true };
    return null;
  }

  /** Record membership-derived Symbol kwargs for a first-referenced
   * name (`x \in \mathbb{R}` before any def -> `real=True`). Also
   * records MatrixSymbol dims for `A \in \mathbb{R}^{m\times n}` — the
   * membership is the only place the member's shape is stated. */
  private assumeFrom(member: MathJson, set: MathJson): void {
    if (
      !isStr(member) ||
      this.scope.decls.defined.has(member) ||
      this.scope.emit.bound.has(member)
    )
      return;
    if (
      isHead(set, 'Power') &&
      this.isSetish(set[1]) &&
      isHead(set[2], 'Multiply') &&
      (set[2] as MathJson[]).length === 3 &&
      (set[2] as MathJson[]).slice(1).every((e) => this.isPosInt(e))
    ) {
      const dims = (set[2] as MathJson[]).slice(1) as number[];
      this.scope.pinMatrixDims(member, [String(dims[0]), String(dims[1])]);
      return;
    }
    const c = this.constraintsFor(set);
    if (!c) return;
    this.scope.assume(member, c.kwargs);
  }

  /** `with ...assuming(...):` header for compound memberships like
   * `x \in (a,b]`, or null when the statement emits flat. */
  assumingWrap(node: MathJson): string | null {
    if (!isArr(node) || headOf(node) !== 'Element' || node.length < 3)
      return null;
    const [member, set] = [node[1], node[2]];
    if (!isStr(member)) return null;
    const c = this.constraintsFor(set);
    if (!c?.assuming) return null;
    const ident =
      this.scope.emit.bound.has(member) || this.scope.decls.defined.has(member)
        ? pyIdent(member)
        : (this.scope.emit.symbols.get(member) ?? pyIdent(member));
    const preds = c.preds.map((p) => `${this.sp}Q.${p}(${ident})`);
    const joined =
      preds.length === 1 ? preds[0] : preds.map((p) => `(${p})`).join(' & ');
    return `with ${this.sp}assuming(${joined}):`;
  }

  /** Is this node guaranteed to emit a SymPy Set? Gates Contains/Union/
   * Complement emission — those raise TypeError on plain Symbols.
   * Recursive: `A \cap B` on plain symbols isn't setish either (the op
   * would emit a Function stub that Contains still rejects). */
  isSetish(n: MathJson | undefined): boolean {
    if (isStr(n)) return SETISH_SYMBOLS.has(n) || this.scope.kinds.setNames.has(n);
    if (!isArr(n)) return false;
    const h = headOf(n);
    // \{1,2\} can arrive call-wrapped (['call', 'Set', ...]) when the
    // normalizer wasn't involved — the callee name is what matters.
    if (h === 'call') {
      if (!isStr(n[1])) return false;
      if (n[1] === 'Set' || n[1] === 'Interval' || n[1] === 'FiniteSet')
        return true;
      // A call-wrapped set op emits a set only when its operands do.
      if (SETISH_OP_HEADS.has(n[1]))
        return n.slice(2).every((a) => this.isSetish(a));
      // `S*` emits a set when S is a set (S ∖ {0}); S^± only reads
      // as S ∩ (0,±∞) on the number sets ℝ/ℤ (and their `_0` forms)
      // — on anything else `^{+}` is the pseudoinverse, not a set.
      if (n[1] === 'Superstar')
        return this.isSetish(n[2]);
      if (
        n[1] === 'Superminus' ||
        n[1] === 'Superplus' ||
        n[1] === 'PseudoInverse'
      ) {
        const base = isStr(n[2]) ? stripZeroSuffix(n[2]) : undefined;
        return (
          isStr(n[2]) &&
          (n[2] === 'RealNumbers' ||
            n[2] === 'Integers' ||
            (base !== undefined && SETISH_SYMBOLS.has(base)))
        );
      }
      return false;
    }
    if (h === 'Interval' || h === 'Set') return true;
    if (h === 'Power')
      return this.isSetish(n[1]) && this.isPosInt(n[2]);
    // SymPy overloads `*` on sets as the Cartesian product — an
    // all-setish Multiply emits a real ProductSet.
    if (h === 'Multiply')
      return n.slice(1).every((a) => this.isSetish(a));
    if (h !== undefined && SETISH_OP_HEADS.has(h))
      return n.slice(1).every((a) => this.isSetish(a));
    return false;
  }

  /** Enumerable-finite set nodes: a `Set` literal, a name bound to one
   * (`finiteNames`), or a `Union`/`Intersection` of finite nodes —
   * `for e in <these>` terminates. Intervals and the number sets are
   * NOT finite even though they're setish (infinite iteration). */
  isFiniteSet(n: MathJson | undefined): boolean {
    if (isStr(n)) return this.scope.kinds.finiteNames.has(n);
    if (!isArr(n)) return false;
    const off = headOf(n) === 'call' ? 2 : 1;
    const h = off === 2 ? n[1] : headOf(n);
    if (h === 'Set' || h === 'FiniteSet') return n.length > off;
    // A bare `List` (`[0,1]`) emits a python list — finite, iterable.
    if (h === 'List') return n.length > off;
    if (h === 'Union' || h === 'Intersection')
      return n.slice(off).every((a) => this.isFiniteSet(a));
    return false;
  }

  /** The member operand of Element/NotElement: a `(x, y)` tuple needs
   * `sp.Tuple` — the `List` emission `[x, y]` isn't a SymPy Expr and
   * Function/Contains raise TypeError on it. */
  private emitMember(member: MathJson): string {
    if (isHead(member, 'List'))
      return `${this.sp}Tuple(${member
        .slice(1)
        .map((a) => this.emit(a))
        .join(', ')})`;
    return this.emit(member);
  }

  /** Emit `n` as a set op's operand: set-ish nodes emit directly, plain
   * expressions wrap as `sp.FiniteSet(...)` so Union/Intersection/
   * Complement compute instead of raising TypeError on bare Symbols. */
  private setArg(n: MathJson): string {
    if (this.isSetish(n)) return this.emit(n);
    // A python list can't nest inside FiniteSet's args — splat it.
    if (isHead(n, 'List') || (isStr(n) && this.scope.kinds.listNames.has(n)))
      return `${this.sp}FiniteSet(*${this.emit(n)})`;
    return `${this.sp}FiniteSet(${this.emit(n)})`;
  }

  /** Comparison chains. `x < y < z` arrives flat as `Less(x, y, z)`
   * (emit natively chained — `Lt(x, y, z)` is `And(x<y, y<z)`), but
   * mixed chains nest: `1 < x ≤ 2` is `LessEqual(Less(1,x), 2)` and
   * `x > y > z` is `Greater(x, Greater(y,z))` — a nested relation
   * reads pairwise as `And`. */
  private cmpChain(
    rel: 'Lt' | 'Le' | 'Gt' | 'Ge' | 'Ne' | 'Eq',
    args: MathJson[],
  ): [string, number] {
    const isCmp = (n: MathJson | undefined): n is MathJson[] =>
      isArr(n) && CMP_NESTABLE_HEADS.has(headOf(n) ?? '');
    const [a, b] = args;
    if (isCmp(a)) {
      // Left-nested: `LessEqual(Less(1,x), 2…)` → And(inner, rel(last,…))
      const [tail] = this.cmpChain(rel, [a[a.length - 1], ...args.slice(1)]);
      return [`${this.sp}And(${this.emit(a)}, ${tail})`, PREC_ATOM];
    }
    if (args.length > 2) {
      // SymPy relationals take exactly two operands — chain via And.
      const pairs = args
        .slice(0, -1)
        .map(
          (n, i) =>
            `${this.sp}${rel}(${this.emit(n)}, ${this.emit(args[i + 1])})`,
        );
      return [`${this.sp}And(${pairs.join(', ')})`, PREC_ATOM];
    }
    if (isCmp(b)) {
      // Right-nested: `Greater(x, Greater(y,z))` → And(rel(x,y), inner)
      const [head] = this.cmpChain(rel, [a, b[1]]);
      return [`${this.sp}And(${head}, ${this.emit(b)})`, PREC_ATOM];
    }
    return [`${this.sp}${rel}(${this.emit(a)}, ${this.emit(b)})`, PREC_ATOM];
  }

  /** Emit a `call`-tier Function stub for a head we know but can't map —
   * same flag + output shape normalizeIR's unknown-head path produces. */
  private unknownCall(h: string, args: MathJson[]): [string, number] {
    this.scope.flag('note', `unknown head "${h}" — emitted as ${h}(...)`);
    const fnArgs = args.filter((a) => a !== h);
    this.scope.noteCallArgs(h, fnArgs);
    return [
      `${this.fn(h)}(${args.map((a) => this.callArg(a)).join(', ')})`,
      PREC_ATOM,
    ];
  }

  /** Emit one call argument. A bare declared-function name in arg
   * position means the function itself (`g(f)`, `sin(f)`) — emit the
   * unapplied eta form `sp.Lambda(x, f(x))` since the bare name can't
   * sympify. Dependent variables (depVars) stay applied — `f(x)` in an
   * ODE body means the value `x(t)`. Arithmetic positions (`f + 1`)
   * don't reach here — sym() emits those applied. */
  private callArg(a: MathJson): string {
    if (
      isStr(a) &&
      this.scope.emit.functions.has(a) &&
      !this.scope.kinds.depVars.has(a) &&
      !this.scope.emit.emitting.has(a)
    ) {
      const argNodes = this.scope.emit.fnArgs.get(a);
      if (argNodes !== undefined) {
        return this.scope.withEmitting(a, () => {
          // A literal call site (`f(2)`) recorded non-symbol args that
          // can't be Lambda params — synthesize bound names of the same
          // arity instead of falling back to `f(2)`.
          const params = argNodes.every(isStr)
            ? argNodes.map((x) => this.emit(x))
            : argNodes.map((_, i) => `${this.sp}Symbol("x${i === 0 ? '' : i}")`);
          const sig = params.length === 1 ? params[0] : `(${params.join(', ')})`;
          return `${this.sp}Lambda(${sig}, ${this.scope.emit.functions.get(a)!}(${params.join(', ')}))`;
        });
      }
    }
    return this.emit(a);
  }

  /** Emit `node`, wrapping in parens when its precedence is below minPrec. */
  emit(node: MathJson | undefined, minPrec = PREC_LOW): string {
    if (node === undefined || node === null) {
      this.scope.flag('error', 'malformed node cannot be emitted');
      return 'None';
    }
    // Error nodes carry a normalizer diagnostic — flag so the enclosing
    // statement is dropped instead of emitting `sp.Error(...)` noise.
    if (isHead(node, 'Error')) {
      this.scope.flag('error', UNPARSEABLE_MSG);
      return 'None';
    }
    const [text, prec] = this.inner(node);
    return prec < minPrec ? `(${text})` : text;
  }

  private inner(node: MathJson): [string, number] {
    if (typeof node === 'number' || (typeof node === 'object' && node !== null && 'num' in node))
      return [numText(node), PREC_ATOM];
    if (isStr(node)) {
      // \mathbb{P} — no `S.Primes` exists; the primes set is a
      // ConditionSet over the naturals. \mathbb{R}_+/\mathbb{R}^+ —
      // positive reals — is an open interval, not an S.* constant.
      if (node === 'Primes')
        return [
          `${this.sp}ConditionSet(${this.sp}Symbol("p"), ${this.sp}Q.prime(${this.sp}Symbol("p")), ${this.sp}S.Naturals)`,
          PREC_ATOM,
        ];
      if (node === 'PositiveNumbers')
        return [`${this.sp}Interval.open(0, ${this.sp}oo)`, PREC_ATOM];
      if (node === 'NegativeNumbers')
        return [`${this.sp}Interval.open(-${this.sp}oo, 0)`, PREC_ATOM];
      const c = CONSTANTS[node];
      if (c) return [this.constName(c), PREC_ATOM];
      // \mathbb{R}^+ / \mathbb{R}^- / \mathbb{R}_+ / \mathbb{R}_- — CE
      // emits these as leaf symbol names; bare symbols named
      // "PositiveNumbers" are meaningless, so emit the interval set.
      if (LEAF_SETS[node] !== undefined)
        return [LEAF_SETS[node](this.sp), PREC_ATOM];
      if (node === 'Nothing') {
        this.scope.flag('error', 'missing argument cannot be emitted');
        return ['None', PREC_ATOM];
      }
      return [this.sym(node), PREC_ATOM];
    }
    if (!isArr(node)) return [String(node), PREC_ATOM];

    const h = headOf(node) ?? '';
    const args = node.slice(1);
    switch (h) {
      case 'Add': {
        // `\int x³+x²+x+1 dx` — CE files the integral as Add's first
        // term with the integrand as siblings:
        // Add(Integrate(Nothing, L), t1.., tn·d·x). Rebuild the real
        // Integrate so the differential peel can run on the sum.
        if (
          isHead(args[0], 'Integrate') &&
          (args[0][1] === 'Nothing' || args[0][1] === undefined)
        ) {
          const integ = args[0];
          return this.inner([
            'Integrate',
            ['Add', ...args.slice(1)],
            integ[2],
          ] as MathJson);
        }
        // Add emits x + y - z, folding Negate children and negative
        // literals into subtraction for readable output.
        const parts = args.map((a) => {
          const neg = this.isNegated(a);
          const body = neg
            ? isHead(a, 'Negate')
              ? this.emit(a[1], PREC_ADD)
              : numText(a).slice(1)
            : this.emit(a, PREC_ADD);
          return { neg, body };
        });
        const text = parts
          .map((p, i) =>
            i === 0
              ? p.neg
                ? `-${p.body}`
                : p.body
              : p.neg
                ? ` - ${p.body}`
                : ` + ${p.body}`,
          )
          .join('');
        return [text, PREC_ADD];
      }
      case 'Negate':
        return [`-${this.emit(args[0], PREC_UNARY)}`, PREC_UNARY];
      case 'Subtract': // defensive — normalization removes this
        return [
          `${this.emit(args[0], PREC_ADD)} - ${this.emit(args[1], PREC_ADD)}`,
          PREC_ADD,
        ];
      case 'Multiply': {
        // `\operatorname{sgn}x` flattens to `Multiply(Sign, x)` — the
        // bare `Sign`/`Im`/`Re` factor reads as a name, not the signum /
        // imaginary / real-part function. Fuse the operator leaf back
        // into a call: unary op+next (`a sgn b` → `a*sign(b)`, `x Im z`
        // → `x*im(z)`); binary GCD/LCM take the previous AND next factor
        // (`a \gcd b` → `gcd(a,b)`). A trailing bare leaf stays a symbol.
        const FUSE_UNARY: Record<string, string> = {
          Sign: 'Sign',
          Im: 'Im',
          Re: 'Re',
          im: 'Im',
          re: 'Re',
        };
        const FUSE_BINARY = new Set(['GCD', 'LCM']);
        const parts: MathJson[] = [];
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (isStr(a) && i + 1 < args.length) {
            if (FUSE_UNARY[a] !== undefined) {
              parts.push([FUSE_UNARY[a], args[++i]]);
              continue;
            }
            if (FUSE_BINARY.has(a)) {
              const prev = parts.pop();
              parts.push([a, ...(prev !== undefined ? [prev] : []), args[++i]]);
              continue;
            }
          }
          parts.push(a);
        }
        return [
          parts.map((a) => this.emit(a, PREC_MUL)).join(' * '),
          PREC_MUL,
        ];
      }
      case 'Divide':
        // int-valued expressions divide to a Python float — keep them
        // exact as Rational (`10^6/3` -> Rational(10**6, 3)).
        if (isIntExpr(args[0]) && isIntExpr(args[1]))
          return [
            `${this.sp}Rational(${this.emit(args[0])}, ${this.emit(args[1])})`,
            PREC_ATOM,
          ];
        return [
          `${this.emit(args[0], PREC_MUL)} / ${this.emit(args[1], PREC_MUL + 1)}`,
          PREC_MUL,
        ];
      case 'Power': {
        // `A^c` — set complement suffix. `**` on a Set raises in SymPy;
        // `S^2` still works (ProductSet), so only the c-exponent folds.
        if (
          isStr(args[1]) &&
          (args[1] === 'c' || args[1] === 'C') &&
          this.isSetish(args[0])
        )
          return [
            `${this.sp}Complement(${this.sp}S.UniversalSet, ${this.emit(args[0])})`,
            PREC_ATOM,
          ];
        // `3^{-1}` — Python `**` on int operands yields a float before
        // sympy sees it (`Rational(3**-1, 2)` -> a binary fraction);
        // `sp.Pow` keeps the exact reciprocal.
        // `asInt` normalizes zero-padded text (`-007`) to a legal literal.
        const negIntExp = (e: MathJson | undefined): string | null => {
          const inner = isHead(e, 'Negate') ? e[1] : e;
          const n = asInt(inner);
          if (n === undefined) return null;
          const neg = isHead(e, 'Negate') ? n > 0 : n < 0;
          return neg ? `-${Math.abs(n)}` : null;
        };
        const negExp = negIntExp(args[1]);
        if (negExp !== null)
          return [
            `${this.sp}Pow(${this.emit(args[0], PREC_ATOM)}, ${negExp})`,
            PREC_ATOM,
          ];
        return [
          `${this.emit(args[0], PREC_POW + 1)}**${this.emit(args[1], PREC_POW)}`,
          PREC_POW,
        ];
      }
      case 'Rational':
        return [`${this.sp}Rational(${numText(args[0])}, ${numText(args[1])})`, PREC_ATOM];
      case 'Complex':
        return [
          `${numText(args[0])} + ${numText(args[1])}*${this.sp}I`,
          PREC_ADD,
        ];
      case 'Root':
        return args.length === 2
          ? [`${this.sp}root(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM]
          : [`${this.sp}sqrt(${this.emit(args[0])})`, PREC_ATOM];
      case 'Log':
        return args.length === 2
          ? [`${this.sp}log(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM]
          : [`${this.sp}log(${this.emit(args[0])}, 10)`, PREC_ATOM];
      case 'Factorial':
        return [`${this.sp}factorial(${this.emit(args[0])})`, PREC_ATOM];
      case 'Equal':
        return this.cmpChain('Eq', args);
      case 'Less':
        return this.cmpChain('Lt', args);
      case 'LessEqual':
        return this.cmpChain('Le', args);
      case 'Greater':
        return this.cmpChain('Gt', args);
      case 'GreaterEqual':
        return this.cmpChain('Ge', args);
      case 'NotEqual':
        return this.cmpChain('Ne', args);
      // Negated relations — SymPy has no \nless-family builtins, so emit
      // the faithful Not(<rel>) rather than collapsing to the inverse.
      case 'NotLess':
        return [
          `${this.sp}Not(${this.sp}Lt(${this.emit(args[0])}, ${this.emit(args[1])}))`,
          PREC_ATOM,
        ];
      case 'NotGreater':
        return [
          `${this.sp}Not(${this.sp}Gt(${this.emit(args[0])}, ${this.emit(args[1])}))`,
          PREC_ATOM,
        ];
      case 'NotLessEqual':
        return [
          `${this.sp}Not(${this.sp}Le(${this.emit(args[0])}, ${this.emit(args[1])}))`,
          PREC_ATOM,
        ];
      case 'NotGreaterEqual':
        return [
          `${this.sp}Not(${this.sp}Ge(${this.emit(args[0])}, ${this.emit(args[1])}))`,
          PREC_ATOM,
        ];
      case 'NotDivides':
        return [
          `${this.sp}Not(${this.sp}Eq(${this.sp}Mod(${this.emit(args[1])}, ${this.emit(args[0])}), 0))`,
          PREC_ATOM,
        ];
      case 'Implies':
        return [
          `${this.sp}Implies(${this.emit(args[0])}, ${this.emit(args[1])})`,
          PREC_ATOM,
        ];
      case 'Equivalent':
        return [
          `${this.sp}Equivalent(${this.emit(args[0])}, ${this.emit(args[1])})`,
          PREC_ATOM,
        ];
      case 'IdenticallyEqual': {
        // `x \equiv a \mod m` — CE parks the modulus in a Mod node.
        const [a, rhs] = args;
        if (isHead(rhs, 'Mod') && rhs.length === 3)
          return [
            `${this.sp}Eq(${this.sp}Mod(${this.emit(a)}, ${this.emit(rhs[2])}), ${this.emit(rhs[1])})`,
            PREC_ATOM,
          ];
        return [
          `${this.sp}Eq(${this.emit(a)}, ${this.emit(rhs)})`,
          PREC_ATOM,
        ];
      }
      case 'Congruent':
        // `x \equiv b \pmod m` — CE's pmod form. [x, b, m] -> Eq(Mod(x, m), b).
        return [
          `${this.sp}Eq(${this.sp}Mod(${this.emit(args[0])}, ${this.emit(args[2])}), ${this.emit(args[1])})`,
          PREC_ATOM,
        ];
      case 'Condition': {
        // A Condition escaping a Set wrapper — defensive; the variable
        // comes from the predicate's single free name.
        const free = freeNames(args[0]);
        if (free.length !== 1) {
          this.scope.flag(
            'error',
            'set-builder notation needs exactly one variable',
          );
          return ['None', PREC_ATOM];
        }
        return [
          `${this.sp}ConditionSet(${this.emit(free[0])}, ${this.emit(args[0])})`,
          PREC_ATOM,
        ];
      }
      case 'Complement':
      case 'Difference':
      case 'SymmetricDifference': {
        // A \ B, A \triangle B — non-set operands wrap as singletons so
        // `x \ y` shows `{x} \ {y}` instead of a flagged stub (sympy has
        // no set variables; `A \ B` can't be held abstractly anyway).
        const fn =
          h === 'SymmetricDifference' ? 'SymmetricDifference' : 'Complement';
        return [
          `${this.sp}${fn}(${args.map((a) => this.setArg(a)).join(', ')})`,
          PREC_ATOM,
        ];
      }
      case 'Degrees':
        // x^{\circ} — convert to radians.
        return [
          `${this.emit(args[0], PREC_MUL)} * ${this.sp}pi / 180`,
          PREC_MUL,
        ];
      case 'Minimum':
      case 'Maximum': {
        // \min_{x} f — value of f minimized over x (sp.minimum), not the
        // elementwise sp.Min that \min(x, y) emits. A third arg is the
        // domain (\min_{x \in S} f / \min_{x \ge 0} f -> Interval).
        const fn = h === 'Minimum' ? 'minimum' : 'maximum';
        const mx = h === 'Minimum' ? 'Min' : 'Max';
        const [body, v, dom] = args;
        // The index var is bound inside the body — a bound `i` stays a
        // Symbol instead of resolving to sp.I (same as Sum/Integrate).
        return this.scope.withLambdaBound(isStr(v) ? [v] : [], () => {
          // SymPy's minimum/maximum can't bound an undefined function's
          // range — call/Apply bodies raise NotImplementedError at eval.
          if (isHead(body, 'call') || isHead(body, 'Apply'))
            return this.unknownCall(h, args);
          if (dom === undefined)
            return [
              `${this.sp}${fn}(${this.emit(body)}, ${this.emit(v)})`,
              PREC_ATOM,
            ];
          // \min_{i=lo}^{hi}: i is an integer index (like \sum bounds),
          // not a real interval. Concrete integer bounds emit Min/Max
          // over the explicit substitutions; sympy can't iterate a
          // symbolic sp.Range, so those degrade to a flagged stub.
          if (isHead(dom, 'IntegerRange')) {
            const lo = asInt(dom[1]);
            const hi = asInt(dom[2]);
            if (lo !== undefined && hi !== undefined)
              return [
                `${this.sp}${mx}(*[${this.emit(body, PREC_ATOM)}.subs(${this.emit(v)}, _i) for _i in range(${lo}, ${hi + 1})])`,
                PREC_ATOM,
              ];
            this.scope.flag(
              'note',
              `${fn} over a symbolic i=lo..hi range — sympy can't iterate a symbolic sp.Range; emitted as a ${h} stub`,
            );
            return this.unknownCall(h, args);
          }
          if (!this.isSetish(dom)) {
            this.scope.flag(
              'note',
              `${fn} domain isn't a set — emitted without it`,
            );
            return [
              `${this.sp}${fn}(${this.emit(body)}, ${this.emit(v)})`,
              PREC_ATOM,
            ];
          }
          return [
            `${this.sp}${fn}(${this.emit(body)}, ${this.emit(v)}, ${this.emit(dom)})`,
            PREC_ATOM,
          ];
        });
      }
      case 'Supremum':
      case 'Infimum':
        // No `sp.Supremum`/`sp.Infimum` exists — keep the readable stub
        // (Function, valid python) instead of an AttributeError.
        return this.unknownCall(h, args);
      case 'IntegerRange': {
        // i=lo..hi index bounds — sp.Range's upper bound is exclusive.
        const hi = asInt(args[1]);
        return [
          `${this.sp}Range(${this.emit(args[0])}, ${hi !== undefined ? String(hi + 1) : `${this.emit(args[1])} + 1`})`,
          PREC_ATOM,
        ];
      }
      case 'Interval': {
        // (a,b] / [a,b) — CE marks open ends with Open(x). A fully
        // closed [a,b] parses as List, not Interval.
        const [a0, a1] = args;
        const lo = this.emit(isHead(a0, 'Open') ? a0[1] : a0);
        const hi = this.emit(isHead(a1, 'Open') ? a1[1] : a1);
        const loOpen = isHead(a0, 'Open');
        const hiOpen = isHead(a1, 'Open');
        const flags =
          (loOpen ? ', left_open=True' : '') +
          (hiOpen ? ', right_open=True' : '');
        return [`${this.sp}Interval(${lo}, ${hi}${flags})`, PREC_ATOM];
      }
      case 'Open':
        // Open marks an interval endpoint — a stray one is meaningless.
        return [this.emit(args[0]), PREC_ATOM];
      case 'Element': {
        // x \in S — sp.Contains requires a real Set (a bare Symbol raises
        // TypeError); a non-set operand is wrapped as a singleton like
        // the Union operands (`x \in S` -> `x \in {S}`). A first-referenced
        // member also picks up the set's domain as Symbol kwargs
        // (\mathbb{R} -> real=True, or MatrixSymbol dims for
        // \mathbb{R}^{2\times2} — assumeFrom must run even when the set
        // isn't setish); \notin asserts the opposite, so NotElement
        // intentionally skips this.
        this.assumeFrom(args[0], args[1]);
        const set = args[1];
        if (!this.isSetish(set) && isHead(set, 'Power') && this.isSetish(set[1])) {
          // \mathbb{R}^{2\times2} / \mathbb{R}^n — SymPy has no matrix
          // space or symbolic set power; a named stub keeps it valid
          // Python and readable.
          const exp = set[2];
          const dims =
            isHead(exp, 'Multiply') &&
            (exp as MathJson[]).slice(1).every((e) => this.isPosInt(e))
              ? (exp as MathJson[]).slice(1)
              : null;
          const fname = dims ? 'MatrixSpace' : 'SetPower';
          this.scope.flag(
            'note',
            `no SymPy ${dims ? 'matrix space' : 'symbolic set power'} — emitted as a ${fname} stub`,
          );
          const extra = dims
            ? dims.map((e) => this.emit(e)).join(', ')
            : this.emit(exp);
          return [
            `${this.fn('Element')}(${this.emitMember(args[0])}, ${this.fn(fname)}(${this.emit(set[1])}, ${extra}))`,
            PREC_ATOM,
          ];
        }
        return [
          `${this.sp}Contains(${this.emitMember(args[0])}, ${this.setArg(set)})`,
          PREC_ATOM,
        ];
      }
      case 'NotElement': {
        return [
          `${this.sp}Not(${this.sp}Contains(${this.emitMember(args[0])}, ${this.setArg(args[1])}))`,
          PREC_ATOM,
        ];
      }
      case 'Set': {
        // \{a, b\} is a FiniteSet; set-builder \{x | p(x)\} is a
        // ConditionSet, and \{f(x) | x \in D\} is an ImageSet.
        const [elem, cond] = args;
        const condNode = isHead(cond, 'call') ? cond.slice(1) : cond;
        const condHead = isArr(condNode) ? headOf(condNode) : undefined;
        const condPred = isArr(condNode) ? condNode[1] : undefined;
        // ConditionSet's predicate must emit a Boolean — a stray
        // expression (`{p : p \text{ prime}}` multiplies the text in)
        // raises TypeError at eval, so it falls through to FiniteSet.
        const boolish = isArr(condPred) && BOOLISH_HEADS.has(headOf(condPred) ?? '');
        if (condHead === 'Condition' && boolish) {
          if (isHead(elem, 'Element') && isStr(elem[1])) {
            // \{x \in D \mid p\} — base set is D. A non-set base can't
            // be a ConditionSet domain — keep a readable Function stub.
            this.assumeFrom(elem[1], elem[2]);
            return [
              this.isSetish(elem[2])
                ? `${this.sp}ConditionSet(${this.sym(elem[1])}, ${this.emit(condPred)}, ${this.emit(elem[2])})`
                : `${this.sp}Function("ConditionSet")(${this.sym(elem[1])}, ${this.emit(condPred)}, ${this.emit(elem[2])})`,
              PREC_ATOM,
            ];
          }
          if (isHead(condPred, 'Element') && isStr(condPred[1])) {
            // \{f(x) \mid x \in D\} — an image over the base set.
            this.assumeFrom(condPred[1], condPred[2]);
            return [
              this.isSetish(condPred[2])
                ? `${this.sp}ImageSet(${this.sp}Lambda(${this.sym(condPred[1])}, ${this.emit(elem)}), ${this.emit(condPred[2])})`
                : `${this.sp}Function("ImageSet")(${this.sp}Lambda(${this.sym(condPred[1])}, ${this.emit(elem)}), ${this.emit(condPred[2])})`,
              PREC_ATOM,
            ];
          }
          if (isStr(elem))
            return [
              `${this.sp}ConditionSet(${this.sym(elem)}, ${this.emit(condPred)})`,
              PREC_ATOM,
            ];
        }
        return [
          `${this.sp}FiniteSet(${args.map((a) => this.emit(a)).join(', ')})`,
          PREC_ATOM,
        ];
      }
      case 'Union':
      case 'Intersection':
      case 'SetMinus': {
        // Union/Intersection/Complement raise on non-Set operands —
        // `x \cup y` wraps each side as a singleton so it computes
        // `{x, y}` instead of echoing a flagged `Union(x, y)` stub.
        const fn =
          h === 'Union'
            ? 'Union'
            : h === 'Intersection'
              ? 'Intersection'
              : 'Complement';
        return [
          `${this.sp}${fn}(${args.map((a) => this.setArg(a)).join(', ')})`,
          PREC_ATOM,
        ];
      }
      case 'Subset':
      case 'SubsetEqual':
      case 'Superset':
      case 'SupersetEqual':
      case 'NotSubset':
      case 'NotSubsetNotEqual':
      case 'NotSuperset':
      case 'NotSupersetNotEqual': {
        // `A.is_subset(B)` returns None (not a Boolean) whenever the
        // operands are undecidable — bare `sp.Not(None)` then raises
        // AttributeError. `A ⊆ B` ⟺ `Union(A,B) == B` (strict ⊂ adds
        // `A != B`) always lowers to an Eq/Ne the worker can hold.
        const [sub, sup] = h.startsWith('NotSup') || h.startsWith('Sup')
          ? [args[1], args[0]]
          : [args[0], args[1]];
        if (!this.isSetish(sub) || !this.isSetish(sup)) {
          // SymPy has no set-typed symbol (unlike MatrixSymbol), so a
          // bare `A ⊆ B` can't name two unknown sets — FiniteSet(A)
          // would be the singleton, turning ⊆ into membership.
          this.scope.flag(
            'error',
            'subset/superset needs concrete set operands — sympy has no set-typed symbols',
          );
        }
        const l = this.setArg(sub);
        const r = this.setArg(sup);
        const strict =
          h === 'Subset' || h === 'Superset' ||
          h === 'NotSubset' || h === 'NotSuperset';
        const eq = `${this.sp}Eq(${this.sp}Union(${l}, ${r}), ${r})`;
        const base = strict
          ? `${this.sp}And(${eq}, ${this.sp}Ne(${l}, ${r}))`
          : eq;
        return [
          h.startsWith('Not') ? `${this.sp}Not(${base})` : base,
          PREC_ATOM,
        ];
      }
      case 'And':
        return [`${this.sp}And(${args.map((a) => this.emit(a)).join(', ')})`, PREC_ATOM];
      case 'Or':
        return [`${this.sp}Or(${args.map((a) => this.emit(a)).join(', ')})`, PREC_ATOM];
      case 'Not':
        return [`${this.sp}Not(${this.emit(args[0])})`, PREC_ATOM];
      case 'Which': {
        // CE: (cond, expr) pairs, odd tail is the else value. An
        // `\mathrm{otherwise}`/`\mathrm{else}` condition arrives as a
        // bare symbol — it means the default branch (True), not a
        // symbolic condition that can never fire.
        const cond = (a: MathJson): string =>
          a === 'otherwise' || a === 'else' || a === 'True'
            ? 'True'
            : this.emit(a);
        const pieces: string[] = [];
        for (let i = 0; i + 1 < args.length; i += 2)
          pieces.push(`(${this.emit(args[i + 1])}, ${cond(args[i])})`);
        if (args.length % 2 === 1)
          pieces.push(`(${this.emit(args[args.length - 1])}, True)`);
        return [`${this.sp}Piecewise(${pieces.join(', ')})`, PREC_ATOM];
      }
      case 'Piecewise': {
        // CE also emits ["Piecewise", ["List", expr, cond], ...]
        const cond = (a: MathJson): string =>
          a === 'otherwise' || a === 'else' || a === 'True'
            ? 'True'
            : this.emit(a);
        const pieces = args
          .map((a) =>
            isHead(a, 'List') && a.length === 3
              ? `(${this.emit(a[1])}, ${cond(a[2])})`
              : `(${this.emit(a)}, True)`,
          )
          .join(', ');
        return [`${this.sp}Piecewise(${pieces})`, PREC_ATOM];
      }
      case 'D': {
        // \frac{d}{dx} f and partials both parse to D(f, x[, n]). The
        // variable is bound for the body's emission (a bound `i` stays
        // a symbol instead of resolving to sp.I).
        return this.scope.withLambdaBound(
          isStr(args[1]) ? [args[1]] : [],
          (): [string, number] => {
            // \frac{df}{dx} — a bare name as the body is a function of
            // the variable, not an independent symbol: `diff(f, x)`
            // would evaluate to 0. Emit `diff(f(x), x)` ->
            // Derivative(f(x), x).
            let f: string;
            if (
              isStr(args[0]) &&
              args[0] !== args[1] &&
              !this.scope.decls.defined.has(args[0])
            ) {
              f = `${this.fn(args[0])}(${this.emit(args[1])})`;
              this.scope.noteDepVar(args[0], [args[1]]);
            } else {
              f = this.emit(args[0]);
              // `\dot{x}` after `x = 5` — sp.diff(5, t) evaluates to 0,
              // so the emitted equation silently says `0 = rhs` instead
              // of a derivative; flag rather than emit a plausible
              // falsehood.
              if (
                isStr(args[0]) &&
                this.scope.decls.defined.has(args[0]) &&
                !this.scope.decls.declaredFns.has(args[0])
              )
                this.scope.flag(
                  'error',
                  `${args[0]} is bound to a value — cannot differentiate`,
                );
            }
            const x = this.emit(args[1]);
            return args.length >= 3
              ? [
                  `${this.sp}diff(${f}, ${x}, ${this.emit(args[2])})`,
                  PREC_ATOM,
                ]
              : [`${this.sp}diff(${f}, ${x})`, PREC_ATOM];
          },
        );
      }
      case 'TotalD': {
        // `\frac{\D f}{\D x}` / `\D_x f` — the TOTAL derivative: every
        // free symbol in the body differentiates through the chain rule
        // as a function of the variable — `\frac{\D(xy)}{\D t}` emits
        // `sp.diff(x(t)*y(t), t)` = `x(t)*y'(t) + y(t)*x'(t)`.
        const v = args[1];
        if (!isStr(v) || missingArg(v)) {
          this.scope.flag(
            'error',
            'total derivative needs a variable — write \\D_x f or \\frac{\\D f}{\\D x}',
          );
          return [`${this.sp}diff(${this.emit(args[0])}, x)`, PREC_ATOM];
        }
        if (
          isStr(args[0]) &&
          this.scope.decls.defined.has(args[0]) &&
          !this.scope.decls.declaredFns.has(args[0])
        )
          this.scope.flag(
            'error',
            `${args[0]} is bound to a value — cannot differentiate`,
          );
        return this.scope.withLambdaBound([v], (): [string, number] => {
          // Free names become functions of the variable; names that
          // already carry a callable meaning keep their signature.
          for (const n of freeNames(args[0])) {
            if (
              n === v ||
              this.scope.decls.defined.has(n) ||
              this.scope.emit.matrices.has(n) ||
              this.scope.emit.functions.has(n) ||
              this.scope.decls.declaredFns.has(n) ||
              this.scope.kinds.depVars.has(n)
            )
              continue;
            this.fn(n);
            this.scope.noteDepVar(n, [v]);
          }
          const f = this.emit(args[0]);
          const x = this.emit(v);
          return args.length >= 3
            ? [
                `${this.sp}diff(${f}, ${x}, ${this.emit(args[2])})`,
                PREC_ATOM,
              ]
            : [`${this.sp}diff(${f}, ${x})`, PREC_ATOM];
        });
      }
      case 'Gradient': {
        // `\nabla f` — the gradient: a row of partials over the body's
        // free variables; `sp.derive_by_array` emits the textbook vector.
        const body = args[0];
        let vars: string[];
        if (isStr(body)) {
          // ∇f on a bare name — like `\frac{df}{dx}`: a field, not a
          // symbol. Its recorded args define the variables; an
          // undeclared f becomes f(x) of one variable.
          if (
            this.scope.decls.defined.has(body) &&
            !this.scope.decls.declaredFns.has(body)
          ) {
            this.scope.flag(
              'error',
              `${body} is bound to a value — not a scalar field`,
            );
            return [
              `${this.sp}derive_by_array(${this.emit(body)}, [])`,
              PREC_ATOM,
            ];
          }
          const recorded = this.scope.emit.fnArgs.get(body);
          if (recorded !== undefined) {
            vars = recorded.filter((a): a is string => isStr(a));
          } else {
            const v = body === 'x' ? 't' : 'x';
            this.fn(body);
            this.scope.noteDepVar(body, [v]);
            vars = [v];
          }
        } else {
          vars = freeNames(body).filter(
            (n) =>
              !this.scope.decls.defined.has(n) &&
              !this.scope.emit.matrices.has(n) &&
              !this.scope.emit.functions.has(n) &&
              !this.scope.decls.declaredFns.has(n) &&
              !this.scope.kinds.depVars.has(n),
          );
        }
        if (vars.length === 0) {
          this.scope.flag('error', 'gradient needs a free variable');
          return [
            `${this.sp}derive_by_array(${this.emit(body)}, [])`,
            PREC_ATOM,
          ];
        }
        return [
          `${this.sp}derive_by_array(${this.emit(body)}, [${vars
            .map((v) => this.sym(v))
            .join(', ')}])`,
          PREC_ATOM,
        ];
      }
      case 'Apply': {
        const callee = args[0];
        if (isHead(callee, 'InverseFunction')) {
          // \sin^{-1}(x) -> asin(x); an unknown base keeps a readable
          // inverse(f)(x)-style row instead of InverseFunction garbage.
          const base = callee[1];
          const mapped = isStr(base) ? INVERSE_FUNCS[base] : undefined;
          const argList = args.slice(1).map((a) => this.callArg(a)).join(', ');
          if (base === 'Sqrt')
            return [`(${argList})**2`, PREC_POW];
          if (mapped) return [`${this.sp}${mapped}(${argList})`, PREC_ATOM];
          const name = isStr(base) ? `${base}inv` : 'inverse';
          return [`${this.sp}Function(${JSON.stringify(name)})(${argList})`, PREC_ATOM];
        }
        if (isHead(callee, 'Derivative')) {
          // f'(x): ["Apply", ["Derivative", f, n], x] — the prime
          // differentiates f w.r.t. its own variable; the call arg is
          // where that derivative is evaluated (f'(0) is the derivative
          // at 0, not `diff(f(0), 0)` which has no differentiation var).
          const [, f, n] = callee;
          // `f^{(n)}(x)` — a symbolic order has no sympy form this
          // sympy version can hold: `diff(f, x, n)` differentiates by
          // x then n (→ 0) and `diff(f, (x, n))` hard-aborts the wasm
          // runtime — flag it rather than crash the worker.
          const diffBy = (v: string): string => {
            if (n === undefined || n === 'Nothing' || n === 1) return v;
            if (isNum(n)) return `${v}, ${numText(n)}`;
            this.scope.flag(
              'error',
              'symbolic derivative order is unsupported',
            );
            return v;
          };
          const argNodes = args.slice(1);
          // `x^{(2)}(3)` on a variable isn't a derivative call — the
          // power is a juxtaposed factor (`x**2 * 3`). The base reads as
          // a function when it's def'd or already called; an undeclared
          // name in callee position is a function by use (like `r(x)`).
          if (isStr(f) && !this.isFunctionish(f)) {
            const basePow = this.emit(
              n === undefined || n === 'Nothing' ? f : ['Power', f, n],
              PREC_MUL,
            );
            return [
              [basePow, ...argNodes.map((a) => this.emit(a, PREC_MUL))].join(
                ' * ',
              ),
              PREC_MUL,
            ];
          }
          const fname = isStr(f) ? this.fn(f) : null;
          // f is a function of its call args' variables — a later bare
          // `f` operand emits `f(<vars>)` (UndefinedFunction operand
          // raises TypeError).
          if (isStr(f)) {
            const fvars = argNodes.filter((a) => isStr(a) && a !== f);
            if (fvars.length > 0) this.scope.noteDepVar(f, fvars);
          }
          const applied = (list: string[]) =>
            fname !== null
              ? `${fname}(${list.join(', ')})`
              : `${this.emit(f)}(${list.join(', ')})`;
          // A string arg can still be a *constant* name (f'(\pi)) —
          // constants aren't diff variables either, so they take the
          // same fresh-symbol substitution path as literal args.
          const isVar = (a: MathJson): boolean =>
            isStr(a) && !CONSTANTS[a];
          if (argNodes.every(isVar)) {
            const argList = argNodes.map((a) => this.emit(a)).join(', ');
            return [
              `${this.sp}diff(${applied(argNodes.map((a) => this.emit(a)))}, ${diffBy(argList)})`,
              PREC_ATOM,
            ];
          }
          const vars = argNodes.map((a, i) =>
            isVar(a)
              ? this.emit(a)
              : this.sym(argNodes.length === 1 ? 'x' : `_ev${i}`),
          );
          let text = `${this.sp}diff(${applied(vars)}, ${diffBy(vars.join(', '))})`;
          argNodes.forEach((a, i) => {
            if (!isVar(a)) text = `${text}.subs(${vars[i]}, ${this.emit(a)})`;
          });
          return [text, PREC_ATOM];
        }
        if (isHead(callee, 'Function')) {
          // `(x \mapsto x^2)(3)` — a lambda callee is a real call, not
          // juxtaposed factors (the generic multiply path below would
          // emit `(lambda ...) * 3`, a TypeError at exec).
          const argList = args.slice(1).map((a) => this.callArg(a)).join(', ');
          return [`${this.emit(callee)}(${argList})`, PREC_ATOM];
        }
        if (!isStr(callee)) {
          // A non-name "callee" isn't a call — `\sqrt{x}(x+1)`, `2(x+1)`,
          // `x^2(y)` are juxtaposed factors (the delimiter group was the
          // last factor). Emitting `f(args)` here produced executable
          // nonsense like `sqrt(x)(x + 1)` → 'Pow' object is not
          // callable; multiplication is the conventional reading.
          return [
            args.map((a) => this.emit(a, PREC_MUL)).join(' * '),
            PREC_MUL,
          ];
        }
        const calleeText = this.fn(callee);
        // Record the application so a later bare `f` in operand
        // position emits `f(<args>)` (UndefinedFunction operands raise).
        const fnArgs = args.slice(1).filter((a) => a !== callee);
        this.scope.noteCallArgs(callee, fnArgs);
        return [
          `${calleeText}(${args.slice(1).map((a) => this.emit(a)).join(', ')})`,
          PREC_ATOM,
        ];
      }
      case 'Prime': {
        // y'' — the nth derivative of the function w.r.t. x. The arg's
        // `x` must be allocated first: for `x'` itself, taking the
        // function ident first gives `x` to the callee and `x_2` to the
        // variable, scrambling the names (`Derivative(x(x_2), x)`).
        const arg = this.sym('x');
        const name = isStr(args[0])
          ? `${this.fn(args[0])}(${arg})`
          : this.emit(args[0], PREC_ATOM);
        if (isStr(args[0])) this.scope.noteDepVar(args[0], ['x']);
        const n =
          isNum(args[1]) && numText(args[1]) !== '1'
            ? `, ${numText(args[1])}`
            : '';
        return [`${this.sp}Derivative(${name}, x${n})`, PREC_ATOM];
      }
      case 'Derivative': {
        // Bare `f^{(n)}` / `x^{(2)}` — a derivative only when the base is
        // an established function (def'd or already used in call
        // position); `x^{(2)}` on a variable is the ordinary power
        // `x**2`, same as `5^{(2)}` → 25.
        if (
          isStr(args[0]) &&
          !this.scope.emit.functions.has(args[0]) &&
          !this.scope.decls.declaredFns.has(args[0])
        ) {
          const order =
            args[1] === undefined
              ? '1'
              : isNum(args[1])
                ? numText(args[1])
                : this.emit(args[1], PREC_UNARY);
          return [`${this.sym(args[0])}**${order}`, PREC_POW];
        }
        // A string callee arrives unapplied and `Derivative(f, n)` raises
        // TypeError ('cannot represent derivative of UndefinedFunction').
        // Diff the applied function like \ddot does: `sp.diff(f(x), x, n)`.
        if (isStr(args[0])) {
          const f = this.fn(args[0]);
          // `x^{(2)}` can't differentiate `x(x)` by `x` — the var must
          // differ from the callee name.
          const v = this.sym(args[0] === 'x' ? 't' : 'x');
          this.scope.noteDepVar(args[0], [args[0] === 'x' ? 't' : 'x']);
          if (args[1] !== undefined && !isNum(args[1])) {
            // Same wasm-crashing (v, n) tuple as the applied path.
            this.scope.flag(
              'error',
              'symbolic derivative order is unsupported',
            );
            return [`${this.sp}diff(${f}(${v}), ${v})`, PREC_ATOM];
          }
          const order =
            args[1] === undefined ? `, ${v}` : `, ${v}, ${numText(args[1])}`;
          return [`${this.sp}diff(${f}(${v})${order})`, PREC_ATOM];
        }
        return [
          `${this.sp}Derivative(${args
            .map((a) => this.emit(a))
            .join(', ')})`,
          PREC_ATOM,
        ];
      }
      case 'Function': {
        // Anonymous lambda — CE wraps calculus bodies this way. Emitted
        // directly only when it escapes an operator that unwraps it
        // (e.g. `x \mapsto x^2`). A sympy `Lambda` — a raw python lambda
        // has no latex/repr and displays its own address. Params bind
        // like operator-bound names: `i \mapsto i^2` binds a plain
        // Symbol — `Lambda(sp.I, …)` can't take the imaginary constant.
        const rawParams = args.slice(1).map((p) => (isStr(p) ? p : 'x'));
        // lambdaBound pushes before the params' idents mint (a param
        // named `i` stays a plain Symbol); `bound` pushes after, so the
        // minted names themselves aren't treated as already-bound.
        return this.scope.withLambdaBound(rawParams, () => {
          const params = rawParams.map((p) => this.sym(p));
          return this.scope.withBound(rawParams, () => {
            const body = this.emit(args[0]);
            const sig =
              params.length === 1 ? params[0] : `(${params.join(', ')})`;
            return [`${this.sp}Lambda(${sig}, ${body})`, PREC_LOW];
          });
        });
      }
      case 'Integrate': {
        const { body: parsedBody, params } = unwrapLambda(args[0]);
        let body = parsedBody;
        const limits = isHead(args[1], 'Limits') ? args[1].slice(1) : null;
        const missing = (n: MathJson | undefined): boolean =>
          n === undefined || n === 'Nothing' || isHead(n, 'Error');
        let v = limits?.[0] ?? params[0];
        const lo = limits?.[1];
        const hi = limits?.[2];
        // Every indefinite integral takes its own `+ C` — per level, so
        // an inner constant integrates into a real term (`∬f dx dy` ->
        // F + C·y + D). The emitted program nests integrate() calls so
        // each level's constant is visible.
        const constTerm = () => {
          const c = nextConstName(this.scope);
          const shape = this.matrixShape(body);
          return shape
            ? `${this.sp}MatrixSymbol(${JSON.stringify(c)}, ${shape})`
            : `${this.sp}Symbol(${JSON.stringify(c)})`;
        };
        let extraVars: string[] = [];
        // `\int x^2 \text{d}x` — CE leaves a \text{d} differential as a
        // `d * x` factor pair in the body instead of marking the var.
        // `\iint`/`\iiint` park several pairs on one Integrate node —
        // peel them all (leftmost = innermost). A pair naming the
        // already-bound variable (`(x,0,1)` limits) is consumed, not
        // counted as an extra variable.
        const stripDiffs = (factors: MathJson[]): string[] => {
          const found: string[] = [];
          while (
            factors.length >= 2 &&
            isStr(factors[factors.length - 1]) &&
            isDiffMark(factors[factors.length - 2])
          ) {
            const name = factors.pop() as string;
            factors.pop();
            if (name !== v) found.unshift(name);
          }
          return found;
        };
        // CE flattens `f(x)` inside an integral to plain factors —
        // `Multiply(f, x, d, x)` loses the call marker. Fold a
        // function-name factor fused with the next name back into a
        // call so `∫f(x)dx` isn't emitted `∫f·x dx`.
        const foldCalls = (factors: MathJson[]): MathJson[] => {
          const out: MathJson[] = [];
          for (let i = 0; i < factors.length; i++) {
            const a = factors[i];
            const b = factors[i + 1];
            if (isStr(a) && this.scope.emit.functions.has(a) && isStr(b)) {
              out.push(['call', a, b]);
              i++;
            } else out.push(a);
          }
          return out;
        };
        const promoteVar = () => {
          if (missing(v) && extraVars.length > 0) {
            v = extraVars[0];
            extraVars = extraVars.slice(1);
          }
        };
        // CE glues the `\text{d}v` differential onto the tail of the
        // integrand — flat (`Multiply(x², d, x)`) or nested inside the
        // last factor's arguments (`x\sin x\,dx` →
        // `Multiply(x, Sin(Multiply(x, d, x)))`, `\sin²x\,dx` →
        // `Power(Sin(Multiply(x, d, x)), 2)`). Peel pairs at the
        // deepest level they sit at and rebuild the application.
        const peelNode = (
          node: MathJson,
        ): { node: MathJson; names: string[] } => {
          if (isHead(node, 'Multiply')) {
            const r = peelDeep(node.slice(1));
            if (r.names.length > 0 && r.factors.length >= 1) {
              return {
                node:
                  r.factors.length === 1
                    ? r.factors[0]
                    : (['Multiply', ...r.factors] as MathJson),
                names: r.names,
              };
            }
            return { node, names: [] };
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
        const peelDeep = (
          factors: MathJson[],
        ): { factors: MathJson[]; names: string[] } => {
          const tail = [...factors];
          const names = stripDiffs(tail);
          if (names.length > 0) return { factors: tail, names };
          const last = tail[tail.length - 1];
          const r = peelNode(last);
          if (r.names.length > 0) {
            tail[tail.length - 1] = r.node;
            return { factors: tail, names: r.names };
          }
          return { factors, names: [] };
        };
        const r = peelDeep(
          isHead(body, 'Multiply') && body.length >= 3
            ? body.slice(1)
            : [body],
        );
        if (r.names.length > 0 && r.factors.length >= 1) {
          extraVars = [...extraVars, ...r.names];
          const parts = foldCalls(r.factors);
          body = parts.length === 1 ? parts[0] : ['Multiply', ...parts];
          promoteVar();
        }
        if (missing(v)) {
          // No `dx` — infer the variable from the body's free symbols
          // (`\int x^2` -> x). Ambiguous bodies can't be emitted — SymPy
          // would just raise a ValueError, so flag and let the statement
          // drop instead.
          const free = freeNames(body);
          if (free.length === 1) {
            v = free[0];
            this.scope.flag(
              'note',
              `no differential — integrating w.r.t. ${v}`,
            );
          } else {
            this.scope.flag(
              'error',
              "can't infer the integration variable — add a differential like dx",
            );
            return [`${this.sp}integrate(${this.emit(body)})`, PREC_ATOM];
          }
        }
        // The integration variable is bound for the body's emission (a
        // bound `i` stays a symbol instead of resolving to sp.I).
        const finish = (): [string, number] => {
          const hasLo = !missing(lo);
          const hasHi = !missing(hi);
          if (hasLo !== hasHi) {
            this.scope.flag(
              'error',
              `${hasLo ? 'upper' : 'lower'} bound is empty — fill it in or delete it`,
            );
            return [`${this.sp}integrate(${this.emit(body)}, ${this.emit(v)})`, PREC_ATOM];
          }
          // Several differentials on one sign (`\iint f dx dy`) — an
          // iterated integral, innermost first. A lone bound pair
          // applies to every variable (`\iint_a^b` reads as a square).
          if (extraVars.length > 0) {
            const vars = [v, ...extraVars].filter(isStr);
            if (hasLo)
              return [
                `${this.sp}integrate(${this.emit(body)}, ${vars
                  .map(
                    (w) =>
                      `(${this.emit(w)}, ${this.emit(lo)}, ${this.emit(hi)})`,
                  )
                  .join(', ')})`,
                PREC_ATOM,
              ];
            // Indefinite: a nested call per level so each `+ C`
            // integrates through — `integrate(f, x, y) + C` would show
            // one constant where the antiderivative has one per level.
            let acc = `${this.sp}integrate(${this.emit(body)}, ${this.emit(vars[0])}) + ${constTerm()}`;
            for (const w of vars.slice(1))
              acc = `${this.sp}integrate(${acc}, ${this.emit(w)}) + ${constTerm()}`;
            return [acc, PREC_ADD];
          }
          if (hasLo)
            return [
              `${this.sp}integrate(${this.emit(body)}, (${this.emit(v)}, ${this.emit(lo)}, ${this.emit(hi)}))`,
              PREC_ATOM,
            ];
          // Indefinite: append the constant of integration (`+ C`) at
          // every level. PREC_ADD keeps the sum parenthesized when the
          // integral nests inside a larger term (`(∫x dx)^2` ->
          // `(x**2/2 + C)**2`) or inside an outer integrand. A matrix
          // integrand's constant is a matrix too — `Matrix + Symbol`
          // raises TypeError, so emit a same-shape MatrixSymbol.
          const indefinite = `${this.sp}integrate(${this.emit(body)}, ${this.emit(v)})`;
          return [`${indefinite} + ${constTerm()}`, PREC_ADD];
        };
        return this.scope.withLambdaBound(
          isStr(v) ? [v, ...extraVars] : [],
          finish,
        );
      }
      case 'Sum':
      case 'Product': {
        const { body } = unwrapLambda(args[0]);
        const limits = isHead(args[1], 'Limits') ? args[1].slice(1) : null;
        const eager = h === 'Sum' ? 'summation' : 'product';
        const missing = (n: MathJson | undefined): boolean =>
          n === undefined || n === 'Nothing' || isHead(n, 'Error');
        const word = h === 'Sum' ? 'sum' : 'product';
        // A stray `d x` under a product/sum (`\prod x^2 dx`) isn't
        // meaningful — flag at compile time rather than emitting an
        // unbound-variable sum.
        if (
          isHead(body, 'Multiply') &&
          body.length >= 3 &&
          isStr(body[body.length - 2]) &&
          isStr(body[body.length - 1]) &&
          isDiffMark(body[body.length - 2])
        ) {
          this.scope.flag(
            'error',
            `differential ${body[body.length - 2]}${body[body.length - 1]} under \\${h === 'Sum' ? 'sum' : 'prod'} — did you mean \\int?`,
          );
          return [`${this.sp}${h}(${this.emit(body)})`, PREC_ATOM];
        }
        // The index variable is bound for the body's emission (a bound
        // `i` stays a symbol instead of resolving to sp.I).
        const boundVars =
          limits && isStr(limits[0]) && !missing(limits[0])
            ? [limits[0]]
            : [];
        // SymPy has no boundless/partial Sum or Product form — every
        // shape except a complete (var, lo, hi) tuple raises ValueError.
        // Flag like the integral's half-bound case and drop the row.
        const finish = (): [string, number] => {
          if (!limits || missing(limits[0])) {
            this.scope.flag(
              'error',
              `${word} needs an index and bounds — write ${
                h === 'Sum' ? '\\sum' : '\\prod'
              }_{i=1}^{n}`,
            );
            return [`${this.sp}${h}(${this.emit(body)})`, PREC_ATOM];
          }
          if (missing(limits[1]) || missing(limits[2])) {
            this.scope.flag(
              'error',
              `${missing(limits[2]) ? 'upper' : 'lower'} bound is empty — fill it in or delete it`,
            );
            return [`${this.sp}${h}(${this.emit(body)})`, PREC_ATOM];
          }
          return [
            `${this.sp}${eager}(${this.emit(body)}, (${this.emit(limits[0])}, ${this.emit(limits[1])}, ${this.emit(limits[2])}))`,
            PREC_ATOM,
          ];
        };
        return this.scope.withLambdaBound(boundVars, finish);
      }
      case 'Limit': {
        // ["Limit", ["Function", body, x], value] or
        // ["Limit", ["Function", body, x], value, dir] where dir is ±1
        // (one-sided limits); defensive flat form ["Limit", expr, x,
        // value] too.
        const { body, params } = unwrapLambda(args[0]);
        if (isHead(args[0], 'Function')) {
          const v = params[0] ?? 'x';
          // CE carries `x \to a^{\pm}` as a ±1 third arg. Without a
          // direction the limit is two-sided: sympy's default dir='+'
          // would silently give the right-hand answer.
          const dir =
            args.length >= 3 && isNum(args[2])
              ? Number(numText(args[2])) > 0
                ? '+'
                : '-'
              : '+-';
          return this.scope.withLambdaBound(isStr(v) ? [v] : [], () => [
            `${this.sp}limit(${this.emit(body)}, ${this.emit(v)}, ${this.emit(args[1])}, dir='${dir}')`,
            PREC_ATOM,
          ]);
        }
        if (args.length >= 3)
          return [
            `${this.sp}limit(${this.emit(body)}, ${this.emit(args[1])}, ${this.emit(args[2])})`,
            PREC_ATOM,
          ];
        const v = params[0] ?? 'x';
        return [
          `${this.sp}limit(${this.emit(body)}, ${this.emit(v)}, ${this.emit(args[1])})`,
          PREC_ATOM,
        ];
      }
      case 'Matrix': {
        const rows =
          args.length === 1 && isHead(args[0], 'List') ? args[0].slice(1) : args;
        const text = rows
          .map((r: MathJson) =>
            isHead(r, 'List')
              ? `[${r.slice(1).map((c: MathJson) => this.emit(c)).join(', ')}]`
              : `[${this.emit(r)}]`,
          )
          .join(', ');
        return [`${this.sp}Matrix([${text}])`, PREC_ATOM];
      }
      case 'Determinant':
        // `\det A` on a bare name — MatrixSymbol via matrixArg; a
        // scalar Symbol would raise 'Symbol' has no 'det' in the worker.
        // Other args (a matrix literal, an assigned matrix) keep .det().
        if (isHead(args[0], 'Matrix') || this.identityDim(args[0]))
          return [`${this.emit(args[0], PREC_ATOM)}.det()`, PREC_ATOM];
        if (isStr(args[0]))
          return [
            `${this.sp}Determinant(${this.matrixArg(args[0], '\\det') ?? 'None'})`,
            PREC_ATOM,
          ];
        // A matrix-valued expression (`\det(A + B)`, `2A`, `A^2`):
        // `.det()` exists on MatrixExpr too (Determinant stays
        // unevaluated there) — a concrete argument still evaluates.
        if (this.matrixValued(args[0]))
          return [`(${this.emit(args[0])}).det()`, PREC_ATOM];
        this.scope.flag(
          'note',
          "determinant needs a matrix — the argument isn't one",
        );
        // sp.Determinant(non-matrix) raises TypeError at eval — a
        // Function stub displays the intended form and still runs.
        return [
          `${this.fn('Determinant')}(${args.map((a) => this.emit(a)).join(', ')})`,
          PREC_ATOM,
        ];
      case 'Transpose':
        // `A^T` — `.T` on a scalar Symbol is an AttributeError; a bare
        // name reads as a matrix (same convention as \det A).
        if (isHead(args[0], 'Matrix') || this.identityDim(args[0]))
          return [`${this.emit(args[0], PREC_ATOM)}.T`, PREC_ATOM];
        if (isStr(args[0]))
          return [
            `${this.sp}Transpose(${this.matrixArg(args[0], '^T') ?? 'None'})`,
            PREC_ATOM,
          ];
        return [`${this.sp}Transpose(${this.emit(args[0])})`, PREC_ATOM];
      case 'ConjugateTranspose':
        // A^{\dagger} — Adjoint evaluates on matrices and scalars; a
        // bare name reads as a matrix (Adjoint on a Symbol raises).
        if (isStr(args[0]))
          return [
            `${this.sp}Adjoint(${this.matrixArg(args[0], '^\\dagger') ?? 'None'})`,
            PREC_ATOM,
          ];
        return [`${this.sp}Adjoint(${this.emit(args[0])})`, PREC_ATOM];
      case 'EvaluateAt': {
        // \left.f\right|_{lo}^{hi} -> f.subs(v, hi) - f.subs(v, lo).
        const body = args[0];
        const free = freeNames(body);
        const v = free.length === 1 ? free[0] : 'x';
        const bodyText = this.emit(body);
        // A bound can be an equation `x=a` — substitute the point, not
        // the Eq node itself (`subs(x, Eq(x,a))` is meaningless). The
        // equation also pins the variable explicitly, so the
        // infer-the-variable note only applies to bare-point bounds.
        let inferNoted = false;
        const boundSub = (b: MathJson | undefined): string => {
          if (isHead(b, 'Equal') && b.length === 3) {
            const varText = isStr(b[1]) ? this.sym(b[1]) : this.emit(b[1]);
            return `(${bodyText}).subs(${varText}, ${this.emit(b[2])})`;
          }
          if (free.length !== 1 && !inferNoted) {
            inferNoted = true;
            this.scope.flag(
              'note',
              `can't infer the evaluation variable — evaluated w.r.t. ${v}`,
            );
          }
          return `(${bodyText}).subs(${this.sym(v)}, ${this.emit(b)})`;
        };
        const upper = !missingArg(args[2]) ? boundSub(args[2]) : '';
        const lower = !missingArg(args[1]) ? boundSub(args[1]) : '';
        if (upper && lower) return [`${upper} - ${lower}`, PREC_ADD];
        if (upper || lower) return [upper || lower, PREC_ATOM];
        return [bodyText, PREC_ATOM];
      }
      case 'Inverse':
        return [`${this.emit(args[0], PREC_ATOM)}**-1`, PREC_ATOM];
      case 'MatrixMethod': {
        // `\mathrm{trace}(A)`-style word ops fused onto a matrix literal
        // — method calls on the emitted Matrix.
        const w = isStr(args[0]) ? args[0] : 'trace';
        const m = MATRIX_METHODS[w] ?? `${w}()`;
        return [`(${this.emit(args[1])}).${m}`, PREC_ATOM];
      }
      case 'Norm':
        // \|v\|: Abs for scalars, .norm() for matrices — including a
        // bare name already declared as a matrix elsewhere.
        if (isHead(args[0], 'Matrix') || this.identityDim(args[0]))
          return [`(${this.emit(args[0])}).norm()`, PREC_ATOM];
        if (this.matrixRef(args[0]) || (isStr(args[0]) && this.scope.emit.matrices.has(args[0])))
          return [`(${this.emit(args[0])}).norm()`, PREC_ATOM];
        return [`${this.sp}Abs(${this.emit(args[0])})`, PREC_ATOM];
      case 'Divides':
        // a \mid b: a divides b.
        return [
          `${this.sp}Eq(${this.sp}Mod(${this.emit(args[1])}, ${this.emit(args[0])}), 0)`,
          PREC_ATOM,
        ];
      case 'Zeta':
        // \zeta(s) — sp.zeta exists; the Zeta head itself is not a SymPy
        // name and would NameError through the unknown-head stub.
        return [
          `${this.sp}zeta(${args.map((a) => this.emit(a)).join(', ')})`,
          PREC_ATOM,
        ];
      case 'List':
        return [`[${args.map((a) => this.emit(a)).join(', ')}]`, PREC_ATOM];
      case 'Tuple':
        return [
          `(${args.map((a) => this.emit(a)).join(', ')}${args.length === 1 ? ',' : ''})`,
          PREC_ATOM,
        ];
      case 'call': {
        // Unknown/`\operatorname` heads resolve in three tiers:
        // worksheet-declared names call directly (f(x)=...), known SymPy
        // builtins keep the sp.<head> escape hatch, and everything else
        // becomes an undefined worksheet function — `sp.f(x)` raised
        // AttributeError, `f(x)` displays and stays valid.
        // `\text{mean}(…)` reaches here with the name still quoted as
        // 'mean' — unwrap it so pyIdent doesn't mangle to primemean_prime.
        const rawName = isStr(args[0]) ? args[0] : 'unknown';
        const name = unquote(rawName) ?? rawName;
        // `\varphi(n)` parses as GoldenRatio applied to n — sympy's
        // GoldenRatio isn't callable and the textbook reading is
        // Euler's totient.
        if (name === 'GoldenRatio' && args.length === 2)
          return [`${this.sp}totient(${this.emit(args[1])})`, PREC_ATOM];
        // \mathbb{S}^- / \mathbb{S}^+ — the negative/positive half of
        // S, i.e. S ∩ (−∞,0) / S ∩ (0,∞): \mathbb{Z}^- needs the
        // intersection (it isn't an interval), \mathbb{R}^± reduces to
        // the open interval anyway. `\mathbb{S}_{0}^±` (S₀⁺, non-
        // negative/-positive) closes the 0-end, and `^{+}` on a `_0`
        // operand arrives as PseudoInverse.
        if (
          (name === 'Superminus' ||
            name === 'Superplus' ||
            name === 'PseudoInverse') &&
          args.length === 2
        ) {
          const a = args[1];
          // `RealNumbers_{0}`-style names — `_0`/`_{0}` subscript on a
          // number set marks the ±0 variant.
          const zeroedBase = isStr(a) ? stripZeroSuffix(a) : undefined;
          const zeroed =
            zeroedBase !== undefined && SETISH_SYMBOLS.has(zeroedBase);
          // The S ∩ (0,±∞) reading only holds on ℝ/ℤ — `A^{+}` on any
          // other operand is the pseudoinverse (handled below).
          if ((isStr(a) && (a === 'RealNumbers' || a === 'Integers')) || zeroed) {
            const base = zeroed ? this.emit(zeroedBase) : this.emit(a);
            const halfOpen = name === 'Superminus';
            const range =
              name === 'PseudoInverse' ||
              (zeroed && name === 'Superplus')
                ? `${this.sp}Interval(0, ${this.sp}oo)`
                : halfOpen && !zeroed
                  ? `${this.sp}Interval.open(-${this.sp}oo, 0)`
                  : name === 'Superminus'
                    ? `${this.sp}Interval(-${this.sp}oo, 0)`
                    : `${this.sp}Interval.open(0, ${this.sp}oo)`;
            return [
              `${this.sp}Intersection(${base}, ${range})`,
              PREC_ATOM,
            ];
          }
        }
        // `S^{±}` on a non-set operand can't intersect — keep the
        // degradation honest before the generic call emits a stub.
        if (
          (name === 'Superminus' || name === 'Superplus') &&
          args.length === 2
        )
          this.scope.flag(
            'note',
            `signed set superscript needs a set operand — emitted as ${name}(...)`,
          );
        // `A^{+}` on a non-set operand is the Moore–Penrose
        // pseudoinverse. sympy's pinv is a MatrixBase method — even
        // MatrixSymbol has no pinv — so only a concrete matrix operand
        // can exec; anything else flags rather than emitting a
        // plausible AttributeError. (The `x \in S^{+}` membership case
        // never reaches here — setArg reads it as the positive part.)
        if (name === 'PseudoInverse' && args.length === 2) {
          const a = args[1];
          const concrete =
            isHead(a, 'Matrix') ||
            (isStr(a) && this.scope.kinds.matrixNames.has(a));
          if (!concrete)
            this.scope.flag(
              'error',
              "sympy doesn't support pinv for abstract matrices",
            );
          return [
            `(${isStr(a) ? this.mat(a) : this.emit(a, PREC_ATOM)}).pinv()`,
            PREC_ATOM,
          ];
        }
        // \bar{x} — the complex-conjugate convention (as \overline{x});
        // SymPy's mean lives in stats and takes a random variable.
        if (name === 'Mean' && args.length === 2)
          return [`${this.sp}conjugate(${this.emit(args[1])})`, PREC_ATOM];
        // `expr \text{ for } x \in S` — the image of expr over the set,
        // sp.imageset(Lambda(x, expr), S). `for x = 2` parses as a
        // Comprehension with swapped arg order, and `\text{for}`-style
        // inputs are rewritten to Comprehension at parse (their ForAll
        // IR is identical to `\forall`'s — see parseCellLatex). A
        // relational condition (x>0) becomes a real domain
        // (Interval/FiniteSet/Complement) so the image actually
        // evaluates; the bare-var form `x for ...` collapses to the
        // domain itself. Unhandled conditions keep the honest opaque
        // call.
        if (name === 'Comprehension' && args.length === 3) {
          const [cond, expr] = [args[2], args[1]];
          if (isArr(cond) && cond[0] === 'Element' && isStr(cond[1])) {
            const v = cond[1];
            const dom = this.isSetish(cond[2])
              ? this.emit(cond[2])
              : `${this.sp}FiniteSet(${this.emit(cond[2])})`;
            if (expr === v) return [dom, PREC_ATOM];
            return [
              `${this.sp}imageset(${this.sp}Lambda(${this.sym(v)}, ${this.emit(expr)}), ${dom})`,
              PREC_ATOM,
            ];
          }
          const dom = this.relationalDomain(cond);
          if (dom !== undefined) {
            if (expr === dom[1]) return [dom[0], PREC_ATOM];
            return [
              `${this.sp}imageset(${this.sp}Lambda(${this.sym(dom[1])}, ${this.emit(expr)}), ${dom[0]})`,
              PREC_ATOM,
            ];
          }
          return [
            `${this.fn(name)}(${this.emit(cond)}, ${this.emit(expr)})`,
            PREC_ATOM,
          ];
        }
        // `\forall`/`\exists` — sympy 1.14 has no quantifier objects at
        // all, so the predicate is the emitted form: `∀x∈S, p` →
        // `Implies(Contains(x, S), p)` and `∃x∈S, p` → `And(Contains,
        // p)`; a relational domain (`∀x>0, p`) emits the condition the
        // same way. A non-Boolean body (`\forall x\in S, 2x`) isn't a
        // predicate — flag rather than emitting `Implies(..., 2*x)`
        // (TypeError at exec). `∀x, p` binds no domain — emit the
        // predicate itself.
        if (
          (name === 'ForAll' || name === 'Exists') &&
          args.length === 3
        ) {
          const [dom, pred] = [args[1], args[2]];
          if (
            !isArr(pred) ||
            !BOOLISH_HEADS.has(headOf(pred) ?? '') ||
            (!isStr(dom) &&
              !(isArr(dom) && BOOLISH_HEADS.has(headOf(dom) ?? '')))
          ) {
            this.scope.flag(
              'error',
              `${name === 'ForAll' ? '\\forall' : '\\exists'} needs a boolean predicate — sympy has no quantifiers`,
            );
            return [`${this.sp}True`, PREC_ATOM];
          }
          if (isStr(dom)) return [this.emit(pred), PREC_ATOM];
          // `x∈S` domains: enumerable-finite sets iterate to the
          // evaluated Boolean; everything else is the imageset check.
          if (isArr(dom) && dom[0] === 'Element') {
            const [v, set] = [dom[1], dom[2]];
            if (isStr(v)) {
              // `∀x∈ℝ` still records `x ∈ ℝ` at first reference —
              // real=True (or MatrixSymbol dims) lands on the decl.
              this.assumeFrom(v, set);
              if (this.isFiniteSet(set)) {
                // Iterate the elements so the answer evaluates at exec —
                // `∀x∈A, p` → `And(*(p.subs(x, e) for e in A))`, `∃` → Or.
                const p = this.emit(pred);
                return [
                  `${this.sp}${name === 'ForAll' ? 'And' : 'Or'}(*[(${p}).subs(${this.sym(v)}, _e) for _e in ${this.emit(set)}])`,
                  PREC_ATOM,
                ];
              }
              // `∀x∈S, p` is "False isn't in the predicate's image"
              // ({True} on all-true, {} vacuous — both excluded by
              // Contains), `∃x∈S, p` is "True is in the image".
              // evaluate=False: the eager containment solve can raise
              // TypeError on Boolean elements.
              // `ImageSet` (constructor) not `imageset` — the function
              // eagerly takes a limit over Interval domains and raises
              // AttributeError on a Boolean lambda body.
              const img = `${this.sp}ImageSet(${this.sp}Lambda(${this.sym(v)}, ${this.emit(pred)}), ${this.setArg(set)})`;
              return [
                name === 'ForAll'
                  ? `${this.sp}Not(${this.sp}Contains(${this.sp}false, ${img}, evaluate=False))`
                  : `${this.sp}Contains(${this.sp}true, ${img}, evaluate=False)`,
                PREC_ATOM,
              ];
            }
          }
          const comb = name === 'ForAll' ? 'Implies' : 'And';
          return [
            `${this.sp}${comb}(${this.emit(dom)}, ${this.emit(pred)})`,
            PREC_ATOM,
          ];
        }
        // `f \circ g` — CE's composition head is literally 'Ring',
        // which the tiers below would resolve to sympy's ring-domain
        // constructor.
        if (name === 'Ring' && args.length === 3) {
          const f = isStr(args[1]) ? this.fn(args[1]) : this.emit(args[1]);
          // `g ∘ f` where the inner operand is already an application —
          // `g ∘ f(x)` gives Ring(g, f(x)): emit `g(f(x))`, not the
          // double-application `g(f(x)(x))`.
          const gIsExpr = !isStr(args[2]);
          const g = isStr(args[2]) ? this.fn(args[2]) : this.emit(args[2]);
          const t = `${this.sp}Symbol("x")`;
          return [
            `${this.sp}Lambda(${t}, ${gIsExpr ? `${f}(${g})` : `${f}(${g}(${t}))`})`,
            PREC_LOW,
          ];
        }
        // `\operatorname{tr}`/`\mathrm{tr}` — CE calls them `Trace`; on
        // a matrix this is the `.trace()` method call like
        // `\mathrm{trace}` (sp.Trace on a bare Symbol raises, the same
        // 'Symbol' has no 'det' crash class).
        if (name === 'Trace' && args.length === 2) {
          if (isHead(args[1], 'Matrix') || this.matrixRef(args[1]))
            return [`(${this.emit(args[1])}).trace()`, PREC_ATOM];
          return [
            `${this.sp}Trace(${this.matrixArg(args[1], '\\operatorname{tr}') ?? 'None'})`,
            PREC_ATOM,
          ];
        }
        // `z^{*}`/`A^{*}` — CE's superscript-star head. A declared
        // matrix reads as the conjugate transpose (Adjoint crashes on
        // scalars); a set operand reads as S∖{0} (`\mathbb{Z}^{*}` —
        // conjugate of a Set raised TypeError); anything else is the
        // complex conjugate.
        if (name === 'Superstar' && args.length === 2) {
          const a = args[1];
          if (isStr(a) && this.scope.emit.matrices.has(a))
            return [
              `${this.sp}Adjoint(${this.matrixArg(a, '*') ?? 'None'})`,
              PREC_ATOM,
            ];
          if (this.isSetish(a))
            return [
              `${this.sp}Complement(${this.emit(a)}, ${this.sp}FiniteSet(0))`,
              PREC_ATOM,
            ];
          return [`${this.sp}conjugate(${this.emit(a)})`, PREC_ATOM];
        }
        // `\delta_{ij}` — index positions keep `i` an ordinary symbol;
        // the global free-`i` rule would emit the imaginary unit.
        if (name === 'KroneckerDelta' && args.length === 3) {
          return this.scope.withLambdaBound(['i'], () => {
            const rendered = args
              .slice(1)
              .map((a) => this.emit(a))
              .join(', ');
            return [
              `${this.sp}KroneckerDelta(${rendered})`,
              PREC_ATOM,
            ] as [string, number];
          });
        }
        const rendered = args
          .slice(1)
          .map((a) => this.callArg(a))
          .join(', ');
        // `\mathrm{trace|rank|inverse|transpose|norm|eigenvals|
        // eigenvects|tr}(A)`: sympy exposes these as Matrix methods,
        // so a literal or worksheet-declared matrix argument emits the
        // method call; a matrix-valued expression (`A + B`, `2A`)
        // emits it too where the method exists on MatrixExpr
        // (trace/inverse/transpose) or every matrix leaf is a literal.
        // On anything else the bare `sp.<word>` either doesn't exist or
        // raises TypeError — flag + honest stub.
        const mm = MATRIX_METHODS[name];
        if (mm !== undefined && args.length === 2) {
          if (isHead(args[1], 'Matrix') || this.matrixRef(args[1]))
            return [`(${this.emit(args[1])}).${mm}`, PREC_ATOM];
          if (this.matrixValued(args[1])) {
            // A matrix-valued expression (`\mathrm{tr}(A + B)`): only
            // trace/inverse/transpose exist on sympy MatrixExpr — the
            // rest need every matrix leaf to be a literal.
            if (name === 'trace' || name === 'Trace' || name === 'tr')
              return [
                `${this.sp}Trace(${this.emit(args[1])})`,
                PREC_ATOM,
              ];
            if (
              name === 'inverse' ||
              name === 'transpose' ||
              this.concreteMatrix(args[1])
            )
              return [`(${this.emit(args[1])}).${mm}`, PREC_ATOM];
            this.scope.flag(
              'note',
              `${name} needs a concrete matrix — the argument is a symbolic matrix expression`,
            );
            return [`${this.fn(name)}(${this.emit(args[1])})`, PREC_ATOM];
          }
          this.scope.flag(
            'note',
            `${name === 'Trace' || name === 'tr' ? 'trace' : name} needs a matrix — the argument isn't one`,
          );
          return [`${this.fn(name)}(${this.emit(args[1])})`, PREC_ATOM];
        }
        // `a \equiv b \pmod{m}` — SymPy has no modular-congruence
        // relation, but Eq(Mod(a, m), b) states it faithfully.
        if (name === 'Congruent' && args.length === 4)
          return [
            `${this.sp}Eq(${this.sp}Mod(${this.emit(args[1])}, ${this.emit(args[3])}), ${this.emit(args[2])})`,
            PREC_ATOM,
          ];
        if (CALL_RENAMES[name])
          return [`${this.sp}${CALL_RENAMES[name]}(${rendered})`, PREC_ATOM];
        if (this.scope.decls.declared.has(name) || !SP_BUILTIN_CALL.has(name)) {
          // Record the application so a later bare `f` in operand
          // position emits `f(<args>)` — an UndefinedFunction operand
          // raises TypeError (the name itself as arg is filtered so
          // self-reference can't recurse).
          const fnArgs = args.slice(1).filter((a) => a !== name);
          this.scope.noteCallArgs(name, fnArgs);
          return [`${this.fn(name)}(${rendered})`, PREC_ATOM];
        }
        return [`${this.sp}${pyIdent(name)}(${rendered})`, PREC_ATOM];
      }
      default:
        if (SP_FUNCS[h]) {
          const fnName = SP_FUNCS[h];
          const minArgs = SP_FUNC_MIN_ARGS[fnName] ?? 0;
          if (args.length < minArgs) {
            this.scope.flag(
              'error',
              `${fnName} needs at least ${minArgs} arguments`,
            );
            return [`${this.sp}${fnName}(${args.map((a) => this.callArg(a)).join(', ')})`, PREC_ATOM];
          }
          // gcd/lcm take exactly two terms — a third arg lands in *gens
          // (polynomial generators) and SymPy raises
          // AttributeError/'int' object has no attribute 'is_commutative'
          // on numbers. The list form folds over all terms.
          if ((fnName === 'gcd' || fnName === 'lcm') && args.length > 2) {
            return [
              `${this.sp}${fnName}([${args.map((a) => this.callArg(a)).join(', ')}])`,
              PREC_ATOM,
            ];
          }
          return [
            `${this.sp}${fnName}(${args.map((a) => this.callArg(a)).join(', ')})`,
            PREC_ATOM,
          ];
        }
        // Shouldn't reach — normalizeIR wraps unknown heads in 'call' —
        // but stay unblocked if raw IR is fed in directly.
        this.scope.flag('note', `unknown head "${h}" — emitted as ${h}(...)`);
        return [
          `${this.sp}${pyIdent(h)}(${args.map((a) => this.callArg(a)).join(', ')})`,
          PREC_ATOM,
        ];
    }
  }
}

// CE wraps calculus bodies as ["Function", body, x] (x binds the operator
// variable). Unwrap to the plain body + the bound parameter list.
function unwrapLambda(node: MathJson): { body: MathJson; params: string[] } {
  if (isHead(node, 'Function') && node.length >= 3)
    return {
      body: node[1],
      params: node.slice(2).filter(isStr),
    };
  return { body: node, params: [] };
}

interface StatementOut {
  lines: string[];
  /** Expression to eval for the statement's displayed value — set only
   * for non-expression statements (Assign/Def), whose `lines` exec first
   * and this evals for the row (e.g. `a = 5` shows `a = 5`). Undefined
   * means the emitted code itself is the display expression. */
  display?: string;
  /** The statement binds a name (Assign/Def/Declare) — its `display`
   * echoes the definition itself, so the shown program drops its
   * `e = …` capture line even in the plumbing view. */
  defines?: boolean;
}

interface CellBody {
  /** Symbol/Function def lines for names first needed by this cell. */
  defs: string[];
  /** Emitted top-level statements, in order (pre-collapse). `errs`
   * carries the emission errors of a statement that produced no lines —
   * the calculator target turns those into in-place error rows. `emitted`
   * is every issue raised during that statement (line-binding data).
   * `line` is the statement's 0-based input-line index. */
  parts: {
    stmt: MathJson;
    out: StatementOut;
    errs: Issue[];
    emitted: Issue[];
    line: number;
  }[];
  /** Symbol/function names first bound in this cell. */
  newNames: Set<string>;
}

// Free symbol names inside an expression — used to infer the variable of
// an integral written without a differential. Constants, the CE 'Nothing'
// marker, and callee names (f in f(t), call heads) don't count.
function freeNames(node: MathJson, acc = new Set<string>()): string[] {
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
function isIntExpr(v: MathJson | undefined): boolean {
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
function allNames(node: MathJson, acc: Set<string>): void {
  if (isStr(node)) {
    acc.add(node);
    return;
  }
  if (isArr(node)) for (const child of node) allNames(child, acc);
}

// The next constant-of-integration letter: first capital not in `used`
// (C, else D, E, …). `used` is mutated — the returned letter is claimed.
// Exhausted alphabet falls back to reusing C — nothing else is left to
// give. Shared with the interim nerdamer emitter so both engines pick
// the same letter for the same cell.
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

// The next constant of integration: first capital letter not used by the
// cell or bound elsewhere in the worksheet (C, else D, E, …).
function nextConstName(scope: Scope): string {
  return firstFreeCapital(scope.emit.constNames);
}

// Emit one normalized cell IR into defs + per-statement lines. Cells are
// independent: the scope's defined/symbols/functions sets are fresh per
// cell, so every free name the cell uses gets its def line at the top of
// the cell (`a = Symbol("a")` / `f = Function("f")`, `sp.`-qualified when
// `import sympy as sp` mode is selected).
function cellBody(ir: MathJson, scope: Scope): CellBody {
  const emitter = new Emitter(scope);
  const sp = scope.qualified ? 'sp.' : '';
  const preDefined = new Set(scope.decls.defined);
  // Reserve the cell's own names (and worksheet Assign/Def targets) so
  // constants of integration start at the first free capital.
  scope.reserveConstNames(ir);
  // `\text{where}`-style blocks arrive condition-first: `x² where x>0`
  // parses as WhereBlock(Gt, x²) — a single written statement CE split
  // internally (parseCellLatex tags them). Emit the body row before its
  // conditions — the order the user wrote, not CE's. Real `\\` rows are
  // Block children and stay in written order.
  const RELATION_HEADS = new Set([
    'Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual',
    'NotLess', 'NotGreater', 'NotLessEqual', 'NotGreaterEqual',
    'Element', 'NotElement', 'Subset', 'SubsetEqual', 'Superset',
    'SupersetEqual', 'IdenticallyEqual', 'Congruent',
  ]);
  const isRelation = (n: MathJson): boolean => RELATION_HEADS.has(headOf(n) ?? '');
  const blockNodes = isHead(ir, 'Block') ? ir.slice(1) : [ir];
  // Each node carries the index of the displayline it came from — a
  // WhereBlock expands one input line into several statements, so the
  // nodes index alone is not the line number.
  const nodes = blockNodes.flatMap((n, line) => {
    const tag = (stmt: MathJson) => ({ stmt, line });
    if (!isHead(n, 'WhereBlock')) return [tag(n)];
    const kids = n.slice(1);
    return (
      kids.length > 1 &&
      kids.slice(0, -1).every(isRelation) &&
      !isRelation(kids[kids.length - 1])
        ? [kids[kids.length - 1], ...kids.slice(0, -1)]
        : kids
    ).map(tag);
  });
  const parts = nodes.map(({ stmt, line }) => {
    const issuesAt = scope.issues.length;
    const out = emitStatement(stmt, emitter);
    // Every issue raised while emitting this statement — notes included,
    // so unbound issues can anchor at the line that produced them.
    const emitted = scope.issues.slice(issuesAt);
    // A statement dropped by an emission error keeps its row as an
    // in-place error so multi-statement cells keep written order.
    const errs =
      out.lines.length === 0
        ? emitted.filter((i) => i.severity === 'error')
        : [];
    return { stmt, out, errs, emitted, line };
  });

  // Names first needed in this cell (not already bound in earlier ones).
  const newSyms = [...scope.emit.symbols].filter(([raw]) => !preDefined.has(raw));
  // Function-bound names (Def/`f:`) sit in `functions` for call-fold
  // detection but declare themselves — no `sp.Function` def for them.
  const newFns = [...scope.emit.functions].filter(
    ([raw]) => !preDefined.has(raw) && !scope.decls.declaredFns.has(raw),
  );
  const newMats = [...scope.emit.matrices].filter(
    ([raw]) => !preDefined.has(raw),
  );
  const newNames = new Set(
    [...newSyms, ...newFns, ...newMats].map(([raw]) => raw),
  );
  scope.markDefinedAll(newNames);

  const defs: string[] = [];
  // `simple` names are already valid identifiers — they go in one grouped
  // `sp.symbols('a b')` call whose string must not contain quotes or
  // punctuation. Anything needing mangling (a_0', {abc}, ? names) gets an
  // individual `sp.Symbol("raw name")` def where JSON quoting is safe.
  const simple = newSyms.filter(
    ([raw, ident]) =>
      raw === ident &&
      !scope.kinds.assumptions.has(raw) &&
      !scope.kinds.matrixDims.has(raw) &&
      CE_DISPLAY_NAMES[raw] === undefined,
  );
  const fancy = newSyms.filter(
    ([raw, ident]) =>
      raw !== ident ||
      scope.kinds.assumptions.has(raw) ||
      scope.kinds.matrixDims.has(raw) ||
      CE_DISPLAY_NAMES[raw] !== undefined,
  );
  if (simple.length === 1)
    defs.push(`${simple[0][1]} = ${sp}Symbol(${JSON.stringify(simple[0][0])})`);
  else if (simple.length > 1)
    defs.push(
      `${simple.map(([, ident]) => ident).join(', ')} = ${sp}symbols('${simple.map(([raw]) => raw).join(' ')}')`,
    );
  for (const [raw, ident] of fancy) {
    const dim = scope.kinds.matrixDims.get(raw);
    const kw = scope.kinds.assumptions.get(raw);
    if (dim)
      defs.push(
        `${ident} = ${sp}MatrixSymbol(${JSON.stringify(raw)}, ${dim[0]}, ${dim[1]})`,
      );
    else
      defs.push(
        `${ident} = ${sp}Symbol(${JSON.stringify(CE_DISPLAY_NAMES[raw] ?? raw)}${kw?.size ? `, ${[...kw].join(', ')}` : ''})`,
      );
  }
  for (const [raw, ident] of newFns)
    defs.push(`${ident} = ${sp}Function(${JSON.stringify(raw)})`);
  for (const [raw, ident] of newMats)
    defs.push(
      `${ident} = ${sp}MatrixSymbol(${JSON.stringify(raw)}, ${sp}Symbol("n", integer=True, positive=True), ${sp}Symbol("n", integer=True, positive=True))`,
    );

  return { defs, parts, newNames };
}

function cellStatements(ir: MathJson | undefined, scope: Scope): string[] {
  if (ir === undefined) return [];
  const { defs, parts, newNames } = cellBody(ir, scope);

  // A bare `a` cell whose symbol is defined here collapses to just the
  // definition line — `a = Symbol("a")` is the cell's output.
  const stmts = parts.flatMap(({ stmt, out }) =>
    isStr(stmt) && newNames.has(stmt) ? [] : out.lines,
  );
  return [...defs, ...stmts];
}

// Emit a single expression statement, dropping it when emission flagged
// an error — a broken statement produces `sp.Error(...)`/`None` fragments
// that just repeat what the issues list already says.
function emitExprStatement(node: MathJson, emitter: Emitter): StatementOut {
  const before = emitter.scope.errorCount;
  const line = emitter.emit(node);
  if (emitter.scope.errorCount !== before) return { lines: [] };
  // Compound memberships (`x \in (a,b]`) emit inside `with assuming(...)`
  // so Contains sees the member's implied domain; the membership itself
  // stays the row's display expression.
  const wrap = emitter.assumingWrap(node);
  if (wrap) return { lines: [wrap, `    ${line}`], display: line };
  return { lines: [line] };
}

// A `\python` body's last line can be an expression — eval it and show
// the value (REPL lane), like the trailing line at a python prompt.
// Returns undefined for statement-ending bodies (they echo the source):
// statement keywords, assignments, `;` chains, suite members (indented
// or `\`-continued), and unbalanced brackets — the conservative check
// keeps a partial expression from replacing the source with a
// SyntaxError row.
const PY_STMT_LINE_RE =
  /^[ \t]*(def|class|import|from|if|elif|else|for|while|try|except|finally|with|return|raise|assert|del|global|nonlocal|pass|break|continue|yield)\b/;
// `=` that isn't part of ==, !=, <=, >=, :=, +=, **=, … — assignment
// lines exec but aren't eval'able expressions.
const PY_ASSIGN_RE = /(?<![=<>!:+\-*/%&|^~@])=(?![=>])/;

function trailingPythonExpr(code: string): string | undefined {
  const lines = code.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#')) continue;
    if (
      lines[i - 1]?.trimEnd().endsWith('\\') || // glued to the line above
      /^\s/.test(lines[i]) || // suite member, not a top-level line
      PY_STMT_LINE_RE.test(line) ||
      PY_ASSIGN_RE.test(line) ||
      line.includes(';') ||
      /[+\-*/%&|^~@<>=,\\]$/.test(line)
    )
      return undefined;
    let depth = 0;
    for (const c of line) {
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      if (depth < 0) return undefined;
    }
    return depth === 0 ? line : undefined;
  }
  return undefined;
}

// `a = 5` shows `a = 5` — a fresh Symbol for the target renders the raw
// name (`x_{1}` shows subscripted, not `x_1`). Matrix/set RHSs need
// evaluate=False: Eq(Symbol, Matrix|FiniteSet) collapses to literal False.
function assignDisplay(
  sp: string,
  name: string,
  rhs: string,
  matrixRhs = false,
): string {
  const uneval = matrixRhs ? ', evaluate=False' : '';
  return `${sp}Eq(${sp}Symbol(${JSON.stringify(name)}), ${rhs}${uneval})`;
}

function emitStatement(node: MathJson, emitter: Emitter): StatementOut {
  const sp = emitter.scope.qualified ? 'sp.' : '';
  if (!isArr(node)) return emitExprStatement(node, emitter);
  const h = headOf(node);
  if (h === 'Assign') {
    // RHS emits first so `x = x + 1` collects x as a symbol; the Assign
    // then marks `x` bound for later statements/cells.
    const before = emitter.scope.errorCount;
    const rhs = emitter.emit(node[2]);
    // (x, y) = (1, 2) — python tuple-unpack; every member binds.
    if (isHead(node[1], 'List')) {
      const members = node[1].slice(1).filter(isStr);
      for (const m of members) emitter.scope.markDefined(m);
      if (emitter.scope.errorCount > before) return { lines: [] };
      const idents = members.map(pyIdent).join(', ');
      return {
        lines: [`${idents} = ${rhs}`],
        display: `${sp}Eq(${sp}Tuple(${members
          .map((m) => `${sp}Symbol(${JSON.stringify(m)})`)
          .join(', ')}), ${rhs})`,
        defines: true,
      };
    }
    const name = isStr(node[1]) ? node[1] : 'result';
    // `f = x \mapsto body` binds a callable — later `f(…)` call-folds
    // like a def'd name instead of flagging a bound-value call.
    if (isStr(node[1]) && isHead(node[2], 'Function'))
      emitter.scope.declareFn(node[1]);
    // Matrix-valued by shape, not by emitted text — `I_2` emits
    // `sp.eye(2)`, `B = A^T` emits `Transpose`, and Eq(Symbol, <matrix>)
    // collapses to literal False without evaluate=False.
    const matrixRhs = emitter.matrixValued(node[2], true);
    const setRhs = emitter.isSetish(node[2]);
    const finiteRhs = emitter.isFiniteSet(node[2]);
    const listRhs =
      isHead(node[2], 'List') ||
      (isStr(node[2]) && emitter.scope.kinds.listNames.has(node[2]));
    if (isStr(node[1]))
      // One transition: bound + all value-kind sets refreshed + the
      // name's function residue cleared (see bindAssigned).
      emitter.scope.bindAssigned(name, {
        matrix: matrixRhs,
        set: setRhs,
        finite: finiteRhs,
        list: listRhs,
      });
    if (emitter.scope.errorCount > before) return { lines: [] };
    return {
      lines: [`${pyIdent(name)} = ${rhs}`],
      display: assignDisplay(sp, name, rhs, matrixRhs || setRhs),
      defines: true,
    };
  }
  // `\text{def} f(x)` — a declaration without a body: f binds an
  // undefined function so `f'(x)` and operand uses still apply it.
  if (h === 'Declare') {
    const name = isStr(node[1]) ? node[1] : 'f';
    const params = isHead(node[2], 'List')
      ? node[2].slice(1).filter(isStr)
      : [];
    emitter.scope.claimFunction(name, params);
    return {
      lines: [`${pyIdent(name)} = ${sp}Function(${JSON.stringify(name)})`],
      // Zero params: show `f` (the function itself), not `f()`.
      display:
        params.length === 0
          ? `${sp}Function(${JSON.stringify(name)})`
          : `${sp}Function(${JSON.stringify(name)})(${params
              .map((p) => `${sp}Symbol(${JSON.stringify(p)})`)
              .join(', ')})`,
      defines: true,
    };
  }
  if (h === 'Def') {
    const name = isStr(node[1]) ? node[1] : 'f';
    const params =
      isHead(node[2], 'List') ? node[2].slice(1).filter(isStr) : [];
    const before = emitter.scope.errorCount;
    const body = emitter.scope.withBoundOnly(params, () =>
      emitter.emit(node[3]),
    );
    // A later bare `f` in operand position emits `f(<params>)` — an
    // unapplied function object raises TypeError as an operand.
    emitter.scope.claimFunction(name, params);
    if (emitter.scope.errorCount > before) return { lines: [] };
    const idents = params.map(pyIdent).join(', ');
    // `f(x) = body` rendered via an undefined function — the def'd python
    // function would just evaluate back to body. The lambda binds the
    // param idents to fresh Symbols so the display needs no namespace
    // entries for the (def-local) parameters.
    const display =
      params.length === 0
        ? `${sp}Eq(${sp}Function(${JSON.stringify(name)})(), ${body})`
        : `(lambda ${idents}: ${sp}Eq(${sp}Function(${JSON.stringify(name)})(${idents}), ${body}))(${params
            .map((p) => `${sp}Symbol(${JSON.stringify(p)})`)
            .join(', ')})`;
    return {
      lines: [`def ${pyIdent(name)}(${idents}):`, `    return ${body}`],
      display,
      defines: true,
    };
  }
  // `f: x ↦ body` — the colon names the lambda's result; bind it (like
  // `f = x ↦ x²`) or a later `f(2)` stays unevaluated. Normalization
  // rewrites the typed signature two ways: a single param wraps into the
  // Function node as `call Typed(f, x)`, several params split out as a
  // top-level `call Colon(f, Function(body, x, y))`.
  if (h === 'Function' && node.length === 3) {
    const typed = node[2];
    if (
      isArr(typed) &&
      headOf(typed) === 'call' &&
      typed[1] === 'Typed' &&
      isStr(typed[2])
    ) {
      const name = typed[2];
      const sig = isStr(typed[3]) ? typed[3] : 'x';
      const before = emitter.scope.errorCount;
      const rhs = emitter.emit(['Function', node[1], sig]);
      emitter.scope.claimFunction(name, [sig]);
      if (emitter.scope.errorCount > before) return { lines: [] };
      return {
        lines: [`${pyIdent(name)} = ${rhs}`],
        display: assignDisplay(sp, name, rhs),
        defines: true,
      };
    }
  }
  if (
    h === 'call' &&
    node[1] === 'Colon' &&
    isStr(node[2]) &&
    isHead(node[3], 'Function')
  ) {
    const name = node[2];
    const before = emitter.scope.errorCount;
    const rhs = emitter.emit(node[3]);
    const colonParams = node[3].slice(2).filter(isStr);
    emitter.scope.claimFunction(name, colonParams);
    if (emitter.scope.errorCount > before) return { lines: [] };
    return {
      lines: [`${pyIdent(name)} = ${rhs}`],
      display: assignDisplay(sp, name, rhs),
      defines: true,
    };
  }
  // `\python{ ... }` — verbatim user source. It execs in the python
  // target's program or the calculator's shared namespace. When the
  // last line is an expression, the row displays its value (REPL
  // lane — `\python{f(9)}` shows 10); statement-ending bodies echo the
  // source that ran.
  if (h === 'PythonSource') {
    const code = isStr(node[1]) ? node[1] : '';
    if (code.trim() === '') return { lines: [] };
    return { lines: [code], display: trailingPythonExpr(code) ?? JSON.stringify(code) };
  }
  if (h === 'Block' || h === 'WhereBlock')
    return {
      lines: node.slice(1).flatMap((s) => emitStatement(s, emitter).lines),
    };
  return emitExprStatement(node, emitter);
}

// Walk normalized IR for heads that only lower to Python.
function findStatementHeads(node: MathJson, found: Set<string>): void {
  if (!isArr(node)) return;
  const h = headOf(node);
  if (h && STATEMENT_HEADS.has(h))
    found.add(h === 'Def' ? 'Function' : h === 'Which' ? 'Piecewise' : h);
  if (h === 'call' && isStr(node[1]) && STATEMENT_CALL_HEADS.has(node[1]))
    found.add(node[1]);
  for (const child of node.slice(1)) findStatementHeads(child, found);
}

export interface CompileOptions {
  /** Emit `from sympy import *` and unqualified sympy names (default).
   * `false` emits `import sympy as sp` with `sp.` qualifiers. */
  importAll?: boolean;
}

// Compile the whole worksheet. `python` produces a runnable SymPy program;
// other targets return diagnostics (expression lowering lands later).
export function compileWorksheet(
  cells: CellInput[],
  target: string,
  opts: CompileOptions = {},
): CompileResult {
  const qualified = opts.importAll === false;
  const importLine = qualified
    ? 'import sympy as sp'
    : 'from sympy import *';
  const perCell = cells.map((c) => normalizeIR(c.json));
  const issues: Issue[] = perCell.flatMap((r, i) =>
    r.issues.map((iss) => ({
      ...iss,
      message: `cell ${i + 1}: ${iss.message}`,
    })),
  );

  if (target !== 'python') {
    const gated = new Set<string>();
    for (const r of perCell)
      if (r.ir !== undefined) findStatementHeads(r.ir, gated);
    if (gated.size > 0) {
      const names = [...gated].join(', ');
      return {
        ok: false,
        program: '',
        importLine,
        cellLines: cells.map(() => []),
        cellIssues: perCell.map((r) => r.issues),
        normalized: perCell,
        issues: [
          ...issues,
          {
            severity: 'error',
            message: `statement-level construct${gated.size > 1 ? 's' : ''} (${names}) cannot target ${target}`,
          },
        ],
      };
    }
    return {
      ok: false,
      program: '',
      importLine,
      cellLines: cells.map(() => []),
      cellIssues: perCell.map((r) => r.issues),
      normalized: perCell,
      issues: [
        ...issues,
        {
          severity: 'note',
          message: `${target} codegen is not implemented yet — only Python/SymPy is`,
        },
      ],
    };
  }

  const declared = new Set<string>();
  const declaredFns = new Set<string>();
  for (const r of perCell)
    if (r.ir !== undefined) collectDeclared(r.ir, declared, declaredFns);

  // Each cell emits with fresh defined/symbols/functions state — cells
  // are independent, so a name used in a cell is always defined there.
  // matrixNames is likewise cell-scoped: `A` declared a matrix in cell 1
  // is a fresh Symbol in cell 2's program, so `\det(A)` there must flag
  // rather than emit `A.det()` on a Symbol (TypeError at exec).
  const genIssues: Issue[][] = cells.map(() => []);
  const cellBodies = perCell.map((r, i) => {
    if (r.ir === undefined) return [];
    const matrixNames = new Set<string>();
    collectMatrices(r.ir, matrixNames);
    // `declaredFns` is worksheet-wide, but cells are independent
    // programs — a name def'd in cell 1 still gets its own
    // `f = sp.Function` decl when called in cell 2, and only an
    // Assign-rebind in THIS cell drops a pending Function decl.
    const cellDeclaredFns = new Set<string>();
    collectDeclared(r.ir, new Set(), cellDeclaredFns);
    return cellStatements(
      r.ir,
      new Scope(
        qualified,
        declared,
        cellDeclaredFns,
        matrixNames,
        issues,
        genIssues,
        i + 1,
      ),
    );
  });
  const cellLines = cellBodies.map((body) =>
    body.length === 0 ? [] : [importLine, ...body],
  );

  // The one-script copy is the concatenation of the per-cell outputs
  // with the import emitted once at the top.
  const lines: string[] = [importLine];
  cellBodies.forEach((stmts, i) => {
    if (stmts.length === 0) return;
    lines.push('', `# cell ${i + 1}`, ...stmts);
  });

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    program: lines.join('\n'),
    importLine,
    cellLines,
    cellIssues: perCell.map((r, i) => [...r.issues, ...genIssues[i]]),
    normalized: perCell,
    issues,
  };
}

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
function collectMatrices(ir: MathJson, matrixNames: Set<string>): void {
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

// `emit` flags a dropped Error node with this generic message; the
// normalizer already issued the real diagnostic, so the placeholder is
// marker-only — the python overlay renders it as a ! icon (never text)
// and the calculator drops it from statement errors entirely.
const UNPARSEABLE_MSG = 'unparseable input — statement skipped';

export interface CalcStatement {
  /** Python source for the statement: exec'd (Assign/Def) or eval'd
   * (expression) by the calculator worker. */
  code: string;
  /** When set, `code` execs first, then this evals for the row's value.
   * Absent = `code` evals directly for the row. */
  display?: string;
  /** The statement binds a name (assign/def/declare) — the shown
   * program never inlines its `e = <display>` capture line, even in
   * the plumbing view (the display just echoes the definition). */
  defines?: boolean;
  /** Set when the statement itself failed to emit — reported as an
   * error row in place so the cell keeps written order. */
  error?: string;
  /** 0-based input line (displayline index) the statement came from —
   * where a line-anchored issue indicator would pin. */
  line?: number;
}

export interface CalcProgram {
  /** Script prefix — `import sympy as sp` plus the cell's Symbol/Function
   * defs. The worker execs it before the statements. */
  prelude: string[];
  statements: CalcStatement[];
  /** Normalization + codegen issues for the cell. */
  issues: Issue[];
  /** 0-based line of the first statement that failed to emit — where
   * unbound issues (which carry no line of their own) anchor. */
  errorLine?: number;
  /** Input-line index of each `statements` entry — the row ordering
   * key for interleaving issue rows in the output. */
  statementLines: number[];
}

export interface CalcCellProgram {
  /** Decl lines (Symbol/Function/MatrixSymbol) first needed by this
   * cell. The worker execs them right before the cell's statements,
   * after every earlier cell's program — names bound above are already
   * in scope, so no shadowing decl is emitted for them. */
  defs: string[];
  statements: CalcStatement[];
  /** Normalization + codegen issues for the cell. */
  issues: Issue[];
  errorLine?: number;
  statementLines: number[];
}

export interface CalcWorksheetProgram {
  /** Shared script prefix — `import sympy as sp` plus the
   * CALC_RUNTIME_PY helper block. The worker execs it once, ahead of
   * cell 0's defs and statements. */
  prelude: string[];
  cells: CalcCellProgram[];
}

// Wrap an evaluated expression in the worker's result pipeline so the
// emitted program itself applies doit -> simplify -> degree-order —
// auditing the shown code explains the shown result.
const calcEval = (expr: string): string =>
  `clean_and_simplify(${expr})`;

// Compile one cell's normalized IR inside `scope`, which the caller may
// share with earlier cells — the scope's defined/symbols/functions/declared
// state then carries downward, and this cell emits decls only for names
// not already bound above. Also folds the cell's own declared names into
// the scope so later statements (and later cells) see them.
function compileCellInScope(
  ir: MathJson,
  issues: Issue[],
  scope: Scope,
): CalcCellProgram {
  scope.scanDecls(ir);
  scope.issues = issues;
  scope.errorCount = 0;
  const { defs, parts } = cellBody(ir, scope);
  // Statements dropped by an emission error carry it in place — the
  // error becomes their row so the cell keeps written order. The
  // "statement skipped" placeholder doesn't count as an error here:
  // the normalizer's diagnostic already reports the problem, so a
  // statement left with no code and no real error yields no row.
  let errorLine: number | undefined;
  const statementLines: number[] = [];
  const statements = parts
    .map(({ out, errs, line }) => {
      if (errs.length > 0 && errorLine === undefined) errorLine = line;
      return {
        out,
        line,
        error:
          errs
            .map((e) => e.message)
            .filter((m) => m !== UNPARSEABLE_MSG)
            .join('; ') || undefined,
      };
    })
    .filter(({ out, error, line }) => {
      if (out.lines.length === 0 && error === undefined) return false;
      // The surviving statements' part indices, in order — parallel to
      // `statements`, for placing issue rows between result rows.
      statementLines.push(line);
      return true;
    })
    .map(({ out, error, line }) => ({
      // The worker evals each statement as written, so the result
      // pipeline (doit -> simplify -> decreasing-degree order) is
      // emitted INTO the program — the generating-code block then shows exactly
      // the code that produced the row. The mc_* helpers are the
      // worker runtime in calculator.worker.ts.
      code:
        out.display === undefined && out.lines.length === 1
          ? calcEval(out.lines[0])
          : out.lines.join('\n'),
      display: out.display === undefined ? undefined : calcEval(out.display),
      defines: out.defines,
      error,
      // Line anchors only matter where an error points back at input.
      ...(error !== undefined ? { line } : {}),
    }));
  // Every issue's input line, from the statement that raised it — lets
  // unbound issues (notes like "no differential") anchor to their own
  // line instead of falling back to the cell top or the first error.
  const issueLine = new Map<Issue, number>();
  parts.forEach(({ emitted, line }) =>
    emitted.forEach((iss) => issueLine.set(iss, line)),
  );
  // Statement-bound errors are reported by their rows — drop them from
  // the program issue list so they aren't also appended at the end.
  const consumed = new Set(parts.flatMap(({ errs }) => errs));
  return {
    defs,
    statements,
    issues: issues
      .filter((i) => !consumed.has(i))
      // Normalize already stamps most issues with their line — only fill
      // in the ones it didn't reach (emit-time notes like differentials).
      .map((i) =>
        i.line === undefined && issueLine.has(i)
          ? { ...i, line: issueLine.get(i) }
          : i,
      ),
    errorLine,
    statementLines,
  };
}

// Compile every cell for the calculator target as ONE sequential
// program — the same pipeline as compileWorksheet (always
// `sp.`-qualified, since the worker execs against `import sympy as sp`),
// but the cells share a single emission scope: declared names, symbol/
// function defs, and assignment/dep-var tracking accumulate down the
// worksheet. A name bound in an earlier cell is in scope below — a
// `def g` in cell 2 puts `g` in cell 3's namespace instead of emitting
// a shadowing `sp.Function("g")` decl there — while names declared only
// in later cells stay invisible to the cells above them.
export function compileCellsForCalc(
  cells: CellInput[],
): CalcWorksheetProgram {
  const scope = new Scope(
    true,
    new Set<string>(),
    new Set<string>(),
    new Set<string>(),
    [],
    [],
    0,
  );
  return {
    // The CALC_RUNTIME_PY block defines the mc_* helpers the statements
    // call — it execs as part of the program (self-contained) and shows
    // once in the code block, like the import line.
    prelude: ['import sympy as sp', CALC_RUNTIME_PY],
    cells: cells.map((cell) => {
      // The shared declaredFns set both seeds this cell's normalize
      // (a `g(4)` below a `\def g` is a call, not juxtaposition) and
      // collects the names this cell declares for the cells below it.
      const { ir, issues } = normalizeIR(cell.json, scope.decls.declaredFns);
      if (ir === undefined)
        return { defs: [], statements: [], issues, statementLines: [] };
      return compileCellInScope(ir, issues, scope);
    }),
  };
}

// Compile a single cell for the calculator target — the standalone
// equivalent of compileCellsForCalc([cell]), with the cell's decls
// folded into the prelude (a self-contained program).
export function compileCellForCalc(cell: CellInput): CalcProgram {
  const { ir, issues } = normalizeIR(cell.json);
  if (ir === undefined)
    return { prelude: [], statements: [], issues, statementLines: [] };
  const scope = new Scope(
    true,
    new Set<string>(),
    new Set<string>(),
    new Set<string>(),
    [],
    [],
    0,
  );
  const c = compileCellInScope(ir, issues, scope);
  return {
    prelude: ['import sympy as sp', CALC_RUNTIME_PY, ...c.defs],
    ...c,
  };
}
