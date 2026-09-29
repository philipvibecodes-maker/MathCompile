import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const mf = page.locator('math-field').first();
  await mf.click();
  await mf.focus();
});

test('Ctrl+K opens the palette and Esc refocuses the cell', async ({
  page,
}) => {
  await page.keyboard.press('Control+k');
  await expect(page.locator('.palette')).toBeVisible();
  await expect(page.locator('.palette-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.palette')).toBeHidden();
  // Refocus happens in a post-commit effect; wait for it rather than racing.
  await page.waitForFunction(
    () => document.activeElement?.tagName === 'MATH-FIELD',
  );
});

test('running a command by fuzzy match changes the target', async ({
  page,
}) => {
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('target glsl');
  await page.keyboard.press('Enter');
  await expect(page.locator('.palette')).toBeHidden();
  await expect(page.locator('.target-select select')).toHaveValue('glsl');
});

test('insert expression below adds a focused cell', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('insert below');
  await page.keyboard.press('Enter');
  await expect(page.locator('math-field')).toHaveCount(2);
  await page.waitForFunction(
    () =>
      document.activeElement === document.querySelectorAll('math-field')[1],
  );
});

test('arrow keys navigate and smart mode toggles', async ({ page }) => {
  const checkbox = page.locator('.option-checkbox input').nth(1);
  await expect(checkbox).not.toBeChecked();
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('smart');
  await page.keyboard.press('Enter');
  await expect(checkbox).toBeChecked();
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
  await expect(page.locator('.palette')).toBeHidden();
  await page.waitForFunction(
    () => document.activeElement?.tagName === 'MATH-FIELD',
  );
});

test('clicking the backdrop closes the palette', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await expect(page.locator('.palette')).toBeVisible();
  await page.locator('.palette-backdrop').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('.palette')).toBeHidden();
});

test('empty query lists every command', async ({ page }) => {
  await page.keyboard.press('Control+k');
  // 6 fixed commands + 4 targets + 1 goto per cell (single cell here).
  await expect(page.locator('.cmd-item')).toHaveCount(11);
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
  await page.locator('.palette-input').pressSequentially('tpy');
  await expect(page.locator('.cmd-item .cmd-title').first()).toHaveText(
    'Target: Python',
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
  // 'target' scores identically per command; the shorter-text tiebreak wins,
  // so the order is C, GLSL, Python, JavaScript.
  const titles = page.locator('.cmd-item .cmd-title');
  await expect(titles.first()).toHaveText('Target: C');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.cmd-item').nth(1)).toHaveClass(/selected/);
  await expect(titles.nth(1)).toHaveText('Target: GLSL');
  await page.keyboard.press('Enter');
  await expect(page.locator('.target-select select')).toHaveValue('glsl');
});

test('hovering selects an item and clicking runs it', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('target c');
  const item = page.locator('.cmd-item', { hasText: 'Target: C' });
  await item.hover();
  await expect(item).toHaveClass(/selected/);
  await item.click();
  await expect(page.locator('.palette')).toBeHidden();
  await expect(page.locator('.target-select select')).toHaveValue('c');
});

test('the active option is marked current', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('target python');
  await expect(
    page.locator('.cmd-item', { hasText: 'Target: Python' }).locator('.cmd-current'),
  ).toHaveText('✓');
  await expect(
    page.locator('.cmd-item', { hasText: 'Target: GLSL' }).locator('.cmd-current'),
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
  await page.waitForFunction(
    () =>
      document.activeElement === document.querySelectorAll('math-field')[1],
  );
});

test('duplicate copies the focused cell below it', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('x+1', { delay: 40 });
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('duplicate');
  await page.keyboard.press('Enter');
  await expect(page.locator('math-field')).toHaveCount(2);
  for (const i of [0, 1])
    expect(
      await page
        .locator('math-field')
        .nth(i)
        .evaluate((el) => (el as unknown as { getValue(): string }).getValue()),
    ).toBe('x+1');
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
  expect(
    await mf.evaluate((el) => (el as unknown as { getValue(): string }).getValue()),
  ).toBe('a');
  await page.waitForFunction(
    () => document.activeElement === document.querySelector('math-field'),
  );
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
  expect(
    await mf.evaluate((el) => (el as unknown as { getValue(): string }).getValue()),
  ).toBe('');
  await page.waitForFunction(
    () => document.activeElement === document.querySelector('math-field'),
  );
});

test('d/dx means derivative command toggles the option', async ({ page }) => {
  const box = page.locator('.option-checkbox input').first();
  await expect(box).toBeChecked();
  await page.keyboard.press('Control+k');
  await page.locator('.palette-input').pressSequentially('d/dx');
  await page.keyboard.press('Enter');
  await expect(box).not.toBeChecked();
});

test('palette input keeps focus after MathLive’s deferred refocus', async ({
  page,
}) => {
  // MathLive re-asserts cell focus on a ~60ms timer after the field was
  // focused; opening the palette right after editing must not lose focus.
  const mf = page.locator('math-field').first();
  await mf.click();
  await mf.pressSequentially('x', { delay: 40 });
  await page.keyboard.press('Control+k');
  await expect(page.locator('.palette-input')).toBeFocused();
  await page.waitForTimeout(200); // past the ~60ms steal window
  await expect(page.locator('.palette-input')).toBeFocused();
});

test('Alt+S is ignored while the palette is open', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Alt+s');
  await expect(page.locator('.option-checkbox input').nth(1)).not.toBeChecked();
});

test('exposes dialog/listbox semantics for assistive tech', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await expect(page.locator('[role="combobox"]')).toBeVisible();
  await expect(page.locator('[role="listbox"]')).toBeVisible();
  await expect(page.locator('[role="option"]').first()).toBeVisible();
});
