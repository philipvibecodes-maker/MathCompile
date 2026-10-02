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

  // While Pyodide boots, each interim row is tagged as a less-accurate
  // estimate from the interim engine.
  const tag = page.locator('.calc-interim');
  await expect(tag.first()).toContainText('SymPy still loading', {
    timeout: 10_000,
  });
  await expect(tag.first()).toContainText('less accurate');

  // The tag clears once the real SymPy result lands.
  await expect(tag).toHaveCount(0, { timeout: 90_000 });
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

test('show code toggle reveals highlighted SymPy code under the result', async ({
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
  // text check while the engine boots but carries no `code` block.
  const calcRows = page.locator('.calc-rows').first();
  await expect(calcRows).toBeAttached({ timeout: 90_000 });
  await expect(calcRows).not.toHaveClass(/pending/, { timeout: 90_000 });
  await expect(page.locator('.calc-code')).toHaveCount(0);

  const toggle = page.getByLabel('Show code');
  await expect(toggle).toBeVisible();
  await toggle.check();

  // The code block shows the emitted program: symbol decl then the bare
  // expression. The `e = ...` display plumbing sits behind its checkbox.
  const code = page.locator('.calc-code').first();
  await expect(code).toBeVisible();
  await expect(code).toContainText('Symbol("x")');
  await expect(code).toContainText('x + 1');
  await expect(code).not.toContainText('e = ');
  await expect(code.locator('.tok-call').first()).toBeAttached();
  await expect(code.locator('.tok-str').first()).toBeAttached();

  const plumbing = page.getByLabel('display plumbing').first();
  await expect(plumbing).toBeVisible();
  await plumbing.check();
  await expect(code).toContainText('e = clean_and_simplify(');

  await toggle.uncheck();
  await expect(page.locator('.calc-code')).toHaveCount(0);
});
