// Sampled plot payload → plotly figure spec. Pure data transforms — no
// plotly import here so unit tests and the component share the same
// builders and plotly stays lazy-loaded in PlotView.
import type { PlotData } from './types';

export interface PlotFigure {
  traces: Record<string, unknown>[];
  layout: Record<string, unknown>;
}

const AXIS = {
  zeroline: true,
  zerolinecolor: '#888',
  gridcolor: 'rgba(128,128,128,0.2)',
};
const MARGIN = { l: 40, r: 10, t: 30, b: 40 };

const flat = (g: (number | null)[][]): (number | null)[] =>
  g.reduce((a, r) => a.concat(r), []);

const clean = (v: number | null | undefined): number =>
  v === null || v === undefined || !Number.isFinite(v) ? 0 : v;

// Per-row magnitude grid of the vector components fx, fy[, fz].
function magnitudes(plot: PlotData): number[][] {
  const fx = plot.data.fx ?? [];
  const fy = plot.data.fy ?? [];
  const fz = plot.data.fz;
  return fx.map((row, i) =>
    row.map((x, j) => Math.hypot(clean(x), clean(fy[i]?.[j]), clean(fz?.[i]?.[j]))),
  );
}

function figure1x1(plot: PlotData): PlotFigure {
  return {
    traces: [
      {
        type: 'scatter',
        mode: 'lines',
        x: plot.data.x,
        y: plot.data.y,
        line: { color: '#3b82f6', width: 2 },
      },
    ],
    layout: { xaxis: AXIS, yaxis: AXIS, margin: MARGIN, showlegend: false },
  };
}

function figure1x2(plot: PlotData): PlotFigure {
  return {
    traces: [
      {
        type: 'scatter',
        mode: 'lines',
        x: plot.data.x,
        y: plot.data.y,
        line: { color: '#3b82f6', width: 2 },
      },
    ],
    layout: {
      xaxis: AXIS,
      yaxis: { ...AXIS, scaleanchor: 'x' },
      margin: MARGIN,
      showlegend: false,
    },
  };
}

function figure1x3(plot: PlotData): PlotFigure {
  return {
    traces: [
      {
        type: 'scatter3d',
        mode: 'lines',
        x: plot.data.x,
        y: plot.data.y,
        z: plot.data.z,
        line: { color: '#3b82f6', width: 4 },
      },
    ],
    layout: { margin: MARGIN, showlegend: false },
  };
}

function figure2x1(plot: PlotData): PlotFigure {
  const x = plot.data.x ?? [];
  const y = plot.data.y ?? [];
  const z = plot.data.z ?? [];
  return {
    traces: [
      {
        type: 'surface',
        x,
        y,
        z,
        colorscale: 'Viridis',
        showscale: false,
        contours: {
          z: { show: true, usecolormap: true, project: { z: true } },
        },
      },
      // A top-down heatmap on the same grid reads the z-signature
      // through peaks/poles where the surface self-occludes.
      {
        type: 'heatmap',
        x,
        y,
        z,
        colorscale: 'Viridis',
        showscale: false,
        visible: false,
      },
    ],
    layout: {
      margin: MARGIN,
      showlegend: false,
      updatemenus: [
        {
          buttons: [
            {
              label: 'surface',
              method: 'update',
              args: [{ visible: [true, false] }],
            },
            {
              label: 'heatmap',
              method: 'update',
              args: [{ visible: [false, true] }],
            },
          ],
          direction: 'down',
          x: 0,
          y: 1.12,
        },
      ],
    },
  };
}

// Arrowhead size follows the 2D cone's span so heads stay proportional.
const CONE_SCALE = 0.4;

function quiver2x2(plot: PlotData, stride: number): PlotFigure {
  const u = (plot.data.u ?? []).filter((v): v is number => v !== null);
  const v = (plot.data.v ?? []).filter((x): x is number => x !== null);
  const fx = plot.data.fx ?? [];
  const fy = plot.data.fy ?? [];
  const mag = magnitudes(plot);
  const span = Math.max(
    Math.abs(u[0]! - u[u.length - 1]!),
    Math.abs(v[0]! - v[v.length - 1]!),
    1e-9,
  );
  const span3 = Math.hypot(
    u[u.length - 1]! - u[0]!,
    v[v.length - 1]! - v[0]!,
    1e-9,
  );
  const xs: (number | null)[] = [];
  const ys: (number | null)[] = [];
  const cs: number[] = [];
  const vx: number[] = [];
  const vy: number[] = [];
  const vz: number[] = [];
  const cx: number[] = [];
  const cy: number[] = [];
  const at = (i: number, j: number) => {
    const ux = u[j]!;
    const uy = v[i]!;
    const fxx = clean(fx[i]?.[j]);
    const fyy = clean(fy[i]?.[j]);
    xs.push(ux, ux + fxx, null);
    ys.push(uy, uy + fyy, null);
    cs.push(mag[i]![j]!);
    vx.push(fxx);
    vy.push(fyy);
    vz.push(0);
    cx.push(ux + fxx);
    cy.push(uy + fyy);
  };
  for (let i = 0; i < v.length; i += stride)
    for (let j = 0; j < u.length; j += stride) at(i, j);
  return {
    traces: [
      // The vectors in the (x, y) image plane — tails are the sampled
      // (u, v) inputs plus the head cones anchored at the arrow tips.
      {
        type: 'scatter',
        mode: 'lines',
        x: xs,
        y: ys,
        line: { color: '#3b82f6', width: 1 },
        hoverinfo: 'skip',
      },
      {
        type: 'cone',
        x: cx,
        y: cy,
        z: cs.map(() => 0),
        u: vx,
        v: vy,
        w: vz,
        colorscale: 'Viridis',
        sizemode: 'absolute',
        sizeref: span3 * CONE_SCALE,
        anchor: 'tail',
        showscale: false,
        scene: 'scene2',
      },
      {
        type: 'heatmap',
        x: u,
        y: v,
        z: mag,
        colorscale: 'Viridis',
        showscale: false,
        visible: false,
      },
    ],
    layout: {
      margin: MARGIN,
      showlegend: false,
      xaxis: AXIS,
      yaxis: { ...AXIS, scaleanchor: 'x' },
      scene2: {
        domain: { x: [0, 1], y: [0, 1] },
        camera: { eye: { x: 0, y: 0, z: 1.6 } },
        xaxis: { range: [u[0]! - span * 0.1, u[u.length - 1]! + span * 0.1], visible: false },
        yaxis: { range: [v[0]! - span * 0.1, v[v.length - 1]! + span * 0.1], visible: false },
        zaxis: { range: [-0.5, 0.5], visible: false },
      },
      updatemenus: [
        {
          buttons: [
            { label: 'quiver', method: 'update', args: [{ visible: [true, true, false] }] },
            { label: 'magnitude heatmap', method: 'update', args: [{ visible: [false, false, true] }] },
          ],
          direction: 'down',
          x: 0,
          y: 1.12,
        },
      ],
    },
  };
}

// One RK4 step of the field (fx, fy) — the components are looked up by
// bilinear interpolation on the sampled grid.
function streamlines2x2(plot: PlotData): PlotFigure {
  const u = (plot.data.u ?? []).filter((v): v is number => v !== null);
  const v = (plot.data.v ?? []).filter((x): x is number => x !== null);
  const fx = plot.data.fx ?? [];
  const fy = plot.data.fy ?? [];
  const du = (u[u.length - 1]! - u[0]!) / (u.length - 1 || 1);
  const dv = (v[v.length - 1]! - v[0]!) / (v.length - 1 || 1);
  const nu = u.length;
  const nv = v.length;
  const field = (x: number, y: number): [number, number] => {
    // Bilinear sample of the component grids at (x, y); out of range
    // reads as zero so a streamline dies at the domain edge.
    const iu = (x - u[0]!) / du;
    const iv = (y - v[0]!) / dv;
    const j0 = Math.floor(iu);
    const i0 = Math.floor(iv);
    if (j0 < 0 || i0 < 0 || j0 + 1 >= nu || i0 + 1 >= nv) return [0, 0];
    const a = iu - j0;
    const b = iv - i0;
    const at = (g: (number | null)[][]) =>
      clean(g[i0]![j0]) * (1 - a) * (1 - b) +
      clean(g[i0]![j0 + 1]) * a * (1 - b) +
      clean(g[i0 + 1]![j0]) * (1 - a) * b +
      clean(g[i0 + 1]![j0 + 1]) * a * b;
    return [at(fx), at(fy)];
  };
  const step = Math.min(du, dv) * 0.5;
  const xs: (number | null)[] = [];
  const ys: (number | null)[] = [];
  // Seeds: every grid node, coarsened — cheap coverage, duplicates are
  // invisible since every seed traces the same orbit.
  for (let i = 0; i < nv; i += 3) {
    for (let j = 0; j < nu; j += 3) {
      let x = u[j]!;
      let y = v[i]!;
      xs.push(x);
      ys.push(y);
      for (let s = 0; s < 120; s++) {
        const [k1x, k1y] = field(x, y);
        const [k2x, k2y] = field(x + k1x * step * 0.5, y + k1y * step * 0.5);
        const [k3x, k3y] = field(x + k2x * step * 0.5, y + k2y * step * 0.5);
        const [k4x, k4y] = field(x + k3x * step, y + k3y * step);
        x += (step / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
        y += (step / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) break;
        if (Math.hypot(k1x, k1y) < 1e-4) break;
        xs.push(x);
        ys.push(y);
      }
      xs.push(null);
      ys.push(null);
    }
  }
  return {
    traces: [
      {
        type: 'scatter',
        mode: 'lines',
        x: xs,
        y: ys,
        line: { color: '#3b82f6', width: 1 },
        hoverinfo: 'skip',
      },
      // Coordinate lines in the (x, y) image plane: fixed-u and fixed-v
      // curves drawn through f — the deformation of a grid is the most
      // direct picture of a map ℝ²→ℝ².
      ...gridImage2x2(plot),
    ],
    layout: {
      margin: MARGIN,
      showlegend: false,
      xaxis: AXIS,
      yaxis: { ...AXIS, scaleanchor: 'x' },
      updatemenus: [
        {
          buttons: [
            { label: 'streamlines', method: 'update', args: [{ visible: [true, ...gridImage2x2(plot).map(() => false)] }] },
            { label: 'image of grid', method: 'update', args: [{ visible: [false, ...gridImage2x2(plot).map(() => true)] }] },
          ],
          direction: 'down',
          x: 0,
          y: 1.12,
        },
      ],
    },
  };
}

// The coordinate-line traces used by the image-of-grid mode: for each
// fixed u (columns) and fixed v (rows), the curve (fx, fy) sampled
// along the grid — how f warps the domain's grid lines.
function gridImage2x2(plot: PlotData): Record<string, unknown>[] {
  const u = (plot.data.u ?? []).filter((v): v is number => v !== null);
  const v = (plot.data.v ?? []).filter((x): x is number => x !== null);
  const fx = plot.data.fx ?? [];
  const fy = plot.data.fy ?? [];
  const uLine = { color: 'rgba(239,68,68,0.55)', width: 1 };
  const vLine = { color: 'rgba(59,130,246,0.55)', width: 1 };
  const traces: Record<string, unknown>[] = [];
  const lineFor = (
    xs: (number | null)[],
    ys: (number | null)[],
    color: Record<string, unknown>,
  ) =>
    traces.push({
      type: 'scatter',
      mode: 'lines',
      x: xs,
      y: ys,
      line: color,
      hoverinfo: 'skip',
    });
  for (let i = 0; i < v.length; i += 2) {
    // fixed v — vary u along the row.
    lineFor(
      fx[i]!.map((x) => x),
      fy[i]!.map((y) => y),
      vLine,
    );
  }
  for (let j = 0; j < u.length; j += 2) {
    // fixed u — vary v down the column.
    lineFor(
      fx.map((r) => r[j] ?? null),
      fy.map((r) => r[j] ?? null),
      uLine,
    );
  }
  return traces;
}

function figure2x2(plot: PlotData): PlotFigure {
  const q = quiver2x2(plot, 5);
  const s = streamlines2x2(plot);
  // Fold the streamline and grid-image traces in as extra modes —
  // one figure, one mode picker.
  const streamTraces = s.traces.slice(0, 1);
  const gridTraces = s.traces.slice(1);
  const total = q.traces.length + streamTraces.length + gridTraces.length;
  const vis = (mode: number): boolean[] => {
    // mode: 0 quiver, 1 heatmap, 2 streamlines, 3 grid image.
    const out = new Array<boolean>(total).fill(false);
    if (mode === 0) {
      out[0] = true; // scatter vectors
      out[1] = true; // head cones
    } else if (mode === 1) out[2] = true; // heatmap
    else if (mode === 2) out[q.traces.length] = true;
    else
      for (let i = 0; i < gridTraces.length; i++)
        out[q.traces.length + streamTraces.length + i] = true;
    return out;
  };
  return {
    traces: [
      ...q.traces,
      { ...streamTraces[0]!, visible: false },
      ...gridTraces.map((t) => ({ ...t, visible: false })),
    ],
    layout: {
      ...q.layout,
      updatemenus: [
        {
          buttons: [
            {
              label: 'quiver',
              method: 'update',
              args: [{ visible: vis(0) }],
            },
            {
              label: 'magnitude heatmap',
              method: 'update',
              args: [{ visible: vis(1) }],
            },
            {
              label: 'streamlines',
              method: 'update',
              args: [{ visible: vis(2) }],
            },
            {
              label: 'image of grid',
              method: 'update',
              args: [{ visible: vis(3) }],
            },
          ],
          direction: 'down',
          x: 0,
          y: 1.12,
        },
      ],
    },
  };
}

function figure2x3(plot: PlotData): PlotFigure {
  const u = plot.data.u ?? [];
  const v = plot.data.v ?? [];
  const U = u.map((x) => v.map(() => x));
  const fx = plot.data.fx ?? [];
  const fy = plot.data.fy ?? [];
  const fz = plot.data.fz ?? [];
  const mag = magnitudes(plot);
  return {
    traces: [
      // The parametric surface, colored by |f| — the default view.
      {
        type: 'surface',
        x: fx,
        y: fy,
        z: fz,
        surfacecolor: mag,
        colorscale: 'Viridis',
        showscale: false,
      },
      // The same surface recolored by the u parameter — which input
      // lands where.
      {
        type: 'surface',
        x: fx,
        y: fy,
        z: fz,
        surfacecolor: U,
        colorscale: 'Plasma',
        showscale: false,
        visible: false,
      },
      // The grid curves: fixed-u and fixed-v lines through f — the
      // surface's seams.
      ...gridCurves2x3(u, v, fx, fy, fz),
      // The raw samples as a point cloud — the sparsest view.
      {
        type: 'scatter3d',
        mode: 'markers',
        x: flat(fx),
        y: flat(fy),
        z: flat(fz),
        marker: { size: 2, color: '#3b82f6' },
        visible: false,
      },
    ],
    layout: {
      margin: MARGIN,
      showlegend: false,
      updatemenus: [
        {
          buttons: [
            {
              label: 'surface, colored by |f|',
              method: 'update',
              args: [
                {
                  visible: [
                    true,
                    false,
                    ...gridCurves2x3(u, v, fx, fy, fz).map(() => false),
                    false,
                  ],
                },
              ],
            },
            {
              label: 'surface, colored by u',
              method: 'update',
              args: [
                {
                  visible: [
                    false,
                    true,
                    ...gridCurves2x3(u, v, fx, fy, fz).map(() => false),
                    false,
                  ],
                },
              ],
            },
            {
              label: 'grid curves',
              method: 'update',
              args: [
                {
                  visible: [
                    false,
                    false,
                    ...gridCurves2x3(u, v, fx, fy, fz).map(() => true),
                    false,
                  ],
                },
              ],
            },
            {
              label: 'point cloud',
              method: 'update',
              args: [
                {
                  visible: [
                    false,
                    false,
                    ...gridCurves2x3(u, v, fx, fy, fz).map(() => false),
                    true,
                  ],
                },
              ],
            },
          ],
          direction: 'down',
          x: 0,
          y: 1.12,
        },
      ],
    },
  };
}

// Fixed-u / fixed-v curves through f for the 2x3 grid-curves mode.
function gridCurves2x3(
  u: (number | null)[],
  v: (number | null)[],
  fx: (number | null)[][],
  fy: (number | null)[][],
  fz: (number | null)[][],
): Record<string, unknown>[] {
  const traces: Record<string, unknown>[] = [];
  for (let i = 0; i < v.length; i += 4)
    traces.push({
      type: 'scatter3d',
      mode: 'lines',
      x: fx[i],
      y: fy[i],
      z: fz[i],
      line: { color: 'rgba(59,130,246,0.7)', width: 2 },
      hoverinfo: 'skip',
    });
  for (let j = 0; j < u.length; j += 4)
    traces.push({
      type: 'scatter3d',
      mode: 'lines',
      x: fx.map((r) => r[j] ?? null),
      y: fy.map((r) => r[j] ?? null),
      z: fz.map((r) => r[j] ?? null),
      line: { color: 'rgba(239,68,68,0.7)', width: 2 },
      hoverinfo: 'skip',
    });
  return traces;
}

export function plotFigure(plot: PlotData): PlotFigure {
  switch (plot.kind) {
    case '1x1':
      return figure1x1(plot);
    case '1x2':
      return figure1x2(plot);
    case '1x3':
      return figure1x3(plot);
    case '2x1':
      return figure2x1(plot);
    case '2x2':
      return figure2x2(plot);
    case '2x3':
      return figure2x3(plot);
  }
}
