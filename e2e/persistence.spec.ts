import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { clearFirstCell } from './helpers';

// Persistence: worksheet cells and prefs survive a reload. Writes are
// debounced (~300ms), so tests wait on the storage key before reloading
// rather than racing the timer.

const cell = (page: import('@playwright/test').Page, i: number): Locator =>
  page.locator('math-field').nth(i);

const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { value: string }).value);

const waitStored = (page: import('@playwright/test').Page, latex: string) =>
  page.waitForFunction(
    (needle) => localStorage.getItem('mathcompile-cells')?.includes(needle),
    latex,
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
  await clearFirstCell(page);
});

test('typed cells are restored after reload', async ({ page }) => {
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

test('deleted cells stay deleted after reload', async ({ page }) => {
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('z', { delay: 40 });
  await page.locator('.expr-delete').first().click();
  await page.waitForFunction(
    () => !localStorage.getItem('mathcompile-cells')?.includes('},{'),
  );

  await page.reload();
  await page.waitForSelector('math-field');
  await expect(page.locator('math-field')).toHaveCount(1);
  expect(await cellValue(cell(page, 0))).toBe('z');
});

test('guide collapsed state survives reload', async ({ page }) => {
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

test('smart mode preference survives reload', async ({ page }) => {
  const box = page.locator('.option-checkbox input');
  await box.uncheck();
  await page.waitForFunction(() =>
    localStorage.getItem('mathcompile-prefs')?.includes('false'),
  );

  await page.reload();
  await page.waitForSelector('math-field');
  await expect(page.locator('.option-checkbox input')).not.toBeChecked();
});
