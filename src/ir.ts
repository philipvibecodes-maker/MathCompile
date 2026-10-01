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
      return ce().parse(s).json as MathJson;
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
  'Exp', 'Ln', 'Log', 'Factorial', 'Gamma', 'Binomial', 'GCD', 'LCM', 'Mod',
  // trigonometric
  'Sin', 'Cos', 'Tan', 'Sec', 'Csc', 'Cot',
  'Sinh', 'Cosh', 'Tanh', 'Coth', 'Sech', 'Csch',
  'Arcsin', 'Arccos', 'Arctan', 'Arcsec', 'Arccsc', 'Arccot',
  'Arcsinh', 'Arccosh', 'Arctanh',
  // calculus
  'D', 'Derivative', 'Apply', 'Integrate', 'Sum', 'Product', 'Limit',
  // linear algebra
  'Matrix', 'Determinant', 'Transpose', 'Inverse',
  // relations / logic / piecewise
  'Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual',
  'And', 'Or', 'Not', 'Which', 'Piecewise',
  // statement-level IR
  'Assign', 'Def', 'Block', 'Function',
  // structural helpers
  'Limits', 'Tuple', 'List', 'Subscript', 'Delimiters', 'Error',
]);

// CE string literals arrive as "'text'" (e.g. \text{...}); unwrap to the
// inner name so it can be treated as a symbol with a note.
const TEXT_LITERAL = /^'(.*)'$/;

function issue(severity: Issue['severity'], message: string): Issue {
  return { severity, message };
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
  }
  return '?';
}

// Is this node a plain symbol usable as an assignment target?
const isSymbolString = (v: MathJson): v is string =>
  isString(v) && v !== '' && !v.startsWith("'");

// f(x, y) shape: lowercase-ish head applied to bare symbols. CE encodes
// function application as ["name", arg1, ...].
function functionDefShape(
  node: MathJson,
): { name: string; params: string[] } | null {
  if (!isArray(node) || node.length < 2) return null;
  const name = node[0];
  if (!isSymbolString(name)) return null;
  const params = node.slice(1);
  if (params.every(isSymbolString)) return { name, params };
  return null;
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
  ): MathJson => {
    if (isString(node)) {
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
          issues.push(issue('error', 'missing argument in expression'));
        return node;
      }
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

    if (h === 'Error') {
      issues.push(
        issue('error', `unparseable input (${isString(node[1]) ? node[1] : 'error'})`),
      );
      return node;
    }

    if (h === 'Block') {
      return ['Block', ...node.slice(1).map((n) => normalize(n, true))];
    }

    if (atStatement && h === 'Equal') {
      return normalizeStatementEqual(node, (n) => normalize(n, false));
    }

    // CE already emits Add/Negate instead of Subtract, but normalize the
    // variant anyway so both forms are safe to feed in.
    if (h === 'Subtract' && node.length === 3) {
      return [
        'Add',
        normalize(node[1], false),
        ['Negate', normalize(node[2], false)],
      ];
    }

    if (h === 'Subscript' && node.length === 3) {
      return `${flattenSubscript(node[1])}_{${flattenSubscript(node[2])}}`;
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
        ...node.slice(2).map((p) => normalize(p, false)),
      ];
    }

    if (h === 'Limits') {
      // ["Limits", var, lo, hi] — Nothing bounds are legal (indefinite).
      return [
        'Limits',
        normalize(node[1], false),
        normalize(node[2], false, true),
        normalize(node[3], false, true),
      ];
    }

    if (h === 'Delimiters') {
      // Parenthesized group — CE wraps (a+b) as ["Delimiters", inner, ...];
      // keep the inner expression.
      return normalize(node[1], atStatement);
    }

    if (!KNOWN_HEADS.has(h)) {
      issues.push(
        issue('note', `unknown head "${h}" — emitted as sp.${h}(...)`),
      );
      return ['call', h, ...node.slice(1).map((n) => normalize(n, false))];
    }

    return [h, ...node.slice(1).map((n) => normalize(n, false))];
  };

  const ir = normalize(json, true);
  return { ok: !issues.some((i) => i.severity === 'error'), ir, issues };
}
