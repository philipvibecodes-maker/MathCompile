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

// \<char> escapes that used to blank the whole cell on hydrate: spacing,
// braces, and the norm shorthand. Bare typed chars are unaffected
// (the '\x' ctrlSeq keys can't shadow literal typing).
const ESCAPE_CASES: [string, string][] = [
  ['\\{1,2\\}', '\\{ 1,2\\} '],
  ['x\\;y', 'x\\; y'],
  ['x\\,y', 'x\\, y'],
  ['x\\:y', 'x\\: y'],
  ['\\|\\mathbf{v}\\|', '\\| \\mathbf{v}\\| '],
  // negated relations / asymptotic equality — were unparseable commands
  // that blanked the field on hydrate.
  ['a\\nleq b', 'a\\nleq b'],
  ['a\\ngeq b', 'a\\ngeq b'],
  ['a\\nle b', 'a\\nleq b'],
  ['a\\nge b', 'a\\ngeq b'],
  ['a\\asymp b', 'a\\asymp b'],
  // Mirrored \left/\right spellings: \right\lVert / \left\rangle used to
  // blank the whole field on hydrate (real LaTeX accepts both).
  ['\\left\\lVert u\\right\\lVert', '\\left\\lVert u\\right\\lVert'],
  ['\\left\\rangle u\\right\\langle', '\\left\\rangle u\\right\\langle'],
];
for (const [latex, expected] of ESCAPE_CASES) {
  test(`hydrates \\-escape ${latex}`, async ({ page }) => {
    const mf = page.locator('math-field').first();
    await mf.evaluate(
      (el, v) => ((el as unknown as { value: string }).value = v),
      latex,
    );
    expect(await value(page)).toBe(expected);
  });
}

test('typed , ; : ! keep their literal meaning', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('a,b', { delay: 60 });
  expect(await value(page)).toBe('a,b');
  await mf.evaluate((el) => ((el as unknown as { value: string }).value = ''));
  await mf.pressSequentially('a;b', { delay: 60 });
  expect(await value(page)).toBe('a;b');
  await mf.evaluate((el) => ((el as unknown as { value: string }).value = ''));
  await mf.pressSequentially('a:b', { delay: 60 });
  expect(await value(page)).toBe('a:b');
  await mf.evaluate((el) => ((el as unknown as { value: string }).value = ''));
  await mf.pressSequentially('n!', { delay: 60 });
  expect(await value(page)).toBe('n!');
});

// \boxed and the brace groups used to blank the field.
test('\\boxed parses, renders, and round-trips', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.evaluate(
    (el) => ((el as unknown as { value: string }).value = '\\boxed{x+1}'),
  );
  await expect(mf.locator('.mq-boxed')).toHaveCount(1);
  expect(await value(page)).toBe('\\boxed{x+1}');
});

test('\\underbrace keeps its sibling subscript', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.evaluate(
    (el) =>
      ((el as unknown as { value: string }).value =
        '\\underbrace{x+1}_{n}'),
  );
  await expect(mf.locator('.mq-underbrace')).toHaveCount(1);
  expect(await value(page)).toBe('\\underbrace{x+1}_{n}');
});

test('\\overbrace keeps its sibling superscript', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.evaluate(
    (el) =>
      ((el as unknown as { value: string }).value = '\\overbrace{a+b}^{2}'),
  );
  await expect(mf.locator('.mq-overbrace')).toHaveCount(1);
  expect(await value(page)).toBe('\\overbrace{a+b}^{2}');
});

// \underset/\overset are two-block commands — the label sits under/over
// the main row.
test('\\underset renders the label under the main row', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.evaluate(
    (el) =>
      ((el as unknown as { value: string }).value =
        '\\underset{x\\to0}{\\lim}f'),
  );
  await expect(mf.locator('.mq-overunderset')).toHaveCount(1);
  // \lim is a real command now — its own underscript block is empty.
  expect(await value(page)).toBe('\\underset{x\\to0}{\\lim_{ }}f');
});

test('typed \\underset inserts the two-block command', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\underset', { delay: 60 });
  await page.keyboard.press('Enter');
  expect(await value(page)).toBe('\\underset{ }{ }');
});

// \tr is an insertion alias — it expands to \mathrm{tr}, the word-op
// form the compiler lowers to .trace().
test('typed \\tr expands to \\mathrm{tr}', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\tr', { delay: 60 });
  await page.keyboard.press('Enter');
  expect(await value(page)).toBe('\\mathrm{tr}');
  await mf.pressSequentially('(A)', { delay: 60 });
  expect(await value(page)).toBe('\\mathrm{tr}\\left(A\\right)');
});

// \widehat aliases \hat (wide variant): parses and renders the hat.
test('\\widehat parses and renders as a hat', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.evaluate(
    (el) => ((el as unknown as { value: string }).value = '\\widehat{AB}'),
  );
  expect(await value(page)).toBe('\\hat{AB}');
});

// \big*/\Big*/\bigg*/\Bigg* fixed-size delimiters used to blank the cell.
const BIG_CASES: [string, string][] = [
  ['a\\big|_{x=0}', 'a\\big|_{x=0}'],
  ['a\\Big(b\\Big)', 'a\\Big(b\\Big)'],
  ['\\frac{dy}{dx}\\bigg|_{x=0}', '\\frac{dy}{dx}\\bigg|_{x=0}'],
  ['\\big\\langle u,v\\big\\rangle', '\\big\\langle u,v\\big\\rangle'],
];
for (const [latex, expected] of BIG_CASES) {
  test(`hydrates sized delimiter ${latex}`, async ({ page }) => {
    const mf = page.locator('math-field').first();
    await mf.evaluate(
      (el, v) => ((el as unknown as { value: string }).value = v),
      latex,
    );
    expect(await value(page)).toBe(expected);
  });
}
