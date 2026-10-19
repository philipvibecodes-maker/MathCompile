import type { Browser, Page, TestInfo } from '@playwright/test';

// The app boots with a seeded first cell; specs that drive cell content
// start from a cleared field (select-all + backspace inside MQ).
export const SEEDED_LATEX = '2^{n}=\\sum_{i=0}^{n}\\binom{n}{i}';

export const clearFirstCell = async (page: Page) => {
  const mf = page.locator('math-field').first();
  await mf.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
};

// Shared-page specs: one browser page per file, state reset between
// tests instead of a fresh goto (which re-pays the ~2.5s module
// waterfall + mount). Tests in a file already run sequentially on one
// worker, so a file-level page is safe; a reload still works whenever a
// test needs a real fresh boot.
//
//   let page: Page;
//   test.beforeAll(async ({ browser }, testInfo) => {
//     page = await sharedPage(browser, testInfo);
//   });
//   test.beforeEach(async () => resetApp(page));
//
// Tests then take `async () =>` — `page` comes from the closure. The
// one exception: a test asserting the *first-run* seed cell needs an
// empty workbook, so it clears storage and reloads itself.
export const sharedPage = async (
  browser: Browser,
  testInfo: TestInfo,
): Promise<Page> => {
  // The beforeAll hook shares the first test's timeout budget, and the
  // goto re-pays the module waterfall — under parallel load that can
  // exceed the 10s default. The hook gets a real budget; tests stay 10s.
  testInfo.setTimeout(90_000);
  const page = await browser.newPage();
  await page.goto('/', { timeout: 60_000 });
  await page.locator('math-field').first().waitFor({ timeout: 60_000 });
  return page;
};

// Back to first-run defaults without reloading: drain the debounced
// cell write, wipe storage, reset the in-memory store (prefs, overlays,
// help pins, workbook down to a single 'Worksheet 1'), then clearAll()
// leaves one blank focused cell. The trailing flush settles storage so
// a test's own localStorage.clear() + reload hits a clean seed path.
export const resetApp = async (page: Page) => {
  await page.evaluate(() => {
    const mc = (
      window as unknown as {
        __mc: {
          store: import('../src/state/store.svelte').AppStore;
          flushPendingCells: () => void;
          DEFAULT_HELP_IDS: string[];
          resetLastPointerDown: () => void;
        };
      }
    ).__mc;
    const s = mc.store;
    mc.flushPendingCells();
    localStorage.clear();
    // A click in the previous test would otherwise still be inside the
    // 300ms pointerRecentlyDown window when this test's blur() runs —
    // attach-field would read the blur as a click-away and not refocus.
    mc.resetLastPointerDown();
    s.paletteOpen = false;
    s.helpSearchOpen = false;
    Object.assign(s, {
      target: 'latex',
      smartMode: true,
      showPlumbing: false,
      guideOpen: true,
      importAll: true,
      pairTuple: 'interval',
      fadeMs: 150,
      debounceMs: 600,
      fadeInMs: 150,
      fadeOutMs: 150,
      pinnedHelp: [...mc.DEFAULT_HELP_IDS],
      hiddenHelp: [],
      darkMode: false,
    });
    // Collapse the workbook to one sheet; deleteWorksheet auto-switches
    // if the active sheet is removed mid-trim.
    while (s.worksheets.length > 1)
      s.deleteWorksheet(s.worksheets[s.worksheets.length - 1].id);
    if (s.worksheets[0].name !== 'Worksheet 1')
      s.renameWorksheet(s.worksheets[0].id, 'Worksheet 1');
    s.clearAll();
    mc.flushPendingCells();
    // The settings menu is component-local state — close it if open.
    document
      .querySelector('.settings-backdrop')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  // clearAll remounts a fresh field; wait for it so tests start focused.
  const mf = page.locator('math-field').first();
  await mf.waitFor();
  await mf.focus();
};

// The first-run seed: with no workbook in storage the app opens the
// seeded example cell. Shared-page tests get there by clearing storage
// and reloading — the same path a brand-new user hits.
export const reloadToSeed = async (page: Page) => {
  await page.evaluate(() => {
    // Flush BEFORE clearing: otherwise the pending write is still armed
    // and installFlushOnHide's pagehide handler re-seeds the workbook
    // mid-reload, hiding the seed path we're aiming at.
    const mc = (
      window as unknown as { __mc: { flushPendingCells: () => void } }
    ).__mc;
    mc.flushPendingCells();
    localStorage.clear();
  });
  await page.reload();
  await page.locator('math-field').first().waitFor();
};
