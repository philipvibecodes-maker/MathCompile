import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clearFirstCell, sharedPage, resetApp } from './helpers';

// Residual browser-only parser coverage — every parse/round-trip/typed-
// insertion assert moved to src/editor/mq-parseronly.test.ts. What stays
// is the computed-style pin that needs a real webfont stack.

let page: Page;
test.beforeAll(async ({ browser }, testInfo) => {
  page = await sharedPage(browser, testInfo);
});

test.beforeEach(async () => {
  await resetApp(page);
  const mf = page.locator('math-field').first();
  await mf.click();
  await mf.focus();
  await clearFirstCell(page);
});

test('typed \\mathcal{A} renders the KaTeX_Caligraphic webfont', async () => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\mathcal{A}', { delay: 60 });
  const cal = mf.locator('.mq-editable-field > .mq-root-block .mq-caligraphic');
  await expect(cal).toHaveCount(1);
  await expect(cal).toHaveCSS('font-family', /KaTeX_Caligraphic/);
});
