import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { waitFocusedIndex } from './helpers';

// Escape-must-close contract for the command palette, exercised across every
// focus/timing state the palette can be open in. The handler is a window-level
// capture listener — this matrix pins that path and the states where it may
// not be reachable. The palette stays mounted between uses, so "closed" means
// the backdrop is hidden, not detached.
//
// NOTE: all of these pass in headless Chromium. If "Escape doesn't close the
// palette" reproduces in another environment (OS-level IME, autofill popup,
// real virtual keyboard, browser shell consuming the key), the matching row
// of this matrix is where it should show up.

const mf = (page: Page, i = 0) => page.locator('math-field').nth(i);

const openPalette = async (page: Page, via: 'key' | 'button' = 'key') => {
  if (via === 'key') await page.keyboard.press('Control+k');
  else await page.locator('.palette-button').click();
  await expect(page.locator('.palette')).toBeVisible();
};

const escapeCloses = async (page: Page) => {
  await page.keyboard.press('Escape');
  await expect(page.locator('.palette')).not.toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('math-field');
});

test('baseline: open via Ctrl+K, Escape closes and refocuses the cell', async ({
  page,
}) => {
  await mf(page).click();
  await mf(page).focus();
  await openPalette(page);
  await escapeCloses(page);
  await waitFocusedIndex(page, 0);
});

test('open via the header button', async ({ page }) => {
  await openPalette(page, 'button');
  await escapeCloses(page);
});

test('with a query typed in the input', async ({ page }) => {
  await mf(page).click();
  await mf(page).focus();
  await openPalette(page);
  await page.locator('.palette-input').pressSequentially('smart', {
    delay: 30,
  });
  await escapeCloses(page);
});

test('with a query producing no matches', async ({ page }) => {
  await mf(page).click();
  await mf(page).focus();
  await openPalette(page);
  await page.locator('.palette-input').pressSequentially('zzzz', {
    delay: 30,
  });
  await expect(page.locator('.cmd-empty')).toBeVisible();
  await escapeCloses(page);
});

test('after arrow-key navigation', async ({ page }) => {
  await mf(page).click();
  await mf(page).focus();
  await openPalette(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await escapeCloses(page);
});

test('opened immediately after the cell gained focus', async ({ page }) => {
  await mf(page).click();
  await mf(page).focus();
  await mf(page).pressSequentially('x', { delay: 30 });
  // MathQuill has no deferred-refocus timer, but the palette must still
  // close cleanly when opened ~ms after the field gained focus.
  await openPalette(page);
  await escapeCloses(page);
});

test('opened while a \\command was mid-typing in the cell', async ({
  page,
}) => {
  await mf(page).click();
  await mf(page).focus();
  // MathQuill's pending-latex state replaces MathLive's suggestion popover.
  await mf(page).pressSequentially('\\sq', { delay: 60 });
  await openPalette(page);
  await escapeCloses(page);
});

test('when focus has drifted back to a math-field while open', async ({
  page,
}) => {
  await mf(page).click();
  await mf(page).focus();
  await openPalette(page);
  // Simulate an external focus steal (browser chrome, IME, shell) moving
  // focus back to a cell while the palette is open.
  await mf(page).focus();
  await page.waitForTimeout(100);
  await escapeCloses(page);
});

test('when focus is programmatically moved out of the input', async ({
  page,
}) => {
  await mf(page).click();
  await mf(page).focus();
  await openPalette(page);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.waitForTimeout(80); // trap may have refocused; either is fine
  await escapeCloses(page);
});

test('with focus outside the cell before opening', async ({ page }) => {
  await mf(page).click();
  await mf(page).focus();
  // MathQuill has no virtual keyboard; the state worth pinning is simply
  // "cell was focused, then something else took focus before Ctrl+K".
  await page.locator('.add-expr').focus();
  await openPalette(page);
  await escapeCloses(page);
});

test('reopened palette still closes on Escape', async ({ page }) => {
  await mf(page).click();
  await mf(page).focus();
  await openPalette(page);
  await escapeCloses(page);
  await openPalette(page);
  await escapeCloses(page);
});

test('a second Escape after closing does not reopen or wedge the app', async ({
  page,
}) => {
  await mf(page).click();
  await mf(page).focus();
  await openPalette(page);
  await escapeCloses(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.palette')).not.toBeVisible();
  await waitFocusedIndex(page, 0);
});

test('with text selected in the palette input', async ({ page }) => {
  await mf(page).click();
  await mf(page).focus();
  await openPalette(page);
  const input = page.locator('.palette-input');
  await input.pressSequentially('target', { delay: 30 });
  await page.keyboard.press('Shift+ArrowLeft'); // select a char backwards
  await page.keyboard.press('Shift+ArrowLeft');
  await escapeCloses(page);
});

test('immediately after a command ran (close → reopen → Escape)', async ({
  page,
}) => {
  await mf(page).click();
  await mf(page).focus();
  await openPalette(page);
  await page.locator('.palette-input').pressSequentially('insert below', {
    delay: 20,
  });
  await page.keyboard.press('Enter'); // runs command, closes palette
  await expect(page.locator('.palette')).not.toBeVisible();
  await openPalette(page);
  await escapeCloses(page);
});

test('during an active IME composition in the input', async ({ page }) => {
  await mf(page).click();
  await mf(page).focus();
  await openPalette(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', {
    text: 'koto',
    selectionStart: 4,
    selectionEnd: 4,
  });
  // Whether the browser delivers Escape during a composition is
  // platform-dependent; the palette must close if it arrives.
  await page.keyboard.press('Escape');
  await expect(page.locator('.palette')).not.toBeVisible();
});
