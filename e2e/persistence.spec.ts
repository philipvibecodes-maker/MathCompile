import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { clearFirstCell, sharedPage, resetApp } from './helpers';

// Persistence: worksheet cells and prefs survive a reload. Writes are
// debounced (~300ms), so tests wait on the storage key before reloading
// rather than racing the timer.

const cell = (page: import('@playwright/test').Page, i: number): Locator =>
  page.locator('math-field').nth(i);

const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { value: string }).value);

const waitStored = (page: import('@playwright/test').Page, latex: string) =>
  page.waitForFunction(
    (needle) => localStorage.getItem('mathcompile-worksheets')?.includes(needle),
    latex,
  );

let page: Page;
test.beforeAll(async ({ browser }, testInfo) => {
  page = await sharedPage(browser, testInfo);
});

test.beforeEach(async () => {
  await resetApp(page);
  await clearFirstCell(page);
});

test('typed cells are restored after reload', { tag: '@smoke' }, async () => {
  await cell(page, 0).pressSequentially('x+1', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('y^2', { delay: 40 });
  await waitStored(page, 'y');

  await page.reload();
  await page.waitForSelector('math-field');

  await expect(page.locator('math-field')).toHaveCount(2);
  expect(await cellValue(cell(page, 0))).toBe('x+1');
  expect(await cellValue(cell(page, 1))).toBe('y^{2}');
});

test('deleted cells stay deleted after reload', async () => {
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('z', { delay: 40 });
  await page.locator('.expr-delete').first().click();
  await page.waitForFunction(
    () => !localStorage.getItem('mathcompile-worksheets')?.includes('},{'),
  );

  await page.reload();
  await page.waitForSelector('math-field');
  await expect(page.locator('math-field')).toHaveCount(1);
  expect(await cellValue(cell(page, 0))).toBe('z');
});

test('unparseable stored latex does not linger in the output column', async () => {
  // A persisted value the field can't accept gets wiped on hydration —
  // the store must learn that so .cell-latex doesn't show text the
  // field doesn't contain ('a}b' is a permanently unparseable stray
  // close-brace). Seeds the legacy single-worksheet key so the test
  // also covers the migration into 'mathcompile-worksheets'.
  // One-shot seed (the shared page keeps addInitScript armed for every
  // later navigation — it must not leak into other tests).
  await page.evaluate(() => {
    localStorage.setItem(
      'mathcompile-cells',
      JSON.stringify([{ id: 1, latex: 'a}b' }]),
    );
  });
  await page.reload();
  await page.waitForSelector('math-field');
  const mf = page.locator('math-field').first();
  expect(await cellValue(mf)).toBe('');
  await expect(page.locator('.cell-latex').first()).toHaveText('');
});

test('guide collapsed state survives reload', async () => {
  const guide = page.locator('details.howto');
  await expect(guide).toHaveAttribute('open', '');
  await guide.locator('summary').click();
  await page.waitForFunction(() =>
    localStorage.getItem('mathcompile-prefs')?.includes('"guideOpen":false'),
  );

  await page.reload();
  await page.waitForSelector('math-field');
  await expect(page.locator('details.howto')).not.toHaveAttribute('open', '');
});

test('smart mode preference survives reload', async () => {
  const box = page
    .locator('.option-checkbox', { hasText: 'Smart mode' })
    .locator('input');
  await box.uncheck();
  await page.waitForFunction(() =>
    localStorage.getItem('mathcompile-prefs')?.includes('false'),
  );

  await page.reload();
  await page.waitForSelector('math-field');
  await expect(
    page
      .locator('.option-checkbox', { hasText: 'Smart mode' })
      .locator('input'),
  ).not.toBeChecked();
});
