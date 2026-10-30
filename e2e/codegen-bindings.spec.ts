import { expect, test, type Page } from '@playwright/test';
import { resetApp, sharedPage } from './helpers';

let page: Page;
test.beforeAll(async ({ browser }, testInfo) => {
  page = await sharedPage(browser, testInfo);
});
test.afterAll(async () => { await page?.close(); });

// DOM-only checks through the real MathQuill -> compiler -> Pyodide path.
// Each import mode starts a fresh worker to avoid the separate CG-27 cache bug.
for (const importAll of [true, false]) {
  test(`CG-02/16/21 runtime results (importAll=${importAll})`, async () => {
    test.setTimeout(120_000);
    if (!importAll) await page.reload();
    await resetApp(page);
    await page.locator('.target-select select').selectOption('python');
    await page.locator('.settings-btn').click();
    await page.locator('.output-import-all input').setChecked(importAll);
    await page.locator('.settings-backdrop').click();

    const cases: { latex: string; expected?: RegExp }[] = [
      { latex: 'S=2' },
      { latex: 'x\\in\\mathbb{R}', expected: /True/ },
      { latex: 'I=2' },
      { latex: 'i^2', expected: /^[−-]1$/ },
      { latex: 'E=2' },
      { latex: 'e^2', expected: /^e2$/ },
      { latex: 'Q=2' },
      { latex: '3\\in\\mathbb{P}', expected: /^3∈.*Qprime/ },
      { latex: 'x_{-}+x_{+}' },
      { latex: 'x_{-}-x_{+}', expected: /x.*x/ },
      { latex: '\\displaylines{A+1\\\\ A=\\begin{pmatrix}2&1\\\\1&2\\end{pmatrix}\\\\ \\det A}', expected: /^3$/ },
      { latex: '\\text{def} f(t)=(t,t^2,t^3)' },
      { latex: '\\text{def} f(t)=t^2' },
      { latex: '|f(2)|', expected: /^4$/ },
      { latex: '\\operatorname{foo}(t)' },
      { latex: '\\operatorname{foo}(2)', expected: /^foo\(?2\)?$/ },
      { latex: '\\operatorname{Symbol}=2' },
      { latex: 'z+1', expected: /^z\+1$/ },
      { latex: 'a=2' },
      { latex: 'a=3' },
      { latex: 'a', expected: /^3$/ },
    ];
    for (const [i, c] of cases.entries()) {
      if (i > 0) await page.locator('.add-expr').click();
      await page.locator('math-field').nth(i).evaluate((el, value) => {
        (el as { value: string }).value = value;
      }, c.latex);
    }
    await page.locator('.target-select select').selectOption('calculator');
    await expect(page.locator('.engine-chip')).toContainText('SymPy ready', { timeout: 90_000 });
    for (const [i, c] of cases.entries()) {
      if (!c.expected) continue;
      const row = page.locator('.expr-row').nth(i);
      await expect(row.locator('.calc-rows')).not.toHaveClass(/pending/);
      await expect(row.locator('.calc-math .mq-root-block').last()).toHaveText(c.expected);
    }
    await expect(page.locator('.calc-rows .issue-error')).toHaveCount(0);
    const matrixIndex = cases.findIndex((c) => c.latex.startsWith('\\displaylines{A+1'));
    await expect(page.locator('.expr-row').nth(matrixIndex).locator('.calc-issues')).toContainText('Warning: "A" is redefined');
    const replacingIndex = cases.findIndex((c) => c.latex === 'a=3');
    const replacing = page.locator('.expr-row').nth(replacingIndex);
    await expect(replacing.locator('.calc-issues')).toContainText('Warning: "a" is redefined');
    await page.locator('math-field').nth(replacingIndex).evaluate((el) => {
      (el as { value: string }).value = 'b=3';
    });
    await expect(replacing.locator('.calc-issues')).toHaveCount(0);
    await expect(page.locator('.expr-row').last().locator('.calc-math .mq-root-block').last()).toHaveText('2');
  });
}
