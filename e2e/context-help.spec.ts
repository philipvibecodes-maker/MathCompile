import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell, sharedPage, resetApp } from './helpers';

// The caret-context help strip inside the bottom of the math-field:
// always rendered (its space is reserved in the field's padding), the
// .on class fades it in when the caret is inside a matrix or
// immediately beside one, and off when it isn't.

const cell = (page: Page, i = 0): Locator =>
  page.locator('math-field').nth(i);

const help = (mf: Locator): Locator => mf.locator('.caret-help');

const setValue = (mf: Locator, latex: string) =>
  mf.evaluate(
    (el, l) => ((el as unknown as { value: string }).value = l),
    latex,
  );

let page: Page;
test.beforeAll(async ({ browser }, testInfo) => {
  page = await sharedPage(browser, testInfo);
});

test.beforeEach(async () => {
  await resetApp(page);
  const mf = cell(page);
  await mf.click();
  await mf.focus();
  await clearFirstCell(page);
});

test('caret inside a matrix shows row/column editing hints', async () => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('ArrowLeft'); // step into the last cell
  await expect(help(mf)).toHaveClass(/\bon\b/);
  await expect(help(mf)).toContainText('Enter');
  await expect(help(mf)).toContainText('add row');
  await expect(help(mf)).toContainText('Shift+Space');
  await expect(help(mf)).toContainText('add column');
  await expect(help(mf)).toContainText('Ctrl+Shift+Backspace');
  await expect(help(mf)).toContainText('delete row');
  await expect(help(mf)).toContainText('Ctrl+Shift+Delete');
  await expect(help(mf)).toContainText('delete column');
});

test('caret left of a matrix shows determinant and trace hints', async () => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+Home');
  await expect(help(mf)).toHaveClass(/\bon\b/);
  await expect(help(mf)).toContainText('det');
  await expect(help(mf)).toContainText('determinant');
  await expect(help(mf)).toContainText('trace');
});

test('caret right of a matrix shows transpose/adjoint/pinv hints', async () => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+End');
  await expect(help(mf)).toHaveClass(/\bon\b/);
  await expect(help(mf)).toContainText('^T');
  await expect(help(mf)).toContainText('transpose');
  await expect(help(mf)).toContainText('adjoint');
  await expect(help(mf)).toContainText('pseudoinverse');
});

test('a typed matrix still reaches the left-of hints through the input-wrapper residue', async () => {
  const mf = cell(page);
  // Typing \pmatrix + Enter leaves an invisible .mq-latex-command-input-
  // wrapper between the previous atom and the .mq-matrix; the walk must
  // see through it (hydration-only coverage would miss this). The second
  // Enter accepts the dimensions menu's default 2x2.
  await page.keyboard.type('x+\\pmatrix');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(help(mf)).toContainText('add row'); // inside the grid
  await page.keyboard.press('ArrowLeft'); // out the left edge
  await expect(help(mf)).toContainText('determinant');
});

test('the strip fades out when the caret is in a plain position', async () => {
  const mf = cell(page);
  await setValue(mf, 'x+1');
  await page.keyboard.press('Control+End');
  await expect(help(mf)).not.toHaveClass(/\bon\b/);
});

test('the field height stays fixed as the strip fades in and out', async () => {
  const mf = cell(page);
  await setValue(mf, 'x+\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+Home'); // caret left of x: no hints
  await expect(help(mf)).not.toHaveClass(/\bon\b/);
  const off = (await mf.boundingBox())!.height;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight'); // caret left of the matrix
  await expect(help(mf)).toHaveClass(/\bon\b/);
  const on = (await mf.boundingBox())!.height;
  expect(on).toBe(off);
});

test('caret after a \\text{plot} marker shows the for-domain hints', async () => {
  const mf = cell(page);
  await setValue(mf, '\\text{plot} x^2');
  await page.keyboard.press('Control+End');
  await expect(help(mf)).toHaveClass(/\bon\b/);
  await expect(help(mf)).toContainText('for x');
  await expect(help(mf)).toContainText('set the domain');
  await expect(help(mf)).toContainText('one-sided');
  await expect(help(mf)).toContainText('2-variable domain');
});

test('the plot hints follow the caret into nested blocks but not before the marker', async () => {
  const mf = cell(page);
  await setValue(mf, '\\text{plot} \\frac{x^2}{y}');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('ArrowLeft'); // into the fraction
  await expect(help(mf)).toContainText('set the domain');
  await page.keyboard.press('Control+Home'); // before \text{plot}
  await expect(help(mf)).not.toHaveClass(/\bon\b/);
});

test('a plot marker on a previous line does not trigger the hints', async () => {
  const mf = cell(page);
  await setValue(mf, '\\displaylines{\\text{plot} x^2\\\\ y}');
  await page.keyboard.press('Control+End'); // caret on the second row
  await expect(help(mf)).not.toHaveClass(/\bon\b/);
});

test('the strip follows the caret out of and back into a matrix', async () => {
  const mf = cell(page);
  await setValue(mf, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
  await page.keyboard.press('Control+End');
  await expect(help(mf)).toContainText('transpose');
  await page.keyboard.press('ArrowLeft'); // into the matrix
  await expect(help(mf)).toContainText('add row');
  await page.keyboard.press('Control+Home'); // left edge
  await expect(help(mf)).toContainText('determinant');
});


test('curly braces show set-builder guidance and keep their closing delimiter when a bar is typed', async () => {
  const mf = cell(page);
  const value = () => mf.evaluate((el) => (el as HTMLElement & { value: string }).value);
  await page.keyboard.type('{');
  await expect(help(mf)).toHaveClass(/\bon\b/);
  await expect(help(mf)).toContainText('set-builder notation');
  await expect(help(mf)).toContainText('where');
  await expect(help(mf)).toContainText('st');
  await expect(help(mf)).toContainText('such that');
  await page.keyboard.type('|');
  await expect.poll(value).toBe('\\left\\{\\left|\\right|\\right\\}');
  const root = mf.locator('.mq-editable-field > .mq-root-block');
  const closeBrace = root.locator('.mq-bracket-r[data-mq-delimiter="}"]');
  await expect(closeBrace).toBeVisible();
  await expect(closeBrace.locator('svg')).toHaveCount(1);
  await expect(help(mf)).toHaveClass(/\bon\b/);
  await page.keyboard.type('x|}');
  await expect.poll(value).toBe('\\left\\{\\left|x\\right|\\right\\}');
  await expect(help(mf)).not.toHaveClass(/\bon\b/);
});


for (const word of ['where', 'st']) {
  test(`Tab and Shift+Tab move across the ${word} separator`, async () => {
    const mf = cell(page);
    const value = () => mf.evaluate((el) => (el as HTMLElement & { value: string }).value);
    await page.keyboard.type(`{(x,y)${word}}`);
    await page.keyboard.press('ArrowLeft'); // back inside, on the condition side
    await page.keyboard.press('Shift+Tab'); // before the separator
    await page.keyboard.press('Tab'); // after the separator
    await page.keyboard.type('x+y=1');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.type('+z');
    const separator = word === 'where' ? '\\mid ' : '\\operatorname{s.t.}';
    await expect.poll(value).toBe(`\\left\\{\\left(x,y\\right)+z${separator}x+y=1\\right\\}`);
    await expect(mf.locator('.mq-mount textarea')).toBeFocused();
    await expect(help(mf)).toContainText('Tab / Shift+Tab');
  });
}


test('set-builder Tab navigation takes priority over word autocomplete', async () => {
  const mf = cell(page);
  await setValue(mf, '\\left\\{\\mid\\right\\}');
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('si');
  await expect(mf.locator('.mc-ac')).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.type('co');
  await expect(mf.locator('.mc-ac')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('z');
  await expect.poll(() => mf.evaluate((el) => (el as HTMLElement & { value: string }).value))
    .toBe('\\left\\{siz\\mid co\\right\\}');
});
