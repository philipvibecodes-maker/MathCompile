import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// MathQuill's focus() strips .mq-empty from the block holding the caret,
// so a one-block style like \mathrm rendered an invisible slot — and once
// a letter landed, nothing marked which block the caret was in. The
// vendored CSS boxes any math-mode block that directly contains the
// cursor (.mq-hasCursor:has(> .mq-cursor)); src/index.css remaps the box
// to a light gray under data-theme='dark'.

const cell = (page: Page, i = 0): Locator =>
  page.locator('math-field').nth(i);

const bg = (loc: Locator): Promise<string> =>
  loc.evaluate((el) => getComputedStyle(el).backgroundColor);

const SLOT_BG = 'rgba(0, 0, 0, 0.2)';
const SLOT_BG_DARK = 'rgba(255, 255, 255, 0.22)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const mathrm = (mf: Locator): Locator =>
  mf.locator('.mq-editable-field > .mq-root-block .mq-roman.mq-font');

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
  const rm = mathrm(mf);
  await expect(rm).toHaveClass(/mq-hasCursor/);
  // The block is empty and focused: the cursor is its only child.
  await expect(rm.locator('.mq-cursor')).toHaveCount(1);
  await expect(rm.locator('.mq-cursor')).toBeVisible();
  expect(await bg(rm)).toBe(SLOT_BG);
});

test('the slot box stays while the caret is inside, clears when it leaves', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('\\mathrm{');
  const rm = mathrm(mf);
  await page.keyboard.type('tr');
  await expect(rm).toHaveText(/tr/);
  expect(await bg(rm)).toBe(SLOT_BG);
  // Caret walks left out of the block; it is no longer the focused slot.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(rm).not.toHaveClass(/mq-hasCursor/);
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

test('dark theme: the slot box reads as a light gray', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mathcompile-theme', 'dark');
    localStorage.removeItem('mathcompile-cells');
  });
  await page.goto('/');
  const mf = cell(page);
  await mf.click();
  await mf.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await mf.pressSequentially('\\mathrm{');
  const rm = mathrm(mf);
  await expect(rm).toHaveClass(/mq-hasCursor/);
  expect(await bg(rm)).toBe(SLOT_BG_DARK);
});
