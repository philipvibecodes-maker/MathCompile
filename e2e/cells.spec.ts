import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  clearFirstCell,
  reloadToSeed,
  resetApp,
  SEEDED_LATEX,
  sharedPage,
} from './helpers';

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

let page: Page;
test.beforeAll(async ({ browser }, testInfo) => {
  page = await sharedPage(browser, testInfo);
});

test.beforeEach(async () => {
  await resetApp(page);
  await clearFirstCell(page);
});

test('starts with a single focused cell seeded with the default expression',
  { tag: '@smoke' },
  async () => {
  // Clear storage with the pending write already drained, then reload —
  // the empty-storage boot path seeds the example cell.
  await reloadToSeed(page);
  await expect(page.locator('math-field')).toHaveCount(1);
  await waitFocusedIndex(page, 0);
  expect(await cellValue(cell(page, 0))).toBe(SEEDED_LATEX);
});

test('add-expression button appends a focused empty cell', async () => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('x', { delay: 40 });
  await page.locator('.add-expr').click();
  await expect(page.locator('math-field')).toHaveCount(2);
  await waitFocusedIndex(page, 1);
  expect(await cellValue(cell(page, 1))).toBe('');
  expect(await cellValue(cell(page, 0))).toBe('x');
});

test('cells are numbered 1..n', async () => {
  await page.locator('.add-expr').click();
  await page.locator('.add-expr').click();
  await expect(page.locator('.expr-index')).toHaveText(['1', '2', '3']);
});

test('Shift+Enter inserts a cell directly below the current one',
  { tag: '@smoke' },
  async () => {
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

test('editing a cell does not affect its siblings', async () => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('b', { delay: 40 });
  expect(await cellValue(cell(page, 0))).toBe('a');
  expect(await cellValue(cell(page, 1))).toBe('b');
});

test('delete button removes only that cell', async () => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('b', { delay: 40 });
  await page.locator('.expr-delete').first().click();
  await expect(page.locator('math-field')).toHaveCount(1);
  expect(await cellValue(cell(page, 0))).toBe('b');
});

test('deleting the last remaining cell clears it instead of removing it', async () => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('x+y', { delay: 40 });
  await page.locator('.expr-delete').click();
  await expect(page.locator('math-field')).toHaveCount(1);
  expect(await cellValue(cell(page, 0))).toBe('');
});

test('Backspace in an empty cell removes it and focuses a neighbor',
  { tag: '@smoke' },
  async () => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  // Append an empty cell — it lands focused.
  await page.locator('.add-expr').click();
  await expect(page.locator('math-field')).toHaveCount(2);
  await waitFocusedIndex(page, 1);
  await page.keyboard.press('Backspace');
  await expect(page.locator('math-field')).toHaveCount(1);
  expect(await cellValue(cell(page, 0))).toBe('a');
  await waitFocusedIndex(page, 0);
});

test('Delete in an empty middle cell removes it and focuses the next cell', async () => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('b', { delay: 40 });
  // Insert a blank cell between a and b via Shift+Enter on cell 0.
  await focusCell(page, 0);
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('math-field')).toHaveCount(3);
  await waitFocusedIndex(page, 1);
  await page.keyboard.press('Delete');
  await expect(page.locator('math-field')).toHaveCount(2);
  expect(await cellValue(cell(page, 0))).toBe('a');
  expect(await cellValue(cell(page, 1))).toBe('b');
  // deleteFocused prefers the next cell (the old b), now index 1.
  await waitFocusedIndex(page, 1);
});

test('Backspace in the only cell just clears it', async () => {
  await cell(page, 0).click();
  await page.keyboard.press('Backspace');
  await expect(page.locator('math-field')).toHaveCount(1);
  expect(await cellValue(cell(page, 0))).toBe('');
});

// The displaylines-editing keys themselves (Enter splitting, nested-atom
// Enter, Shift+Space, blank-line Backspace unwrap, in-grid arrows,
// Shift+Arrow select-out) moved to src/editor/mq-cell-editing.test.ts —
// they exercise vendored MQ through typedText/keystroke, which needs no
// browser. What stays here is the store/DOM wiring: cell counts, focus
// ownership across cells, buttons.

test('ArrowDown at the bottom edge hops to the next cell',
  { tag: '@smoke' },
  async () => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('b', { delay: 40 });
  await focusCell(page, 0);
  await page.keyboard.press('Control+End');
  await page.keyboard.press('ArrowDown');
  await waitFocusedIndex(page, 1);
});

test('ArrowDown past the last cell creates and focuses a new cell', async () => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('math-field')).toHaveCount(2);
  await waitFocusedIndex(page, 1);
});

test('ArrowUp at the top edge hops to the previous cell; at cell 0 it stays', async () => {
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

test('focusing a cell makes it the target for subsequent commands', async () => {
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

test('copying a multi-line cell puts bare rows on the clipboard', async () => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('x+1', { delay: 40 });
  await page.keyboard.press('Enter');
  await cell(page, 0).pressSequentially('y', { delay: 40 });
  expect(await cellValue(cell(page, 0))).toBe('\\displaylines{x+1\\\\ y}');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+c');
  // The \displaylines wrapper is an editing artifact — the clipboard
  // holds the row latex.
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'x+1\\\\ y',
  );
});

test('clicking another cell transfers focus', async () => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('b', { delay: 40 });
  await cell(page, 0).click();
  await waitFocusedIndex(page, 0);
});
