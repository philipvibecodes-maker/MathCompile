// Editor-engine head-to-head: the app's vendored-MathQuill <math-field>
// element vs stock MathLive <math-field>, measured with the same
// keydown->paint methodology as the app battery (perf/measure.ts).
//
// Each backend is its own page (mq.html / ml.html) bundling only its
// engine, so startup byte counts are apples-to-apples. The spec drives
// both through the shared window.bench surface; metric names carry the
// backend so one results JSON holds both sides:
//
//   npm run test:perf:editor
//   node perf/compare.mjs editor-bench
//
// Smart mode is off in both harnesses — the probes measure raw
// keystroke->paint, and the KEYS alphabet can't form inline shortcuts.

import { expect, test, type Page } from '@playwright/test';
import { flush, installInputClock, record, timed } from '../measure';

const BACKENDS = [
  { name: 'mathquill', path: '/mq.html' },
  { name: 'mathlive', path: '/ml.html' },
] as const;

// Letters separated by digits so no two form an inline shortcut.
const KEYS = 'x7m4k1z9q2w8v6y3t5'.split('');

interface Bench {
  inputCount(): number;
  count(): number;
  getValue(i?: number): string;
  setValue(i: number, latex: string): void;
  focus(i: number, edge?: 'start' | 'end'): void;
  mountOne(): number;
}

type BenchWindow = { bench: Bench };

const field = (page: Page, i = 0) => page.locator('math-field').nth(i);

const valueAt = (page: Page, i = 0): Promise<string> =>
  page.evaluate(
    (idx) => (window as unknown as BenchWindow).bench.getValue(idx),
    i,
  );

// Serialized latex is NOT monotonic under editing: MathLive canonicalizes
// lazily (x^{2} -> x^2, dropped spaces) on the first mutation after a
// setValue seed, so a typed char can land while the length shrinks. Same
// reason the app battery waits on committedToOutput, not length. A
// printing/backspace keystroke always changes the value, so `!==` is the
// correct outcome.
const valueChanges = (page: Page, i: number, before: string) => () =>
  page.waitForFunction(
    ([idx, n]) =>
      (window as unknown as BenchWindow).bench.getValue(idx as number) !==
      (n as string),
    [i, before] as const,
  );

const waitFocused = (page: Page, i: number) =>
  page.waitForFunction((idx) => {
    const el = document.querySelectorAll('math-field')[idx];
    const ae = document.activeElement;
    // === covers shadow-DOM hosts (MathLive reports the host); contains()
    // covers editors with a light-DOM inner textarea (MathQuill).
    return ae === el || el?.contains(ae) === true;
  }, i);

const focusField = async (page: Page, i: number, edge: 'start' | 'end' = 'end') => {
  await page.evaluate(
    ([idx, e]) =>
      (window as unknown as BenchWindow).bench.focus(
        idx as number,
        e as 'start' | 'end',
      ),
    [i, edge] as const,
  );
  await waitFocused(page, i);
  await page.waitForTimeout(150);
};

const heapMB = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      ((performance as unknown as { memory?: { usedJSHeapSize: number } })
        .memory?.usedJSHeapSize ?? 0) /
      1024 /
      1024,
  );

const gotoBench = async (page: Page, path: string) => {
  await installInputClock(page);
  await page.goto(path);
  await page.waitForSelector('math-field');
  await page.waitForFunction(() => (window as unknown as BenchWindow).bench);
  await page.waitForTimeout(150);
};

test.afterAll(() => flush('editor'));

for (const b of BACKENDS) {
  test(`startup: bytes, first paint, heap (${b.name})`, async ({
    browser,
  }) => {
    for (let i = 0; i < 4; i++) {
      const page = await browser.newPage();
      try {
        await page.goto(b.path, { waitUntil: 'commit' });
        const t = await page.evaluate(async () => {
          await new Promise<void>((res) => {
            if (document.querySelector('math-field')) return res();
            new MutationObserver((_, obs) => {
              if (document.querySelector('math-field')) {
                obs.disconnect();
                res();
              }
            }).observe(document.documentElement, {
              childList: true,
              subtree: true,
            });
          });
          const painted = await new Promise<number>((res) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => res(performance.now())),
            ),
          );
          const res = performance.getEntriesByType(
            'resource',
          ) as PerformanceResourceTiming[];
          const jsBytes = res
            .filter((r) => r.initiatorType === 'script')
            .reduce((a, r) => a + (r.transferSize || r.encodedBodySize), 0);
          const allBytes = res.reduce(
            (a, r) => a + (r.transferSize || r.encodedBodySize),
            0,
          );
          const heapMB =
            (performance as unknown as { memory?: { usedJSHeapSize: number } })
              .memory?.usedJSHeapSize ?? 0;
          return { painted, jsBytes, allBytes, heapMB: heapMB / 1024 / 1024 };
        });
        record(`startup.paint ${b.name}`, t.painted);
        record(`startup.js-bytes ${b.name}`, t.jsBytes);
        record(`startup.all-bytes ${b.name}`, t.allBytes);
        record(`startup.heap-MB ${b.name}`, t.heapMB);
      } finally {
        await page.close();
      }
    }
  });

  test(`keystroke -> paint, single field (${b.name})`, async ({ page }) => {
    await gotoBench(page, b.path);
    await focusField(page, 0);
    await field(page).pressSequentially('w1a2r3m4');
    for (let i = 0; i < 30; i++) {
      const before = await valueAt(page);
      const { ms } = await timed(
        page,
        () => page.keyboard.press(KEYS[i % KEYS.length]),
        { until: valueChanges(page, 0, before) },
      );
      record(`typing.paint ${b.name}`, ms);
    }
    const expected =
      'w1a2r3m4' +
      Array.from({ length: 30 }, (_, i) => KEYS[i % KEYS.length]).join('');
    expect(await valueAt(page)).toBe(expected);
  });

  test(`keystroke -> input event + serialized read (${b.name})`, async ({
    page,
  }) => {
    // The app's commit path: input event dispatch + getValue() read.
    await gotoBench(page, b.path);
    await focusField(page, 0);
    await field(page).pressSequentially('x');
    for (let i = 0; i < 10; i++) {
      const beforeInputs = await page.evaluate(() =>
        (window as unknown as BenchWindow).bench.inputCount(),
      );
      const beforeValue = await valueAt(page);
      const { ms } = await timed(
        page,
        () => page.keyboard.press(KEYS[i % KEYS.length]),
        {
          until: () =>
            page.waitForFunction(
              ([pi, pv]) => {
                const bench = (window as unknown as BenchWindow).bench;
                return (
                  bench.inputCount() > (pi as number) &&
                  bench.getValue(0) !== (pv as string)
                );
              },
              [beforeInputs, beforeValue] as const,
            ),
        },
      );
      record(`typing.commit ${b.name}`, ms);
    }
  });

  test(`keystroke -> paint with 30 fields mounted (${b.name})`, async ({
    page,
  }) => {
    await gotoBench(page, b.path);
    await page.evaluate(() => {
      const bench = (window as unknown as BenchWindow).bench;
      while (bench.count() < 30) bench.mountOne();
    });
    await expect(page.locator('math-field')).toHaveCount(30);
    await focusField(page, 0);
    await field(page).pressSequentially('w1a2r3m4');
    for (let i = 0; i < 20; i++) {
      const before = await valueAt(page);
      const { ms } = await timed(
        page,
        () => page.keyboard.press(KEYS[i % KEYS.length]),
        { until: valueChanges(page, 0, before) },
      );
      record(`typing.paint-30fields ${b.name}`, ms);
    }
    record(`editor.heap-MB-30fields ${b.name}`, await heapMB(page));
  });

  test(`keystroke -> paint inside a complex expression (${b.name})`, async ({
    page,
  }) => {
    await gotoBench(page, b.path);
    await page.evaluate(() =>
      (window as unknown as BenchWindow).bench.setValue(
        0,
        '\\int_{a}^{b} x^{2} + \\frac{1}{2}',
      ),
    );
    await focusField(page, 0, 'end');
    for (let i = 0; i < 15; i++) {
      const before = await valueAt(page);
      const { ms } = await timed(
        page,
        () => page.keyboard.press(KEYS[i % KEYS.length]),
        { until: valueChanges(page, 0, before) },
      );
      record(`typing.complex-expr ${b.name}`, ms);
    }
  });

  test(`keystroke -> paint inside a nested \\frac (${b.name})`, async ({
    page,
  }) => {
    await gotoBench(page, b.path);
    await page.evaluate(() =>
      (window as unknown as BenchWindow).bench.setValue(0, '\\frac{1+x}{y}'),
    );
    await focusField(page, 0, 'start');
    // One ArrowRight descends into the fraction's first branch in both
    // engines; where exactly the caret lands doesn't matter — the metric
    // is the repaint cost of editing inside nested structure.
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 10; i++) {
      const before = await valueAt(page);
      const { ms } = await timed(
        page,
        () => page.keyboard.press(KEYS[i % KEYS.length]),
        { until: valueChanges(page, 0, before) },
      );
      record(`typing.nested-frac ${b.name}`, ms);
    }
    expect(await valueAt(page)).toContain('frac');
  });

  test(`backspace -> paint (${b.name})`, async ({ page }) => {
    await gotoBench(page, b.path);
    await focusField(page, 0);
    await field(page).pressSequentially('x7m4k1z9q2w8v6y3t5');
    for (let i = 0; i < 10; i++) {
      const before = await valueAt(page);
      const { ms } = await timed(page, () => page.keyboard.press('Backspace'), {
        until: valueChanges(page, 0, before),
      });
      record(`typing.backspace ${b.name}`, ms);
    }
  });

  test(`setValue -> paint, long latex (${b.name})`, async ({ page }) => {
    await gotoBench(page, b.path);
    const body =
      '\\sum_{i=0}^{n} i^{2} + \\int_{a}^{b} x^{2}\\,dx + ' +
      '\\prod_{k=1}^{m} k + \\frac{' +
      'a+'.repeat(40) +
      'b}{' +
      'c+'.repeat(30) +
      'd}';
    // Outcome = the alternating tail marker visible in the serialized
    // value — canonicalizing editors shrink the length, so no `>=`
    // comparison survives both backends.
    for (let i = 0; i < 10; i++) {
      const marker = i % 2 === 0 ? 'p' : 'q';
      const latex = body + marker;
      const { ms } = await timed(
        page,
        () =>
          page.evaluate(
            (l) => (window as unknown as BenchWindow).bench.setValue(0, l),
            latex,
          ),
        {
          until: () =>
            page.waitForFunction(
              (m) =>
                (window as unknown as BenchWindow).bench
                  .getValue(0)
                  .endsWith(m as string),
              marker,
            ),
        },
      );
      record(`editor.setValue-paint ${b.name}`, ms);
    }
  });

  test(`getValue() read cost, long document (${b.name})`, async ({ page }) => {
    await gotoBench(page, b.path);
    await page.evaluate(() =>
      (window as unknown as BenchWindow).bench.setValue(
        0,
        '\\int_{a}^{b} x^{2}\\,dx + \\frac{' +
          'a+'.repeat(40) +
          'b}{' +
          'c+'.repeat(30) +
          'd}',
      ),
    );
    // Synchronous read loop in-page — no per-read CDP overhead in the
    // number; this is what the app's onChange pays per keystroke.
    const perRead = await page.evaluate(() => {
      const bench = (window as unknown as BenchWindow).bench;
      bench.getValue(0); // warm
      const t0 = performance.now();
      let s = 0;
      for (let k = 0; k < 200; k++) s += bench.getValue(0).length;
      return { ms: (performance.now() - t0) / 200, s };
    });
    expect(perRead.s).toBeGreaterThan(0);
    record(`editor.getValue-ms ${b.name}`, perRead.ms);
  });

  test(`mount -> paint per extra field (${b.name})`, async ({ page }) => {
    await gotoBench(page, b.path);
    for (let i = 0; i < 12; i++) {
      const n = await page.evaluate(() =>
        (window as unknown as BenchWindow).bench.count(),
      );
      const { ms } = await timed(
        page,
        () =>
          page.evaluate(() =>
            (window as unknown as BenchWindow).bench.mountOne(),
          ),
        {
          until: () =>
            page.waitForFunction(
              (c) =>
                (window as unknown as BenchWindow).bench.count() ===
                (c as number),
              n + 1,
            ),
        },
      );
      record(`editor.mount-paint ${b.name}`, ms);
    }
  });

  test(`focus switch -> landed + painted (${b.name})`, async ({ page }) => {
    await gotoBench(page, b.path);
    await page.evaluate(() =>
      (window as unknown as BenchWindow).bench.mountOne(),
    );
    await focusField(page, 0);
    for (let i = 0; i < 10; i++) {
      const target = (i + 1) % 2;
      const { ms } = await timed(
        page,
        () =>
          page.evaluate(
            (idx) => (window as unknown as BenchWindow).bench.focus(idx),
            target,
          ),
        { until: () => waitFocused(page, target) },
      );
      record(`editor.focus-paint ${b.name}`, ms);
    }
  });
}
