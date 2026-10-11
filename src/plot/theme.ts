// Theme the worker-built plotly figure for the editor's current theme.
// The figure dict is the plotly python library's fig.to_json() output —
// this layer only touches presentation (backgrounds, font, axis/grid
// colors), never the sampled data.
import type { PlotData } from './types';

interface ThemeColors {
  font: string;
  grid: string;
  zero: string;
  planeFill: string;
  planeGrid: string;
}

// Mirrors index.css's --text/--muted/--faint per theme.
const LIGHT: ThemeColors = {
  font: '#333333',
  grid: 'rgba(95,102,114,0.25)',
  zero: '#8f959e',
  planeFill: '#64748b',
  planeGrid: 'rgba(71,85,105,0.4)',
};
const DARK: ThemeColors = {
  font: '#e6e8ee',
  grid: 'rgba(154,162,174,0.22)',
  zero: '#9aa2ae',
  planeFill: '#94a3b8',
  planeGrid: 'rgba(148,163,184,0.55)',
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function themedFigure(plot: PlotData, dark: boolean) {
  const t = dark ? DARK : LIGHT;
  const src = plot.figure.layout;
  const layout: Record<string, unknown> = {
    // Transparent backgrounds let the cell's own background show
    // through, so the figure matches the theme wherever it sits.
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: t.font },
    ...src,
  };
  // Overlay axis colors on the 2D axes (created if absent — plotly
  // ignores them for 3D-only figures) and every scene axis the figure
  // defined — invisible axes (the 2x2 head-cone scene) are unaffected.
  for (const key of ['xaxis', 'yaxis']) {
    const entry = layout[key];
    layout[key] = {
      gridcolor: t.grid,
      zerolinecolor: t.zero,
      ...(isObj(entry) ? entry : {}),
    };
  }
  // fig.to_json() only emits layout keys the figure touched — a
  // single-scene figure serializes no 'scene' at all, so create the
  // entry whenever a gl3d trace type is present, else the panes keep
  // plotly's opaque default.
  const GL3D = new Set([
    'scatter3d',
    'surface',
    'cone',
    'streamtube',
    'mesh3d',
    'volume',
    'isosurface',
    'pointcloud',
  ]);
  const has3d = plot.figure.data.some(
    (tr) =>
      isObj(tr) &&
      typeof tr.type === 'string' &&
      GL3D.has(tr.type),
  );
  if (has3d && !isObj(layout.scene)) layout.scene = {};
  for (const key of Object.keys(layout)) {
    if (key !== 'scene' && !/^scene\d+$/.test(key)) continue;
    const entry = layout[key];
    if (!isObj(entry)) continue;
    const scene: Record<string, unknown> = {
      ...entry,
      // The panes a scene paints are scene.bgcolor plus each axis's
      // backgroundcolor — fig.to_json() carries them explicitly, so
      // the transparent override must come after the spread.
      bgcolor: 'rgba(0,0,0,0)',
    };
    for (const ax of ['xaxis', 'yaxis', 'zaxis']) {
      // fig.to_json() only serializes props the worker set — an axis
      // the figure never touched is absent entirely, so build the
      // entry unconditionally (these keys are presentation-only; a
      // hidden scene's axes stay hidden).
      scene[ax] = {
        ...(isObj(scene[ax]) ? scene[ax] : {}),
        gridcolor: t.grid,
        zerolinecolor: t.zero,
        zeroline: true,
        backgroundcolor: 'rgba(0,0,0,0)',
      };
    }
    layout[key] = scene;
  }
  // Restyle the worker's xy-plane reference traces — the worker emits
  // placeholder colors and tags the traces meta.mcRole = 'xyplane' so
  // this pass (and the options toggle in applySceneOptions) can find
  // them without touching the sampled data.
  const data = plot.figure.data.map((tr) => {
    if (!isObj(tr.meta) || tr.meta.mcRole !== 'xyplane') return tr;
    if (tr.type === 'surface') {
      return {
        ...tr,
        colorscale: [
          [0.0, t.planeFill],
          [1.0, t.planeFill],
        ],
      };
    }
    if (tr.type === 'scatter3d' && isObj(tr.line)) {
      return { ...tr, line: { ...tr.line, color: t.planeGrid } };
    }
    return tr;
  });
  return { data, layout };
}

// The 'xy plane' options on 3-D figures. planeOrigin shows/hides the
// worker's mcRole-tagged plane traces; planeOnly hides the 3-D axis
// boxes (ticks, labels, grid) so the plane is the only reference.
export interface SceneOptions {
  planeOrigin: boolean;
  planeOnly: boolean;
}

export function applySceneOptions(
  figure: { data: Record<string, unknown>[]; layout: Record<string, unknown> },
  opts: SceneOptions,
): void {
  for (const tr of figure.data) {
    if (isObj(tr.meta) && tr.meta.mcRole === 'xyplane') {
      tr.visible = opts.planeOrigin;
    }
  }
  if (!opts.planeOnly) return;
  for (const key of Object.keys(figure.layout)) {
    if (key !== 'scene' && !/^scene\d+$/.test(key)) continue;
    const entry = figure.layout[key];
    if (!isObj(entry)) continue;
    for (const ax of ['xaxis', 'yaxis', 'zaxis']) {
      const axis = entry[ax];
      entry[ax] = { ...(isObj(axis) ? axis : {}), visible: false };
    }
  }
}
