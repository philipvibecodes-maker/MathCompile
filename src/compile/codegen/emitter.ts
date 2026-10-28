// Expression emission and precedence dispatch. Domain helpers recurse
// through emit(), preserving symbol allocation and diagnostic order.
import type { MathJson } from '../ir';
import { unquote } from '../ir';
import {
  CALL_RENAMES,
  CONSTANTS,
  LEAF_SETS,
  MATRIX_METHODS,
  SET_CONSTRAINTS,
  SETISH_SYMBOLS,
  SP_BUILTIN_CALL,
  SP_FUNC_MIN_ARGS,
  SP_FUNCS,
} from '../notation';
import { freeNames, isIntExpr } from './analysis';
import { emitBoundOperator } from './bound-operators';
import { emitCollection } from './collections';
import { emitDerivative } from './derivatives';
import { emitFunction } from './functions';
import { BOOLISH_HEADS, CMP_NESTABLE_HEADS, SETISH_OP_HEADS, UNPARSEABLE_MSG } from './heads';
import { pyIdent } from './identifiers';
import {
  asInt,
  headOf,
  isArr,
  isHead,
  isStr,
  matrixValuedNode,
  missingArg,
  numText,
  stripZeroSuffix,
} from './nodes';
import { PREC_ADD, PREC_ATOM, PREC_LOW, PREC_MUL, PREC_POW, PREC_UNARY } from './precedence';
import { Scope } from './scope';

export class Emitter {
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
  isFunctionish(name: string): boolean {
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
  isPosInt(v: MathJson | undefined): v is number {
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
  assumeFrom(member: MathJson, set: MathJson): void {
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
  setArg(n: MathJson): string {
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
  unknownCall(h: string, args: MathJson[]): [string, number] {
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
  callArg(a: MathJson): string {
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
  freshLetters(count: number, ...code: string[]): string[] {
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
  callOrImage(
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
      case 'Condition':
      case 'Complement':
      case 'Difference':
      case 'SymmetricDifference':
      case 'Degrees':
      case 'Minimum':
      case 'Maximum':
      case 'Supremum':
      case 'Infimum':
      case 'IntegerRange':
      case 'Interval':
      case 'Open':
      case 'Element':
      case 'NotElement':
      case 'Set':
      case 'Union':
      case 'Intersection':
      case 'SetMinus':
      case 'Subset':
      case 'SubsetEqual':
      case 'Superset':
      case 'SupersetEqual':
      case 'NotSubset':
      case 'NotSubsetNotEqual':
      case 'NotSuperset':
      case 'NotSupersetNotEqual':
      case 'And':
      case 'Or':
      case 'Not':
      case 'Which':
      case 'Piecewise':
        return emitCollection(h, args, this);
      case 'D':
      case 'TotalD':
      case 'Gradient':
        return emitDerivative(h, args, this);
      case 'Apply':
      case 'Prime':
      case 'Derivative':
      case 'Function':
        return emitFunction(h, args, this);
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
