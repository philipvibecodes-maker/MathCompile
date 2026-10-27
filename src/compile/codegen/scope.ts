import type { Issue, MathJson } from '../ir';
import type { PyFnEntry } from '../pydefs';
import { pyIdent } from './identifiers';
import { allNames } from './analysis';
import { collectDeclared, collectMatrices } from './declarations';

// Emission scope — the name tables codegen carries plus the issue sink.
// The trackers are grouped by what they answer, not into one map: their
// lifetimes genuinely differ (worksheet vs cell vs call-stack) and a
// naive merge would alias them. All mutation goes through the facade
// methods below — reads stay direct field access — so multi-tracker
// updates like Assign's value rebind are a single transition.
export class Scope {
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
   * `bound`/`lambdaBound` are call-stack-lifetime — swapped wholesale
   * (save/restore) by withBound/withBoundOnly/withLambdaBound.
   * `emitting` is a call-stack guard added/removed by withEmitting, and
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
    /** Function names whose def returns a matrix/vector (`\text{def}
     * f(x) = (x, y)`) — an applied `f(…)`, a bare `f` operand (which
     * emits applied), and `D`/`\D` derivatives of it are
     * matrix-valued, so `\times`/matrix ops take the matrix path. */
    matrixFns: Set<string>;
    /** Argument list recorded for a function name at its decl/call
     * site (`\dot{x}` -> `x` of `t`, `dy/dx` of `x`, `def f(x,y)`,
     * `f(x)`). A bare Function name in operand position (a call arg,
     * arithmetic) raises TypeError, so later references emit the
     * applied form `f(x)`. */
    fnArgs: Map<string, MathJson[]>;
    /** Declared parameter list of a lambda-bound name
     * (`f = x \mapsto x^2`) — its signature, not an observed call:
     * derivative sites apply `f` at this arity. */
    lambdaParams: Map<string, MathJson[]>;
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
    /** `functions` entries that point at a user python def (python
     * cell / \python block), not a minted `sp.Function` — decl emission
     * skips them and a math-side claim (Assign/Def of the same name)
     * removes the mark so its own decl emits. */
    pyBacked: Set<string>;
  };
  /** The worksheet's python-function registry (python cells +
   *  `\python{}` blocks — see pydefs.ts). `fns` maps a CE call name to
   *  the def's ident; `usedSrcs` records which source snippets this
   *  scope's emission touched so a standalone cell script can inline
   *  the defs it calls; `warned` dedups the call-above-def note. */
  readonly py: {
    fns: Map<string, PyFnEntry>;
    usedSrcs: Set<number>;
    warned: Set<string>;
  };
  /** 0-based worksheet index of the cell currently emitting — the
   *  registry's `cell` compares against it for the call-above-def
   *  note. -1 when the scope isn't positioned (unused). */
  cellIdx: number;
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

  /** Which target a `\text{plot}` statement lowers for — 'calc' emits
   * the worker's `_mc_plot` marker call, 'python' emits the matching
   * `sp.plot*` line the signature admits. */
  plotTarget: 'calc' | 'python' = 'calc';

  constructor(
    qualified: boolean,
    declared: Set<string>,
    declaredFns: Set<string>,
    matrixNames: Set<string>,
    issues: Issue[],
    cellIssues: Issue[][],
    cell: number,
    plotTarget: 'calc' | 'python' = 'calc',
    pyFns: Map<string, PyFnEntry> = new Map(),
  ) {
    this.qualified = qualified;
    this.plotTarget = plotTarget;
    this.decls = { declared, declaredFns, defined: new Set() };
    this.emit = {
      symbols: new Map(),
      functions: new Map(),
      matrices: new Map(),
      matrixFns: new Set(),
      fnArgs: new Map(),
      lambdaParams: new Map(),
      bound: new Set(),
      lambdaBound: new Set(),
      emitting: new Set(),
      constNames: new Set(),
      pyBacked: new Set(),
    };
    this.py = { fns: pyFns, usedSrcs: new Set(), warned: new Set() };
    this.cellIdx = -1;
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

  /** Select cell-local diagnostics without resetting persistent bindings.
   * `cell` independently controls worksheet-export diagnostic prefixes;
   * calculator scopes intentionally keep that label at zero. */
  beginCell(index: number, issues: Issue[]): void {
    this.cellIdx = index;
    this.issues = issues;
    this.errorCount = 0;
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

  /** `name` is bound to a concrete VALUE — an Assign target already
   * emitted (`x = 5`), not merely declared by a `sp.Symbol`/`sp.Function`/
   * `sp.MatrixSymbol` def line. Symbol-bound names stay free variables:
   * `x = Symbol("x")` doesn't pin a value, so `\D`/`\nabla` can still
   * differentiate w.r.t. it — `decls.defined` alone can't tell the two
   * apart, since it also covers every emitted decl line. */
  isValueBound(name: string): boolean {
    return (
      this.decls.declared.has(name) &&
      this.decls.defined.has(name) &&
      !this.decls.declaredFns.has(name)
    );
  }

  /** Claim `name` as a function — the Def/Declare/colon-def binding
   * transition: bound, minted a `functions` ident, and (with params)
   * the arg list a later bare `f` emits applied. */
  claimFunction(name: string, params: MathJson[] = []): void {
    this.decls.defined.add(name);
    this.emit.functions.set(name, pyIdent(name));
    // A math-side def of a py-backed name wins — its own
    // `sp.Function`/def decl must emit (pyBacked names emit none).
    this.emit.pyBacked.delete(name);
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
   * move together: the name reads as the applied `x(t)` ever after.
   * Args merge into the recorded list (first-seen order) — a PDE
   * unknown differentiated by `t` at one site and `x` at another is
   * `u(t,x)` everywhere, never `u(t)` then `u(x)`. */
  noteDepVar(name: string, args: MathJson[]): void {
    const prev = this.emit.fnArgs.get(name) ?? [];
    const merged = [...prev];
    for (const a of args)
      if (!merged.some((p) => JSON.stringify(p) === JSON.stringify(a)))
        merged.push(a);
    this.emit.fnArgs.set(name, merged);
    this.kinds.depVars.add(name);
  }

  /** Claim `name` as the unknown function of a `\text{dsolve}`/
   * `\text{pdesolve}` statement — mints the `sp.Function` ident and
   * records the arg list like noteDepVar, without marking the name a
   * defined value (a defined non-declaredFn name isn't callable and
   * can't be differentiated — an ODE unknown is both). */
  claimDepVar(name: string, args: MathJson[]): void {
    if (!this.emit.functions.has(name)) {
      // A python-def'd name differentiated as `D(f,x)` applies the real
      // callable — record it py-backed so no `sp.Function` decl emits.
      const ent = this.py.fns.get(name);
      this.emit.functions.set(name, ent?.ident ?? pyIdent(name));
      if (ent !== undefined) this.notePyUse(name, ent);
    }
    this.noteDepVar(name, args);
  }

  /** Record a use of a python-cell function: mark its source snippet
   *  for injection into this cell's standalone script (python target;
   *  skipped for a same-cell `\python{}` block, which emits its own
   *  source), and flag when the def sits below the call — sequential
   *  targets (the calculator's shared namespace, the merged program)
   *  won't have it bound yet. The note dedups per (cell, name). */
  notePyUse(name: string, ent: PyFnEntry): void {
    if (ent.cell !== this.cellIdx) this.py.usedSrcs.add(ent.src);
    this.emit.pyBacked.add(name);
    if (ent.cell <= this.cellIdx) return;
    const key = `${this.cellIdx}:${name}`;
    if (this.py.warned.has(key)) return;
    this.py.warned.add(key);
    this.flag(
      'note',
      `"${ent.ident}" is defined in python cell ${ent.cell + 1} — it must sit above this cell for the call to evaluate`,
    );
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
    this.emit.lambdaParams.delete(name);
    this.emit.matrixFns.delete(name);
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
