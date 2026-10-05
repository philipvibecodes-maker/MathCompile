import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// App-level matrix contract: the vendored environments patch is exercised
// through real keystrokes in a cell.

const cell = (page: Page, i = 0): Locator =>
  page.locator('math-field').nth(i);

const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { value: string }).value);

const setValue = (mf: Locator, latex: string) =>
  mf.evaluate(
    (el, l) => ((el as unknown as { value: string }).value = l),
    latex,
  );

const caretAncestor = (mf: Locator, selector: string): Promise<boolean> =>
  mf.evaluate((el, sel) => {
    const cursor = el.querySelector('.mq-cursor');
    return (cursor && el.querySelector(sel)?.contains(cursor)) ?? false;
  }, selector);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const mf = cell(page);
  await mf.waitFor();
  await mf.click();
  await mf.focus();
  await clearFirstCell(page);
});

test('\\begin{matrix} renders as a table inside the cell', async ({ page }) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await expect(mf.locator('.mq-matrix tr')).toHaveCount(2);
  await expect(mf.locator('.mq-matrix td')).toHaveCount(4);
  await expect(mf.locator('.mq-matrix .mq-paren')).toHaveCount(2);
  expect(await cellValue(mf)).toBe(
    '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}',
  );
});

test('typed \\cases opens a cases environment', async ({ page }) => {
  const mf = cell(page);
  await page.keyboard.type('\\cases');
  await page.keyboard.press('Enter');
  // Scope to the editable region — the `\cases` autocomplete preview
  // renders a real .mq-matrix inside the field too.
  await expect(
    mf.locator('.mq-editable-field .mq-matrix tr'),
  ).toHaveCount(2);
  expect(await cellValue(mf)).toBe('\\begin{cases}&\\\\&\\end{cases}');
});

test('typed \\array{spec} applies the column spec', async ({ page }) => {
  const mf = cell(page);
  await page.keyboard.type('\\array{cc}');
  expect(await cellValue(mf)).toBe('\\begin{array}{cc}&\\\\&\\end{array}');
});

test('Enter inside a matrix cell adds a row, not a displaylines wrap', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('ArrowLeft'); // step into the last cell (after d)
  // Caret inside the matrix (last cell, after d).
  expect(await caretAncestor(mf, '.mq-matrix')).toBe(true);
  await page.keyboard.press('Enter');
  const v = await cellValue(mf);
  expect(v).toContain('\\begin{pmatrix}');
  expect(v).not.toContain('displaylines');
  await expect(mf.locator('.mq-matrix tr')).toHaveCount(3);
});

test('Shift+Spacebar inside a matrix cell adds a column', async ({ page }) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{matrix}a&b\\\\c&d\\end{matrix}');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('ArrowLeft'); // step into the last cell
  await page.keyboard.press('Shift+Space');
  await expect(mf.locator('.mq-matrix td')).toHaveCount(6);
});

test('arrows move between matrix cells without leaving the field', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{matrix}a&b\\\\c&d\\end{matrix}');
  await page.locator('.add-expr').click();
  const second = cell(page, 1);
  await second.click();
  // Walk backwards through cell 0's matrix and confirm no cell hop happens
  // until the caret exits the matrix entirely.
  await mf.click();
  await page.keyboard.press('Control+Home');
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowRight');
  // Still in cell 0 — internal matrix navigation is MQ-owned.
  await page.waitForTimeout(80);
  await page.waitForFunction(
    () =>
      document
        .querySelectorAll('math-field')[0]
        ?.contains(document.activeElement),
  );
});
