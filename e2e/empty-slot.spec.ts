import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// MathQuill's focus() strips .mq-empty from the block holding the caret,
// so a one-block style like \mathrm rendered an invisible slot. The
// vendored CSS boxes the block that directly contains the cursor —
// always while it's empty, and once it has content only when the
// command renders no boundary around its input (font/text wrappers:
// .mq-font/.mq-bf/.mq-text-mode). Scripts, fraction slots and roots
// show their own structure, so a non-empty script block is not boxed.
// src/index.css remaps the box to a light gray under data-theme='dark'.

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

test('a non-empty \\text block keeps the slot box', async ({ page }) => {
  const mf = cell(page);
  await mf.pressSequentially('\\text{');
  const tm = mf.locator('.mq-editable-field > .mq-root-block .mq-text-mode');
  await expect(tm).toHaveClass(/mq-hasCursor/);
  await page.keyboard.type('hi');
  await expect(tm).toContainText('hi');
  expect(await bg(tm)).toBe(SLOT_BG);
});

test('a non-empty script block is not boxed', async ({ page }) => {
  const mf = cell(page);
  await page.keyboard.type('x_');
  const sub = mf.locator('.mq-editable-field > .mq-root-block .mq-sub');
  await expect(sub).toHaveClass(/mq-hasCursor/);
  // Empty while it has no content — the slot is invisible otherwise.
  expect(await bg(sub)).toBe(SLOT_BG);
  await page.keyboard.type('2');
  await expect(sub).toHaveText(/2/);
  // The script itself marks the extent — no extra box once it has content.
  expect(await bg(sub)).toBe(TRANSPARENT);
});

test('a \\displaylines row holding the caret is not boxed', async ({
  page,
}) => {
  const mf = cell(page);
  await page.keyboard.type('x');
  await page.keyboard.press('Enter');
  await page.keyboard.type('y');
  // The caret's row is a <td> grid cell — line-level, not a slot.
  const row = mf.locator('.mq-displaylines td.mq-hasCursor');
  await expect(row).toHaveCount(1);
  expect(await bg(row)).toBe(TRANSPARENT);
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
