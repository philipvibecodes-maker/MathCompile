import { ComputeEngine } from '@cortex-js/compute-engine';
import { applyLatexRules, outputLatex, PRE_PARSE_RULES } from '../latex';
import { pythonSourceNode } from './normalized';
import { delimiterArgs, head, isArray, isDelimiterGroup, isString, isSymbolString } from './shapes';
import type { MathJson } from './types';

let engine: ComputeEngine | undefined;
const ce = (): ComputeEngine => (engine ??= new ComputeEngine());

// `\python{ ... }` bodies are raw source, not math latex: braces, `\` and
// `\\` inside them are code, and a literal newline is content. They're
// extracted to opaque `\mcpsnippet{i}` markers here — before outputLatex
// rules or the \\ splitter could mangle the body — and parseCellLatex
// restores them as PythonSource nodes. Escape rules mirror the vendored
// serializer: `\{`, `\}` and `\\` inside the body are the literal chars.
const PYTHON_SNIPPET_MARK = /^\\mcpsnippet\{(\d+)\}$/;

// `\text{solve}` / `\text{dsolve}` / `\text{pdesolve}` statement markers
// (with the `\text{ode}` / `\text{pde}` shorthands). The word is stripped
// from the statement string before CE sees it — the marker isn't
// recoverable from the parse anyway (a text literal before a `\dot` or
// `\frac` makes CE's raw parse silently drop the tail of the statement:
// `\text{dsolve} \dot{x}+x=0` arrives as Sequence('dsolve', D(x,t)) and
// `+x=0` is gone). The stripped remainder parses normally and wraps in a
// ['SolveMark', kind, node] that normalize() lowers into the
// Solve/DSolve/PDESolve heads.
const SOLVE_STMT_MARK =
  /^\s*\\text\s*\{\s*(solve|dsolve|pdesolve|ode|pde)\s*\}\s*/;
export function extractPythonBlocks(latex: string): {
  latex: string;
  snippets: string[];
} {
  if (latex.indexOf('\\python') === -1) return { latex, snippets: [] };
  const snippets: string[] = [];
  let out = '';
  let i = 0;
  while (i < latex.length) {
    if (latex.startsWith('\\python', i)) {
      let j = i + '\\python'.length;
      while (latex[j] === ' ' || latex[j] === '\t') j++;
      if (latex[j] === '{') {
        let depth = 1;
        let k = j + 1;
        let body = '';
        while (k < latex.length && depth > 0) {
          const c = latex[k];
          if (c === '\\') {
            body += c;
            body += latex[k + 1] ?? '';
            k += 2;
            continue;
          }
          if (c === '{') depth++;
          else if (c === '}') {
            depth--;
            if (depth === 0) {
              k++;
              break;
            }
          }
          body += c;
          k++;
        }
        // depth > 0 at stream end = unclosed brace — the rest of the
        // latex is taken as the body (the vendored parser does the same).
        snippets.push(body.replace(/\\([{}\\])/g, '$1'));
        out += `\\mcpsnippet{${snippets.length - 1}}`;
        i = k;
        continue;
      }
    }
    out += latex[i];
    i++;
  }
  return { latex: out, snippets };
}

// A cell's LaTeX may hold multiple statements: MathQuill wraps multi-line
// content as \displaylines{a \\ b \\ c}. CE cannot parse that wrapper (it
// surfaces as Error/Tuple garbage), so rows are split here — on \\ at
// brace depth 0 — before parsing. \\ inside a \begin{...}...\end{...}
// environment is a matrix/cases row separator, not a statement break, so
// environment depth is tracked alongside brace depth.
export function latexToStatementStrings(latex: string): string[] {
  // The pre-parse surgery lives in latex.ts as named rules — composed
  // by name here (limits-hints, thin-space, partial-subscript). Python
  // source is lifted out first so no rule ever sees inside it.
  const inner = applyLatexRules(
    outputLatex(extractPythonBlocks(latex).latex),
    PRE_PARSE_RULES,
  );
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

// `\text{for}`/`operatorname{for}`-style comprehensions (`2x \text{ for }
// x \in S`) parse to the same ForAll head as `\forall` — the IR cannot
// tell them apart, so this is decided here where the latex is still
// known. A statement containing a for-token has every ForAll node
// rewritten to CE's own Comprehension head (expr-first arg order),
// which codegen lowers to sp.imageset — the set-building reading —
// while `\forall` keeps its head and emits a predicate.
const TEXT_FOR =
  /\\(?:operatorname|math[a-z]*|text[a-z]*)\s*\{?\s*for(?![a-zA-Z])(?!\s+all\b)/;
const forToComprehension = (n: MathJson): MathJson => {
  if (!isArray(n)) return n;
  const kids = n.slice(1).map(forToComprehension);
  return head(n) === 'ForAll' && kids.length === 2
    ? (['Comprehension', kids[1], kids[0]] as MathJson)
    : ([head(n), ...kids] as MathJson);
};

// `name = (a,b)` / `name = [a,b]` binds an interval, not a list — CE
// only mints an Interval node in membership context (`x ∈ (1,2)`), so
// a 2-element List binding is rewritten here, `(`/`)` endpoints
// marking open. Longer lists (`B=[1,2,3]`) stay List — a real sequence.
const intervalBind = (s: string, j: MathJson): MathJson => {
  if (
    !isArray(j) ||
    (head(j) !== 'Assign' && head(j) !== 'Equal') ||
    // A structured lhs (`(x,y) = (1,2)`) is tuple unpacking, not a bind.
    !isString(j[1])
  )
    return j;
  const rhs = j[2];
  if (!isArray(rhs)) return j;
  let e1: MathJson | undefined;
  let e2: MathJson | undefined;
  let lb = '';
  let rb = '';
  const seq = isArray(rhs[1]) && head(rhs[1]) === 'Sequence' ? rhs[1] : null;
  if (head(rhs) === 'Delimiter' && seq && seq.length === 3 && isString(rhs[2])) {
    // `Delimiter(Sequence(a,b), '(,)')` — the IR itself records the
    // brackets for paren-delimited pairs.
    [e1, e2] = [seq[1], seq[2]];
    const d = rhs[2].replaceAll("'", '').replaceAll(' ', '');
    [lb, rb] = [d[0] ?? '', d[d.length - 1] ?? ''];
  } else if (head(rhs) === 'List' && rhs.length === 3) {
    // `[a,b]` arrives as a bare List — the brackets live in the latex.
    const eq = s.indexOf('=');
    if (eq < 0) return j;
    const tail = s.slice(eq + 1);
    const l = tail.search(/[(\[]/);
    const r = tail.search(/[)\]]\s*$/);
    if (l < 0 || r < 0) return j;
    [e1, e2, lb, rb] = [rhs[1], rhs[2], tail[l], tail[r]];
  } else return j;
  if (!'(['.includes(lb) || !')]'.includes(rb)) return j;
  const lo = lb === '(' ? (['Open', e1] as MathJson) : e1;
  const hi = rb === ')' ? (['Open', e2] as MathJson) : e2;
  return [head(j), j[1], ['Interval', lo, hi]] as MathJson;
};

// `\bigcup`/`\bigcap` reach CE as the `\text{mc-*}` marker the
// 'big-set-ops' latex rule plants beside a \sum/\prod — fold the pair
// into a BigUnion/BigIntersection node so operator-bounds and codegen
// see the real op.
const bigSetOps = (node: MathJson): MathJson => {
  if (!isArray(node)) return node;
  const h = head(node);
  const args = node.slice(1).map(bigSetOps) as MathJson[];
  if (h !== 'InvisibleOperator' && h !== 'Multiply' && h !== 'CircleTimes')
    return [h, ...args] as MathJson;
  const markerAt = args.findIndex(
    (a) => a === "'mc-bigunion'" || a === "'mc-bigintersect'",
  );
  if (markerAt < 0) return [h, ...args];
  const union = args[markerAt] === "'mc-bigunion'";
  const opHead = union ? 'Sum' : 'Product';
  const opAt = args.findIndex((a) => isArray(a) && head(a) === opHead);
  const big: MathJson | undefined =
    opAt >= 0
      ? ([
          union ? 'BigUnion' : 'BigIntersection',
          ...(args[opAt] as MathJson[]).slice(1),
        ] as MathJson)
      : undefined;
  const out: MathJson[] = [];
  args.forEach((a, i) => {
    if (i === markerAt) {
      if (big) out.push(big);
      return;
    }
    if (i === opAt) return;
    out.push(a);
  });
  return out.length === 1 ? (out[0] as MathJson) : ([h, ...out] as MathJson);
};

// Parse a cell's LaTeX into raw MathJSON. Multiple statements become a
// `["Block", ...]` node so downstream code sees one tree per cell. Parse
// failures degrade to an Error node — the pipeline reports, never throws.
export function parseCellLatex(latex: string): MathJson | undefined {
  const { latex: stripped, snippets } = extractPythonBlocks(latex);
  const statements = latexToStatementStrings(stripped);
  if (statements.length === 0) return undefined;
  // One statement string -> its raw MathJSON node, with the post-parse
  // rewrites the latex known only here applies.
  const parseStatement = (s: string): MathJson => {
    let j: MathJson;
    try {
      // `form: 'raw'` skips CE canonicalization so the user's term order
      // survives to codegen (a * 2 stays Multiply(a, 2), not sorted).
      // \antid (MathQuill's boundless insertion alias for \int)
      // already reads as \int here — outputLatex canonicalizes it in
      // latexToStatementStrings, so CE sees an ordinary Integrate node.
      // \iint is not aliased — CE parses it natively to Integrate.
      j = ce().parse(s, { form: 'raw' }).json as MathJson;
    } catch {
      return ['Error', `'parse-failed'`] as MathJson;
    }
    const jj = bigSetOps(j);
    return bracketIntervals(
      intervalBind(s, TEXT_FOR.test(s) ? forToComprehension(jj) : jj),
    );
  };
  const parsed = statements
    .map((s) => {
      // A \python{...} statement survives the latex path as a marker —
      // emit it verbatim as a PythonSource statement carrying the raw
      // code string. An all-whitespace body drops to nothing.
      const mark = PYTHON_SNIPPET_MARK.exec(s);
      if (mark) {
        const code = snippets[Number(mark[1])];
        return code.trim() === ''
          ? undefined
          : pythonSourceNode(code);
      }
      // A leading plot marker before braces makes CE interpret the set
      // as a conditional application (When/Piecewise). Parse its operand
      // separately, then restore the marker for statement normalization.
      const setPlot = /^\s*\\text\s*\{\s*plot\s*\}\s*(?=(?:\\left\s*)?\\\{)/.exec(s);
      if (setPlot) return ['InvisibleOperator', "'plot'", parseStatement(s.slice(setPlot[0].length))];
      // `\text{solve}`/`\text{dsolve}`/`\text{pdesolve}` — strip the
      // marker word and wrap the rest so normalize() can lower it to
      // the Solve/DSolve/PDESolve heads.
      const solveMark = SOLVE_STMT_MARK.exec(s);
      if (solveMark) {
        const rest = s.slice(solveMark[0].length).trim();
        return [
          'SolveMark',
          solveMark[1],
          rest === '' ? undefined : parseStatement(rest),
        ] as MathJson;
      }
      return parseStatement(s);
    })
    .filter((n): n is MathJson => n !== undefined);
  if (parsed.length === 0) return undefined;
  // A single statement can itself parse to a Block (`x² \text{ where }
  // x>0` — CE parks the condition first). Tag those so real `\\` rows
  // keep written order while where-blocks still flip body-first.
  const tagged = parsed.map((p) =>
    isArray(p) && head(p) === 'Block'
      ? (['WhereBlock', ...p.slice(1)] as MathJson)
      : p,
  );
  return tagged.length === 1 ? tagged[0] : (['Block', ...tagged] as MathJson);
}


const bracketIntervals = (n: MathJson): MathJson => {
  if (!isArray(n)) return n;
  const h = head(n);
  if (h === 'Matrix') return n;
  if (h === 'List' && n.length === 3)
    return ['Interval', bracketIntervals(n[1]), bracketIntervals(n[2])];
  const lhs = n[1];
  const rhs = n[2];
  // Destructure target like `[x,y]` / `(x,y)` — the same member check
  // normalize's Equal fold uses to pick tuple unpacking.
  const members = isDelimiterGroup(lhs)
    ? delimiterArgs(lhs)
    : isArray(lhs) && (head(lhs) === 'List' || head(lhs) === 'Sequence')
      ? lhs.slice(1)
      : null;
  if (
    (h === 'Equal' || h === 'Assign') &&
    Array.isArray(members) &&
    members.length > 1 &&
    members.every(isSymbolString)
  ) {
    // Keep the rhs List's own head so `x, y = [1, 2]` stays unpackable
    // (Interval isn't iterable), but still rewrite lists inside it.
    const walked =
      isArray(rhs) && head(rhs) === 'List' && rhs.length === 3
        ? ([
            'List',
            bracketIntervals(rhs[1]),
            bracketIntervals(rhs[2]),
          ] as MathJson)
        : bracketIntervals(rhs);
    return [h, lhs, walked] as MathJson;
  }
  return [h, ...n.slice(1).map(bracketIntervals)] as MathJson;
};
