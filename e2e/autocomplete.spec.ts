import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// Autocomplete: the dropdown (`.mc-ac`) tracks the typed `\`-command
// prefix or a 2+ letter word-run; the symbol picker (`.mc-pick`) opens
// on Ctrl+Space. Both are DOM-only contracts inside <math-field>.

const cell = (page: Page, i: number): Locator =>
  page.locator('math-field').nth(i);

const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { value: string }).value);

const menu = (page: Page) => page.locator('.mc-ac');
const menuNames = (page: Page) =>
  page.locator('.mc-ac-item .mc-ac-name').allTextContents();
const picker = (page: Page) => page.locator('.mc-pick');
const cardNames = (page: Page) =>
  page.locator('.mc-pick-card .mc-pick-name').allTextContents();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
  await clearFirstCell(page);
});

test('typing a \\ prefix shows matching commands', async ({ page }) => {
  await cell(page, 0).focus();
  await page.keyboard.type('\\sq');
  await expect(menu(page)).toBeVisible();
  expect(await menuNames(page)).toContain('sqrt');
});

test('arrows + Enter accept a command completion', async ({ page }) => {
  await cell(page, 0).focus();
  await page.keyboard.type('\\sq');
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(() => cellValue(cell(page, 0))).toContain('\\sqrt');
  await expect(menu(page)).not.toBeVisible();
});

test('Escape dismisses the menu until the next keystroke', async ({
  page,
}) => {
  await cell(page, 0).focus();
  await page.keyboard.type('\\sq');
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu(page)).not.toBeVisible();
  // Focus returns to the field's MathQuill textarea.
  await expect(
    cell(page, 0).locator('.mq-editable-field'),
  ).toHaveClass(/mq-focused/);
});

test('a plain letter-run offers word completions', async ({ page }) => {
  await cell(page, 0).focus();
  await page.keyboard.type('sq');
  await expect(menu(page)).toBeVisible();
  expect(await menuNames(page)).toContain('sqrt');
  await page.keyboard.press('Enter');
  await expect.poll(() => cellValue(cell(page, 0))).toContain('\\sqrt');
});

test('Ctrl+Space opens the picker; typing filters and Enter inserts', async ({
  page,
}) => {
  await cell(page, 0).focus();
  await page.keyboard.press('Control+Space');
  await expect(picker(page)).toBeVisible();
  await page.keyboard.type('omeg');
  expect(await cardNames(page)).toEqual(['omega', 'Omega']);
  await page.keyboard.press('Enter');
  await expect(picker(page)).not.toBeVisible();
  await expect.poll(() => cellValue(cell(page, 0))).toContain('\\omega');
});

test('Escape on the picker closes it and refocuses the field', async ({
  page,
}) => {
  await cell(page, 0).focus();
  await page.keyboard.press('Control+Space');
  await expect(picker(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker(page)).not.toBeVisible();
  await expect(
    cell(page, 0).locator('.mq-editable-field'),
  ).toHaveClass(/mq-focused/);
});

test('clicking the picker\'s padding keeps focus in its search', async ({
  page,
}) => {
  await cell(page, 0).focus();
  await page.keyboard.press('Control+Space');
  await expect(picker(page)).toBeVisible();
  // Padding between the wrap edge and the search/grid — must not blur
  // the search input and strand focus on <body>.
  const box = await picker(page).boundingBox();
  await page.mouse.click(box!.x + 3, box!.y + 3);
  await expect(picker(page)).toBeVisible();
  await expect(picker(page).locator('.mc-pick-q')).toBeFocused();
});

test('opening the picker while the menu is up leaves the picker usable', async ({
  page,
}) => {
  await cell(page, 0).focus();
  await page.keyboard.type('\\in');
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Control+Space');
  await expect(picker(page)).toBeVisible();
  await expect(menu(page)).not.toBeVisible();
  // Picker keys go to the picker, not the menu: Escape closes it and
  // arrows/Enter would select a card, not navigate the hidden menu.
  await page.keyboard.press('Escape');
  await expect(picker(page)).not.toBeVisible();
});

// Vimium's insert-mode Escape calls activeElement.blur() and swallows
// the keydown (window-capture + stopImmediatePropagation) — the only
// signal the page sees is a pointer-less blur to nowhere.
test('a programmatic blur refocuses the cell (Vimium Escape)', async ({
  page,
}) => {
  await cell(page, 0).focus();
  await cell(page, 0)
    .locator('.mq-textarea textarea')
    .evaluate((el: HTMLElement) => el.blur());
  await expect(
    cell(page, 0).locator('.mq-editable-field'),
  ).toHaveClass(/mq-focused/);
});

test('a programmatic blur on the picker search closes and refocuses', async ({
  page,
}) => {
  await cell(page, 0).focus();
  await page.keyboard.press('Control+Space');
  await expect(picker(page)).toBeVisible();
  await picker(page)
    .locator('.mc-pick-q')
    .evaluate((el: HTMLElement) => el.blur());
  await expect(picker(page)).not.toBeVisible();
  await expect(
    cell(page, 0).locator('.mq-editable-field'),
  ).toHaveClass(/mq-focused/);
});

test('Backspace in the picker search does not delete an empty cell', async ({
  page,
}) => {
  await cell(page, 0).focus();
  await page.keyboard.press('Control+Space');
  await expect(picker(page)).toBeVisible();
  await page.keyboard.type('zz');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(cell(page, 0)).toHaveCount(1);
  await expect(picker(page)).toBeVisible();
});
