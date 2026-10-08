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
      JSON.stringify([
        { id: 1, latex: '\\mathrm{normcdf}(1.96)' },
        { id: 2, latex: '\\mathrm{ttestind}([1,2,3,4],[2,3,4,5])' },
        { id: 3, latex: '\\mathrm{shapiro}([1,2,3,4,6])' },
      ]),
    );
    window.localStorage.setItem(
      'mathcompile-prefs',
      JSON.stringify({ target: 'calculator' }),
    );
  });
  await page.goto('/');
  await page.waitForSelector('math-field');
  const rows = page.locator('.calc-row .calc-math');
  await expect(rows.first()).toContainText('0.975', { timeout: 120_000 });
  // Two-sample and normality tests land as (statistic, p-value) tuples.
  await expect(rows.nth(1)).toContainText(',');
  await expect(rows.nth(2)).toContainText(',');
});

test('a stats cell below an already-evaluated cell gets its imports', async ({
  page,
}) => {
  test.setTimeout(150_000);
  // Regression: the worker used to exec the prelude only when its
  // snapshot chain was empty — a stats cell added below an evaluated
  // one failed permanently with "name 'np'/'st' is not defined".
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'mathcompile-cells',
      JSON.stringify([{ id: 1, latex: '1+1' }]),
    );
    window.localStorage.setItem(
      'mathcompile-prefs',
      JSON.stringify({ target: 'calculator' }),
    );
  });
  await page.goto('/');
  await page.waitForSelector('math-field');
  const rows = page.locator('.calc-row .calc-math');
  // Cell 1 evaluates before any stats program — its snapshot exists.
  await expect(rows.first()).toContainText('2', { timeout: 120_000 });
  // Add the stats cell below: the new program's prelude carries the
  // scipy import and must still exec despite the cached snapshot.
  await page.locator('.add-expr').click();
  await page
    .locator('math-field')
    .nth(1)
    .pressSequentially('\\mathrm{normcdf}', { delay: 30 });
  await page.keyboard.press('ArrowRight');
  await page
    .locator('math-field')
    .nth(1)
    .pressSequentially('(1.96)', { delay: 30 });
  await expect(rows.nth(1)).toContainText('0.975', { timeout: 120_000 });
  await expect(page.locator('.parse-error-icon')).toHaveCount(0);
});

test('the Statistics checkbox re-evaluates in the calculator target', async ({
  page,
}) => {
  test.setTimeout(150_000);
  // Regression: appStore.stats was read inside the eval's setTimeout —
  // untracked, so the toggle did nothing in the calculator target.
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
  const math = page.locator('.calc-row .calc-math').first();
  await expect(math).toContainText('0.975', { timeout: 120_000 });

  const toggle = page
    .locator('.option-checkbox', { hasText: 'Statistics' })
    .locator('input');
  await toggle.uncheck();
  // Off: the cell re-evaluates to the honest Function stub (no scipy
  // value) and the unknown-head note surfaces.
  await expect(page.locator('.calc-issues')).toContainText(
    'unknown head "normcdf"',
  );
  await expect(page.locator('.calc-rows')).not.toContainText('0.975');

  await toggle.check();
  await expect(math).toContainText('0.975', { timeout: 120_000 });
});

test('the Statistics checkbox toggles stats recognition', async ({
  page,
}) => {
  // Python target — no worker boot, so the toggle flips live.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'mathcompile-cells',
      JSON.stringify([{ id: 1, latex: '\\mathrm{normcdf}(1.96)' }]),
    );
    window.localStorage.setItem(
      'mathcompile-prefs',
      JSON.stringify({ target: 'python' }),
    );
  });
  await page.goto('/');
  await page.waitForSelector('math-field');
  const out = page.locator('.cell-python').first();
  await expect(out).toContainText('import scipy.stats as st');
  await expect(out).toContainText('st.norm.cdf(1.96)');

  const toggle = page
    .locator('.option-checkbox', { hasText: 'Statistics' })
    .locator('input');
  await toggle.uncheck();
  // Off: an ordinary unknown head — the emission flips live and the
  // issue overlay reports the now-unrecognized name.
  await expect(out).toContainText('normcdf(1.96)');
  await expect(out).not.toContainText('scipy');
  await expect(page.locator('.cell-issues')).toContainText(
    'unknown head "normcdf"',
  );
  // The choice persists.
  await page.waitForFunction(() =>
    localStorage.getItem('mathcompile-prefs')?.includes('"stats":false'),
  );

  await toggle.check();
  await expect(out).toContainText('st.norm.cdf(1.96)');
});
