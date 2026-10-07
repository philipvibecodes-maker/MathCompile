import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// \python{ ... } — a raw-source block inside the math field: plain-text
// multi-line editing, visible delimiters, and syntax highlighting.

const cell = (page: Page, i: number): Locator =>
  page.locator('math-field').nth(i);

const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { value: string }).value);

const waitFocusedIndex = (page: Page, i: number) =>
  page.waitForFunction(
    (idx) =>
      document
        .querySelectorAll('math-field')
        [idx]?.contains(document.activeElement),
    i,
  );

const focusCell = async (page: Page, i: number) => {
  await cell(page, i).focus();
  await waitFocusedIndex(page, i);
};

// .mq-python also appears in the autocomplete preview (.mc-ac-prev) —
// scope to the editable field's own root.
const pythonBlock = (page: Page): Locator =>
  cell(page, 0).locator('.mq-editable-field .mq-python');

// Type "\python{" — the { that opens the block is swallowed by the field.
const openPythonBlock = async (page: Page) => {
  await cell(page, 0).pressSequentially('\\python', { delay: 20 });
  await page.keyboard.press('{');
  await expect(pythonBlock(page)).toHaveCount(1);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
  await clearFirstCell(page);
});

test('typing \\python{ opens a source block with visible delimiters', async ({
  page,
}) => {
  await openPythonBlock(page);
  const block = pythonBlock(page);
  // The delimiters are CSS pseudo content — check the painted values,
  // not the DOM (the element's only child stays the editable text).
  const before = await block.evaluate((el) =>
    getComputedStyle(el, ':before').content.replaceAll('"', ''),
  );
  const after = await block.evaluate((el) =>
    getComputedStyle(el, ':after').content.replaceAll('"', ''),
  );
  // getComputedStyle returns content as serialized — the \ in
  // '\\python{' round-trips as an escaped backslash
  expect(before).toContain('python{');
  expect(after).toBe('}');
});

test('the block edits as plain text — no math behavior inside', async ({
  page,
}) => {
  await openPythonBlock(page);
  await cell(page, 0).pressSequentially('x=1', { delay: 20 });
  // `{`, `^`, `$`, `\` type literally — no subscript/command/command-input
  await cell(page, 0).pressSequentially('a^2$\\', { delay: 20 });
  expect(await cellValue(cell(page, 0))).toBe('\\python{x=1a^2$\\\\}');
});

test('Enter inserts a newline in the source, not a displaylines row', async ({
  page,
}) => {
  await openPythonBlock(page);
  await cell(page, 0).pressSequentially('a=1', { delay: 20 });
  await page.keyboard.press('Enter');
  await cell(page, 0).pressSequentially('b=2', { delay: 20 });
  const latex = await cellValue(cell(page, 0));
  expect(latex).toBe('\\python{a=1\nb=2}');
  expect(latex).not.toContain('displaylines');
  // The source renders on two painted lines
  const lines = await pythonBlock(page).evaluate(
    (el) => el.textContent!.split('\n').length,
  );
  expect(lines).toBe(2);
});

test('keywords and strings get CSS Highlight ranges', async ({ page }) => {
  await openPythonBlock(page);
  await cell(page, 0).pressSequentially('def f(x):return "s"', { delay: 20 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const reg = (CSS as unknown as { highlights?: Map<string, unknown> })
          .highlights;
        if (!reg) return -1;
        const kw = reg.get('mq-py-kw') as { size?: number } | undefined;
        const str = reg.get('mq-py-str') as { size?: number } | undefined;
        return (kw?.size ?? 0) + (str?.size ?? 0);
      }),
    )
    .toBeGreaterThan(0);
});

test('Up on the first source line hops to the cell above', async ({ page }) => {
  await openPythonBlock(page);
  await cell(page, 0).pressSequentially('a=1', { delay: 20 });
  // a second cell to hop into
  await page.keyboard.press('Shift+Enter');
  await waitFocusedIndex(page, 1);
  // back to cell 0, into the block's only line
  await focusCell(page, 0);
  await page.keyboard.press('ArrowLeft'); // descend into the block
  await page.keyboard.press('ArrowUp'); // already line 1 → move out
  await waitFocusedIndex(page, 0); // stays: cell 0 is the top cell
});

test('an empty block shows no placeholder box', async ({ page }) => {
  await openPythonBlock(page);
  // mq-empty only applies once the caret has left the block
  await page.keyboard.press('Shift+Enter'); // new cell below, focus moves
  await waitFocusedIndex(page, 1);
  const block = pythonBlock(page);
  await expect(block).toHaveClass(/mq-empty/);
  const bg = await block.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgba(0, 0, 0, 0)');
});

test('no inset overlay while the caret is inside', async ({ page }) => {
  await openPythonBlock(page);
  const block = pythonBlock(page);
  await expect(block).toHaveClass(/mq-hasCursor/);
  const shadow = await block.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).toBe('none');
});

test('the cell value round-trips through reload', async ({ page }) => {
  await openPythonBlock(page);
  await cell(page, 0).pressSequentially('x = {"a": 1}', { delay: 20 });
  const latex = await cellValue(cell(page, 0));
  expect(latex).toBe('\\python{x = {"a": 1}}');
  // the debounced persist lands ~300ms after the last keystroke
  await page.waitForFunction(() =>
    localStorage.getItem('mathcompile-cells')?.includes('python'),
  );
  await page.reload();
  await page.waitForSelector('math-field');
  expect(await cellValue(cell(page, 0))).toBe(latex);
});
