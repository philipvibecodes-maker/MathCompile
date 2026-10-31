// Context-specific help for the strip under the focused input cell:
// the caret's position relative to a .mq-matrix decides which hints
// apply — inside the grid (row/column editing), just left of it
// (determinant/trace), or just right (transpose/adjoint/pseudoinverse).
// A caret at or after a `\text{plot}` marker shows the for-domain
// spellings instead; the other statement markers (\text{def},
// \text{solve} family) show their signature forms the same way.
// Carets inside \sum-style bounds, a \frac, or an open \-command input
// get their own navigational hints.
export type HelpContext =
  | 'in-set'
  | 'inside-matrix'
  | 'left-of-matrix'
  | 'right-of-matrix'
  | 'in-plot'
  | 'in-def'
  | 'in-solve'
  | 'in-dsolve'
  | 'in-pdesolve'
  | 'in-bounds'
  | 'in-frac'
  | 'command-input';

const isMatrix = (el: Element | null | undefined): boolean =>
  !!el && el.classList.contains('mq-matrix');

// `\text{plot}` renders as a .mq-text-mode span whose text is 'plot';
// the other statement markers render identically.
const textOf = (el: Element | null | undefined): string =>
  el && el.classList.contains('mq-text-mode')
    ? ((el.textContent ?? '').trim())
    : '';
const isPlotMarker = (el: Element | null | undefined): boolean =>
  textOf(el) === 'plot';
const isDefMarker = (el: Element | null | undefined): boolean =>
  textOf(el) === 'def';
const isSolveMarker = (el: Element | null | undefined): boolean =>
  textOf(el) === 'solve';
const isDsolveMarker = (el: Element | null | undefined): boolean =>
  ['dsolve', 'ode'].includes(textOf(el));
const isPdesolveMarker = (el: Element | null | undefined): boolean =>
  ['pdesolve', 'pde'].includes(textOf(el));

// Accepting a typed `\pmatrix`/`\begin{...}`/autocomplete command leaves
// an empty, invisible latex-command-input wrapper as a sibling of the
// new atom — skip it when checking what's really adjacent to the caret.
const isInputResidue = (el: Element | null | undefined): boolean =>
  !!el && el.classList.contains('mq-latex-command-input-wrapper');

const atomAfter = (el: Element): Element | null => {
  let sib = el.nextElementSibling;
  while (sib && isInputResidue(sib)) sib = sib.nextElementSibling;
  return sib;
};
const atomBefore = (el: Element): Element | null => {
  let sib = el.previousElementSibling;
  while (sib && isInputResidue(sib)) sib = sib.previousElementSibling;
  return sib;
};

// A statement marker anywhere earlier on the same line marks the whole
// line — the nearest previous marker wins (a `\text{def}` later in the
// line still scopes to the line's leading statement, which the marker
// scan reaches first going backwards).
const statementContext = (el: Element | null | undefined): HelpContext | null => {
  if (isPlotMarker(el)) return 'in-plot';
  if (isDefMarker(el)) return 'in-def';
  if (isSolveMarker(el)) return 'in-solve';
  if (isDsolveMarker(el)) return 'in-dsolve';
  if (isPdesolveMarker(el)) return 'in-pdesolve';
  return null;
};

// Read the context off the rendered MathQuill DOM. Presence of
// .mq-cursor implies the field is focused; a selection removes it.
export function readHelpContext(field: HTMLElement): HelpContext | null {
  const cursor = field.querySelector<HTMLElement>('.mq-cursor');
  if (!cursor) return null;

  if (cursor.closest('.mq-matrix')) return 'inside-matrix';
  if (cursor.closest('.mq-latex-command-input')) return 'command-input';
  // Delimiter metadata comes from the rendered bracket glyphs, including
  // ghost braces. Walk outward so nested tuples/absolute values keep the
  // enclosing set's guidance; command inputs and matrix cells keep theirs.
  for (let el: Element | null = cursor.parentElement; el && el !== field; el = el.parentElement) {
    if (el.classList.contains('mq-bracket-middle') &&
        el.previousElementSibling?.getAttribute('data-mq-delimiter') === '{' &&
        el.nextElementSibling?.getAttribute('data-mq-delimiter') === '}')
      return 'in-set';
  }
  const direct = statementContext(cursor.closest('.mq-text-mode'));
  if (direct) return direct;

  // Adjacency: at each ancestor level the element's siblings are the
  // baseline atoms, so the walk covers both a caret sitting directly
  // beside the matrix and one inside a block that is (\frac{}{|} M or
  // M^{|} — the .mq-supsub's previous sibling is the matrix).
  for (
    let el: Element | null = cursor;
    el && el !== field;
    el = el.parentElement
  ) {
    if (isMatrix(atomAfter(el))) return 'left-of-matrix';
    if (isMatrix(atomBefore(el))) return 'right-of-matrix';
    // The statement marker can sit anywhere earlier in the
    // statement — scan every earlier sibling at this level (the level
    // stops at the displaylines row, so a marker on a previous
    // line doesn't bleed through: tr/td row elements aren't
    // .mq-text-mode). Statement contexts are line-scoped: they win
    // inside nested blocks (a \frac or \sum bound in the domain) too.
    for (
      let sib = el.previousElementSibling;
      sib;
      sib = sib.previousElementSibling
    ) {
      if (isInputResidue(sib)) continue;
      const ctx = statementContext(sib);
      if (ctx) return ctx;
    }
  }

  // \sum/\prod/\lim/\int bound blocks render as .mq-from (lower),
  // .mq-to (upper), or .mq-approaches (\lim's arrow bound).
  if (cursor.closest('.mq-from, .mq-to, .mq-approaches'))
    return 'in-bounds';
  if (cursor.closest('.mq-fraction')) return 'in-frac';
  return null;
}

// Each entry renders as `<key> does` in the strip. Spellings are the
// typed forms that reach codegen: `det` (autoOperatorName) ->
// Determinant, `\mathrm{trace}` -> .trace(), `^T` -> Transpose,
// `^\dagger` -> Adjoint, `^+` -> .pinv().
export const HELP_ENTRIES: Record<HelpContext, { key: string; does: string }[]> =
  {
    'in-set': [
      { key: '{(x,y) ∣ x+y=1}', does: 'set-builder notation' },
      { key: 'where or \\mid', does: 'insert ∣ (such that)' },
      { key: 'st or \\st', does: 'insert s.t. (same meaning)' },
      { key: 'Tab / Shift+Tab', does: 'move across ∣ or s.t.' },
    ],
    'inside-matrix': [
      { key: 'Enter', does: 'add row below' },
      { key: 'Shift+Space', does: 'add column right' },
      { key: 'Ctrl+Shift+Backspace', does: 'delete row' },
      { key: 'Ctrl+Shift+Delete', does: 'delete column' },
      { key: 'Ctrl+V', does: 'paste TSV/CSV into the grid' },
    ],
    'left-of-matrix': [
      { key: 'det', does: 'determinant' },
      { key: '\\mathrm{trace}', does: 'trace' },
    ],
    'right-of-matrix': [
      { key: '^T', does: 'transpose' },
      { key: '^\\dagger', does: 'adjoint' },
      { key: '^+', does: 'pseudoinverse' },
    ],
    // The `for` domain clause the compiler reads off a plot
    // statement — interval, inequality, conjunction, and product forms.
    'in-plot': [
      { key: 'for x \\in (a,b)', does: 'set the domain' },
      { key: 'for x > a', does: 'one-sided bound' },
      {
        key: 'for u \\in I \\land v \\in J',
        does: '2-variable domain',
      },
    ],
    // `\text{def}` marks a function definition: signature then body.
    'in-def': [
      { key: 'g(x) = 2x', does: 'defines g' },
      { key: 'g(x,y) = x + y', does: 'several args' },
    ],
    // `\text{solve}`: equation + trailing symbols name the variables; a
    // `for` clause bounds it via solveset.
    'in-solve': [
      { key: 'x^2 = 1, x', does: 'solve for x' },
      { key: 'x + y = 3, x - y = 1, x, y', does: 'a system' },
      { key: 'for x > a', does: 'domain (solveset)' },
    ],
    // `\text{dsolve}`/`\text{ode}`: primes rewrite to derivatives;
    // `f(pt) = rhs` items are initial conditions; several equations
    // with several unknowns solve as a system.
    'in-dsolve': [
      { key: "y' = y", does: 'primes are derivatives' },
      { key: 'y(0) = 1', does: 'initial condition' },
      { key: "y' = z, z' = -y", does: 'ODE system' },
    ],
    // `\text{pdesolve}`/`\text{pde}`: subscripts are partial
    // derivatives; `u(x,t)` declares the unknown's signature.
    'in-pdesolve': [
      { key: 'u_x + u_t = 0', does: 'subscripts are partials' },
      { key: 'u_{xt}', does: 'mixed partial' },
      { key: 'u(x,t)', does: 'declares the unknown' },
    ],
    'in-bounds': [
      { key: 'Tab', does: 'other bound' },
      { key: '↑ / ↓', does: 'switch bounds' },
      { key: '→', does: 'leave the operator' },
    ],
    'in-frac': [{ key: 'Tab', does: 'numerator ⇄ denominator' }],
    'command-input': [
      { key: 'Enter', does: 'accept the suggestion' },
      { key: 'Esc', does: 'dismiss suggestions' },
    ],
  };
