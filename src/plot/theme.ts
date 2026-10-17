// Theme the worker-built plotly figure for the editor's current theme.
// The figure dict is the plotly python library's fig.to_json() output —
// this layer only touches presentation (backgrounds, font, axis/grid
// colors), never the sampled data.
import type { PlotData } from './types';

export interface ThemeColors {
  font: string;
  grid: string;
  zero: string;
  // Desmos-scene pieces, restyled by trace name (the worker tags every
  // scene trace so this pass can find it without touching data).
  surfFront: string;
  surfGrid: string;
  sheet: string;
  sheetOpacity: number;
  wallGrid: string;
  box: string;
  axis: string;
  tick: string;
}

// Mirrors index.css's --text/--muted/--faint per theme. Light mode
// keeps the guide's Desmos palette; dark mode lifts the greys and
// deepens the plane so the scene stays legible on the dark background.
const LIGHT: ThemeColors = {
  font: '#333333',
  grid: 'rgba(95,102,114,0.4)',
  zero: '#6b7280',
  surfFront: '#c74440',
  surfGrid: '#7e1f1a',
  sheet: '#d9d9d9',
  sheetOpacity: 0.5,
  wallGrid: 'rgba(0,0,0,0.16)',
  box: '#e3e3e3',
  axis: '#9d9d9d',
  tick: '#8c8c8c',
};
const DARK: ThemeColors = {
  font: '#e6e8ee',
  grid: 'rgba(154,162,174,0.22)',
  zero: '#9aa2ae',
  surfFront: '#c74440',
  surfGrid: '#a03428',
  sheet: '#d9d9d9',
  sheetOpacity: 0.45,
  wallGrid: 'rgba(255,255,255,0.16)',
  box: '#3c4454',
  axis: '#8b93a1',
  tick: '#7d8590',
};

// The active palette — shared with the ECharts interim renderer
// (echarts.ts) so both engines draw on the same colors.
export const plotPalette = (dark: boolean): ThemeColors =>
  dark ? DARK : LIGHT;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const flatColorscale = (color: string) => [
  [0.0, color],
  [1.0, color],
];

// Restyle one named scene trace for the theme. Returns the trace
// unchanged when the name isn't a scene piece.
function themedTrace(
  tr: Record<string, unknown>,
  t: ThemeColors,
): Record<string, unknown> {
  switch (tr.name) {
    case 'wallgrid':
      return isObj(tr.line)
        ? { ...tr, line: { ...tr.line, color: t.wallGrid } }
        : tr;
    case 'box':
      return isObj(tr.line)
        ? { ...tr, line: { ...tr.line, color: t.box } }
        : tr;
    case 'axis':
      if (tr.type === 'cone') {
        return { ...tr, colorscale: flatColorscale(t.axis) };
      }
      if (tr.mode === 'text' && isObj(tr.textfont)) {
        return { ...tr, textfont: { ...tr.textfont, color: t.axis } };
      }
      return isObj(tr.line)
        ? { ...tr, line: { ...tr.line, color: t.axis } }
        : tr;
    case 'ticks':
      return isObj(tr.textfont)
        ? { ...tr, textfont: { ...tr.textfont, color: t.tick } }
        : tr;
    case 'surf': {
      const out: Record<string, unknown> = {
        ...tr,
        colorscale: flatColorscale(t.surfFront),
      };
      if (isObj(tr.contours)) {
        const contours = tr.contours;
        const axisContours = (axis: 'x' | 'y') =>
          isObj(contours[axis])
            ? { ...contours[axis], color: t.surfGrid }
            : contours[axis];
        out.contours = {
          ...contours,
          x: axisContours('x'),
          y: axisContours('y'),
        };
      }
      return out;
    }
    case 'iso':
      return isObj(tr.line)
        ? { ...tr, line: { ...tr.line, color: t.surfGrid } }
        : tr;
    // 2x2 grid-image view: the dimmed copy of the domain's source
    // grid follows the theme's guide-line color.
    case 'input grid':
      return isObj(tr.line)
        ? { ...tr, line: { ...tr.line, color: t.wallGrid } }
        : tr;
    case 'xysheet':
      return {
        ...tr,
        opacity: t.sheetOpacity,
        colorscale: flatColorscale(t.sheet),
      };
    default:
      return tr;
  }
}

// Plain-object deep clone for the worker payload — `structuredClone`
// throws on the store's proxies and JSON round-trips would turn the
// traces' NaN gaps into nulls.
const cloneFigure = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(cloneFigure)
    : isObj(v)
      ? Object.fromEntries(
          Object.entries(v).map(([k, x]) => [k, cloneFigure(x)]),
        )
      : v;

export function themedFigure(plot: PlotData, dark: boolean) {
  const t = dark ? DARK : LIGHT;
  // Deep-clone the worker payload before plotly touches it. The figure
  // lives in the reactive row store, and plotly writes back into the
  // objects it's handed (menu `active`, trace bookkeeping) — a deep
  // mutation of a tracked prop re-fires the render effect and reverts
  // every menu click instantly.
  const figure = cloneFigure(plot.figure) as PlotData['figure'];
  const src = figure.layout;
  const layout: Record<string, unknown> = {
    // Transparent backgrounds let the cell's own background show
    // through, so the figure matches the theme wherever it sits.
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: t.font },
    // Pan on drag — plotly's 2-D default is zoom-box, which surprises.
    // (gl3d scenes ignore this; their dragmode is per-scene 'orbit'.)
    dragmode: 'pan',
    // Keep user-driven view state (camera orbit, zoom) across the mode
    // menu's `update` clicks and row re-renders — without a constant
    // revision, every restyle resets the camera to the worker's eye.
    uirevision: 'mc-plot',
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
  const has3d = figure.data.some(
    (tr) =>
      isObj(tr) &&
      typeof tr.type === 'string' &&
      GL3D_TYPES.has(tr.type),
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
  // Menu panels follow the theme (--panel-bg/--border values from
  // index.css). Plotly draws the active/hovered row with a hardcoded
  // light fill (#F4FAFF) — in dark mode PlotView's CSS re-flattens
  // rows to the dark palette, with a distinct shade on the active
  // item via the .mc-active marker it stamps.
  for (const menu of layoutMenus(layout)) {
    menu.bgcolor ??= dark ? '#23262d' : '#ffffff';
    menu.bordercolor ??= dark ? '#3b4048' : '#d4d4d4';
    if (!isObj(menu.font)) menu.font = {};
    (menu.font as Record<string, unknown>).color ??= t.font;
  }
  // Legend sits over the plot — a mostly-opaque themed panel keeps its
  // entries readable over traces/heatmaps. A mode menu can flip
  // `showlegend` on later (the 2x2 image view), so theme it whenever a
  // trace could carry an entry, not just when it's already on.
  const legendable = figure.data.some((tr) => tr.showlegend === true);
  if (layout.showlegend || isObj(layout.legend) || legendable) {
    const legend: Record<string, unknown> = {
      bgcolor: dark ? 'rgba(35,38,45,0.85)' : 'rgba(255,255,255,0.85)',
      bordercolor: t.grid,
      ...(isObj(layout.legend) ? layout.legend : {}),
    };
    if (!isObj(legend.font)) legend.font = {};
    (legend.font as Record<string, unknown>).color ??= t.font;
    layout.legend = legend;
  }
  const data = figure.data.map((tr) => themedTrace(tr, t));
  return { data, layout };
}

export const GL3D_TYPES = new Set([
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
  'quiver',
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

const isCartesian = (tr: Record<string, unknown>): boolean =>
  typeof tr.type === 'string' && CARTESIAN_TYPES.has(tr.type);

// Sync the cartesian subplot's axis visibility with the active mode.
// The worker's mode-menu buttons carry complete visible lists (scene
// decor included); this pass only mirrors the active mode onto
// xaxis/yaxis.visible and extends each button with the matching
// relayout arg so a 2-D mode shows its axes and a 3-D mode hides
// them again.
export function applyModeAxes(figure: {
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
}): void {
  const hasCartesian = figure.data.some(isCartesian);
  if (!hasCartesian) return;
  const cartesianActive = figure.data.some(
    (tr) => isCartesian(tr) && isShown(tr.visible),
  );
  for (const key of ['xaxis', 'yaxis']) {
    const entry = figure.layout[key];
    if (isObj(entry)) entry.visible = cartesianActive;
  }
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
        const shows = figure.data.some((tr, i) => {
          if (!isCartesian(tr)) return false;
          const v = i < vis.length ? vis[i] : tr.visible;
          return v !== false && v !== 'legendonly';
        });
        if (shows) button2d = true;
        else if (button2d === undefined) button2d = false;
      }
      if (button2d === undefined) continue;
      if (!relayout) {
        relayout = {};
        args.push(relayout);
      }
      relayout['xaxis.visible'] = button2d;
      relayout['yaxis.visible'] = button2d;
    }
  }
}

// Re-apply the user's mode-menu selection to a fresh figure payload.
// A payload swap rebuilds data/layout at their defaults — without this
// the menu snaps back to its first button on every edit. `actives` is
// the per-menu active-button index the caller captured while the old
// figure was on screen (an interim figure carries no menus at all, so
// the choice must persist in component state, not on the graph).
export function applyActiveMenus(
  actives: readonly (number | undefined)[] | undefined,
  figure: {
    data: Record<string, unknown>[];
    layout: Record<string, unknown>;
  },
): void {
  if (!actives) return;
  const menus = layoutMenus(figure.layout);
  actives.forEach((a, i) => {
    if (typeof a !== 'number' || a <= 0) return;
    const menu = menus[i];
    const buttons = menu?.buttons;
    const button = Array.isArray(buttons) ? buttons[a] : undefined;
    if (!isObj(button) || !Array.isArray(button.args)) return;
    // Mark the row so the menu's own active highlight matches the
    // trace/relayout state we're about to apply by hand.
    menu.active = a;
    for (const arg of button.args as unknown[]) {
      if (!isObj(arg)) continue;
      if (Array.isArray(arg.visible)) {
        arg.visible.forEach((v, ti) => {
          if (ti < figure.data.length) figure.data[ti].visible = v;
        });
      } else {
        for (const [key, val] of Object.entries(arg))
          setDeep(figure.layout, key, val);
      }
    }
  });
}

// A relayout arg's keys are dotted paths ('xaxis.range') — nest them
// back into the layout object.
function setDeep(
  o: Record<string, unknown>,
  dotted: string,
  val: unknown,
): void {
  const parts = dotted.split('.');
  let cur = o;
  for (const part of parts.slice(0, -1)) {
    const next = cur[part];
    cur[part] = isObj(next) ? next : {};
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = val;
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
