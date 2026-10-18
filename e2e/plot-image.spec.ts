import { expect, test } from '@playwright/test';

// `\text{plot}` of an ℝ²→ℝ² map draws ONE plotly figure with two
// views behind the 'mode' updatemenu — 'field' (visible by default)
// and 'image' (hidden until selected). This spec pins the image
// view's payload: the checkbox-owned filled input square
// ('input square'), the filled mapped boundary ('image of square'),
// and the images of the horizontal grid lines ('image of y = k')
// all exist but start invisible, and
// the 'image' button carries the relayout arg reframing the axes
// onto the drawn curves.
//
// Serial with the calculator spec's rationale — a real Pyodide boot.
test.describe.configure({ mode: 'serial' });

test('ℝ²→ℝ² plot hides its image-of-grid traces behind the image mode', async ({
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
            '\\text{plot} \\begin{pmatrix} -y \\\\ x \\end{pmatrix}',
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
  const plot = page.locator('.js-plotly-plot');
  await expect(plot).toBeVisible({ timeout: 60_000 });

  const info = await plot.first().evaluate((el) => {
    const gd = el as unknown as {
      data: { name?: string; visible?: boolean | string }[];
      layout: {
        updatemenus?: {
          buttons: { label: string; args?: unknown[] }[];
        }[];
      };
    };
    return {
      traces: gd.data.map((t) => ({ name: t.name, visible: t.visible })),
      buttons: (gd.layout.updatemenus ?? []).flatMap((m) =>
        m.buttons.map((b) => ({ label: b.label, rel: b.args?.[1] })),
      ),
    };
  });
  const byName = new Map(info.traces.map((t) => [t.name, t.visible]));
  for (const name of [
    'input square',
    'image of square',
    'image of y = k',
  ]) {
    expect(byName.get(name)).toBe(false);
  }
  expect(byName.has('image of x = k')).toBe(false);
  const labels = info.buttons.map((b) => b.label);
  expect(labels).toEqual(['field', 'image']);
  const imageRel = info.buttons[1].rel as Record<string, unknown>;
  // 'xaxis.range' is one literal key — array form, or the '.' would
  // read as a nested path.
  expect(imageRel).toHaveProperty(['xaxis.range']);
  expect(imageRel).toHaveProperty(['yaxis.range']);
  // The image mode annotates which input was mapped.
  const anns = imageRel.annotations as { text?: string }[];
  expect(anns[0]?.text).toContain('square');

  // Click the 'image' mode through the updatemenu DOM (plotly draws
  // menus as SVG <g> groups: header opens, options are <g
  // class='updatemenu-dropdown-button'>) — the img traces flip visible.
  const header = plot.locator('.updatemenu-header-group');
  await header.click({ force: true });
  const item = plot.locator('.updatemenu-dropdown-button', {
    hasText: 'image',
  });
  await expect(item).toBeVisible({ timeout: 10_000 });
  await item.click();
  const traceVis = async (name: string) =>
    plot.first().evaluate((el, n) => {
      const g = el as unknown as {
        data: { name?: string; visible?: boolean | string }[];
      };
      return g.data.filter((t) => t.name === n).map((t) => t.visible)[0];
    }, name);
  await expect.poll(() => traceVis('image of y = k')).toBe(true);
  // The input square stays hidden — it's the checkbox's trace, not
  // the mode menu's.
  await expect.poll(() => traceVis('input square')).toBe(false);
  // …and the input-square annotation lands with it, plus the legend.
  await expect(plot.locator('.annotation')).toContainText('input');
  await expect(plot.locator('.legend')).toContainText('image of square');
  await expect(plot.locator('.legend')).toContainText('image of y = k');

  // The 'input' checkbox reveals the input square; switching modes
  // can't clear it (the menu's vis lists don't own it).
  const inputToggle = page.locator('.plot-input-toggle input');
  await expect(inputToggle).toBeVisible();
  await inputToggle.check();
  await expect.poll(() => traceVis('input square')).toBe(true);
  const header2 = plot.locator('.updatemenu-header-group');
  await header2.click({ force: true });
  await plot
    .locator('.updatemenu-dropdown-button', { hasText: 'field' })
    .click();
  await expect.poll(() => traceVis('image of y = k')).toBe(false);
  await expect.poll(() => traceVis('input square')).toBe(true);
  await inputToggle.uncheck();
  await expect.poll(() => traceVis('input square')).toBe(false);
  await header2.click({ force: true });
  await plot
    .locator('.updatemenu-dropdown-button', { hasText: 'image' })
    .click();
  await expect.poll(() => traceVis('image of y = k')).toBe(true);

  // Editing the cell regenerates the figure — the mode selection must
  // survive the payload swap (the component re-applies the captured
  // active button's args to the incoming figure).
  await page.evaluate(() => {
    const mc = (
      window as unknown as {
        __mc: {
          store: { setLatex(id: number, latex: string): void };
        };
      }
    ).__mc;
    // The canonical keystroke write path — updates the cell latex and
    // re-triggers evaluation.
    mc.store.setLatex(
      1,
      '\\text{plot} \\begin{pmatrix} -y \\\\ x+y \\end{pmatrix}',
    );
  });
  // Wait for the regenerated figure to land: the first quiver arrow's
  // v-component flips from -3 (old map's x) to -6 (new map's x+y at
  // the (-3,-3) grid corner).
  const fieldV0 = () =>
    plot.first().evaluate((el) => {
      const g = el as unknown as {
        data: { name?: string; v?: number[] }[];
      };
      return g.data.find((t) => t.name === 'field')?.v?.[0];
    });
  await expect.poll(fieldV0, { timeout: 60_000 }).toBe(-6);
  // …with 'image' still selected.
  await expect
    .poll(() => traceVis('image of y = k'), { timeout: 60_000 })
    .toBe(true);
  await expect(plot.locator('.annotation')).toContainText('input');
});
