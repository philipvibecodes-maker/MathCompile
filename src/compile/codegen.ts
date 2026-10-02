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
import { normalizeIR } from './ir';

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

// Mangle an arbitrary symbol name (e.g. `a_{n+1}`) into a valid python
// identifier that consistently refers to that symbol.
function pyIdent(name: string): string {
  if (/^[A-Za-z_]\w*$/.test(name) && !PY_KEYWORDS.has(name)) return name;
  let out = name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (out === '') out = 'sym';
  if (/^\d/.test(out)) out = `_${out}`;
  if (PY_KEYWORDS.has(out)) out += '_';
  return out;
}

// Python identifier for a worksheet name. In `import sympy as sp` mode
// the module alias is live in the namespace — a user symbol literally
// named `sp` (\text{sp}, \operatorname{sp}) would rebound it and break
// every `sp.` call, so it mangles to `sp_`.
const userIdent = (qualified: boolean, name: string): string =>
  qualified && name === 'sp' ? 'sp_' : pyIdent(name);

// CE constants -> SymPy names (unqualified — the `sp.` prefix is applied
// per-emission via the emitter's `sp` getter so `from sympy import *`
// mode emits bare names). `True`/`False` are Python builtins and stay
// unqualified in both modes.
const CONSTANTS: Record<string, string> = {
  Pi: 'pi',
  ExponentialE: 'E',
  ImaginaryUnit: 'I',
  PositiveInfinity: 'oo',
  NegativeInfinity: '-oo',
  EulerGamma: 'EulerGamma',
  CatalansConstant: 'Catalan',
  GoldenRatio: 'GoldenRatio',
  True: 'True',
  False: 'False',
};

// Known function heads -> the SymPy function name to call.
const SP_FUNCS: Record<string, string> = {
  Sqrt: 'sqrt',
  Root: 'root',
  Abs: 'Abs',
  Sign: 'sign',
  Floor: 'floor',
  Ceil: 'ceiling',
  Min: 'Min',
  Max: 'Max',
  Factorial: 'factorial',
  Gamma: 'gamma',
  Binomial: 'binomial',
  GCD: 'gcd',
  LCM: 'lcm',
  Mod: 'Mod',
  Exp: 'exp',
  Ln: 'log',
  Sin: 'sin', Cos: 'cos', Tan: 'tan',
  Sec: 'sec', Csc: 'csc', Cot: 'cot',
  Sinh: 'sinh', Cosh: 'cosh', Tanh: 'tanh',
  Coth: 'coth', Sech: 'sech', Csch: 'csch',
  Arcsin: 'asin', Arccos: 'acos', Arctan: 'atan',
  Arcsec: 'asec', Arccsc: 'acsc', Arccot: 'acot',
  Arcsinh: 'asinh', Arccosh: 'acosh', Arctanh: 'atanh',
  Conjugate: 'conjugate', Re: 're', Im: 'im', Arg: 'arg',
  // CE emits these under longer names than sympy uses.
  Real: 're', Imaginary: 'im', Argument: 'arg',
  Erf: 'erf', Zeta: 'zeta',
  // Set operations exist under their own names.
  Union: 'Union',
  Intersection: 'Intersection',
  Complement: 'Complement',
  Difference: 'Complement', // sp.Difference(A, B) == Complement(A, B)
  SetMinus: 'Complement', // CE's \setminus — A \ B == Complement(A, B)
  SymmetricDifference: 'SymmetricDifference',
  // `x!!` — CE's double-factorial head lands in the 'call' escape hatch,
  // where only lowercase `sp.factorial2` exists.
  Factorial2: 'factorial2',
  // `\deg` — sympy's polynomial degree is lowercase.
  Degree: 'degree',
};

// \sin^{-1} — CE emits Apply(InverseFunction(<name>), arg); sympy names
// the inverses arc-*/exp/log instead of taking InverseFunction objects.
const INVERSE_FUNCS: Record<string, string> = {
  Sin: 'asin', Cos: 'acos', Tan: 'atan',
  Sec: 'asec', Csc: 'acsc', Cot: 'acot',
  Sinh: 'asinh', Cosh: 'acosh', Tanh: 'atanh',
  Exp: 'log', Ln: 'exp',
};

// Named CE set constants -> SymPy set, plus the Symbol assumption the
// membership implies (`x \in \mathbb{R}` should declare `x` real).
const SET_CONSTANTS: Record<string, string> = {
  RealNumbers: 'S.Reals',
  RationalNumbers: 'S.Rationals',
  Integers: 'S.Integers',
  Naturals: 'S.Naturals',
  Naturals0: 'S.Naturals0',
  PositiveIntegers: 'S.Naturals',
  NonnegativeIntegers: 'S.Naturals0',
  NonNegativeIntegers: 'S.Naturals0',
  ComplexNumbers: 'S.Complexes',
  AlgebraicNumbers: 'S.Algebraics',
  EmptySet: 'S.EmptySet',
};
const SET_ASSUMPTIONS: Record<string, string> = {
  RealNumbers: 'real=True',
  RationalNumbers: 'rational=True',
  Integers: 'integer=True',
  Naturals: 'integer=True, positive=True',
  Naturals0: 'integer=True, nonnegative=True',
  PositiveIntegers: 'integer=True, positive=True',
  NonnegativeIntegers: 'integer=True, nonnegative=True',
  NonNegativeIntegers: 'integer=True, nonnegative=True',
};

// Set-valued expression heads — `setReady` treats a node with one of
// these heads as a real sympy set.
const SET_HEADS = new Set([
  'Set', 'Interval', 'Union', 'Intersection', 'Complement', 'SetMinus',
  'Difference', 'SymmetricDifference', 'ConditionSet', 'ImageSet',
]);

// Statement-position heads that only lower to Python.
const STATEMENT_HEADS = new Set(['Assign', 'Def', 'Block', 'Which', 'Piecewise']);
const STATEMENT_CALL_HEADS = new Set(['solve', 'Solve', 'piecewise', 'Piecewise']);

interface Scope {
  /** `import sympy as sp` mode: emit `sp.` qualifiers. With
   * `from sympy import *` (the default) names emit unqualified. */
  qualified: boolean;
  /** Names defined by Assign/Def anywhere in the worksheet (pre-scan;
   * distinguishes worksheet functions from the sp.<head> escape hatch). */
  declared: Set<string>;
  /** Names bound so far in emission order (Assign/Def targets plus every
   * name that has had a `= sp.Symbol`/`sp.Function` line emitted). */
  defined: Set<string>;
  /** Python-local bound names (Def params) while inside a def body. */
  bound: Set<string>;
  /** Operator variable names while emitting the operator's body —
   * `\sum_{i=0}^{n}` binds `i` to the summation index, which matters
   * only for `i` (a bound `i` stays a symbol; a free `i` is `sp.I`). */
  lambdaBound: Set<string>;
  /** Symbol name -> assumption kwargs (`real=True`) inferred from
   * `\in`-membership statements; consulted when def lines emit. */
  assumptions: Map<string, string>;
  /** Free symbol name -> emitted python identifier, insertion-ordered.
   * A def line is emitted in the cell where the name is first needed. */
  symbols: Map<string, string>;
  /** Names used as functions (f'(x), Apply callees) -> sp.Function lines. */
  functions: Map<string, string>;
  /** Names used as matrices (\det A, \operatorname{tr}(A)) ->
   * sp.MatrixSymbol lines. */
  matrices: Map<string, string>;
  issues: Issue[];
  /** Unprefixed issues bucketed per cell (parallel to the inputs). */
  cellIssues: Issue[][];
  /** 1-based cell label for codegen-time issues; 0 = program level. */
  cell: number;
  /** Errors flagged during this cell's emission — a statement that bumps
   * it is dropped instead of emitting `sp.Error(...)`/`None` fragments. */
  errorCount: number;
  /** Names reserved for constants of integration — cellBody seeds it with
   * every name the cell uses so `C` (then D, E, …) never collides. Each
   * indefinite integral takes and reserves the next free capital. */
  constNames: Set<string>;
  flag(severity: Issue['severity'], message: string): void;
}

const isArr = (v: MathJson | undefined): v is MathJson[] => Array.isArray(v);
const isStr = (v: MathJson | undefined): v is string => typeof v === 'string';
const headOf = (v: MathJson | undefined): string | undefined =>
  isArr(v) && isStr(v[0]) ? v[0] : undefined;
const isHead = (v: MathJson | undefined, h: string): v is MathJson[] =>
  headOf(v) === h;

function numText(node: MathJson): string {
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object' && node !== null && 'num' in node)
    return String((node as { num: unknown }).num);
  return String(node);
}

// Numeric literal node — number or `{num: "..."}`.
const isNum = (v: MathJson | undefined): v is number | { num: string } =>
  typeof v === 'number' ||
  (typeof v === 'object' && v !== null && 'num' in v);

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

  /** SymPy constant: qualified in `import sympy as sp` mode; Python
   * builtins (True/False) and literals stay unqualified either way. */
  private constName(c: string): string {
    if (c === 'True' || c === 'False') return c;
    return c.startsWith('-') ? `-${this.sp}${c.slice(1)}` : `${this.sp}${c}`;
  }

  private alloc(map: Map<string, string>, name: string): string {
    const existing = map.get(name);
    if (existing) return existing;
    let ident = userIdent(this.scope.qualified, name);
    // Different symbol names can mangle to the same ident (a_{n} vs a_n) —
    // disambiguate deterministically by first-seen order.
    let n = 2;
    const used = (v: string) =>
      this.scope.symbols.has(v) ||
      [...this.scope.symbols.values()].includes(v) ||
      [...this.scope.functions.values()].includes(v) ||
      [...this.scope.matrices.values()].includes(v);
    while (used(ident)) ident = `${userIdent(this.scope.qualified, name)}_${n++}`;
    map.set(name, ident);
    return ident;
  }

  private sym(name: string): string {
    // A bare `i` in value position is the imaginary unit (i^2 -> -1,
    // e^{i\pi} -> -1); only a bound operator/def variable or an
    // `i = …` assignment keeps it an ordinary symbol.
    if (
      name === 'i' &&
      !this.scope.defined.has(name) &&
      !this.scope.bound.has(name)
    ) {
      return this.scope.lambdaBound.has(name)
        ? this.alloc(this.scope.symbols, name)
        : `${this.sp}I`;
    }
    if (this.scope.bound.has(name) || this.scope.defined.has(name))
      return userIdent(this.scope.qualified, name);
    return this.alloc(this.scope.symbols, name);
  }

  // A name used as a function (f in f'(x)) needs sp.Function, not
  // sp.symbols — symbols aren't callable.
  private fn(name: string): string {
    if (this.scope.defined.has(name)) return userIdent(this.scope.qualified, name);
    return this.alloc(this.scope.functions, name);
  }

  // A name used as a matrix (\det A) needs sp.MatrixSymbol — det/trace
  // of a bare Symbol raises in the worker. Names already bound (an
  // earlier `A = …` assignment) reuse their own ident instead.
  private mat(name: string): string {
    if (this.scope.defined.has(name)) return userIdent(this.scope.qualified, name);
    return this.alloc(this.scope.matrices, name);
  }

  // Would `node` emit to a real sympy Set? Sympy has no set *variable* —
  // `Union(A, B)`/`Contains(x, A)` over bare names raises "Input args
  // must be Sets". Only named set constants, set-valued expressions,
  // and names already bound by the worksheet qualify; a bare ident is
  // treated as scalar and the caller degrades to an unevaluated call.
  private setReady(node: MathJson): boolean {
    if (isStr(node)) {
      if (SET_CONSTANTS[node] !== undefined) return true;
      if (this.scope.defined.has(node)) return true;
      if (
        this.scope.symbols.has(node) ||
        this.scope.functions.has(node) ||
        this.scope.matrices.has(node)
      )
        return false;
      return false;
    }
    return isArr(node) && SET_HEADS.has(headOf(node) ?? '');
  }

  // Emit `head(a, b)` as a real sympy call when every set operand is
  // set-valued, else as an unevaluated `Function('head')(a, b)` — the
  // row shows the notation the user wrote instead of a TypeError.
  private setOp(head: string, args: MathJson[]): [string, number] {
    const spHead = SP_FUNCS[head] ?? head;
    if (args.every((a) => this.setReady(a)))
      return [
        `${this.sp}${spHead}(${args.map((a) => this.emit(a)).join(', ')})`,
        PREC_ATOM,
      ];
    return [
      `${this.sp}Function(${JSON.stringify(spHead)})(${args.map((a) => this.emit(a)).join(', ')})`,
      PREC_ATOM,
    ];
  }

  // Emit the argument of a matrix-valued op (det/trace): a bare
  // identifier becomes a MatrixSymbol unless it is already a scalar
  // Symbol/Function here — then flag rather than crash in the worker.
  private matrixArg(node: MathJson, op: string): string | null {
    if (!isStr(node)) return this.emit(node, PREC_ATOM);
    if (
      this.scope.symbols.has(node) ||
      this.scope.functions.has(node)
    ) {
      this.scope.flag('error', `${op} needs a matrix — ${node} is a scalar here`);
      return this.emit(node, PREC_ATOM);
    }
    return this.mat(node);
  }

  private isNegated(node: MathJson): boolean {
    if (headOf(node) === 'Negate') return true;
    if (typeof node === 'number') return node < 0;
    if (typeof node === 'object' && node !== null && 'num' in node)
      return String((node as { num: unknown }).num).startsWith('-');
    return false;
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
      this.scope.flag('error', 'unparseable input — statement skipped');
      return 'None';
    }
    const [text, prec] = this.inner(node);
    return prec < minPrec ? `(${text})` : text;
  }

  private inner(node: MathJson): [string, number] {
    if (typeof node === 'number' || (typeof node === 'object' && node !== null && 'num' in node))
      return [numText(node), PREC_ATOM];
    if (isStr(node)) {
      const c = CONSTANTS[node];
      if (c) return [this.constName(c), PREC_ATOM];
      const set = SET_CONSTANTS[node];
      if (set) return [`${this.sp}${set}`, PREC_ATOM];
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
        // Add emits x + y - z, folding Negate children and negative
        // literals into subtraction for readable output.
        const parts = args.map((a) => {
          const neg = this.isNegated(a);
          const body = neg
            ? isHead(a, 'Negate')
              ? this.emit(a[1], PREC_ADD)
              : numText(a).replace(/^-/, '')
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
      case 'Multiply':
        return [
          args.map((a) => this.emit(a, PREC_MUL)).join(' * '),
          PREC_MUL,
        ];
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
      case 'Power':
        return [
          `${this.emit(args[0], PREC_POW + 1)}**${this.emit(args[1], PREC_POW)}`,
          PREC_POW,
        ];
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
      case 'Equal': {
        if (args.length === 2)
          return [
            `${this.sp}Eq(${this.emit(args[0])}, ${this.emit(args[1])})`,
            PREC_ATOM,
          ];
        // a = b = c -> ${this.sp}And(${this.sp}Eq(a, b), ${this.sp}Eq(b, c))
        const pairs = args
          .slice(0, -1)
          .map((a, i) => `${this.sp}Eq(${this.emit(a)}, ${this.emit(args[i + 1])})`);
        return [`${this.sp}And(${pairs.join(', ')})`, PREC_ATOM];
      }
      case 'NotEqual':
        return [`${this.sp}Ne(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM];
      case 'Less':
        return [`${this.sp}Lt(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM];
      case 'LessEqual':
        return [`${this.sp}Le(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM];
      case 'Greater':
        return [`${this.sp}Gt(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM];
      case 'GreaterEqual':
        return [`${this.sp}Ge(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM];
      case 'And':
        return [`${this.sp}And(${args.map((a) => this.emit(a)).join(', ')})`, PREC_ATOM];
      case 'Or':
        return [`${this.sp}Or(${args.map((a) => this.emit(a)).join(', ')})`, PREC_ATOM];
      case 'Not':
        return [`${this.sp}Not(${this.emit(args[0])})`, PREC_ATOM];
      case 'Which': {
        // CE: (cond, expr) pairs, odd tail is the else value.
        const pieces: string[] = [];
        for (let i = 0; i + 1 < args.length; i += 2)
          pieces.push(
            `(${this.emit(args[i + 1])}, ${this.emit(args[i])})`,
          );
        if (args.length % 2 === 1)
          pieces.push(`(${this.emit(args[args.length - 1])}, True)`);
        return [`${this.sp}Piecewise(${pieces.join(', ')})`, PREC_ATOM];
      }
      case 'Piecewise': {
        // CE also emits ["Piecewise", ["List", expr, cond], ...]
        const pieces = args
          .map((a) =>
            isHead(a, 'List') && a.length === 3
              ? `(${this.emit(a[1])}, ${this.emit(a[2])})`
              : `(${this.emit(a)}, True)`,
          )
          .join(', ');
        return [`${this.sp}Piecewise(${pieces})`, PREC_ATOM];
      }
      case 'D': {
        // \frac{d}{dx} f and partials both parse to D(f, x[, n]).
        const savedBound = this.scope.lambdaBound;
        if (isStr(args[1]))
          this.scope.lambdaBound = new Set([...savedBound, args[1]]);
        const f = this.emit(args[0]);
        const x = this.emit(args[1]);
        const out: [string, number] =
          args.length >= 3
            ? [`${this.sp}diff(${f}, ${x}, ${this.emit(args[2])})`, PREC_ATOM]
            : [`${this.sp}diff(${f}, ${x})`, PREC_ATOM];
        this.scope.lambdaBound = savedBound;
        return out;
      }
      case 'Apply': {
        const callee = args[0];
        // \sin^{-1} x — CE emits Apply(InverseFunction(<name>), x).
        if (
          isHead(callee, 'InverseFunction') &&
          callee.length === 2 &&
          isStr(callee[1]) &&
          INVERSE_FUNCS[callee[1]] !== undefined
        ) {
          const inv = INVERSE_FUNCS[callee[1]];
          return [
            `${this.sp}${inv}(${args
              .slice(1)
              .map((a) => this.emit(a))
              .join(', ')})`,
            PREC_ATOM,
          ];
        }
        // f^{-1}(x) — the inverse function of f applied: emit a distinct
        // undefined function named `f^{-1}` (latex prints it literally).
        if (
          isHead(callee, 'Power') &&
          callee.length === 3 &&
          isStr(callee[1]) &&
          ((isNum(callee[2]) && numText(callee[2]) === '-1') ||
            (isHead(callee[2], 'Negate') &&
              isNum(callee[2][1]) &&
              numText(callee[2][1]) === '1'))
        )
          return [
            `${this.sp}Function(${JSON.stringify(`${callee[1]}^{-1}`)})(${args
              .slice(1)
              .map((a) => this.emit(a))
              .join(', ')})`,
            PREC_ATOM,
          ];
        if (isHead(callee, 'Derivative')) {
          // f'(x): ["Apply", ["Derivative", f, n], x]
          const [, f, n] = callee;
          const order = typeof n === 'number' && n !== 1 ? `, ${n}` : '';
          const argList = args
            .slice(1)
            .map((a) => this.emit(a))
            .join(', ');
          const fname = isStr(f) ? this.fn(f) : null;
          const applied =
            fname !== null
              ? `${fname}(${argList})`
              : `${this.emit(f)}(${argList})`;
          return [`${this.sp}diff(${applied}, ${argList}${order})`, PREC_ATOM];
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
        return [
          `${calleeText}(${args.slice(1).map((a) => this.emit(a)).join(', ')})`,
          PREC_ATOM,
        ];
      }
      case 'Derivative':
        return [
          `${this.sp}Derivative(${args
            .map((a, i) => (i === 0 && isStr(a) ? this.fn(a) : this.emit(a)))
            .join(', ')})`,
          PREC_ATOM,
        ];
      case 'Function': {
        // Anonymous lambda — CE wraps calculus bodies this way. Emitted
        // directly only when it escapes an operator that unwraps it
        // (e.g. `x \mapsto x^2`). A sympy `Lambda` — a raw python lambda
        // has no latex/repr and displays its own address.
        const params = args.slice(1).map((p) => this.sym(isStr(p) ? p : 'x'));
        const saved = this.scope.bound;
        this.scope.bound = new Set([...saved, ...params]);
        const body = this.emit(args[0]);
        this.scope.bound = saved;
        const sig =
          params.length === 1 ? params[0] : `(${params.join(', ')})`;
        return [`${this.sp}Lambda(${sig}, ${body})`, PREC_LOW];
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
        let extraVars: string[] = [];
        if (missing(v) && isHead(body, 'Multiply') && body.length >= 3) {
          // `\int x^2 \text{d}x` — CE leaves a \text{d} differential as a
          // `d * x` factor pair in the body instead of marking the var.
          // `\iint`/`\iiint` are single signs, so several pairs park on
          // one Integrate node — peel them all (leftmost = innermost).
          const tail = body.slice(1);
          while (
            tail.length >= 2 &&
            isStr(tail[tail.length - 1]) &&
            isStr(tail[tail.length - 2]) &&
            (tail[tail.length - 2] === 'd' ||
              tail[tail.length - 2] === 'd_upright')
          ) {
            extraVars.unshift(tail.pop() as string);
            tail.pop();
          }
          if (extraVars.length > 0) {
            v = extraVars[0];
            extraVars = extraVars.slice(1);
            body = tail.length === 1 ? tail[0] : ['Multiply', ...tail];
          }
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
        const savedBound = this.scope.lambdaBound;
        if (isStr(v))
          this.scope.lambdaBound = new Set([...savedBound, v, ...extraVars]);
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
            const specs = hasLo
              ? vars.map(
                  (w) =>
                    `(${this.emit(w)}, ${this.emit(lo)}, ${this.emit(hi)})`,
                )
              : vars.map((w) => this.emit(w));
            return [
              `${this.sp}integrate(${this.emit(body)}, ${specs.join(', ')})`,
              PREC_ATOM,
            ];
          }
          if (hasLo)
            return [
              `${this.sp}integrate(${this.emit(body)}, (${this.emit(v)}, ${this.emit(lo)}, ${this.emit(hi)}))`,
              PREC_ATOM,
            ];
          // Indefinite: append the constant of integration (`+ C`). PREC_ADD
          // keeps the sum parenthesized when the integral nests inside a
          // larger term (`(∫x dx)^2` -> `(x**2/2 + C)**2`).
          return [
            `${this.sp}integrate(${this.emit(body)}, ${this.emit(v)}) + ${this.sp}Symbol(${JSON.stringify(nextConstName(this.scope))})`,
            PREC_ADD,
          ];
        };
        const out = finish();
        this.scope.lambdaBound = savedBound;
        return out;
      }
      case 'Sum':
      case 'Product': {
        const { body } = unwrapLambda(args[0]);
        const limits = isHead(args[1], 'Limits') ? args[1].slice(1) : null;
        const eager = h === 'Sum' ? 'summation' : 'product';
        const lazy = h === 'Sum' ? 'Sum' : 'Product';
        // A stray `d x` under a product/sum (`\prod x^2 dx`) isn't
        // meaningful — `Product(expr)` raises "specify dummy variables"
        // in the worker, so flag at compile time instead.
        if (
          isHead(body, 'Multiply') &&
          body.length >= 3 &&
          isStr(body[body.length - 1]) &&
          (body[body.length - 2] === 'd' || body[body.length - 2] === 'd_upright')
        ) {
          this.scope.flag(
            'error',
            `differential ${body[body.length - 2]}${body[body.length - 1]} under \\${h === 'Sum' ? 'sum' : 'prod'} — did you mean \\int?`,
          );
          return [`${this.sp}${lazy}(${this.emit(body)})`, PREC_ATOM];
        }
        const missing = (n: MathJson | undefined): boolean =>
          n === undefined || n === 'Nothing' || isHead(n, 'Error');
        // The index variable is bound for the body's emission (a bound
        // `i` stays a symbol instead of resolving to sp.I).
        const savedBound = this.scope.lambdaBound;
        if (limits && isStr(limits[0]) && !missing(limits[0]))
          this.scope.lambdaBound = new Set([...savedBound, limits[0]]);
        const finish = (): [string, number] => {
          if (limits) {
            const hasLo = !missing(limits[1]);
            const hasHi = !missing(limits[2]);
            if (hasLo !== hasHi) {
              // `Sum(body, var)` isn't valid SymPy — flag the half-empty
              // bounds like a one-sided integral instead of emitting it.
              this.scope.flag(
                'error',
                `${hasLo ? 'upper' : 'lower'} bound is empty — fill it in or delete it`,
              );
              return [`${this.sp}${lazy}(${this.emit(body)})`, PREC_ATOM];
            }
            if (hasLo)
              return [
                `${this.sp}${eager}(${this.emit(body)}, (${this.emit(limits[0])}, ${this.emit(limits[1])}, ${this.emit(limits[2])}))`,
                PREC_ATOM,
              ];
          }
          // Missing bounds can't be evaluated — emit the unevaluated
          // form; a lone index variable is dropped (`Sum(body, i)` isn't
          // valid SymPy).
          if (limits)
            this.scope.flag(
              'note',
              `unbounded ${h === 'Sum' ? 'sum' : 'product'} — add bounds like \\sum_{i=a}^{b} to evaluate`,
            );
          return [`${this.sp}${lazy}(${this.emit(body)})`, PREC_ATOM];
        };
        const out = finish();
        this.scope.lambdaBound = savedBound;
        return out;
      }
      case 'Limit': {
        // CE emits ["Limit", ["Function", body, x], value[, dir]] — dir
        // is ±1 from `x \to a^{\pm}` (one-sided). Without a direction the
        // limit is two-sided: sympy's default dir='+' would silently give
        // the right-hand answer, so '+-' is emitted explicitly.
        const { body, params } = unwrapLambda(args[0]);
        if (isHead(args[0], 'Function')) {
          const v = params[0] ?? 'x';
          const dir =
            args.length >= 3 && isNum(args[2])
              ? Number(numText(args[2])) > 0
                ? '+'
                : '-'
              : '+-';
          const savedBound = this.scope.lambdaBound;
          if (isStr(v))
            this.scope.lambdaBound = new Set([...savedBound, v]);
          const out: [string, number] = [
            `${this.sp}limit(${this.emit(body)}, ${this.emit(v)}, ${this.emit(args[1])}, dir='${dir}')`,
            PREC_ATOM,
          ];
          this.scope.lambdaBound = savedBound;
          return out;
        }
        // Defensive ["Limit", expr, x, value[, dir]] shape.
        if (args.length >= 3) {
          const dir =
            args.length >= 4 && isNum(args[3])
              ? `, dir='${Number(numText(args[3])) > 0 ? '+' : '-'}'`
              : '';
          return [
            `${this.sp}limit(${this.emit(body)}, ${this.emit(args[1])}, ${this.emit(args[2])}${dir})`,
            PREC_ATOM,
          ];
        }
        const v = params[0] ?? 'x';
        return [
          `${this.sp}limit(${this.emit(body)}, ${this.emit(v)}, ${this.emit(args[1])}, dir='+-')`,
          PREC_ATOM,
        ];
      }
      case 'Open':
        // An interval's open-endpoint marker outside an Interval — it
        // only means something inside [a,b) bounds.
        this.scope.flag(
          'error',
          'an open-endpoint marker is only meaningful inside an interval',
        );
        return ['None', PREC_ATOM];
      case 'InverseFunction': {
        const name = isStr(args[0]) ? args[0] : 'unknown';
        const inv = INVERSE_FUNCS[name];
        if (inv) return [`${this.sp}${inv}`, PREC_ATOM];
        this.scope.flag('note', `can't invert ${name} — showing it as a function`);
        return [`${this.sp}Function(${JSON.stringify(name + '^{-1}')})`, PREC_ATOM];
      }
      case 'EvaluateAt': {
        // \left. F \right|_{x=a} — point evaluation via .subs; a bare
        // \left. F \right|_a infers the variable like an integral does.
        const body = args[0];
        const spec = args[1];
        let v: string | undefined;
        let at: MathJson | undefined;
        if (isHead(spec, 'Equal') && spec.length === 3) {
          if (isStr(spec[1])) v = spec[1];
          at = spec[2];
        } else {
          at = spec;
        }
        if (v === undefined) {
          const free = freeNames(body);
          if (free.length === 1) v = free[0];
        }
        if (
          v === undefined ||
          at === undefined ||
          at === 'Nothing' ||
          isHead(at, 'Error')
        ) {
          this.scope.flag(
            'error',
            'the eval bar needs a variable — write it as \\left. F \\right|_{x=a}',
          );
          return ['None', PREC_ATOM];
        }
        return [
          `${this.emit(body, PREC_ATOM)}.subs(${this.emit(v)}, ${this.emit(at)})`,
          PREC_ATOM,
        ];
      }
      case 'EvaluateAtRange': {
        // \left. F \right|_{a}^{b} -> F(b) - F(a); bounds may name the
        // variable explicitly (`_{x=a}^{x=b}`) or lean on the body's
        // single free symbol.
        const body = args[0];
        const parts = [args[1], args[2]].map((n) =>
          isHead(n, 'Equal') && n.length === 3
            ? { v: isStr(n[1]) ? n[1] : undefined, val: n[2] }
            : { v: undefined, val: n },
        );
        let v = parts.find((p) => p.v !== undefined)?.v;
        if (v === undefined) {
          const free = freeNames(body);
          if (free.length === 1) v = free[0];
        }
        const [lo, hi] = parts.map((p) => p.val);
        const missing = (n: MathJson | undefined): boolean =>
          n === undefined || n === 'Nothing' || isHead(n, 'Error');
        if (v === undefined || missing(lo) || missing(hi)) {
          this.scope.flag(
            'error',
            'the eval bar needs a variable and two bounds — \\left. F \\right|_{x=a}^{x=b}',
          );
          return ['None', PREC_ATOM];
        }
        const b = this.emit(body, PREC_ATOM);
        return [
          `${b}.subs(${this.emit(v)}, ${this.emit(hi)}) - ${b}.subs(${this.emit(v)}, ${this.emit(lo)})`,
          PREC_ADD,
        ];
      }
      case 'Prime': {
        // y'' — the nth derivative of the function w.r.t. x.
        const name = isStr(args[0])
          ? `${this.fn(args[0])}(${this.sym('x')})`
          : this.emit(args[0], PREC_ATOM);
        const n =
          isNum(args[1]) && numText(args[1]) !== '1'
            ? `, ${numText(args[1])}`
            : '';
        return [`${this.sp}Derivative(${name}, x${n})`, PREC_ATOM];
      }
      case 'Element': {
        // `x \in S` — a named set carries an assumption that lands on the
        // symbol's def line (`x = Symbol('x', real=True)`).
        const [a, s] = args;
        if (isStr(a) && isStr(s) && SET_ASSUMPTIONS[s] !== undefined)
          this.scope.assumptions.set(a, SET_ASSUMPTIONS[s]);
        // A non-set domain (bare `A`) — `Contains` validates the arg
        // type, so the whole expression degrades to an unevaluated call.
        if (!this.setReady(s))
          return [
            `${this.sp}Function("Contains")(${this.emit(a)}, ${this.emit(s)})`,
            PREC_ATOM,
          ];
        return [
          `${this.sp}Contains(${this.emit(a)}, ${this.emit(s)})`,
          PREC_ATOM,
        ];
      }
      case 'NotElement':
        // No assumption — `\notin` asserts non-membership, never `real`.
        if (!this.setReady(args[1]))
          return [
            `${this.sp}Function("NotElement")(${this.emit(args[0])}, ${this.emit(args[1])})`,
            PREC_ATOM,
          ];
        return [
          `${this.sp}Not(${this.sp}Contains(${this.emit(args[0])}, ${this.emit(args[1])}))`,
          PREC_ATOM,
        ];
      case 'Interval': {
        // Endpoint "Open" markers select the half-open Interval variant.
        const loOpen = isHead(args[0], 'Open');
        const hiOpen = isHead(args[1], 'Open');
        const a = this.emit(loOpen && isArr(args[0]) ? args[0][1] : args[0]);
        const b = this.emit(hiOpen && isArr(args[1]) ? args[1][1] : args[1]);
        const variant = loOpen && hiOpen ? 'open' : loOpen ? 'Lopen' : hiOpen ? 'Ropen' : '';
        return [
          `${this.sp}Interval${variant ? `.${variant}` : ''}(${a}, ${b})`,
          PREC_ATOM,
        ];
      }
      case 'Set': {
        // \{a, b\} -> FiniteSet; \{x : cond\} -> ConditionSet;
        // \{x \in S : cond\} -> ConditionSet over the domain, not a
        // FiniteSet holding a boolean and a nested set.
        if (args.length === 2 && isHead(args[1], 'Condition')) {
          const cond = this.emit(args[1][1]);
          if (isStr(args[0]))
            return [
              `${this.sp}ConditionSet(${this.emit(args[0])}, ${cond})`,
              PREC_ATOM,
            ];
          if (isHead(args[0], 'Element') && args[0].length === 3)
            return [
              this.setReady(args[0][2])
                ? `${this.sp}ConditionSet(${this.emit(args[0][1])}, ${cond}, ${this.emit(args[0][2])})`
                : `${this.sp}Function("ConditionSet")(${this.emit(args[0][1])}, ${cond}, ${this.emit(args[0][2])})`,
              PREC_ATOM,
            ];
        }
        return [
          `${this.sp}FiniteSet(${args.map((a) => this.emit(a)).join(', ')})`,
          PREC_ATOM,
        ];
      }
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
      case 'Congruent': {
        // `x \equiv b \pmod m` — CE's pmod form. [x, b, m] -> Eq(Mod(x, m), b).
        return [
          `${this.sp}Eq(${this.sp}Mod(${this.emit(args[0])}, ${this.emit(args[2])}), ${this.emit(args[1])})`,
          PREC_ATOM,
        ];
      }
      case 'Matrix': {
        // The grid is the first List-of-rows arg; unbracketed envs tag a
        // delimiter marker on as an extra arg ('..' / '[]') — ignored.
        const grid =
          isHead(args[0], 'List') &&
          args[0].slice(1).every((r) => isHead(r, 'List'));
        const rows =
          grid || (args.length === 1 && isHead(args[0], 'List'))
            ? (args[0] as MathJson[]).slice(1)
            : args;
        const text = rows
          .map((r: MathJson) =>
            isHead(r, 'List')
              ? `[${r.slice(1).map((c: MathJson) => this.emit(c)).join(', ')}]`
              : `[${this.emit(r)}]`,
          )
          .join(', ');
        return [`${this.sp}Matrix([${text}])`, PREC_ATOM];
      }
      case 'Union':
      case 'Intersection':
      case 'Complement':
      case 'SetMinus':
      case 'Difference':
      case 'SymmetricDifference':
        // `A \cup B` over bare names — sympy can't type a set variable,
        // so operands that aren't sets degrade to an unevaluated call.
        return this.setOp(h, args);
      case 'Determinant':
        // `\det A` on a bare name — MatrixSymbol via matrixArg; a
        // scalar Symbol would raise 'Symbol' has no 'det' in the worker.
        // Other args (a matrix literal, an assigned matrix) keep .det().
        if (isStr(args[0]))
          return [
            `${this.sp}Determinant(${this.matrixArg(args[0], '\\det') ?? 'None'})`,
            PREC_ATOM,
          ];
        return [`${this.emit(args[0], PREC_ATOM)}.det()`, PREC_ATOM];
      case 'Transpose':
        return [`${this.emit(args[0], PREC_ATOM)}.T`, PREC_ATOM];
      case 'Inverse':
        return [`${this.emit(args[0], PREC_ATOM)}**-1`, PREC_ATOM];
      case 'List':
        return [`[${args.map((a) => this.emit(a)).join(', ')}]`, PREC_ATOM];
      case 'Tuple':
        return [
          `(${args.map((a) => this.emit(a)).join(', ')}${args.length === 1 ? ',' : ''})`,
          PREC_ATOM,
        ];
      case 'call': {
        // Escape hatch: unknown/`\operatorname` heads — getattr resolves
        // a real sympy attr when the name exists (sp.besselj) and falls
        // back to an undefined function instead of AttributeErroring.
        // Worksheet-declared names call directly (f(x) = …): a declared
        // but unbound name gets a Function def in this cell.
        const name = isStr(args[0]) ? args[0] : 'unknown';
        // `f \circ g` — CE's composition head is literally 'Ring', which
        // getattr would resolve to sympy's ring-domain constructor.
        if (name === 'Ring' && args.length === 3) {
          const f = isStr(args[1]) ? this.fn(args[1]) : this.emit(args[1]);
          const g = isStr(args[2]) ? this.fn(args[2]) : this.emit(args[2]);
          const t = `${this.sp}Symbol("x")`;
          return [
            `${this.sp}Lambda(${t}, ${f}(${g}(${t})))`,
            PREC_LOW,
          ];
        }
        // `\operatorname{tr}(A)` — sp.Trace exists but rejects a bare
        // Symbol, the same 'Symbol' has no 'det' crash class.
        if (name === 'Trace' && args.length === 2)
          return [
            `${this.sp}Trace(${this.matrixArg(args[1], '\\operatorname{tr}') ?? 'None'})`,
            PREC_ATOM,
          ];
        // `\|x\|`/Vmatrix — no top-level `sp.Norm`; a bare name reads as
        // a scalar magnitude, a matrix value keeps `.norm()`.
        if (name === 'Norm' && args.length === 2) {
          const a = args[1];
          if (isStr(a) && !this.scope.matrices.has(a))
            return [`${this.sp}Abs(${this.emit(a)})`, PREC_ATOM];
          if (isStr(a))
            return [
              `${this.sp}Function("Norm")(${this.emit(a)})`,
              PREC_ATOM,
            ];
          return [`${this.emit(a, PREC_ATOM)}.norm()`, PREC_ATOM];
        }
        const rendered = args
          .slice(1)
          .map((a) => this.emit(a))
          .join(', ');
        if (this.scope.declared.has(name))
          return [`${this.fn(name)}(${rendered})`, PREC_ATOM];
        // The same head may exist under a longer CE name than sympy's
        // (`x!!` -> Factorial2 but `sp.factorial2`).
        if (SP_FUNCS[name])
          return [`${this.sp}${SP_FUNCS[name]}(${rendered})`, PREC_ATOM];
        const callee = this.scope.qualified
          ? `getattr(sp, ${JSON.stringify(pyIdent(name))}, ${this.sp}Function(${JSON.stringify(name)}))`
          : `globals().get(${JSON.stringify(pyIdent(name))}, ${this.sp}Function(${JSON.stringify(name)}))`;
        return [`${callee}(${rendered})`, PREC_ATOM];
      }
      default:
        if (SP_FUNCS[h])
          return [
            `${this.sp}${SP_FUNCS[h]}(${args.map((a) => this.emit(a)).join(', ')})`,
            PREC_ATOM,
          ];
        // Shouldn't reach — normalizeIR wraps unknown heads in 'call' —
        // but stay unblocked if raw IR is fed in directly.
        this.scope.flag('note', `unknown head "${h}" — emitted as ${h}(...)`);
        return [
          `${this.sp}${pyIdent(h)}(${args.map((a) => this.emit(a)).join(', ')})`,
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

// Node guaranteed to evaluate to a Python int: integer literals, plus
// powers/products/sums of them — `10^6/3` must emit `Rational(10**6, 3)`
// so it stays exact instead of a float.
function isIntExpr(v: MathJson | undefined): boolean {
  if (isNum(v)) return /^-?\d+$/.test(numText(v));
  if (!isArr(v)) return false;
  const h = headOf(v);
  if (h === 'Negate') return isIntExpr(v[1]);
  if (h === 'Power' || h === 'Multiply' || h === 'Add')
    return v.slice(1).every(isIntExpr);
  return false;
}

interface StatementOut {
  lines: string[];
  /** Expression to eval for the statement's displayed value — set only
   * for non-expression statements (Assign/Def), whose `lines` exec first
   * and this evals for the row (e.g. `a = 5` shows `a = 5`). Undefined
   * means the emitted code itself is the display expression. */
  display?: string;
}

interface CellBody {
  /** Symbol/Function def lines for names first needed by this cell. */
  defs: string[];
  /** Emitted top-level statements, in order (pre-collapse). */
  parts: { stmt: MathJson; out: StatementOut }[];
  /** Symbol/function names first bound in this cell. */
  newNames: Set<string>;
}

// Free symbol names inside an expression — used to infer the variable of
// an integral written without a differential. Constants, the CE 'Nothing'
// marker, and callee names (f in f(t), call heads) don't count.
function freeNames(node: MathJson, acc = new Set<string>()): string[] {
  if (isStr(node)) {
    if (
      !CONSTANTS[node] &&
      !SET_CONSTANTS[node] &&
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

// Every bare name token under the node — cellBody uses it to reserve the
// cell's names so constants of integration never shadow them.
function allNames(node: MathJson, acc: Set<string>): void {
  if (isStr(node)) {
    acc.add(node);
    return;
  }
  if (isArr(node)) for (const child of node) allNames(child, acc);
}

// The next constant of integration: first capital letter not used by the
// cell or bound elsewhere in the worksheet (C, else D, E, …). Exhausted
// alphabet falls back to reusing C — nothing else is left to give.
function nextConstName(scope: Scope): string {
  for (let code = 'C'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
    const name = String.fromCharCode(code);
    if (!scope.constNames.has(name)) {
      scope.constNames.add(name);
      return name;
    }
  }
  return 'C';
}

// Emit one normalized cell IR into defs + per-statement lines. Cells are
// independent: the scope's defined/symbols/functions sets are fresh per
// cell, so every free name the cell uses gets its def line at the top of
// the cell (`a = Symbol("a")` / `f = Function("f")`, `sp.`-qualified when
// `import sympy as sp` mode is selected).
function cellBody(ir: MathJson, scope: Scope): CellBody {
  const emitter = new Emitter(scope);
  const sp = scope.qualified ? 'sp.' : '';
  const preDefined = new Set(scope.defined);
  // Reserve the cell's own names (and worksheet Assign/Def targets) so
  // constants of integration start at the first free capital.
  allNames(ir, scope.constNames);
  for (const name of scope.declared) scope.constNames.add(name);
  const nodes = isHead(ir, 'Block') ? ir.slice(1) : [ir];
  const parts = nodes.map((stmt) => ({
    stmt,
    out: emitStatement(stmt, emitter),
  }));

  // Names first needed in this cell (not already bound in earlier ones).
  const newSyms = [...scope.symbols].filter(([raw]) => !preDefined.has(raw));
  const newFns = [...scope.functions].filter(([raw]) => !preDefined.has(raw));
  const newMats = [...scope.matrices].filter(
    ([raw]) => !preDefined.has(raw),
  );
  const newNames = new Set(
    [...newSyms, ...newFns, ...newMats].map(([raw]) => raw),
  );
  for (const raw of newNames) scope.defined.add(raw);

  const defs: string[] = [];
  // Assumed symbols (`x \in \mathbb{R}` -> real=True) always emit on their
  // own line — `symbols('x y', real=True)` would smear the assumption.
  const simple = newSyms.filter(
    ([raw, ident]) => ident === pyIdent(raw) && !scope.assumptions.has(raw),
  );
  const fancy = newSyms.filter(
    ([raw, ident]) => ident !== pyIdent(raw) || scope.assumptions.has(raw),
  );
  if (simple.length === 1)
    defs.push(`${simple[0][1]} = ${sp}Symbol(${JSON.stringify(simple[0][0])})`);
  else if (simple.length > 1)
    defs.push(
      `${simple.map(([, ident]) => ident).join(', ')} = ${sp}symbols('${simple.map(([raw]) => raw).join(' ')}')`,
    );
  for (const [raw, ident] of fancy) {
    const assum = scope.assumptions.get(raw);
    defs.push(
      `${ident} = ${sp}Symbol(${JSON.stringify(raw)}${assum ? `, ${assum}` : ''})`,
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
function emitExprStatement(node: MathJson, emitter: Emitter): string[] {
  const before = emitter.scope.errorCount;
  const line = emitter.emit(node);
  return emitter.scope.errorCount === before ? [line] : [];
}

function emitStatement(node: MathJson, emitter: Emitter): StatementOut {
  const sp = emitter.scope.qualified ? 'sp.' : '';
  if (!isArr(node)) return { lines: emitExprStatement(node, emitter) };
  const h = headOf(node);
  if (h === 'Assign') {
    // RHS emits first so `x = x + 1` collects x as a symbol; the Assign
    // then marks `x` bound for later statements/cells.
    const before = emitter.scope.errorCount;
    const rhs = emitter.emit(node[2]);
    const name = isStr(node[1]) ? node[1] : 'result';
    if (isStr(node[1])) emitter.scope.defined.add(name);
    if (emitter.scope.errorCount > before) return { lines: [] };
    return {
      lines: [`${userIdent(emitter.scope.qualified, name)} = ${rhs}`],
      // The display expression uses a fresh Symbol for the target so the
      // row renders the raw name (`x_{1}` shows subscripted, not `x_1`).
      display: `${sp}Eq(${sp}Symbol(${JSON.stringify(name)}), ${rhs})`,
    };
  }
  if (h === 'Def') {
    const name = isStr(node[1]) ? node[1] : 'f';
    const params =
      isHead(node[2], 'List') ? node[2].slice(1).filter(isStr) : [];
    const saved = emitter.scope.bound;
    emitter.scope.bound = new Set(params);
    const before = emitter.scope.errorCount;
    const body = emitter.emit(node[3]);
    emitter.scope.bound = saved;
    emitter.scope.defined.add(name);
    if (emitter.scope.errorCount > before) return { lines: [] };
    const idents = params
      .map((p) => userIdent(emitter.scope.qualified, p))
      .join(', ');
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
      lines: [
        `def ${userIdent(emitter.scope.qualified, name)}(${idents}):`,
        `    return ${body}`,
      ],
      display,
    };
  }
  if (h === 'Block')
    return {
      lines: node.slice(1).flatMap((s) => emitStatement(s, emitter).lines),
    };
  return { lines: emitExprStatement(node, emitter) };
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
  for (const r of perCell)
    if (r.ir !== undefined) collectDeclared(r.ir, declared);

  // Each cell emits with fresh defined/symbols/functions state — cells
  // are independent, so a name used in a cell is always defined there.
  const genIssues: Issue[][] = cells.map(() => []);
  const makeScope = (cell: number): Scope =>
    buildScope(qualified, declared, issues, genIssues, cell);
  const cellBodies = perCell.map((r, i) =>
    r.ir === undefined ? [] : cellStatements(r.ir, makeScope(i + 1)),
  );
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
// `sp.<head>` escape hatch.
function collectDeclared(ir: MathJson, declared: Set<string>): void {
  const collect = (n: MathJson) => {
    if (!isArr(n)) return;
    const h = headOf(n);
    if ((h === 'Assign' || h === 'Def') && isStr(n[1])) declared.add(n[1]);
    if (h === 'Block') n.slice(1).forEach(collect);
  };
  collect(ir);
}

function buildScope(
  qualified: boolean,
  declared: Set<string>,
  issues: Issue[],
  cellIssues: Issue[][],
  cell: number,
): Scope {
  return {
    qualified,
    declared,
    defined: new Set(),
    bound: new Set(),
    lambdaBound: new Set(),
    assumptions: new Map(),
    symbols: new Map(),
    functions: new Map(),
    matrices: new Map(),
    issues,
    cellIssues,
    cell,
    errorCount: 0,
    constNames: new Set(),
    flag(severity, message) {
      if (severity === 'error') this.errorCount += 1;
      this.issues.push({
        severity,
        message: this.cell > 0 ? `cell ${this.cell}: ${message}` : message,
      });
      if (this.cell > 0) this.cellIssues[this.cell - 1].push({ severity, message });
    },
  };
}

export interface CalcStatement {
  /** Python source for the statement: exec'd (Assign/Def) or eval'd
   * (expression) by the calculator worker. */
  code: string;
  /** When set, `code` execs first, then this evals for the row's value.
   * Absent = `code` evals directly for the row. */
  display?: string;
}

export interface CalcProgram {
  /** Script prefix — `import sympy as sp` plus the cell's Symbol/Function
   * defs. The worker execs it before the statements. */
  prelude: string[];
  statements: CalcStatement[];
  /** Normalization + codegen issues for the cell. */
  issues: Issue[];
}

// Compile a single cell for the calculator target: same pipeline as
// compileWorksheet (always `sp.`-qualified — the worker execs against
// `import sympy as sp`), but keeps the statement split and display
// expressions so each top-level statement yields its own result row.
export function compileCellForCalc(cell: CellInput): CalcProgram {
  const { ir, issues } = normalizeIR(cell.json);
  if (ir === undefined) return { prelude: [], statements: [], issues };

  const declared = new Set<string>();
  collectDeclared(ir, declared);
  const scope = buildScope(true, declared, issues, [[]], 0);
  const { defs, parts } = cellBody(ir, scope);
  // Statements dropped by an emission error (lines: []) produce no row —
  // the compile issue already reports the problem.
  const statements = parts
    .filter(({ out }) => out.lines.length > 0)
    .map(({ out }) => ({
      code: out.lines.join('\n'),
      display: out.display,
    }));
  return { prelude: ['import sympy as sp', ...defs], statements, issues };
}
