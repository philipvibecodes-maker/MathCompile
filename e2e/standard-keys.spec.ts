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
