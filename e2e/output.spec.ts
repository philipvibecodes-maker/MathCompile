import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// The header holds the option toggles and the target select. With the
// latex target (the default), each cell shows its LaTeX and a copy button
// to the right of the input.

const cell = (page: Page, i: number) => page.locator('math-field').nth(i);

// Smart mode maps to MQ autoCommands (non-empty list = on).
const smartModeOn = (page: Page, i = 0): Promise<boolean> =>
  cell(page, i).evaluate(
    (el) =>
      ((el as unknown as { options: { autoCommands?: string } }).options
        .autoCommands ?? '') !== '',
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
  await clearFirstCell(page);
});

test('there is no output panel', async ({ page }) => {
  await expect(page.locator('.output-panel')).toHaveCount(0);
});

// Disabled <option>s can't be picked via selectOption; dispatch a change
// the way the control's onchange would see it.
const setTarget = (page: Page, value: string) =>
  page.locator('.target-select select').evaluate((s, v) => {
    (s as HTMLSelectElement).value = v;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);

test('header shows the option checkbox and commands button', async ({
  page,
}) => {
  const header = page.locator('.app-header');
  await expect(header.locator('.option-checkbox input')).toHaveCount(1);
  await expect(header.locator('.palette-button')).toBeVisible();
});

test('output select sits above the output column', async ({ page }) => {
  const colHead = page.locator('.col-output-head');
  await expect(colHead.locator('.target-select select')).toBeVisible();
  await expect(colHead).toContainText('Output');
});

test('target select offers all codegen targets, non-latex disabled', async ({
  page,
}) => {
  await expect(page.locator('.target-select option')).toHaveText([
    'LaTeX',
    'Python',
    'JavaScript',
    'GLSL',
    'C',
  ]);
  await expect(page.locator('.target-select select')).toHaveValue('latex');
  const disabled = await page
    .locator('.target-select option')
    .evaluateAll((opts) =>
      opts.map((o) => [(o as HTMLOptionElement).value, o.disabled] as const),
    );
  expect(disabled).toEqual([
    ['latex', false],
    ['python', true],
    ['javascript', true],
    ['glsl', true],
    ['c', true],
  ]);
});

test('smart mode checkbox drives the math-field autoCommands option', async ({
  page,
}) => {
  const box = page.locator('.option-checkbox input');
  await expect(box).toBeChecked();
  expect(await smartModeOn(page)).toBe(true);
  await box.click();
  await expect(box).not.toBeChecked();
  expect(await smartModeOn(page)).toBe(false);
  await box.click();
  expect(await smartModeOn(page)).toBe(true);
});

test('Alt+S toggles smart mode', async ({ page }) => {
  await cell(page, 0).click(); // shortcut must work with a cell focused
  await page.keyboard.press('Alt+s');
  await expect(
    page.locator('.option-checkbox input'),
  ).not.toBeChecked();
  expect(await smartModeOn(page)).toBe(false);
  await page.keyboard.press('Alt+s');
  expect(await smartModeOn(page)).toBe(true);
});

test('latex target shows per-cell output with a copy button', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const output = page.locator('.cell-output').first();
  const copy = page.locator('.cell-copy').first();
  await expect(output).toBeVisible();
  await expect(copy).toBeDisabled();

  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('x+1', { delay: 40 });
  await expect(page.locator('.cell-latex').first()).toHaveText('x+1');

  await copy.click();
  await expect(copy).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('x+1');

  // Other targets hide the per-cell output.
  await setTarget(page, 'python');
  await expect(page.locator('.cell-output')).toHaveCount(0);
});

test('latex output shows multi-line cells as separate lines', async ({
  page,
}) => {
  const mf = cell(page, 0);
  await mf.click();
  await mf.pressSequentially('x', { delay: 40 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('y', { delay: 40 });
  // The field serializes multi-line content as \displaylines{...}; the
  // output shows the rows unwrapped, one per line with the \\ kept
  // (toHaveText would normalize the newline away, so read textContent).
  expect(await mf.evaluate((el) => (el as { value: string }).value)).toBe(
    '\\displaylines{x\\\\ y}',
  );
  const text = await page
    .locator('.cell-latex')
    .first()
    .evaluate((el) => el.textContent);
  expect(text).toBe('x\\\\\ny');
});
