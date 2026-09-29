import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { cellValue } from './helpers';

// 'derivative' is an inline shortcut inserting a real \frac{d}{dx} template
// — no parse-time macro and no bake pass, so the fraction is ordinary
// editable content. The caret lands in the (empty) numerator, so the next
// keystroke fills it. The 'd/dx means derivative' toggle is a semantic
// (compiler) option: it's recorded for IR lowering and never rewrites what
// the user typed.

const cell = (page: Page, i = 0): Locator =>
  page.locator('math-field').nth(i);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const mf = cell(page);
  await mf.click();
  await mf.focus();
});

test('typing derivative inserts an editable fraction template', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('derivative', { delay: 60 });
  expect(await cellValue(mf)).toBe('\\frac{d}{dx}');
  // The caret sits in the empty numerator; typing fills it.
  await mf.pressSequentially('f', { delay: 60 });
  expect(await cellValue(mf)).toBe('\\frac{df}{dx}');
});

test('the inserted fraction stays editable like ordinary content', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('derivative', { delay: 60 });
  await mf.pressSequentially('f', { delay: 60 });
  // Arrow into the denominator and edit — real atoms, not a verbatim macro.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('t', { delay: 60 });
  expect(await cellValue(mf)).toBe('\\frac{df}{dtx}');
});

test('the d/dx toggle is semantic: it never rewrites cell content', async ({
  page,
}) => {
  const mf = cell(page);
  // MathQuill has no 'dx' inline shortcut: df/dx types as a plain fraction.
  await mf.pressSequentially('df/dx', { delay: 60 });
  const latex = '\\frac{df}{dx}';
  expect(await cellValue(mf)).toBe(latex);
  await page.locator('.option-checkbox input').first().click();
  expect(await cellValue(mf)).toBe(latex);
  await expect(page.locator('.output-body')).toContainText(
    'd/dx means derivative: false',
  );
});

test('the palette insert-derivative command inserts at the caret', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('y=', { delay: 60 });
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('insert derivative');
  await page.keyboard.press('Enter');
  await expect(page.locator('.palette')).not.toBeVisible();
  expect(await cellValue(mf)).toBe('y=\\frac{d}{dx}');
});
