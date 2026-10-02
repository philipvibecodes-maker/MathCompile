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

import { ComputeEngine } from '@cortex-js/compute-engine';
import { outputLatex } from './latex';

// MathJSON is untyped JSON: head arrays, bare symbol strings, numbers, and
// occasional `{num: "..."}` / `{str: "..."}` wrappers.
export type MathJson =
  | string
  | number
  | boolean
  | { [key: string]: unknown }
  | MathJson[];

export interface Issue {
  severity: 'error' | 'note';
  message: string;
}

export interface NormResult {
  ok: boolean;
  ir: MathJson | undefined;
  issues: Issue[];
}

let engine: ComputeEngine | undefined;
const ce = (): ComputeEngine => (engine ??= new ComputeEngine());

const isArray = (v: MathJson): v is MathJson[] => Array.isArray(v);
const isString = (v: MathJson): v is string => typeof v === 'string';
const head = (v: MathJson): string | undefined =>
  isArray(v) && isString(v[0]) ? v[0] : undefined;

// A cell's LaTeX may hold multiple statements: MathQuill wraps multi-line
// content as \displaylines{a \\ b \\ c}. CE cannot parse that wrapper (it
// surfaces as Error/Tuple garbage), so rows are split here — on \\ at
// brace depth 0 — before parsing. \\ inside a \begin{...}...\end{...}
// environment is a matrix/cases row separator, not a statement break, so
// environment depth is tracked alongside brace depth.
export function latexToStatementStrings(latex: string): string[] {
  const inner = outputLatex(latex);
  const statements: string[] = [];
  let depth = 0;
  let envDepth = 0;
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    else if (ch === '\\') {
      if (inner.startsWith('begin{', i + 1)) envDepth++;
      else if (inner.startsWith('end{', i + 1))
        envDepth = Math.max(0, envDepth - 1);
      else if (inner[i + 1] === '\\' && depth === 0 && envDepth === 0) {
        statements.push(current);
        current = '';
        i++;
        continue;
      }
    }
    current += ch;
  }
  statements.push(current);
  return statements.map((s) => s.trim()).filter((s) => s !== '');
}

// Parse a cell's LaTeX into raw MathJSON. Multiple statements become a
// `["Block", ...]` node so downstream code sees one tree per cell. Parse
// failures degrade to an Error node — the pipeline reports, never throws.
export function parseCellLatex(latex: string): MathJson | undefined {
  const statements = latexToStatementStrings(latex);
  if (statements.length === 0) return undefined;
  const parsed = statements.map((s) => {
    try {
      // `form: 'raw'` skips CE canonicalization so the user's term order
      // survives to codegen (a * 2 stays Multiply(a, 2), not sorted).
      // \antid/\iint (MathQuill's boundless insertion aliases for \int)
      // already read as \int here — outputLatex canonicalizes them in
      // latexToStatementStrings, so CE sees an ordinary Integrate node.
      return ce().parse(s, { form: 'raw' }).json as MathJson;
    } catch {
      return ['Error', `'parse-failed'`] as MathJson;
    }
  });
  return parsed.length === 1 ? parsed[0] : (['Block', ...parsed] as MathJson);
}

// Heads the normalizer understands and passes through (children still get
// normalized). Anything else becomes `['call', head, ...]` so codegen emits
// `sp.<head>(...)` — the escape hatch that keeps users unblocked by CE
// vocabulary gaps.
const KNOWN_HEADS = new Set([
  // arithmetic / algebra
  'Add', 'Multiply', 'Divide', 'Negate', 'Power', 'Sqrt', 'Root',
  'Rational', 'Complex', 'Abs', 'Sign', 'Floor', 'Ceil', 'Min', 'Max',
  'Norm', 'Divides',
  'Exp', 'Ln', 'Log', 'Factorial', 'Gamma', 'Binomial', 'GCD', 'LCM', 'Mod',
  'Lb', 'Lg',
  // trigonometric
  'Sin', 'Cos', 'Tan', 'Sec', 'Csc', 'Cot',
  'Sinh', 'Cosh', 'Tanh', 'Coth', 'Sech', 'Csch',
  'Arcsin', 'Arccos', 'Arctan', 'Arcsec', 'Arccsc', 'Arccot',
  'Arcsinh', 'Arccosh', 'Arctanh',
  // calculus
  'D', 'Derivative', 'Apply', 'Integrate', 'Sum', 'Product', 'Limit',
  'InverseFunction', 'EvaluateAt',
  // linear algebra
  'Matrix', 'Determinant', 'Transpose', 'ConjugateTranspose', 'Inverse',
  // relations / logic / piecewise
  'Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual',
  'NotLess', 'NotGreater', 'NotLessEqual', 'NotGreaterEqual', 'NotDivides',
  'Implies', 'Equivalent', 'IdenticallyEqual', 'Degrees',
  'Minimum', 'Maximum', 'Interval', 'Open',
  // set operators — codegen emits real SymPy when operands are set-like,
  // and the same flagged Function stub as before otherwise.
  'Element', 'NotElement', 'Union', 'Intersection', 'SetMinus',
  'Subset', 'SubsetEqual', 'Superset', 'SupersetEqual',
  'NotSubset', 'NotSubsetNotEqual', 'NotSuperset', 'NotSupersetNotEqual',
  'And', 'Or', 'Not', 'Which', 'Piecewise',
  // statement-level IR
  'Assign', 'Def', 'Block', 'Function',
  // structural helpers
  'Limits', 'Tuple', 'List', 'Subscript', 'Delimiters', 'Error',
  // 'Set' reaches codegen directly (FiniteSet / ConditionSet / ImageSet
  // lowering) and 'Condition' is its predicate child. 'call' marks a node
  // already escaped by this pass — without it a nested g(f(x)) re-wraps
  // into ['call', 'call', ...].
  'Set', 'Condition', 'call',
  // MatrixMethod lowers `trace(A)`-style word applications on a matrix
  // literal (CE fuses `\mathrm{trace}(M)` into Multiply or an
  // InvisibleOperator call) to `(<matrix>).trace()` in codegen.
  'MatrixMethod',
]);

// CE string literals arrive as "'text'" (e.g. \text{...}); unwrap to the
// inner name so it can be treated as a symbol with a note.
const TEXT_LITERAL = /^'(.*)'$/;

// Words that read as matrix operations when juxtaposed with a matrix
// literal: `\mathrm{trace}(A)` etc. — codegen lowers them to method
// calls on the emitted Matrix.
const MATRIX_WORD_OPS = new Set([
  'trace',
  'rank',
  'eigenvals',
  'eigenvects',
  'inverse',
  'transpose',
  'norm',
]);

// CE marks unparseable atoms as the *quoted* symbol 'unexpected-command'
// (a string literal), e.g. `['Power', "'unexpected-command'", LatexString]
// for a bare `\int_{ }^{ }`.
const UNEXPECTED_COMMAND = /^'unexpected-command'$/;
const isUnexpectedCommand = (v: MathJson): boolean =>
  isString(v) && UNEXPECTED_COMMAND.test(v);

function issue(severity: Issue['severity'], message: string): Issue {
  return { severity, message };
}

// CE reports parse problems as ['Error', "'<code>'", ['LatexString', "'<src>'"]]
// — translate the code to a plain-language message, quoting the offending
// fragment when CE carried one. `parse-failed` is our own catch-all for a
// thrown parse.
function describeError(node: MathJson[]): string {
  const code = (isString(node[1]) ? node[1] : 'error').replace(/^'|'$/g, '');
  let src = '';
  for (const arg of node.slice(2)) {
    if (isArray(arg) && head(arg) === 'LatexString' && isString(arg[1])) {
      src = arg[1].replace(/^'(.*)'$/s, '$1').trim();
      break;
    }
  }
  const hint = src ? ` "${src}"` : '';
  switch (code) {
    case 'missing':
      return 'empty slot — fill it in or delete it';
    case 'unexpected-command':
      return src === '\\int'
        ? 'integral sign with no integrand — type the integrand after ∫'
        : `incomplete or unsupported command${hint}`;
    case 'unexpected-operator':
      return `stray operator${hint} — delete it or finish the expression`;
    case 'unexpected-delimiter':
      return `stray ${src || 'delimiter'} — unmatched delimiter`;
    case 'unbalanced-environment':
      return 'unclosed \\begin{...} — missing \\end{...}';
    case 'expected-closing-delimiter':
      return `missing closing brace${hint ? ` near${hint}` : ''}`;
    case 'parse-failed':
      return "couldn't parse this — check for a typo";
    default:
      return `unparseable input (${code})`;
  }
}

// Flatten a subscript position to symbol-name text: a_{n+1} -> 'a_{n+1}'.
// Best-effort — complex subscripts keep a readable placeholder name.
function flattenSubscript(node: MathJson): string {
  if (isString(node)) return node;
  if (typeof node === 'number') return String(node);
  if (isArray(node)) {
    const h = head(node);
    if (h === 'Add') return node.slice(1).map(flattenSubscript).join('+');
    if (h === 'Multiply') return node.slice(1).map(flattenSubscript).join('');
    if (h === 'InvisibleOperator')
      return node.slice(1).map(flattenSubscript).join('');
    if (h === 'Negate') return `-${flattenSubscript(node[1])}`;
    if (h === 'Power')
      return `${flattenSubscript(node[1])}^${flattenSubscript(node[2])}`;
    // x_{i,j}: Sequence/Delimiter wrap the comma-list — join with
    // commas, dropping delimiter-marker text literals like '(,)'.
    if (h === 'Sequence' || h === 'Delimiter')
      return node
        .slice(1)
        .filter((c) => !(isString(c) && TEXT_LITERAL.test(c)))
        .map(flattenSubscript)
        .join(',');
  }
  return '?';
}

// Is this node a plain symbol usable as an assignment target?
const isSymbolString = (v: MathJson): v is string =>
  isString(v) && v !== '' && !v.startsWith("'");

// A parameter name slot — `x` or the quoted literal `'x'` CE puts in
// Typed declaration signatures (`f: x \mapsto x^2`). Strips the quotes
// without emitting a literal note; undefined for anything else.
const paramName = (v: MathJson): string | undefined => {
  if (isSymbolString(v)) return v;
  const m = isString(v) ? TEXT_LITERAL.exec(v) : null;
  return m ? m[1] : undefined;
};

// A Delimiter node's argument list: Delimiter(x) -> [x],
// Delimiter(Sequence(a, b), '(,)') -> [a, b] (the '(,)' marker is dropped).
function delimiterArgs(delim: MathJson): MathJson[] {
  if (!isArray(delim)) return [delim];
  const inner = delim
    .slice(1)
    .filter((a) => !(isString(a) && TEXT_LITERAL.test(a)));
  if (inner.length === 1 && isArray(inner[0]) && head(inner[0]) === 'Sequence')
    return inner[0].slice(1);
  return inner;
}

// Is `last` a Delimiter/Delimiters group — the applicand of an
// InvisibleOperator application like f(x)?
const isDelimiterGroup = (v: MathJson): v is MathJson[] =>
  isArray(v) && (head(v) === 'Delimiter' || head(v) === 'Delimiters');

// f(x, y) shape: lowercase-ish head applied to bare symbols. Canonical CE
// encodes application as ["name", arg1, ...]; non-canonical parses give
// InvisibleOperator("name", Delimiter(args...)) — both resolve to a Def.
function functionDefShape(
  node: MathJson,
): { name: string; params: string[] } | null {
  if (!isArray(node) || node.length < 2) return null;
  if (isSymbolString(node[0])) {
    const params = node.slice(1);
    // `D` is CE's derivative operator head (\dot{x}, \frac{dy}{dx}) —
    // `D(x,t) = rhs` is an ODE equation, never `def D(x,t)`.
    if (node[0] !== 'D' && params.every(isSymbolString))
      return { name: node[0], params };
  }
  if (head(node) === 'InvisibleOperator' && node.length === 3) {
    const [, fn, delim] = node;
    if (isSymbolString(fn) && isDelimiterGroup(delim)) {
      const params = delimiterArgs(delim);
      if (params.every(isSymbolString)) return { name: fn, params };
    }
  }
  return null;
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

// Set leaf names that Superplus/Superminus may decorate — S^{+}/S^{-}
// for a standard set maps to the positive/negative half.
const SET_LEAF = new Set([
  'RealNumbers',
  'RationalNumbers',
  'Integers',
  'Naturals',
  'ComplexNumbers',
  'AlgebraicNumbers',
  'ImaginaryNumbers',
  'PositiveNumbers',
  'PositiveIntegers',
  'NonNegativeIntegers',
  'Primes',
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

// The \min_{u} f / \sup_{u} f underscript: a bare variable, `x \in S`,
// or a relational bound on the variable (x >= 0, 0 <= x <= 1). Returns
// the variable plus an Interval/Set domain node when one is expressible.
function underVarDomain(under: MathJson): { v: MathJson; domain?: MathJson } {
  if (!isArray(under)) return { v: under };
  const uh = head(under);
  if (uh === 'Element' && under.length === 3)
    return { v: under[1], domain: under[2] };
  // \min_{i=lo}^{hi}: the underscript `i=lo` and overscript `hi` fold
  // into Power(Equal(i, lo), hi) — recover (v, [lo, hi]).
  if (
    uh === 'Power' &&
    isArray(under[1]) &&
    head(under[1]) === 'Equal' &&
    under[1].length === 3 &&
    isSymbolString(under[1][1])
  )
    return { v: under[1][1], domain: ['Interval', under[1][2], under[2]] };
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

// Unknown-head names codegen's CALL_RENAMES maps onto real SymPy
// functions — they still become `call` nodes, but without the "unknown
// head" note (mirrors codegen.ts's table).
const CALL_RENAMED = new Set([
  'Factorial2',
  'Erf',
  'Erfc',
  'Conjugate',
  'Re',
  'Im',
  'Arg',
  'Real',
  'Imaginary',
  'Argument',
  'Superstar',
  'Congruent',
  'nCk',
  'nCr',
  'nPr',
  'perm',
  'Pi',
  'Trace',
  'trace',
  // The lowercase names codegen's SP_BUILTIN_CALL table maps — mirrors
  // codegen.ts (kept in sync manually; \operatorname{erf}/solve/... get
  // here as call heads too).
  ...(
    'erf erfc erfi erfinv erfcinv Ei expint Si Ci Shi Chi li Li zeta ' +
    'lerchphi polylog digamma trigamma polygamma loggamma beta betainc ' +
    'lowergamma uppergamma LambertW besselj bessely besseli besselk ' +
    'hankel1 hankel2 jn yn airyai airybi airyaiprime airybiprime ' +
    'marcumq fresnels fresnelc hyper meijerg appellf1 legendre ' +
    'assoc_legendre hermite hermite_prob chebyshevt chebyshevu ' +
    'gegenbauer jacobi laguerre assoc_laguerre fibonacci lucas ' +
    'tribonacci bernoulli euler bell catalan harmonic genocchi ' +
    'partition primepi mobius totient reduced_totient divisor_sigma ' +
    'nextprime prevprime prime isprime factorint divisors ' +
    'divisor_count proper_divisor_count primefactors integer_nthroot ' +
    'cbrt gcdex trace ' +
    'legendre_symbol jacobi_symbol kronecker_symbol rf ff factorial2 ' +
    'subfactorial Piecewise ' +
    'sign ceiling conjugate arg re im ' +
    'gcd lcm binomial sqrt floor factorial ' +
    'solve solveset linsolve nonlinsolve simplify factor expand cancel ' +
    'collect apart together trigsimp expand_trig powsimp nsimplify ' +
    'radsimp ratsimp fraction limit series residue solve_linear'
  ).split(' '),
]);

// CE constant names — `i` beside one of these (or a number) is the
// imaginary unit, not a symbol (`e^{i\pi}`, `\pi i`); `xi` stays a symbol.
const CE_CONSTANTS = new Set([
  'Pi',
  'ExponentialE',
  'GoldenRatio',
  'EulerGamma',
  'CatalansConstant',
  'PositiveInfinity',
  'NegativeInfinity',
  'ImaginaryUnit',
]);

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
      return ['Assign', lhsN, rhsN];
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
    if (tuple) return mkAssign(['List', ...tuple]);
    const def = functionDefShape(lhs);
    if (def)
      return [
        'Def',
        def.name,
        ['List', ...def.params],
        normalizeExpr(rhs),
      ];
  }
  return ['Equal', ...node.slice(1).map(normalizeExpr)];
}

export function normalizeIR(json: MathJson | undefined): NormResult {
  const issues: Issue[] = [];
  // Identical repeated messages render as identical overlay rows — one
  // report covers every occurrence in the cell.
  const pushIssue = (severity: Issue['severity'], message: string) => {
    if (!issues.some((i) => i.severity === severity && i.message === message))
      issues.push(issue(severity, message));
  };
  if (json === undefined) return { ok: true, ir: undefined, issues };

  // Names declared callable by statements seen so far, in cell order —
  // `f(x) = …`, `f(x) := …`, `f: x \mapsto …`, `g: (x,y) \mapsto …`.
  // Calls to one of these aren't "unknown head" (the flag at the tail
  // consults this), and a forward reference still flags because the
  // declaration hasn't been scanned yet.
  const declaredFns = new Set<string>();

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
      if (UNEXPECTED_COMMAND.test(node)) {
        // Bare marker outside a Power/Subscript pair (the quoted source is
        // recovered there) — flag generically and keep it an Error node so
        // codegen drops the statement.
        pushIssue('error', 'incomplete or unsupported command');
        return ['Error', "'unexpected-command'"];
      }
      const text = TEXT_LITERAL.exec(node);
      if (text) {
        pushIssue('note', `text literal "${text[1]}" treated as a symbol`);
        return text[1];
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
          ? node[2][1].replace(/^'(.*)'$/s, '$1').trim()
          : '';
      pushIssue(
        'error',
        src === '\\int'
          ? 'integral sign with no integrand — type the integrand after ∫'
          : `incomplete or unsupported command${src ? ` "${src}"` : ''}`,
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

    if (h === 'Block') {
      return ['Block', ...node.slice(1).map((n) => normalize(n, true))];
    }

    // \left. f \right|_{a}^{b}: CE emits the evaluation bar as
    // Power(Subscript(EvaluateAt(f), a), b) — fold back into
    // ['EvaluateAt', f, lo, hi] so codegen can emit the substitution
    // difference. Single-bound forms keep the other slot 'Nothing'.
    if (
      h === 'Power' &&
      node.length === 3 &&
      isArray(node[1]) &&
      head(node[1]) === 'Subscript' &&
      (node[1] as MathJson[]).length === 3 &&
      isArray((node[1] as MathJson[])[1]) &&
      head((node[1] as MathJson[])[1]) === 'EvaluateAt'
    ) {
      const sub = node[1] as MathJson[];
      const at = sub[1] as MathJson[];
      return [
        'EvaluateAt',
        normalize(at[1], false),
        normalize(sub[2], false),
        normalize(node[2], false),
      ];
    }
    if (
      h === 'Subscript' &&
      node.length === 3 &&
      isArray(node[1]) &&
      head(node[1]) === 'EvaluateAt'
    ) {
      const at = node[1] as MathJson[];
      return [
        'EvaluateAt',
        normalize(at[1], false),
        normalize(node[2], false),
        'Nothing',
      ];
    }
    if (
      h === 'Power' &&
      node.length === 3 &&
      isArray(node[1]) &&
      head(node[1]) === 'EvaluateAt'
    ) {
      const at = node[1] as MathJson[];
      return [
        'EvaluateAt',
        normalize(at[1], false),
        'Nothing',
        normalize(node[2], false),
      ];
    }

    // CE emits a stray text-literal row marker ('..') as a trailing Matrix
    // arg — keeping it treated an extra row and produced mismatched
    // dimensions at runtime.
    if (h === 'Matrix') {
      return [
        'Matrix',
        ...node
          .slice(1)
          .filter(isArray)
          .map((n) => normalize(n, false)),
      ];
    }

    // `a'` / `x'` unapplied: a primed variable name, not sp.prime.
    if (h === 'Prime' && node.length >= 2 && isString(node[1])) {
      const ticks = typeof node[2] === 'number' ? node[2] : 1;
      return `${node[1]}${"'".repeat(ticks)}`;
    }

    // x_{-} / x_{+} — subscript sign; same composite-subscript naming as
    // x_{i,j} (otherwise the head flags 'unknown head "Subminus"').
    if ((h === 'Subminus' || h === 'Subplus') && node.length === 2) {
      const sign = h === 'Subminus' ? '-' : '+';
      return `${flattenSubscript(normalize(node[1], false))}_{${sign}}`;
    }

    // \min_{x} f / \max_{x} f: CE folds the underscript into the body as
    // InvisibleOperator('_', under, ...bodyFactors) — the factor list is
    // (underscript, body parts like `f` + `(x)`). Split it back out and
    // rebuild the body through the InvisibleOperator branch so `f(x)`
    // stays an application; codegen then sees (body, var, domain?)
    // rather than sp.Min(_ * x * f) with a garbage `_` symbol in it.
    if (
      (h === 'Min' ||
        h === 'Max' ||
        h === 'Infimum' ||
        h === 'Supremum') &&
      node.length === 2 &&
      isArray(node[1]) &&
      head(node[1]) === 'InvisibleOperator' &&
      node[1][1] === '_'
    ) {
      const io = node[1];
      const under = io[2];
      const rest = io.slice(3);
      const bodyN = normalize(
        rest.length === 0
          ? 'Nothing'
          : rest.length === 1
            ? rest[0]
            : (['InvisibleOperator', ...rest] as MathJson),
        false,
      );
      const { v, domain } = underVarDomain(under);
      // `_{i=lo}^{hi}` folds into Power(Equal(i, lo), hi) — emitted as a
      // real interval since symbolic sp.Range can't be minimized over.
      if (isArray(under) && head(under) === 'Power')
        pushIssue(
          'note',
          `${h} over an i=lo..hi range is emitted as a real interval`,
        );
      const head2 = h === 'Min' ? 'Minimum' : h === 'Max' ? 'Maximum' : h;
      return domain === undefined
        ? [head2, bodyN, normalize(v, false, false, true)]
        : [
            head2,
            bodyN,
            normalize(v, false, false, true),
            normalize(domain, false),
          ];
    }

    // \underbrace{x}_{a} parses as Subscript(UnderBrace(x), a) — the
    // label is an annotation, not a subscript of x: unwrap to the body.
    if (
      h === 'Subscript' &&
      node.length === 3 &&
      isArray(node[1]) &&
      (head(node[1]) === 'UnderBrace' || head(node[1]) === 'OverBrace')
    ) {
      return normalize(node[1][1], false);
    }
    // \overbrace{x}^{a} similarly parses as Power(OverBrace(x), a) —
    // `a` is a label, not an exponent (it emitted (x)**a before).
    if (
      h === 'Power' &&
      node.length === 3 &&
      isArray(node[1]) &&
      (head(node[1]) === 'UnderBrace' || head(node[1]) === 'OverBrace')
    ) {
      return normalize((node[1] as MathJson[])[1], false);
    }

    if (h === 'Equal') node = flattenEqual(node);

    // a < b <= c / x > y > z etc. — CE nests (sometimes right-, sometimes
    // left-) and mixes heads across a chain; codegen needs the flat
    // pairwise form since sp.Lt(Lt(a,b), c) raises at eval. Equal has its
    // own flattenEqual path above (statement-position `=` handling).
    if (REL_CHAIN.has(h)) {
      const { ops, args } = chainLinear(node);
      if (args.length > 2)
        return [
          'And',
          ...ops.map((op, i) =>
            normalize([op, args[i], args[i + 1]] as MathJson, false),
          ),
        ];
      node = [h, ...args];
    }

    // Declaration pre-scan: statement-level shapes that bind a callable
    // name (function def, mapsto declaration, `f := (x \mapsto …)`) —
    // recorded before the statement normalizes so the name is visible to
    // calls inside it (recursion) and in later statements.
    if (atStatement) {
      let decl: string | undefined;
      if (h === 'Equal' && isArray(node[1]))
        decl = functionDefShape(node[1])?.name;
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
      if (decl !== undefined) declaredFns.add(decl);
    }

    if (atStatement && h === 'Equal') {
      return normalizeStatementEqual(node, (n) => normalize(n, false));
    }

    // `g: (x,y) \mapsto body` — CE types a named function declaration
    // as Colon(name, Function(body, params...)). That's a def
    // like `f(x) = body`, not a Colon(...) call (which sympifies the
    // emitted lambda and dies).
    if (
      atStatement &&
      h === 'Colon' &&
      node.length === 3 &&
      isString(node[1]) &&
      isArray(node[2]) &&
      head(node[2]) === 'Function' &&
      node[2].slice(2).every((p) => paramName(p) !== undefined)
    ) {
      return [
        'Def',
        node[1],
        ['List', ...node[2].slice(2).map((p) => paramName(p) as string)],
        normalize(node[2][1], false),
      ];
    }

    // CE already emits Add/Negate instead of Subtract under canonical
    // parse; non-canonical keeps Subtract, so normalize the variant either
    // way. Nested Add (x - (3 - y)-style terms) is flattened to the
    // canonical multi-term shape.
    if (h === 'Subtract' && node.length === 3) {
      return [
        'Add',
        normalize(node[1], false),
        ['Negate', normalize(node[2], false)],
      ];
    }

    // Grouping-only wrappers CE mints from \boxed, \underbrace,
    // \overbrace — the semantics live in the wrapped expression, so
    // collapse to it. Annotated's second arg is a styling-attrs dict.
    if (h === 'UnderBrace' || h === 'OverBrace' || h === 'Annotated') {
      return normalize(node[1], false);
    }

    // Accent marks that denote distinct variables — \hat{x}, \vec{v},
    // \bar{z} (CE 'Mean'), \tilde{t} ('OverTilde') — become suffixed
    // symbol names (x_hat, v_vec, ...) rather than collapsing to the
    // unmarked name. \dot{x} isn't here: CE already lowers it to
    // D(x, t) before this pass.
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
      UnderBar: 'ubar', // \underline{x}
      OverRightArrow: 'vec', // \overrightarrow{v}
      OverLeftArrow: 'vec', // \overleftarrow{v}
    };
    if (ACCENT_SUFFIX[h] !== undefined && node.length >= 2) {
      return `${flattenSubscript(normalize(node[1], false))}_${ACCENT_SUFFIX[h]}`;
    }

    // \widehat{AB} / \arc{AB}: CE reads the decoration as the
    // arc/segment AB — a distinct marked symbol, not the product A·B.
    // A single arg is just a wide hat over one symbol.
    if (h === 'Arc' && node.length === 3) {
      return `${flattenSubscript(node[1])}${flattenSubscript(node[2])}_arc`;
    }
    if (h === 'Arc' && node.length === 2) {
      return `${flattenSubscript(node[1])}_hat`;
    }

    if (h === 'Add') {
      const args = node
        .slice(1)
        .map((n) => normalize(n, false))
        .flatMap((n): MathJson[] =>
          isArray(n) && head(n) === 'Add' ? n.slice(1) : [n],
        );
      return ['Add', ...args];
    }

    // InvisibleOperator is the non-canonical implicit-application head:
    // `x y` / `2x` are multiplication, `f(x)` is a call (the Delimiter
    // group marks the argument list). Calls reshape to ["name", ...args]
    // so they join the same unknown-head/call path canonical f(x) takes.
    if (h === 'InvisibleOperator' && node.length >= 3) {
      const last = node[node.length - 1];
      if (isDelimiterGroup(last)) {
        const callArgs = delimiterArgs(last).map((n) => normalize(n, false));
        const mid = node.slice(2, -1).map((n) => normalize(n, false));
        const fn = node[1];
        if (isString(fn) && mid.length === 0)
          return normalize([fn, ...callArgs], atStatement);
        return ['Apply', normalize(fn, false), ...mid, ...callArgs];
      }
      const args = node.slice(1).map((n) => normalize(n, false));
      // `\mathrm{trace}(M)`-style word ops fused to a matrix literal
      // arrive as InvisibleOperator(word, Matrix) — a method call, not
      // a product (the Delimiter-less pmatrix shape).
      if (args.length === 2) {
        const [w, m] =
          isString(args[0]) && MATRIX_WORD_OPS.has(args[0])
            ? ([args[0], args[1]] as const)
            : isString(args[1]) && MATRIX_WORD_OPS.has(args[1])
              ? ([args[1], args[0]] as const)
              : [undefined, undefined];
        if (
          w !== undefined &&
          isArray(m) &&
          head(m as MathJson) === 'Matrix'
        )
          return ['MatrixMethod', w, m as MathJson];
      }
      // `2i` — and `\pi i`, `e^{i\pi}` (i alongside a number or a named
      // constant) — mean the imaginary unit, matching the canonical
      // Complex-node output. `xi`/`ij` keep i as a symbol.
      const imaginary =
        args.includes('i') &&
        args.some((a) => typeof a === 'number' || CE_CONSTANTS.has(a as string));
      return [
        'Multiply',
        ...args.map((a) => (imaginary && a === 'i' ? 'ImaginaryUnit' : a)),
      ];
    }

    // Non-canonical \int/\sum/\prod take Tuple bounds (or a bare variable
    // for indefinite integrals); fold into the canonical Limits shape.
    if (h === 'Integrate' || h === 'Sum' || h === 'Product') {
      const body = normalize(node[1], false);
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
            normalize(lim[1] ?? 'Nothing', false, false, true),
            normalize(lim[2] ?? 'Nothing', false, true),
            normalize(lim[3] ?? 'Nothing', false, true),
          ],
        ];
      }
      if (isString(lim))
        return [h, body, ['Limits', lim, 'Nothing', 'Nothing']];
      return [h, body, ...node.slice(2).map((n) => normalize(n, false))];
    }

    // Lb/Lg are the non-canonical base-2/base-10 log heads.
    if (h === 'Lb') return ['Log', normalize(node[1], false), 2];
    if (h === 'Lg') return ['Log', normalize(node[1], false), 10];

    if (h === 'Sequence') {
      return ['List', ...node.slice(1).map((n) => normalize(n, false))];
    }

    // D(body, x): the variable is a name slot, not a value.
    if (h === 'D') {
      return [
        'D',
        normalize(node[1], false),
        ...node.slice(2).map((n) => normalize(n, false, false, true)),
      ];
    }

    if (h === 'Derivative' || h === 'PartialDerivative') {
      return [
        h,
        normalize(node[1], false, false, true),
        ...node.slice(2).map((n) => normalize(n, false)),
      ];
    }

    if (h === 'Apply') {
      return [
        'Apply',
        normalize(node[1], false, false, true),
        ...node.slice(2).map((n) => normalize(n, false)),
      ];
    }

    if (h === 'Subscript' && node.length === 3) {
      // Normalize the base first so decorative wrappers (UnderBrace,
      // Accent marks) resolve to their flattened name before the
      // subscript suffix is appended.
      return `${flattenSubscript(normalize(node[1], false))}_{${flattenSubscript(node[2])}}`;
    }

    if (h === 'Function') {
      // Lambda node: ["Function", body, param1, ...]. Unwrap a Block body
      // so Integrate/Limit can read it directly.
      const body = node[1];
      const unwrapped =
        isArray(body) && head(body) === 'Block' && body.length === 2
          ? body[1]
          : body;
      // `f: x \mapsto body` — the other half of the colon-declaration
      // shape: the signature slot is Typed(name, params...). At
      // statement level bind the name like `f(params) = body`; inside an
      // expression it stays an anonymous lambda. Read the raw slot (not
      // its normalize) so the signature doesn't emit Typed/literal
      // notes on the way to a shape that discards it.
      const sig = node[2];
      if (
        atStatement &&
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
            normalize(unwrapped, false),
          ];
      }
      const params = node
        .slice(2)
        .map((p) => normalize(p, false, false, true));
      return ['Function', normalize(unwrapped, false), ...params];
    }

    if (h === 'Limits') {
      // ["Limits", var, lo, hi] — Nothing bounds are legal (indefinite);
      // the var is a name slot, not a value.
      return [
        'Limits',
        normalize(node[1], false, false, true),
        normalize(node[2], false, true),
        normalize(node[3], false, true),
      ];
    }

    if (h === 'Delimiters' || h === 'Delimiter') {
      // Parenthesized group — CE wraps (a+b) as ["Delimiters", inner, ...];
      // keep the inner expression.
      return normalize(node[1], atStatement);
    }

    // `x := y := 5` — `:=>`-nested Assign isn't a value (codegen would
    // emit sp.Assign, which doesn't exist). Flatten to sequential
    // statements: y = 5, x = y.
    if (
      h === 'Assign' &&
      node.length === 3 &&
      isArray(node[2]) &&
      head(node[2]) === 'Assign'
    ) {
      return [
        'Block',
        normalize(node[2], atStatement),
        ['Assign', node[1], node[2][1]],
      ];
    }

    // S^{+} / S^{-} / S^{*}: the positive/negative/nonzero part of a
    // standard set — Intersect(S, half) / Complement(S, {0}). Anything
    // else keeps the 'call' stub (a decorated non-set has no set meaning).
    if (
      (h === 'Superplus' || h === 'Superminus') &&
      node.length === 2 &&
      isString(node[1]) &&
      SET_LEAF.has(node[1])
    ) {
      return [
        'Intersection',
        node[1],
        h === 'Superplus' ? 'PositiveNumbers' : 'NegativeNumbers',
      ];
    }
    if (
      h === 'Superstar' &&
      node.length === 2 &&
      isString(node[1]) &&
      SET_LEAF.has(node[1])
    ) {
      return ['SetMinus', node[1], ['Set', 0]];
    }
    // S^{\times}: the \times lands as an Error exponent — recover the
    // multiplicative-group reading (nonzero elements) for a set base.
    if (
      h === 'Power' &&
      node.length === 3 &&
      isString(node[1]) &&
      SET_LEAF.has(node[1]) &&
      isArray(node[2]) &&
      head(node[2]) === 'Error' &&
      isArray(node[2][2]) &&
      isString(node[2][2][1]) &&
      node[2][2][1] === "'\\times'"
    ) {
      return ['SetMinus', node[1], ['Set', 0]];
    }

    // `\text{if }x` (common in \begin{cases} conditions) fuses the
    // label into an InvisibleOperator application — the operator has no
    // sympy meaning; unwrap to the operand.
    if (h === 'InvisibleOperator' && node.length === 2)
      return normalize(node[1], atStatement, allowNothing);

    // M^{\mathrm{T}} / M^{\mathrm{H}}: CE wraps the superscript text as
    // a `__unit__` node — read it as transpose / adjoint rather than an
    // unknown-unit call.
    if (
      h === 'Power' &&
      node.length === 3 &&
      isArray(node[2]) &&
      head(node[2]) === '__unit__' &&
      isString(node[2][1])
    ) {
      const unit = node[2][1];
      if (unit === 'T') return ['Transpose', normalize(node[1], false)];
      if (unit === 'H' || unit === '\u2020')
        return ['ConjugateTranspose', normalize(node[1], false)];
      if (unit === 'C')
        return ['call', 'Conjugate', normalize(node[1], false)];
    }

    // `\mathrm{trace}(A)`, `\mathrm{rank}(A)`, ... on a matrix literal:
    // CE fuses the operator word and the matrix into a bare product.
    // Only fold when the operand is literally a Matrix — a word *
    // symbol stays a product (and `\mathrm{trace}(M)` on a symbol
    // reaches sp.trace through the call path).
    if (h === 'Multiply' && node.length === 3) {
      const [w, m] =
        isString(node[1]) && MATRIX_WORD_OPS.has(node[1])
          ? ([node[1], node[2]] as const)
          : isString(node[2]) && MATRIX_WORD_OPS.has(node[2])
            ? ([node[2], node[1]] as const)
            : [undefined, undefined];
      if (w !== undefined && isArray(m) && head(m) === 'Matrix')
        return ['MatrixMethod', w, normalize(m as MathJson, false)];
    }

    if (!KNOWN_HEADS.has(h)) {
      // Heads codegen remaps to real SymPy functions (sp.conjugate,
      // sp.factorial2, ...) aren't "unknown" — flagging them would warn
      // about a stub that never reaches the output. A worksheet-declared
      // name isn't unknown either — `f(3)` after `f(x) = …` calls the
      // def the cell already made.
      if (!CALL_RENAMED.has(h) && !declaredFns.has(h))
        pushIssue('note', `unknown head "${h}" — emitted as ${h}(...)`);
      return ['call', h, ...node.slice(1).map((n) => normalize(n, false))];
    }

    return [h, ...node.slice(1).map((n) => normalize(n, false))];
  };

  const ir = normalize(json, true);
  return { ok: !issues.some((i) => i.severity === 'error'), ir, issues };
}
