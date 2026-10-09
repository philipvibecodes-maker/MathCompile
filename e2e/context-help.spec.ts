import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// The caret-context help strip inside the bottom of the math-field:
// always rendered (its space is reserved in the field's padding), the
// .on class fades it in when the caret is inside a matrix or
// immediately beside one, and off when it isn't.

const cell = (page: Page, i = 0): Locator =>
  page.locator('math-field').nth(i);

const help = (mf: Locator): Locator => mf.locator('.caret-help');

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
  await expect(help(mf)).toHaveClass(/\bon\b/);
  await expect(help(mf)).toContainText('Enter');
  await expect(help(mf)).toContainText('add row');
  await expect(help(mf)).toContainText('Shift+Space');
  await expect(help(mf)).toContainText('add column');
  await expect(help(mf)).toContainText('Ctrl+Shift+Backspace');
  await expect(help(mf)).toContainText('delete row');
  await expect(help(mf)).toContainText('Ctrl+Shift+Delete');
  await expect(help(mf)).toContainText('delete column');
});

test('caret left of a matrix shows determinant and trace hints', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+Home');
  await expect(help(mf)).toHaveClass(/\bon\b/);
  await expect(help(mf)).toContainText('det');
  await expect(help(mf)).toContainText('determinant');
  await expect(help(mf)).toContainText('trace');
});

test('caret right of a matrix shows transpose/adjoint/pinv hints', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+End');
  await expect(help(mf)).toHaveClass(/\bon\b/);
  await expect(help(mf)).toContainText('^T');
  await expect(help(mf)).toContainText('transpose');
  await expect(help(mf)).toContainText('adjoint');
  await expect(help(mf)).toContainText('pseudoinverse');
});

test('a typed matrix still reaches the left-of hints through the input-wrapper residue', async ({
  page,
}) => {
  const mf = cell(page);
  // Typing \pmatrix + Enter leaves an invisible .mq-latex-command-input-
  // wrapper between the previous atom and the .mq-matrix; the walk must
  // see through it (hydration-only coverage would miss this). The second
  // Enter accepts the dimensions menu's default 2x2.
  await page.keyboard.type('x+\\pmatrix');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(help(mf)).toContainText('add row'); // inside the grid
  await page.keyboard.press('ArrowLeft'); // out the left edge
  await expect(help(mf)).toContainText('determinant');
});

test('the strip fades out when the caret is in a plain position', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, 'x+1');
  await page.keyboard.press('Control+End');
  await expect(help(mf)).not.toHaveClass(/\bon\b/);
});

test('the field height stays fixed as the strip fades in and out', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, 'x+\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+Home'); // caret left of x: no hints
  await expect(help(mf)).not.toHaveClass(/\bon\b/);
  const off = (await mf.boundingBox())!.height;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight'); // caret left of the matrix
  await expect(help(mf)).toHaveClass(/\bon\b/);
  const on = (await mf.boundingBox())!.height;
  expect(on).toBe(off);
});

test('the strip follows the caret out of and back into a matrix', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+End');
  await expect(help(mf)).toContainText('transpose');
  await page.keyboard.press('ArrowLeft'); // into the matrix
  await expect(help(mf)).toContainText('add row');
  await page.keyboard.press('Control+Home'); // left edge
  await expect(help(mf)).toContainText('determinant');
});
