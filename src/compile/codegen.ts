import { emitDerivative } from './codegen/derivatives';
import { emitBoundOperator } from './codegen/bound-operators';
import { PREC_LOW, PREC_ADD, PREC_MUL, PREC_UNARY, PREC_POW, PREC_ATOM } from './codegen/precedence';
import { emitStatement } from './codegen/statements';
import { Scope } from './codegen/scope';
import type { StatementOut } from './codegen/types';
import { pyIdent } from './codegen/identifiers';
import { isArr, isStr, headOf, isHead, matrixValuedNode, numText, missingArg, isNum, asInt, stripZeroSuffix } from './codegen/nodes';
import { freeNames, isIntExpr } from './codegen/analysis';
import { collectDeclared, collectMatrices } from './codegen/declarations';
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
import {
  normalizeIR,
  unquote,
  type NormalizeOptions,
} from './ir';
import { CALC_RUNTIME_PY } from './calc-runtime';
import { collectPyFns } from './pydefs';
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

const STATEMENT_HEADS = new Set([
  'Assign', 'Def', 'Declare', 'Block', 'WhereBlock', 'Which', 'Piecewise',
  'PythonSource', 'Plot', 'Solve', 'DSolve', 'PDESolve',
]);
const CMP_NESTABLE_HEADS = new Set([
  'Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual',
]);
const STATEMENT_CALL_HEADS = new Set(['solve', 'Solve', 'piecewise', 'Piecewise']);

// Set-valued operator heads — setish only when every operand is too
// (Subsets/Supersets are predicates, not sets, so they don't appear here).
const SETISH_OP_HEADS = new Set([
  'Union', 'Intersection', 'SetMinus', 'Complement', 'CircleTimes',
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

class Emitter {
  scope: Scope;
  constructor(scope: Scope) {
    this.scope = scope;
  }

  /** `sp.` qualifier prefix — empty under `from sympy import *`. */
  get sp(): string {
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
        this.scope.emit.matrixFns.has(name) ||
        (minted && this.scope.emit.matrices.has(name)) ||
        this.identityDim(name) !== null,
    );
  }

  /** matrixValued AND every matrix leaf is a `Matrix` literal — the
   * concrete-Matrix methods (`.rank()`, `.norm()`, `.eigenvals()`…)
   * exist there but not on sympy MatrixExpr. */
  private concreteMatrix(node: MathJson | undefined): boolean {
    if (isHead(node, 'Matrix') || this.identityDim(node)) return true;
    // A matrix-bound name evaluates to a concrete Matrix — method
    // calls (.inv(), .T, .rref()…) apply to `A + B` compositions too.
    // A matrix-returning function's applied form is concrete likewise
    // (the def returns a `Matrix`, which lacks `.as_explicit()` — the
    // abstract path must not claim it).
    if (isStr(node))
      return (
        this.scope.kinds.matrixNames.has(node) ||
        this.scope.emit.matrixFns.has(node)
      );
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
      case 'D':
      case 'TotalD':
        // diff/jacobian of a concrete matrix is concrete; of a
        // MatrixExpr it stays a MatrixExpr (which does carry
        // .as_explicit()).
        return this.concreteMatrix(node[1]);
      case 'Apply':
      case 'call':
        // f(…) with f matrix-returning — the def returns a `Matrix`.
        return isStr(node[1]) && this.scope.emit.matrixFns.has(node[1]);
      case 'Multiply':
      case 'Divide':
      case 'Power':
        return operands.some((a) => this.concreteMatrix(a));
      case 'CircleTimes':
      case 'CirclePlus':
      case 'HadamardProduct':
        return operands.some((a) => this.concreteMatrix(a));
      case 'CircledAst':
        // A cross always evaluates to a concrete Matrix once an operand
        // is vector-like (MatrixExpr lowers through .as_explicit()).
        return operands.some(
          (a) =>
            this.concreteMatrix(a) ||
            this.matrixValued(a, true) ||
            isHead(a, 'List') ||
            (isStr(a) && this.scope.kinds.listNames.has(a)),
        );
      default:
        return false;
    }
  }

  /** Matrix-ness of an operand for the product ops: `t` is the raw
   * emission (class calls like KroneckerProduct/HadamardProduct take
   * it), `abstract` marks MatrixExpr — method-call surfaces
   * (.dot()/.multiply_elementwise()/sp.diag) need
   * `(${t}).as_explicit()` first. null when n isn't matrix-like. */
  private matOperand(
    n: MathJson,
  ): { t: string; abstract: boolean } | null {
    if (
      isHead(n, 'List') ||
      isHead(n, 'Tuple') ||
      (isStr(n) && this.scope.kinds.listNames.has(n))
    )
      return { t: `${this.sp}Matrix(${this.emit(n)})`, abstract: false };
    if (isStr(n) && this.scope.kinds.matrixNames.has(n))
      return { t: this.emit(n), abstract: false };
    if (this.identityDim(n))
      return { t: this.emit(n), abstract: false };
    if (this.concreteMatrix(n))
      return { t: this.emit(n, PREC_ATOM), abstract: false };
    if (this.matrixValued(n, true))
      return { t: this.emit(n, PREC_ATOM), abstract: true };
    return null;
  }

  /** matOperand text for method-call surfaces — .dot() etc. are
   * MatrixBase-only so MatrixExpr lowers through .as_explicit(). */
  private vectorOperand(n: MathJson): string | null {
    const p = this.matOperand(n);
    return p === null ? null : p.abstract ? `(${p.t}).as_explicit()` : p.t;
  }

  /** Component count of a vector literal — List length, or a Matrix
   * node's rows×cols. null for names and opaque expressions. */
  private vectorLen(n: MathJson): number | null {
    if (isHead(n, 'List')) return n.length - 1;
    if (isHead(n, 'Matrix')) {
      const rows = n.slice(1) as MathJson[];
      if (rows.length === 0 || !rows.every((r) => isHead(r, 'List')))
        return null;
      return rows.length * ((rows[0] as MathJson[]).length - 1);
    }
    return null;
  }

  /** The element nodes of a vector literal — a bracket `[x,y,z]` List,
   * a paren Tuple, or a Matrix's entries flattened row-major (a 3×1
   * column and a 1×3 row both read as a 3-vector; a real m×n matrix
   * flattens too and the caller's arity check rejects it). null for
   * names and opaque expressions — those index as `f[i]`. */
  private vectorEntries(n: MathJson | undefined): MathJson[] | null {
    if (isHead(n, 'List') || isHead(n, 'Tuple'))
      return n.slice(1) as MathJson[];
    if (isHead(n, 'Matrix')) {
      const rows =
        n.length === 2 && isHead(n[1], 'List')
          ? (n[1] as MathJson[]).slice(1)
          : (n.slice(1) as MathJson[]);
      if (!rows.every((r) => isHead(r, 'List'))) return rows;
      return (rows as MathJson[]).flatMap(
        (r) => (r as MathJson[]).slice(1),
      );
    }
    return null;
  }

  /** A matrix body's `m, n` dims (as MatrixSymbol args) — literal
   * `Matrix` nodes read them statically; declared `A \in R^{mxn}` names
   * carry them in matrixDims; cell-assigned matrices fall back to
   * `*A.shape` so the dims resolve when the program runs. Non-matrices
   * get null. */
  matrixShape(node: MathJson | undefined): string | null {
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

  sym(name: string): string {
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
      if (
        argNodes === undefined ||
        this.scope.emit.emitting.has(name) ||
        // A python-def'd name IS a callable — the bare operand emits the
        // function object, not `f(<args recorded elsewhere>)` (that
        // applied form exists for UndefinedFunction stubs, which can't
        // sympify bare; depVars still need it — `f` means `f(x)` there).
        (this.scope.emit.pyBacked.has(name) &&
          !this.scope.kinds.depVars.has(name))
      )
        return ident;
      // Bare function name in arithmetic position (`f + 1`) — emit the
      // applied form `f(x)` recorded at the decl/call site: the pointwise
      // reading matches, and the bare name can't sympify anyway. Call-arg
      // position (`g(f)`, `sin(f)`) is handled in applyArgs, which emits
      // the unapplied eta form `sp.Lambda(x, f(x))`. The emitting guard
      // breaks f/g mutual-reference cycles on the second hop.
      return this.scope.withEmitting(name, () =>
        this.callOrImage(argNodes, (ps) => `${ident}(${ps.join(', ')})`),
      );
    }
    if (this.scope.decls.defined.has(name)) return pyIdent(name);
    // `v^T A v` — `v` was claimed by the matrix tier (Transpose), so a
    // later bare `v` is the SAME name, not a new symbol: reuse the
    // MatrixSymbol ident instead of minting `v_2`.
    if (this.scope.emit.matrices.has(name))
      return this.scope.emit.matrices.get(name)!;
    // A bare `\mathrm{relu}` operand is the python function itself when
    // a python cell defs it — resolved before the name mints a Symbol.
    const pySym = this.resolvePy(name);
    if (pySym !== undefined) return pySym;
    const idDim = this.identityDim(name);
    if (idDim) return `${this.sp}eye(${idDim})`;
    return this.alloc(this.scope.emit.symbols, name);
  }

  /** Resolve `name` through the worksheet's python-function registry
   * (a `def`/`lambda` in a python cell or `\python{}` block). On hit
   * the `functions` entry mints to the def's own ident — pyBacked, so
   * no `sp.Function` decl emits — and the source/ordering bookkeeping
   * runs once. Undefined when the name isn't registered or math-side
   * machinery already claimed it (a worksheet def wins). */
  private resolvePy(name: string): string | undefined {
    const fns = this.scope.emit.functions;
    if (fns.has(name) && !this.scope.emit.pyBacked.has(name))
      return undefined;
    const ent = this.scope.py.fns.get(name);
    if (ent === undefined) return undefined;
    if (!fns.has(name)) fns.set(name, ent.ident);
    this.scope.notePyUse(name, ent);
    return fns.get(name)!;
  }

  // A name used as a function (f in f'(x)) needs sp.Function, not
  // sp.symbols — symbols aren't callable. A python-cell `def` resolves
  // to the real callable instead.
  fn(name: string): string {
    if (this.scope.decls.defined.has(name)) {
      // `x = 5` then `\dot{x}` — the name is already a bound value;
      // `x(t)` raises TypeError at exec. Def'd/lambda-bound names stay
      // callable (call-fold).
      if (!this.scope.decls.declaredFns.has(name))
        this.scope.flag('error', `${name} is bound to a value — not callable`);
      return pyIdent(name);
    }
    const py = this.resolvePy(name);
    if (py !== undefined) return py;
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
    const py = this.resolvePy(name);
    if (py !== undefined) {
      this.scope.flag('error', `${name} is a python function — not a matrix`);
      return py;
    }
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
  relationalDomain(
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
      (isHead(set[2], 'Multiply') ||
        isHead(set[2], 'CircleMinus') ||
        isHead(set[2], 'CircleTimes') ||
        isHead(set[2], 'CircledAst')) &&
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
    // A Matrix literal iterates its elements — a paren tuple is one.
    if (h === 'List' || h === 'Matrix') return n.length > off;
    if (h === 'Union' || h === 'Intersection')
      return n.slice(off).every((a) => this.isFiniteSet(a));
    return false;
  }

  /** The member operand of Element/NotElement (and a FiniteSet
   * element): a `(x, y)` tuple needs `sp.Tuple` — the `List` emission
   * `[x, y]` isn't a SymPy Expr and Function/Contains raise TypeError
   * on it. A paren-tuple Matrix gets the same treatment — matrices
   * aren't Basic/hashable. A 2-element paren tuple emits the open
   * interval it is. */
  emitMember(member: MathJson): string {
    const tuple = (els: MathJson[]): string =>
      `${this.sp}Tuple(${els.map((a) => this.emit(a)).join(', ')})`;
    if (isHead(member, 'List')) return tuple(member.slice(1));
    if (isHead(member, 'Matrix')) {
      const rows: MathJson[] =
        member.length === 2 && isHead(member[1], 'List')
          ? (member[1] as MathJson[]).slice(1)
          : (member as MathJson[]).slice(1);
      const els = (r: MathJson): MathJson[] =>
        isHead(r, 'List') ? (r as MathJson[]).slice(1) : [r];
      return rows.length === 1
        ? tuple(els(rows[0]))
        : `${this.sp}Tuple(${rows.map((r) => tuple(els(r))).join(', ')})`;
    }
    return this.emit(member);
  }

  /** Emit `n` as a set op's operand: set-ish nodes emit directly, plain
   * expressions wrap as `sp.FiniteSet(...)` so Union/Intersection/
   * Complement compute instead of raising TypeError on bare Symbols. */
  private setArg(n: MathJson): string {
    if (this.isSetish(n)) return this.emit(n);
    // A python list or matrix can't nest inside FiniteSet's args —
    // splat it (a paren tuple's elements are the set members).
    if (
      isHead(n, 'List') ||
      isHead(n, 'Matrix') ||
      (isStr(n) &&
        (this.scope.kinds.listNames.has(n) ||
          this.scope.kinds.matrixNames.has(n)))
    )
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
      // A python def is already a callable value — pass the function
      // object (`g(f)`), not the eta expansion `Lambda(x, f(x))`.
      !this.scope.emit.pyBacked.has(a) &&
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
            : this.freshLetters(
                argNodes.length,
                a,
                ...argNodes.filter(isStr).map((x) => this.emit(x)),
              ).map((n) => `${this.sp}Symbol("${n}")`);
          const sig = params.length === 1 ? params[0] : `(${params.join(', ')})`;
          return `${this.sp}Lambda(${sig}, ${this.scope.emit.functions.get(a)!}(${params.join(', ')}))`;
        });
      }
    }
    return this.emit(a);
  }

  /** Lowercase letters already spoken for — every lone letter in the
   * emitted `code` fragments plus every single-letter name bound in the
   * program scope (declared, defined, bound, minted idents, function
   * names). `i` is always taken: `sym('i')` emits the imaginary unit. */
  private takenLetters(...code: string[]): Set<string> {
    const used = new Set<string>(['i']);
    for (const src of code)
      for (const m of src.matchAll(/\b([a-z])\b/g)) used.add(m[1]);
    const single = (n: string) => n.length === 1 && n >= 'a' && n <= 'z';
    for (const s of [
      this.scope.decls.declared,
      this.scope.decls.defined,
      this.scope.emit.bound,
      this.scope.emit.lambdaBound,
      this.scope.emit.emitting,
      this.scope.emit.constNames,
      this.scope.kinds.depVars,
    ])
      for (const n of s) if (single(n)) used.add(n);
    for (const m of [
      this.scope.emit.symbols,
      this.scope.emit.functions,
      this.scope.emit.matrices,
    ]) {
      for (const n of m.keys()) if (single(n)) used.add(n);
      for (const v of m.values()) if (single(v)) used.add(v);
    }
    for (const n of this.scope.emit.fnArgs.keys())
      if (single(n)) used.add(n);
    return used;
  }

  /** `count` fresh names for synthesized Lambda params — the first
   * unused consecutive lowercase letters (`a`, `b`, … for two params),
   * the first `count` unused letters when no run survives, and `_a{i}`
   * once the alphabet runs out. `code` is emitted text the params will
   * sit beside — its lone letters count as used. */
  private freshLetters(count: number, ...code: string[]): string[] {
    const used = this.takenLetters(...code);
    const alpha = 'abcdefghijklmnopqrstuvwxyz';
    for (let i = 0; i + count <= alpha.length; i++)
      if ([...alpha.slice(i, i + count)].every((c) => !used.has(c)))
        return alpha.slice(i, i + count).split('');
    const free = [...alpha].filter((c) => !used.has(c));
    return Array.from({ length: count }, (_, i) => free[i] ?? `_a${i}`);
  }

  /** Emit a function applied to `callArgs` — the image
   * `imageset(Lambda(…), …)` when an arg is a set: `f(\{1,2\})` maps f
   * elementwise (`{f(1), f(2)}`), several set args map over their
   * Cartesian product, and non-set args stay fixed in the Lambda body.
   * Lambda params are the first unused lowercase letters — a free `x`
   * beside a set (`g(\{1,2\}, x)`) isn't captured. `apply` builds the
   * call from emitted arg strings; `argEmit` is callArg where the call
   * site eta-expands function args. */
  private callOrImage(
    callArgs: MathJson[],
    apply: (params: string[]) => string,
    argEmit: (a: MathJson) => string = (a) => this.emit(a),
  ): string {
    if (!callArgs.some((a) => this.isSetish(a)))
      return apply(callArgs.map((a) => argEmit(a)));
    const isSet = callArgs.map((a) => this.isSetish(a));
    const fixed = callArgs.map((a, i) => (isSet[i] ? '' : argEmit(a)));
    const sets = callArgs.map((a, i) => (isSet[i] ? this.emit(a) : ''));
    // Probe the body with sentinel params so its letters count as used.
    const probe = apply(callArgs.map((_, i) => `\x00${i}`));
    const names = this.freshLetters(
      isSet.filter(Boolean).length,
      probe,
      ...fixed,
      ...sets,
    );
    let k = 0;
    const params = callArgs.map((_, i) =>
      isSet[i] ? `${this.sp}Symbol("${names[k++]}")` : fixed[i],
    );
    const setParams = params.filter((_, i) => isSet[i]);
    const sig =
      setParams.length === 1 ? setParams[0] : `(${setParams.join(', ')})`;
    return `${this.sp}imageset(${this.sp}Lambda(${sig}, ${apply(params)}), ${sets
      .filter((s) => s !== '')
      .join(', ')})`;
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
        // `\cdot` and juxtaposition are ordinary multiplication — but a
        // bracket-list operand is a vector/matrix value (`u · [1,2,3]`
        // is scalar·vector, `A · B` matmul): python lists can't `*`, so
        // list literals and list-bound names emit wrapped in sp.Matrix.
        const mulArg = (a: MathJson): string =>
          isHead(a, 'List') ||
          isHead(a, 'Tuple') ||
          (isStr(a) && this.scope.kinds.listNames.has(a))
            ? `${this.sp}Matrix(${this.emit(a)})`
            : this.emit(a, PREC_MUL);
        return [parts.map(mulArg).join(' * '), PREC_MUL];
      }
      case 'CircleMinus': {
        // `u \bullet v` / `u \dotproduct v` — the dot product. latex.ts
        // rewrites \bullet/\dotproduct to \ominus so CE keeps them
        // distinct from juxtaposition (a literal \ominus lands on the
        // same head; `\nabla \cdot` arrives pre-rewritten to \bullet
        // by the nabla-div rule). Operand-typed like Norm: every
        // operand setish emits the Cartesian `*`; a vector operand
        // makes it .dot() — MatrixBase-only, so lists wrap in
        // sp.Matrix and MatrixExpr lowers through .as_explicit().
        // Nothing vector-like: \bullet stays multiplication.
        // `\nabla \bullet F` is the divergence — the Error operand the
        // nabla-gradient rule leaves becomes the Nabla head.
        if (isHead(args[0], 'Nabla')) {
          const F = args[1];
          const comps = this.vectorEntries(F);
          const len = comps?.length ?? this.vectorLen(F);
          const concrete =
            comps !== null ||
            len !== null ||
            (isStr(F) &&
              (this.scope.kinds.listNames.has(F) ||
                this.scope.kinds.matrixNames.has(F))) ||
            this.concreteMatrix(F);
          if (!concrete) {
            // Emit F so its symbols mint before the flag drops the
            // statement (the mint lines survive like other flagged cells).
            this.emit(F);
            this.scope.flag(
              'error',
              'divergence needs a concrete vector field — \\nabla \\cdot F',
            );
            return ['None', PREC_ATOM];
          }
          // len null (bound names) assumes the usual R^3 field.
          const n = len ?? 3;
          if (n < 2 || n > 3) {
            this.scope.flag(
              'error',
              'divergence needs a 2- or 3-vector field — \\nabla \\cdot F',
            );
            return ['None', PREC_ATOM];
          }
          const c = ['x', 'y', 'z'];
          // Literal vectors emit each component directly — indexing a
          // re-emitted `sp.Matrix([[…]])` per component repeated the
          // whole literal in every term.
          const f = comps === null ? `(${this.emit(F)})` : null;
          const term = (i: number) =>
            `${this.sp}diff(${
              comps === null ? `${f}[${i}]` : this.emit(comps[i])
            }, ${this.sp}Symbol('${c[i]}'))`;
          return [
            Array.from({ length: n }, (_, i) => term(i)).join(' + '),
            PREC_ADD,
          ];
        }
        if (args.some((a) => isHead(a, 'Nabla')))
          this.scope.flag(
            'error',
            'divergence reads \\nabla \\cdot F — \\nabla must be the left operand',
          );
        if (args.every((a) => this.isSetish(a)))
          return [
            args.map((a) => this.emit(a, PREC_MUL)).join(' * '),
            PREC_MUL,
          ];
        const dtexts = args.map((a) => this.vectorOperand(a));
        if (dtexts.every((t) => t === null))
          return [
            args.map((a) => this.emit(a, PREC_MUL)).join(' * '),
            PREC_MUL,
          ];
        if (dtexts.every((t) => t !== null))
          return [
            (dtexts as string[])
              .slice(1)
              .reduce((acc, p) => `${acc}.dot(${p})`, dtexts[0] as string),
            PREC_ATOM,
          ];
        // A scalar mixed into a dot is ordinary multiplication —
        // `u \cdot [1,2,3]` reads as scalar-times-vector, so vector
        // operands still wrap in sp.Matrix for the `*` broadcast.
        return [
          dtexts
            .map((t, i) => t ?? this.emit(args[i], PREC_MUL))
            .join(' * '),
          PREC_MUL,
        ];
      }
      case 'HadamardProduct': {
        // `A \odot B` — the elementwise (Hadamard/Schur) product. CE
        // already wraps incompatible scalars in Error; surviving
        // operands get the same operand typing: all-setish -> `*`,
        // concrete -> .multiply_elementwise(), MatrixExpr ->
        // sp.HadamardProduct, scalars -> multiplication.
        if (args.every((a) => this.isSetish(a)))
          return [
            args.map((a) => this.emit(a, PREC_MUL)).join(' * '),
            PREC_MUL,
          ];
        const hp = args.map((a) => this.matOperand(a));
        if (hp.every((p) => p === null))
          return [
            args.map((a) => this.emit(a, PREC_MUL)).join(' * '),
            PREC_MUL,
          ];
        if (hp.some((p) => p === null)) {
          const a = args[hp.findIndex((p) => p === null)] as MathJson;
          this.scope.flag(
            'error',
            `elementwise product needs matrices — ${isStr(a) ? a : 'an operand'} is a scalar here`,
          );
          return ['None', PREC_ATOM];
        }
        const hparts = hp as { t: string; abstract: boolean }[];
        if (hparts.some((p) => p.abstract))
          return [
            `${this.sp}HadamardProduct(${hparts.map((p) => p.t).join(', ')})`,
            PREC_ATOM,
          ];
        return [
          hparts
            .slice(1)
            .reduce(
              (acc, p) => `${acc}.multiply_elementwise(${p.t})`,
              hparts[0].t,
            ),
          PREC_ATOM,
        ];
      }
      case 'CircleTimes': {
        // `A \otimes B` — the Kronecker product. All-setish emits the
        // Cartesian `*`; scalars multiply; a scalar mixed into a
        // matrix kron wraps as Matrix([[s]]); MatrixExpr operands go
        // to the unevaluated sp.KroneckerProduct class, concrete ones
        // to variadic sp.kronecker_product.
        if (args.every((a) => this.isSetish(a)))
          return [
            args.map((a) => this.emit(a, PREC_MUL)).join(' * '),
            PREC_MUL,
          ];
        const kp = args.map((a) => this.matOperand(a));
        if (kp.every((p) => p === null))
          return [
            args.map((a) => this.emit(a, PREC_MUL)).join(' * '),
            PREC_MUL,
          ];
        const kparts = kp.map((p, i) =>
          p !== null
            ? p
            : { t: `${this.sp}Matrix([[${this.emit(args[i])}]])`, abstract: false },
        );
        if (kparts.some((p) => p.abstract))
          return [
            `${this.sp}KroneckerProduct(${kparts.map((p) => p.t).join(', ')})`,
            PREC_ATOM,
          ];
        return [
          `${this.sp}kronecker_product(${kparts.map((p) => p.t).join(', ')})`,
          PREC_ATOM,
        ];
      }
      case 'CirclePlus': {
        // `A \oplus B` — the direct sum: block-diagonal sp.diag on
        // matrices (scalars count as 1x1 blocks), SymmetricDifference
        // on sets. Anything else flags — \oplus has no scalar reading.
        if (args.every((a) => this.isSetish(a)))
          return [
            (args as MathJson[]).slice(1).reduce<string>(
              (acc, a) =>
                `${this.sp}SymmetricDifference(${acc}, ${this.emit(a)})`,
              this.emit(args[0]),
            ),
            PREC_ATOM,
          ];
        const pp = args.map((a) => this.matOperand(a));
        if (pp.every((p) => p === null)) {
          this.scope.flag(
            'error',
            'direct sum needs matrices or sets — \\oplus has no scalar reading',
          );
          return ['None', PREC_ATOM];
        }
        // diag takes scalars as 1x1 blocks and needs concrete operands
        // (MatrixExpr has no .tolist) — as_explicit() bridges both.
        const pparts = pp.map((p, i) =>
          p !== null
            ? p.abstract
              ? `(${p.t}).as_explicit()`
              : p.t
            : this.emit(args[i], PREC_MUL),
        );
        return [`${this.sp}diag(${pparts.join(', ')})`, PREC_ATOM];
      }
      case 'CircledAst': {
        // `u \times v` — the cross product. latex.ts rewrites \times
        // to \circledast so CE keeps it distinct from \cdot and
        // juxtaposition (literal \otimes is the Kronecker product).
        // Operand-typed like Norm: every operand setish emits the
        // Cartesian `*` sets get from Multiply; a vector operand makes
        // it a cross — .cross is a MatrixBase method, so bracket lists
        // and list-bound names wrap in sp.Matrix and MatrixExpr lowers
        // through .as_explicit() (MatrixSymbol has no .cross). \times
        // is never scalar multiplication — any other operand flags
        // (write \cdot or juxtapose instead).
        // `\nabla \times F` is the curl — the Error operand the
        // nabla-gradient rule leaves becomes the Nabla head.
        if (isHead(args[0], 'Nabla')) {
          const F = args[1];
          const comps = this.vectorEntries(F);
          const concrete =
            (comps !== null && comps.length === 3) ||
            (isStr(F) && this.scope.kinds.listNames.has(F)) ||
            (isStr(F) && this.scope.kinds.matrixNames.has(F)) ||
            this.concreteMatrix(F);
          if (!concrete) {
            this.scope.flag(
              'error',
              'curl needs a concrete 3-vector field — \nabla \times F',
            );
            return ['None', PREC_ATOM];
          }
          const c = ['x', 'y', 'z'];
          // Literal vectors emit each component directly — indexing a
          // re-emitted `sp.Matrix([[…]])` per component repeated the
          // whole literal in every term.
          const f = comps === null ? `(${this.emit(F)})` : null;
          const comp = (i: number) =>
            comps === null ? `${f}[${i}]` : this.emit(comps[i]);
          // [∂F₃/∂y−∂F₂/∂z, ∂F₁/∂z−∂F₃/∂x, ∂F₂/∂x−∂F₁/∂y]
          const row = (i: number, j: number, k: number, l: number) =>
            `${this.sp}diff(${comp(i)}, ${c[j]}) - ${this.sp}diff(${comp(k)}, ${c[l]})`;
          return [
            `${this.sp}Matrix([${row(2, 1, 1, 2)}, ${row(0, 2, 2, 0)}, ${row(1, 0, 0, 1)}])`,
            PREC_ATOM,
          ];
        }
        if (args.some((a) => isHead(a, 'Nabla')))
          this.scope.flag(
            'error',
            'curl reads \nabla \times F — \nabla must be the left operand',
          );
        if (args.every((a) => this.isSetish(a)))
          return [
            args.map((a) => this.emit(a, PREC_MUL)).join(' * '),
            PREC_MUL,
          ];
        const crossArg = (n: MathJson): string | null => {
          if (
            isHead(n, 'List') ||
            isHead(n, 'Tuple') ||
            (isStr(n) && this.scope.kinds.listNames.has(n))
          )
            return `${this.sp}Matrix(${this.emit(n)})`;
          // Bound to a Matrix literal — already concrete.
          if (isStr(n) && this.scope.kinds.matrixNames.has(n))
            return this.emit(n);
          if (this.concreteMatrix(n)) return this.emit(n, PREC_ATOM);
          if (this.matrixValued(n, true))
            return `(${this.emit(n)}).as_explicit()`;
          return null;
        };
        const texts = args.map(crossArg);
        if (texts.some((t) => t === null)) {
          // \times is never scalar multiplication — emit each operand
          // so its symbols mint before the flag drops the statement
          // (the mint lines survive like other flagged cells), then
          // name each non-vector operand in one flag (write \cdot or
          // juxtapose instead).
          for (const a of args) this.emit(a);
          const scalars = args
            .filter((_, i) => texts[i] === null)
            .map((a) => (isStr(a) ? a : 'an operand'));
          this.scope.flag(
            'error',
            `cross product needs vectors — ${scalars.join(', ')} ${scalars.length > 1 ? 'are' : 'is'} ${scalars.length > 1 ? 'scalars' : 'a scalar'} here`,
          );
          return ['None', PREC_ATOM];
        }
        return [
          (texts as string[])
            .slice(1)
            .reduce((acc, p) => `${acc}.cross(${p})`, texts[0] as string),
          PREC_ATOM,
        ];
      }
      case 'Nabla':
        // Stray \nabla — only survives inside CircleMinus/CircledAst
        // via the nabla-vector-op rule; anywhere else is the
        // unsupported-command it was.
        this.scope.flag('error', '\\nabla needs a \\cdot F or \\times F operand');
        return ['None', PREC_ATOM];
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
        // `e^{A}` — the matrix exponential. Concrete matrices carry
        // .exp() directly; MatrixExpr lowers through .as_explicit()
        // (sympy ships no unevaluated MatrixExp class).
        if (args[0] === 'ExponentialE') {
          const me = this.matOperand(args[1]);
          if (me !== null)
            return [
              me.abstract
                ? `(${me.t}).as_explicit().exp()`
                : `(${me.t}).exp()`,
              PREC_ATOM,
            ];
        }
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
            (isHead(exp, 'Multiply') ||
              isHead(exp, 'CircleMinus') ||
              isHead(exp, 'CircleTimes') ||
              isHead(exp, 'CircledAst')) &&
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
          `${this.sp}FiniteSet(${args.map((a) => this.emitMember(a)).join(', ')})`,
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
      case 'D':
      case 'TotalD':
      case 'Gradient':
        return emitDerivative(h, args, this);
      case 'Apply': {
        const callee = args[0];
        if (isHead(callee, 'InverseFunction')) {
          // \sin^{-1}(x) -> asin(x); an unknown base keeps a readable
          // inverse(f)(x)-style row instead of InverseFunction garbage.
          const base = callee[1];
          const mapped = isStr(base) ? INVERSE_FUNCS[base] : undefined;
          const applyInverse = (ps: string[]): string =>
            base === 'Sqrt'
              ? `(${ps.join(', ')})**2`
              : mapped
                ? `${this.sp}${mapped}(${ps.join(', ')})`
                : `${this.sp}Function(${JSON.stringify(
                    isStr(base) ? `${base}inv` : 'inverse',
                  )})(${ps.join(', ')})`;
          const text = this.callOrImage(
            args.slice(1),
            applyInverse,
            (a) => this.callArg(a),
          );
          return [
            text,
            base === 'Sqrt' && !args.slice(1).some((a) => this.isSetish(a))
              ? PREC_POW
              : PREC_ATOM,
          ];
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
          // Non-variable eval points need fresh differentiation vars —
          // the first unused lowercase letters (a free `x` arg or a
          // function named `x` would otherwise capture/collide).
          const varCode = argNodes.map((a) => (isVar(a) ? this.emit(a) : ''));
          const evalCode = argNodes.map((a) => (isVar(a) ? '' : this.emit(a)));
          const fresh = this.freshLetters(
            evalCode.filter((s) => s !== '').length,
            applied(argNodes.map((_, i) => `\x00${i}`)),
            ...varCode,
            ...evalCode,
          );
          let fk = 0;
          const vars = argNodes.map((a, i) =>
            isVar(a) ? varCode[i] : this.sym(fresh[fk++]),
          );
          let text = `${this.sp}diff(${applied(vars)}, ${diffBy(vars.join(', '))})`;
          argNodes.forEach((a, i) => {
            if (isVar(a)) return;
            // `f'(\{1,2\})` — a set evaluation point maps the derivative
            // elementwise; subs would hand it the whole set.
            if (this.isSetish(a))
              text = `${this.sp}imageset(${this.sp}Lambda(${vars[i]}, ${text}), ${evalCode[i]})`;
            else text = `${text}.subs(${vars[i]}, ${evalCode[i]})`;
          });
          return [text, PREC_ATOM];
        }
        if (isHead(callee, 'Function')) {
          // `(x \mapsto x^2)(3)` — a lambda callee is a real call, not
          // juxtaposed factors (the generic multiply path below would
          // emit `(lambda ...) * 3`, a TypeError at exec).
          const lambda = this.emit(callee);
          return [
            this.callOrImage(
              args.slice(1),
              (ps) => `${lambda}(${ps.join(', ')})`,
              (a) => this.callArg(a),
            ),
            PREC_ATOM,
          ];
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
          this.callOrImage(args.slice(1), (ps) =>
            `${calleeText}(${ps.join(', ')})`,
          ),
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
      case 'Integrate':
      case 'Sum':
      case 'Product':
      case 'BigUnion':
      case 'BigIntersection':
      case 'Limit':
        return emitBoundOperator(h, args, this);
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
      case 'Abs':
      case 'Norm':
        // |v| and \|v\|: Abs for scalars, .norm() for anything
        // matrix-valued — |A| of a matrix is its norm, not the
        // elementwise sp.Abs — including a bare name already declared
        // as a matrix elsewhere.
        if (this.matrixValued(args[0], true))
          return [`(${this.emit(args[0])}).norm()`, PREC_ATOM];
        return [`${this.sp}Abs(${this.callArg(args[0])})`, PREC_ATOM];
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
          const t = `${this.sp}Symbol("${this.freshLetters(1, f, g)[0]}")`;
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
          if (isHead(args[1], 'Matrix') || this.matrixRef(args[1])) {
            // A matrixDims name (p ∈ ℝ^{m×n}) mints a MatrixSymbol —
            // MatrixExpr has only det/inv/T, so the rest route
            // through .as_explicit() (trace uses the abstract class
            // like the matrixValued tier below).
            if (isStr(args[1]) && !this.concreteMatrix(args[1])) {
              if (name === 'trace' || name === 'Trace' || name === 'tr')
                return [
                  `${this.sp}Trace(${this.emit(args[1])})`,
                  PREC_ATOM,
                ];
              if (
                name === 'inverse' ||
                name === 'transpose' ||
                name === 'det' ||
                name === 'Determinant'
              )
                return [`(${this.emit(args[1])}).${mm}`, PREC_ATOM];
              return [
                `(${this.emit(args[1])}).as_explicit().${mm}`,
                PREC_ATOM,
              ];
            }
            return [`(${this.emit(args[1])}).${mm}`, PREC_ATOM];
          }
          // A bare name — `\mathrm{eigenvects}(A)`, `\ker A` — reads as
          // a matrix (like \det A): mint a MatrixSymbol rather than a
          // meaningless `<word>(A)` Function stub. A name already bound
          // to a scalar stays an honest flag.
          if (isStr(args[1])) {
            const scalar =
              this.scope.emit.symbols.has(args[1]) ||
              this.scope.emit.functions.has(args[1]) ||
              (this.scope.decls.defined.has(args[1]) &&
                !this.scope.kinds.matrixNames.has(args[1]) &&
                !this.scope.kinds.matrixDims.has(args[1]));
            if (!scalar) {
              const t = this.mat(args[1]);
              if (name === 'trace' || name === 'Trace' || name === 'tr')
                return [`${this.sp}Trace(${t})`, PREC_ATOM];
              if (
                name === 'inverse' ||
                name === 'transpose' ||
                name === 'det' ||
                name === 'Determinant'
              )
                return [`(${t}).${mm}`, PREC_ATOM];
              // .as_explicit() lowers a minted MatrixSymbol — concrete
              // matrices (I_n = sp.eye(n), a literal-bound name) have
              // no such method (MutableDenseMatrix).
              return [
                `(${t})${this.concreteMatrix(args[1]) ? '' : '.as_explicit()'}.${mm}`,
                PREC_ATOM,
              ];
            }
          }
          if (this.matrixValued(args[1])) {
            // A matrix-valued expression (`\mathrm{tr}(A + B)`):
            // trace maps to the abstract sp.Trace; inverse/transpose
            // are MatrixExpr methods; everything else lowers through
            // .as_explicit() so concrete-only methods work on
            // MatrixExpr too (`(u).as_explicit().rref()`).
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
            return [
              `(${this.emit(args[1])}).as_explicit().${mm}`,
              PREC_ATOM,
            ];
          }
          this.scope.flag(
            'error',
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
        // Emitted late — callArg mints a Symbol for a bare name arg,
        // which would poison the matrix word-op check above.
        const rendered = args
          .slice(1)
          .map((a) => this.callArg(a))
          .join(', ');
        if (CALL_RENAMES[name])
          return [`${this.sp}${CALL_RENAMES[name]}(${rendered})`, PREC_ATOM];
        if (this.scope.decls.declared.has(name) || !SP_BUILTIN_CALL.has(name)) {
          // Record the application so a later bare `f` in operand
          // position emits `f(<args>)` — an UndefinedFunction operand
          // raises TypeError (the name itself as arg is filtered so
          // self-reference can't recurse).
          const fnArgs = args.slice(1).filter((a) => a !== name);
          this.scope.noteCallArgs(name, fnArgs);
          return [
            this.callOrImage(
              args.slice(1),
              (ps) => `${this.fn(name)}(${ps.join(', ')})`,
              (a) => this.callArg(a),
            ),
            PREC_ATOM,
          ];
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
  // A dependent variable's full arg list is the union over every
  // derivative site in the cell — `D(u,t) = D(u,x,x)` and a later bare
  // `u` all emit `u(t,x)`, never u(t) at one site and u(x) at another.
  // Def'd names keep their declared parameter list instead.
  seedDepVarArgs(ir, scope);
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
  // pyBacked names point at a python-cell def — the real callable, not
  // a minted stub — so they emit no decl either.
  const newFns = [...scope.emit.functions].filter(
    ([raw]) =>
      !preDefined.has(raw) &&
      !scope.decls.declaredFns.has(raw) &&
      !scope.emit.pyBacked.has(raw),
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

// First pass over a cell's IR: union the variable slots each name is
// differentiated/applied by into `fnArgs`, so every site emits the same
// applied call. Without the union `D(u,t) = D(u,x,x)` records u as a
// function of t at the first site and emits `diff(u(t), x, x)` — a
// silently-zero second derivative — at the second.
function seedDepVarArgs(ir: MathJson, scope: Scope): void {
  const slots = new Map<string, MathJson[]>();
  const add = (name: string, vars: MathJson[]) => {
    if (vars.length === 0) return;
    const prev = slots.get(name) ?? [];
    for (const v of vars)
      if (!prev.some((p) => JSON.stringify(p) === JSON.stringify(v)))
        prev.push(v);
    slots.set(name, prev);
  };
  const walk = (n: MathJson): void => {
    if (!isArr(n)) return;
    const h = headOf(n);
    // A name is never a dependent of its own differentiation
    // variable — `D(x,x)` is `diff(x, x)` = 1, not a function claim.
    const varsOf = (name: MathJson, xs: MathJson[]) =>
      xs.filter((v): v is string => isStr(v) && v !== name);
    if (h === 'D' && isStr(n[1])) add(n[1], varsOf(n[1], n.slice(2)));
    else if (
      h === 'Apply' &&
      isArr(n[1]) &&
      headOf(n[1]) === 'Derivative' &&
      isStr(n[1][1])
    )
      add(n[1][1], varsOf(n[1][1], n.slice(2)));
    // A DepVar spec inside a Solve-family node declares the same list.
    else if (h === 'DepVar' && isStr(n[1]))
      add(n[1], varsOf(n[1], n.slice(2)));
    // `\D f` / `\nabla u` on a bare name claims it a field — of x for the
    // total derivative, of all three coords for the gradient — matching
    // the noteDepVar their codegen makes. A name already bound (symbol,
    // value, matrix) or a coordinate stays itself: `\D x`/`∇x` don't
    // turn x into x(…).
    else if (
      h === 'TotalD' &&
      isStr(n[1]) &&
      n[1] !== 'x' &&
      !scope.decls.defined.has(n[1])
    )
      add(n[1], ['x']);
    else if (
      h === 'Gradient' &&
      isStr(n[1]) &&
      !['x', 'y', 'z'].includes(n[1]) &&
      !scope.decls.defined.has(n[1])
    )
      add(n[1], ['x', 'y', 'z']);
    for (const c of n.slice(1)) walk(c);
  };
  walk(ir);
  for (const [name, vars] of slots) {
    // A def'd name's parameters are its arg list — `f(x) = …` then
    // `D(f,t)` does not turn f into a function of t.
    if (scope.decls.declaredFns.has(name)) continue;
    scope.claimDepVar(name, vars);
  }
}

// Matrix word-ops whose results are structured display data, mapped to
// the clean_and_simplify layout that renders them: basis-vector lists
// (nullspace/columnspace) as span{...} — an empty basis reads as
// \varnothing, not `\left[\right]` — and eigenvects' (value, mult,
// vectors) triples as labeled blocks. Call-name spellings fold to the
// same words (\ker → Kernel).
function findStatementHeads(node: MathJson, found: Set<string>): void {
  if (!isArr(node)) return;
  const h = headOf(node);
  if (h && STATEMENT_HEADS.has(h))
    found.add(h === 'Def' ? 'Function' : h === 'Which' ? 'Piecewise' : h);
  if (h === 'call' && isStr(node[1]) && STATEMENT_CALL_HEADS.has(node[1]))
    found.add(node[1]);
  for (const child of node.slice(1)) findStatementHeads(child, found);
}

export interface CompileOptions extends NormalizeOptions {
  /** Emit `from sympy import *` and unqualified sympy names (default).
   * `false` emits `import sympy as sp` with `sp.` qualifiers. */
  importAll?: boolean;
  /** Calc-only: the full worksheet cells when `cells` is a prefix —
   * python defs below the edit point still resolve (with the
   * call-above-def note) instead of minting `sp.Function` stubs. */
  worksheetCells?: CellInput[];
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
  // Python-cell defs (`def`/`lambda`, plus `\python{}` blocks in math
  // cells) register their call names so a math cell's `\mathrm{name}(x)`
  // — or a `# @latex`-annotated form — calls the real function.
  const pyRegistry = collectPyFns(cells);
  const pyNames = new Set(pyRegistry.fns.keys());
  const perCell = cells.map((c) =>
    normalizeIR(c.json, undefined, { ...opts, pyFns: pyNames }),
  );
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
  // Registry notes (unreachable builtin names, unresolved annotations)
  // belong to the python cell that raised them.
  for (const n of pyRegistry.notes) {
    genIssues[n.cell].push({ severity: n.severity, message: n.message });
    issues.push({
      severity: n.severity,
      message: `cell ${n.cell + 1}: ${n.message}`,
    });
  }
  const cellBodies = perCell.map((r, i) => {
    if (r.ir === undefined) return { lines: [] as string[], pySrc: [] as string[] };
    const matrixNames = new Set<string>();
    collectMatrices(r.ir, matrixNames);
    // `declaredFns` is worksheet-wide, but cells are independent
    // programs — a name def'd in cell 1 still gets its own
    // `f = sp.Function` decl when called in cell 2, and only an
    // Assign-rebind in THIS cell drops a pending Function decl.
    const cellDeclaredFns = new Set<string>();
    collectDeclared(r.ir, new Set(), cellDeclaredFns);
    const scope = new Scope(
      qualified,
      declared,
      cellDeclaredFns,
      matrixNames,
      issues,
      genIssues,
      i + 1,
      'python',
      pyRegistry.fns,
    );
    scope.cellIdx = i;
    const lines = cellStatements(r.ir, scope);
    // The standalone cell script inlines every python def it calls —
    // `relu(x)` emits the real call, so the script needs the source.
    const pySrc = [...scope.py.usedSrcs]
      .map((s) => pyRegistry.sources[s])
      .sort((a, b) => a.cell - b.cell)
      .map((s) => s.code);
    return { lines, pySrc };
  });
  const cellLines = cellBodies.map(({ lines, pySrc }) =>
    lines.length === 0 ? [] : [importLine, ...pySrc, ...lines],
  );

  // The one-script copy is the concatenation of the per-cell outputs
  // with the import emitted once at the top. Python cells' source emits
  // in place — the program stays sequential, so a call must sit below
  // its def (the registry notes flag it otherwise).
  const lines: string[] = [importLine];
  cellBodies.forEach(({ lines: stmts }, i) => {
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
  /** Execs for side effects only (a defs-only python source) — the
   * worker binds the names and returns a marker row the client drops,
   * so no result row shows. */
  silent?: boolean;
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
        // Plot statements produce a sampled-data row, not a value —
        // clean_and_simplify would only add noise (and can't simplify
        // the marker dict anyway).
        out.plot
          ? out.lines.join('\n')
          : out.calcLines !== undefined
            ? out.calcLines.join('\n')
            : out.display === undefined && !out.silent && out.lines.length === 1
              ? calcEval(out.lines[0])
              : out.lines.join('\n'),
      display: out.display === undefined ? undefined : calcEval(out.display),
      defines: out.defines,
      silent: out.silent,
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

// The calc program's import line — `import sympy as sp` qualified or
// `from sympy import *` under import-*. Exec'd into the worker's
// namespace; a star import is legal inside exec() at top level.
const calcImportLine = (qualified: boolean): string =>
  qualified ? 'import sympy as sp' : 'from sympy import *';

// The runtime helper source for a given import mode. It is written
// `sp.`-qualified; import-* mode strips the `sp.` prefixes so the
// emitted program stays self-contained (a star import binds every
// name the helper references bare).
const calcRuntimePy = (qualified: boolean): string =>
  qualified ? CALC_RUNTIME_PY : CALC_RUNTIME_PY.replace(/\bsp\./g, '');

// Compile every cell for the calculator target as ONE sequential
// program — the same pipeline as compileWorksheet — but the cells
// share a single emission scope: declared names, symbol/function
// defs, and assignment/dep-var tracking accumulate down the worksheet.
// A name bound in an earlier cell is in scope below — a `def g` in
// cell 2 puts `g` in cell 3's namespace instead of emitting a
// shadowing `sp.Function("g")` decl there — while names declared only
// in later cells stay invisible to the cells above them.
//
// `importAll` picks the import style like the python target: the
// worker execs the prelude itself, so `from sympy import *` populates
// the namespace with the bare names the statements then use (`sp`
// stays seeded for the helper and worker internals either way).
export function compileCellsForCalc(
  cells: CellInput[],
  opts: CompileOptions = {},
): CalcWorksheetProgram {
  const qualified = opts.importAll === false;
  // Python-cell defs register worksheet-wide so a call above its def
  // resolves (with the ordering note) instead of minting a stub.
  const pyRegistry = collectPyFns(opts.worksheetCells ?? cells);
  const pyNames = new Set(pyRegistry.fns.keys());
  const scope = new Scope(
    qualified,
    new Set<string>(),
    new Set<string>(),
    new Set<string>(),
    [],
    [],
    0,
    'calc',
    pyRegistry.fns,
  );
  return {
    // The CALC_RUNTIME_PY block defines the mc_* helpers the statements
    // call — it execs as part of the program (self-contained) and shows
    // once in the code block, like the import line. The helper source
    // is written `sp.`-qualified; the import-* mode strips the prefix
    // so the shown program stays self-contained under a star import.
    prelude: [calcImportLine(qualified), calcRuntimePy(qualified)],
    cells: cells.map((cell, i) => {
      scope.cellIdx = i;
      // The shared declaredFns set both seeds this cell's normalize
      // (a `g(4)` below a `\def g` is a call, not juxtaposition) and
      // collects the names this cell declares for the cells below it.
      const { ir, issues } = normalizeIR(cell.json, scope.decls.declaredFns, {
        ...opts,
        pyFns: pyNames,
      });
      // Registry notes on this cell (its own python defs) surface here.
      issues.push(
        ...pyRegistry.notes
          .filter((n) => n.cell === i)
          .map(({ severity, message }) => ({ severity, message }) as Issue),
      );
      if (ir === undefined)
        return { defs: [], statements: [], issues, statementLines: [] };
      return compileCellInScope(ir, issues, scope);
    }),
  };
}

// Compile a single cell for the calculator target — the standalone
// equivalent of compileCellsForCalc([cell]), with the cell's decls
// folded into the prelude (a self-contained program).
export function compileCellForCalc(
  cell: CellInput,
  opts: CompileOptions = {},
): CalcProgram {
  const qualified = opts.importAll === false;
  const pyRegistry = collectPyFns([cell]);
  const { ir, issues } = normalizeIR(cell.json, undefined, {
    ...opts,
    pyFns: new Set(pyRegistry.fns.keys()),
  });
  if (ir === undefined)
    return { prelude: [], statements: [], issues, statementLines: [] };
  const scope = new Scope(
    qualified,
    new Set<string>(),
    new Set<string>(),
    new Set<string>(),
    [],
    [],
    0,
    'calc',
    pyRegistry.fns,
  );
  scope.cellIdx = 0;
  const c = compileCellInScope(ir, issues, scope);
  return {
    prelude: [calcImportLine(qualified), calcRuntimePy(qualified), ...c.defs],
    ...c,
  };
}

// Compatibility exports used by the interim calculator.
export { freeNames, firstFreeCapital } from './codegen/analysis';
export { collectDeclared } from './codegen/declarations';
export { plotComponents, plotDomainBounds, type PlotBound } from './codegen/plotting';
