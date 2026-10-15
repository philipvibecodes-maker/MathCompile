import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// The "How do I…" section lists pinned + featured topics; the wider
// catalog is searched through a centered overlay (Ctrl+/, the header ?
// button, or the palette's Search help command). Results pin into the
// section and rows hide — all persisted in mathcompile-prefs.

const guide = (page: Page): Locator => page.locator('details.howto');
const panel = (page: Page): Locator => page.locator('.help-panel');
const search = (page: Page): Locator => page.locator('.help-input');
const row = (page: Page, goal: string): Locator =>
  guide(page).locator('.howto-item', { hasText: goal });
const hit = (page: Page, goal: string): Locator =>
  panel(page).locator('.help-item', { hasText: goal });

// Ctrl+/ opens the overlay and focuses its input.
const openSearch = async (page: Page) => {
  await page.keyboard.press('Control+/');
  await expect(search(page)).toBeFocused();
};
// Esc clears a typed query first, then closes the overlay.
const closeSearch = async (page: Page) => {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(panel(page)).not.toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
});

test('search finds topics beyond the default list and pins them', async ({
  page,
}) => {
  // 'Solve equations' is not a featured row — only reachable via search.
  await expect(row(page, 'Solve equations')).toHaveCount(0);
  await openSearch(page);
  await search(page).fill('solve equations');
  await expect(hit(page, 'Solve equations')).toHaveCount(1);

  await hit(page, 'Solve equations').locator('.howto-pin').click();
  await expect(
    hit(page, 'Solve equations').locator('.howto-pin'),
  ).toHaveText('unpin');
  await closeSearch(page);

  // Pinned rows lead the section's list and stay until unpinned.
  await expect(guide(page).locator('.howto-item dt').first()).toContainText(
    'Solve equations',
  );
  await expect(row(page, 'Solve equations').locator('.howto-pin')).toHaveText(
    'unpin',
  );
});

test('Enter inserts the topic input into the active cell', async ({
  page,
}) => {
  await clearFirstCell(page);
  await openSearch(page);
  await search(page).fill('square root');
  await page.keyboard.press('Enter');
  await expect(panel(page)).not.toBeVisible();

  const field = page.locator('math-field').first();
  const latex = () =>
    field.evaluate(
      (el) => (el as unknown as { mq: { latex(): string } }).mq.latex(),
    );
  expect(await latex()).toBe('\\sqrt{ }');
  // The caret lands inside the radicand, where typing the command would
  // leave it.
  await page.keyboard.type('2');
  expect(await latex()).toBe('\\sqrt{2}');
});

test('Shift+Enter pins the selected result; the dialog stays open', async ({
  page,
}) => {
  await openSearch(page);
  await search(page).fill('matrix operations');
  await page.keyboard.press('Shift+Enter');
  await expect(
    hit(page, 'Matrix operations').locator('.howto-pin'),
  ).toHaveText('unpin');
  await closeSearch(page);
  await expect(row(page, 'Matrix operations')).toHaveCount(1);
});

test('clicking a result row pins it', async ({ page }) => {
  await openSearch(page);
  await search(page).fill('greek');
  await hit(page, 'Greek letters').click();
  await expect(hit(page, 'Greek letters').locator('.howto-pin')).toHaveText(
    'unpin',
  );
  await closeSearch(page);
  await expect(row(page, 'Greek letters')).toHaveCount(1);
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
  await openSearch(page);
  await search(page).fill('greek');
  const g = hit(page, 'Greek letters');
  await expect(g).toHaveCount(1);
  await expect(g.locator('.howto-hidden-tag')).toHaveText('hidden');

  await page.getByRole('button', { name: 'Show Greek letters again' }).click();
  await expect(g.locator('.howto-hidden-tag')).toHaveCount(0);
  await closeSearch(page);
  await expect(row(page, 'Greek letters')).toHaveCount(1);
});

test('header guide link is visible; ? button opens the search overlay', async ({
  page,
}) => {
  const link = page.locator('.guide-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /user-guide\.pdf$/);
  await expect(link).toHaveAttribute('target', '_blank');

  await page.locator('.help-search-btn').click();
  await expect(panel(page)).toBeVisible();
  await expect(search(page)).toBeFocused();
});

test('Ctrl+/ toggles the search overlay', async ({ page }) => {
  await page.keyboard.press('Control+/');
  await expect(panel(page)).toBeVisible();
  await expect(search(page)).toBeFocused();
  await page.keyboard.press('Control+/');
  await expect(panel(page)).not.toBeVisible();
});

test('palette Search help command opens the search overlay', async ({
  page,
}) => {
  await page.keyboard.press('Control+K');
  await page.locator('.palette-input').fill('search help');
  await page.keyboard.press('Enter');
  await expect(page.locator('.palette')).not.toBeVisible();
  await expect(panel(page)).toBeVisible();
  await expect(search(page)).toBeFocused();
});

test('Esc closes the overlay and refocuses the active cell', async ({
  page,
}) => {
  await openSearch(page);
  await page.keyboard.press('Escape');
  await expect(panel(page)).not.toBeVisible();
  const inside = await page.evaluate(() =>
    document.activeElement?.closest('math-field') ? true : false,
  );
  expect(inside).toBe(true);
});

test('word-level matches rank above scattered subsequence noise', async ({
  page,
}) => {
  // 'root' as a scattered subsequence matches many rows — the topic
  // containing it verbatim must lead, and its mark covers all four chars.
  await openSearch(page);
  await search(page).fill('root');
  const first = panel(page).locator('.help-item').first();
  await expect(first.locator('.help-goal')).toContainText('Square root');
  await expect(first.locator('.help-goal mark')).toHaveText('root');
});

test('matched text is highlighted in result rows', async ({ page }) => {
  // 'real' matches the 'Named sets' row via keywords, and the visible
  // keystroke text gets its 'real' run marked inside \reals.
  await openSearch(page);
  await search(page).fill('real');
  const h = hit(page, 'Named sets');
  await expect(h).toHaveCount(1);
  await expect(h.locator('.help-how mark').first()).toHaveText('real');
});

test('typing does not resize the result list', async ({ page }) => {
  await openSearch(page);
  const list = page.locator('.help-list');
  const before = (await list.boundingBox())!.height;
  await search(page).fill('solve');
  await expect(hit(page, 'Solve equations')).toHaveCount(1);
  // Frozen min-height: fewer rows must not shrink the box mid-search.
  const during = (await list.boundingBox())!.height;
  expect(during).toBeGreaterThanOrEqual(before - 1);
  await search(page).fill('');
  const after = (await list.boundingBox())!.height;
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
});

test('pins and hidden topics persist across reload', async ({ page }) => {
  await openSearch(page);
  await search(page).fill('solve equations');
  await hit(page, 'Solve equations').locator('.howto-pin').click();
  await closeSearch(page);
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
