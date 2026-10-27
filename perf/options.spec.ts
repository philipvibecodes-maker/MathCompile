// Option fan-out: switching the codegen target adds/removes the per-cell
// .cell-latex outputs — an O(document) operation a rewrite should either
// make cheap or stop needing entirely.

import { expect, test } from '@playwright/test';
import { SEL, cell, clearFirstCell } from './contract';
import { flush, installInputClock, record, timed } from './measure';

test.afterAll(() => flush('options'));

test('target switch -> output repaint', async ({ page }) => {
  await installInputClock(page);
  await page.goto('/');
  await page.waitForSelector(SEL.cell);
  await cell(page).click();
  await clearFirstCell(page);
  await cell(page).pressSequentially('x');
  const select = page.locator(SEL.targetSelect);
  // Start from a committed LaTeX view rather than the Calculator default.
  await select.selectOption('latex');
  await expect(page.locator(SEL.cellLatex)).toHaveText('x');
  // Python has its own .cell-output too. Check the target-specific content;
  // only unimplemented targets have no output column. Keep exercising the
  // disabled targets through the same change event as before.
  const setTarget = (value: string) =>
    select.evaluate((s, v) => {
      (s as HTMLSelectElement).value = v;
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  const order = ['python', 'latex', 'javascript', 'latex', 'c'] as const;
  for (const value of order) {
    const { ms } = await timed(page, () => setTarget(value), {
      until: () =>
        page.waitForFunction(
          (target) => {
            const row = document.querySelector('.expr-row');
            if (!row) return false;
            const latex = row.querySelector('.cell-latex');
            const python = row.querySelector('.cell-code .cell-python');
            if (target === 'latex')
              return latex?.textContent === 'x' && !python;
            if (target === 'python')
              return python?.textContent?.includes('x = Symbol("x")') && !latex;
            return !row.querySelector('.cell-output');
          },
          value,
        ),
    });
    await expect(select).toHaveValue(value);
    record('options.target-switch-paint', ms);
  }
});
