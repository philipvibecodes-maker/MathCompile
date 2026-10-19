import { expect, test, type Page } from '@playwright/test';
import { resetApp, sharedPage } from './helpers';

// (vendored under public/pyodide/ — engine boot loads the wasm
// runtime + wheels from disk, so specs get a long timeout).
//
// Shared page: the file runs serial on ONE page — each test used to
// `goto('/')` fresh and pay a full Pyodide boot (~4s, vendored),
// ~12 boots per run. Now the boot happens once in beforeAll; tests
// reset worksheet state without a reload (a reload would kill the
// worker) via the shared resetApp helper.
//
// Ordering matters: the two cold-boot UX tests exploit the shared
// page's lifecycle — the banner test runs first on the pristine load
// (its boot is genuinely cold), the interim test reloads once for a
// cold boot of its own, and the persistence test's mid-test reload
// comes last so its re-boot can't slow down anyone else.
test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }, testInfo) => {
  page = await sharedPage(browser, testInfo);
});

test.afterAll(async () => {
  await page.close();
});

const cell = (i: number) => page.locator('math-field').nth(i);

const setTarget = (value: string) =>
  page.locator('.target-select select').selectOption(value);

// Reload-free reset: resetApp wipes persisted state, drops the
// in-memory target back to 'latex' (selectOption only fires `change`
// on a real transition, and the prefs $effect only writes on change —
// a stale 'calculator' would leave the reload test's persisted-prefs
// wait hanging), and leaves one empty focused cell.
test.beforeEach(async () => {
  await resetApp(page);
});

// --- cold-boot UX (each needs a real engine boot) ---

test('flags interim results and the engine-loading banner while SymPy boots', async () => {
  test.setTimeout(120_000);
  // First test on the shared page's initial load — the engine boot it
  // triggers is genuinely cold.
  await setTarget('calculator');

  const mf = cell(0);
  await mf.click();
  await mf.pressSequentially('2+2', { delay: 40 });

  // While Pyodide boots, the output column header's engine chip says
  // it's still loading and names the interim engine, and each interim
  // row is tagged as an estimate.
  const chip = page.locator('.engine-chip');
  await expect(chip).toContainText('SymPy engine loading');
  await expect(chip).toContainText('Compute Engine');
  await expect(page.locator('.calc-interim').first()).toBeVisible({
    timeout: 10_000,
  });

  // The chip's info icon explains on hover why an interim engine runs.
  await chip.locator('.info-icon').hover();
  await expect(chip.locator('.info-tip')).toBeVisible();
  await expect(chip.locator('.info-tip')).toContainText('Compute Engine');

  // The chip flips to ready and the tag clears once the real SymPy
  // result lands.
  await expect(chip).toContainText('SymPy ready', { timeout: 90_000 });
  await expect(page.locator('.calc-interim')).toHaveCount(0);
  await expect(page.locator('.calc-row').first()).toContainText('4');
});

test('calculator shows an instant Compute Engine result while SymPy boots', async () => {
  test.setTimeout(120_000);
  // The first test's boot already ran — reload once for a fresh cold
  // boot (this kills the shared worker; later tests re-boot once and
  // stay warm for the rest of the file).
  await page.reload();
  await page.waitForSelector('math-field');
  await setTarget('calculator');

  const mf = cell(0);
  await mf.click();
  await mf.pressSequentially('2+2', { delay: 40 });

  // The Compute Engine interim row lands long before the ~4s engine boot and
  // stays dimmed (.pending) until the real SymPy result replaces it.
  const rows = page.locator('.calc-rows');
  await expect(rows.first()).toContainText('4', { timeout: 10_000 });
  await expect(rows.first()).toHaveClass(/pending/);
  await expect(rows.first()).not.toHaveClass(/pending/, {
    timeout: 90_000,
  });
  await expect(page.locator('.calc-row').first()).toContainText('4', {
    timeout: 90_000,
  });
});

// --- warm-worker tests (one boot serves them all) ---

test('calculator evaluates a typed expression through SymPy', async () => {
  await setTarget('calculator');

  await cell(0).click();
  await cell(0).pressSequentially('2+2', { delay: 40 });

  // MathQuill StaticMath renders the sympy result as math.
  await expect(
    page.locator('.calc-row .calc-math').first(),
  ).toContainText('4');
});

test('calculator evaluates fully offline — no requests leave the origin', async () => {
  test.setTimeout(120_000);
  // The engine assets are vendored under /pyodide/, so booting the
  // calculator must not fetch anything off-origin. Aborting all foreign
  // requests makes a CDN regression fail loudly instead of silently
  // downloading. The shared page's worker is already warm, so reload
  // (killing it) to force a fresh boot through the aborted routes.
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1'].includes(host)
      ? route.continue()
      : route.abort();
  });
  await page.reload();

  await setTarget('calculator');
  const mf = cell(0);
  await mf.click();
  await mf.pressSequentially('2+2', { delay: 40 });

  // .pending clears only when the real SymPy eval lands — a Compute
  // Engine interim row alone would leave this waiting forever.
  const rows = page.locator('.calc-rows').first();
  await expect(rows).toBeAttached();
  await expect(rows).not.toHaveClass(/pending/, { timeout: 90_000 });
  await expect(page.locator('.calc-row .calc-math').first()).toContainText(
    '4',
  );

  await page.unroute('**/*');
});

test('calculator renders an approximate value for irrationals', async () => {
  await setTarget('calculator');

  const mf = cell(0);
  await mf.click();
  // Smart mode (on by default) converts 'sqrt' into the \sqrt template.
  await mf.pressSequentially('sqrt', { delay: 40 });
  await mf.pressSequentially('2', { delay: 40 });

  await expect(page.locator('.calc-approx').first()).toContainText('1.4142');
});

test('calculator evaluates each statement row of a multi-line cell', async () => {
  await setTarget('calculator');

  const mf = cell(0);
  await mf.click();
  await mf.pressSequentially('1+1', { delay: 40 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('2+3', { delay: 40 });

  // Two \\ rows compile to two statements — one result row each.
  const rows = page.locator('.calc-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('2');
  await expect(rows.nth(1)).toContainText('5');
});

// Cells evaluate sequentially in worksheet order: a name bound by a
// cell is in scope for every cell below it. Cell 2's `def g` makes `g`
// callable in cell 3, and editing the def re-evaluates the dependents.
test('a cell evaluates in the context of the cells above it', async () => {
  await setTarget('calculator');

  const mf0 = cell(0);
  await mf0.evaluate((el, v) => {
    (el as { value: string }).value = v;
  }, '\\text{def} g(x) = 2x');
  await page.locator('.add-expr').click();
  const mf1 = cell(1);
  await mf1.click();
  await mf1.pressSequentially('g(4)', { delay: 40 });

  const exprRows = page.locator('.expr-row');
  await expect(
    exprRows.nth(1).locator('.calc-row').first(),
  ).toContainText('8');

  // Editing the def above re-evaluates the cell that uses it.
  await mf0.evaluate((el, v) => {
    (el as { value: string }).value = v;
  }, '\\text{def} g(x) = 3x');
  await expect(
    exprRows.nth(1).locator('.calc-row').first(),
  ).toContainText('12');
});

test('prior cells fold by default in the generating-code block', async () => {
  await setTarget('calculator');

  const mf0 = cell(0);
  await mf0.evaluate((el, v) => {
    (el as { value: string }).value = v;
  }, '\\text{def} g(x) = 2x');
  await page.locator('.add-expr').click();
  const mf1 = cell(1);
  await mf1.click();
  await mf1.pressSequentially('g(4)', { delay: 40 });

  const output1 = page.locator('.calc-output').nth(1);
  await expect(
    output1.locator('.calc-row').first(),
  ).toContainText('8');
  await expect(output1.locator('.calc-rows')).not.toHaveClass(/pending/);
  await output1.getByLabel('Show generating code').check();
  const code = output1.locator('.calc-code');

  // Every prior cell collapses behind its `# cell N` marker; this
  // cell's section stays expanded.
  await expect(code).toContainText('# cell 1');
  await expect(code).not.toContainText('def g(x)');
  await expect(code).toContainText('# cell 2');
  await expect(code).toContainText('g(4)');

  // The second fold toggles cell 1's code back in (the first is the
  // helper block's).
  await code.locator('.code-fold').nth(1).click();
  await expect(code).toContainText('def g(x)');
  await expect(code).toContainText('return 2 * x');
  await code.locator('.code-fold').nth(1).click();
  await expect(code).not.toContainText('def g(x)');
});

// The calculator reports issues like the python target's overlay, but
// in the input column: the message panel mounts under the math-field —
// in flow, so it never covers the field's other input lines — while
// the failing statement's output row keeps just its ! marker.
test('a failing statement reports the error in the input column', async () => {
  await setTarget('calculator');

  const mf = cell(0);
  await mf.click();
  await mf.pressSequentially('2+2', { delay: 40 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('\\sum', { delay: 40 });
  // Enter accepts the open latex command (the sum template lands with
  // the caret in the lower bound); the upper bound stays empty.
  await page.keyboard.press('Enter');
  await mf.pressSequentially('i=0', { delay: 40 });

  const rows = page.locator('.calc-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('.calc-math')).toContainText('4');
  await expect(rows.nth(1).locator('.parse-error-icon')).toBeVisible();
  const issues = page.locator('.cell-input .calc-issues');
  await expect(issues).toBeVisible();
  await expect(issues).toContainText('missing argument');
  await expect(page.locator('.cell-output .calc-issues')).toHaveCount(0);
});

test('indefinite integral shows the constant of integration last', async () => {
  await setTarget('calculator');

  const mf = cell(0);
  await mf.click();
  // \antid is the boundless (indefinite) integral sign.
  await mf.pressSequentially('\\antid', { delay: 40 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('x+1dx', { delay: 40 });

  const rows = page.locator('.calc-rows').first();
  await expect(rows).toBeAttached();
  await expect(rows).not.toHaveClass(/pending/);
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
test('implicit-multiply integrand evaluates and renders arctan', async () => {
  await setTarget('calculator');

  const mf = cell(0);
  await mf.evaluate((el, v) => {
    (el as { value: string }).value = v;
  }, '\\antid \\frac{1}{\\sqrt{x}(x+1)}dx');

  const rows = page.locator('.calc-rows').first();
  await expect(rows).toBeAttached();
  await expect(rows).not.toHaveClass(/pending/);
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
test('evaluation bar computes the substitution difference', async () => {
  await setTarget('calculator');

  const mf = cell(0);
  await mf.evaluate((el, v) => {
    (el as { value: string }).value = v;
  }, '\\left. x^{2} \\right|_{0}^{1}');

  const rows = page.locator('.calc-rows').first();
  await expect(rows).toBeAttached();
  await expect(rows).not.toHaveClass(/pending/);
  const row = page.locator('.calc-row').first();
  await expect(row.locator('.calc-error')).toHaveCount(0);
  await expect(row.locator('.calc-math')).toContainText('1');
});

test('show generating code toggle reveals the cell program in one block', async () => {
  await setTarget('calculator');

  const mf = cell(0);
  await mf.click();
  await mf.pressSequentially('x+1', { delay: 40 });

  await expect(
    page.locator('.calc-row .calc-math').first(),
  ).toContainText('x');
  // Wait for the real SymPy row — the Compute Engine interim satisfies the
  // text check while the engine boots but carries no code block.
  const calcRows = page.locator('.calc-rows').first();
  await expect(calcRows).toBeAttached();
  await expect(calcRows).not.toHaveClass(/pending/);
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
  await cell(1).pressSequentially('2+2', { delay: 40 });
  const output1 = page.locator('.calc-output').nth(1);
  await expect(output1.locator('.calc-math').first()).toContainText('4');
  await expect(output1.locator('.calc-code')).toHaveCount(0);
  await expect(
    output1.getByLabel('Show generating code'),
  ).not.toBeChecked();

  await toggle.uncheck();
  await expect(page.locator('.calc-code')).toHaveCount(0);
});

// Last: its mid-test reload kills the shared worker, so nothing after
// it should depend on the warm boot.
test('reload evaluates each persisted cell to its own result', async () => {
  test.setTimeout(120_000);

  // All cells eval in parallel on reload — each must get its own rows
  // back (a shared python global once handed every cell the last
  // program's results).
  await cell(0).pressSequentially('2+2', { delay: 40 });
  await page.locator('.add-expr').click();
  await cell(1).pressSequentially('9+9', { delay: 40 });
  await page.waitForFunction(() =>
    localStorage.getItem('mathcompile-worksheets')?.includes('9+9'),
  );
  await setTarget('calculator');
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
