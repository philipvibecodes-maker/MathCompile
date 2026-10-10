// Theme the worker-built plotly figure for the editor's current theme.
// The figure dict is the plotly python library's fig.to_json() output —
// this layer only touches presentation (backgrounds, font, axis/grid
// colors), never the sampled data.
import type { PlotData } from './types';

interface ThemeColors {
  font: string;
  grid: string;
  zero: string;
}

// Mirrors index.css's --text/--muted/--faint per theme.
const LIGHT: ThemeColors = {
  font: '#333333',
  grid: 'rgba(95,102,114,0.25)',
  zero: '#8f959e',
};
const DARK: ThemeColors = {
  font: '#e6e8ee',
  grid: 'rgba(154,162,174,0.22)',
  zero: '#9aa2ae',
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
      if (isObj(scene[ax]))
        scene[ax] = {
          gridcolor: t.grid,
          zerolinecolor: t.zero,
          zeroline: true,
          ...scene[ax],
          backgroundcolor: 'rgba(0,0,0,0)',
        };
    }
    layout[key] = scene;
  }
  return { data: plot.figure.data, layout };
}
