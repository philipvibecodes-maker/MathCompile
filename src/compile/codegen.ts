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
};

// Statement-position heads that only lower to Python.
const STATEMENT_HEADS = new Set(['Assign', 'Def', 'Block', 'Which', 'Piecewise']);
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
    'sign ceiling conjugate arg re im ' +
    'solve solveset linsolve nonlinsolve simplify factor expand cancel ' +
    'collect apart together trigsimp expand_trig powsimp nsimplify ' +
    'radsimp ratsimp fraction limit series residue solve_linear '
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

// CE head names that exist in SymPy under a different spelling —
// `call` resolves these to `sp.<mapped>` rather than a declared
// worksheet function.
const CALL_RENAMES: Record<string, string> = {
  Factorial2: 'factorial2',
  Set: 'FiniteSet',
  Erf: 'erf',
  Erfc: 'erfc',
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
  /** Free symbol name -> emitted python identifier, insertion-ordered.
   * A def line is emitted in the cell where the name is first needed. */
  symbols: Map<string, string>;
  /** Names used as functions (f'(x), Apply callees) -> sp.Function lines. */
  functions: Map<string, string>;
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
      [...this.scope.functions.values()].includes(v);
    while (used(ident)) ident = `${pyIdent(name)}_${n++}`;
    map.set(name, ident);
    return ident;
  }

  private sym(name: string): string {
    if (this.scope.bound.has(name) || this.scope.defined.has(name))
      return pyIdent(name);
    return this.alloc(this.scope.symbols, name);
  }

  // A name used as a function (f in f'(x)) needs sp.Function, not
  // sp.symbols — symbols aren't callable.
  private fn(name: string): string {
    if (this.scope.defined.has(name)) return pyIdent(name);
    return this.alloc(this.scope.functions, name);
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
        // int/int divides to a Python float — keep it exact as Rational.
        if (isNum(args[0]) && isNum(args[1]))
          return [
            `${this.sp}Rational(${numText(args[0])}, ${numText(args[1])})`,
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
        const f = this.emit(args[0]);
        const x = this.emit(args[1]);
        return args.length >= 3
          ? [`${this.sp}diff(${f}, ${x}, ${this.emit(args[2])})`, PREC_ATOM]
          : [`${this.sp}diff(${f}, ${x})`, PREC_ATOM];
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
        // directly only when it escapes an operator that unwraps it.
        const params = args.slice(1).map((p) => this.sym(isStr(p) ? p : 'x'));
        const saved = this.scope.bound;
        this.scope.bound = new Set([...saved, ...params]);
        const body = this.emit(args[0]);
        this.scope.bound = saved;
        return [`(lambda ${params.join(', ')}: ${body})`, PREC_LOW];
      }
      case 'Integrate': {
        const { body, params } = unwrapLambda(args[0]);
        const limits = isHead(args[1], 'Limits') ? args[1].slice(1) : null;
        const missing = (n: MathJson | undefined): boolean =>
          n === undefined || n === 'Nothing' || isHead(n, 'Error');
        let v = limits?.[0] ?? params[0];
        const lo = limits?.[1];
        const hi = limits?.[2];
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
        const hasLo = !missing(lo);
        const hasHi = !missing(hi);
        if (hasLo !== hasHi) {
          this.scope.flag(
            'error',
            `${hasLo ? 'upper' : 'lower'} bound is empty — fill it in or delete it`,
          );
          return [`${this.sp}integrate(${this.emit(body)}, ${this.emit(v)})`, PREC_ATOM];
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
      }
      case 'Sum':
      case 'Product': {
        const { body } = unwrapLambda(args[0]);
        const limits = isHead(args[1], 'Limits') ? args[1].slice(1) : null;
        const eager = h === 'Sum' ? 'summation' : 'product';
        const missing = (n: MathJson | undefined): boolean =>
          n === undefined || n === 'Nothing' || isHead(n, 'Error');
        const word = h === 'Sum' ? 'sum' : 'product';
        // SymPy has no boundless/partial Sum or Product form — every
        // shape except a complete (var, lo, hi) tuple raises ValueError.
        // Flag like the integral's half-bound case and drop the row.
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
      }
      case 'Limit': {
        // ["Limit", ["Function", body, x], value] or
        // ["Limit", ["Function", body, x], value, dir] where dir is ±1
        // (one-sided limits); defensive flat form ["Limit", expr, x,
        // value] too.
        const { body, params } = unwrapLambda(args[0]);
        if (isHead(args[0], 'Function')) {
          const v = params[0] ?? 'x';
          const dir =
            args[2] === 1
              ? ", dir='+'"
              : args[2] === -1
                ? ", dir='-'"
                : '';
          return [
            `${this.sp}limit(${this.emit(body)}, ${this.emit(v)}, ${this.emit(args[1])}${dir})`,
            PREC_ATOM,
          ];
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
        // `.det()` on a non-matrix literal emitted e.g. `3.det()` (a
        // SyntaxError). sp.Determinant(non-matrix) raises TypeError at
        // eval time, so flag the gap; the emission still displays the
        // intended form.
        if (!isHead(args[0], 'Matrix'))
          this.scope.flag(
            'note',
            "determinant needs a matrix — the argument isn't one",
          );
        return isHead(args[0], 'Matrix')
          ? [`${this.emit(args[0], PREC_ATOM)}.det()`, PREC_ATOM]
          : [`${this.sp}Determinant(${this.emit(args[0])})`, PREC_ATOM];
      case 'Transpose':
        return isHead(args[0], 'Matrix')
          ? [`${this.emit(args[0], PREC_ATOM)}.T`, PREC_ATOM]
          : [`${this.sp}Transpose(${this.emit(args[0])})`, PREC_ATOM];
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
        const upper = !missingArg(args[2])
          ? `(${bodyText}).subs(${this.sym(v)}, ${this.emit(args[2])})`
          : '';
        const lower = !missingArg(args[1])
          ? `(${bodyText}).subs(${this.sym(v)}, ${this.emit(args[1])})`
          : '';
        if (upper && lower) return [`${upper} - ${lower}`, PREC_ADD];
        if (upper || lower) return [upper || lower, PREC_ATOM];
        return [bodyText, PREC_ATOM];
      }
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
        // Unknown/`\operatorname` heads resolve in three tiers:
        // worksheet-declared names call directly (f(x)=...), known SymPy
        // builtins keep the sp.<head> escape hatch, and everything else
        // becomes an undefined worksheet function — `sp.f(x)` raised
        // AttributeError, `f(x)` displays and stays valid.
        const name = isStr(args[0]) ? args[0] : 'unknown';
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
  const newNames = new Set([...newSyms, ...newFns].map(([raw]) => raw));
  for (const raw of newNames) scope.defined.add(raw);

  const defs: string[] = [];
  const simple = newSyms.filter(([raw, ident]) => ident === pyIdent(raw));
  const fancy = newSyms.filter(([raw, ident]) => ident !== pyIdent(raw));
  if (simple.length === 1)
    defs.push(`${simple[0][1]} = ${sp}Symbol(${JSON.stringify(simple[0][0])})`);
  else if (simple.length > 1)
    defs.push(
      `${simple.map(([, ident]) => ident).join(', ')} = ${sp}symbols('${simple.map(([raw]) => raw).join(' ')}')`,
    );
  for (const [raw, ident] of fancy)
    defs.push(`${ident} = ${sp}Symbol(${JSON.stringify(raw)})`);
  for (const [raw, ident] of newFns)
    defs.push(`${ident} = ${sp}Function(${JSON.stringify(raw)})`);

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
    symbols: new Map(),
    functions: new Map(),
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
