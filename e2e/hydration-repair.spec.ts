import { expect, test } from '@playwright/test';

// Unparseable stored latex used to blank the field on hydration while
// .cell-latex still showed the stored latex (the .value === '' signature).
// setValue now salvages to the nearest parseable string, falling back to a
// \text block showing the raw text.

const seed = (page: import('@playwright/test').Page, cells: { id: number; latex: string }[]) =>
  page.addInitScript((cs) => {
    localStorage.setItem('mathcompile-cells', JSON.stringify(cs));
  }, cells);

const cellValues = (page: import('@playwright/test').Page) =>
  page.$$eval('math-field', (els) =>
    els.map((el) => (el as unknown as { value: string }).value),
  );

const cellLatexTexts = (page: import('@playwright/test').Page) =>
  page.$$eval('.cell-latex', (els) => els.map((el) => el.textContent));

test('dangling bound marker repairs to the nearest parseable cell', async ({
  page,
}) => {
  await seed(page, [{ id: 1, latex: 'x_{a}^' }]);
  await page.goto('/');
  await page.waitForSelector('math-field');
  const [value] = await cellValues(page);
  expect(value).toBe('x_{a}');
  // the repair flows back through onChange — store and output column heal
  const [shown] = await cellLatexTexts(page);
  expect(shown).toBe('x_{a}');
});

test('unclosed group is closed rather than blanked', async ({ page }) => {
  await seed(page, [
    { id: 1, latex: 'x_{' },
    { id: 2, latex: '\\frac{1}{' },
  ]);
  await page.goto('/');
  await page.waitForSelector('math-field');
  expect(await cellValues(page)).toEqual(['x_{ }', '\\frac{1}{ }']);
});

test('unclosed \\left( drops the opener, keeping the content', async ({
  page,
}) => {
  await seed(page, [{ id: 1, latex: '\\left(x_{1}' }]);
  await page.goto('/');
  await page.waitForSelector('math-field');
  const [value] = await cellValues(page);
  expect(value).not.toBe('');
  expect(value).toContain('x_{1}');
});

test('raw \\\\ row break wraps in \\displaylines', async ({ page }) => {
  await seed(page, [{ id: 1, latex: 'x\\\\y' }]);
  await page.goto('/');
  await page.waitForSelector('math-field');
  const [value] = await cellValues(page);
  expect(value).toBe('\\displaylines{x\\\\ y}');
});

test('irrecoverable input shows the raw text instead of blanking', async ({
  page,
}) => {
  await seed(page, [{ id: 1, latex: '}}}}' }]);
  await page.goto('/');
  await page.waitForSelector('math-field');
  const [value] = await cellValues(page);
  expect(value).not.toBe('');
});
