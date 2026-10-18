import { expect, test } from '@playwright/test';

// ℝ²→ℝ² `\text{plot}` rows get a CE-sampled quiver field while SymPy
// boots (the interim 'field' trace through ECharts), then the worker's
// real plotly figure: one figure with 'field' (default) and 'image'
// modes behind the mode menu. This spec pins the interim coverage and
// the landed figure's trace/menu shape.
//
// Serial with the calculator spec's rationale — a real Pyodide boot.
test.describe.configure({ mode: 'serial' });

test('R2->R2 plot cell renders interim field, then a two-mode plotly figure', async ({
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
      JSON.stringify([
        { id: 1, latex: '\\text{plot} \\begin{pmatrix} -y \\\\ x \\end{pmatrix}' },
      ]),
    );
  });
  await page.goto('/');
  await page.waitForSelector('math-field');

  // Interim: the ECharts canvas draws the CE-sampled field trace while
  // the engine still boots.
  await expect(page.locator('.plot-interim canvas')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('.engine-chip-text')).toContainText('loading');

  // SymPy lands: the real plotly figure owns the row.
  await expect(page.locator('.engine-chip-text')).toContainText(
    'SymPy ready',
    { timeout: 120_000 },
  );
  await expect(page.locator('.js-plotly-plot')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('.plot-interim')).toHaveCount(0);

  // The landed figure carries the native 'field' quiver trace and the
  // mode menu with 'field' + 'image' buttons.
  const figure = await page.evaluate(() => {
    const gd = document.querySelector('.js-plotly-plot') as
      | { data?: { type?: string; mode?: string; name?: string }[];
          layout?: { updatemenus?: { buttons?: { label?: string; args?: unknown[] }[] }[] } }
      | null;
    return {
      traces: (gd?.data ?? []).map((t) => ({
        type: t.type,
        mode: t.mode,
        name: t.name,
      })),
      buttons: (gd?.layout?.updatemenus ?? [])
        .flatMap((m) => m.buttons ?? [])
        .map((b) => ({ label: b.label, args: b.args })),
    };
  });
  const field = figure.traces.find((t) => t.name === 'field');
  expect(field?.type).toBe('quiver');
  const labels = figure.buttons.map((b) => b.label);
  expect(labels).toContain('field');
  expect(labels).toContain('image');

  // The image button reveals the image-of-grid traces when selected —
  // assert on the button's update args rather than clicking the plotly
  // menu DOM.
  const imageButton = figure.buttons.find((b) => b.label === 'image');
  const visArg = (imageButton?.args?.[0] ?? {}) as { visible?: unknown[] };
  const names = figure.traces.map((t) => t.name);
  const imgIndexes = names
    .map((n, i) =>
      typeof n === 'string' && n.startsWith('image of') ? i : -1,
    )
    .filter((i) => i >= 0);
  expect(imgIndexes.length).toBeGreaterThan(0);
  expect(Array.isArray(visArg.visible)).toBe(true);
  for (const i of imgIndexes) {
    expect(visArg.visible?.[i]).toBe(true);
  }
});
