import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// The toolbar above the cell list holds the smart mode toggle and the
// target select. With the latex target (the default), each cell stacks
// its LaTeX output beneath the input with a copy button.

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

test('latex target hides the python import controls', async ({ page }) => {
  await expect(page.locator('.output-import-all')).toHaveCount(0);
});

// Disabled <option>s can't be picked via selectOption; dispatch a change
// the way the control's onchange would see it.
const setTarget = (page: Page, value: string) =>
  page.locator('.target-select select').evaluate((s, v) => {
    (s as HTMLSelectElement).value = v;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);

test('header shows the commands button, smart mode sits above the input column', async ({
  page,
}) => {
  const header = page.locator('.app-header');
  await expect(header.locator('.option-checkbox input')).toHaveCount(0);
  await expect(header.locator('.palette-button')).toBeVisible();
  const colField = page.locator('.col-field');
  await expect(colField.locator('.option-checkbox input')).toHaveCount(1);
  await expect(colField).toContainText('Smart mode');
});

test('output select sits at the right end of the output column', async ({
  page,
}) => {
  const colHead = page.locator('.col-output-head');
  const select = colHead.locator('.target-select');
  await expect(select.locator('select')).toBeVisible();
  await expect(colHead).toContainText('Output');

  // Pinned to the column's right edge.
  const head = await colHead.boundingBox();
  const sel = await select.boundingBox();
  expect(head && sel).toBeTruthy();
  expect(sel!.x + sel!.width).toBeGreaterThan(head!.x + head!.width - 12);
});

test('target select offers all codegen targets, calc+python enabled', async ({
  page,
}) => {
  await expect(page.locator('.target-select option')).toHaveText([
    'LaTeX',
    'Calculator',
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
    ['calculator', false],
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

test('each cell stacks its output directly beneath its input', async ({
  page,
}) => {
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('x+1', { delay: 40 });
  await expect(page.locator('.cell-latex').first()).toHaveText('x+1');

  const input = await page
    .locator('.expr-row .cell-input')
    .first()
    .boundingBox();
  const output = await page
    .locator('.expr-row .cell-output')
    .first()
    .boundingBox();
  expect(input && output).toBeTruthy();
  // The output sits under the input cell at the same left edge, not
  // beside it in a second column.
  expect(output!.y).toBeGreaterThanOrEqual(input!.y + input!.height - 1);
  expect(Math.abs(output!.x - input!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(output!.width - input!.width)).toBeLessThanOrEqual(2);
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

test('python target shows standalone per-cell scripts', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await cell(page, 0).click();
  await cell(page, 0).pressSequentially('a=x+1', { delay: 40 });
  await setTarget(page, 'python');

  // Each cell's output is a standalone script: the import line, then the
  // Symbol definition for names the cell uses, then the statement. The
  // default `from sympy import *` mode emits unqualified names.
  const first = page.locator('.cell-python').first();
  await expect(first).toContainText('from sympy import *');
  await expect(first).toContainText('x = Symbol("x")');
  await expect(first).toContainText('a = x + 1');

  // The head Copy script button copies the whole worksheet as one
  // script — the import once, then each cell's body.
  await page.locator('.col-output-head .cell-copy').click();
  const script = await page.evaluate(() => navigator.clipboard.readText());
  expect(script).toBe(
    'from sympy import *\n\n# cell 1\nx = Symbol("x")\na = x + 1',
  );

  // Switching back to latex removes the code output and the controls.
  await setTarget(page, 'latex');
  await expect(page.locator('.cell-python')).toHaveCount(0);
  await expect(page.locator('.output-import-all')).toHaveCount(0);
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
  const first = page.locator('.cell-python').first();

  // Default: checked — each cell's script starts with `from sympy import *`
  // and emits unqualified names.
  await expect(toggle).toBeChecked();
  await expect(first).toContainText('from sympy import *');
  await expect(first).toContainText('x = Symbol("x")');

  // Unchecked: `import sympy as sp` and sp.-qualified output.
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(first).toContainText('import sympy as sp');
  await expect(first).toContainText('x = sp.Symbol("x")');
});

// \antid and \iint are insertion aliases for a boundless indefinite ∫ —
// the latex output view (and its copy) shows the canonical \int, which is
// also what a pasted-elsewhere LaTeX doc needs.
test('latex output shows \\antid and \\iint as \\int', async ({ page }) => {
  const mf = cell(page, 0);
  await mf.click();
  await mf.pressSequentially('antid', { delay: 60 });
  await mf.pressSequentially('xdx', { delay: 40 });
  await expect(page.locator('.cell-latex').first()).toHaveText('\\int xdx');

  // \iint with sibling SupSub bounds renders as \int_{a}^{b} too.
  await page.locator('.add-expr').click();
  await cell(page, 1).pressSequentially('iint_a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await cell(page, 1).pressSequentially('^b', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await cell(page, 1).pressSequentially('xdx', { delay: 40 });
  await expect(page.locator('.cell-latex').nth(1)).toHaveText(
    '\\int_{a}^{b}xdx',
  );
});

// \left.…\right| evaluation bars use the invisible null delimiter — the
// field must parse them (not wipe) and keep the bar's latex verbatim.
test('latex output round-trips \\left. evaluation bars', async ({ page }) => {
  const mf = cell(page, 0);
  await mf.evaluate(
    (el) =>
      ((el as { value: string }).value =
        '\\left.\\frac{a}{b}\\right|_{x=1}'),
  );
  await expect(page.locator('.cell-latex').first()).toHaveText(
    '\\left.\\frac{a}{b}\\right|_{x=1}',
  );

  // The left null delimiter renders zero-width; the right pipe shows.
  const dims = await mf.evaluate((el) => {
    const l = el.querySelector('.mq-bracket-l');
    const r = el.querySelector('.mq-bracket-r');
    const rect = (n: Element | null) => n?.getBoundingClientRect().width;
    return { left: rect(l), right: rect(r) };
  });
  expect(dims.left).toBe(0);
  expect(dims.right).toBeGreaterThan(0);
});

// \begin{cases} is a real environment — the field must parse it (not
// wipe) and the output column keeps the latex verbatim.
test('latex output round-trips \\begin{cases}', async ({ page }) => {
  const mf = cell(page, 0);
  await mf.evaluate(
    (el) =>
      ((el as { value: string }).value =
        '\\begin{cases}x&x>0\\\\-x&x\\le0\\end{cases}'),
  );
  await expect(page.locator('.cell-latex').first()).toHaveText(
    '\\begin{cases}x&x>0\\\\\n-x&x\\le0\\end{cases}',
  );
});

// `\,` `\;` `\:` `\!` spacing commands parse (previously `\,` degraded
// to a literal comma and the rest wiped the field).
test('latex output round-trips \\, \\; \\: \\! spacing', async ({ page }) => {
  const mf = cell(page, 0);
  await mf.evaluate(
    (el) => ((el as { value: string }).value = '\\int_{a}^{b}x\\,dx'),
  );
  await expect(page.locator('.cell-latex').first()).toHaveText(
    '\\int_{a}^{b}x\\, dx',
  );
});

// Escaped delimiters and standalone angle/norm delimiters parse
// (previously each wiped the whole field to a blank cell).
test('latex output round-trips escaped delimiters and set literals', async ({
  page,
}) => {
  const mf = cell(page, 0);
  await mf.evaluate(
    (el) =>
      ((el as { value: string }).value =
        '\\{x\\in\\mathbb{R}:\\lVert x\\rVert\\ge0\\}'),
  );
  await expect(page.locator('.cell-latex').first()).toHaveText(
    '\\{ x\\in\\mathbb{R}:\\lVert x\\rVert\\ge0\\} ',
  );
});

// Common latex constructs that previously blanked the field now
// round-trip: fonts/accents, negated relations, mod, boxed, overset.
test('latex output round-trips fonts, negations, mod, boxed, overset', async ({
  page,
}) => {
  const cases: [string, string][] = [
    ['\\mathcal{F}x', '\\mathcal{F}x'],
    ['x\\not\\in A', 'x\\notin A'],
    ['x\\pmod{m}', 'x\\pmod{m}'],
    ['\\boxed{x=1}', '\\boxed{x=1}'],
    ['\\sum\\limits_{i=0}^{n}x', '\\sum\\limits_{i=0}^{n}x'],
    ['\\bigl(x\\bigr)', '\\bigl(x\\bigr)'],
    ['\\mathbb{F}', '\\mathbb{F}'],
    ['\\left(x\\middle|y\\right)', '\\left(x\\middle|y\\right)'],
    ['\\underbrace{x+y}_{n}', '\\underbrace{x+y}_{n}'],
    ['\\begin{gathered}a\\\\b\\end{gathered}', '\\begin{gathered}a\\\\ b\\end{gathered}'],
    // a bare \\ in the field is a line break — the output column
    // displays it as a newline (normalized to a space by toHaveText)
    ['x\\\\y', 'x\\\\ y'],
  ];
  const mf = cell(page, 0);
  const out = page.locator('.cell-latex').first();
  for (const [input, expected] of cases) {
    await mf.evaluate(
      (el, latex) => ((el as { value: string }).value = latex),
      input,
    );
    await expect(out).toHaveText(expected);
  }
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
