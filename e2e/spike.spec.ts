import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    spike: {
      mq: {
        latex(): string;
        latex(s: string): void;
        write(s: string): void;
        typedText(s: string): void;
        keystroke(k: string): void;
        focus(): void;
        moveToLeftEnd(): void;
        moveToRightEnd(): void;
        insertLineBreak(): void;
        config(o: { dIsDerivative?: boolean }): void;
        selection(): { latex: string; startIndex: number; endIndex: number };
      };
      adapter: {
        value: string;
        mq?: {
          latex(): string;
          typedText(s: string): void;
          keystroke(k: string): void;
          moveToLeftEnd(): void;
          moveToRightEnd(): void;
        };
        focus(o?: { edge?: 'start' | 'end' }): void;
        config(o: Record<string, unknown>): void;
      };
      el: HTMLElement;
      events: string[];
      watchFocus(): void;
      getFocusWatch(): { t: number; tag: string; id: string }[];
    };
  }
}

const spike = <T>(page: Page, fn: () => T) => page.evaluate(fn);

test.beforeEach(async ({ page }) => {
  await page.goto('/spike.html');
  await page.waitForFunction(() => !!window.spike);
});

test('autoCommands convert int/sum/sqrt inline', async ({ page }) => {
  const latex = await spike(page, () => {
    const { mq } = window.spike;
    const out: Record<string, string> = {};
    for (const word of ['int', 'sum', 'sqrt', 'prod']) {
      mq.latex('');
      for (const ch of word) mq.typedText(ch);
      out[word] = mq.latex();
    }
    return out;
  });
  expect(latex).toEqual({
    int: expect.stringContaining('\\int'),
    sum: expect.stringContaining('\\sum'),
    sqrt: expect.stringContaining('\\sqrt'),
    prod: expect.stringContaining('\\prod'),
  });
});

test('.write preserves empty blocks; caret traverses sub then sup', async ({
  page,
}) => {
  const r = await spike(page, () => {
    const { mq } = window.spike;
    mq.latex('');
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
    return { afterWrite, stops, latex: mq.latex() };
  });
  // Empty sub/sup blocks round-trip (MQ serializes them as `_{ }`/`^{ }`).
  expect(r.afterWrite.latex).toContain('_{ }');
  expect(r.afterWrite.latex).toContain('^{ }');
  // Traversal order in `\int_{ }^{ }`: the caret should visit the sub block
  // (index inside `_{ }`) before the sup block (index inside `^{ }`).
  const subIdx = r.afterWrite.latex.indexOf('_{') + 2;
  const supIdx = r.afterWrite.latex.indexOf('^{') + 2;
  expect(r.stops.indexOf(subIdx)).toBeGreaterThanOrEqual(0);
  expect(r.stops.indexOf(supIdx)).toBeGreaterThanOrEqual(0);
  expect(r.stops.indexOf(subIdx)).toBeLessThan(r.stops.indexOf(supIdx));
});

test('focus lands on hidden textarea inside the field', async ({ page }) => {
  const r = await spike(page, () => {
    const { mq, el } = window.spike;
    mq.focus();
    const ae = document.activeElement;
    return {
      tag: ae?.tagName,
      inside: el.contains(ae),
      cls: ae?.getAttribute('class'),
    };
  });
  expect(r.tag).toBe('TEXTAREA');
  expect(r.inside).toBe(true);
});

test('no deferred focus steal after handing focus elsewhere', async ({
  page,
}) => {
  const r = await spike(page, () => {
    const { mq } = window.spike;
    window.spike.watchFocus();
    mq.focus();
    const other = document.getElementById('other')!;
    other.focus();
    return new Promise((res) =>
      setTimeout(
        () =>
          res({
            final: (document.activeElement as HTMLElement)?.id,
            watch: window.spike.getFocusWatch(),
          }),
        250,
      ),
    );
  });
  expect(r.final).toBe('other');
  // No transition back to the hidden textarea after `other` took focus
  // (MathLive's deferred ~60ms refocus would show up here).
  const lastOther = r.watch.map((w) => w.id).lastIndexOf('other');
  const stolen = r.watch.slice(lastOther + 1);
  expect(stolen, `focus watch: ${JSON.stringify(r.watch)}`).toEqual([]);
});

test('capture keydown sees shiftKey; enter/upOutOf/downOutOf/moveOutOf fire', async ({
  page,
}) => {
  await spike(page, () => {
    window.spike.mq.latex('x');
    window.spike.mq.focus();
  });
  // Make sure the hidden textarea is really focused before key events.
  await expect
    .poll(() =>
      spike(page, () => window.spike.el.contains(document.activeElement)),
    )
    .toBe(true);

  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await spike(page, () => window.spike.mq.moveToLeftEnd());
  await page.keyboard.press('ArrowLeft');

  const events = await spike(page, () => [...window.spike.events]);
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

// --- Phase 1: vendored environments patch ---

test('\\begin{matrix} parses, renders as a table, and round-trips', async ({
  page,
}) => {
  const r = await spike(page, () => {
    const { mq, el } = window.spike;
    mq.latex('\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
    return {
      latex: mq.latex(),
      tds: el.querySelectorAll('.mq-matrix td').length,
      parens: el.querySelectorAll('.mq-matrix .mq-paren').length,
      rows: el.querySelectorAll('.mq-matrix tr').length,
    };
  });
  expect(r.latex).toBe('\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  expect(r.rows).toBe(2);
  expect(r.tds).toBe(4);
  expect(r.parens).toBe(2);
});

test('insertLineBreak inside a matrix cell adds a row', async ({ page }) => {
  const r = await spike(page, () => {
    const { mq } = window.spike;
    mq.latex('\\begin{matrix}a&b\\\\c&d\\end{matrix}');
    mq.focus();
    // Caret lands in the last cell (d) after entering from the right.
    mq.keystroke('Left');
    mq.insertLineBreak();
    return { latex: mq.latex() };
  });
  expect(r.latex).toBe('\\begin{matrix}a&b\\\\c&d\\\\&\\end{matrix}');
});

test('insertLineBreak at top level wraps content in \\displaylines', async ({
  page,
}) => {
  const r = await spike(page, () => {
    const { mq } = window.spike;
    mq.latex('x+1');
    mq.moveToLeftEnd();
    mq.keystroke('Right'); // caret after 'x'
    mq.insertLineBreak();
    return { latex: mq.latex(), sel: mq.selection() };
  });
  expect(r.latex).toBe('\\displaylines{x\\\\ +1}');
});

test('insertLineBreak inside displaylines splits the row', async ({ page }) => {
  const r = await spike(page, () => {
    const { mq } = window.spike;
    mq.latex('\\displaylines{x\\\\ +1}');
    mq.focus();
    mq.keystroke('Left'); // enter env -> right end of last row ('+1')
    mq.keystroke('Left'); // caret between '+' and '1'
    mq.insertLineBreak();
    return { latex: mq.latex(), rows: mq.latex().split('\\\\').length };
  });
  expect(r.latex).toBe('\\displaylines{x\\\\ +\\\\ 1}');
});

test('Shift-Spacebar in a matrix cell adds a column', async ({ page }) => {
  const r = await spike(page, () => {
    const { mq, el } = window.spike;
    mq.latex('\\begin{matrix}a&b\\\\c&d\\end{matrix}');
    mq.focus();
    mq.keystroke('Left'); // caret into last cell (d)
    mq.keystroke('Shift-Spacebar');
    return { latex: mq.latex(), tds: el.querySelectorAll('.mq-matrix td').length };
  });
  expect(r.tds).toBe(6);
  expect(r.latex).toBe('\\begin{matrix}a&b&\\\\c&d&\\end{matrix}');
});

test('\\derivative expands to a real fraction with caret in the denominator', async ({
  page,
}) => {
  const r = await spike(page, () => {
    const { mq } = window.spike;
    mq.latex('');
    mq.typedText('\\');
    for (const ch of 'derivative') mq.typedText(ch);
    mq.keystroke('Enter'); // renderCommand -> expansion
    const latex = mq.latex();
    mq.typedText('f');
    return { latex, after: mq.latex() };
  });
  expect(r.latex).toBe('\\frac{d}{d}');
  expect(r.after).toBe('\\frac{d}{df}');
});

test('with dIsDerivative off, \\derivative expands to D()', async ({ page }) => {
  const r = await spike(page, () => {
    const { mq } = window.spike;
    mq.config({ dIsDerivative: false });
    mq.latex('');
    mq.typedText('\\');
    for (const ch of 'derivative') mq.typedText(ch);
    mq.keystroke('Enter');
    const latex = mq.latex();
    mq.typedText('f');
    mq.config({ dIsDerivative: true });
    return { latex, after: mq.latex() };
  });
  expect(r.latex).toBe('D()');
  expect(r.after).toBe('D(f)');
});

// --- Phase 2: <math-field> adapter element ---

test('<math-field> adapter: value round-trip, input and move-out events', async ({
  page,
}) => {
  const r = await spike(page, () => {
    const { adapter, events } = window.spike;
    adapter.value = 'x+1';
    const initial = adapter.value;
    const n0 = events.length;
    adapter.focus({ edge: 'end' });
    adapter.mq!.typedText('y');
    const afterType = adapter.value;
    // left edge -> backward move-out; top edge -> upward
    adapter.mq!.moveToLeftEnd();
    adapter.mq!.keystroke('Left');
    adapter.mq!.keystroke('Up');
    return { initial, afterType, events: events.slice(n0) };
  });
  expect(r.initial).toBe('x+1');
  expect(r.afterType).toBe('x+1y');
  expect(r.events).toContain('adapter:input');
  expect(r.events).toContain('adapter:move-out:backward');
  expect(r.events).toContain('adapter:move-out:upward');
});

test('<math-field> adapter: Enter inserts a displaylines break', async ({
  page,
}) => {
  const r = await spike(page, () => {
    const { adapter } = window.spike;
    adapter.value = 'x+1';
    adapter.focus({ edge: 'start' });
    adapter.mq!.keystroke('Right'); // after 'x'
    adapter.mq!.typedText('\n'); // keypress path -> handle('enter')
    return { latex: adapter.value };
  });
  expect(r.latex).toBe('\\displaylines{x\\\\ +1}');
});

test('<math-field> adapter: Shift+Enter fires new-cell, not a line break', async ({
  page,
}) => {
  const events = await spike(page, () => {
    const { adapter, events } = window.spike;
    adapter.value = 'x+1';
    adapter.focus({ edge: 'end' });
    events.length = 0;
    // simulate the real key event path end-to-end
    const ta = adapter.querySelector('textarea')!;
    ta.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    return { events: [...events], latex: adapter.value };
  });
  expect(events.events).toContain('adapter:new-cell');
  // no displaylines wrap — the keypress was suppressed before MQ saw it
  expect(events.latex).toBe('x+1');
});
