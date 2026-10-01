import { expect, test } from '@playwright/test';
import { clearFirstCell } from './helpers';

// Parser-only LatexCmds (\left, \right, \textcolor, \class) used to crash
// the field with `Cannot read properties of undefined (reading
// 'childCount')` when typed through the latex command input — the nodes
// have no domView until their parser runs. They're now no-ops on typed
// insertion: the following keystroke continues normally.

const value = (page: import('@playwright/test').Page) =>
  page
    .locator('math-field')
    .first()
    .evaluate((el) => (el as unknown as { value: string }).value);

let pageErrors: string[];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto('/');
  const mf = page.locator('math-field').first();
  await mf.click();
  await mf.focus();
  await clearFirstCell(page);
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

test('typed \\textcolor is a no-op, not a crash', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('x+', { delay: 60 });
  await mf.pressSequentially('\\textcolor', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('y', { delay: 60 });
  expect(await value(page)).toBe('x+y');
});

test('typed \\class is a no-op, not a crash', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\class', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('z', { delay: 60 });
  expect(await value(page)).toBe('z');
});

test('typed \\left( auto-pairs the bracket', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\left(', { delay: 60 });
  expect(await value(page)).toBe('\\left(\\right)');
  await mf.pressSequentially('x', { delay: 60 });
  expect(await value(page)).toBe('\\left(x\\right)');
});

test('typed \\right) auto-pairs the bracket', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\right)', { delay: 60 });
  expect(await value(page)).toBe('\\left(\\right)');
});

test('typed \\left| renders the absolute-value pair', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\left|', { delay: 60 });
  expect(await value(page)).toBe('\\left|\\right|');
});

// The . delimiter in \left./\right. (invisible side, used for evaluation
// bars) previously failed to parse at all — cells/results containing it
// rendered blank.
test('\\left. x \\right|_{a}^{b} parses and round-trips', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.evaluate(
    (el) => ((el as unknown as { value: string }).value = '\\left. x \\right|_{a}^{b}'),
  );
  expect(await value(page)).toBe('\\left.x\\right|_{a}^{b}');
});

test('x\\left|y\\right. parses and round-trips', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.evaluate(
    (el) => ((el as unknown as { value: string }).value = 'x\\left|y\\right.'),
  );
  expect(await value(page)).toBe('x\\left|y\\right.');
});

// `sign` used to type as s*i*g*n — it's now an auto operator name and
// exports as \operatorname{sign}, which compiles to SymPy's sign().
test('sign unitalicizes in smart mode', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('sign(x)', { delay: 60 });
  expect(await value(page)).toBe('\\operatorname{sign}\\left(x\\right)');
});
