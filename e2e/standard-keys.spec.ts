import { test, expect } from '@playwright/test';
import { clearFirstCell, sharedPage, resetApp } from './helpers';

// Residual browser-only coverage of the "standard textbook" editing
// keys: Tab/Shift-Tab leaving the field is real browser tab order, and
// the first-line pin is a layout assert — neither exists headless.
// Line-aware Home/End, in-grid Tab, select-all/type-over, and the
// vendored undo history moved to src/editor/mq-standard-keys.test.ts.

let page: Page;
test.beforeAll(async ({ browser }, testInfo) => {
  page = await sharedPage(browser, testInfo);
});

test.beforeEach(async () => {
  await resetApp(page);
  await clearFirstCell(page);
});

test('Tab at the end of the last line leaves the field', async () => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('x+y', { delay: 20 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('z', { delay: 20 });
  await page.keyboard.press('Tab');

  // the browser default hops focus out of the math-field, exactly like
  // a single-line cell
  const inField = await mf.evaluate((el) =>
    el.contains(document.activeElement)
  );
  expect(inField).toBe(false);
});

test('Shift+Tab at the start of the first line leaves the field', async () => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('x+y', { delay: 20 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('z', { delay: 20 });
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('Shift+Tab');

  const inField = await mf.evaluate((el) =>
    el.contains(document.activeElement)
  );
  expect(inField).toBe(false);
});

test('the first line does not shift when a cell goes multi-line', async () => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('a+b', { delay: 20 });
  const firstVar = (sel: string) =>
    mf.evaluate((el, s) => {
      const v = el.querySelector(s);
      return v ? v.getBoundingClientRect().top : null;
    }, sel);

  const ySingle = await firstVar('.mq-root-block var');
  await page.keyboard.press('Enter');
  await mf.pressSequentially('z', { delay: 20 });
  const yMulti = await firstVar('.mq-displaylines tr:first-child var');

  expect(ySingle).not.toBeNull();
  expect(yMulti).not.toBeNull();
  expect(Math.abs((yMulti as number) - (ySingle as number))).toBeLessThan(0.5);
});

test('braces appear on a new line after a set-builder definition', async () => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('A=\\left\\{\\left(x,y\\right)\\mid x+y=1\\right\\}');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await mf.pressSequentially('{x}');
  await expect.poll(() => mf.evaluate((el) => (el as HTMLElement & { value: string }).value))
    .toContain('\\left\\{x\\right\\}');
  const line = mf.locator('.mq-displaylines tr').nth(1);
  await expect(line.locator('.mq-bracket-l')).toBeVisible();
  await expect(line.locator('.mq-bracket-r')).toBeVisible();
  await expect(line.locator('var')).toHaveText('x');
});


for (const [word, separator] of [['where', '\\mid'], ['st', '\\operatorname{s.t.}']]) {
  test(`typing ${word} inserts a set-builder separator`, async () => {
    const mf = page.locator('math-field').first();
    await mf.pressSequentially(`A={(x,y)${word}x+y=1}`);
    await expect.poll(() => mf.evaluate((el) => (el as HTMLElement & { value: string }).value))
      .toContain(separator);
    const root = mf.locator('.mq-editable-field > .mq-root-block');
    await expect(root).toContainText('x+y=1');
    if (word === 'st') {
      const operator = root.locator('.mq-operatorname');
      await expect(operator).toHaveText('s.t.');
      const spacing = await operator.evaluate((el) => {
        const style = getComputedStyle(el);
        return [parseFloat(style.paddingLeft), parseFloat(style.paddingRight)];
      });
      expect(spacing[0]).toBeGreaterThan(0);
      expect(spacing[1]).toBeGreaterThan(0);
    }
  });
}
