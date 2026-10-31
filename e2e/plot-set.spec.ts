import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { sharedPage, resetApp } from './helpers';

let page: Page;
test.beforeAll(async ({ browser }, info) => { page = await sharedPage(browser, info); });
test.beforeEach(async () => resetApp(page));
test.afterAll(async () => page?.close());

for (const [label, latex, type, dim] of [
  ['2D points', String.raw`\text{plot} \{(1,2),(3,4)\}`, 'scatter', 2],
  ['3D points', String.raw`\text{plot} \{(1,2,3),(4,5,6)\}`, 'scatter3d', 3],
  ['disk', String.raw`\text{plot} \{(x,y): x^2+y^2<1\}`, 'scatter', 2],
  ['implicit disk', String.raw`\text{plot} x^2+y^2<1`, 'scatter', 2],
  ['circle', String.raw`\text{plot} \{(x,y): x^2+y^2=1\}`, 'contour', 2],
  ['ball', String.raw`\text{plot} \{(x,y,z): x^2+y^2+z^2<1\}`, 'scatter3d', 3],
  ['sphere', String.raw`\text{plot} \{(x,y,z): x^2+y^2+z^2=1\}`, 'isosurface', 3],
] as const) {
  test(`plots ${label}`, async () => {
    test.setTimeout(180_000);
    await page.evaluate((value) => {
      const { store } = (window as unknown as { __mc: { store: import('../src/state/store.svelte').AppStore } }).__mc;
      store.setLatex(store.cells[0].id, value);
      store.target = 'calculator';
    }, latex);
    await expect(page.locator('.engine-chip-text')).toContainText('SymPy ready', { timeout: 120_000 });
    await expect(page.locator('.js-plotly-plot')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => {
      const gd = document.querySelector('.js-plotly-plot') as unknown as { data?: { type?: string }[] };
      return gd?.data?.[0]?.type;
    }), { timeout: 30_000 }).toBe(type);
    await expect(page.locator('.calc-error')).toHaveCount(0);
    const trace = await page.evaluate(() => {
      const gd = document.querySelector('.js-plotly-plot') as unknown as { data: Record<string, unknown>[] };
      return gd.data[0];
    });
    if (type.startsWith('scatter')) {
      expect(trace.mode).toBe('markers');
      const xs = trace.x as number[];
      expect(xs.length).toBeGreaterThan(0);
      if (label.endsWith('points')) expect(xs).toEqual([1, dim === 2 ? 3 : 4]);
      else expect(xs.every(x => Math.abs(x) < 1)).toBe(true);
    }
  });
}
