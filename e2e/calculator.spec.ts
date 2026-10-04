import { expect, test } from '@playwright/test';
import { clearFirstCell } from './helpers';

// The calculator target evaluates each cell through SymPy on Pyodide
// (loaded from the CDN on first use). First engine boot pulls the wasm
// runtime + sympy wheels, so specs get a long timeout.

const cell = (page: import('@playwright/test').Page, i: number) =>
  page.locator('math-field').nth(i);

const setTarget = (page: import('@playwright/test').Page, value: string) =>
  page.locator('.target-select select').selectOption(value);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
  await clearFirstCell(page);
});

test('calculator evaluates a typed expression through SymPy', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTarget(page, 'calculator');

  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('2+2', { delay: 40 });

  // MathQuill StaticMath renders the sympy result as math.
  await expect(
    page.locator('.calc-row .calc-math').first(),
  ).toContainText('4', { timeout: 90_000 });
});

test('calculator renders an approximate value for irrationals', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTarget(page, 'calculator');

  const mf = cell(page, 0);
  await mf.click();
  // Smart mode (on by default) converts 'sqrt' into the \sqrt template.
  await mf.pressSequentially('sqrt', { delay: 40 });
  await mf.pressSequentially('2', { delay: 40 });

  await expect(page.locator('.calc-approx').first()).toContainText('1.4142', {
    timeout: 90_000,
  });
});

test('calculator evaluates each statement row of a multi-line cell', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTarget(page, 'calculator');

  const mf = cell(page, 0);
  await mf.click();
  await mf.pressSequentially('1+1', { delay: 40 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('2+3', { delay: 40 });

  // Two \\ rows compile to two statements — one result row each.
  const rows = page.locator('.calc-row');
  await expect(rows).toHaveCount(2, { timeout: 90_000 });
  await expect(rows.nth(0)).toContainText('2');
  await expect(rows.nth(1)).toContainText('5');
});

// The calculator reports issues like the python target's overlay, but
// in the input column: the message panel mounts under the math-field —
// in flow, so it never covers the field's other input lines — while
// the failing statement's output row keeps just its ! marker.
test('a failing statement reports the error in the input column', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTarget(page, 'calculator');

  const mf = cell(page, 0);
  await mf.click();
  await mf.pressSequentially('2+2', { delay: 40 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('\\sum', { delay: 40 });
  // Enter accepts the open latex command (the sum template lands with
  // the caret in the lower bound); the upper bound stays empty.
  await page.keyboard.press('Enter');
  await mf.pressSequentially('i=0', { delay: 40 });

  const rows = page.locator('.calc-row');
  await expect(rows).toHaveCount(2, { timeout: 90_000 });
  await expect(rows.nth(0).locator('.calc-math')).toContainText('4');
  await expect(rows.nth(1).locator('.parse-error-icon')).toBeVisible();
  const issues = page.locator('.cell-input .calc-issues');
  await expect(issues).toBeVisible();
  await expect(issues).toContainText('missing argument');
  await expect(page.locator('.cell-output .calc-issues')).toHaveCount(0);
});

test('indefinite integral shows the constant of integration last', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTarget(page, 'calculator');

  const mf = cell(page, 0);
  await mf.click();
  // \antid is the boundless (indefinite) integral sign.
  await mf.pressSequentially('\\antid', { delay: 40 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('x+1dx', { delay: 40 });

  const rows = page.locator('.calc-rows').first();
  await expect(rows).toBeAttached({ timeout: 90_000 });
  await expect(rows).not.toHaveClass(/pending/, { timeout: 90_000 });
  const row = page.locator('.calc-row').first();
  // x**2/2 + x + C — decreasing degree, the constant written last.
  const text = (await row.textContent()) ?? '';
  expect(text.replace(/\s/g, '')).toMatch(/x.*x.*C$/);
  expect(text.trim().endsWith('C')).toBe(true);
});

// Regression for two reported bugs on this exact input: juxtaposed
// `\sqrt{x}(x+1)` used to compile to `sqrt(x)(x + 1)` → SymPy raised
// "'Pow' object is not callable", and the result's atan rendered as
// "a tan" (MathQuill doesn't know `atan` as an operator name).
test('implicit-multiply integrand evaluates and renders arctan', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTarget(page, 'calculator');

  const mf = cell(page, 0);
  await mf.evaluate((el, v) => {
    (el as { value: string }).value = v;
  }, '\\antid \\frac{1}{\\sqrt{x}(x+1)}dx');

  const rows = page.locator('.calc-rows').first();
  await expect(rows).toBeAttached({ timeout: 90_000 });
  await expect(rows).not.toHaveClass(/pending/, { timeout: 90_000 });
  const row = page.locator('.calc-row').first();
  await expect(row.locator('.calc-error')).toHaveCount(0);
  // 2 arctan(sqrt(x)) + C — the arc-name renders as one operator name,
  // not "a" + "tan". \arctan typesets upright in MathQuill.
  const math = row.locator('.calc-math');
  await expect(math).toContainText('arctan');
  await expect(math).toContainText('C');
});

// \left. f \right|_{a}^{b}: the `.` delimiter used to be unparseable in
// MathQuill (the whole cell rendered blank), and the evaluation bar used
// to compile to garbage. Now it emits the substitution difference.
test('evaluation bar computes the substitution difference', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTarget(page, 'calculator');

  const mf = cell(page, 0);
  await mf.evaluate((el, v) => {
    (el as { value: string }).value = v;
  }, '\\left. x^{2} \\right|_{0}^{1}');

  const rows = page.locator('.calc-rows').first();
  await expect(rows).toBeAttached({ timeout: 90_000 });
  await expect(rows).not.toHaveClass(/pending/, { timeout: 90_000 });
  const row = page.locator('.calc-row').first();
  await expect(row.locator('.calc-error')).toHaveCount(0);
  await expect(row.locator('.calc-math')).toContainText('1');
});

test('calculator shows an instant nerdamer result while SymPy boots', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTarget(page, 'calculator');

  const mf = cell(page, 0);
  await mf.click();
  await mf.pressSequentially('2+2', { delay: 40 });

  // The nerdamer interim row lands long before the ~4s engine boot and
  // stays dimmed (.pending) until the real SymPy result replaces it.
  const rows = page.locator('.calc-rows');
  await expect(rows.first()).toContainText('4', { timeout: 10_000 });
  await expect(rows.first()).toHaveClass(/pending/);
  await expect(rows.first()).not.toHaveClass(/pending/, {
    timeout: 90_000,
  });
  await expect(page.locator('.calc-row').first()).toContainText('4');
});

test('flags interim results and the engine-loading banner while SymPy boots', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTarget(page, 'calculator');

  const mf = cell(page, 0);
  await mf.click();
  await mf.pressSequentially('2+2', { delay: 40 });

  // While Pyodide boots, the output column header's engine chip says
  // it's still loading and names the interim engine, and each interim
  // row is tagged as an estimate.
  const chip = page.locator('.engine-chip');
  await expect(chip).toContainText('SymPy engine loading');
  await expect(chip).toContainText('nerdamer');
  await expect(page.locator('.calc-interim').first()).toBeVisible({
    timeout: 10_000,
  });

  // The chip's info icon explains on hover why an interim engine runs.
  await chip.locator('.info-icon').hover();
  await expect(chip.locator('.info-tip')).toBeVisible();
  await expect(chip.locator('.info-tip')).toContainText('nerdamer');

  // The chip flips to ready and the tag clears once the real SymPy
  // result lands.
  await expect(chip).toContainText('SymPy ready', { timeout: 90_000 });
  await expect(page.locator('.calc-interim')).toHaveCount(0);
  await expect(page.locator('.calc-row').first()).toContainText('4');
});

test('reload evaluates each persisted cell to its own result', async ({
  page,
}) => {
  test.setTimeout(120_000);

  // All cells eval in parallel on reload — each must get its own rows
  // back (a shared python global once handed every cell the last
  // program's results).
  await cell(page, 0).pressSequentially('2+2', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('9+9', { delay: 40 });
  await page.waitForFunction(() =>
    localStorage.getItem('mathcompile-cells')?.includes('9+9'),
  );
  await setTarget(page, 'calculator');
  await page.waitForFunction(() =>
    localStorage.getItem('mathcompile-prefs')?.includes('calculator'),
  );

  await page.reload();
  await page.waitForSelector('math-field');

  const exprRows = page.locator('.expr-row');
  await expect(
    exprRows.nth(0).locator('.calc-row').first(),
  ).toContainText('4', { timeout: 90_000 });
  await expect(
    exprRows.nth(1).locator('.calc-row').first(),
  ).toContainText('18', { timeout: 90_000 });
});

test('show generating code toggle reveals the cell program in one block', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTarget(page, 'calculator');

  const mf = cell(page, 0);
  await mf.click();
  await mf.pressSequentially('x+1', { delay: 40 });

  await expect(
    page.locator('.calc-row .calc-math').first(),
  ).toContainText('x', { timeout: 90_000 });
  // Wait for the real SymPy row — the nerdamer interim satisfies the
  // text check while the engine boots but carries no code block.
  const calcRows = page.locator('.calc-rows').first();
  await expect(calcRows).toBeAttached({ timeout: 90_000 });
  await expect(calcRows).not.toHaveClass(/pending/, { timeout: 90_000 });
  await expect(page.locator('.calc-code')).toHaveCount(0);

  // Per-cell toggle pinned to the output cell's top-right corner.
  const output0 = page.locator('.calc-output').first();
  const toggle = output0.getByLabel('Show generating code');
  await expect(toggle).toBeVisible();
  await toggle.check();

  // One consolidated block at the end of the cell: the emitted program —
  // symbol decl then the bare expression. The `e = ...` display plumbing
  // sits behind the settings menu's checkbox.
  const code = output0.locator('.calc-code');
  await expect(code).toHaveCount(1);
  await expect(code).toContainText('Symbol("x")');
  await expect(code).toContainText('x + 1');
  await expect(code).not.toContainText('e = ');
  await expect(code.locator('.tok-call').first()).toBeAttached();
  await expect(code.locator('.tok-str').first()).toBeAttached();
  // The block sits after every result row.
  await expect(
    code.locator('xpath=preceding-sibling::*').last(),
  ).toHaveClass(/calc-row/);

  await page.locator('.settings-btn').click();
  await page
    .locator('.settings-menu')
    .getByLabel('display plumbing')
    .check();
  await expect(code).toContainText('e = clean_and_simplify(');
  await page
    .locator('.settings-menu')
    .getByLabel('display plumbing')
    .uncheck();
  await page.locator('.settings-backdrop').click();

  // A second cell's output is unaffected — the toggle is per cell.
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('2+2', { delay: 40 });
  const output1 = page.locator('.calc-output').nth(1);
  await expect(output1.locator('.calc-math').first()).toContainText('4', {
    timeout: 90_000,
  });
  await expect(output1.locator('.calc-code')).toHaveCount(0);
  await expect(
    output1.getByLabel('Show generating code'),
  ).not.toBeChecked();

  await toggle.uncheck();
  await expect(page.locator('.calc-code')).toHaveCount(0);
});

test('Tab walks field -> row delete -> next field, skipping the per-cell controls', async ({
  page,
}) => {
  await setTarget(page, 'calculator');
  await page.locator('.add-expr').click();
  await cell(page, 0).click();

  // The per-cell code toggle and info icon are off the tab order —
  // Tab hops field -> delete button -> next field like the other
  // targets do.
  await page.keyboard.press('Tab');
  await expect(page.locator('.expr-delete').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await page.waitForFunction(
    () =>
      document
        .querySelectorAll('math-field')[1]
        ?.contains(document.activeElement),
  );
});
