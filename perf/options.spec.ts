// Option fan-out: switching the codegen target adds/removes the per-cell
// .cell-latex outputs — an O(document) operation a rewrite should either
// make cheap or stop needing entirely.

import { test } from '@playwright/test';
import { SEL, cell } from './contract';
import { flush, installInputClock, record, timed } from './measure';

test.afterAll(() => flush('options'));

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
