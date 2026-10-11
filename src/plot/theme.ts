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
  planeOpacity: number;
  axis: string;
}

// Mirrors index.css's --text/--muted/--faint per theme. Light mode
// needs darker alphas — the default greys wash out on the light
// background.
const LIGHT: ThemeColors = {
  font: '#333333',
  grid: 'rgba(95,102,114,0.4)',
  zero: '#6b7280',
  planeFill: '#64748b',
  planeGrid: 'rgba(51,65,85,0.55)',
  planeOpacity: 0.32,
  axis: '#4b5563',
};
const DARK: ThemeColors = {
  font: '#e6e8ee',
  grid: 'rgba(154,162,174,0.22)',
  zero: '#9aa2ae',
  planeFill: '#94a3b8',
  planeGrid: 'rgba(148,163,184,0.55)',
  planeOpacity: 0.25,
  axis: '#9aa2ae',
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const mcRole = (tr: Record<string, unknown>): string | undefined =>
  isObj(tr.meta) && typeof tr.meta.mcRole === 'string'
    ? (tr.meta.mcRole as string)
    : undefined;

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
  // Restyle the worker's meta-tagged reference traces — the worker
  // emits placeholder colors and tags traces meta.mcRole so this pass
  // (and the options toggle in applySceneOptions) can find them
  // without touching the sampled data.
  const data = plot.figure.data.map((tr) => {
    const role = mcRole(tr);
    if (role === 'xyplane') {
      if (tr.type === 'surface') {
        const contours = isObj(tr.contours) ? tr.contours : {};
        const axisContours = (axis: 'x' | 'y') =>
          isObj(contours[axis])
            ? { ...contours[axis], color: t.planeGrid }
            : { color: t.planeGrid };
        return {
          ...tr,
          opacity: t.planeOpacity,
          colorscale: [
            [0.0, t.planeFill],
            [1.0, t.planeFill],
          ],
          contours: {
            ...contours,
            x: axisContours('x'),
            y: axisContours('y'),
          },
        };
      }
      if (tr.type === 'scatter3d' && isObj(tr.line)) {
        return { ...tr, line: { ...tr.line, color: t.planeGrid } };
      }
    }
    if (role === 'zaxis') {
      if (isObj(tr.line)) {
        return { ...tr, line: { ...tr.line, color: t.axis } };
      }
      if (tr.mode === 'text' && isObj(tr.textfont)) {
        return { ...tr, textfont: { ...tr.textfont, color: t.axis } };
      }
    }
    return tr;
  });
  return { data, layout };
}

// The 'xy plane' options on 3-D figures. planeOrigin shows/hides the
// worker's 'xyplane'-tagged plane traces; planeOnly hides the 3-D axis
// boxes (ticks, labels, grid) and shows the worker's 'zaxis'-tagged
// stub instead, so the plane and the z stub are the only references.
export interface SceneOptions {
  planeOrigin: boolean;
  planeOnly: boolean;
}

const GL3D_TYPES = new Set([
  'scatter3d',
  'surface',
  'cone',
  'streamtube',
  'mesh3d',
  'volume',
  'isosurface',
  'pointcloud',
]);

// Trace types that draw on the 2-D cartesian subplot. A figure that
// mixes modes (e.g. the 2x1 surface + heatmap) instantiates both
// subplots, and the unused cartesian axes render on top of the gl3d
// scene — they must be hidden until a 2-D mode is active.
const CARTESIAN_TYPES = new Set([
  'scatter',
  'scattergl',
  'bar',
  'heatmap',
  'heatmapgl',
  'contour',
  'image',
  'histogram',
  'histogram2d',
]);

const isShown = (v: unknown): boolean =>
  v !== false && v !== 'legendonly';

export function applySceneOptions(
  figure: {
    data: Record<string, unknown>[];
    layout: Record<string, unknown>;
  },
  opts: SceneOptions,
): void {
  // A tagged reference trace only makes sense while a real 3-D trace
  // is showing — in a 2-D mode (e.g. the 2x1 heatmap button) the slab
  // and z stub would float over the 2-D view, so they stay hidden
  // regardless of the checkboxes.
  const anyShown = (types: Set<string>): boolean =>
    figure.data.some(
      (tr) =>
        !mcRole(tr) &&
        typeof tr.type === 'string' &&
        types.has(tr.type) &&
        isShown(tr.visible),
    );
  const sceneActive = anyShown(GL3D_TYPES);
  // Cartesian subplot axes draw even while every cartesian trace is
  // hidden — suppress them until a 2-D mode is showing.
  const hasCartesian = figure.data.some(
    (tr) =>
      !mcRole(tr) &&
      typeof tr.type === 'string' &&
      CARTESIAN_TYPES.has(tr.type),
  );
  if (hasCartesian) {
    const cartesianActive = anyShown(CARTESIAN_TYPES);
    for (const key of ['xaxis', 'yaxis']) {
      const entry = figure.layout[key];
      if (isObj(entry)) entry.visible = cartesianActive;
    }
  }
  const taggedVisible = (tr: Record<string, unknown>): boolean => {
    if (!sceneActive) return false;
    return mcRole(tr) === 'xyplane' ? opts.planeOrigin : opts.planeOnly;
  };
  for (const tr of figure.data) {
    if (mcRole(tr)) tr.visible = taggedVisible(tr);
  }
  // Extend every mode-menu button's visible list to the tagged
  // traces — the worker appends them after building the menu, so a
  // button click would otherwise leave them stale and inconsistent
  // with the checkbox state. Per button: a mode that activates no
  // real 3-D trace hides the tagged traces outright, a 3-D mode
  // applies the current checkbox state. The same click toggles the
  // cartesian axes via a second ('update'-method relayout) arg so a
  // 2-D mode shows its axes and a 3-D mode hides them again.
  for (const menu of layoutMenus(figure.layout)) {
    const buttons = menu.buttons;
    if (!Array.isArray(buttons)) continue;
    for (const button of buttons) {
      if (!isObj(button)) continue;
      const args = button.args;
      if (!Array.isArray(args)) continue;
      let relayout: Record<string, unknown> | undefined;
      let button2d: boolean | undefined;
      for (const arg of args) {
        if (!isObj(arg)) continue;
        if (!Array.isArray(arg.visible)) {
          relayout = arg;
          continue;
        }
        const vis = arg.visible as unknown[];
        const modeShows = (types: Set<string>): boolean =>
          figure.data.some((tr, i) => {
            if (mcRole(tr)) return false;
            if (typeof tr.type !== 'string' || !types.has(tr.type))
              return false;
            const v = i < vis.length ? vis[i] : tr.visible;
            return v !== false && v !== 'legendonly';
          });
        const button3d = modeShows(GL3D_TYPES);
        if (modeShows(CARTESIAN_TYPES)) button2d = true;
        else if (button2d === undefined) button2d = false;
        figure.data.forEach((tr, i) => {
          const role = mcRole(tr);
          if (!role) return;
          vis[i] = button3d
            ? role === 'xyplane'
              ? opts.planeOrigin
              : opts.planeOnly
            : false;
        });
      }
      if (button2d === undefined || !hasCartesian) continue;
      if (!relayout) {
        relayout = {};
        args.push(relayout);
      }
      relayout['xaxis.visible'] = button2d;
      relayout['yaxis.visible'] = button2d;
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

function layoutMenus(
  layout: Record<string, unknown>,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const key of Object.keys(layout)) {
    if (key !== 'updatemenus' && !/^updatemenus\d+$/.test(key)) continue;
    const entry = layout[key];
    if (Array.isArray(entry)) {
      for (const m of entry) if (isObj(m)) out.push(m);
    } else if (isObj(entry)) out.push(entry);
  }
  return out;
}
