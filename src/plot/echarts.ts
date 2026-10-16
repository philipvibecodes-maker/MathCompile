// ECharts renderer for a plot row's figure payload. Covers both dead
// windows in the `\text{plot}` path: while the SymPy worker boots the
// interim row's figure is CE-sampled, and while plotly.js downloads the
// real figure sits here — either way the same PlotData draws through
// echarts (+ echarts-gl for the 3-D kinds) instead of sitting blank.
import type { PlotData } from './types';
import { plotPalette } from './theme';

type EChartsModule = typeof import('echarts/core');
let loading: Promise<EChartsModule> | undefined;

// echarts + echarts-gl stay out of the main bundle — this only runs
// once a plot row exists, and the SymPy boot window gives the chunk
// plenty of time to land before plotly.
export function loadECharts(): Promise<EChartsModule> {
  loading ??= Promise.all([
    import('echarts/core'),
    import('echarts/charts'),
    import('echarts/components'),
    import('echarts/renderers'),
    import('echarts-gl/charts'),
    import('echarts-gl/components'),
  ]).then(([core, charts, comps, renderers, glCharts, glComps]) => {
    core.use([
      charts.LineChart,
      charts.HeatmapChart,
      comps.GridComponent,
      comps.TooltipComponent,
      comps.VisualMapComponent,
      comps.LegendComponent,
      renderers.CanvasRenderer,
      glCharts.Line3DChart as never,
      glCharts.Scatter3DChart as never,
      glCharts.SurfaceChart as never,
      glComps.Grid3DComponent as never,
    ]);
    return core;
  });
  return loading;
}

// Scene-decor trace names the worker's Desmos helpers emit — never
// data, always skipped by the converter.
const DECOR_NAMES = new Set(['wallgrid', 'box', 'axis', 'ticks', 'xysheet']);

// Viridis stops (plotly's scale, sampled) for the heatmap interim.
const VIRIDIS = [
  '#440154',
  '#482173',
  '#433e85',
  '#38598c',
  '#2d708e',
  '#25858e',
  '#1e988b',
  '#2ab07f',
  '#52c569',
  '#86d549',
  '#b5de2b',
  '#fde725',
];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const numArr = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'number');
const grid2d = (v: unknown): v is number[][] =>
  Array.isArray(v) && v.length > 0 && v.every((r) => numArr(r));
const isFiniteNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
// A sampled point the engine couldn't evaluate stays a gap — plotly
// uses NaN, echarts reads null/'-' as the line break.
const gap = (v: unknown): number | null => (isFiniteNum(v) ? v : null);
const shown = (v: unknown): boolean =>
  v !== false && v !== 'legendonly';

const num = (v: unknown, fallback: number): number =>
  isFiniteNum(v) ? v : fallback;
const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? v : fallback;

// Category-axis labels for a sampled axis — %g-style rounding keeps
// labels short ("0.5", "-2") without float noise.
const fmtTick = (v: number): string =>
  String(Math.abs(v) < 1e-12 ? 0 : +v.toPrecision(6));

interface TraceLike extends Record<string, unknown> {
  x?: unknown;
  y?: unknown;
  z?: unknown;
}

// Split a figure's traces by what this converter can draw. Decor and
// text-label traces are dropped; hidden cartesian traces (the worker's
// 2x1 heatmap) stay available as a last resort.
function bucketTraces(data: PlotData['figure']['data']): {
  lines2d: TraceLike[];
  curves3d: TraceLike[];
  points3d: TraceLike[];
  surfaces: TraceLike[];
  heatmaps: TraceLike[];
} {
  const out = {
    lines2d: [] as TraceLike[],
    curves3d: [] as TraceLike[],
    points3d: [] as TraceLike[],
    surfaces: [] as TraceLike[],
    heatmaps: [] as TraceLike[],
  };
  for (const raw of data) {
    if (!isObj(raw)) continue;
    const tr = raw as TraceLike;
    if (DECOR_NAMES.has(str(tr.name, '')) || tr.mode === 'text') continue;
    if (!shown(tr.visible) && tr.type !== 'heatmap') continue;
    if (tr.type === 'scatter' && numArr(tr.x) && numArr(tr.y))
      out.lines2d.push(tr);
    else if (tr.type === 'scatter3d' && numArr(tr.x) && numArr(tr.y) && numArr(tr.z))
      (str(tr.mode, '').includes('markers') ? out.points3d : out.curves3d).push(
        tr,
      );
    else if (tr.type === 'surface' && numArr(tr.x) && numArr(tr.y) && grid2d(tr.z))
      out.surfaces.push(tr);
    else if (tr.type === 'heatmap' && numArr(tr.x) && numArr(tr.y) && grid2d(tr.z))
      out.heatmaps.push(tr);
  }
  return out;
}

function axis2d(t: ReturnType<typeof plotPalette>): Record<string, unknown> {
  return {
    type: 'value',
    axisLine: { show: true, onZero: true, lineStyle: { color: t.axis } },
    axisLabel: { color: t.tick },
    splitLine: { show: true, lineStyle: { color: t.grid } },
    splitArea: { show: false },
  };
}

function axis3d(
  name: string,
  t: ReturnType<typeof plotPalette>,
): Record<string, unknown> {
  return {
    type: 'value',
    name,
    nameTextStyle: { color: t.axis },
    axisLine: { lineStyle: { color: t.axis } },
    axisLabel: { color: t.tick },
    axisTick: { lineStyle: { color: t.tick } },
    splitLine: { lineStyle: { color: t.grid } },
    axisPointer: { show: false },
  };
}

function opt2d(
  lines2d: TraceLike[],
  t: ReturnType<typeof plotPalette>,
): Record<string, unknown> {
  const series = lines2d.map((tr) => {
    const xs = tr.x as number[];
    const ys = tr.y as number[];
    const line = isObj(tr.line) ? tr.line : {};
    const markers = str(tr.mode, '').includes('markers');
    return {
      type: 'line',
      name: str(tr.name, ''),
      data: xs
        .map((x, i) => [x, gap(ys[i])] as const)
        .filter(([x]) => x !== null),
      showSymbol: markers,
      symbol: 'circle',
      symbolSize: 4,
      connectNulls: false,
      lineStyle: {
        color: str(line.color, '#3b82f6'),
        width: num(line.width, 2),
      },
      itemStyle: { color: str(line.color, '#3b82f6') },
      emphasis: { disabled: true },
      z: 3,
    };
  });
  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { color: t.font },
    grid: { left: 48, right: 20, top: 16, bottom: 36 },
    xAxis: axis2d(t),
    yAxis: axis2d(t),
    tooltip: { trigger: 'axis', valueFormatter: undefined },
    legend:
      series.length > 1
        ? { top: 2, textStyle: { color: t.font } }
        : undefined,
    series,
  };
}

function optHeatmap(
  tr: TraceLike,
  t: ReturnType<typeof plotPalette>,
): Record<string, unknown> | null {
  const xs = tr.x as number[];
  const ys = tr.y as number[];
  const z = tr.z as number[][];
  let lo = Infinity;
  let hi = -Infinity;
  const data: [number, number, number][] = [];
  for (let i = 0; i < ys.length && i < z.length; i++)
    for (let j = 0; j < xs.length && j < z[i].length; j++) {
      const v = z[i][j];
      if (!isFiniteNum(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      data.push([j, i, v]);
    }
  if (data.length === 0) return null;
  const step = (n: number) => Math.max(1, Math.ceil(n / 10));
  const catAxis = (vals: number[]): Record<string, unknown> => ({
    type: 'category',
    data: vals.map(fmtTick),
    axisLabel: { color: t.tick, interval: step(vals.length) },
    axisLine: { show: true, lineStyle: { color: t.axis } },
    splitLine: { show: false },
  });
  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { color: t.font },
    grid: { left: 48, right: 20, top: 16, bottom: 64 },
    xAxis: catAxis(xs),
    yAxis: catAxis(ys),
    visualMap: {
      type: 'continuous',
      min: lo,
      max: hi,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 4,
      itemWidth: 12,
      textStyle: { color: t.tick },
      inRange: { color: VIRIDIS },
    },
    tooltip: {},
    series: [{ type: 'heatmap', data }],
  };
}

// A worker surface carries x/y as 1-D axis vectors and z as the 2-D
// grid — echarts-gl wants flat [x, y, z] items plus a dataShape hint.
function opt3d(
  surfaces: TraceLike[],
  curves3d: TraceLike[],
  points3d: TraceLike[],
  t: ReturnType<typeof plotPalette>,
): Record<string, unknown> {
  const series: Record<string, unknown>[] = [];
  for (const tr of surfaces) {
    const xs = tr.x as number[];
    const ys = tr.y as number[];
    const z = tr.z as number[][];
    const data: [number, number, number][] = [];
    for (let i = 0; i < ys.length && i < z.length; i++)
      for (let j = 0; j < xs.length && j < z[i].length; j++)
        data.push([xs[j], ys[i], isFiniteNum(z[i][j]) ? z[i][j] : NaN]);
    series.push({
      type: 'surface',
      name: str(tr.name, 'surf'),
      data,
      dataShape: [ys.length, xs.length],
      itemStyle: { color: t.surfFront },
      wireframe: { show: true, lineStyle: { color: t.surfGrid, width: 1 } },
      shading: 'lambert',
    });
  }
  for (const tr of curves3d) {
    const xs = tr.x as number[];
    const ys = tr.y as number[];
    const zs = tr.z as number[];
    const line = isObj(tr.line) ? tr.line : {};
    series.push({
      type: 'line3D',
      name: str(tr.name, 'curve'),
      data: xs.map((x, i) => [x, ys[i], zs[i]]),
      lineStyle: {
        color: str(line.color, '#3b82f6'),
        width: num(line.width, 4),
      },
    });
  }
  for (const tr of points3d) {
    const xs = tr.x as number[];
    const ys = tr.y as number[];
    const zs = tr.z as number[];
    series.push({
      type: 'scatter3D',
      name: str(tr.name, ''),
      data: xs.map((x, i) => [x, ys[i], zs[i]]),
      symbolSize: 4,
    });
  }
  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { color: t.font },
    xAxis3D: axis3d('x', t),
    yAxis3D: axis3d('y', t),
    zAxis3D: axis3d('z', t),
    grid3D: {
      boxWidth: 140,
      axisPointer: { show: false },
      viewControl: {
        autoRotate: false,
        distance: 220,
        alpha: 18,
        beta: 40,
      },
    },
    legend:
      series.length > 1
        ? { top: 2, textStyle: { color: t.font } }
        : undefined,
    tooltip: {},
    series,
  };
}

// PlotData figure -> echarts option, or null when no trace converts
// (the caller keeps the "loading" state — the real plotly render still
// lands normally).
export function echartsOption(
  plot: PlotData,
  dark: boolean,
): Record<string, unknown> | null {
  const t = plotPalette(dark);
  const { lines2d, curves3d, points3d, surfaces, heatmaps } = bucketTraces(
    plot.figure.data,
  );
  // 3-D first — a 2x1 figure carries a hidden cartesian heatmap behind
  // the surface; the gl view is the closer match to the final figure.
  if (surfaces.length > 0 || curves3d.length > 0 || points3d.length > 0)
    return opt3d(surfaces, curves3d, points3d, t);
  if (lines2d.length > 0) return opt2d(lines2d, t);
  if (heatmaps.length > 0) return optHeatmap(heatmaps[0], t);
  return null;
}
