// Minimal Python tokenizer for the calculator "Show code" block — splits
// source into typed spans the component colors via .tok-* classes. The
// alternative is a runtime highlighter dependency; five token classes are
// all the SymPy code we emit needs.

export interface PyToken {
  text: string;
  cls?: 'str' | 'comment' | 'kw' | 'num' | 'call';
}

// Triple-quoted strings come first — docstrings span lines and must not
// get keyword/call coloring on their contents.
const TOKEN_RE =
  /("""[\s\S]*?"""|'''[\s\S]*?'''|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")|(#[^\n]*)|(\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|try|while|with|yield|True|False)\b)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_]\w*(?=\s*\())/g;

const CLS_BY_GROUP = ['str', 'comment', 'kw', 'num', 'call'] as const;

export function highlightPython(code: string): PyToken[] {
  const tokens: PyToken[] = [];
  let last = 0;
  for (const m of code.matchAll(TOKEN_RE)) {
    if (m.index > last) tokens.push({ text: code.slice(last, m.index) });
    const cls = CLS_BY_GROUP[m.slice(1).findIndex((g) => g !== undefined)];
    tokens.push({ text: m[0], cls });
    last = m.index + m[0].length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last) });
  return tokens;
}
