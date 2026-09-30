import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// The palette stays mounted (`.open` toggles visibility), so the closed
// assertion is not.toBeVisible(), not toHaveCount(0). Focus inside a
// math-field lands on MQ's hidden textarea — assert via contains().

const cellFocused = (page: Page, i = 0) =>
  page.waitForFunction(
    (idx) =>
      document
        .querySelectorAll('math-field')
        [idx]?.contains(document.activeElement),
    i,
  );

const cellValue = (page: Page, i = 0): Promise<string> =>
  page
    .locator('math-field')
    .nth(i)
    .evaluate((el) => (el as unknown as { value: string }).value);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const mf = page.locator('math-field').first();
  await mf.click();
  await mf.focus();
  await clearFirstCell(page);
});

test('Ctrl+K opens the palette and Esc refocuses the cell', async ({
  page,
}) => {
  await page.keyboard.press('Control+k');
  await expect(page.locator('.palette')).toBeVisible();
  await expect(page.locator('.palette-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.palette')).not.toBeVisible();
  await cellFocused(page);
});

test('running a command by fuzzy match changes the target', async ({
  page,
}) => {
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('target calculator');
  await page.keyboard.press('Enter');
  await expect(page.locator('.palette')).not.toBeVisible();
  await expect(page.locator('.target-select select')).toHaveValue(
    'calculator',
  );
});

test('insert expression below adds a focused cell', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('insert below');
  await page.keyboard.press('Enter');
  await expect(page.locator('math-field')).toHaveCount(2);
  await cellFocused(page, 1);
});

test('arrow keys navigate and smart mode toggles', async ({ page }) => {
  const checkbox = page.locator('.option-checkbox input');
  await expect(checkbox).toBeChecked();
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('smart');
  await page.keyboard.press('Enter');
  await expect(checkbox).not.toBeChecked();
});

test('header button opens the palette', async ({ page }) => {
  await page.locator('.palette-button').click();
  await expect(page.locator('.palette')).toBeVisible();
  await expect(page.locator('.palette-input')).toBeFocused();
});

test('Ctrl+K closes an open palette', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await expect(page.locator('.palette')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.locator('.palette')).not.toBeVisible();
  await cellFocused(page);
});

test('clicking the backdrop closes the palette', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await expect(page.locator('.palette')).toBeVisible();
  await page.locator('.palette-backdrop').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('.palette')).not.toBeVisible();
});

test('empty query lists every command', async ({ page }) => {
  await page.keyboard.press('Control+k');
  // 6 fixed commands + 2 enabled targets + 1 goto per cell (one cell here).
  await expect(page.locator('.cmd-item')).toHaveCount(9);
});

test('a query matching nothing shows the empty state', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('zzzzqqqq');
  await expect(page.locator('.cmd-item')).toHaveCount(0);
  await expect(page.locator('.cmd-empty')).toHaveText('No matching commands');
  await page.keyboard.press('Enter'); // running with no match must not throw
  await expect(page.locator('.palette')).toBeVisible();
});

test('fuzzy ordering ranks the documented examples first', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('target c');
  await expect(page.locator('.cmd-item .cmd-title').first()).toHaveText(
    'Target: Calculator',
  );
  await page.locator('.palette-input').fill('');
  await page.locator('.palette-input').pressSequentially('clear');
  await expect(page.locator('.cmd-item .cmd-title').first()).toHaveText(
    'Clear all expressions',
  );
});

test('arrow keys move the selection and Enter runs the highlighted command', async ({
  page,
}) => {
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('target');
  // 'target' scores identically per command; the shorter-text tiebreak
  // puts LaTeX before Calculator (only enabled targets get commands).
  const titles = page.locator('.cmd-item .cmd-title');
  await expect(titles.first()).toHaveText('Target: LaTeX');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.cmd-item').nth(1)).toHaveClass(/selected/);
  await expect(titles.nth(1)).toHaveText('Target: Calculator');
  await page.keyboard.press('Enter');
  await expect(page.locator('.target-select select')).toHaveValue(
    'calculator',
  );
});

test('hovering selects an item and clicking runs it', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('target c');
  const item = page.locator('.cmd-item', { hasText: 'Target: Calculator' });
  await item.hover();
  await expect(item).toHaveClass(/selected/);
  await item.click();
  await expect(page.locator('.palette')).not.toBeVisible();
  await expect(page.locator('.target-select select')).toHaveValue(
    'calculator',
  );
});

test('the active option is marked current', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('target latex');
  await expect(
    page
      .locator('.cmd-item', { hasText: 'Target: LaTeX' })
      .locator('.cmd-current'),
  ).toHaveText('✓');
  await expect(
    page
      .locator('.cmd-item', { hasText: 'Target: GLSL' })
      .locator('.cmd-current'),
  ).toHaveCount(0);
});

test('go-to-expression focuses that cell', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  const second = page.locator('math-field').nth(1);
  await second.pressSequentially('b', { delay: 40 });
  // Focus cell 0, then jump to expression 2 via the palette.
  await mf.click();
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('go to expression 2');
  await page.keyboard.press('Enter');
  await cellFocused(page, 1);
});

test('duplicate copies the focused cell below it', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('x+1', { delay: 40 });
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('duplicate');
  await page.keyboard.press('Enter');
  await expect(page.locator('math-field')).toHaveCount(2);
  for (const i of [0, 1]) expect(await cellValue(page, i)).toBe('x+1');
});

test('delete current expression removes it and focuses a neighbor', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  const second = page.locator('math-field').nth(1);
  await second.pressSequentially('b', { delay: 40 });
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('delete current');
  await page.keyboard.press('Enter');
  await expect(page.locator('math-field')).toHaveCount(1);
  expect(await cellValue(page, 0)).toBe('a');
  await cellFocused(page);
});

test('clear all expressions leaves a single empty focused cell', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click();
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('clear all');
  await page.keyboard.press('Enter');
  await expect(page.locator('math-field')).toHaveCount(1);
  expect(await cellValue(page, 0)).toBe('');
  await cellFocused(page);
});

test('palette input keeps focus after opening right after an edit', async ({
  page,
}) => {
  // No deferred refocus exists under MathQuill, but the guarded re-assert
  // must still keep the input focused and never steal it back later.
  const mf = page.locator('math-field').first();
  await mf.click();
  await mf.pressSequentially('x', { delay: 40 });
  await page.keyboard.press('Control+k');
  await expect(page.locator('.palette-input')).toBeFocused();
  await page.waitForTimeout(200);
  await expect(page.locator('.palette-input')).toBeFocused();
});

test('Alt+S is ignored while the palette is open', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Alt+s');
  // Smart mode defaults on; a swallowed Alt+S must leave it unchanged.
  await expect(page.locator('.option-checkbox input')).toBeChecked();
});

test('exposes dialog/listbox semantics for assistive tech', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await expect(page.locator('[role="combobox"]')).toBeVisible();
  await expect(page.locator('[role="listbox"]')).toBeVisible();
  await expect(page.locator('[role="option"]').first()).toBeVisible();
});
