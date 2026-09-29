// Option fan-out: toggling "d/dx means derivative" re-parses every populated
// cell (the setValue('') + setValue(v) trick in MathFieldInput), and switching
// the codegen target rewrites the output panel. These are the O(document)
// operations a rewrite should either make cheap or stop needing entirely.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SEL, cell, seedCells, settleFocus } from './contract';
import { flush, installInputClock, record, timed } from './measure';

const ddxBox = (page: Page) => page.locator(SEL.optionCheckbox).first();

// Wait for the committed output text — the last DOM-visible effect of the
// toggle, so the measured window covers the per-cell re-parse too.
const optionInOutput = (page: Page, want: boolean) => () =>
  page.waitForFunction(
    (w) =>
      document
        .querySelector('.output-body')
        ?.textContent?.includes(`d/dx means derivative: ${w}`),
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
  const order = [
    ['javascript', 'JavaScript'],
    ['glsl', 'GLSL'],
    ['c', 'C'],
    ['python', 'Python'],
  ] as const;
  for (const [value, label] of order) {
    const { ms } = await timed(page, () => select.selectOption(value), {
      until: () =>
        page.waitForFunction(
          (l) =>
            document
              .querySelector('.output-body')
              ?.textContent?.includes(`Codegen (${l})`),
          label,
        ),
    });
    record('options.target-switch-paint', ms);
  }
});
