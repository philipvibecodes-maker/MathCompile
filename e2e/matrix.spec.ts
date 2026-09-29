import { expect, test } from '@playwright/test';
import { cell, cellValue, waitFocusedIndex } from './helpers';

// Matrix/environment support — the reason for vendoring MathQuill: the
// Learnosity \begin{*matrix} port plus \displaylines multi-line cells.
// Pinned here through the app's own surface: typing, keys, serialization.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
  await cell(page, 0).click();
});

test('typing \\begin inserts a fresh pmatrix', async ({ page }) => {
  // Enter completes the pending \begin command, which drops a fresh
  // pmatrix (2 rows x 3 cols) with the caret in the first cell.
  await cell(page, 0).pressSequentially('\\begin', { delay: 60 });
  await page.keyboard.press('Enter');
  await expect(cell(page, 0).locator('.mq-matrix')).toBeVisible();
  await expect(cell(page, 0).locator('.mq-matrix tr')).toHaveCount(2);
  expect(await cellValue(cell(page, 0))).toBe(
    '\\begin{pmatrix}&&\\\\&&\\end{pmatrix}',
  );
});

test('pasted \\begin{pmatrix} latex parses to a rendered matrix', async ({
  page,
}) => {
  await cell(page, 0).evaluate((el) =>
    (el as unknown as { setValue(v: string): void }).setValue(
      '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}',
    ),
  );
  await expect(cell(page, 0).locator('.mq-matrix tr')).toHaveCount(2);
  await expect(cell(page, 0).locator('.mq-matrix td')).toHaveCount(4);
  // Delimiters rendered for pmatrix.
  await expect(
    cell(page, 0).locator('.mq-matrix').first(),
  ).toBeVisible();
});

test('Enter inside a matrix adds a row instead of splitting lines', async ({
  page,
}) => {
  await cell(page, 0).evaluate((el) =>
    (el as unknown as { setValue(v: string): void }).setValue(
      '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}',
    ),
  );
  // Caret lands wherever setValue left it; click the matrix to focus, then
  // Enter from inside a cell must add a row, not a \displaylines.
  await cell(page, 0).locator('.mq-matrix td').first().click();
  await page.keyboard.press('Enter');
  await expect(cell(page, 0).locator('.mq-matrix tr')).toHaveCount(3);
  const v = await cellValue(cell(page, 0));
  expect(v).toContain('\\begin{pmatrix}');
  expect(v).not.toContain('displaylines');
});

test('matrix cells navigate with arrows and serialize edits', async ({
  page,
}) => {
  await cell(page, 0).evaluate((el) =>
    (el as unknown as { setValue(v: string): void }).setValue(
      '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}',
    ),
  );
  await cell(page, 0).locator('.mq-matrix td').first().click();
  // Type into the clicked cell, then ArrowRight to the next cell.
  await cell(page, 0).pressSequentially('9', { delay: 40 });
  await page.keyboard.press('End'); // block-local: end of this cell
  await page.keyboard.press('ArrowRight');
  await cell(page, 0).pressSequentially('8', { delay: 40 });
  const v = await cellValue(cell(page, 0));
  expect(v).toBe('\\begin{pmatrix}91&82\\\\3&4\\end{pmatrix}');
});

test('a matrix cell participates in ordinary cross-cell navigation', async ({
  page,
}) => {
  await cell(page, 0).evaluate((el) =>
    (el as unknown as { setValue(v: string): void }).setValue(
      '\\begin{pmatrix}1\\\\2\\end{pmatrix}',
    ),
  );
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('y', { delay: 40 });
  await cell(page, 0).locator('.mq-matrix td').first().click();
  // From the bottom matrix row, ArrowDown hops to the next app cell.
  await page.keyboard.press('ArrowDown'); // row 0 -> row 1 inside matrix
  await page.keyboard.press('ArrowDown'); // bottom edge -> next cell
  await waitFocusedIndex(page, 1);
});

test('all six matrix environments round-trip through setValue', async ({
  page,
}) => {
  for (const env of [
    'matrix',
    'pmatrix',
    'bmatrix',
    'Bmatrix',
    'vmatrix',
    'Vmatrix',
  ]) {
    const latex = `\\begin{${env}}1&2\\\\3&4\\end{${env}}`;
    await cell(page, 0).evaluate(
      (el, l) =>
        (el as unknown as { setValue(v: string): void }).setValue(l),
      latex,
    );
    expect(await cellValue(cell(page, 0))).toBe(latex);
    await expect(cell(page, 0).locator('.mq-matrix tr')).toHaveCount(2);
  }
});

test('an emptied matrix removes itself cleanly', async ({ page }) => {
  await cell(page, 0).evaluate((el) =>
    (el as unknown as { setValue(v: string): void }).setValue(
      '\\begin{pmatrix}1\\end{pmatrix}',
    ),
  );
  await expect(cell(page, 0).locator('.mq-matrix')).toBeVisible();
  await cell(page, 0).locator('.mq-matrix td').first().click();
  // End = end of the clicked cell (block-local in MQ). BS deletes '1';
  // the next BS at the start of the now-empty cell collapses the env.
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);
  expect(await cellValue(cell(page, 0))).toBe('');
  await expect(cell(page, 0).locator('.mq-matrix')).toHaveCount(0);
});
