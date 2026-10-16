// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { mountAppField, type, pressEnter, rowInfo } from './test-field';

// Port of e2e/standard-keys.spec.ts — line-aware Home/End, in-grid Tab,
// select-all + type-over, and the vendored undo history. Undo bursts
// coalesce edits within ~1s of each other, so tests advance fake
// timers between intended undo steps. Left e2e: Tab/Shift-Tab leaving
// the field at its edges (real browser tab order) and the
// first-line-doesn't-shift layout pin.

const SEEDED_LATEX = '2^{n}=\\sum_{i=0}^{n}\\binom{n}{i}';

afterEach(() => {
  vi.useRealTimers();
});

describe('multi-line editing keys', () => {
  it('Home/End go to the line edges in a multi-line cell', () => {
    const { el, mq } = mountAppField();
    type(mq, 'x+y');
    pressEnter(mq);
    type(mq, 'z');
    expect(el.value).toBe('\\displaylines{x+y\\\\ z}');

    mq.keystroke('Home');
    expect(rowInfo(el)).toEqual({ rowIdx: 1, leftText: '' });
    mq.keystroke('End');
    expect(rowInfo(el)).toEqual({ rowIdx: 1, leftText: 'z' });

    mq.keystroke('Ctrl-Home');
    expect(rowInfo(el)).toEqual({ rowIdx: 0, leftText: '' });
    mq.keystroke('End');
    expect(rowInfo(el)).toEqual({ rowIdx: 0, leftText: 'x+y' });
  });

  it('Tab on a middle line still moves to the next line', () => {
    const { el, mq } = mountAppField();
    type(mq, 'x+y');
    pressEnter(mq);
    type(mq, 'z');
    pressEnter(mq);
    type(mq, 'w');
    mq.keystroke('Ctrl-Home');
    mq.keystroke('Tab');

    expect(rowInfo(el)).toEqual({ rowIdx: 1, leftText: '' });
  });

  it('Ctrl+A selects the whole multi-line cell', () => {
    const { el, mq } = mountAppField();
    type(mq, 'x+y');
    pressEnter(mq);
    type(mq, 'z');
    mq.keystroke('Ctrl-A');
    mq.keystroke('Backspace');
    expect(el.value).toBe('');
  });

  it('typing over a whole-cell selection replaces it', () => {
    const { el, mq } = mountAppField();
    type(mq, 'x+y');
    pressEnter(mq);
    type(mq, 'z');
    mq.keystroke('Ctrl-A');
    type(mq, 'q');
    // The selection covered every line; deleting it removes the
    // displaylines atom, so the caret must re-park — not strand inside
    // the detached subtree where typing writes nowhere.
    expect(el.value).toBe('q');
    type(mq, '+r');
    expect(el.value).toBe('q+r');
  });
});

describe('undo history', () => {
  it('Ctrl+Z / Ctrl+Shift+Z undo and redo edits', () => {
    vi.useFakeTimers();
    const { el, mq } = mountAppField();
    el.value = SEEDED_LATEX;
    // select-all + clear, then retype — within one coalescing burst.
    mq.keystroke('Ctrl-A');
    mq.keystroke('Backspace');
    type(mq, 'a+b');
    vi.advanceTimersByTime(1100); // end the coalescing window
    type(mq, 'c');
    expect(el.value).toBe('a+bc');

    mq.keystroke('Ctrl-Z');
    expect(el.value).toBe('a+b');
    // The clear+retype coalesced into one burst — the next undo lands
    // back on the seeded content.
    mq.keystroke('Ctrl-Z');
    expect(el.value).toBe(SEEDED_LATEX);

    mq.keystroke('Ctrl-Shift-Z');
    expect(el.value).toBe('a+b');
    mq.keystroke('Ctrl-Shift-Z');
    expect(el.value).toBe('a+bc');
  });

  it('Ctrl+Z undoes a cleared cell', () => {
    const { el, mq } = mountAppField();
    type(mq, 'xy');
    mq.keystroke('Ctrl-A');
    mq.keystroke('Backspace');
    expect(el.value).toBe('');
    mq.keystroke('Ctrl-Z');
    expect(el.value).toBe('xy');
  });
});
