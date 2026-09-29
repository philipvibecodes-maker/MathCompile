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
        selection(): { latex: string; startIndex: number; endIndex: number };
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
