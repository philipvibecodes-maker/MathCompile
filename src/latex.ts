// The latex output target shows a cell's LaTeX verbatim, except the
// \displaylines{} wrapper MathQuill adds to multi-line cells — that's an
// editing artifact, not part of the expression, so it is unwrapped here.
export function outputLatex(latex: string): string {
  const prefix = '\\displaylines{';
  if (!latex.startsWith(prefix)) return latex;
  let depth = 0;
  for (let i = prefix.length - 1; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0)
        return i === latex.length - 1 ? latex.slice(prefix.length, i) : latex;
    }
  }
  return latex;
}

// Display form for the output column: unwrapped like outputLatex, with
// row separators (\\) shown as real line breaks.
export function displayLatex(latex: string): string {
  return outputLatex(latex).replaceAll('\\\\', '\n');
}
