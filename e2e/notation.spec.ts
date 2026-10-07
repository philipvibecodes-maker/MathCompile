import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// \newcommand user notation: a def statement on its own line registers
// a macro `\name` that renders as `name{args}` (the UserMacro atom),
// expands textually before compiling, and carries a note on the def
// line. Deleting the def un-registers the command. Specs pin the DOM
// contract only.

const cell = (page: Page, i: number) => page.locator('math-field').nth(i);

const cellValue = (page: Page, i: number): Promise<string> =>
  cell(page, i).evaluate((el) => (el as unknown as { value: string }).value);

// Disabled <option>s can't be picked via selectOption; dispatch a change
// the way the control's onchange would see it.
const setTarget = (page: Page, value: string) =>
  page.locator('.target-select select').evaluate((s, v) => {
    (s as HTMLSelectElement).value = v;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);

const typeDef = async (page: Page) => {
  await cell(page, 0).click();
  await page.keyboard.type('\\newcommand{\\vv}[1]{\\mathbf{#1}}', {
    delay: 10,
  });
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
  await clearFirstCell(page);
});

test('a \\newcommand def registers a macro that renders name{args}', async ({
  page,
}) => {
  await typeDef(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('\\vv{u} + 1', { delay: 10 });

  await expect(page.locator('.mq-usermacro-name')).toHaveText('vv');
  // LaTeX-style call site: the arg sits in braces, not parens.
  await expect(page.locator('.mq-usermacro')).toHaveText('vv{u}');
  // The cell keeps the macro spelling — the expansion lives in the
  // compile pass, not the stored latex.
  expect(await cellValue(page, 0)).toContain('\\vv{u}');
});

test('python output expands the body and the def line carries a note', async ({
  page,
}) => {
  await setTarget(page, 'python');
  await typeDef(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('\\vv{u} + 1', { delay: 10 });

  // \mathbf{u} lowers to the u_bold symbol — the emitted code shows the
  // expansion, not the \vv spelling.
  await expect(page.locator('.cell-python')).toContainText('u_bold + 1');
  // A note is not an error: the cell's code lines keep updating under it.
  await expect(page.locator('.cell-issues')).toContainText(
    '\\vv → \\mathbf{#1}',
  );
});

test('a builtin command name flags an error on the def line', async ({
  page,
}) => {
  await setTarget(page, 'python');
  await cell(page, 0).click();
  await page.keyboard.type('\\newcommand{\\sin}[1]{#1}', { delay: 10 });

  await expect(page.locator('.cell-issues')).toContainText(
    '\\sin is a built-in command',
  );
});

test('deleting the def un-registers the command', async ({ page }) => {
  await typeDef(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('\\vv{u}', { delay: 10 });
  await expect(page.locator('.mq-usermacro-name')).toHaveCount(1);

  // Wipe the cell — the def row goes with it, so `\vv` is just an
  // unknown command again (Ctrl+A selects only the current row, so
  // clear through the element's value).
  await cell(page, 0).evaluate((el) => {
    (el as unknown as { value: string }).value = '';
  });
  await setTarget(page, 'python');
  await cell(page, 0).click();
  await page.keyboard.type('\\vv{u}', { delay: 10 });
  await expect(page.locator('.mq-usermacro-name')).toHaveCount(0);
  // The dead stub renders the call as literal `\vv{u}` text — the
  // spelling round-trips, it just doesn't mean the macro anymore.
  await expect(page.locator('.mq-deadmacro-name')).toHaveText('\\vv');
  expect(await cellValue(page, 0)).toContain('\\vv{u}');

  // And the reparse flags the dead call instead of expanding it.
  await expect(page.locator('.cell-issues')).toContainText(
    'incomplete or unsupported command "\\vv"',
  );
});

test('defined macros appear in the autocomplete menu', async ({ page }) => {
  await typeDef(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('\\v', { delay: 10 });

  const item = page
    .locator('.mc-ac-item')
    .filter({ hasText: 'your notation' });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('vv');
});

test('defs and macro atoms persist across reload', async ({ page }) => {
  await typeDef(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('\\vv{u}', { delay: 10 });
  await expect(page.locator('.mq-usermacro-name')).toHaveCount(1);

  // The debounced worksheet write must land before the reload.
  await page.waitForFunction(() =>
    localStorage.getItem('mathcompile-cells')?.includes('\\vv'),
  );
  await page.reload();
  await page.waitForSelector('math-field');

  // Macros register during hydration, before the cells parse — the
  // atom and its expansion both survive.
  await expect(page.locator('.mq-usermacro-name')).toHaveText('vv');
  await setTarget(page, 'python');
  await expect(page.locator('.cell-python')).toContainText('u_bold');
});

test('typing \\newcommand shows editable braces — no … leaf', async ({
  page,
}) => {
  await cell(page, 0).click();
  await page.keyboard.type('\\newcommand', { delay: 10 });

  // The def is a real MathCommand, not the collapsed `\name…` leaf.
  await expect(cell(page, 0).locator('.mq-newcommand')).toBeVisible();
  await expect(cell(page, 0)).not.toContainText('…');

  // And typed braces flow block to block: name, [arity], body.
  await page.keyboard.type('{\\vv}[1]{\\mathbf{#1}}', { delay: 10 });
  expect(await cellValue(page, 0)).toBe(
    '\\newcommand{\\vv}[1]{\\mathbf{#1}}',
  );
});

test('a def without [n] types and hydrates cleanly', async ({ page }) => {
  await cell(page, 0).click();
  await page.keyboard.type('\\newcommand{\\halfx}{x/2}', { delay: 10 });
  // `/` lowers to \frac the way it does in any block.
  expect(await cellValue(page, 0)).toBe(
    '\\newcommand{\\halfx}{\\frac{x}{2}}',
  );

  // Hydration round-trips the strict {name}[n]{body} serialization.
  await cell(page, 0).evaluate((el) => {
    (el as unknown as { value: string }).value =
      '\\newcommand{\\vv}[1]{\\mathbf{#1}}';
  });
  expect(await cellValue(page, 0)).toBe(
    '\\newcommand{\\vv}[1]{\\mathbf{#1}}',
  );
});

test('autocomplete and symbol picker accept scaffold \\newcommand{}{}', async ({
  page,
}) => {
  const caretInNameBlock = () =>
    expect(
      cell(page, 0).locator('.mq-newcommand-arg.mq-hasCursor').first(),
    ).toBeVisible();

  // Autocomplete: \newc + Enter.
  await cell(page, 0).click();
  await page.keyboard.type('\\newc', { delay: 10 });
  const item = page
    .locator('.mc-ac-item')
    .filter({ hasText: 'newcommand' });
  await expect(item.first()).toBeVisible();
  await page.keyboard.press('Enter');
  expect(await cellValue(page, 0)).toBe('\\newcommand{}{}');
  await caretInNameBlock();

  // Symbol picker: Ctrl+Space, filter, Enter.
  await cell(page, 0).evaluate((el) => {
    (el as unknown as { value: string }).value = '';
  });
  await cell(page, 0).click();
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.mc-pick')).toBeVisible();
  await page.keyboard.type('newcommand', { delay: 10 });
  await page.keyboard.press('Enter');
  expect(await cellValue(page, 0)).toBe('\\newcommand{}{}');
  await caretInNameBlock();
});
