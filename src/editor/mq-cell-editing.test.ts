// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountAppField, type, pressEnter, key, rowInfo } from './test-field';
import type { MathFieldElement } from './math-field';

// Field-level parts of e2e/cells.spec.ts: what Enter/Backspace/arrows do
// inside one cell's displaylines rows. The multi-cell legs (hopping
// cells, focus handoff, the add/delete buttons) stay e2e — they're the
// store + DOM wiring, which is also unit-covered in store.test.ts.

/** Element-level move-out events (what MQ emits before attachField's
 *  selecting filter). */
const recordMoveOuts = (el: MathFieldElement) => {
  const dirs: string[] = [];
  el.addEventListener('move-out', (e) =>
    dirs.push((e as CustomEvent).detail.direction),
  );
  return dirs;
};

describe('displaylines editing inside a cell', () => {
  it('Backspace unwinds blank displaylines lines before firing delete-out', () => {
    const { el, mq, events } = mountAppField();
    // A lone Enter wraps two blank lines — not "one blank line" yet, so
    // the first Backspace is MQ's own unwrap, the second deletes.
    pressEnter(mq);
    expect(el.value).toBe('\\displaylines{\\\\ }');
    key(el, { key: 'Backspace' });
    expect(el.value).toBe('');
    expect(events).not.toContain('delete-out');
    key(el, { key: 'Backspace' });
    expect(events).toContain('delete-out');
  });

  it('Enter splits the cell into multiple lines', () => {
    const { el, mq } = mountAppField();
    type(mq, 'x');
    pressEnter(mq);
    type(mq, 'y');
    expect(el.value).toBe('\\displaylines{x\\\\ y}');
  });

  // Shift+Space adds a column in a real matrix, but \displaylines is a
  // single-column grid — it used to corrupt row indices; now it types
  // an ordinary space.
  it('Shift+Space inside a multi-line cell does not add a column', () => {
    const { el, mq } = mountAppField();
    type(mq, 'x');
    pressEnter(mq);
    type(mq, 'y');
    expect(el.value).toBe('\\displaylines{x\\\\ y}');
    // Real Shift+Space = keystroke (a no-op on a displaylines cell) +
    // the space char landing as text.
    mq.keystroke('Shift-Spacebar');
    mq.typedText(' ');
    expect(el.value).toBe('\\displaylines{x\\\\ y\\ }');
    // The grid still behaves: Enter splits another row cleanly.
    pressEnter(mq);
    type(mq, 'z');
    expect(el.value).toBe('\\displaylines{x\\\\ y\\ \\\\ z}');
  });

  it('Enter inside a nested atom splits the row, keeping the atom whole', () => {
    const { el, mq } = mountAppField();
    // \frac via the latex command input; Enter accepts the command and
    // lands the caret in the numerator.
    type(mq, '\\frac');
    mq.keystroke('Enter');
    expect(el.value).toBe('\\frac{ }{ }');
    type(mq, '1');
    // Enter while nested inside the fraction: the break lands on the
    // row, the atom stays whole.
    pressEnter(mq);
    type(mq, 'z');
    expect(el.value).toBe('\\displaylines{\\frac{1}{ }\\\\ z}');
  });

  it('Enter accepts an open latex command instead of line-breaking', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\sqrt');
    mq.keystroke('Enter');
    const v = el.value;
    expect(v).toBe('\\sqrt{ }');
    expect(v).not.toContain('displaylines');
  });

  it('vertical arrows stay inside a multi-line cell until the last row', () => {
    const { el, mq } = mountAppField();
    const moves = recordMoveOuts(el);
    el.value = '\\displaylines{x\\\\ y}';
    // caret on the last row
    mq.keystroke('Ctrl-End');
    expect(rowInfo(el).rowIdx).toBe(1);
    mq.keystroke('Up'); // moves within the cell, no move-out
    expect(rowInfo(el).rowIdx).toBe(0);
    expect(moves).toEqual([]);
    mq.keystroke('Down'); // back to the last row — still no hop
    expect(rowInfo(el).rowIdx).toBe(1);
    expect(moves).toEqual([]);
    mq.keystroke('Down'); // field edge: move-out fires
    expect(moves).toEqual(['downward']);
  });

  it('Shift+Arrow at a cell edge extends the selection; attachField ignores it', () => {
    const { el, mq, events } = mountAppField();
    el.value = 'xy';
    mq.moveToRightEnd(); // a programmatic latex() resets the caret
    const outs: { direction: string; selecting: boolean }[] = [];
    el.addEventListener('move-out', (e) =>
      outs.push((e as CustomEvent).detail),
    );
    // The e2e pins this via Shift+Up/Down; headless, drive the same
    // selectOutOf path with the horizontal edges (Shift-Up's
    // select-to-line-start loop doesn't reach the edge the same way
    // without a real selection).
    mq.keystroke('Shift-Right'); // right edge -> forward selectOutOf
    mq.moveToLeftEnd();
    mq.keystroke('Shift-Left'); // left edge -> backward selectOutOf
    // The element still emits move-out for the dead-end selection
    // extension, flagged selecting; attachField filters it from onMoveOut.
    expect(outs).toEqual([
      { direction: 'forward', selecting: true },
      { direction: 'backward', selecting: true },
    ]);
    expect(events.filter((e) => e.startsWith('move-out'))).toEqual([]);
  });
});
