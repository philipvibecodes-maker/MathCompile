// \iint and \antid are MathQuill's boundless insertion aliases for a
// single indefinite ∫ — the output view (and copies/parses fed by
// outputLatex) shows the canonical \int. The (?![a-zA-Z]) guard keeps
// longer command names like \iintx untouched.
const INT_ALIASES = /\\(?:antid|iint)(?![a-zA-Z])/g;
const canonicalInt = (s: string): string => s.replace(INT_ALIASES, '\\int');

// The latex output target shows a cell's LaTeX verbatim, except the
// \displaylines{} wrapper MathQuill adds to multi-line cells — that's an
// editing artifact, not part of the expression, so it is unwrapped here.
export function outputLatex(latex: string): string {
  const prefix = '\\displaylines{';
  if (!latex.startsWith(prefix)) return canonicalInt(latex);
  let depth = 0;
  for (let i = prefix.length - 1; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0)
        return i === latex.length - 1
          ? canonicalInt(latex.slice(prefix.length, i))
          : canonicalInt(latex);
    }
  }
  return canonicalInt(latex);
}

// Display form for the output column: unwrapped like outputLatex, with
// each \\ row separator kept and followed by a real line break. The space
// MQ writes after \\ is dropped so the next row starts flush left.
export function displayLatex(latex: string): string {
  return outputLatex(latex).replaceAll(/\\\\ */g, '\\\\\n');
}
