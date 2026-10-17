import { expect, test } from '@playwright/test';

// `\text{plot}` of an ℝ²→ℝ² map draws ONE plotly figure with two
// views behind the 'mode' updatemenu — 'field' (visible by default)
// and 'image' (hidden until selected). This spec pins the image
// view's payload: the dimmed source grid ('img-src') and the images
// of the vertical ('img-x') and horizontal ('img-y') grid lines all
// exist but start invisible, and the 'image' button carries the
// relayout arg reframing the axes onto the drawn curves.
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
  for (const name of ['img-src', 'img-x', 'img-y']) {
    expect(byName.get(name)).toBe(false);
  }
  const labels = info.buttons.map((b) => b.label);
  expect(labels).toEqual(['field', 'image']);
  const imageRel = info.buttons[1].rel as Record<string, unknown>;
  // 'xaxis.range' is one literal key — array form, or the '.' would
  // read as a nested path.
  expect(imageRel).toHaveProperty(['xaxis.range']);
  expect(imageRel).toHaveProperty(['yaxis.range']);
  // The image mode annotates which input grid was mapped.
  const anns = imageRel.annotations as { text?: string }[];
  expect(anns[0]?.text).toContain('input grid');

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
  await expect
    .poll(async () => {
      const vis = await plot.first().evaluate((el) => {
        const g = el as unknown as {
          data: { name?: string; visible?: boolean | string }[];
        };
        return g.data
          .filter((t) => t.name === 'img-x')
          .map((t) => t.visible)[0];
      });
      return vis;
    })
    .toBe(true);
  // …and the input-grid annotation lands with it.
  await expect(plot.locator('.annotation')).toContainText('input grid');
});
