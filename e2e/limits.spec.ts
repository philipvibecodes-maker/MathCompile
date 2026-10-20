import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell, sharedPage, resetApp } from './helpers';

// Residual browser-only limits coverage. The caret/bounds interaction
// layer (serialization + .mq-cursor ancestry for \int, \sum, \lim,
// \iint, \antid) moved to src/editor/mq-limits.test.ts — it needs no
// layout. What stays here are the two rendered-geometry pins, which
// require real layout (getBoundingClientRect is all zeros headless).

const cell = (page: Page): Locator => page.locator('math-field').first();

const setValue = (mf: Locator, latex: string) =>
  mf.evaluate(
    (el, l) => ((el as unknown as { value: string }).value = l),
    latex,
  );

let page: Page;
test.beforeAll(async ({ browser }, testInfo) => {
  page = await sharedPage(browser, testInfo);
});

test.beforeEach(async () => {
  await resetApp(page);
  const mf = cell(page);
  await mf.click();
  await mf.focus();
  await clearFirstCell(page);
});

test('lim renders the approach bound below the operator', async () => {
  const mf = cell(page);
  await setValue(mf, '\\lim_{x\\to0}f');
  // The bound renders beneath the "lim" text, not to its right.
  const geo = await mf.evaluate((el) => {
    const lim = el.querySelector('.mq-lim')!.getBoundingClientRect();
    const under = el
      .querySelector('.mq-approaches')!
      .getBoundingClientRect();
    return { limBottom: lim.bottom, underTop: under.top };
  });
  expect(geo.underTop).toBeGreaterThanOrEqual(geo.limBottom - 1);
});

test('a sup on a bracket inside \\sqrt stays below the vinculum', async () => {
  const mf = cell(page);
  // \left|a\right|^{2} — edge-straddling scripts (.mq-bracket-container
  // + .mq-supsub) poke ~0.4em above the line box; the radicand's
  // border-top used to strike through them (SymPy emits this shape for
  // ‖(a b)‖).
  await setValue(mf, '\\sqrt{\\left|a\\right|^{2}+\\left|b\\right|^{2}}');
  const geo = await mf.evaluate((el) => {
    const stem = el.querySelector('.mq-sqrt-stem')!.getBoundingClientRect();
    const sup = el
      .querySelector('.mq-sqrt-stem .mq-bracket-container ~ .mq-supsub .mq-sup')!
      .getBoundingClientRect();
    return { stemTop: stem.top, supTop: sup.top };
  });
  expect(geo.supTop).toBeGreaterThanOrEqual(geo.stemTop);
});

test('\\iint with a lone sup bound renders it at bound height', async () => {
  const mf = cell(page);
  await setValue(mf, '\\iint^{b}');
  const lone = await mf.evaluate((el) => {
    const sign = el.querySelector('.mq-int')!.getBoundingClientRect();
    const sup = el
      .querySelector('.mq-int ~ .mq-supsub .mq-sup')!
      .getBoundingClientRect();
    // The leaf sign's own box is just the baseline band — the 330% glyph
    // ink overflows it, so the bound must track `big`, not the box.
    const glyph = el.querySelector('.mq-int big')!.getBoundingClientRect();
    return { signTop: sign.top, supTop: sup.top, glyphTop: glyph.top };
  });
  expect(lone.supTop).toBeLessThan(lone.signTop);
  // Bound top == glyph ink top (same place `\int`'s template puts it).
  expect(Math.abs(lone.supTop - lone.glyphTop)).toBeLessThan(6);

  // Same position the bound takes when a lower bound is present too.
  await setValue(mf, '\\iint_{a}^{b}');
  const two = await mf.evaluate((el) => {
    const sup = el
      .querySelector('.mq-int ~ .mq-supsub .mq-sup')!
      .getBoundingClientRect();
    return { supTop: sup.top };
  });
  expect(Math.abs(lone.supTop - two.supTop)).toBeLessThan(6);
});
