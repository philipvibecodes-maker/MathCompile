import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

// Python input cells — a plain source editor (no MathQuill) whose
// def/lambda bindings register in the worksheet's python-function
// registry, callable from math cells as \mathrm{name}(x) or via a
// `# @latex <notation>` alias on the def.

const cell = (page: Page, i: number): Locator =>
  page.locator('math-field').nth(i);

const pyInput = (page: Page): Locator => page.locator('textarea.py-input');

const setTarget = (page: Page, value: string) =>
  page.locator('.target-select select').evaluate((s, v) => {
    (s as HTMLSelectElement).value = v;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);

// The footer button appends a python cell and focuses its textarea.
const addPythonCell = async (page: Page) => {
  await page.locator('.add-python').click();
  await expect(pyInput(page)).toHaveCount(1);
};

// Multi-line python source — Enter is a plain newline in the textarea.
const typePython = async (page: Page, source: string) => {
  const ta = pyInput(page);
  await ta.click();
  await ta.pressSequentially(source, { delay: 10 });
  expect(await ta.inputValue()).toBe(source);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
  await clearFirstCell(page);
});

test('+ Python cell appends a source cell with the py tag', async ({
  page,
}) => {
  await addPythonCell(page);
  await expect(page.locator('math-field')).toHaveCount(1);
  await expect(pyInput(page)).toBeFocused();
  await expect(page.locator('.py-tag')).toHaveText('py');
});

test('typing keeps raw source — no math editing inside', async ({ page }) => {
  await addPythonCell(page);
  const source = 'def relu(x):\n    return x if x > 0 else 0';
  await typePython(page, source);
});

test('Shift+Enter in a python cell adds a math cell below', async ({
  page,
}) => {
  await addPythonCell(page);
  await typePython(page, 'x = 1');
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('math-field')).toHaveCount(2);
  // The new cell is a math field and it is focused.
  await expect(cell(page, 1)).toBeVisible();
  await page.waitForFunction(() =>
    document
      .querySelectorAll('math-field')[1]
      ?.contains(document.activeElement),
  );
});

test('arrow keys move between python and math cells', async ({ page }) => {
  await addPythonCell(page);
  await typePython(page, 'x = 1');
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() =>
    document
      .querySelectorAll('math-field')[0]
      ?.contains(document.activeElement),
  );
  await page.keyboard.press('ArrowDown');
  await expect(pyInput(page)).toBeFocused();
});

test('Backspace on an empty python cell deletes it', async ({ page }) => {
  await addPythonCell(page);
  await page.keyboard.press('Backspace');
  await expect(pyInput(page)).toHaveCount(0);
  await expect(page.locator('math-field')).toHaveCount(1);
});

test('a python cell\'s kind and source survive a reload', async ({ page }) => {
  await addPythonCell(page);
  await typePython(page, 'def relu(x):\n    return x');
  // Debounced write — wait for the stored workbook to carry the kind.
  await page.waitForFunction(() =>
    localStorage.getItem('mathcompile-worksheets')?.includes('"kind":"python"'),
  );
  await page.reload();
  await page.waitForSelector('math-field');
  await expect(pyInput(page)).toHaveCount(1);
  await expect(pyInput(page)).toHaveValue('def relu(x):\n    return x');
});

test('python target echoes the source and resolves \\mathrm calls', async ({
  page,
}) => {
  // Cell 0 (math) stays empty; add the python cell, then a math cell
  // below that calls the def.
  await addPythonCell(page);
  await typePython(page, 'def relu(x):\n    return x');
  await page.keyboard.press('Shift+Enter');
  // \mathrm{relu} accepts on the `{`; Right steps out of the block.
  await cell(page, 1).pressSequentially('\\mathrm{relu}', { delay: 20 });
  await page.keyboard.press('ArrowRight');
  await cell(page, 1).pressSequentially('(x)', { delay: 20 });
  await setTarget(page, 'python');

  // The calling cell's standalone script inlines the def.
  const outputs = page.locator('.cell-python');
  await expect(outputs.nth(2)).toContainText('def relu(x):');
  await expect(outputs.nth(2)).toContainText('relu(x)');
  // …and it is NOT minted as a SymPy function stub.
  await expect(outputs.nth(2)).not.toContainText('Function');
});

test('# @latex aliases a def to custom notation', async ({ page }) => {
  await addPythonCell(page);
  await typePython(
    page,
    '# @latex \\mathcal{F}\ndef fourier(x):\n    return 2 * x',
  );
  await page.keyboard.press('Shift+Enter');
  await cell(page, 1).pressSequentially('\\mathcal{F}', { delay: 20 });
  await page.keyboard.press('ArrowRight');
  await cell(page, 1).pressSequentially('(x)', { delay: 20 });
  await setTarget(page, 'python');

  await expect(page.locator('.cell-python').nth(2)).toContainText(
    'fourier(x)',
  );
});

test('a call above its python def flags the ordering note', async ({
  page,
}) => {
  // Cell 0 calls relu before any python cell exists.
  await cell(page, 0).pressSequentially('\\mathrm{relu}', { delay: 20 });
  await page.keyboard.press('ArrowRight');
  await cell(page, 0).pressSequentially('(x)', { delay: 20 });
  await addPythonCell(page);
  await typePython(page, 'def relu(x):\n    return x');
  await setTarget(page, 'python');

  // The call resolves (no Function stub) but carries the ordering note.
  const note = page
    .locator('.cell-row')
    .first()
    .locator('.issue-note .issue-text');
  await expect(note).toContainText('must sit above this cell');
});
