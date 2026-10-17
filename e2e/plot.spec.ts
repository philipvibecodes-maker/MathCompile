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

  // Cartesian drags pan.
  const dragmode = await page.evaluate(
    () =>
      (
        document.querySelector('.js-plotly-plot') as unknown as {
          layout?: { dragmode?: string };
        }
      )?.layout?.dragmode,
  );
  expect(dragmode).toBe('pan');
});

test('R²→R³ plot renders a parametric surface over the unit square', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      'mathcompile-prefs',
      JSON.stringify({ target: 'calculator' }),
    );
    localStorage.setItem(
      'mathcompile-cells',
      JSON.stringify([
        {
          id: 1,
          latex:
            '\\text{plot} \\begin{pmatrix} u \\cos v \\\\ u \\sin v \\\\ v \\end{pmatrix}',
        },
      ]),
    );
  });
  await page.goto('/');
  await page.waitForSelector('math-field');

  // Interim: ECharts draws the CE-sampled surface while SymPy boots.
  await expect(page.locator('.plot-interim canvas')).toBeVisible({
    timeout: 60_000,
  });

  // SymPy lands — the plotly figure owns the row, no error lines.
  await expect(page.locator('.engine-chip-text')).toContainText(
    'SymPy ready',
    { timeout: 120_000 },
  );
  await expect(page.locator('.js-plotly-plot')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('.plot-interim')).toHaveCount(0);
  await expect(page.locator('.issue-error')).toHaveCount(0);

  // The surface trace is parametric: x/y/z are 80×80 component grids
  // (a heightfield surface would carry 1-D axis vectors — plotly.py
  // serializes numpy arrays as {dtype, bdata, shape}). The samples are
  // the image of the unit square — u=1, v=1 gives x = cos(1).
  const surf = await page.evaluate(() => {
    const gd = document.querySelector('.js-plotly-plot') as unknown as {
      data?: {
        type?: string;
        name?: string;
        x?: { dtype?: string; bdata?: string; shape?: number[] };
      }[];
    } | null;
    const t = gd?.data?.find((tr) => tr.name === 'surf');
    const x = t?.x;
    let corner: number | undefined;
    if (x?.bdata && x?.dtype === 'f8') {
      const bytes = Uint8Array.from(atob(x.bdata), (ch) =>
        ch.charCodeAt(0),
      );
      const flat = new Float64Array(bytes.buffer);
      corner = flat[flat.length - 1];
    }
    return { type: t?.type, shape: x?.shape, corner };
  });
  expect(surf.type).toBe('surface');
  // plotly.js keeps the numpy payload's shape as "rows, cols".
  expect(String(surf.shape)).toMatch(/^80,\s*80$/);
  expect(surf.corner).toBeCloseTo(Math.cos(1), 5);

  // 3-D drags rotate the camera turntable-style — the cartesian 'pan'
  // default would otherwise inherit into the scene.
  const sceneDrag = await page.evaluate(
    () =>
      (
        document.querySelector('.js-plotly-plot') as unknown as {
          layout?: { scene?: { dragmode?: string } };
        }
      )?.layout?.scene?.dragmode,
  );
  expect(sceneDrag).toBe('turntable');
});

test('a \\text{for} domain sets the sampled window', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      'mathcompile-prefs',
      JSON.stringify({ target: 'calculator' }),
    );
    localStorage.setItem(
      'mathcompile-cells',
      JSON.stringify([
        {
          id: 1,
          latex: '\\text{plot} x^2 \\text{ for } x \\in (0, 5)',
        },
      ]),
    );
  });
  await page.goto('/');
  await page.waitForSelector('math-field');

  await expect(page.locator('.engine-chip-text')).toContainText(
    'SymPy ready',
    { timeout: 120_000 },
  );
  await expect(page.locator('.js-plotly-plot')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('.issue-error')).toHaveCount(0);

  // The scatter's x samples run 0→5, not the default -10→10.
  const trace = await page.evaluate(() => {
    const gd = document.querySelector('.js-plotly-plot') as unknown as {
      data?: {
        type?: string;
        x?: number[] | { dtype?: string; bdata?: string };
      }[];
    } | null;
    const x = gd?.data?.find((tr) => tr.type === 'scatter')?.x;
    if (Array.isArray(x)) return { first: x[0], last: x[x.length - 1] };
    if (x?.bdata && x?.dtype === 'f8') {
      const bytes = Uint8Array.from(atob(x.bdata), (ch) =>
        ch.charCodeAt(0),
      );
      const flat = new Float64Array(bytes.buffer);
      return { first: flat[0], last: flat[flat.length - 1] };
    }
    return {};
  });
  expect(trace.first).toBeCloseTo(0, 5);
  expect(trace.last).toBeCloseTo(5, 5);
});
