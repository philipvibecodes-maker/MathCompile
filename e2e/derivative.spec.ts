import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// \derivative is the app's one custom command: the vendored MathQuill patch
// expands it to real \frac{d}{d} atoms (or D() when the option is off) at
// insertion time — there is no macro atom, so nothing downstream needs to
// bake or canonicalize it.

const cell = (page: Page, i = 0): Locator =>
  page.locator('math-field').nth(i);

const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { value: string }).value);

const dIsDerivative = (mf: Locator): Promise<boolean> =>
  mf.evaluate(
    (el) =>
      (el as unknown as { options: { dIsDerivative?: boolean } }).options
        .dIsDerivative ?? false,
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const mf = cell(page);
  await mf.click();
  await mf.focus();
});

test('\\derivative expands to a real fraction with the caret in the denominator', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('\\derivative', { delay: 60 });
  await page.keyboard.press('Enter');
  expect(await cellValue(mf)).toBe('\\frac{d}{d}');
  // Caret lands inside the denominator.
  await mf.pressSequentially('f', { delay: 60 });
  expect(await cellValue(mf)).toBe('\\frac{d}{df}');
});

test('the expanded fraction stays editable like ordinary content', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('\\derivative', { delay: 60 });
  await page.keyboard.press('Enter');
  // ArrowLeft into the numerator proves the expansion is real atoms.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await mf.pressSequentially('g', { delay: 60 });
  expect(await cellValue(mf)).toBe('\\frac{gd}{d}');
});

test('with d/dx-as-derivative off, \\derivative expands to D() with the caret inside', async ({
  page,
}) => {
  await page.locator('.option-checkbox input').first().click();
  const mf = cell(page);
  await mf.click(); // the checkbox stole focus; give it back to the field
  await mf.pressSequentially('\\derivative', { delay: 60 });
  await page.keyboard.press('Enter');
  expect(await cellValue(mf)).toBe('D()');
  // Caret lands inside the parens: typing fills D(f).
  await mf.pressSequentially('f', { delay: 60 });
  expect(await cellValue(mf)).toBe('D(f)');
});

test('the option toggle updates existing fields', async ({ page }) => {
  const mf = cell(page);
  expect(await dIsDerivative(mf)).toBe(true);
  await page.locator('.option-checkbox input').first().click();
  expect(await dIsDerivative(mf)).toBe(false);
  await page.locator('.option-checkbox input').first().click();
  expect(await dIsDerivative(mf)).toBe(true);
});

test('the insert-derivative palette command writes the expansion at the caret', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('x', { delay: 60 });
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('insert derivative');
  await page.keyboard.press('Enter');
  await expect(page.locator('.palette')).not.toBeVisible();
  expect(await cellValue(mf)).toBe('x\\frac{d}{d}');
  await mf.pressSequentially('f', { delay: 60 });
  expect(await cellValue(mf)).toBe('x\\frac{d}{df}');
});
