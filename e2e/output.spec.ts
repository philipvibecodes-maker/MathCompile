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

test('there is no output panel for the latex target', async ({ page }) => {
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

test('target select offers all codegen targets, python enabled', async ({
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
    ['python', false],
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

  // The python target swaps the per-cell output for generated code
  // (symbol defs included — x is defined in this cell).
  await setTarget(page, 'python');
  await expect(page.locator('.cell-latex')).toHaveCount(0);
  await expect(page.locator('.cell-python').first()).toContainText('x + 1');
});

test('python target shows per-cell code and the worksheet program', async ({
  page,
}) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a=x+1', { delay: 40 });
  await setTarget(page, 'python');

  // Per-cell output: the Symbol definition lives in the cell that defines
  // it, above the assign statement. The default `from sympy import *`
  // mode emits unqualified names.
  await expect(page.locator('.cell-python').first()).toContainText(
    'x = Symbol("x")',
  );
  await expect(page.locator('.cell-python').first()).toContainText(
    'a = x + 1',
  );

  // The output panel shows the full SymPy program.
  const panel = page.locator('.output-panel');
  await expect(panel).toBeVisible();
  const code = page.locator('.output-code');
  await expect(code).toContainText('from sympy import *');
  await expect(code).toContainText('x = Symbol("x")');
  await expect(code).toContainText('a = x + 1');

  // Switching back to latex removes the panel and code output.
  await setTarget(page, 'latex');
  await expect(page.locator('.output-panel')).toHaveCount(0);
  await expect(page.locator('.cell-python')).toHaveCount(0);
});

test('import-all checkbox switches between import * and sp. qualifiers', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a=x+1', { delay: 40 });
  await setTarget(page, 'python');

  const toggle = page.locator('.output-import-all input');
  const importChip = page.locator('.output-import');
  const code = page.locator('.output-code');

  // Default: checked, import-* header, unqualified output.
  await expect(toggle).toBeChecked();
  await expect(importChip).toHaveText('from sympy import *');
  await expect(code).toContainText('x = Symbol("x")');

  // The header import line is copyable.
  await importChip.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'from sympy import *',
  );

  // Unchecked: `import sympy as sp` header and sp.-qualified output.
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(importChip).toHaveText('import sympy as sp');
  await expect(code).toContainText('import sympy as sp');
  await expect(code).toContainText('x = sp.Symbol("x")');
  await expect(page.locator('.cell-python').first()).toContainText(
    'x = sp.Symbol("x")',
  );
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
