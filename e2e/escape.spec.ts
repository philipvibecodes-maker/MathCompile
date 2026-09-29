import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Escape-must-close contract for the command palette, exercised across every
// focus/timing state the palette can be open in. The handler is a window-level
// capture listener plus the input's own keydown — this matrix pins both paths
// and the states where neither may be reachable.
//
// The palette stays mounted (`.open` toggles visibility), so the closed
// assertion is not.toBeVisible(), not toHaveCount(0).

const mf = (page: Page, i = 0) => page.locator('math-field').nth(i);

const cellFocused = (page: Page, i = 0) =>
  page.waitForFunction(
    (idx) =>
      document
        .querySelectorAll('math-field')
        [idx]?.contains(document.activeElement),
    i,
  );

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
  await cellFocused(page);
});

test('open via the header button', async ({ page }) => {
  await openPalette(page, 'button');
  await escapeCloses(page);
});

test('with a query typed in the input', async ({ page }) => {
  await mf(page).click();
  await openPalette(page);
  await page.locator('.palette-input').pressSequentially('smart', {
    delay: 30,
  });
  await escapeCloses(page);
});

test('with a query producing no matches', async ({ page }) => {
  await mf(page).click();
  await openPalette(page);
  await page.locator('.palette-input').pressSequentially('zzzz', {
    delay: 30,
  });
  await expect(page.locator('.cmd-empty')).toBeVisible();
  await escapeCloses(page);
});

test('after arrow-key navigation', async ({ page }) => {
  await mf(page).click();
  await openPalette(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await escapeCloses(page);
});

test('opened immediately after editing a cell', async ({ page }) => {
  await mf(page).click();
  await mf(page).pressSequentially('x', { delay: 30 });
  await openPalette(page);
  await escapeCloses(page);
});

test('opened while a latex command input is open in the cell', async ({
  page,
}) => {
  await mf(page).click();
  await mf(page).pressSequentially('\\sq', { delay: 60 });
  await openPalette(page);
  await escapeCloses(page);
});

test('when focus has drifted back to a math-field while open', async ({
  page,
}) => {
  await mf(page).click();
  await openPalette(page);
  // Simulate a focus steal winning over the palette's focus trap.
  await mf(page).focus();
  await page.waitForTimeout(100);
  // The trap re-asserts input focus; Escape must work either way.
  await escapeCloses(page);
});

test('when focus is programmatically moved out of the input', async ({
  page,
}) => {
  await mf(page).click();
  await openPalette(page);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.waitForTimeout(80); // trap may have refocused; either is fine
  await escapeCloses(page);
});

test('reopened palette still closes on Escape', async ({ page }) => {
  await mf(page).click();
  await openPalette(page);
  await escapeCloses(page);
  await openPalette(page);
  await escapeCloses(page);
});

test('a second Escape after closing does not reopen or wedge the app', async ({
  page,
}) => {
  await mf(page).click();
  await openPalette(page);
  await escapeCloses(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.palette')).not.toBeVisible();
  await cellFocused(page);
});

test('with text selected in the palette input', async ({ page }) => {
  await mf(page).click();
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
