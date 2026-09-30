// Option fan-out: toggling "d/dx means derivative" re-pushes the option to
// every mounted field, and switching the codegen target adds/removes the
// per-cell .cell-latex outputs. These are the O(document) operations a
// rewrite should either make cheap or stop needing entirely.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SEL, cell, seedCells, settleFocus } from './contract';
import { flush, installInputClock, record, timed } from './measure';

const ddxBox = (page: Page) => page.locator(SEL.optionCheckbox).first();

// Wait for the checkbox state — the DOM-visible effect of the toggle, so the
// measured window covers the per-field option push too.
const optionInOutput = (page: Page, want: boolean) => () =>
  page.waitForFunction(
    (w) =>
      (document.querySelector('.option-checkbox input') as HTMLInputElement)
        .checked === w,
    want,
  );

test.afterAll(() => flush('options'));

test('d/dx toggle -> repaint, single populated cell', async ({ page }) => {
  await installInputClock(page);
  await page.goto('/');
  await page.waitForSelector(SEL.cell);
  await cell(page).click();
  await cell(page).pressSequentially('x+1');
  await settleFocus(page);
  const box = ddxBox(page);
  for (let i = 0; i < 6; i++) {
    const want = !(await box.isChecked());
    const { ms } = await timed(page, () => box.click(), {
      until: optionInOutput(page, want),
    });
    record('options.ddx-toggle-paint cells=1', ms);
    expect(await box.isChecked()).toBe(want);
  }
});

test('d/dx toggle -> repaint, 20 populated cells', async ({ page }) => {
  await installInputClock(page);
  await page.goto('/');
  await page.waitForSelector(SEL.cell);
  await seedCells(page, 20, 'x+1');
  const box = ddxBox(page);
  for (let i = 0; i < 4; i++) {
    const want = !(await box.isChecked());
    const { ms } = await timed(page, () => box.click(), {
      until: optionInOutput(page, want),
    });
    record('options.ddx-toggle-paint cells=20', ms);
    expect(await box.isChecked()).toBe(want);
  }
});

test('target switch -> output repaint', async ({ page }) => {
  await installInputClock(page);
  await page.goto('/');
  await page.waitForSelector(SEL.cell);
  await cell(page).click();
  await cell(page).pressSequentially('x');
  const select = page.locator(SEL.targetSelect);
  // Each switch toggles the per-cell .cell-output elements: present under
  // the latex target, absent under the rest. Non-latex <option>s are
  // disabled, so dispatch the change like the control's onchange would.
  const setTarget = (value: string) =>
    select.evaluate((s, v) => {
      (s as HTMLSelectElement).value = v;
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  const order = ['python', 'latex', 'javascript', 'latex', 'c'] as const;
  for (const value of order) {
    const want = value === 'latex';
    const { ms } = await timed(page, () => setTarget(value), {
      until: () =>
        page.waitForFunction(
          (w) =>
            document.querySelectorAll('.cell-output').length > 0 === w,
          want,
        ),
    });
    record('options.target-switch-paint', ms);
  }
});
