// Best-effort salvage for latex MathQuill's parser rejects outright.
// `mq.latex()` silently blanks the field on a parse failure, so a corrupted
// stored cell renders empty while its latex is still visible in the output
// column. `repairLatex` takes the stored string plus a `parses` oracle
// (e.g. set-then-read on a real field) and returns a nearby string the
// oracle accepts — the least destructive repair it can find — or null when
// nothing works. Callers decide what to do with null (e.g. a \text{ }
// fallback that shows the raw text).

// One salvage token: a \command, a backslash-escaped char, or a single char.
const TOKEN = /\\[a-zA-Z]+|\\.|./gs;

const hasContent = (s: string) => s.trim() !== '';

export function repairLatex(
  input: string,
  parses: (latex: string) => boolean,
  maxAttempts = 60,
): string | null {
  if (!hasContent(input)) return null;

  let attempts = 0;
  const tryParse = (s: string) => {
    attempts += 1;
    return attempts <= maxAttempts && hasContent(s) && parses(s);
  };

  // Unescaped { / } counts (an escaped \{ or \} is a brace bracket, not a
  // group delimiter).
  const unescaped = input.replace(/\\./g, '');
  const opens = (unescaped.match(/\{/g) ?? []).length;
  const closes = (unescaped.match(/\}/g) ?? []).length;

  // Close unbalanced groups: `x_{` -> `x_{ }`, `\frac{1}{` -> `\frac{1}{ }`.
  if (opens > closes && tryParse(input + '}'.repeat(opens - closes)))
    return input + '}'.repeat(opens - closes);

  // A raw `\\` at top level is only legal inside \displaylines: `x\\y` ->
  // `\displaylines{x\\ y}`.
  if (/\\\\/.test(input) && !/\\displaylines/.test(input)) {
    const wrapped = `\\displaylines{${input}}`;
    if (tryParse(wrapped)) return wrapped;
  }

  const tokens = input.match(TOKEN) ?? [];

  // Drop each single token once: catches mid-string garbage like a stray
  // `\right)`, an unescaped `)`, or a doubled bound marker while keeping the
  // most surrounding content.
  for (let i = 0; i < tokens.length && attempts < maxAttempts; i += 1) {
    const candidate = tokens.slice(0, i).join('') + tokens.slice(i + 1).join('');
    if (tryParse(candidate)) return candidate;
  }

  // Trim tokens off the end: dangling `^`, `_`, or a trailing unclosed
  // fragment (`x_{a}^` -> `x_{a}`).
  for (let n = tokens.length - 1; n > 0 && attempts < maxAttempts; n -= 1) {
    const candidate = tokens.slice(0, n).join('');
    if (tryParse(candidate)) return candidate;
  }

  return null;
}

// Render raw text inside a \text block — always parses once braces and
// backslashes are removed (they're the only chars that can break a \text
// arg). The result is lossy but never blank.
export function textFallback(latex: string): string {
  return `\\text{${latex.replace(/[{}\\]/g, ' ')}}`;
}
