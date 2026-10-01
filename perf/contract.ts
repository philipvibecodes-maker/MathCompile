// The DOM contract the perf battery depends on — deliberately identical to
// the behavioral suite in e2e/. A rewrite keeps these hooks and every spec
// keeps working; if the cell editor stops being a <math-field>, provide the
// same surface (tag name, getValue()/value, focus()) via a thin adapter
// element.
//
// Today's <math-field> element exposes a .value property and focuses an
// internal textarea; other adapters have exposed getValue() instead — so
// value reads use the fallback below, and focus is always checked with
// contains()/closest().
//
// Nothing here reaches into app state, component internals, or a framework
// API — that is what makes the battery framework-agnostic.

import { expect, type Locator, type Page } from '@playwright/test';

export const SEL = {
  cell: 'math-field',
  addButton: '.add-expr',
  deleteButton: '.expr-delete',
  index: '.expr-index',
  paletteButton: '.palette-button',
  palette: '.palette',
  paletteBackdrop: '.palette-backdrop',
  paletteInput: '.palette-input',
  cmdItem: '.cmd-item',
  cellLatex: '.cell-latex',
  optionCheckbox: '.option-checkbox input',
  targetSelect: '.target-select select',
} as const;

export const cell = (page: Page, i = 0): Locator =>
  page.locator(SEL.cell).nth(i);

export const cellCount = (page: Page): Promise<number> =>
  page.locator(SEL.cell).count();

interface CellEl {
  getValue?(): string;
  value: string;
}

// .value on this app's <math-field> element; getValue() covers adapters
// that expose that instead. Callbacks passed to evaluate/waitForFunction
// are serialized into the page, so the fallback is inlined at each call
// site.
export const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => {
    const e = el as unknown as CellEl;
    return e.getValue?.() ?? e.value;
  });

// NB: functions passed to evaluate/waitForFunction are serialized and run in
// the browser — they can't close over SEL. Selector literals inside page-side
// callbacks must match SEL above (same convention as the e2e specs).

export const valueLen = (page: Page, i = 0): Promise<number> =>
  page.evaluate(
    (idx) => {
      const e = document.querySelectorAll('math-field')[idx] as unknown as CellEl;
      return (e.getValue?.() ?? e.value).length;
    },
    i,
  );

// waitForFunction arg must be serializable; the selector goes along.
export const lenGrows =
  (page: Page, i: number, before: number) => () =>
    page.waitForFunction(
      ([sel, idx, n]) => {
        const e = document.querySelectorAll(sel as string)[idx as number] as unknown as CellEl;
        return (e.getValue?.() ?? e.value).length > (n as number);
      },
      [SEL.cell, i, before] as const,
    );

// contains() not ===: the field's activeElement is its hidden textarea,
// not the <math-field> host.
export const focusedIndex = (page: Page): Promise<number> =>
  page.evaluate(() =>
    [...document.querySelectorAll('math-field')].findIndex((el) =>
      el.contains(document.activeElement),
    ),
  );

// waitForFunction polls on rAF — resolution lands at most one frame after
// the condition becomes true, which is within this suite's noise floor.
export const waitFocusedIndex = (page: Page, i: number) =>
  page.waitForFunction(
    (idx) =>
      document
        .querySelectorAll('math-field')
        [idx]?.contains(document.activeElement),
    i,
  );

// Resolves once cell i's .cell-latex output shows its *current* getValue() —
// i.e. the app committed the latest edit. Used instead of a length
// predicate: serialized LaTeX is not monotonic under editing (inline
// shortcuts like xx -> \times collapse it), so "length grows" can deadlock.
// Requires the latex target (the default) — other targets hide .cell-latex.
export const committedToOutput =
  (page: Page, i = 0) => async () => {
    const v = await page.evaluate(
      (idx) => {
        const e = document.querySelectorAll('math-field')[idx] as unknown as CellEl;
        return e.getValue?.() ?? e.value;
      },
      i,
    );
    if (!v) return;
    await page.waitForFunction(
      ([latex, idx]) =>
        document
          .querySelectorAll('.cell-latex')
          [idx as number]?.textContent?.includes(latex as string),
      [v, i] as const,
    );
  };

// Safety margin before handing focus to a cell — the current editor has
// no deferred refocus, but other implementations have stolen focus back
// ~60ms after gaining it. 150ms clears that window either way.
export const settleFocus = (page: Page) => page.waitForTimeout(150);

export const focusCell = async (page: Page, i: number) => {
  await settleFocus(page);
  await cell(page, i).focus();
  await waitFocusedIndex(page, i);
};

// The app boots with a seeded first cell; specs that measure or assert on
// cell 0 content start from a cleared field via real input (select-all +
// backspace), so the app's state stays in sync.
export const clearFirstCell = async (page: Page) => {
  await cell(page).focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
};

// Adds cells by driving the real UI (click + typing) until `count` exist.
// Seeding via setValue() would bypass the app's state — some editors
// silence change notifications for programmatic writes — so every
// implementation gets identical, honest input.
export const seedCells = async (page: Page, count: number, text = 'x') => {
  const have = await cellCount(page);
  for (let i = have; i < count; i++) {
    await page.locator(SEL.addButton).click();
    await waitFocusedIndex(page, i);
    // Outlast the deferred-refocus window, then re-assert focus if a steal
    // landed. Deterministic across implementations either way.
    await page.waitForTimeout(80);
    if ((await focusedIndex(page)) !== i) {
      await cell(page, i).focus();
      await waitFocusedIndex(page, i);
    }
    if (text) await cell(page, i).pressSequentially(text);
  }
  await expect(page.locator(SEL.cell)).toHaveCount(count);
};
