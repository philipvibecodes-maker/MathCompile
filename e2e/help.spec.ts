import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// The "How do I…" section: a searchable help catalog where results pin
// into the list and rows hide — all persisted in mathcompile-prefs.
// Entry points pinned here: the in-section input, the header ? button,
// Ctrl+/, and the palette's Search help command.

const guide = (page: Page): Locator => page.locator('details.howto');
const search = (page: Page): Locator => page.locator('.howto-search');
const row = (page: Page, goal: string): Locator =>
  guide(page).locator('.howto-item', { hasText: goal });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
});

test('search finds topics beyond the default list and pins them', async ({
  page,
}) => {
  await expect(search(page)).toBeVisible();
  // 'Solve equations' is not a featured row — only reachable via search.
  await expect(row(page, 'Solve equations')).toHaveCount(0);
  await search(page).fill('solve equations');
  await expect(row(page, 'Solve equations')).toHaveCount(1);

  await row(page, 'Solve equations').locator('.howto-pin').click();
  await search(page).fill('');

  // Pinned rows lead the default list and stay until unpinned.
  await expect(guide(page).locator('.howto-item dt').first()).toContainText(
    'Solve equations',
  );
  await expect(row(page, 'Solve equations').locator('.howto-pin')).toHaveText(
    'unpin',
  );
});

test('Enter pins the top search result', async ({ page }) => {
  await search(page).fill('matrix operations');
  await page.keyboard.press('Enter');
  await search(page).fill('');
  await expect(row(page, 'Matrix operations')).toHaveCount(1);
});

test('hiding a row removes it; the restore link brings it back', async ({
  page,
}) => {
  await expect(row(page, 'Fraction')).toHaveCount(1);
  await page.getByRole('button', { name: 'Hide Fraction' }).click();
  await expect(row(page, 'Fraction')).toHaveCount(0);
  await expect(page.locator('.howto-restore')).toHaveText('1 hidden — restore');

  await page.locator('.howto-restore').click();
  await expect(row(page, 'Fraction')).toHaveCount(1);
  await expect(page.locator('.howto-restore')).toHaveCount(0);
});

test('hidden topics still surface in search and restore from the row', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Hide Greek letters' }).click();
  await search(page).fill('greek');
  const hit = row(page, 'Greek letters');
  await expect(hit).toHaveCount(1);
  await expect(hit.locator('.howto-hidden-tag')).toHaveText('hidden');

  await page.getByRole('button', { name: 'Show Greek letters again' }).click();
  await expect(hit.locator('.howto-hidden-tag')).toHaveCount(0);
  await search(page).fill('');
  await expect(row(page, 'Greek letters')).toHaveCount(1);
});

test('header guide link is visible; ? button focuses the search', async ({
  page,
}) => {
  const link = page.locator('.guide-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /user-guide\.pdf$/);
  await expect(link).toHaveAttribute('target', '_blank');

  await guide(page).locator('summary').click();
  await expect(guide(page)).not.toHaveAttribute('open', '');
  await page.locator('.help-search-btn').click();
  await expect(guide(page)).toHaveAttribute('open', '');
  await expect(search(page)).toBeFocused();
});

test('Ctrl+/ opens and focuses the search', async ({ page }) => {
  await guide(page).locator('summary').click();
  await page.keyboard.press('Control+/');
  await expect(guide(page)).toHaveAttribute('open', '');
  await expect(search(page)).toBeFocused();
});

test('palette Search help command opens and focuses the search', async ({
  page,
}) => {
  await page.keyboard.press('Control+K');
  await page.locator('.palette-input').fill('search help');
  await page.keyboard.press('Enter');
  await expect(page.locator('.palette')).not.toBeVisible();
  await expect(search(page)).toBeFocused();
});

test('matched text is highlighted in result rows', async ({ page }) => {
  // 'real' matches the 'Named sets' row via keywords, and the visible
  // keystroke text gets its 'real' run marked inside \reals.
  await search(page).fill('real');
  const hit = row(page, 'Named sets');
  await expect(hit).toHaveCount(1);
  await expect(hit.locator('dd mark').first()).toHaveText('real');
});

test('typing does not resize the list box', async ({ page }) => {
  const list = page.locator('.howto-list');
  const before = (await list.boundingBox())!.height;
  await search(page).fill('solve');
  await expect(row(page, 'Solve equations')).toHaveCount(1);
  // Frozen min-height: fewer rows must not shrink the box mid-search.
  const during = (await list.boundingBox())!.height;
  expect(during).toBeGreaterThanOrEqual(before - 1);
  await search(page).fill('');
  const after = (await list.boundingBox())!.height;
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
});

test('pins and hidden topics persist across reload', async ({ page }) => {
  await search(page).fill('solve equations');
  await row(page, 'Solve equations').locator('.howto-pin').click();
  await search(page).fill('');
  await page.getByRole('button', { name: 'Hide Fraction' }).click();
  await page.waitForFunction(
    () =>
      localStorage.getItem('mathcompile-prefs')?.includes('"pinnedHelp"') &&
      localStorage.getItem('mathcompile-prefs')?.includes('"hiddenHelp"'),
  );

  await page.reload();
  await page.waitForSelector('math-field');
  await expect(row(page, 'Solve equations')).toHaveCount(1);
  await expect(row(page, 'Fraction')).toHaveCount(0);
  await expect(page.locator('.howto-restore')).toHaveText('1 hidden — restore');
});
