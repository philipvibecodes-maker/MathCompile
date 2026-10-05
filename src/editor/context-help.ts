// Context-specific help for the strip under the focused input cell:
// the caret's position relative to a .mq-matrix decides which hints
// apply — inside the grid (row/column editing), just left of it
// (determinant/trace), or just right (transpose/adjoint/pseudoinverse).
export type HelpContext = 'inside-matrix' | 'left-of-matrix' | 'right-of-matrix';

const isMatrix = (el: Element | null | undefined): boolean =>
  !!el && el.classList.contains('mq-matrix');

// Read the context off the rendered MathQuill DOM. Presence of
// .mq-cursor implies the field is focused; a selection removes it.
export function readHelpContext(field: HTMLElement): HelpContext | null {
  const cursor = field.querySelector<HTMLElement>('.mq-cursor');
  if (!cursor) return null;

  if (cursor.closest('.mq-matrix')) return 'inside-matrix';

  // Adjacency: at each ancestor level the element's siblings are the
  // baseline atoms, so the walk covers both a caret sitting directly
  // beside the matrix and one inside a block that is (\frac{}{|} M or
  // M^{|} — the .mq-supsub's previous sibling is the matrix).
  for (
    let el: Element | null = cursor;
    el && el !== field;
    el = el.parentElement
  ) {
    if (isMatrix(el.nextElementSibling)) return 'left-of-matrix';
    if (isMatrix(el.previousElementSibling)) return 'right-of-matrix';
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
      { key: 'Enter', does: 'add a row below' },
      { key: 'Shift+Space', does: 'add a column right' },
      {
        key: 'Backspace',
        does: 'on an empty cell deletes it — its row/column too when empty',
      },
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
  };
