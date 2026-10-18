// Context-specific help for the strip under the focused input cell:
// the caret's position relative to a .mq-matrix decides which hints
// apply — inside the grid (row/column editing), just left of it
// (determinant/trace), or just right (transpose/adjoint/pseudoinverse).
// A caret at or after a `\text{plot}` marker shows the for-domain
// spellings instead.
export type HelpContext =
  | 'inside-matrix'
  | 'left-of-matrix'
  | 'right-of-matrix'
  | 'in-plot';

const isMatrix = (el: Element | null | undefined): boolean =>
  !!el && el.classList.contains('mq-matrix');

// `\text{plot}` renders as a .mq-text-mode span whose text is 'plot'.
const isPlotMarker = (el: Element | null | undefined): boolean =>
  !!el &&
  el.classList.contains('mq-text-mode') &&
  (el.textContent ?? '').trim() === 'plot';

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

// Read the context off the rendered MathQuill DOM. Presence of
// .mq-cursor implies the field is focused; a selection removes it.
export function readHelpContext(field: HTMLElement): HelpContext | null {
  const cursor = field.querySelector<HTMLElement>('.mq-cursor');
  if (!cursor) return null;

  if (cursor.closest('.mq-matrix')) return 'inside-matrix';
  const insideText = cursor.closest('.mq-text-mode');
  if (isPlotMarker(insideText)) return 'in-plot';

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
    // The `\text{plot}` marker can sit anywhere earlier in the
    // statement — scan every earlier sibling at this level (the level
    // stops at the displaylines row, so a plot marker on a previous
    // line doesn't bleed through: tr/td row elements aren't
    // .mq-text-mode).
    for (
      let sib = el.previousElementSibling;
      sib;
      sib = sib.previousElementSibling
    ) {
      if (isInputResidue(sib)) continue;
      if (isPlotMarker(sib)) return 'in-plot';
    }
  }
  return null;
}

// Each entry renders as `<key> does` in the strip. Spellings are the
// typed forms that reach codegen: `det` (autoOperatorName) ->
// Determinant, `\mathrm{trace}` -> .trace(), `^T` -> Transpose,
// `^\dagger` -> Adjoint, `^+` -> .pinv().
export const HELP_ENTRIES: Record<HelpContext, { key: string; does: string }[]> =
  {
    'inside-matrix': [
      { key: 'Enter', does: 'add row below' },
      { key: 'Shift+Space', does: 'add column right' },
      { key: 'Ctrl+Shift+Backspace', does: 'delete row' },
      { key: 'Ctrl+Shift+Delete', does: 'delete column' },
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
    // The `\text{for}` domain clause the compiler reads off a plot
    // statement — interval, inequality, conjunction, and product forms.
    'in-plot': [
      { key: '\\text{for} x \\in (a,b)', does: 'set the domain' },
      { key: '\\text{for} x > a', does: 'one-sided bound' },
      {
        key: '\\text{for} u \\in I \\land v \\in J',
        does: '2-variable domain',
      },
    ],
  };
