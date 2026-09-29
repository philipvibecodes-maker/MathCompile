import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// The \derivative macro is the app's one custom MathLive extension: it
// expands to \frac{d#1}{d#2} (or D(#1) when the option is off) and the app
// then bakes the macro atom into ordinary atoms so it stays editable.

const cell = (page: Page, i = 0): Locator =>
  page.locator('math-field').nth(i);

const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { getValue(): string }).getValue());

const macroDef = (mf: Locator): Promise<string | undefined> =>
  mf.evaluate(
    (el) =>
      (el as unknown as { macros?: { derivative?: { def?: string } } }).macros
        ?.derivative?.def,
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const mf = cell(page);
  await mf.click();
  await mf.focus();
});

test('\\derivative bakes into a real fraction with the caret in the denominator', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('\\derivative', { delay: 60 });
  // Accepting the autocomplete suggestion inserts the macro; the input
  // handler then expands it into ordinary atoms.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  expect(await cellValue(mf)).toBe('\\frac{d}{d}');
  // Caret lands at the end of the denominator (expansionCaret).
  await mf.pressSequentially('f', { delay: 60 });
  expect(await cellValue(mf)).toBe('\\frac{d}{df}');
});

test('the baked fraction stays editable like ordinary content', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('\\derivative', { delay: 60 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  // ArrowLeft into the numerator proves the expansion is real atoms, not a
  // verbatim macro atom that would swallow edits.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await mf.pressSequentially('g', { delay: 60 });
  expect(await cellValue(mf)).toBe('\\frac{gd}{d}');
});

test('with d/dx-as-derivative off, \\derivative bakes to D() with the caret inside', async ({
  page,
}) => {
  await page.locator('.option-checkbox input').first().click();
  const mf = cell(page);
  await mf.pressSequentially('\\derivative', { delay: 60 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  expect(await cellValue(mf)).toBe('D()');
  await mf.pressSequentially('f', { delay: 60 });
  expect(await cellValue(mf)).toBe('D(f)');
});

test('the option toggle updates the macro definition on existing fields', async ({
  page,
}) => {
  const mf = cell(page);
  expect(await macroDef(mf)).toBe('\\frac{d#1}{d#2}');
  await page.locator('.option-checkbox input').first().click();
  expect(await macroDef(mf)).toBe('D(#1)');
  await page.locator('.option-checkbox input').first().click();
  expect(await macroDef(mf)).toBe('\\frac{d#1}{d#2}');
});
