import { test, expect } from '@playwright/test';

// Runs the vendored MathQuill mocha suite headlessly: test/unit.html loads
// build/mathquill.test.js (library + tests inlined) and writes results to
// window.testResultsString when `?json` is in the query.
test('vendored mathquill unit suite passes', async ({ page }) => {
  test.setTimeout(120_000);
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
