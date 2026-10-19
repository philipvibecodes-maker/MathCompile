import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell, sharedPage, resetApp } from './helpers';

// Residual browser-only matrix coverage — everything serialization- and
// DOM-structure-level (env parsing, row/column add/delete, in-grid
// arrows, delete shortcuts) moved to src/editor/mq-matrix.test.ts. This
// keeps only the computed-style pin, which needs a real browser.

const cell = (page: Page, i = 0): Locator =>
  page.locator('math-field').nth(i);

const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { value: string }).value);

const setValue = (mf: Locator, latex: string) =>
  mf.evaluate(
    (el, l) => ((el as unknown as { value: string }).value = l),
    latex,
  );

let page: Page;
test.beforeAll(async ({ browser }, testInfo) => {
  page = await sharedPage(browser, testInfo);
});

test.beforeEach(async () => {
  await resetApp(page);
  const mf = cell(page);
  await mf.click();
  await mf.focus();
  await clearFirstCell(page);
});

test('a new line after a matrix keeps the matrix column spacing', async () => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  expect(await cellValue(mf)).toBe(
    '\\displaylines{\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}\\\\ }',
  );
  // Nested inside \displaylines, the matrix's own td padding and table
  // border-spacing must not be overridden by the outer grid's styles.
  const metrics = await mf.evaluate((el) => {
    const table = el.querySelector<HTMLElement>(
      '.mq-editable-field .mq-matrix > table',
    );
    const td = table?.querySelector<HTMLElement>(':scope > tr > td');
    if (!table || !td) return null;
    return {
      spacing: getComputedStyle(table).borderSpacing,
      padding: getComputedStyle(td).padding,
    };
  });
  expect(metrics?.spacing).toBe('3px');
  expect(metrics?.padding).not.toBe('1.84px 0px');
});
