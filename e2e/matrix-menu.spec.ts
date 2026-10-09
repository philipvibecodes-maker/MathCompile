import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// The matrix dimensions menu: a typed matrix-family command defers to a
// rows/columns popover (src/editor/matrix-menu.ts via the vendored
// matrixDimensionsMenu option) instead of dropping a default 2x2 grid.

const cell = (page: Page, i = 0): Locator =>
  page.locator('math-field').nth(i);

const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { value: string }).value);

const menu = (mf: Locator): Locator => mf.locator('.mc-mat');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const mf = cell(page);
  await mf.waitFor();
  await mf.click();
  await mf.focus();
  await clearFirstCell(page);
});

test('a typed \\pmatrix opens the menu; Enter inserts the default 2x2', async ({
  page,
}) => {
  const mf = cell(page);
  await page.keyboard.type('\\pmatrix');
  await page.keyboard.press('Enter');
  await expect(menu(mf)).toBeVisible();
  // The command is deferred — nothing is in the field yet.
  expect(await cellValue(mf)).toBe('');
  await page.keyboard.press('Enter');
  await expect(menu(mf)).toBeHidden();
  expect(await cellValue(mf)).toBe('\\begin{pmatrix}&\\\\&\\end{pmatrix}');
  // Caret lands in the first cell and keeps typing there.
  await page.keyboard.type('a');
  expect(await cellValue(mf)).toBe('\\begin{pmatrix}a&\\\\&\\end{pmatrix}');
});

test('entered dimensions size the grid', async ({ page }) => {
  const mf = cell(page);
  await page.keyboard.type('\\pmatrix');
  await page.keyboard.press('Enter');
  await expect(menu(mf)).toBeVisible();
  await page.keyboard.type('3');
  await page.keyboard.press('Tab');
  await page.keyboard.type('4');
  await page.keyboard.press('Enter');
  expect(await cellValue(mf)).toBe(
    '\\begin{pmatrix}&&&\\\\&&&\\\\&&&\\end{pmatrix}',
  );
});

test('ArrowUp/ArrowDown step the focused dimension', async ({ page }) => {
  const mf = cell(page);
  await page.keyboard.type('\\pmatrix');
  await page.keyboard.press('Enter');
  await expect(menu(mf)).toBeVisible();
  await page.keyboard.press('ArrowUp'); // rows 2 -> 3
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown'); // cols 2 -> 1
  await page.keyboard.press('Enter');
  await expect(mf.locator('.mq-editable-field .mq-matrix tr')).toHaveCount(3);
  await expect(mf.locator('.mq-editable-field .mq-matrix td')).toHaveCount(3);
});

test('Escape cancels and returns focus to the field', async ({ page }) => {
  const mf = cell(page);
  await page.keyboard.type('\\pmatrix');
  await page.keyboard.press('Enter');
  await expect(menu(mf)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu(mf)).toBeHidden();
  expect(await cellValue(mf)).toBe('');
  await page.keyboard.type('x');
  expect(await cellValue(mf)).toBe('x');
});

test('a typed \\begin{bmatrix} goes through the same menu', async ({
  page,
}) => {
  const mf = cell(page);
  await page.keyboard.type('\\begin{bmatrix}');
  await expect(menu(mf)).toBeVisible();
  await page.keyboard.press('Enter');
  expect(await cellValue(mf)).toBe('\\begin{bmatrix}&\\\\&\\end{bmatrix}');
});

test('a typed \\array{spec} keeps the spec through the menu', async ({
  page,
}) => {
  const mf = cell(page);
  await page.keyboard.type('\\array{cc}');
  await expect(menu(mf)).toBeVisible();
  await page.keyboard.press('Enter');
  expect(await cellValue(mf)).toBe('\\begin{array}{cc}&\\\\&\\end{array}');
});

test('a matrix inserted over a selection keeps the selection in the first cell', async ({
  page,
}) => {
  const mf = cell(page);
  await page.keyboard.type('x+1');
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+Shift+End');
  await page.keyboard.type('\\pmatrix');
  await page.keyboard.press('Enter');
  await expect(menu(mf)).toBeVisible();
  await page.keyboard.press('Enter');
  expect(await cellValue(mf)).toBe('\\begin{pmatrix}x+1&\\\\&\\end{pmatrix}');
});

test('content around the caret survives the insert', async ({ page }) => {
  const mf = cell(page);
  await page.keyboard.type('a+b');
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('\\pmatrix');
  await page.keyboard.press('Enter');
  await expect(menu(mf)).toBeVisible();
  await page.keyboard.press('Enter');
  expect(await cellValue(mf)).toBe(
    '\\begin{pmatrix}&\\\\&\\end{pmatrix}a+b',
  );
});

test('\\cases is not a matrix and skips the menu', async ({ page }) => {
  const mf = cell(page);
  await page.keyboard.type('\\cases');
  await page.keyboard.press('Enter');
  await expect(menu(mf)).toBeHidden();
  expect(await cellValue(mf)).toBe('\\begin{cases}&\\\\&\\end{cases}');
});
