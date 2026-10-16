// The plot payload a `\text{plot}` statement's row carries from the
// worker. `figure` is the figure dict the plotly python library emits
// (fig.to_json()) — plotly.js renders it as-is once theme overrides
// are applied (see theme.ts).
export interface PlotData {
  /** '<domain-dim>x<component-count>', e.g. '1x1' for y=f(x), '2x2'
   * for an ℝ²→ℝ² map (quiver field + grid-image views). */
  kind: '1x1' | '1x2' | '1x3' | '2x1' | '2x2';
  /** Variable names in grid order (e.g. ['x'], ['u', 'v']). */
  vars: string[];
  /** LaTeX of the plotted expression. */
  label: string;
  figure: {
    data: Record<string, unknown>[];
    layout: Record<string, unknown>;
  };
  /** Set on Compute-Engine-sampled interim figures — PlotView keeps
   * the ECharts overlay up for the whole SymPy boot window until a
   * worker-sampled payload (no flag) replaces the row. */
  interim?: boolean;
}
