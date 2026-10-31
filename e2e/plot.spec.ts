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

test('R²→R³ plot renders a parametric surface over the 3-D window', async ({
  page,
}) => {
  test.setTimeout(180_000);
  // echarts-gl's interim surface and plotly's `surface` trace both draw
  // through WebGL — headless Chromium without GPU/SwiftShader shows
  // "WebGL is not supported" in place of the canvas, so skip there.
  const hasWebGL = await page.evaluate(() => {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  });
  test.skip(
    !hasWebGL,
    'the 3-D interim and the plotly surface trace need WebGL — unavailable in this browser',
  );
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
  // the image of the default 3-D window [-3,3]² — u=3, v=3 gives
  // x = 3cos(3).
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
  expect(surf.corner).toBeCloseTo(3 * Math.cos(3), 5);

  // The helicoid's grid curves hold u or v constant in the input plane.
  // Fixed output x/y contours fail this check on the curved u=const lines.
  const grid = await page.evaluate(() => {
    const gd = document.querySelector('.js-plotly-plot') as unknown as {
      data: { name?: string; x: (number | null)[]; y: (number | null)[];
        z: (number | null)[]; contours?: { x?: { show?: boolean }; y?: { show?: boolean } } }[];
    };
    const surface = gd.data.find((t) => t.name === 'surf');
    const curves = gd.data.filter((t) => t.name === 'iso');
    const spreads = curves.map((t, axis) => {
      let values: number[] = [];
      const spans: number[] = [];
      for (let i = 0; i < t.x.length; i++) {
        if (t.x[i] == null) {
          if (values.length) spans.push(Math.max(...values) - Math.min(...values));
          values = [];
        } else {
          const z = t.z[i]!;
          values.push(axis === 0 ? t.x[i]! * Math.cos(z) + t.y[i]! * Math.sin(z) : z);
        }
      }
      return Math.max(...spans);
    });
    return { contours: surface?.contours, count: curves.length, spreads };
  });
  expect(grid.contours?.x?.show).toBe(false);
  expect(grid.contours?.y?.show).toBe(false);
  expect(grid.count).toBe(2);
  for (const span of grid.spreads) expect(span).toBeLessThan(1e-9);

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

  // Orbit the camera, then wheel-zoom — twice. Each zoom must keep
  // the dragged orientation: drags only mutate the live
  // orbit-camera-controller (`_scene.camera`), while the `layout` and
  // `_fullLayout` camera specs go stale or get detached by relayouts,
  // so a wheel handler reading either one snaps back to an older view.
  interface CamLike {
    eye: number[];
    center?: number[];
  }
  const eyeOf = () =>
    page.evaluate(() => {
      const cam = (
        document.querySelector('.js-plotly-plot') as unknown as {
          _fullLayout?: {
            scene?: {
              _scene?: { camera?: { eye?: number[]; center?: number[] } };
            };
          };
        }
      )?._fullLayout?.scene?._scene?.camera;
      return cam?.eye
        ? {
            eye: [...cam.eye],
            center: cam.center ? [...cam.center] : undefined,
          }
        : null;
    });
  const spec = await page.evaluate(
    () =>
      (
        document.querySelector('.js-plotly-plot') as unknown as {
          layout?: {
            scene?: { camera?: { eye?: { x: number; y: number; z: number } } };
          };
        }
      )?.layout?.scene?.camera?.eye,
  );
  const plot = page.locator('.js-plotly-plot').first();
  const box = await plot.boundingBox();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  const orbit = async (dx: number, dy: number) => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Few steps — each synthesized move costs a full software-GL
    // surface re-render (~seconds under load), and one step already
    // registers the orbit.
    await page.mouse.move(cx + dx, cy + dy, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  const dirOf = (c: CamLike) => {
    const d = [
      c.eye[0] - (c.center?.[0] ?? 0),
      c.eye[1] - (c.center?.[1] ?? 0),
      c.eye[2] - (c.center?.[2] ?? 0),
    ];
    const m = Math.hypot(d[0], d[1], d[2]) || 1;
    return d.map((n) => n / m);
  };
  const angle = (a: number[], b: number[]) =>
    Math.acos(
      Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])),
    );
  const specDir = spec
    ? dirOf({ eye: [spec.x, spec.y, spec.z], center: [0, 0, 0] })
    : null;

  for (const [dx, dy] of [
    [120, 60],
    [-110, -70],
  ]) {
    const before = await eyeOf();
    await orbit(dx, dy);
    const dragged = await eyeOf();
    expect(dragged).toBeTruthy();
    // The drag actually orbited.
    expect(angle(dirOf(dragged!), dirOf(before!))).toBeGreaterThan(0.3);

    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(300);
    const zoomed = await eyeOf();
    expect(zoomed).toBeTruthy();
    // Zoom-to-cursor shifts center too, so a small tilt is fine —
    // snapping back to an earlier view is not.
    expect(angle(dirOf(zoomed!), dirOf(dragged!))).toBeLessThan(0.5);
  }

  // "Reset camera to last save" lands on the shipped spec framing,
  // not plotly's stock (1.25,1.25,1.25) camera — `viewInitial` is
  // captured at scene creation, which happens on the unspecced
  // interim frame.
  await page
        .locator('.modebar-btn[data-title="Reset camera to last save"]')
        .first()
        .dispatchEvent('click');
  await page.waitForTimeout(600);
  const homed = await eyeOf();
  expect(homed).toBeTruthy();
  expect(angle(dirOf(homed!), specDir!)).toBeLessThan(0.15);
});

test('a \\text{for} domain sets the sampled window', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      'mathcompile-prefs',
      // pair-matrix mode lowers the (u,v) membership lhs of the
      // second cell to a row Matrix — the domain reader must handle
      // that shape too.
      JSON.stringify({ target: 'calculator', pairTuple: 'matrix' }),
    );
    localStorage.setItem(
      'mathcompile-cells',
      JSON.stringify([
        {
          id: 1,
          // Square brackets — under pair-matrix mode (0,5) is a 1×2
          // matrix (finite-set membership), not an interval.
          latex: '\\text{plot} x^2 \\text{ for } x \\in [0, 5]',
        },
        // `(u,v,1) for (u,v) ∈ [0,1]×[0,2π]` — the constant component
        // crashed the worker's np.asarray on the inhomogeneous
        // lambdify list, and the product-domain parse gave no bounds.
        {
          id: 2,
          latex:
            '\\text{plot} \\left(u,v,1\\right) \\text{ for }' +
            ' \\left(u,v\\right) \\in \\left[0,1\\right]' +
            ' \\times \\left[0,2\\pi\\right]',
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
  await expect(page.locator('.js-plotly-plot').first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('.js-plotly-plot')).toHaveCount(2);
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

  // Second row: the constant component broadcasts (z ≡ 1) and the
  // product domain samples u over [0,1], v over [0,2π].
  const flat = await page.evaluate(() => {
    const gd = document.querySelectorAll('.js-plotly-plot')[1] as unknown as {
      data?: {
        name?: string;
        x?: { dtype?: string; bdata?: string };
        y?: { dtype?: string; bdata?: string };
        z?: { dtype?: string; bdata?: string };
      }[];
    } | null;
    const t = gd?.data?.find((tr) => tr.name === 'surf');
    const dec = (a?: { dtype?: string; bdata?: string }) =>
      a?.bdata && a.dtype === 'f8'
        ? new Float64Array(
            Uint8Array.from(atob(a.bdata), (ch) => ch.charCodeAt(0))
              .buffer,
          )
        : null;
    const x = dec(t?.x);
    const y = dec(t?.y);
    const z = dec(t?.z);
    return {
      xFirst: x?.[0],
      xLast: x?.[x.length - 1],
      yLast: y?.[y.length - 1],
      zFirst: z?.[0],
      zLast: z?.[z.length - 1],
    };
  });
  expect(flat.xFirst).toBeCloseTo(0, 5);
  expect(flat.xLast).toBeCloseTo(1, 5);
  expect(flat.yLast).toBeCloseTo(2 * Math.PI, 5);
  expect(flat.zFirst).toBeCloseTo(1, 5);
  expect(flat.zLast).toBeCloseTo(1, 5);
});
