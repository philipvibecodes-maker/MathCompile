// The plot payload a `\text{plot}` statement's row carries from the
// worker: sampled arrays plus the classified signature. `data` keys
// depend on the kind — see figures.ts for which keys each consumes.
export interface PlotData {
  /** '<domain-dim>x<component-count>', e.g. '1x1' for y=f(x). */
  kind: '1x1' | '1x2' | '1x3' | '2x1' | '2x2' | '2x3';
  /** Variable names in grid order (e.g. ['x'], ['u', 'v']). */
  vars: string[];
  /** LaTeX of the plotted expression, for the figure title. */
  label: string;
  data: {
    // 1-var kinds: `x`+`y` (1x1), `x`,`y` params by `t` (1x2/1x3 w/ z).
    x?: (number | null)[];
    y?: (number | null)[];
    z?: (number | null)[];
    t?: (number | null)[];
    // 2-var kinds: `u`,`v` are the axis vectors; component grids are
    // `z` (2x1) or `fx`,`fy`,`fz` (2x2/2x3), row-major over (v, u).
    u?: (number | null)[];
    v?: (number | null)[];
    fx?: (number | null)[][];
    fy?: (number | null)[][];
    fz?: (number | null)[][];
  };
}
