import { expect, test } from '@playwright/test';

// `\text{plot}` rows get an ECharts-drawn figure while SymPy/Pyodide
// boots — the interim row carries a real PlotData payload sampled by
// Compute Engine, and PlotView overlays an ECharts render until
// plotly.js's first frame lands. This spec pins both handoffs:
//   estimate-plot (echarts, engine loading) -> plotly figure (ready)
//
// Serial with the calculator spec's rationale — a real Pyodide boot.
test.describe.configure({ mode: 'serial' });

test('plot cell renders an interim echarts figure while SymPy boots', async ({
  page,
}) => {
  test.setTimeout(180_000);
  // Seed the worksheet before first load so the plot cell is already
  // evaluating during the one-time boot window (typing after load can
  // miss it on a warm cache).
  await page.addInitScript(() => {
    localStorage.setItem(
      'mathcompile-prefs',
      JSON.stringify({ target: 'calculator' }),
    );
    localStorage.setItem(
      'mathcompile-cells',
      JSON.stringify([{ id: 1, latex: '\\text{plot} x^{2}' }]),
    );
  });
  await page.goto('/');
  await page.waitForSelector('math-field');

  // Interim: the ECharts canvas draws inside .plot-interim while the
  // engine chip still says loading, and the row is tagged an estimate.
  await expect(page.locator('.plot-interim canvas')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('.engine-chip-text')).toContainText('loading');
  await expect(page.locator('.calc-interim')).toContainText('estimate');

  // SymPy lands: the interim overlay unmounts once plotly's first
  // afterplot fires, and the real figure owns the row.
  await expect(page.locator('.engine-chip-text')).toContainText(
    'SymPy ready',
    { timeout: 120_000 },
  );
  await expect(page.locator('.js-plotly-plot')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('.plot-interim')).toHaveCount(0);
  await expect(page.locator('.calc-interim')).toHaveCount(0);
});
