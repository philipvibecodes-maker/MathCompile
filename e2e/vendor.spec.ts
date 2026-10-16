import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Runs the vendored MathQuill mocha suite headlessly: test/unit.html loads
// build/mathquill.test.js (library + tests inlined) and writes results to
// window.testResultsString when `?json` is in the query.
test('vendored mathquill unit suite passes', async ({ page }) => {
  test.setTimeout(120_000);
  // unit.html pulls mocha from vendor/mathquill/node_modules — a fresh
  // checkout doesn't have it (the root npm ci doesn't recurse into
  // vendor/), and the only symptom would be a 90s waitForFunction
  // timeout as mocha 404s. Check up front so the failure says why.
  expect(
    existsSync(
      fileURLToPath(
        new URL(
          '../vendor/mathquill/node_modules/mocha/mocha.js',
          import.meta.url,
        ),
      ),
    ),
    'vendor/mathquill deps are not installed — run `npm ci` inside vendor/mathquill',
  ).toBe(true);
  await page.goto('/vendor/mathquill/test/unit.html?json');
  await page.waitForFunction(
    () => (window as any).testResultsString !== undefined,
    undefined,
    { timeout: 90_000 },
  );
  const results = await page.evaluate(() => {
    const json = JSON.parse((window as any).testResultsString);
    const failures: string[] = [];
    for (const mod of json.modules.mathquill) {
      for (const a of mod.assertions) {
        if (a.result === false) failures.push(`${mod.name} :: ${a.message}`);
      }
    }
    return { passes: json.passes, failures };
  });
  expect(results.passes).toBeGreaterThan(0);
  expect(results.failures).toEqual([]);
});
