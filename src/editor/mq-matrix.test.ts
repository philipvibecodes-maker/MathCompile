// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  mountAppField,
  type,
  pressEnter,
  caretAncestor,
} from './test-field';

// Port of e2e/matrix.spec.ts — the vendored environments patch exercised
// through the app's <math-field> wiring. Everything serialization- and
// DOM-structure-level works headless (.mq-matrix tr/td counts included).
// Left e2e: the border-spacing/padding assert (needs real stylesheets).

const ed = (el: HTMLElement) => el.querySelector('.mq-editable-field')!;

describe('matrix environments', () => {
  it('\\begin{matrix} renders as a table inside the cell', () => {
    const { el } = mountAppField();
    el.value = '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}';
    expect(ed(el).querySelectorAll('.mq-matrix tr')).toHaveLength(2);
    expect(ed(el).querySelectorAll('.mq-matrix td')).toHaveLength(4);
    expect(ed(el).querySelectorAll('.mq-matrix .mq-paren')).toHaveLength(2);
    expect(el.value).toBe('\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  });

  it('typed \\cases opens a cases environment', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\cases');
    mq.keystroke('Enter');
    // Scope to the editable field: the autocomplete preview renders a
    // real .mq-matrix inside a StaticMath root block too.
    expect(ed(el).querySelectorAll('.mq-matrix tr')).toHaveLength(2);
    expect(el.value).toBe('\\begin{cases}&\\\\&\\end{cases}');
  });

  it('typed \\array{spec} applies the column spec', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\array{cc}');
    // The grid defers to the dimensions menu; Enter on its rows input
    // accepts the default 2x2.
    const rows = el.querySelector<HTMLInputElement>('.mc-mat-dim')!;
    expect(rows).toBeTruthy();
    rows.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(el.value).toBe('\\begin{array}{cc}&\\\\&\\end{array}');
  });

  it('Enter inside a matrix cell adds a row, not a displaylines wrap', () => {
    const { el, mq } = mountAppField();
    el.value = '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}';
    mq.keystroke('Ctrl-End');
    mq.keystroke('Left'); // step into the last cell (after d)
    // Caret inside the matrix (last cell, after d).
    expect(caretAncestor(el, '.mq-matrix')).toBe(true);
    pressEnter(mq);
    const v = el.value;
    expect(v).toContain('\\begin{pmatrix}');
    expect(v).not.toContain('displaylines');
    expect(ed(el).querySelectorAll('.mq-matrix tr')).toHaveLength(3);
  });

  it('Shift+Spacebar inside a matrix cell adds a column', () => {
    const { el, mq } = mountAppField();
    el.value = '\\begin{matrix}a&b\\\\c&d\\end{matrix}';
    mq.keystroke('Ctrl-End');
    mq.keystroke('Left'); // step into the last cell
    mq.keystroke('Shift-Spacebar');
    expect(ed(el).querySelectorAll('.mq-matrix td')).toHaveLength(6);
  });

  it('deleting the empty line below a matrix keeps the matrix rows', () => {
    const { el, mq } = mountAppField();
    el.value =
      '\\displaylines{\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}\\\\ }';
    mq.keystroke('Ctrl-End'); // into the empty second line
    mq.keystroke('Backspace');
    expect(el.value).toBe(
      '\\displaylines{\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}}',
    );
    // Both of the matrix's own <tr>s survive — the row index used to
    // land on a nested <tr> and remove one.
    expect(
      ed(el).querySelectorAll('.mq-matrix > table > tr'),
    ).toHaveLength(2);
    expect(
      ed(el).querySelectorAll('.mq-displaylines > table > tr'),
    ).toHaveLength(1);
  });

  it('deleting the first line keeps the caret usable', () => {
    const { el, mq } = mountAppField();
    el.value =
      '\\displaylines{ \\\\ \\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}}';
    mq.keystroke('Ctrl-Home');
    mq.keystroke('Backspace');
    expect(el.value).toBe(
      '\\displaylines{\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}}',
    );
    type(mq, 'z');
    expect(el.value).toBe(
      '\\displaylines{z\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}}',
    );
  });

  // The multi-cell hop leg of the e2e test is store wiring (stays e2e);
  // this is the MQ-level contract: arrows inside a grid emit no move-out.
  it('arrows move between matrix cells without leaving the field', () => {
    const { el, mq } = mountAppField();
    const moves: string[] = [];
    el.addEventListener('move-out', (e) =>
      moves.push((e as CustomEvent).detail.direction),
    );
    el.value = '\\begin{matrix}a&b\\\\c&d\\end{matrix}';
    mq.keystroke('Ctrl-Home');
    for (let i = 0; i < 8; i += 1) mq.keystroke('Right');
    // Walked the whole grid — internal matrix navigation is MQ-owned.
    expect(moves).toEqual([]);
    // Keep going: the caret exits the matrix's right edge eventually.
    for (let i = 0; i < 8 && moves.length === 0; i += 1)
      mq.keystroke('Right');
    expect(moves).toContain('forward');
  });

  it('Ctrl+Shift+Backspace inside a matrix cell deletes the current row', () => {
    const { el, mq } = mountAppField();
    el.value = '\\begin{matrix}a&b\\\\x&y\\\\c&d\\end{matrix}';
    mq.keystroke('Ctrl-Home');
    mq.keystroke('Right'); // step into cell a (row 0)
    mq.keystroke('Ctrl-Shift-Backspace');
    expect(el.value).toBe('\\begin{matrix}x&y\\\\c&d\\end{matrix}');
    expect(ed(el).querySelectorAll('.mq-matrix tr')).toHaveLength(2);
    // the caret stays live on the cell that slid into the deleted row
    type(mq, 'z');
    expect(el.value).toBe('\\begin{matrix}xz&y\\\\c&d\\end{matrix}');
  });

  it('Ctrl+Shift+Delete inside a matrix cell deletes the current column', () => {
    const { el, mq } = mountAppField();
    el.value = '\\begin{matrix}a&b\\\\c&d\\end{matrix}';
    mq.keystroke('Ctrl-End');
    mq.keystroke('Left'); // step into cell d (col 1)
    mq.keystroke('Ctrl-Shift-Del');
    expect(el.value).toBe('\\begin{matrix}a\\\\c\\end{matrix}');
    expect(ed(el).querySelectorAll('.mq-matrix td')).toHaveLength(2);
  });

  it('delete shortcuts on the last row or column delete the matrix', () => {
    const { el, mq } = mountAppField();
    el.value = '\\begin{matrix}a&b\\end{matrix}';
    mq.keystroke('Ctrl-Home');
    mq.keystroke('Right');
    mq.keystroke('Ctrl-Shift-Backspace'); // last row: all gone
    expect(el.value).toBe('');
    expect(el.querySelectorAll('.mq-matrix')).toHaveLength(0);

    el.value = '\\begin{matrix}b\\end{matrix}';
    mq.keystroke('Ctrl-Home');
    mq.keystroke('Right'); // step into cell b
    mq.keystroke('Ctrl-Shift-Del'); // last col: all gone
    expect(el.value).toBe('');
    expect(el.querySelectorAll('.mq-matrix')).toHaveLength(0);
  });

  it('delete shortcuts are matrices-only: unchanged in multi-line cells', () => {
    const { el, mq } = mountAppField();
    el.value = '\\displaylines{a\\\\b\\\\c}';
    mq.keystroke('Ctrl-End'); // last line
    // clears the current line's content — does NOT delete the line
    mq.keystroke('Ctrl-Shift-Backspace');
    expect(el.value).toBe('\\displaylines{a\\\\ b\\\\ }');
  });

  it('delete shortcuts outside a grid still clear the block', () => {
    const { el, mq } = mountAppField();
    el.value = 'foo';
    mq.keystroke('Ctrl-End');
    mq.keystroke('Ctrl-Shift-Backspace');
    expect(el.value).toBe('');
    el.value = 'bar';
    mq.keystroke('Ctrl-Home');
    mq.keystroke('Ctrl-Shift-Del');
    expect(el.value).toBe('');
  });

  it('Ctrl+Enter inside a matrix cell adds a row above, Enter below', () => {
    const { el, mq } = mountAppField();
    el.value = '\\begin{matrix}a&b\\\\c&d\\end{matrix}';
    mq.keystroke('Ctrl-End');
    mq.keystroke('Left'); // cell d (row 1, col 1)
    mq.keystroke('Ctrl-Enter');
    expect(el.value).toBe('\\begin{matrix}a&b\\\\&\\\\c&d\\end{matrix}');
    // Caret lands on the new empty row; Enter then adds a row below it
    // again (between the new row and c&d).
    pressEnter(mq);
    expect(el.value).toBe(
      '\\begin{matrix}a&b\\\\&\\\\&\\\\c&d\\end{matrix}',
    );
    // And the caret still types into the live new cell — it lands in
    // the caret's column, here col 1 (d's column).
    type(mq, 'z');
    expect(el.value).toBe('\\begin{matrix}a&b\\\\&\\\\&z\\\\c&d\\end{matrix}');
  });

  it('Ctrl+Shift+Spacebar adds a column left of the caret', () => {
    const { el, mq } = mountAppField();
    el.value = '\\begin{matrix}a&b\\\\c&d\\end{matrix}';
    mq.keystroke('Ctrl-End');
    mq.keystroke('Left'); // cell d (col 1)
    mq.keystroke('Ctrl-Shift-Spacebar');
    expect(el.value).toBe('\\begin{matrix}a&&b\\\\c&&d\\end{matrix}');
    type(mq, 'z');
    expect(el.value).toBe('\\begin{matrix}a&&b\\\\c&z&d\\end{matrix}');
  });

  it('Ctrl-Enter and Ctrl-Shift-Spacebar are matrices-only in multi-line cells', () => {
    const { el, mq } = mountAppField();
    el.value = '\\displaylines{a\\\\b}';
    mq.keystroke('Ctrl-End');
    mq.keystroke('Ctrl-Enter');
    mq.keystroke('Ctrl-Shift-Spacebar');
    // Neither key edits the \displaylines cell — still two rows, no &.
    expect(el.value).toBe('\\displaylines{a\\\\ b}');
    expect(el.value).not.toContain('&');
  });
});

describe('matrix paste', () => {
  // controller.paste() is the entry the textarea's paste event calls.
  const paste = (mq: ReturnType<typeof mountAppField>['mq'], text: string) =>
    (
      mq as unknown as { __controller: { paste(t: string): void } }
    ).__controller.paste(text);

  it('pasting TSV into a matrix fills cells from the caret', () => {
    const { el, mq } = mountAppField();
    el.value = '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}';
    mq.keystroke('Ctrl-Home');
    mq.keystroke('Right'); // cell a
    paste(mq, '1\t2\n3\t4');
    expect(el.value).toBe('\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}');
  });

  it('a paste larger than the grid grows it right and down', () => {
    const { el, mq } = mountAppField();
    el.value = '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}';
    mq.keystroke('Ctrl-Home');
    mq.keystroke('Right'); // cell a
    paste(mq, '1\t2\t3\n4\t5\t6\n7\t8\t9');
    expect(el.value).toBe(
      '\\begin{pmatrix}1&2&3\\\\4&5&6\\\\7&8&9\\end{pmatrix}',
    );
  });

  it('a bare column of lines fills down inside a matrix', () => {
    const { el, mq } = mountAppField();
    el.value = '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}';
    mq.keystroke('Ctrl-Home');
    mq.keystroke('Right'); // cell a
    paste(mq, 'x\ny');
    expect(el.value).toBe('\\begin{pmatrix}x&b\\\\y&d\\end{pmatrix}');
  });

  it('pasting CSV outside a matrix writes a \\pmatrix', () => {
    const { el, mq } = mountAppField();
    paste(mq, '1,2\n3,4');
    expect(el.value).toBe('\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}');
    expect(ed(el).querySelectorAll('.mq-matrix tr')).toHaveLength(2);
  });

  it('a single comma line stays a literal paste', () => {
    const { el, mq } = mountAppField();
    paste(mq, 'a,b');
    expect(el.value).toBe('a,b');
  });

  it('latex-looking text never parses as a table', () => {
    const { el, mq } = mountAppField();
    paste(mq, '\\frac{1}{2}+\\sqrt{3}');
    expect(el.value).toBe('\\frac{1}{2}+\\sqrt{3}');
  });
});
