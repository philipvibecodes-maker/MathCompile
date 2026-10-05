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
  await expect(mf.locator('.mq-editable-field .mq-matrix tr')).toHaveCount(2);
  await expect(mf.locator('.mq-editable-field .mq-matrix td')).toHaveCount(4);
  await expect(mf.locator('.mq-editable-field .mq-matrix .mq-paren')).toHaveCount(2);
  expect(await cellValue(mf)).toBe(
    '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}',
  );
});

test('typed \\cases opens a cases environment', async ({ page }) => {
  const mf = cell(page);
  await page.keyboard.type('\\cases');
  await page.keyboard.press('Enter');
  // Scope to the editable field: the autocomplete preview renders a
  // real .mq-matrix inside a StaticMath root block too.
  await expect(
    mf.locator('.mq-editable-field .mq-matrix tr'),
  ).toHaveCount(2);
||||||| de97691
  await expect(mf.locator('.mq-matrix tr')).toHaveCount(2);
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
  await expect(mf.locator('.mq-editable-field .mq-matrix tr')).toHaveCount(3);
});

test('Shift+Spacebar inside a matrix cell adds a column', async ({ page }) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{matrix}a&b\\\\c&d\\end{matrix}');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('ArrowLeft'); // step into the last cell
  await page.keyboard.press('Shift+Space');
  await expect(mf.locator('.mq-editable-field .mq-matrix td')).toHaveCount(6);
});

test('a new line after a matrix keeps the matrix column spacing', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  expect(await cellValue(mf)).toBe(
    '\\displaylines{\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}\\\\ }',
  );
  // Nested inside \displaylines, the matrix's own td padding and table
  // border-spacing must not be overridden by the outer grid's styles.
  const metrics = await mf.evaluate((el) => {
    const table = el.querySelector<HTMLElement>(
      '.mq-editable-field .mq-matrix > table',
    );
    const td = table?.querySelector<HTMLElement>(':scope > tr > td');
    if (!table || !td) return null;
    return {
      spacing: getComputedStyle(table).borderSpacing,
      padding: getComputedStyle(td).padding,
    };
  });
  expect(metrics?.spacing).toBe('3px');
  expect(metrics?.padding).not.toBe('1.84px 0px');
});

test('deleting the empty line below a matrix keeps the matrix rows', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(
    mf,
    '\\displaylines{\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}\\\\ }',
  );
  await page.keyboard.press('Control+End'); // into the empty second line
  await page.keyboard.press('Backspace');
  expect(await cellValue(mf)).toBe(
    '\\displaylines{\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}}',
  );
  // Both of the matrix's own <tr>s survive — the row index used to land
  // on a nested <tr> and remove one.
  await expect(
    mf.locator('.mq-editable-field .mq-matrix > table > tr'),
  ).toHaveCount(2);
  await expect(
    mf.locator('.mq-editable-field .mq-displaylines > table > tr'),
  ).toHaveCount(1);
});

test('deleting the first line keeps the caret usable', async ({ page }) => {
  const mf = cell(page);
  await setValue(
    mf,
    '\\displaylines{ \\\\ \\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}}',
  );
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Backspace');
  expect(await cellValue(mf)).toBe(
    '\\displaylines{\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}}',
  );
  await page.keyboard.type('z');
  expect(await cellValue(mf)).toBe(
    '\\displaylines{z\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}}',
  );
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

test('Ctrl+Shift+Backspace inside a matrix cell deletes the current row', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{matrix}a&b\\\\x&y\\\\c&d\\end{matrix}');
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowRight'); // step into cell a (row 0)
  await page.keyboard.press('Control+Shift+Backspace');
  expect(await cellValue(mf)).toBe('\\begin{matrix}x&y\\\\c&d\\end{matrix}');
  await expect(mf.locator('.mq-editable-field .mq-matrix tr')).toHaveCount(2);
  // the caret stays live on the cell that slid into the deleted row
  await page.keyboard.type('z');
  expect(await cellValue(mf)).toBe(
    '\\begin{matrix}xz&y\\\\c&d\\end{matrix}',
  );
});

test('Ctrl+Shift+Delete inside a matrix cell deletes the current column', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{matrix}a&b\\\\c&d\\end{matrix}');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('ArrowLeft'); // step into cell d (col 1)
  await page.keyboard.press('Control+Shift+Delete');
  expect(await cellValue(mf)).toBe('\\begin{matrix}a\\\\c\\end{matrix}');
  await expect(mf.locator('.mq-editable-field .mq-matrix td')).toHaveCount(2);
});

test('delete shortcuts refuse to take the last row or column', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\begin{matrix}a&b\\end{matrix}');
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+Shift+Backspace'); // one row: no-op
  expect(await cellValue(mf)).toBe('\\begin{matrix}a&b\\end{matrix}');
  await page.keyboard.press('Control+Shift+Delete'); // -> single column
  expect(await cellValue(mf)).toBe('\\begin{matrix}b\\end{matrix}');
  await page.keyboard.press('Control+Shift+Delete'); // one column: no-op
  expect(await cellValue(mf)).toBe('\\begin{matrix}b\\end{matrix}');
});

test('delete shortcuts are matrices-only: unchanged in multi-line cells', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, '\\displaylines{a\\\\b\\\\c}');
  await page.keyboard.press('Control+End'); // last line
  // clears the current line's content — does NOT delete the line
  await page.keyboard.press('Control+Shift+Backspace');
  expect(await cellValue(mf)).toBe('\\displaylines{a\\\\ b\\\\ }');
});

test('delete shortcuts outside a grid still clear the block', async ({
  page,
}) => {
  const mf = cell(page);
  await setValue(mf, 'foo');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Control+Shift+Backspace');
  expect(await cellValue(mf)).toBe('');
  await setValue(mf, 'bar');
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+Shift+Delete');
  expect(await cellValue(mf)).toBe('');
});
