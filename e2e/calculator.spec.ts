import { expect, test } from '@playwright/test';
import { clearFirstCell } from './helpers';

// The calculator target evaluates each cell through SymPy on Pyodide
// (loaded from the CDN on first use). First engine boot pulls the wasm
// runtime + sympy + antlr wheels, so specs get a long timeout.

const cell = (page: import('@playwright/test').Page, i: number) =>
  page.locator('math-field').nth(i);

const setTarget = (page: import('@playwright/test').Page, value: string) =>
  page.locator('.target-select select').selectOption(value);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
  await clearFirstCell(page);
});

test('calculator evaluates a typed expression through SymPy', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTarget(page, 'calculator');

  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('2+2', { delay: 40 });

  // MathQuill StaticMath renders the sympy result as math.
  await expect(
    page.locator('.calc-row .calc-math').first(),
  ).toContainText('4', { timeout: 90_000 });
});

test('calculator renders an approximate value for irrationals', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTarget(page, 'calculator');

  const mf = cell(page, 0);
  await mf.click();
  // Smart mode (on by default) converts 'sqrt' into the \sqrt template.
  await mf.pressSequentially('sqrt', { delay: 40 });
  await mf.pressSequentially('2', { delay: 40 });

  await expect(page.locator('.calc-approx').first()).toContainText('1.4142', {
    timeout: 90_000,
  });
});

test('calculator shows per-line results for multi-line cells', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTarget(page, 'calculator');

  const mf = cell(page, 0);
  await mf.click();
  await mf.pressSequentially('1+1', { delay: 40 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('2+3', { delay: 40 });

  const rows = page.locator('.calc-row');
  await expect(rows).toHaveCount(2, { timeout: 90_000 });
  await expect(rows.nth(0)).toContainText('2');
  await expect(rows.nth(1)).toContainText('5');
});
