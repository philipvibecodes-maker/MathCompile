
const PY_KEYWORDS = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from',
  'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not',
  'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  'None', 'True', 'False',
]);

// Names the emitted program itself defines: `sp` is the module alias
// (`import sympy as sp`) and the mc_* helpers come from CALC_RUNTIME_PY
// in the calc prelude — a user name colliding with any of them would
// clobber the machinery, so each mangles to a trailing-underscore form.
const RESERVED_IDENTS = new Set([
  'sp',
  'mc_deg',
  'mc_doit',
  'mc_simplify',
  'mc_order',
  'mc_answers',
  'clean_and_simplify',
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

// Mangle an arbitrary symbol name (e.g. `a_{n+1}`) into a valid python
// identifier that consistently refers to that symbol.
export function pyIdent(name: string): string {
  name = name.replace(
    FONT_TAG,
    (_, lead, piece, tag) => `${lead}${FONT_TAG_CMD[tag]}_${piece}`,
  );
  if (RESERVED_IDENTS.has(name)) return `${name}_`;
  if (/^[A-Za-z_]\w*$/.test(name) && !PY_KEYWORDS.has(name)) return name;
  // Prime ticks are meaningful (x' is a distinct variable, not x) —
  // translate them to _prime before the generic strip eats them.
  let out = name
    .replaceAll("'", '_prime')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (out === '') out = 'sym';
  if (/^\d/.test(out)) out = `_${out}`;
  if (PY_KEYWORDS.has(out) || RESERVED_IDENTS.has(out)) out += '_';
  return out;
}

// Statement-position heads that only lower to Python.
