import { expect, test } from '@playwright/test';

// scipy.stats builtins: the worker pulls the scipy+numpy wheels on the
// first program whose prelude carries the imports — after the base
// sympy boot, so these rows land slower than plain cells.

test('a stats call lazy-loads scipy and evaluates through the worker', async ({
  page,
}) => {
  test.setTimeout(150_000);
  // Seed the worksheet + calculator target ahead of the app's first
  // read — \mathrm{...} is the typed surface for named functions.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'mathcompile-cells',
      JSON.stringify([{ id: 1, latex: '\\mathrm{normcdf}(1.96)' }]),
    );
    window.localStorage.setItem(
      'mathcompile-prefs',
      JSON.stringify({ target: 'calculator' }),
    );
  });
  await page.goto('/');
  await page.waitForSelector('math-field');
  await expect(
    page.locator('.calc-row .calc-math').first(),
  ).toContainText('0.975', { timeout: 120_000 });
});
