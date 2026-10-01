// Normalized IR -> target codegen.
//
// The `python` target emits executable SymPy: `import sympy as sp`, an
// `x, y = sp.symbols('x y')` preamble collected from free symbols, then one
// statement per cell — Assign/Def thread state across cells. Any head the
// mapping table doesn't cover falls through to the escape hatch
// `sp.<head>(args)` so users are never blocked by vocabulary gaps.
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
  /** Full worksheet program — imports + symbols preamble + per-cell code. */
  program: string;
  /** Emitted statement lines per cell (parallel to the input cells). */
  cellLines: string[][];
  /** Normalized IR per cell — the OutputPanel debug view renders this. */
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

// CE constants -> SymPy. Anything else that's a bare string is a symbol.
const CONSTANTS: Record<string, string> = {
  Pi: 'sp.pi',
  ExponentialE: 'sp.E',
  ImaginaryUnit: 'sp.I',
  PositiveInfinity: 'sp.oo',
  NegativeInfinity: '-sp.oo',
  EulerGamma: 'sp.EulerGamma',
  CatalansConstant: 'sp.Catalan',
  GoldenRatio: 'sp.GoldenRatio',
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

interface Scope {
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
  /** 1-based cell label for codegen-time issues; 0 = program level. */
  cell: number;
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
    const [text, prec] = this.inner(node);
    return prec < minPrec ? `(${text})` : text;
  }

  private inner(node: MathJson): [string, number] {
    if (typeof node === 'number' || (typeof node === 'object' && node !== null && 'num' in node))
      return [numText(node), PREC_ATOM];
    if (isStr(node)) {
      const c = CONSTANTS[node];
      if (c) return [c, PREC_ATOM];
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
        return [`sp.Rational(${numText(args[0])}, ${numText(args[1])})`, PREC_ATOM];
      case 'Complex':
        return [
          `${numText(args[0])} + ${numText(args[1])}*sp.I`,
          PREC_ADD,
        ];
      case 'Root':
        return args.length === 2
          ? [`sp.root(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM]
          : [`sp.sqrt(${this.emit(args[0])})`, PREC_ATOM];
      case 'Log':
        return args.length === 2
          ? [`sp.log(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM]
          : [`sp.log(${this.emit(args[0])}, 10)`, PREC_ATOM];
      case 'Factorial':
        return [`sp.factorial(${this.emit(args[0])})`, PREC_ATOM];
      case 'Equal': {
        if (args.length === 2)
          return [
            `sp.Eq(${this.emit(args[0])}, ${this.emit(args[1])})`,
            PREC_ATOM,
          ];
        // a = b = c -> sp.And(sp.Eq(a, b), sp.Eq(b, c))
        const pairs = args
          .slice(0, -1)
          .map((a, i) => `sp.Eq(${this.emit(a)}, ${this.emit(args[i + 1])})`);
        return [`sp.And(${pairs.join(', ')})`, PREC_ATOM];
      }
      case 'NotEqual':
        return [`sp.Ne(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM];
      case 'Less':
        return [`sp.Lt(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM];
      case 'LessEqual':
        return [`sp.Le(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM];
      case 'Greater':
        return [`sp.Gt(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM];
      case 'GreaterEqual':
        return [`sp.Ge(${this.emit(args[0])}, ${this.emit(args[1])})`, PREC_ATOM];
      case 'And':
        return [`sp.And(${args.map((a) => this.emit(a)).join(', ')})`, PREC_ATOM];
      case 'Or':
        return [`sp.Or(${args.map((a) => this.emit(a)).join(', ')})`, PREC_ATOM];
      case 'Not':
        return [`sp.Not(${this.emit(args[0])})`, PREC_ATOM];
      case 'Which': {
        // CE: (cond, expr) pairs, odd tail is the else value.
        const pieces: string[] = [];
        for (let i = 0; i + 1 < args.length; i += 2)
          pieces.push(
            `(${this.emit(args[i + 1])}, ${this.emit(args[i])})`,
          );
        if (args.length % 2 === 1)
          pieces.push(`(${this.emit(args[args.length - 1])}, True)`);
        return [`sp.Piecewise(${pieces.join(', ')})`, PREC_ATOM];
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
        return [`sp.Piecewise(${pieces})`, PREC_ATOM];
      }
      case 'D': {
        // \frac{d}{dx} f and partials both parse to D(f, x[, n]).
        const f = this.emit(args[0]);
        const x = this.emit(args[1]);
        return args.length >= 3
          ? [`sp.diff(${f}, ${x}, ${this.emit(args[2])})`, PREC_ATOM]
          : [`sp.diff(${f}, ${x})`, PREC_ATOM];
      }
      case 'Apply': {
        const callee = args[0];
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
          return [`sp.diff(${applied}, ${argList}${order})`, PREC_ATOM];
        }
        const calleeText = isStr(callee)
          ? this.fn(callee)
          : this.emit(callee);
        return [
          `${calleeText}(${args.slice(1).map((a) => this.emit(a)).join(', ')})`,
          PREC_ATOM,
        ];
      }
      case 'Derivative':
        return [
          `sp.Derivative(${args
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
        const v = limits?.[0] ?? params[0];
        const lo = limits?.[1];
        const hi = limits?.[2];
        if (v === undefined)
          return [`sp.integrate(${this.emit(body)})`, PREC_ATOM];
        if (isStr(lo) && isStr(hi) && lo === 'Nothing' && hi === 'Nothing')
          return [`sp.integrate(${this.emit(body)}, ${this.emit(v)})`, PREC_ATOM];
        if (limits && !(isStr(lo) && lo === 'Nothing'))
          return [
            `sp.integrate(${this.emit(body)}, (${this.emit(v)}, ${this.emit(lo)}, ${this.emit(hi)}))`,
            PREC_ATOM,
          ];
        return [`sp.integrate(${this.emit(body)}, ${this.emit(v)})`, PREC_ATOM];
      }
      case 'Sum':
      case 'Product': {
        const { body } = unwrapLambda(args[0]);
        const limits = isHead(args[1], 'Limits') ? args[1].slice(1) : null;
        const eager = h === 'Sum' ? 'summation' : 'product';
        const lazy = h === 'Sum' ? 'Sum' : 'Product';
        if (
          limits &&
          !(isStr(limits[1]) && limits[1] === 'Nothing') &&
          !(isStr(limits[2]) && limits[2] === 'Nothing')
        )
          return [
            `sp.${eager}(${this.emit(body)}, (${this.emit(limits[0])}, ${this.emit(limits[1])}, ${this.emit(limits[2])}))`,
            PREC_ATOM,
          ];
        // Missing bounds can't be evaluated — emit the unevaluated form.
        return [
          limits
            ? `sp.${lazy}(${this.emit(body)}, ${this.emit(limits[0])})`
            : `sp.${lazy}(${this.emit(body)})`,
          PREC_ATOM,
        ];
      }
      case 'Limit': {
        // ["Limit", ["Function", body, x], value]; defensive 3-arg form
        // ["Limit", expr, x, value] too.
        const { body, params } = unwrapLambda(args[0]);
        if (args.length >= 3)
          return [
            `sp.limit(${this.emit(body)}, ${this.emit(args[1])}, ${this.emit(args[2])})`,
            PREC_ATOM,
          ];
        const v = params[0] ?? 'x';
        return [
          `sp.limit(${this.emit(body)}, ${this.emit(v)}, ${this.emit(args[1])})`,
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
        return [`sp.Matrix([${text}])`, PREC_ATOM];
      }
      case 'Determinant':
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
        // Escape hatch: unknown/`\operatorname` heads -> sp.<head>(args),
        // except worksheet-declared names, which call directly (f(x)=...) —
        // declared-but-not-yet-bound gets an sp.Function def in this cell.
        const name = isStr(args[0]) ? args[0] : 'unknown';
        const rendered = args
          .slice(1)
          .map((a) => this.emit(a))
          .join(', ');
        if (this.scope.declared.has(name))
          return [`${this.fn(name)}(${rendered})`, PREC_ATOM];
        return [`sp.${pyIdent(name)}(${rendered})`, PREC_ATOM];
      }
      default:
        if (SP_FUNCS[h])
          return [
            `sp.${SP_FUNCS[h]}(${args.map((a) => this.emit(a)).join(', ')})`,
            PREC_ATOM,
          ];
        // Shouldn't reach — normalizeIR wraps unknown heads in 'call' —
        // but stay unblocked if raw IR is fed in directly.
        this.scope.flag('note', `unknown head "${h}" — emitted as sp.${h}(...)`);
        return [
          `sp.${pyIdent(h)}(${args.map((a) => this.emit(a)).join(', ')})`,
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

// Emit one normalized cell IR as python statement lines. Names first
// needed in this cell get their definition line at the top of the cell
// (`a = sp.Symbol("a")`, `f = sp.Function("f")`) — a symbol is defined in
// the cell that defines it, so program order stays truthful.
function cellStatements(ir: MathJson | undefined, scope: Scope): string[] {
  if (ir === undefined) return [];
  const emitter = new Emitter(scope);
  const preDefined = new Set(scope.defined);
  const nodes = isHead(ir, 'Block') ? ir.slice(1) : [ir];
  const parts = nodes.map((stmt) => ({
    stmt,
    lines: emitStatement(stmt, emitter),
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
    defs.push(`${simple[0][1]} = sp.Symbol(${JSON.stringify(simple[0][0])})`);
  else if (simple.length > 1)
    defs.push(
      `${simple.map(([, ident]) => ident).join(', ')} = sp.symbols('${simple.map(([raw]) => raw).join(' ')}')`,
    );
  for (const [raw, ident] of fancy)
    defs.push(`${ident} = sp.Symbol(${JSON.stringify(raw)})`);
  for (const [raw, ident] of newFns)
    defs.push(`${ident} = sp.Function(${JSON.stringify(raw)})`);

  // A bare `a` cell whose symbol is defined here collapses to just the
  // definition line — `a = sp.Symbol("a")` is the cell's output.
  const stmts = parts.flatMap(({ stmt, lines }) =>
    isStr(stmt) && newNames.has(stmt) ? [] : lines,
  );
  return [...defs, ...stmts];
}

function emitStatement(node: MathJson, emitter: Emitter): string[] {
  if (!isArr(node)) return [emitter.emit(node)];
  const h = headOf(node);
  if (h === 'Assign') {
    // RHS emits first so `x = x + 1` collects x as a symbol; the Assign
    // then marks `x` bound for later statements/cells.
    const rhs = emitter.emit(node[2]);
    const name = isStr(node[1]) ? node[1] : 'result';
    if (isStr(node[1])) emitter.scope.defined.add(name);
    return [`${pyIdent(name)} = ${rhs}`];
  }
  if (h === 'Def') {
    const name = isStr(node[1]) ? node[1] : 'f';
    const params =
      isHead(node[2], 'List') ? node[2].slice(1).filter(isStr) : [];
    const saved = emitter.scope.bound;
    emitter.scope.bound = new Set(params);
    const body = emitter.emit(node[3]);
    emitter.scope.bound = saved;
    emitter.scope.defined.add(name);
    return [
      `def ${pyIdent(name)}(${params.map(pyIdent).join(', ')}):`,
      `    return ${body}`,
    ];
  }
  if (h === 'Block')
    return node.slice(1).flatMap((s) => emitStatement(s, emitter));
  return [emitter.emit(node)];
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

// Compile the whole worksheet. `python` produces a runnable SymPy program;
// other targets return diagnostics (expression lowering lands later).
export function compileWorksheet(
  cells: CellInput[],
  target: string,
): CompileResult {
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
        cellLines: cells.map(() => []),
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
      cellLines: cells.map(() => []),
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
  for (const r of perCell) {
    const collect = (n: MathJson) => {
      if (!isArr(n)) return;
      const h = headOf(n);
      if ((h === 'Assign' || h === 'Def') && isStr(n[1])) declared.add(n[1]);
      if (h === 'Block') n.slice(1).forEach(collect);
    };
    if (r.ir !== undefined) collect(r.ir);
  }

  const scope: Scope = {
    declared,
    defined: new Set(),
    bound: new Set(),
    symbols: new Map(),
    functions: new Map(),
    issues,
    cell: 0,
    flag(severity, message) {
      this.issues.push({
        severity,
        message: this.cell > 0 ? `cell ${this.cell}: ${message}` : message,
      });
    },
  };
  const cellLines = perCell.map((r, i) => {
    scope.cell = i + 1;
    const lines = r.ir === undefined ? [] : cellStatements(r.ir, scope);
    scope.cell = 0;
    return lines;
  });

  const lines: string[] = ['import sympy as sp'];
  cellLines.forEach((stmts, i) => {
    if (stmts.length === 0) return;
    lines.push('', `# cell ${i + 1}`, ...stmts);
  });

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    program: lines.join('\n'),
    cellLines,
    normalized: perCell,
    issues,
  };
}
