import { test, expect, type Page } from '@playwright/test';
import { clearFirstCell, SEEDED_LATEX } from './helpers';

// "Standard textbook" editing keys on multi-line cells (\displaylines):
// line-aware Home/End, Tab/Shift-Tab leaving the field at the cell's
// edges, Ctrl+Z/Ctrl+Shift+Z undo/redo, and select-all covering the
// whole cell.

const rowInfo = (page: Page) =>
  page.locator('math-field').first().evaluate((el) => {
    const cur = el.querySelector('.mq-cursor');
    if (!cur) return { rowIdx: -1, leftText: '' };
    const td = cur.closest('td');
    const row = td?.closest('tr');
    const rows = row?.parentElement?.querySelectorAll(':scope > tr');
    return {
      rowIdx: row && rows ? Array.from(rows).indexOf(row) : -1,
      leftText: td
        ? Array.from(td.children)
            .slice(0, Array.from(td.children).indexOf(cur))
            .map((s) => s.textContent)
            .join('')
        : '',
    };
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await clearFirstCell(page);
});

test('Home/End go to the line edges in a multi-line cell', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  // single-char letter runs never open the autocomplete menu
  await mf.pressSequentially('x+y', { delay: 20 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('z', { delay: 20 });
  await expect(mf).toHaveJSProperty('value', '\\displaylines{x+y\\\\ z}');

  await page.keyboard.press('Home');
  expect(await rowInfo(page)).toEqual({ rowIdx: 1, leftText: '' });
  await page.keyboard.press('End');
  expect(await rowInfo(page)).toEqual({ rowIdx: 1, leftText: 'z' });

  await page.keyboard.press('ControlOrMeta+Home');
  expect(await rowInfo(page)).toEqual({ rowIdx: 0, leftText: '' });
  await page.keyboard.press('End');
  expect(await rowInfo(page)).toEqual({ rowIdx: 0, leftText: 'x+y' });
});

test('Tab at the end of the last line leaves the field', async ({
  page,
}) => {
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

test('Shift+Tab at the start of the first line leaves the field', async ({
  page,
}) => {
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

test('Tab on a middle line still moves to the next line', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('x+y', { delay: 20 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('z', { delay: 20 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('w', { delay: 20 });
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('Tab');

  expect(await rowInfo(page)).toEqual({ rowIdx: 1, leftText: '' });
});

test('Ctrl+A selects the whole multi-line cell', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('x+y', { delay: 20 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('z', { delay: 20 });
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await expect(mf).toHaveJSProperty('value', '');
});

test('Ctrl+Z / Ctrl+Shift+Z undo and redo edits', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('a+b', { delay: 20 });
  await page.waitForTimeout(1100); // end the coalescing window
  await mf.pressSequentially('c', { delay: 20 });
  await expect(mf).toHaveJSProperty('value', 'a+bc');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(mf).toHaveJSProperty('value', 'a+b');
  // clearFirstCell's select-all+delete coalesced with the retype into
  // one burst — the next undo lands back on the seeded content
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(mf).toHaveJSProperty('value', SEEDED_LATEX);

  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(mf).toHaveJSProperty('value', 'a+b');
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(mf).toHaveJSProperty('value', 'a+bc');
});

test('Ctrl+Z undoes a cleared cell', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('xy', { delay: 20 });
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await expect(mf).toHaveJSProperty('value', '');
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(mf).toHaveJSProperty('value', 'xy');
});

test('the first line does not shift when a cell goes multi-line', async ({
  page,
}) => {
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
