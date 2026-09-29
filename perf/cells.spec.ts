// Structural cell operations: insert (Shift+Enter), delete button, edge
// navigation (ArrowDown -> next cell / new cell), and in-cell line breaks
// (Enter -> \displaylines). These exercise document-model + focus ownership
// paths rather than per-keystroke cost.

import { expect, test } from '@playwright/test';
import {
  SEL,
  cell,
  cellCount,
  cellValue,
  focusCell,
  seedCells,
  settleFocus,
  valueLen,
  waitFocusedIndex,
} from './contract';
import { flush, installInputClock, nextPaint, record, timed } from './measure';

test.beforeEach(async ({ page }) => {
  await installInputClock(page);
  await page.goto('/');
  await page.waitForSelector(SEL.cell);
  await cell(page).click();
  await settleFocus(page);
});

test.afterAll(() => flush('cells'));

test('Shift+Enter -> new cell painted + focused', async ({ page }) => {
  for (let i = 0; i < 10; i++) {
    const n = await cellCount(page);
    const { ms, t0 } = await timed(
      page,
      () => page.keyboard.press('Shift+Enter'),
      {
        until: () =>
          page.waitForFunction(
            (c) => document.querySelectorAll('math-field').length === c,
            n + 1,
          ),
      },
    );
    record('cells.insert-paint', ms);
    // Same action, second outcome: focus landing on the new cell. (Focus is
    // async — MathLive defers internally — so this samples the full channel.)
    await waitFocusedIndex(page, n);
    record('cells.insert-focus', (await nextPaint(page)) - t0);
    expect(await cellValue(cell(page, n))).toBe('');
    await page.waitForTimeout(80); // stay clear of the refocus-steal window
  }
});

test('delete button -> row removed + repaint', async ({ page }) => {
  await seedCells(page, 12);
  for (let i = 0; i < 8; i++) {
    const n = await cellCount(page);
    const { ms } = await timed(
      page,
      () => page.locator(SEL.deleteButton).nth(n - 1).click(),
      {
        until: () =>
          page.waitForFunction(
            (c) => document.querySelectorAll('math-field').length === c,
            n - 1,
          ),
      },
    );
    record('cells.delete-paint', ms);
  }
  // 12 seeded - 8 deleted; survivors keep their content. (seedCells fills
  // the rows it adds, so 0 is the app's initial empty cell.)
  expect(await cellCount(page)).toBe(4);
  for (const i of [1, 2, 3])
    expect(await cellValue(cell(page, i))).toBe('x');
});

test('ArrowDown at cell edge -> next cell focused', async ({ page }) => {
  await seedCells(page, 8);
  await focusCell(page, 0);
  await page.keyboard.press('End');
  for (let i = 0; i < 7; i++) {
    const { ms } = await timed(
      page,
      () => page.keyboard.press('ArrowDown'),
      { until: () => waitFocusedIndex(page, i + 1) },
    );
    record('cells.edge-nav-focus', ms);
    await page.waitForTimeout(80);
  }
  // Past the last cell: hop creates a new cell — composite metric.
  const n = await cellCount(page);
  const { ms } = await timed(page, () => page.keyboard.press('ArrowDown'), {
    until: () =>
      page.waitForFunction(
        (c) => document.querySelectorAll('math-field').length === c,
        n + 1,
      ),
  });
  record('cells.edge-nav-append', ms);
  await waitFocusedIndex(page, n); // the appended cell takes focus
});

test('Enter -> line split painted', async ({ page }) => {
  await cell(page).pressSequentially('x');
  for (let i = 0; i < 6; i++) {
    const before = await valueLen(page, 0);
    const { ms } = await timed(page, () => page.keyboard.press('Enter'), {
      until: () =>
        page.waitForFunction(
          (n) =>
            (
              document.querySelector('math-field') as unknown as {
                getValue(): string;
              }
            ).getValue().length > n,
          before,
        ),
    });
    record('cells.linebreak-paint', ms);
  }
  // Enter produced a real multi-line environment, not just a longer value.
  expect(await cellValue(cell(page))).toContain('\\displaylines');
});
