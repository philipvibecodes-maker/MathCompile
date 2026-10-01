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
  'Matrix', 'Determinant', 'Transpose', 'Inverse',
  // relations / logic / piecewise
  'Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual',
  'NotLess', 'NotGreater', 'NotLessEqual', 'NotGreaterEqual', 'NotDivides',
  'Implies', 'Equivalent', 'IdenticallyEqual', 'Degrees',
  'And', 'Or', 'Not', 'Which', 'Piecewise',
  // statement-level IR
  'Assign', 'Def', 'Block', 'Function',
  // structural helpers
  'Limits', 'Tuple', 'List', 'Subscript', 'Delimiters', 'Error',
]);

// CE string literals arrive as "'text'" (e.g. \text{...}); unwrap to the
// inner name so it can be treated as a symbol with a note.
const TEXT_LITERAL = /^'(.*)'$/;

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
    if (params.every(isSymbolString)) return { name: node[0], params };
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
    if (isSymbolString(lhs)) return ['Assign', lhs, normalizeExpr(rhs)];
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
  if (json === undefined) return { ok: true, ir: undefined, issues };

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
        issues.push(issue('error', 'incomplete or unsupported command'));
        return ['Error', "'unexpected-command'"];
      }
      const text = TEXT_LITERAL.exec(node);
      if (text) {
        issues.push(
          issue('note', `text literal "${text[1]}" treated as a symbol`),
        );
        return text[1];
      }
      if (node === 'Nothing') {
        // 'Nothing' is CE's empty-argument marker. Inside Limits bounds it
        // means an indefinite operator (\int f dx) — legitimate input, not
        // a hole — so it is only an error elsewhere.
        if (!allowNothing)
          issues.push(issue('error', 'empty slot — fill it in or delete it'));
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
        issues.push(issue('note', `text literal "${inner}" treated as a symbol`));
        return inner;
      }
      return node;
    }

    const h = head(node);
    if (h === undefined) {
      issues.push(issue('error', 'malformed node without a head'));
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
      issues.push(issue('error', describeError(node)));
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
      issues.push(
        issue(
          'error',
          src === '\\int'
            ? 'integral sign with no integrand — type the integrand after ∫'
            : `incomplete or unsupported command${src ? ` "${src}"` : ''}`,
        ),
      );
      return ['Error', "'unexpected-command'"];
    }

    // A LatexString rides inside CE error shapes as the quoted source
    // fragment — anything reaching normal normalization is a fragment of
    // a broken expression; flag rather than emit a LatexString symbol.
    if (h === 'LatexString') {
      issues.push(issue('error', 'incomplete or unsupported command'));
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

    if (h === 'Equal') node = flattenEqual(node);

    if (atStatement && h === 'Equal') {
      return normalizeStatementEqual(node, (n) => normalize(n, false));
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
    // \bar{z}, \dot{x}, \tilde{t} — become suffixed symbol names
    // (x_hat, v_vec, ...) rather than collapsing to the unmarked name.
    const ACCENT_SUFFIX: Record<string, string> = {
      OverHat: 'hat',
      OverVector: 'vec',
      OverBar: 'bar',
      Overline: 'bar',
      Overarc: 'arc',
      OverDot: 'dot',
      OverDDot: 'ddot',
      Overtilde: 'tilde',
    };
    if (ACCENT_SUFFIX[h] !== undefined && node.length >= 2) {
      return `${flattenSubscript(node[1])}_${ACCENT_SUFFIX[h]}`;
    }

    // \widehat{AB}: CE reads the decoration as the arc/segment AB;
    // a single arg is just a wide hat over one symbol.
    if (h === 'Arc' && node.length === 3) {
      return ['Multiply', normalize(node[1], false), normalize(node[2], false)];
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
      // `2i` (number times bare i) means the imaginary unit — matches the
      // canonical Complex-node output. `xi`/`ij` keep i as a symbol.
      const imaginary =
        args.includes('i') && args.some((a) => typeof a === 'number');
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
      return [
        'Function',
        normalize(unwrapped, false),
        ...node.slice(2).map((p) => normalize(p, false, false, true)),
      ];
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

    if (!KNOWN_HEADS.has(h)) {
      issues.push(issue('note', `unknown head "${h}" — emitted as ${h}(...)`));
      return ['call', h, ...node.slice(1).map((n) => normalize(n, false))];
    }

    return [h, ...node.slice(1).map((n) => normalize(n, false))];
  };

  const ir = normalize(json, true);
  return { ok: !issues.some((i) => i.severity === 'error'), ir, issues };
}
