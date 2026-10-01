// Command-palette latency, split cold vs warm open: cold open is the
// first open on a fresh document (JIT + first overlay layout), warm open
// is the steady-state class flip. Plus filter keystrokes, command
// execution, and Escape -> cell refocus. The cells=20 variants scale the
// command list (one "go to expression" item per cell) to expose
// per-command costs.

import { expect, test } from '@playwright/test';
import {
  SEL,
  cell,
  cellCount,
  seedCells,
  settleFocus,
  waitFocusedIndex,
} from './contract';
import { flush, installInputClock, record, timed } from './measure';
import type { Page } from '@playwright/test';

const paletteVisible = (page: Page) => () =>
  page.waitForSelector(SEL.palette);

const paletteInputLen = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (document.querySelector('.palette-input') as HTMLInputElement | null)
        ?.value.length ?? 0,
  );

const inputGrows = (page: Page, before: number) => () =>
  page.waitForFunction(
    ([sel, n]) =>
      ((document.querySelector(sel as string) as HTMLInputElement | null)
        ?.value.length ?? 0) > (n as number),
    [SEL.paletteInput, before],
  );

test.afterAll(() => flush('palette'));

test('Ctrl+K cold open -> palette painted (fresh pages)', async ({
  browser,
}) => {
  for (let i = 0; i < 6; i++) {
    const page = await browser.newPage();
    try {
      await installInputClock(page);
      await page.goto('/');
      await page.waitForSelector(SEL.cell);
      // A realistic pre-open state: user just edited a cell.
      await cell(page).click();
      await cell(page).pressSequentially('x');
      await page.waitForTimeout(150); // let the edit settle before timing
      const { ms } = await timed(
        page,
        () => page.keyboard.press('Control+k'),
        { until: paletteVisible(page) },
      );
      record('palette.open-paint cold', ms);
    } finally {
      await page.close();
    }
  }
});

test('Ctrl+K warm open -> paint, Escape -> cell refocused', async ({
  page,
}) => {
  await installInputClock(page);
  await page.goto('/');
  await page.waitForSelector(SEL.cell);
  await cell(page).click();
  await settleFocus(page);
  for (let i = 0; i < 8; i++) {
    const open = await timed(
      page,
      () => page.keyboard.press('Control+k'),
      { until: paletteVisible(page) },
    );
    record('palette.open-paint warm', open.ms);
    if (i < 5) {
      const close = await timed(
        page,
        () => page.keyboard.press('Escape'),
        {
          until: () =>
            page.waitForFunction(
              (sel) => {
                const el = document.querySelector(sel);
                return (
                  (!el || getComputedStyle(el).visibility === 'hidden') &&
                  document.activeElement?.closest('math-field') != null
                );
              },
              SEL.palette,
            ),
        },
      );
      record('palette.close-refocus', close.ms);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForSelector(SEL.palette, { state: 'hidden' });
    }
    await page.waitForTimeout(80); // clear of the focus-steal window
  }
});

test('filter keystroke -> list repainted', async ({ page }) => {
  await installInputClock(page);
  await page.goto('/');
  await page.waitForSelector(SEL.cell);
  await cell(page).click();
  await settleFocus(page);
  await page.keyboard.press('Control+k');
  await page.waitForSelector(SEL.paletteInput);
  for (const ch of 'targetpython'.split('')) {
    const before = await paletteInputLen(page);
    const { ms } = await timed(page, () => page.keyboard.press(ch), {
      until: inputGrows(page, before),
    });
    record('palette.filter-paint cells=1', ms);
  }
  // The query really filtered the list to a usable result.
  await expect(page.locator(SEL.cmdItem).first()).toBeVisible();
});

test('palette Enter -> command runs -> new cell painted', async ({ page }) => {
  await installInputClock(page);
  await page.goto('/');
  await page.waitForSelector(SEL.cell);
  await cell(page).click();
  await settleFocus(page);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Control+k');
    await page.waitForSelector(SEL.paletteInput);
    await page.locator(SEL.paletteInput).fill('insert below');
    const n = await cellCount(page);
    const { ms } = await timed(page, () => page.keyboard.press('Enter'), {
      until: () =>
        page.waitForFunction(
          ([sel, c]) => document.querySelectorAll(sel as string).length === c,
          [SEL.cell, n + 1],
        ),
    });
    record('palette.command-paint', ms);
    await waitFocusedIndex(page, n); // "insert below" focused the new cell
    await page.waitForTimeout(80);
  }
});

test('open + filter with 20 cells (command list grows)', async ({ page }) => {
  await installInputClock(page);
  await page.goto('/');
  await page.waitForSelector(SEL.cell);
  await seedCells(page, 20);
  // First open on this page — the palette subtree is cold for this doc size.
  const open = await timed(
    page,
    () => page.keyboard.press('Control+k'),
    { until: paletteVisible(page) },
  );
  record('palette.open-paint cells=20', open.ms);
  for (const ch of 'gotoexpr'.split('')) {
    const before = await paletteInputLen(page);
    const { ms } = await timed(page, () => page.keyboard.press(ch), {
      until: inputGrows(page, before),
    });
    record('palette.filter-paint cells=20', ms);
  }
  await expect(page.locator(SEL.cmdItem).first()).toBeVisible();
});
