import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The output panel is a pure function of app state: expressions, target,
// and the two option toggles. Pins its rendered text and the wiring of the
// controls to the underlying math-field element properties.

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
});

test('shows the empty-state hint initially', async ({ page }) => {
  await expect(page.locator('.output-body')).toContainText(
    '(no expressions yet)',
  );
});

test('captures cell LaTeX numbered, with the target comment prefix', async ({
  page,
}) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('x+y', { delay: 40 });
  await expect(page.locator('.output-body')).toContainText('#   1: x+y');
});

test('skips empty cells when numbering captured input', async ({ page }) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a', { delay: 40 });
  await page.locator('.add-expr').click(); // cell 1 stays empty
  await page.locator('.add-expr').click(); // cell 2
  await cell(page, 2).pressSequentially('b', { delay: 40 });
  const body = await page.locator('.output-body').textContent();
  expect(body).toContain('1: a');
  expect(body).toContain('2: b');
  expect(body).not.toContain('3:');
});

test('switching target changes comment prefix and codegen label', async ({
  page,
}) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('x', { delay: 40 });
  const select = page.locator('.target-select select');
  await select.selectOption('javascript');
  await expect(page.locator('.output-body')).toContainText('//   1: x');
  await expect(page.locator('.output-body')).toContainText(
    'Codegen (JavaScript)',
  );
  await select.selectOption('python');
  await expect(page.locator('.output-body')).toContainText('#   1: x');
  await expect(page.locator('.output-body')).toContainText('Codegen (Python)');
});

test('target select offers all codegen targets', async ({ page }) => {
  await expect(page.locator('.target-select option')).toHaveText([
    'Python',
    'JavaScript',
    'GLSL',
    'C',
  ]);
  await expect(page.locator('.target-select select')).toHaveValue('python');
});

test('d/dx-means-derivative checkbox reflects in the options block', async ({
  page,
}) => {
  const box = page.locator('.option-checkbox input').first();
  await expect(box).toBeChecked();
  await expect(page.locator('.output-body')).toContainText(
    'd/dx means derivative: true',
  );
  await box.click();
  await expect(page.locator('.output-body')).toContainText(
    'd/dx means derivative: false',
  );
});

test('smart mode checkbox drives the math-field autoCommands option', async ({
  page,
}) => {
  const box = page.locator('.option-checkbox input').nth(1);
  await expect(box).not.toBeChecked();
  expect(await smartModeOn(page)).toBe(false);
  await box.click();
  await expect(box).toBeChecked();
  expect(await smartModeOn(page)).toBe(true);
  await box.click();
  expect(await smartModeOn(page)).toBe(false);
});

test('Alt+S toggles smart mode', async ({ page }) => {
  await cell(page, 0).click(); // shortcut must work with a cell focused
  await page.keyboard.press('Alt+s');
  await expect(page.locator('.option-checkbox input').nth(1)).toBeChecked();
  expect(await smartModeOn(page)).toBe(true);
  await page.keyboard.press('Alt+s');
  expect(await smartModeOn(page)).toBe(false);
});
