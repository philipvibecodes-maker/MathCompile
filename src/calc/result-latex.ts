// Result-latex touch-ups for calculator rows: both engines name inverse
// trig functions with an `a` prefix — nerdamer writes \mathrm{atan},
// SymPy \operatorname{asin} under the abbreviated style (the worker asks
// for 'full' names, but rows can also come from unevaluated/user-defined
// functions). MathQuill doesn't know `atan` as an operator name, so it
// unitalicizes the trailing builtin (`tan`) and renders "a tan".
// Rewriting the `a` prefix to the conventional `arc` fixes it: arctan is
// a real LaTeX builtin and the rest (arcsec, arcsinh, …) are all
// MathQuill auto-operator names, so `\operatorname{arc<name>}` renders
// upright in one word either way.

// `a`-prefixed inverse-trig names both engines emit. Longer suffixes
// first so `coth`/`csch`/`sech`/`sinh`/`cosh`/`tanh` win over the
// shorter trig names they start with.
const A_TRIG =
  /\\(operatorname|mathrm|text)\{a(sinh|sin|cosh|cos|tanh|tan|sech|sec|csch|csc|coth|cot)\}/g;

// Rewrite \operatorname{atan}-style names to \operatorname{arctan} form.
// The wrapper is always normalized to \operatorname — for arctan and
// friends the letters collapse into the builtin operator name on parse,
// which also round-trips as \arctan in latex().
export function arcTrigNames(latex: string): string {
  return latex.replace(A_TRIG, (_m, _wrap, suffix: string) => `\\operatorname{arc${suffix}}`);
}
