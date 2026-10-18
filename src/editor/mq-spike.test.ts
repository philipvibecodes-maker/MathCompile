// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  mountRaw,
  mountAppField,
  type,
  pressEnter,
  key,
  ADAPTER_AUTO_COMMANDS,
} from './test-field';

// Port of e2e/spike.spec.ts — the bare-MathQuill + <math-field> adapter
// contract, run headless. spike.html existed only to host these in a
// browser; every assertion here drives the same public API it did.
// Not covered headless: real text keypresses (typedText() replaces them).

describe('MathQuill spike (headless)', () => {
  it('autoCommands convert int/sum/sqrt inline', () => {
    const { mq } = mountRaw();
    const out: Record<string, string> = {};
    for (const word of ['int', 'sum', 'sqrt', 'prod']) {
      mq.latex('');
      type(mq, word);
      out[word] = mq.latex();
    }
    expect(out.int).toContain('\\int');
    expect(out.sum).toContain('\\sum');
    expect(out.sqrt).toContain('\\sqrt');
    expect(out.prod).toContain('\\prod');
  });

  it('smart mode: bare "for" expands to \\text{ for }', () => {
    const { mq } = mountAppField();
    type(mq, '2x for x>0');
    expect(mq.latex()).toContain('\\text{ for }');
    expect(mq.latex()).not.toContain('for x');
    // The expansion is a real TextBlock, not bare letters.
    expect(mq.latex()).toBe('2x\\ \\text{ for }\\ x>0');
    // 'for' at the very start of the field, then the typed space lands
    // after the block.
    mq.latex('');
    type(mq, 'for x');
    expect(mq.latex()).toBe('\\text{ for }\\ x');
  });

  it('smart mode: "for" does not rewrite words containing it', () => {
    const { mq } = mountAppField();
    // Suffix-embedded runs ('before' ends in 'for' but isn't 'for').
    // 'format'-style prefixes still convert early — the same tradeoff
    // every auto-op makes ('sine' -> \sin e).
    for (const word of ['before', 'therefore', 'effort']) {
      mq.latex('');
      type(mq, word);
      expect(mq.latex()).toBe(word);
    }
  });

  it('smart mode off: "for" stays ordinary letters', () => {
    const { mq } = mountRaw({ autoCommands: '', autoWordCommands: '' });
    type(mq, 'for');
    expect(mq.latex()).toBe('for');
  });

  it('.write preserves empty blocks; caret traverses sub then sup', () => {
    const { mq } = mountRaw();
    mq.write('\\int_{ }^{ }');
    const afterWrite = { latex: mq.latex(), sel: mq.selection() };
    // From the start, walk right and record caret index at each stop.
    mq.moveToLeftEnd();
    const stops: number[] = [mq.selection().startIndex];
    for (let i = 0; i < 14; i++) {
      mq.keystroke('Right');
      const idx = mq.selection().startIndex;
      if (idx === stops[stops.length - 1]) break;
      stops.push(idx);
    }
    // Empty sub/sup blocks round-trip (MQ serializes `_{ }`/`^{ }`).
    expect(afterWrite.latex).toContain('_{ }');
    expect(afterWrite.latex).toContain('^{ }');
    // The caret visits the sub block before the sup block.
    const subIdx = afterWrite.latex.indexOf('_{') + 2;
    const supIdx = afterWrite.latex.indexOf('^{') + 2;
    expect(stops).toContain(subIdx);
    expect(stops).toContain(supIdx);
    expect(stops.indexOf(subIdx)).toBeLessThan(stops.indexOf(supIdx));
  });

  it('focus lands on hidden textarea inside the field', () => {
    const { el, mq } = mountRaw();
    mq.focus();
    const ae = document.activeElement;
    expect(ae?.tagName).toBe('TEXTAREA');
    expect(el.contains(ae)).toBe(true);
  });

  it('no deferred focus steal after handing focus elsewhere', async () => {
    const { mq } = mountRaw();
    const watch: { t: number; id: string }[] = [];
    const t0 = Date.now();
    let last = document.activeElement;
    const timer = setInterval(() => {
      const cur = document.activeElement;
      if (cur !== last) {
        watch.push({ t: Date.now() - t0, id: (cur as HTMLElement)?.id ?? '' });
        last = cur;
      }
    }, 4);
    const other = document.createElement('input');
    other.id = 'other';
    document.body.appendChild(other);
    mq.focus();
    other.focus();
    await new Promise((r) => setTimeout(r, 250));
    clearInterval(timer);
    expect((document.activeElement as HTMLElement)?.id).toBe('other');
    const lastOther = watch.map((w) => w.id).lastIndexOf('other');
    const stolen = watch.slice(lastOther + 1);
    expect(stolen, `focus watch: ${JSON.stringify(watch)}`).toEqual([]);
    other.remove();
  });

  it('capture keydown sees shiftKey; enter/upOutOf/downOutOf/moveOutOf fire', () => {
    const { el, mq, events } = mountRaw();
    el.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter')
          events.push(`capture:enter shift=${e.shiftKey}`);
      },
      true,
    );
    mq.latex('x');
    mq.focus();
    expect(el.contains(document.activeElement)).toBe(true);

    // Enter's '\n' doesn't auto-insert headless — keydown for the
    // capture listener, typedText('\n') for MQ's enter handler.
    key(el, { key: 'Enter' });
    pressEnter(mq);
    key(el, { key: 'Enter', shiftKey: true });
    pressEnter(mq);
    key(el, { key: 'ArrowUp' });
    key(el, { key: 'ArrowDown' });
    mq.moveToLeftEnd();
    key(el, { key: 'ArrowLeft' });

    const capIdx = events.indexOf('capture:enter shift=false');
    const shiftCapIdx = events.indexOf('capture:enter shift=true');
    const enterIdxs = events
      .map((e, i) => (e === 'handler:enter' ? i : -1))
      .filter((i) => i >= 0);
    expect(capIdx).toBeGreaterThanOrEqual(0);
    expect(shiftCapIdx).toBeGreaterThanOrEqual(0);
    expect(enterIdxs.length).toBeGreaterThanOrEqual(2);
    // capture listener ran before MQ's enter handler for each Enter press
    expect(enterIdxs[0]).toBeGreaterThan(capIdx);
    expect(enterIdxs[1]).toBeGreaterThan(shiftCapIdx);
    expect(events).toContain('handler:upOutOf');
    expect(events).toContain('handler:downOutOf');
    expect(events).toContain('handler:moveOutOf:-1');
  });

  // --- vendored environments patch ---

  it('\\begin{matrix} parses, renders as a table, and round-trips', () => {
    const { el, mq } = mountRaw();
    mq.latex('\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
    expect(mq.latex()).toBe('\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
    expect(el.querySelectorAll('.mq-matrix tr')).toHaveLength(2);
    expect(el.querySelectorAll('.mq-matrix td')).toHaveLength(4);
    expect(el.querySelectorAll('.mq-matrix .mq-paren')).toHaveLength(2);
  });

  it('insertLineBreak inside a matrix cell adds a row', () => {
    const { mq } = mountRaw();
    mq.latex('\\begin{matrix}a&b\\\\c&d\\end{matrix}');
    mq.focus();
    // Caret lands in the last cell (d) after entering from the right.
    mq.keystroke('Left');
    mq.insertLineBreak();
    expect(mq.latex()).toBe('\\begin{matrix}a&b\\\\c&d\\\\&\\end{matrix}');
  });

  it('insertLineBreak at top level wraps content in \\displaylines', () => {
    const { mq } = mountRaw();
    mq.latex('x+1');
    mq.moveToLeftEnd();
    mq.keystroke('Right'); // caret after 'x'
    mq.insertLineBreak();
    expect(mq.latex()).toBe('\\displaylines{x\\\\ +1}');
  });

  it('insertLineBreak inside displaylines splits the row', () => {
    const { mq } = mountRaw();
    mq.latex('\\displaylines{x\\\\ +1}');
    mq.focus();
    mq.keystroke('Left'); // caret between '+' and '1'
    mq.insertLineBreak();
    expect(mq.latex()).toBe('\\displaylines{x\\\\ +\\\\ 1}');
  });

  it('Shift-Spacebar in a matrix cell adds a column', () => {
    const { el, mq } = mountRaw();
    mq.latex('\\begin{matrix}a&b\\\\c&d\\end{matrix}');
    mq.focus();
    mq.keystroke('Left'); // caret into last cell (d)
    mq.keystroke('Shift-Spacebar');
    expect(el.querySelectorAll('.mq-matrix td')).toHaveLength(6);
    expect(mq.latex()).toBe('\\begin{matrix}a&b&\\\\c&d&\\end{matrix}');
  });

  it('\\derivative expands to a real fraction with caret in the denominator', () => {
    const { mq } = mountRaw({ autoCommands: ADAPTER_AUTO_COMMANDS });
    mq.typedText('\\');
    type(mq, 'derivative');
    mq.keystroke('Enter'); // renderCommand -> expansion
    expect(mq.latex()).toBe('\\frac{d}{d}');
    mq.typedText('f');
    expect(mq.latex()).toBe('\\frac{d}{df}');
  });

  it('with dIsDerivative off, \\derivative expands to D()', () => {
    const { mq } = mountRaw({ autoCommands: ADAPTER_AUTO_COMMANDS });
    mq.config({ dIsDerivative: false });
    mq.typedText('\\');
    type(mq, 'derivative');
    mq.keystroke('Enter');
    expect(mq.latex()).toBe('D()');
    mq.typedText('f');
    expect(mq.latex()).toBe('D(f)');
    mq.config({ dIsDerivative: true });
  });

  // --- <math-field> adapter element ---

  it('adapter: value round-trip, input and move-out events', () => {
    const { el, mq } = mountAppField({ autoCommands: ADAPTER_AUTO_COMMANDS });
    const events: string[] = [];
    el.addEventListener('input', () => events.push('adapter:input'));
    el.addEventListener('move-out', (e) =>
      events.push(`adapter:move-out:${(e as CustomEvent).detail.direction}`),
    );
    el.value = 'x+1';
    expect(el.value).toBe('x+1');
    const n0 = events.length;
    el.focus({ edge: 'end' });
    mq.typedText('y');
    expect(el.value).toBe('x+1y');
    // left edge -> backward move-out; top edge -> upward
    mq.moveToLeftEnd();
    mq.keystroke('Left');
    mq.keystroke('Up');
    const fired = events.slice(n0);
    expect(fired).toContain('adapter:input');
    expect(fired).toContain('adapter:move-out:backward');
    expect(fired).toContain('adapter:move-out:upward');
  });

  it('adapter: Enter inserts a displaylines break', () => {
    const { el, mq } = mountAppField();
    el.value = 'x+1';
    el.focus({ edge: 'start' });
    mq.keystroke('Right'); // after 'x'
    pressEnter(mq); // keypress path -> handle('enter')
    expect(el.value).toBe('\\displaylines{x\\\\ +1}');
  });

  it('adapter: Shift+Enter fires new-cell, not a line break', () => {
    const { el } = mountAppField();
    const events: string[] = [];
    el.addEventListener('new-cell', () => events.push('adapter:new-cell'));
    el.value = 'x+1';
    el.focus({ edge: 'end' });
    key(el, { key: 'Enter', shiftKey: true });
    expect(events).toContain('adapter:new-cell');
    // no displaylines wrap — the keypress was suppressed before MQ saw it
    expect(el.value).toBe('x+1');
  });
});
