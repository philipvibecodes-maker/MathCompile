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
  // `sp` is taken by `import sympy as sp` — a user name colliding with
  // the module alias would clobber every subsequent sp.* reference.
  if (name === 'sp') return 'sp_';
  if (/^[A-Za-z_]\w*$/.test(name) && !PY_KEYWORDS.has(name)) return name;
  // Prime ticks are meaningful (x' is a distinct variable, not x) —
  // translate them to _prime before the generic strip eats them.
  let out = name
    .replace(/'/g, '_prime')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (out === '') out = 'sym';
  if (/^\d/.test(out)) out = `_${out}`;
  if (PY_KEYWORDS.has(out)) out += '_';
  return out;
}

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
  EmptySet: 'EmptySet',
  // \mathbb{...} number sets — CE symbol names -> the S.* set objects.
  RealNumbers: 'S.Reals',
  ComplexNumbers: 'S.Complexes',
  RationalNumbers: 'S.Rationals',
  Integers: 'S.Integers',
  NonNegativeIntegers: 'S.Naturals0',
  Primes: 'S.Primes',
  True: 'True',
  False: 'False',
};

// \mathbb{S}^{+/-/_+/_-}-style leaf sets CE emits as plain symbol names
// (CONSTANTS can only hold one-segment S.* names — these are intervals
// or integer intersections).
const LEAF_SETS: Record<string, string> = {
  PositiveNumbers: 'Interval.open(0, oo)',
  NegativeNumbers: 'Interval.open(-oo, 0)',
  NonNegativeNumbers: 'Interval(0, oo)',
  NonPositiveNumbers: 'Interval(-oo, 0)',
  PositiveIntegers: 'S.Naturals',
  NonNegativeIntegers: 'S.Naturals0',
  NegativeIntegers: 'Intersection(S.Integers, Interval.open(-oo, 0))',
  NonPositiveIntegers: 'Intersection(S.Integers, Interval(-oo, 0))',
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
  // `\Re`/`\Im`/`\arg`/`\operatorname{erf}` parse to these CE heads —
  // `sp.Real`/`sp.Imaginary`/`sp.Argument`/`sp.Erf` don't exist and
  // each produced a 'has no attribute' error row.
  Real: 're', Imaginary: 'im', Argument: 'arg', Erf: 'erf',
};

// Statement-position heads that only lower to Python.
const STATEMENT_HEADS = new Set(['Assign', 'Def', 'Block', 'Which', 'Piecewise']);
const CMP_NESTABLE_HEADS = new Set([
  'Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual',
]);
const STATEMENT_CALL_HEADS = new Set(['solve', 'Solve', 'piecewise', 'Piecewise']);

// `call` heads that are real SymPy functions — keep emitting `sp.<name>`
// for them. Every other applied unknown name (f(x), \operatorname{foo}(x))
// becomes a worksheet Function def instead: `sp.f(x)` raised
// AttributeError ('module sympy has no attribute f') at eval time.
const SP_BUILTIN_CALL = new Set(
  (
    'erf erfc erfi erfinv erfcinv Ei expint Si Ci Shi Chi li Li zeta ' +
    'lerchphi polylog digamma trigamma polygamma loggamma beta betainc ' +
    'lowergamma uppergamma LambertW besselj bessely besseli besselk ' +
    'hankel1 hankel2 jn yn airyai airybi airyaiprime airybiprime ' +
    'marcumq fresnels fresnelc hyper meijerg appellf1 legendre ' +
    'assoc_legendre hermite hermite_prob chebyshevt chebyshevu ' +
    'gegenbauer jacobi laguerre assoc_laguerre fibonacci lucas ' +
    'tribonacci bernoulli euler bell catalan harmonic genocchi ' +
    'partition primepi mobius totient reduced_totient divisor_sigma ' +
    'legendre_symbol jacobi_symbol kronecker_symbol rf ff factorial2 ' +
    'subfactorial stirling multinomial nC nP nT Piecewise piecewise ' +
    'sign ceiling conjugate arg re ' +
    'asinh acosh atanh acoth asech acsch ' +
    'solve solveset linsolve nonlinsolve simplify factor expand cancel ' +
    'collect apart together trigsimp expand_trig powsimp nsimplify ' +
    'radsimp ratsimp fraction limit series residue solve_linear ' +
    'diff integrate summation product '
  ).split(' '),
);

// Minimum arity for SP_FUNCS entries — a lone `\gcd(10)` or `a\bmod` `
// otherwise emits a call SymPy raises TypeError on at eval time.
const SP_FUNC_MIN_ARGS: Record<string, number> = {
  gcd: 2,
  lcm: 2,
  Mod: 2,
  binomial: 2,
  root: 1,
  Min: 1,
  Max: 1,
};

// Nodes that provably emit a SymPy Set — used to gate Element/Union/
// Complement emission (those raise TypeError on plain Symbols).
const SETISH_SYMBOLS = new Set([
  'EmptySet', 'RealNumbers', 'ComplexNumbers', 'RationalNumbers',
  'Integers', 'NonNegativeIntegers', 'NonPositiveIntegers',
  'PositiveIntegers', 'NegativeIntegers', 'Primes',
  'PositiveNumbers', 'NegativeNumbers',
  'NonNegativeNumbers', 'NonPositiveNumbers',
]);
const SETISH_HEADS = new Set([
  'Interval', 'Set', 'FiniteSet', 'Union', 'Intersection', 'SetMinus',
  'Complement', 'Subset', 'SubsetEqual', 'Superset', 'SupersetEqual',
]);

// Domain a leaf membership implies for its symbol: `x \in \mathbb{R}`
// constructs `x = Symbol('x', real=True)` when x is first defined.
// `kwargs` go to the Symbol constructor, `preds` are the Q-predicate
// names for a `with assuming(...)` block (compound sets only — leaf
// sets don't need one once the Symbol carries the assumption).
const SET_CONSTRAINTS: Record<string, { kwargs: string[]; preds: string[] }> = {
  RealNumbers: { kwargs: ['real=True'], preds: ['real'] },
  ComplexNumbers: { kwargs: ['complex=True'], preds: ['complex'] },
  RationalNumbers: { kwargs: ['rational=True'], preds: ['rational'] },
  Integers: { kwargs: ['integer=True'], preds: ['integer'] },
  NonNegativeIntegers: {
    kwargs: ['integer=True', 'nonnegative=True'],
    preds: ['integer', 'nonnegative'],
  },
  Primes: { kwargs: ['prime=True'], preds: ['prime'] },
};

// CE head names that exist in SymPy under a different spelling —
// `call` resolves these to `sp.<mapped>` rather than a declared
// worksheet function.
const CALL_RENAMES: Record<string, string> = {
  Factorial2: 'factorial2',
  Set: 'FiniteSet',
  Erf: 'erf',
  Erfc: 'erfc',
  // \operatorname{arsinh} etc. — CE calls these Arsinh/… but sympy's
  // are a-prefixed; the bare name displays `Arsinh(x)` unevaluated.
  Arsinh: 'asinh', Arcosh: 'acosh', Artanh: 'atanh',
  Arcsinh: 'asinh', Arccosh: 'acosh', Arctanh: 'atanh',
  // \operatorname{Im}/\operatorname{Re} — imaginary/real part. The
  // lowercase \operatorname{im} is deliberately NOT renamed: "im" is
  // the image of a function, not sp.im.
  Im: 'im',
  Re: 're',
};

// \sin^{-1}(x) etc.: CE wraps the base name as ['InverseFunction', 'Sin'].
const INVERSE_FUNCS: Record<string, string> = {
  Sin: 'asin', Cos: 'acos', Tan: 'atan',
  Sec: 'asec', Csc: 'acsc', Cot: 'acot',
  Sinh: 'asinh', Cosh: 'acosh', Tanh: 'atanh',
  Coth: 'acoth', Sech: 'asech', Csch: 'acsch',
  Exp: 'log', Ln: 'exp', Log: 'exp',
};

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
  /** Operator-bound variables while inside a Sum/Product/Integrate/Limit
   * (`i` in \sum_{i}) — a bound `i` stays an ordinary Symbol instead of
   * resolving to the imaginary unit. */
  lambdaBound: Set<string>;
  /** Names used as matrices (\det A, \operatorname{tr}(A)) ->
   * `sp.MatrixSymbol` def lines. */
  matrices: Map<string, string>;
  /** Free symbol name -> emitted python identifier, insertion-ordered.
   * A def line is emitted in the cell where the name is first needed. */
  symbols: Map<string, string>;
  /** Names used as functions (f'(x), Apply callees) -> sp.Function lines. */
  functions: Map<string, string>;
  /** Symbol kwargs inferred from memberships (`x \in \mathbb{R}` ->
   * `real=True`) applied to this cell's Symbol def lines. */
  assumptions: Map<string, Set<string>>;
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

// CE's empty-argument marker (or a hole/absent slot).
const missingArg = (n: MathJson | undefined): boolean =>
  n === undefined || n === 'Nothing' || isHead(n, 'Error');

// Numeric literal node — number or `{num: "..."}`.
const isNum = (v: MathJson | undefined): boolean =>
  typeof v === 'number' ||
  (typeof v === 'object' && v !== null && 'num' in v);

// CE leaf names that don't print like the latex the user typed —
// `\varepsilon` mints `Symbol("epsilonSymbol")`, showing the word
// "epsilonSymbol". Map to a latex name the printer renders as the
// intended glyph.
const CE_DISPLAY_NAMES: Record<string, string> = {
  epsilonSymbol: '\\varepsilon',
  finalSigma: '\\varsigma',
  piSymbol: '\\varpi',
  thetaSymbol: '\\vartheta',
  rhoSymbol: '\\varrho',
  kappaSymbol: '\\varkappa',
  digamma: '\\digamma',
  ell: '\\ell',
  hBar: '\\hbar',
  bet: '\\beth',
  gimel: '\\gimel',
  daleth: '\\daleth',
  aleph: '\\aleph',
  weierstrass: '\\wp',
  // \Re/\Im alone — as leaves these are set names, not the function
  // heads re()/im() they spell when called.
  Real: '\\Re',
  Imaginary: '\\Im',
};

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
    let ident = pyIdent(name);
    // Different symbol names can mangle to the same ident (a_{n} vs a_n) —
    // disambiguate deterministically by first-seen order.
    let n = 2;
    const used = (v: string) =>
      this.scope.symbols.has(v) ||
      [...this.scope.symbols.values()].includes(v) ||
      [...this.scope.functions.values()].includes(v) ||
      [...this.scope.matrices.values()].includes(v);
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
      !this.scope.defined.has(name) &&
      !this.scope.bound.has(name)
    ) {
      return this.scope.lambdaBound.has(name)
        ? this.alloc(this.scope.symbols, name)
        : `${this.sp}I`;
    }
    if (this.scope.bound.has(name) || this.scope.defined.has(name))
      return pyIdent(name);
    // `v^T A v` — `v` was claimed by the matrix tier (Transpose), so a
    // later bare `v` is the SAME name, not a new symbol: reuse the
    // MatrixSymbol ident instead of minting `v_2`.
    if (this.scope.matrices.has(name))
      return this.scope.matrices.get(name)!;
    if (this.scope.functions.has(name))
      return this.scope.functions.get(name)!;
    return this.alloc(this.scope.symbols, name);
  }

  // A name used as a function (f in f'(x)) needs sp.Function, not
  // sp.symbols — symbols aren't callable.
  private fn(name: string): string {
    if (this.scope.defined.has(name)) return pyIdent(name);
    return this.alloc(this.scope.functions, name);
  }

  // A name used as a matrix (\det A) needs sp.MatrixSymbol — det/trace
  // of a bare Symbol raises in the worker. Names already bound (an
  // earlier `A = …` assignment) reuse their own ident instead.
  private mat(name: string): string {
    if (this.scope.defined.has(name)) return pyIdent(name);
    return this.alloc(this.scope.matrices, name);
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
   * name (`x \in \mathbb{R}` before any def -> `real=True`). */
  private assumeFrom(member: MathJson, set: MathJson): void {
    if (
      !isStr(member) ||
      this.scope.defined.has(member) ||
      this.scope.bound.has(member)
    )
      return;
    const c = this.constraintsFor(set);
    if (!c) return;
    const acc = this.scope.assumptions.get(member) ?? new Set<string>();
    for (const k of c.kwargs) acc.add(k);
    this.scope.assumptions.set(member, acc);
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
      this.scope.bound.has(member) || this.scope.defined.has(member)
        ? pyIdent(member)
        : (this.scope.symbols.get(member) ?? pyIdent(member));
    const preds = c.preds.map((p) => `${this.sp}Q.${p}(${ident})`);
    const joined =
      preds.length === 1 ? preds[0] : preds.map((p) => `(${p})`).join(' & ');
    return `with ${this.sp}assuming(${joined}):`;
  }

  /** Is this node guaranteed to emit a SymPy Set? Gates Contains/Union/
   * Complement emission — those raise TypeError on plain Symbols. */
  private isSetish(n: MathJson | undefined): boolean {
    if (isStr(n)) return SETISH_SYMBOLS.has(n);
    if (!isArr(n)) return false;
    // \{1,2\} arrives call-wrapped as ['call', 'Set', ...] since Set
    // isn't a KNOWN_HEAD — check the callee name too.
    if (isHead(n, 'call')) {
      if (!isStr(n[1])) return false;
      if (SETISH_HEADS.has(n[1])) return true;
      // The \mathbb{S}^±/^*/_0 callees all emit a set when their
      // operand is a set (`S^-` → S ∩ (−∞,0), `S*` → S∖{0}) —
      // otherwise they fold to conjugate/pseudoinverse, not a set.
      if (
        n[1] === 'Superminus' ||
        n[1] === 'Superplus' ||
        n[1] === 'PseudoInverse' ||
        n[1] === 'Superstar'
      )
        return (
          this.isSetish(n[2]) ||
          (isStr(n[2]) &&
            SETISH_SYMBOLS.has(n[2].replace(/_\{?0\}?$/, '')) &&
            /_\{?0\}?$/.test(n[2]))
        );
      return false;
    }
    return SETISH_HEADS.has(headOf(n) ?? '');
  }

  /** Emit `n` as a set op's operand: set-ish nodes emit directly, plain
   * expressions wrap as `sp.FiniteSet(...)` so Union/Intersection/
   * Complement compute instead of raising TypeError on bare Symbols. */
  private setArg(n: MathJson): string {
    return this.isSetish(n)
      ? this.emit(n)
      : `${this.sp}FiniteSet(${this.emit(n)})`;
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
      // \mathbb{R}^+ / \mathbb{R}^- / \mathbb{R}_+ / \mathbb{R}_- — CE
      // emits these as leaf symbol names; bare symbols named
      // "PositiveNumbers" are meaningless, so emit the interval set.
      if (LEAF_SETS[node] !== undefined) {
        const expr = LEAF_SETS[node].replace(
          /\b(oo|S|Interval|Intersection|FiniteSet|Union|Complement|Contains)\b/g,
          (m) => `${this.sp}${m}`,
        );
        return [expr, PREC_ATOM];
      }
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
      case 'Multiply': {
        // `\operatorname{sgn}x` flattens to `Multiply(Sign, x)` — the
        // bare `Sign` factor reads as a name, not the signum function.
        // Fuse the operator leaf back into a call: unary `Sign`+next
        // (`a sgn b` → `a*sign(b)`); binary GCD/LCM take the previous
        // AND next factor (`a \gcd b` → `gcd(a,b)`). A trailing bare
        // leaf stays a symbol.
        const FUSE_UNARY = new Set(['Sign']);
        const FUSE_BINARY = new Set(['GCD', 'LCM']);
        const parts: MathJson[] = [];
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (isStr(a) && i + 1 < args.length) {
            if (FUSE_UNARY.has(a)) {
              parts.push([a, args[++i]]);
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
      case 'Set': {
        // \{a, b\} -> FiniteSet; \{x : cond\} -> ConditionSet;
        // \{x \in S : cond\} -> ConditionSet over the domain, not a
        // FiniteSet holding a boolean and a nested set.
        if (args.length === 2 && isHead(args[1], 'Condition')) {
          const condArg = args[1][1];
          const cond = this.emit(condArg);
          if (isStr(args[0]))
            return [
              `${this.sp}ConditionSet(${this.emit(args[0])}, ${cond})`,
              PREC_ATOM,
            ];
          // \{f(x) : p(x)\} — an image set over the condition's domain:
          // `{x² : x∈ℤ}` = ImageSet(Lambda(x, x²), Integers); when the
          // predicate isn't a membership, build the image over a
          // ConditionSet domain.
          if (isHead(args[0], 'Element') && args[0].length === 3)
            return [
              this.isSetish(args[0][2])
                ? `${this.sp}ConditionSet(${this.emit(args[0][1])}, ${cond}, ${this.emit(args[0][2])})`
                : `${this.sp}Function("ConditionSet")(${this.emit(args[0][1])}, ${cond}, ${this.emit(args[0][2])})`,
              PREC_ATOM,
            ];
          const free = freeNames(condArg);
          if (free.length === 1) {
            const lam = `${this.sp}Lambda(${this.emit(free[0])}, ${this.emit(args[0])})`;
            const dom = isHead(condArg, 'Element')
              ? this.emit(condArg[2])
              : `${this.sp}ConditionSet(${this.emit(free[0])}, ${cond})`;
            return [`${this.sp}ImageSet(${lam}, ${dom})`, PREC_ATOM];
          }
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
        // elementwise sp.Min that \min(x, y) emits.
        const fn = h === 'Minimum' ? 'minimum' : 'maximum';
        const rest = args
          .slice(1)
          .map((a) => `, ${this.emit(a)}`)
          .join('');
        return [`${this.sp}${fn}(${this.emit(args[0])}${rest})`, PREC_ATOM];
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
        // (\mathbb{R} -> real=True); \notin asserts the opposite, so
        // NotElement intentionally skips this.
        if (this.isSetish(args[1])) this.assumeFrom(args[0], args[1]);
        return [
          `${this.sp}Contains(${this.emit(args[0])}, ${this.setArg(args[1])})`,
          PREC_ATOM,
        ];
      }
      case 'NotElement': {
        return [
          `${this.sp}Not(${this.sp}Contains(${this.emit(args[0])}, ${this.setArg(args[1])}))`,
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
      case 'SubsetEqual': {
        return [
          `(${this.setArg(args[0])}).is_subset(${this.setArg(args[1])})`,
          PREC_ATOM,
        ];
      }
      case 'Superset':
      case 'SupersetEqual': {
        return [
          `(${this.setArg(args[1])}).is_subset(${this.setArg(args[0])})`,
          PREC_ATOM,
        ];
      }
      case 'NotSubset':
      case 'NotSubsetNotEqual':
      case 'NotSuperset':
      case 'NotSupersetNotEqual': {
        const [l, r] = h.startsWith('NotSub') ? [0, 1] : [1, 0];
        return [
          `${this.sp}Not((${this.setArg(args[l])}).is_subset(${this.setArg(args[r])}))`,
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
        // \frac{df}{dx} — a bare name as the body is a function of the
        // variable, not an independent symbol: `diff(f, x)` would
        // evaluate to 0. Emit `diff(f(x), x)` -> Derivative(f(x), x).
        const f =
          isStr(args[0]) &&
          args[0] !== args[1] &&
          !this.scope.defined.has(args[0])
            ? `${this.fn(args[0])}(${this.emit(args[1])})`
            : this.emit(args[0]);
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
        if (isHead(callee, 'InverseFunction')) {
          // \sin^{-1}(x) -> asin(x); an unknown base keeps a readable
          // inverse(f)(x)-style row instead of InverseFunction garbage.
          const base = callee[1];
          const mapped = isStr(base) ? INVERSE_FUNCS[base] : undefined;
          const argList = args.slice(1).map((a) => this.emit(a)).join(', ');
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
          const fname = isStr(f) ? this.fn(f) : null;
          const applied = (argsList: string) =>
            fname !== null
              ? `${fname}(${argsList})`
              : `${this.emit(f)}(${argsList})`;
          if (argNodes.length === 1 && isStr(argNodes[0])) {
            const a = this.sym(argNodes[0]);
            return [
              `${this.sp}diff(${applied(a)}, ${diffBy(a)})`,
              PREC_ATOM,
            ];
          }
          if (argNodes.length === 1) {
            const base = `${this.sp}diff(${applied(this.sym('x'))}, ${diffBy('x')})`;
            return [`${base}.subs(x, ${this.emit(argNodes[0])})`, PREC_ATOM];
          }
          const argList = argNodes.map((a) => this.emit(a)).join(', ');
          return [
            `${this.sp}diff(${applied(argList)}, ${diffBy(argList)})`,
            PREC_ATOM,
          ];
        }
        // `f^{-1}(x)` — the inverse of f applied: a distinct undefined
        // function named `f^{-1}` (latex prints it literally).
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
      case 'Prime': {
        // y'' — the nth derivative of the function w.r.t. x. The arg's
        // `x` must be allocated first: for `x'` itself, taking the
        // function ident first gives `x` to the callee and `x_2` to the
        // variable, scrambling the names (`Derivative(x(x_2), x)`).
        const arg = this.sym('x');
        const name = isStr(args[0])
          ? `${this.fn(args[0])}(${arg})`
          : this.emit(args[0], PREC_ATOM);
        const n =
          isNum(args[1]) && numText(args[1]) !== '1'
            ? `, ${numText(args[1])}`
            : '';
        return [`${this.sp}Derivative(${name}, x${n})`, PREC_ATOM];
      }
      case 'Derivative': {
        // Bare `f^{(n)}` / `x^{(2)}` — a string callee arrives unapplied
        // and `Derivative(f, n)` raises TypeError ('cannot represent
        // derivative of UndefinedFunction'). Diff the applied function
        // like \ddot does: `sp.diff(f(x), x, n)` → dⁿf/dxⁿ.
        if (isStr(args[0])) {
          const f = this.fn(args[0]);
          // `x^{(2)}` can't differentiate `x(x)` by `x` — the var must
          // differ from the callee name.
          const v = this.sym(args[0] === 'x' ? 't' : 'x');
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
        if (isHead(body, 'Multiply') && body.length >= 3) {
          // `\int x^2 \text{d}x` — CE leaves a \text{d} differential as
          // a `d * x` factor pair in the body instead of marking the var.
          // `\iint`/`\iiint` park several pairs on one Integrate node —
          // peel them all (leftmost = innermost). A pair naming the
          // already-bound variable (`(x,0,1)` limits) is consumed, not
          // counted as an extra variable.
          const tail = body.slice(1);
          while (
            tail.length >= 2 &&
            isStr(tail[tail.length - 1]) &&
            isStr(tail[tail.length - 2]) &&
            (tail[tail.length - 2] === 'd' ||
              tail[tail.length - 2] === 'd_upright' ||
              tail[tail.length - 2] === "'d'" ||
              tail[tail.length - 2] === "'d_upright'")
          ) {
            const name = tail.pop() as string;
            tail.pop();
            if (name === v) continue;
            extraVars.unshift(name);
          }
          const peeled = tail.length !== body.length - 1;
          if (peeled)
            body = tail.length === 1 ? tail[0] : ['Multiply', ...tail];
          // CE flattens `f(x)` inside an integral to plain factors —
          // `Multiply(f, x, d, x)` loses the call marker. Fold a
          // function-name factor fused with the next name back into a
          // call so `∫f(x)dx` isn't emitted `∫f·x dx`.
          if (isHead(body, 'Multiply')) {
            const parts: MathJson[] = [body[0]];
            for (let i = 1; i < body.length; i++) {
              const a = body[i];
              const b = body[i + 1];
              if (
                isStr(a) &&
                this.scope.functions.has(a) &&
                isStr(b)
              ) {
                parts.push(['call', a, b]);
                i++;
              } else parts.push(a);
            }
            body =
              parts.length === 2
                ? (parts[1] as MathJson)
                : (parts as MathJson);
          }
          if (peeled && missing(v) && extraVars.length > 0) {
            v = extraVars[0];
            extraVars = extraVars.slice(1);
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
            const call = `${this.sp}integrate(${this.emit(body)}, ${specs.join(', ')})`;
            // One +C for the whole iterated antiderivative — same
            // convention as the single-variable path.
            return hasLo
              ? [call, PREC_ATOM]
              : [
                  `${call} + ${this.sp}Symbol(${JSON.stringify(nextConstName(this.scope))})`,
                  PREC_ADD,
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
          (body[body.length - 2] === 'd' ||
            body[body.length - 2] === 'd_upright' ||
            body[body.length - 2] === "'d'" ||
            body[body.length - 2] === "'d_upright'")
        ) {
          this.scope.flag(
            'error',
            `differential ${body[body.length - 2]}${body[body.length - 1]} under \\${h === 'Sum' ? 'sum' : 'prod'} — did you mean \\int?`,
          );
          return [`${this.sp}${h}(${this.emit(body)})`, PREC_ATOM];
        }
        // The index variable is bound for the body's emission (a bound
        // `i` stays a symbol instead of resolving to sp.I).
        const savedBound = this.scope.lambdaBound;
        if (limits && isStr(limits[0]) && !missing(limits[0]))
          this.scope.lambdaBound = new Set([...savedBound, limits[0]]);
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
        const out = finish();
        this.scope.lambdaBound = savedBound;
        return out;
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
        if (isStr(args[0]))
          return [
            `${this.sp}Determinant(${this.matrixArg(args[0], '\\det') ?? 'None'})`,
            PREC_ATOM,
          ];
        if (!isHead(args[0], 'Matrix'))
          this.scope.flag(
            'note',
            "determinant needs a matrix — the argument isn't one",
          );
        return isHead(args[0], 'Matrix')
          ? [`${this.emit(args[0], PREC_ATOM)}.det()`, PREC_ATOM]
          : [`${this.sp}Determinant(${this.emit(args[0])})`, PREC_ATOM];
      case 'Transpose':
        // `A^T` — `.T` on a scalar Symbol is an AttributeError; a bare
        // name reads as a matrix (same convention as \det A).
        if (isStr(args[0]))
          return [
            `${this.sp}Transpose(${this.matrixArg(args[0], '^T') ?? 'None'})`,
            PREC_ATOM,
          ];
        return isHead(args[0], 'Matrix')
          ? [`${this.emit(args[0], PREC_ATOM)}.T`, PREC_ATOM]
          : [`${this.sp}Transpose(${this.emit(args[0])})`, PREC_ATOM];
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
        if (free.length !== 1)
          this.scope.flag(
            'note',
            "can't infer the evaluation variable — evaluated w.r.t. x",
          );
        const bodyText = this.emit(body);
        // A bound can be an equation `x=a` — substitute the point, not
        // the Eq node itself (`subs(x, Eq(x,a))` is meaningless).
        const boundSub = (b: MathJson | undefined): string => {
          if (isHead(b, 'Equal') && b.length === 3) {
            const varText = isStr(b[1]) ? this.sym(b[1]) : this.emit(b[1]);
            return `(${bodyText}).subs(${varText}, ${this.emit(b[2])})`;
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
      case 'Norm':
        // \|v\|: Abs for scalars, .norm() for matrices — including a
        // bare name already declared as a matrix elsewhere.
        if (isHead(args[0], 'Matrix'))
          return [`(${this.emit(args[0])}).norm()`, PREC_ATOM];
        if (isStr(args[0]) && this.scope.matrices.has(args[0]))
          return [`${this.emit(args[0], PREC_ATOM)}.norm()`, PREC_ATOM];
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
        const name = isStr(args[0]) ? args[0] : 'unknown';
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
          const zeroed =
            isStr(a) &&
            SETISH_SYMBOLS.has(a.replace(/_\{?0\}?$/, '')) &&
            /_\{?0\}?$/.test(a);
          if (this.isSetish(a) || zeroed) {
            const base = zeroed
              ? this.emit(a.replace(/_\{?0\}?$/, '') as MathJson)
              : this.emit(a);
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
        // `A^{+}` on a non-set operand is the Moore–Penrose
        // pseudoinverse — sp.pinv, not the bare PseudoInverse call CE
        // uses for the `^{+}` superscript.
        if (name === 'PseudoInverse' && args.length === 2)
          return [`${this.sp}pinv(${this.emit(args[1])})`, PREC_ATOM];
        // \bar{x} — the complex-conjugate convention (as \overline{x});
        // SymPy's mean lives in stats and takes a random variable.
        if (name === 'Mean' && args.length === 2)
          return [`${this.sp}conjugate(${this.emit(args[1])})`, PREC_ATOM];
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
        // `\operatorname{tr}(A)` — sp.Trace exists but rejects a bare
        // Symbol, the same 'Symbol' has no 'det' crash class.
        if (name === 'Trace' && args.length === 2)
          return [
            `${this.sp}Trace(${this.matrixArg(args[1], '\\operatorname{tr}') ?? 'None'})`,
            PREC_ATOM,
          ];
        // `z^{*}`/`A^{*}` — CE's superscript-star head. A declared
        // matrix reads as the conjugate transpose (Adjoint crashes on
        // scalars); a set operand reads as S∖{0} (`\mathbb{Z}^{*}` —
        // conjugate of a Set raised TypeError); anything else is the
        // complex conjugate.
        if (name === 'Superstar' && args.length === 2) {
          const a = args[1];
          if (isStr(a) && this.scope.matrices.has(a))
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
          const savedBound = this.scope.lambdaBound;
          this.scope.lambdaBound = new Set([...savedBound, 'i']);
          try {
            const rendered = args
              .slice(1)
              .map((a) => this.emit(a))
              .join(', ');
            return [
              `${this.sp}KroneckerDelta(${rendered})`,
              PREC_ATOM,
            ];
          } finally {
            this.scope.lambdaBound = savedBound;
          }
        }
        const rendered = args
          .slice(1)
          .map((a) => this.emit(a))
          .join(', ');
        if (CALL_RENAMES[name])
          return [`${this.sp}${CALL_RENAMES[name]}(${rendered})`, PREC_ATOM];
        if (this.scope.declared.has(name) || !SP_BUILTIN_CALL.has(name))
          return [`${this.fn(name)}(${rendered})`, PREC_ATOM];
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
            return [`${this.sp}${fnName}(${args.map((a) => this.emit(a)).join(', ')})`, PREC_ATOM];
          }
          return [
            `${this.sp}${fnName}(${args.map((a) => this.emit(a)).join(', ')})`,
            PREC_ATOM,
          ];
        }
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
  if (isNum(v)) return /^-?\d+$/.test(numText(v as MathJson));
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
  // `\text{where}`-Blocks arrive condition-first: `x² where x>0` parses
  // as Block(Gt, x²). Rows are independent statements, so emit the body
  // row before its conditions — the order the user wrote, not CE's.
  const RELATION_HEADS = new Set([
    'Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual',
    'NotLess', 'NotGreater', 'NotLessEqual', 'NotGreaterEqual',
    'Element', 'NotElement', 'Subset', 'SubsetEqual', 'Superset',
    'SupersetEqual', 'IdenticallyEqual', 'Congruent',
  ]);
  const isRelation = (n: MathJson): boolean => RELATION_HEADS.has(headOf(n) ?? '');
  const blockNodes = isHead(ir, 'Block') ? ir.slice(1) : [ir];
  const nodes =
    blockNodes.length > 1 &&
    blockNodes.slice(0, -1).every(isRelation) &&
    !isRelation(blockNodes[blockNodes.length - 1])
      ? [blockNodes[blockNodes.length - 1], ...blockNodes.slice(0, -1)]
      : blockNodes;
  const parts = nodes.map((stmt) => ({
    stmt,
    out: emitStatement(stmt, emitter),
  }));

  // Names first needed in this cell (not already bound in earlier ones).
  const newSyms = [...scope.symbols].filter(([raw]) => !preDefined.has(raw));
  // Function-bound names (Def/`f:`) sit in `functions` for call-fold
  // detection but declare themselves — no `sp.Function` def for them.
  const newFns = [...scope.functions].filter(
    ([raw]) => !preDefined.has(raw) && !scope.defined.has(raw),
  );
  const newMats = [...scope.matrices].filter(
    ([raw]) => !preDefined.has(raw),
  );
  const newNames = new Set(
    [...newSyms, ...newFns, ...newMats].map(([raw]) => raw),
  );
  for (const raw of newNames) scope.defined.add(raw);

  const defs: string[] = [];
  // `simple` names are already valid identifiers — they go in one grouped
  // `sp.symbols('a b')` call whose string must not contain quotes or
  // punctuation. Anything needing mangling (a_0', {abc}, ? names) gets an
  // individual `sp.Symbol("raw name")` def where JSON quoting is safe.
  const simple = newSyms.filter(
    ([raw, ident]) =>
      raw === ident &&
      !scope.assumptions.has(raw) &&
      CE_DISPLAY_NAMES[raw] === undefined,
  );
  const fancy = newSyms.filter(
    ([raw, ident]) =>
      raw !== ident ||
      scope.assumptions.has(raw) ||
      CE_DISPLAY_NAMES[raw] !== undefined,
  );
  if (simple.length === 1)
    defs.push(`${simple[0][1]} = ${sp}Symbol(${JSON.stringify(simple[0][0])})`);
  else if (simple.length > 1)
    defs.push(
      `${simple.map(([, ident]) => ident).join(', ')} = ${sp}symbols('${simple.map(([raw]) => raw).join(' ')}')`,
    );
  for (const [raw, ident] of fancy) {
    const kw = scope.assumptions.get(raw);
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

function emitStatement(node: MathJson, emitter: Emitter): StatementOut {
  const sp = emitter.scope.qualified ? 'sp.' : '';
  if (!isArr(node)) return emitExprStatement(node, emitter);
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
      lines: [`${pyIdent(name)} = ${rhs}`],
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
    emitter.scope.functions.set(name, pyIdent(name));
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
      emitter.scope.defined.add(name);
      emitter.scope.functions.set(name, pyIdent(name));
      if (emitter.scope.errorCount > before) return { lines: [] };
      return {
        lines: [`${pyIdent(name)} = ${rhs}`],
        display: `${sp}Eq(${sp}Symbol(${JSON.stringify(name)}), ${rhs})`,
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
    emitter.scope.defined.add(name);
    emitter.scope.functions.set(name, pyIdent(name));
    if (emitter.scope.errorCount > before) return { lines: [] };
    return {
      lines: [`${pyIdent(name)} = ${rhs}`],
      display: `${sp}Eq(${sp}Symbol(${JSON.stringify(name)}), ${rhs})`,
    };
  }
  if (h === 'Block')
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
    matrices: new Map(),
    symbols: new Map(),
    functions: new Map(),
    issues,
    cellIssues,
    cell,
    errorCount: 0,
    constNames: new Set(),
    assumptions: new Map(),
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
