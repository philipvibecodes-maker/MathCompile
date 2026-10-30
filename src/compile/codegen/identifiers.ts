import { NOTATION, SP_BUILTIN_CALL } from '../notation';
import { CALC_RUNTIME_PY } from '../calc-runtime';

const PY_KEYWORDS = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from',
  'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not',
  'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  'None', 'True', 'False',
]);

// User names must not overwrite names used by generated expressions or by
// the unqualified calculator runtime. Keep builtin targets out of pyIdent().
const RESERVED_IDENTS = new Set([
  'sp', '_mc_plot', 'clean_and_simplify', 'N', 'plot_vector_field',
  ...SP_BUILTIN_CALL,
  // Structural emitters (notation-driven targets are added below).
  'Abs', 'Adjoint', 'And', 'Complement', 'ConditionSet', 'Contains',
  'Derivative', 'Determinant', 'Eq', 'Equivalent', 'FiniteSet', 'Function',
  'Ge', 'Gt', 'HadamardProduct', 'I', 'ImageSet', 'Implies', 'Intersection',
  'Interval', 'KroneckerDelta', 'KroneckerProduct', 'Lambda', 'Le', 'Lt',
  'minimum', 'maximum', 'Min', 'Max', 'Sum', 'Product', 'dsolve', 'pdsolve',
  'Matrix', 'MatrixSymbol', 'Mod', 'Ne', 'Not', 'Or', 'Piecewise', 'Pow',
  'Q', 'Range', 'Rational', 'S', 'Symbol', 'SymmetricDifference', 'Trace',
  'Transpose', 'Tuple', 'Union', 'assuming', 'conjugate', 'diag', 'diff',
  'eye', 'factorial', 'false', 'imageset', 'integrate', 'kronecker_product',
  'lambdify', 'limit', 'log', 'oo', 'pi', 'plot', 'plot3d',
  'plot3d_parametric_line', 'plot3d_parametric_surface', 'plot_parametric',
  'root', 'solve', 'solveset', 'sqrt', 'symbols', 'totient', 'true', 'zeta',
  // Python globals used by emitted code and runtime cleanup.
  'range', 'len', 'list', 'tuple', 'dict', 'set', 'str', 'int', 'float',
  'bool', 'type', 'isinstance', 'getattr', 'hasattr', 'sorted', 'any', 'all',
  'enumerate', 'zip', 'min', 'max', 'abs', 'sum', 'Exception',
  ...NOTATION.flatMap((n) => Array.from((n.leafSet ?? '').matchAll(/\{sp\}([A-Za-z_]\w*)/g), (m) => m[1])),
  ...NOTATION.flatMap((n) =>
    [n.sympy, n.callSympy, n.inverse, n.constant].flatMap((target) =>
      target?.match(/^-?([A-Za-z_]\w*)/)?.[1] ?? [])),
  ...Array.from(CALC_RUNTIME_PY.matchAll(/\bsp\.([A-Za-z_]\w*)/g), (m) => m[1]),
  ...Array.from(CALC_RUNTIME_PY.matchAll(/\b(?:def|class) ([A-Za-z_]\w*)/g), (m) => m[1]),
]);

// CE tags font-styled letters with a per-piece suffix: `\mathrm{a}` ->
// `a_upright`, `\mathbf{x}` -> `x_bold`, `a_{\mathrm{i}}` -> `a_i_upright`.
// Rewrite each tagged piece to the latex command's prefix so the python
// identifier reads like what was typed — `mathrm_a`, `x_mathrm_i`,
// `mathrm_a_mathrm_i` for `\mathrm{a}_{\mathrm{i}}`.
const FONT_TAG_CMD: Record<string, string> = {
  upright: 'mathrm',
  italic: 'mathit',
  bold: 'mathbf',
  calligraphic: 'mathcal',
  script: 'mathscr',
  sansserif: 'mathsf',
  monospace: 'mathtt',
  fraktur: 'mathfrak',
};
const FONT_TAG =
  /(^|_)([A-Za-z]+)_(upright|italic|bold|calligraphic|script|sansserif|monospace|fraktur)(?=_|$)/g;

// Preserve meaningful punctuation instead of erasing it: x_{-} and
// x_{+} should explain themselves in the generated Python. Braces are
// LaTeX grouping; other delimiters can be part of a compound subscript.
const IDENT_SYMBOLS = new Map(Object.entries({
  '+': 'plus', '-': 'minus', '−': 'minus', '±': 'plusminus', '∓': 'minusplus',
  '*': 'times', '×': 'times', '/': 'over', '÷': 'over', '^': 'pow',
  '=': 'eq', '<': 'lt', '>': 'gt', '≤': 'le', '≥': 'ge', '≠': 'ne',
  ',': 'comma', '.': 'dot', '·': 'dot', ':': 'colon', ';': 'semicolon',
  '(': 'lparen', ')': 'rparen', '[': 'lbracket', ']': 'rbracket',
  '|': 'bar', '!': 'bang', '?': 'question', '%': 'percent',
  '&': 'and', '~': 'tilde', '\\': 'backslash', '∞': 'infinity',
  '′': 'prime', '″': 'prime_prime',
}));

// Mangle an arbitrary symbol name (e.g. `a_{n+1}`) into a valid python
// identifier that consistently refers to that symbol.
export function pythonName(name: string): string {
  name = name.replace(
    FONT_TAG,
    (_, lead, piece, tag) => `${lead}${FONT_TAG_CMD[tag]}_${piece}`,
  );
  if (/^[A-Za-z_]\w*$/.test(name) && !PY_KEYWORDS.has(name)) return name;
  // Keep the existing x' -> x_prime spelling. Unknown characters get a
  // code-point token rather than disappearing (including astral Unicode).
  let out = name
    .replace(/[{}]/g, '')
    .replaceAll("'", '_prime')
    .replace(/[^A-Za-z0-9_]/gu, (char) => {
      if (/\s/u.test(char)) return '_';
      const token = IDENT_SYMBOLS.get(char) ?? `u${char.codePointAt(0)!.toString(16).padStart(4, '0')}`;
      return `_${token}_`;
    })
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (out === '') out = 'sym';
  if (/^\d/.test(out)) out = `_${out}`;
  if (PY_KEYWORDS.has(out)) out += '_';
  return out;
}

// Every rewritten user name carries a trailing marker. Already valid
// names (including literal names ending in _) retain their spelling.
export function pyIdent(name: string): string {
  const ident = pythonName(name);
  return (ident !== name || RESERVED_IDENTS.has(ident)) && !ident.endsWith('_')
    ? `${ident}_`
    : ident;
}

// Collision disambiguation is also automatic mangling, so the marker
// stays at the very end, after the number.
export const numberedIdent = (base: string, suffix: number): string =>
  `${base.endsWith('_') ? base : `${base}_`}${suffix}_`;
