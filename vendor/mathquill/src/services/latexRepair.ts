// Salvage ladder for latex the math parser rejects outright. Used by
// writeLatex so pasting a corrupted latex fragment inserts a repaired
// approximation instead of silently doing nothing. Kept in sync with
// src/editor/latex-repair.ts (the app-side copy used for hydration repair).

function repairLatex(
  input: string,
  parses: (candidate: string) => boolean,
  maxAttempts: number
): string | null {
  if (input.trim() === '') return null;

  var attempts = 0;
  var tries = function (candidate: string): boolean {
    if (attempts >= maxAttempts) return false;
    attempts += 1;
    return parses(candidate);
  };

  // 1. an unclosed trailing group closes happily: `x_{` -> `x_{ }`
  var unescaped = input.replace(/\\./g, '');
  var opens = 0;
  var closes = 0;
  for (var ci = 0; ci < unescaped.length; ci += 1) {
    if (unescaped.charAt(ci) === '{') opens += 1;
    else if (unescaped.charAt(ci) === '}') closes += 1;
  }
  if (opens > closes) {
    var balanced = input;
    for (var bi = 0; bi < opens - closes; bi += 1) balanced += '}';
    if (tries(balanced)) return balanced;
  }

  // 2. a raw `\\` row break only parses inside an environment
  if (/\\\\/.test(input) && input.indexOf('\\displaylines') === -1) {
    var wrapped = '\\displaylines{' + input + '}';
    if (tries(wrapped)) return wrapped;
  }

  var tokens = input.match(/\\[a-zA-Z]+|\\.|./gs) || [];

  // 3. one stray token mid-string (`x_{a}}y` -> `x_{a}y`)
  for (var i = 0; i < tokens.length; i += 1) {
    var candidate = tokens.slice(0, i).join('') + tokens.slice(i + 1).join('');
    if (tries(candidate)) return candidate;
  }

  // 4. right-trim: `x_{a}^` -> `x_{a}`, `x_{a}\right)` -> `x_{a}`
  for (var r = tokens.length - 1; r > 0; r -= 1) {
    var trimmed = tokens.slice(0, r).join('');
    if (trimmed.trim() === '') return null;
    if (tries(trimmed)) return trimmed;
  }

  return null;
}

// Last resort: show the raw text rather than a blank field. Braces and
// backslashes are stripped since they can't safely appear inside \text.
function latexTextFallback(latex: string): string {
  return '\\text{' + latex.replace(/[{}\\]/g, ' ') + '}';
}
