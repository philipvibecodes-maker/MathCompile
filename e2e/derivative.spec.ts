import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// \derivative and \def are insertion-time expansions from the vendored
// MathQuill patch: \derivative becomes real \frac{d}{d} atoms (or D()
// when the option is off) and \def becomes \text{def} — there is no
// macro atom, so nothing downstream needs to bake or canonicalize them.

const cell = (page: Page, i = 0): Locator =>
  page.locator('math-field').nth(i);

const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { value: string }).value);

// There's no UI for the vendored dIsDerivative option; flip it through the
// element's config passthrough.
const setDIsDerivative = (mf: Locator, v: boolean) =>
  mf.evaluate(
    (el, val) =>
      (el as unknown as { config(o: { dIsDerivative: boolean }): void }).config(
        { dIsDerivative: val },
      ),
    v,
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const mf = cell(page);
  await mf.click();
  await mf.focus();
  await clearFirstCell(page);
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

test('with dIsDerivative off, \\derivative expands to D() with the caret inside', async ({
  page,
}) => {
  const mf = cell(page);
  await setDIsDerivative(mf, false);
  await mf.pressSequentially('\\derivative', { delay: 60 });
  await page.keyboard.press('Enter');
  expect(await cellValue(mf)).toBe('D()');
  // Caret lands inside the parens: typing fills D(f).
  await mf.pressSequentially('f', { delay: 60 });
  expect(await cellValue(mf)).toBe('D(f)');
});

test('\\def expands to a \\text{def} TextBlock plus a space', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('\\def', { delay: 60 });
  await page.keyboard.press('Enter');
  expect(await cellValue(mf)).toBe('\\text{def}\\ ');
  // The caret is after the space — typing fills the signature directly.
  await mf.pressSequentially('g(x)', { delay: 60 });
  expect(await cellValue(mf)).toBe('\\text{def}\\ g\\left(x\\right)');
});
