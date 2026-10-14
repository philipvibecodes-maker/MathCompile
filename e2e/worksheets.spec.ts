import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { clearFirstCell } from './helpers';

// Worksheets: every sheet autosaves into 'mathcompile-worksheets', the
// header menu switches/renames/deletes them, and "Save to file" /
// "Open from file" move a sheet in and out of a .mathcompile.json.
// Cell writes are debounced (~300ms), so tests wait on the storage key
// before reloading or switching rather than racing the timer.

const cell = (page: import('@playwright/test').Page, i: number): Locator =>
  page.locator('math-field').nth(i);

const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { value: string }).value);

const waitStored = (page: import('@playwright/test').Page, needle: string) =>
  page.waitForFunction(
    (n) => localStorage.getItem('mathcompile-worksheets')?.includes(n),
    needle,
  );

const openMenu = async (page: import('@playwright/test').Page) => {
  await page.locator('.worksheets-btn').click();
  await expect(page.locator('.worksheets-menu')).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
  await clearFirstCell(page);
});

test('each worksheet autosaves and the active sheet restores on reload',
  { tag: '@smoke' },
  async ({
  page,
}) => {
  await cell(page, 0).pressSequentially('x+1', { delay: 40 });

  await openMenu(page);
  await page.locator('.ws-action', { hasText: 'New worksheet' }).click();
  await cell(page, 0).pressSequentially('y+2', { delay: 40 });
  await waitStored(page, 'y+2');

  await page.reload();
  await page.waitForSelector('math-field');
  // Reload lands on the last-active sheet.
  await expect(page.locator('.worksheets-current')).toHaveText('Worksheet 2');
  expect(await cellValue(cell(page, 0))).toBe('y+2');

  await openMenu(page);
  await page.locator('.ws-name', { hasText: 'Worksheet 1' }).click();
  expect(await cellValue(cell(page, 0))).toBe('x+1');
});

test('renaming and deleting worksheets in the menu', async ({ page }) => {
  await openMenu(page);
  await page.locator('.ws-action', { hasText: 'New worksheet' }).click();

  await openMenu(page);
  const row = page.locator('.ws-row', { hasText: 'Worksheet 1' });
  await row.locator('.ws-icon').first().click();
  // The input replaces the name button, so the row locator's hasText no
  // longer matches — target the input directly.
  const rename = page.locator('.ws-rename');
  await rename.fill('Derivations');
  await rename.press('Enter');
  const renamed = page.locator('.ws-row', { hasText: 'Derivations' });
  await expect(renamed.locator('.ws-name')).toHaveText('Derivations');

  // Delete is a two-tap confirm: first click arms it, second removes.
  const del = renamed.locator('.ws-delete');
  await del.click();
  await expect(del).toHaveText('?');
  await del.click();
  await expect(page.locator('.ws-row')).toHaveCount(1);
  await expect(
    page.locator('.ws-row .ws-name', { hasText: 'Derivations' }),
  ).toHaveCount(0);
});

test('save to file downloads a .mathcompile.json that opens back', async ({
  page,
}) => {
  await cell(page, 0).pressSequentially('x+1', { delay: 40 });
  await waitStored(page, 'x+1');

  await openMenu(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.ws-action', { hasText: 'Save to file' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Worksheet 1.mathcompile.json');
  const text = await readFile(await download.path()!, 'utf8');
  const saved = JSON.parse(text);
  expect(saved.kind).toBe('worksheet');
  expect(saved.cells.map((c: { latex: string }) => c.latex)).toEqual(['x+1']);

  // Open it back: a new sheet appears, switched to, holding the cells.
  // The display name comes from the file name, not the embedded name.
  await openMenu(page);
  await page.locator('.ws-file').setInputFiles({
    name: 'back.mathcompile.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(page.locator('.worksheets-current')).toHaveText('back');
  expect(await cellValue(cell(page, 0))).toBe('x+1');
});

test('the command palette opens a worksheet file', async ({ page }) => {
  const payload = JSON.stringify({
    app: 'mathcompile',
    kind: 'worksheet',
    version: 1,
    name: 'ignored-embedded-name',
    cells: [{ id: 1, latex: 'z+3' }],
  });
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('open worksheet');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.keyboard.press('Enter'),
  ]);
  await chooser.setFiles({
    name: 'derivs.mathcompile.json',
    mimeType: 'application/json',
    buffer: Buffer.from(payload),
  });
  // The sheet takes the file's name and is switched to.
  await expect(page.locator('.worksheets-current')).toHaveText('derivs');
  expect(await cellValue(cell(page, 0))).toBe('z+3');
});

test('the last remaining worksheet cannot be deleted', async ({ page }) => {
  await openMenu(page);
  await expect(page.locator('.ws-row')).toHaveCount(1);
  await expect(page.locator('.ws-delete')).toHaveCount(0);
});
