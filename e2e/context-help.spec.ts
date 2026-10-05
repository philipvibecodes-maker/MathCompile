import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// The caret-context help strip under the focused cell: a .caret-help
// element appears inside .cell-input when the caret is inside a matrix
// or immediately beside one, and disappears when it isn't.

const cell = (page: Page, i = 0): Locator =>
  page.locator('math-field').nth(i);

const help = (page: Page): Locator => page.locator('.caret-help');

const setValue = (mf: Locator, latex: string) =>
  mf.evaluate(
    (el, l) => ((el as unknown as { value: string }).value = l),
    latex,
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const mf = cell(page);
  await mf.waitFor();
  await mf.click();
  await mf.focus();
  await clearFirstCell(page);
});

test('caret inside a matrix shows row/column editing hints', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('ArrowLeft'); // step into the last cell
  await expect(help(page)).toBeVisible();
  await expect(help(page)).toContainText('Enter');
  await expect(help(page)).toContainText('add a row');
  await expect(help(page)).toContainText('Shift+Space');
  await expect(help(page)).toContainText('add a column');
  await expect(help(page)).toContainText('Backspace');
});

test('caret left of a matrix shows determinant and trace hints', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+Home');
  await expect(help(page)).toBeVisible();
  await expect(help(page)).toContainText('det');
  await expect(help(page)).toContainText('determinant');
  await expect(help(page)).toContainText('trace');
});

test('caret right of a matrix shows transpose/adjoint/pinv hints', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+End');
  await expect(help(page)).toBeVisible();
  await expect(help(page)).toContainText('^T');
  await expect(help(page)).toContainText('transpose');
  await expect(help(page)).toContainText('adjoint');
  await expect(help(page)).toContainText('pseudoinverse');
});

test('the strip hides when the caret is in a plain position', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, 'x+1');
  await page.keyboard.press('Control+End');
  await expect(help(page)).toHaveCount(0);
});

test('the strip follows the caret out of and back into a matrix', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+End');
  await expect(help(page)).toContainText('transpose');
  await page.keyboard.press('ArrowLeft'); // into the matrix
  await expect(help(page)).toContainText('add a row');
  await page.keyboard.press('Control+Home'); // left edge
  await expect(help(page)).toContainText('determinant');
});
