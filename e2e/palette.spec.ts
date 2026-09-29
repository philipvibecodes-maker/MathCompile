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
  await expect(page.locator('.palette')).toHaveCount(0);
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
  await expect(page.locator('.palette')).toHaveCount(0);
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
