// The DOM contract the perf battery depends on — deliberately identical to
// the behavioral suite in e2e/. A rewrite keeps these hooks and every spec
// keeps working; if the cell editor stops being a <math-field>, provide the
// same surface (tag name, getValue(), focus()) via a thin adapter element.
//
// Two editor backends implement that surface today:
// - MathLive <math-field>: el.getValue(), and the host itself is the
//   document.activeElement when focused.
// - MathQuill adapters (rewrite/*-mathquill): a <math-field> host that may
//   expose getValue() or only a .value property, and focuses an internal
//   textarea — so focus is always checked with contains()/closest(), and
//   value reads use the readLatex fallback below.
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
  outputBody: '.output-body',
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

// getValue() on MathLive and the Solid+MathQuill adapter; .value on the
// Svelte+MathQuill element. Callbacks passed to evaluate/waitForFunction are
// serialized into the page, so this fallback is inlined at each call site.
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

// contains() not ===: a MathQuill field's activeElement is its hidden
// textarea, not the <math-field> host. Reflexive for MathLive, whose host
// itself takes focus.
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

// Resolves once .output-body contains cell i's *current* getValue() — i.e.
// the app committed the latest edit. Used instead of a length predicate:
// serialized LaTeX is not monotonic under editing (inline shortcuts like
// xx -> \times collapse it, and the "(no expressions yet)" empty state is
// longer than a filled line), so "length grows" can deadlock.
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
      (latex) =>
        document
          .querySelector('.output-body')
          ?.textContent?.includes(latex),
      v,
    );
  };

// MathLive re-focuses a field's internal span ~60ms after the field gains
// focus; 150ms is safely past that window (same convention as e2e).
export const settleFocus = (page: Page) => page.waitForTimeout(150);

export const focusCell = async (page: Page, i: number) => {
  await settleFocus(page);
  await cell(page, i).focus();
  await waitFocusedIndex(page, i);
};

// Adds cells by driving the real UI (click + typing) until `count` exist.
// Seeding via setValue() would bypass the app's state — MathLive silences
// notifications for programmatic setValue, and a rewrite may sync state on
// input alone — so every implementation gets identical, honest input.
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
