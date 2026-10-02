import type { Page } from '@playwright/test';

// The app boots with a seeded first cell; specs that drive cell content
// start from a cleared field (select-all + backspace inside MQ).
export const SEEDED_LATEX = '2^{n}=\\sum_{i=0}^{n}\\binom{n}{i}';

export const clearFirstCell = async (page: Page) => {
  const mf = page.locator('math-field').first();
  await mf.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
};
