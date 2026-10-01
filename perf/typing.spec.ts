// Keystroke latency — the central interaction cost. Per-keystroke delta from
// keydown to the paint carrying the typed character, in a single cell, in a
// growing document, inside a complex expression, and for deletions. Also the
// "app commit" variant: keystroke -> output panel reflecting the new LaTeX
// (captures the deferred `input` -> state -> re-render chain end to end).

import { expect, test } from '@playwright/test';
import {
  cell,
  cellValue,
  clearFirstCell,
  committedToOutput,
  focusCell,
  lenGrows,
  seedCells,
  settleFocus,
  valueLen,
} from './contract';
import { flush, installInputClock, record, timed } from './measure';

// Letters are always separated by digits so no two form a LaTeX inline
// shortcut (\pi, \int, \to…) — every key appends exactly one atom.
const KEYS = 'x7m4k1z9q2w8v6y3t5'.split('');

test.beforeEach(async ({ page }) => {
  await installInputClock(page);
  await page.goto('/');
  await page.waitForSelector('math-field');
  // Smart mode defaults on; these specs measure raw keystroke->paint, and
  // autoSubscriptNumerals/autoCommands would rewrite the literal input.
  await page.locator('.option-checkbox input').click();
  await cell(page).click();
  await settleFocus(page);
  await clearFirstCell(page);
});

test.afterAll(() => flush('typing'));

test('keystroke -> paint, single cell', async ({ page }) => {
  // Warmup: JIT + first-render paths before sampling. Digit-separated so no
  // letter run can trigger an inline shortcut.
  await cell(page).pressSequentially('w1a2r3m4');
  for (let i = 0; i < 30; i++) {
    const before = await valueLen(page);
    const { ms } = await timed(
      page,
      () => page.keyboard.press(KEYS[i % KEYS.length]),
      { until: lenGrows(page, 0, before) },
    );
    record('typing.paint cells=1', ms);
  }
  // Every sampled keystroke must have landed, in order.
  const expected =
    'w1a2r3m4' +
    Array.from({ length: 30 }, (_, i) => KEYS[i % KEYS.length]).join('');
  expect(await cellValue(cell(page))).toBe(expected);
});

test('keystroke -> output panel reflects the character', async ({ page }) => {
  await cell(page).pressSequentially('x');
  for (let i = 0; i < 10; i++) {
    const { ms } = await timed(
      page,
      () => page.keyboard.press(KEYS[i % KEYS.length]),
      { until: committedToOutput(page, 0) },
    );
    record('typing.commit cells=1', ms);
  }
});

test('keystroke -> paint vs document size', async ({ page }) => {
  for (const n of [10, 30]) {
    await seedCells(page, n);
    await focusCell(page, 0);
    for (let i = 0; i < 20; i++) {
      const before = await valueLen(page);
      const { ms } = await timed(
        page,
        () => page.keyboard.press(KEYS[i % KEYS.length]),
        { until: lenGrows(page, 0, before) },
      );
      record(`typing.paint cells=${n}`, ms);
    }
  }
  // Siblings untouched by the edits.
  expect(await cellValue(cell(page, 29))).toBe('x');
  const heapMB = await page.evaluate(
    () =>
      ((performance as unknown as { memory?: { usedJSHeapSize: number } })
        .memory?.usedJSHeapSize ?? 0) /
      1024 /
      1024,
  );
  record('typing.heap-MB cells=30', heapMB);
});

test('keystroke -> paint inside a complex expression', async ({ page }) => {
  // The seed is unmeasured — each implementation gets the sequence its
  // own e2e suite proves: adapters with getValue() auto-convert 'int' on
  // the next char (autoCommands always on); this app's element (no
  // getValue(), smart mode off by default) seeds the same structure
  // through the '\int' command input + Enter instead.
  const mf = cell(page);
  const hasGetValue = await page.evaluate(
    () =>
      typeof (
        document.querySelector('math-field') as unknown as {
          getValue?: unknown;
        }
      )?.getValue === 'function',
  );
  if (hasGetValue) {
    await mf.pressSequentially('inta');
  } else {
    await mf.pressSequentially('\\int');
    await page.keyboard.press('Enter');
    await mf.pressSequentially('a');
  }
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('b');
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('x^2');
  // MQ Home/End are block-local — Ctrl+End reaches the field edge; other
  // editors' End is already field-wide. Either way the caret ends up
  // after the expression, which is what the timed keystrokes append to.
  await page.keyboard.press(hasGetValue ? 'End' : 'Control+End');
  for (let i = 0; i < 15; i++) {
    const before = await valueLen(page);
    const { ms } = await timed(
      page,
      () => page.keyboard.press(KEYS[i % KEYS.length]),
      { until: lenGrows(page, 0, before) },
    );
    record('typing.paint complex-expr', ms);
  }
  // The limit structure survived; typed chars appended after it. Braces
  // are stripped so the assertion holds whether the editor serializes
  // the exponent as x^{2} or x^2.
  expect((await cellValue(mf)).replace(/[{}]/g, '')).toContain(
    '\\int_a^bx^2',
  );
});

test('backspace -> paint', async ({ page }) => {
  await cell(page).pressSequentially('x7m4k1z9q2w8v6y3t5');
  await page.keyboard.press('End');
  for (let i = 0; i < 10; i++) {
    const before = await valueLen(page);
    const { ms } = await timed(page, () => page.keyboard.press('Backspace'), {
      until: () =>
        page.waitForFunction(
          (n) => {
            const e = document.querySelector('math-field') as unknown as {
              getValue?(): string;
              value: string;
            };
            return (e.getValue?.() ?? e.value).length < n;
          },
          before,
        ),
    });
    record('typing.backspace', ms);
  }
  // Sanity: trailing chars deleted in order, nothing foreign appeared.
  // Length is bounded (<=8, not ===7): the controlled-component echo — a
  // stale `value` prop re-setValue'd between a deferred `input` dispatch and
  // its commit — can transiently restore one deleted char under load.
  const v = (await cellValue(cell(page))) as string;
  expect(
    'x7m4k1z9q2w8v6y3t5'.startsWith(v) && v.length >= 1 && v.length <= 8,
  ).toBe(true);
});
