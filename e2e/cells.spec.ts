import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell, SEEDED_LATEX } from './helpers';

// Cell-level behavior: the expression list is the app's core document model.
// These tests pin DOM-visible behavior only — no framework internals — so
// they survive a rewrite in another framework.

const cell = (page: Page, i: number): Locator =>
  page.locator('math-field').nth(i);

const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { value: string }).value);

const focusedIndex = (page: Page): Promise<number> =>
  page.evaluate(() =>
    [...document.querySelectorAll('math-field')].findIndex((el) =>
      el.contains(document.activeElement),
    ),
  );

const waitFocusedIndex = (page: Page, i: number) =>
  page.waitForFunction(
    (idx) =>
      document
        .querySelectorAll('math-field')
        [idx]?.contains(document.activeElement),
    i,
  );

// MathQuill has no deferred internal refocus, so click() alone is
// reliable; the settle wait is kept minimal anyway so fast test runs
// don't race the render.
const focusCell = async (page: Page, i: number) => {
  await cell(page, i).focus();
  await waitFocusedIndex(page, i);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
  await clearFirstCell(page);
});

test('starts with a single focused cell seeded with the default expression', async ({
  page,
}) => {
  // beforeEach cleared the field. Wait for that debounced write to land
  // (which drains the pending buffer), then clear storage so the reload
  // observes the empty-storage boot state — the seeded cell — rather
  // than the persisted edit.
  await page.waitForFunction(() =>
    localStorage.getItem('mathcompile-cells')?.includes('""'),
  );
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('math-field');
  await expect(page.locator('math-field')).toHaveCount(1);
  await waitFocusedIndex(page, 0);
  expect(await cellValue(cell(page, 0))).toBe(SEEDED_LATEX);
});

test('add-expression button appends a focused empty cell', async ({ page }) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('x', { delay: 40 });
  await page.locator('.add-expr').click();
  await expect(page.locator('math-field')).toHaveCount(2);
  await waitFocusedIndex(page, 1);
  expect(await cellValue(cell(page, 1))).toBe('');
  expect(await cellValue(cell(page, 0))).toBe('x');
});

test('cells are numbered 1..n', async ({ page }) => {
  await page.locator('.add-expr').click();
  await page.locator('.add-expr').click();
  await expect(page.locator('.expr-index')).toHaveText(['1', '2', '3']);
});

test('Shift+Enter inserts a cell directly below the current one', async ({
  page,
}) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('b', { delay: 40 });
  // Focus cell 0, then Shift+Enter: the new cell goes between a and b.
  await focusCell(page, 0);
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('math-field')).toHaveCount(3);
  await waitFocusedIndex(page, 1);
  expect(await cellValue(cell(page, 0))).toBe('a');
  expect(await cellValue(cell(page, 1))).toBe('');
  expect(await cellValue(cell(page, 2))).toBe('b');
});

test('editing a cell does not affect its siblings', async ({ page }) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('b', { delay: 40 });
  expect(await cellValue(cell(page, 0))).toBe('a');
  expect(await cellValue(cell(page, 1))).toBe('b');
});

test('delete button removes only that cell', async ({ page }) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('b', { delay: 40 });
  await page.locator('.expr-delete').first().click();
  await expect(page.locator('math-field')).toHaveCount(1);
  expect(await cellValue(cell(page, 0))).toBe('b');
});

test('deleting the last remaining cell clears it instead of removing it', async ({
  page,
}) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('x+y', { delay: 40 });
  await page.locator('.expr-delete').click();
  await expect(page.locator('math-field')).toHaveCount(1);
  expect(await cellValue(cell(page, 0))).toBe('');
});

test('Enter splits the cell into multiple lines', async ({ page }) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('x', { delay: 40 });
  await page.keyboard.press('Enter');
  await cell(page, 0).pressSequentially('y', { delay: 40 });
  // No new cell; the field holds a \displaylines environment.
  await expect(page.locator('math-field')).toHaveCount(1);
  expect(await cellValue(cell(page, 0))).toBe('\\displaylines{x\\\\ y}');
});

test('Enter inside a nested atom splits the row, keeping the atom whole', async ({
  page,
}) => {
  await cell(page, 0).click();
  // \frac via the latex command input; Enter accepts the command and lands
  // the caret in the numerator.
  await cell(page, 0).pressSequentially('\\frac', { delay: 40 });
  await page.keyboard.press('Enter');
  expect(await cellValue(cell(page, 0))).toBe('\\frac{ }{ }');
  await cell(page, 0).pressSequentially('1', { delay: 40 });
  // Enter while nested inside the fraction: the break lands on the row, the
  // atom stays whole.
  await page.keyboard.press('Enter');
  await cell(page, 0).pressSequentially('z', { delay: 40 });
  expect(await cellValue(cell(page, 0))).toBe(
    '\\displaylines{\\frac{1}{ }\\\\ z}',
  );
});

test('Enter accepts an open latex command instead of line-breaking', async ({
  page,
}) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('\\sqrt', { delay: 40 });
  await page.keyboard.press('Enter');
  const v = await cellValue(cell(page, 0));
  expect(v).toBe('\\sqrt{ }');
  expect(v).not.toContain('displaylines');
});

test('ArrowDown at the bottom edge hops to the next cell', async ({ page }) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('b', { delay: 40 });
  await focusCell(page, 0);
  await page.keyboard.press('Control+End');
  await page.keyboard.press('ArrowDown');
  await waitFocusedIndex(page, 1);
});

test('ArrowDown past the last cell creates and focuses a new cell', async ({
  page,
}) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('math-field')).toHaveCount(2);
  await waitFocusedIndex(page, 1);
});

test('ArrowUp at the top edge hops to the previous cell; at cell 0 it stays', async ({
  page,
}) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('b', { delay: 40 });
  // In cell 1 now (add-expr focuses it); ArrowUp goes back to cell 0.
  await page.keyboard.press('ArrowUp');
  await waitFocusedIndex(page, 0);
  // Now at the top edge of cell 0 with nowhere to go: stays put.
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(120);
  expect(await focusedIndex(page)).toBe(0);
  await expect(page.locator('math-field')).toHaveCount(2);
});

test('vertical arrows stay inside a multi-line cell until the last row', async ({
  page,
}) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('x', { delay: 40 });
  await page.keyboard.press('Enter');
  await cell(page, 0).pressSequentially('y', { delay: 40 });
  await page.locator('.add-expr').click();
  // Back to cell 0, caret on its second (last) line.
  await focusCell(page, 0);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(80);
  // Still inside cell 0 (moved caret to line 1, no cell hop).
  expect(await focusedIndex(page)).toBe(0);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(80);
  expect(await focusedIndex(page)).toBe(0);
  // From the last line, ArrowDown hops to cell 1.
  await page.keyboard.press('ArrowDown');
  await waitFocusedIndex(page, 1);
});

test('Shift+Arrow at a cell edge extends the selection without hopping cells', async ({
  page,
}) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('xy', { delay: 40 });
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(80);
  expect(await focusedIndex(page)).toBe(1);
  await expect(page.locator('math-field')).toHaveCount(2);
});

test('focusing a cell makes it the target for subsequent commands', async ({
  page,
}) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('b', { delay: 40 });
  await focusCell(page, 0);
  await page.keyboard.press('Shift+Enter');
  // New cell went after cell 0 (the focused one), not after cell 1.
  expect(await cellValue(cell(page, 0))).toBe('a');
  expect(await cellValue(cell(page, 1))).toBe('');
  expect(await cellValue(cell(page, 2))).toBe('b');
});

test('clicking another cell transfers focus', async ({ page }) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('b', { delay: 40 });
  await cell(page, 0).click();
  await waitFocusedIndex(page, 0);
});
