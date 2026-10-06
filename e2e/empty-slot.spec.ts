import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// A focused empty block gets its .mq-empty slot box stripped by MathQuill's
// focus() — for one-block styles like \mathrm the span then collapses to
// zero width and typing the command looks like a no-op. The vendored CSS
// keeps the gray slot background on any block whose only child is the
// cursor (.mq-hasCursor:has(> .mq-cursor:only-child)).

const cell = (page: Page, i = 0): Locator =>
  page.locator('math-field').nth(i);

const bg = (loc: Locator): Promise<string> =>
  loc.evaluate((el) => getComputedStyle(el).backgroundColor);

const SLOT_BG = 'rgba(0, 0, 0, 0.2)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const mf = cell(page);
  await mf.click();
  await mf.focus();
  await clearFirstCell(page);
});

test('empty \\mathrm block shows a slot while the caret is inside', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('\\mathrm{');
  const rm = mf.locator('.mq-editable-field > .mq-root-block .mq-roman.mq-font');
  await expect(rm).toHaveClass(/mq-hasCursor/);
  // The block is empty and focused: the cursor is its only child.
  await expect(rm.locator('.mq-cursor')).toHaveCount(1);
  await expect(rm.locator('.mq-cursor')).toBeVisible();
  expect(await bg(rm)).toBe(SLOT_BG);
});

test('the slot box clears once the \\mathrm block has content', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('\\mathrm{');
  const rm = mf.locator('.mq-editable-field > .mq-root-block .mq-roman.mq-font');
  await page.keyboard.type('tr');
  await expect(rm).toHaveText(/tr/);
  expect(await bg(rm)).toBe(TRANSPARENT);
});

test('empty \\mathbf block shows a slot too', async ({ page }) => {
  const mf = cell(page);
  await mf.pressSequentially('\\mathbf{');
  const bf = mf.locator('.mq-editable-field > .mq-root-block b.mq-font');
  await expect(bf).toHaveClass(/mq-hasCursor/);
  expect(await bg(bf)).toBe(SLOT_BG);
});

test('a completely empty field keeps the root block transparent', async ({
  page,
}) => {
  const mf = cell(page);
  const root = mf.locator('.mq-editable-field > .mq-root-block');
  await expect(root).toHaveClass(/mq-hasCursor/);
  expect(await bg(root)).toBe(TRANSPARENT);
});
