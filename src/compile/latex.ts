// \iint and \antid are MathQuill's boundless insertion aliases for a
// single indefinite ∫ — the output view (and copies/parses fed by
// outputLatex) shows the canonical \int. The (?![a-zA-Z]) guard keeps
// longer command names like \iintx untouched.
const INT_ALIASES = /\\(?:antid|iint)(?![a-zA-Z])/g;
const canonicalInt = (s: string): string => s.replace(INT_ALIASES, '\\int');

// \big| \Big| \bigg| \Bigg| are pure sizing — CE can't parse them, so the
// size word is dropped and the bare delimiter remains.
const BIG_DELIM = /\\(?:big|Big|bigg|Bigg)\s*(?=[()[\]|.\\])/g;
const stripBigDelims = (s: string): string => s.replace(BIG_DELIM, '');

// Read a `{...}` group starting at s[i] (after optional spaces);
// returns [innerText, indexAfterClosingBrace] or null.
function readBraceArg(s: string, i: number): [string, number] | null {
  while (s[i] === ' ') i++;
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}') {
      depth--;
      if (depth === 0) return [s.slice(i + 1, j), j + 1];
    }
  }
  return null;
}

// \underset{a}{b} means b with a underneath -> b_{a}; \overset{a}{b} ->
// b^{a}. CE parses neither command but handles the rewritten forms
// (\underset{x\to0}{\lim} -> \lim_{x\to0}).
const OVERUNDER = /\\(under|over)set(?![a-zA-Z])/;
function rewriteOverUnder(s: string): string {
  let out = '';
  let rest = s;
  for (;;) {
    const m = OVERUNDER.exec(rest);
    if (!m) break;
    const a = readBraceArg(rest, m.index + m[0].length);
    const b = a && readBraceArg(rest, a[1]);
    if (!a || !b) break;
    out += rest.slice(0, m.index);
    out += m[1] === 'under' ? `${b[0]}_{${a[0]}}` : `${b[0]}^{${a[0]}}`;
    rest = rest.slice(b[1]);
  }
  return out + rest;
}

// A lone bare `|` immediately followed by `_{...}`/`^{...}` bounds is
// textbook "evaluated at" notation (`f'|_{x=a}`); CE can't parse a bare
// delimiter, so wrap the expression in the \left. \right| form codegen
// already understands. Only a single unescaped | qualifies — `a|b` and
// `a\mid b` keep their own meaning/flag.
function rewriteEvalBar(s: string): string {
  // Bare pipes only: skip \| escapes and pipes that are the delimiter
  // argument of a command (\right|, \left|, \middle|, \vert| …).
  const pipes = [...s.matchAll(/\|/g)].filter((m) => {
    const before = s.slice(0, m.index);
    if (before.endsWith('\\')) return false;
    if (/\\[a-zA-Z]+$/.test(before)) return false;
    return true;
  });
  if (pipes.length !== 1) return s;
  const i = pipes[0].index;
  const rest = s.slice(i + 1);
  if (!/^\s*[_^]\{/.test(rest)) return s;
  return `\\left.${s.slice(0, i)}\\right|${rest}`;
}

const canonicalCmds = (s: string): string =>
  canonicalInt(stripBigDelims(rewriteEvalBar(stripBigDelims(rewriteOverUnder(s)))));

// The latex output target shows a cell's LaTeX verbatim, except the
// \displaylines{} wrapper MathQuill adds to multi-line cells — that's an
// editing artifact, not part of the expression, so it is unwrapped here.
export function outputLatex(latex: string): string {
  const prefix = '\\displaylines{';
  if (!latex.startsWith(prefix)) return canonicalCmds(latex);
  let depth = 0;
  for (let i = prefix.length - 1; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0)
        return i === latex.length - 1
          ? canonicalCmds(latex.slice(prefix.length, i))
          : canonicalCmds(latex);
    }
  }
  return canonicalCmds(latex);
}

// Display form for the output column: unwrapped like outputLatex, with
// each \\ row separator kept and followed by a real line break. The space
// MQ writes after \\ is dropped so the next row starts flush left.
export function displayLatex(latex: string): string {
  return outputLatex(latex).replaceAll(/\\\\ */g, '\\\\\n');
}
