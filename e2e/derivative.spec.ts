import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// 'derivative' is an inline shortcut inserting a real \frac{d}{d#?}
// template — no parse-time macro and no bake pass, so the fraction is
// ordinary editable content with the caret on the denominator placeholder.
// The 'd/dx means derivative' toggle is a semantic (compiler) option: it's
// recorded for IR lowering and never rewrites what the user typed.

const cell = (page: Page, i = 0): Locator =>
  page.locator('math-field').nth(i);

const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { getValue(): string }).getValue());

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
  expect(await cellValue(mf)).toBe('\\frac{d}{d\\placeholder{}}');
  // The denominator placeholder is selected; typing fills it.
  await mf.pressSequentially('f', { delay: 60 });
  expect(await cellValue(mf)).toBe('\\frac{d}{df}');
});

test('the inserted fraction stays editable like ordinary content', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('derivative', { delay: 60 });
  await mf.pressSequentially('f', { delay: 60 });
  // Arrow left into the denominator and edit — real atoms, not a verbatim
  // macro atom that would swallow the keystroke.
  await page.keyboard.press('ArrowLeft');
  await mf.pressSequentially('t', { delay: 60 });
  expect(await cellValue(mf)).toBe('\\frac{d}{dtf}');
});

test('the d/dx toggle is semantic: it never rewrites cell content', async ({
  page,
}) => {
  const mf = cell(page);
  // MathLive's built-in 'dx' inline shortcut expands d+x to \differentialD x.
  await mf.pressSequentially('df/dx', { delay: 60 });
  const latex = '\\frac{df}{\\differentialD x}';
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
  expect(await cellValue(mf)).toBe('y=\\frac{d}{d\\placeholder{}}');
});
