# Plan: quiver (vector-field) view for `\text{plot}` of ℝ²→ℝ²

## Context

`\text{plot} <expr>` is a statement marker (`\text{plot}` + expression).
The compiler emits `_mc_plot(<expr>)` for the calculator target; the
worker (`src/calc/calculator.worker.ts`, inside the `SETUP_PY` python
string) classifies the value into `(vars, components)` via
`_mc_plot_signature` and builds a plotly figure dict that the frontend
(`src/plot/PlotView.svelte`, plotly.js) renders. While SymPy/plotly
load, an ECharts overlay (`src/plot/EchartsPlot.svelte` +
`src/plot/echarts.ts`) draws the same `PlotData` figure dict — and a
CE-sampled *interim* figure from `interimPlotRow` in
`src/calc/calculator.svelte.ts` covers the whole boot window.

A scaffold commit already wired the 2-variable/2-component (2x2)
signature end to end:

- `_mc_plot_payload` accepts d=2, c=2 (was: error "only ℝ²→ℝ").
- `_mc_plot_figure`'s `c == 2` branch builds ONE figure with two views
  behind the existing `_mc_plot_menu` mode menu: `field` (this plan)
  visible by default, `image` (the other agent's plan) hidden.
- `_mc_field_view(fig, fnum, rng, n, color)` — a STUB you implement —
  lives inside `_MC_FIELD_SRC`, a python source string that is both
  `exec`'d at engine setup AND included verbatim in the
  generating-code block (so the shown program is literally the code
  that ran). Keep its signature and every trace's `name` in
  `_MC_FIELD_NAMES` in sync — the menu's visibility lists and the
  shown-code emission depend on both.
- `_mc_field_view` must return `(x0, x1, y0, y1)` — the box framing
  the drawn arrows — or None when nothing finite sampled. The figure
  uses it for the initial ranges and the mode button's relayout arg.
- `interimFieldTraces(runners, vars)` in `calculator.svelte.ts` — a
  STUB you implement — produces the interim row's field traces.
- `emitPlotFieldPython` in `src/compile/codegen.ts` — a STUB you
  implement — is the python-target lowering (the `plotTarget ===
  'python'` code users copy out).

## What to implement

### 1. `_mc_field_view` (worker python, in `_MC_FIELD_SRC`)

Quiver field: one arrow per point of an n×n uniform grid over rng²,
drawn as a single NaN-separated `scatter` `mode='lines'` trace named
`'field'`, `line=dict(color=color, width=2)`, `hoverinfo='skip'`.

Geometry (numpy only — `import numpy as _mc_np` inside the function,
matching the lazy-import convention; `fig`/`fnum` are args):

- `us = _mc_np.linspace(rng[0], rng[1], n)`; `U, V = meshgrid(us, us)`.
- `w = _mc_np.asarray(fnum(U, V), dtype=float)` → shape (2, n, n).
  Guard the same way `_mc_plot_figure` does (ndim==2 → reshape) AND
  broadcast constant components: a constant comp may come back scalar
  or (1,1) — `broadcast_to`/`full` it to the grid shape.
- `pitch = (rng[1] - rng[0]) / (n - 1)`; `m = hypot(FU, FV)`.
- Scale: `k = 0.8 * pitch / mmax` where `mmax` = max finite `m`
  (proportional arrows, longest = 0.8 of a cell — Desmos-style).
  mmax == 0 or non-finite → draw no arrow segments but still append
  the empty trace and return the rng box.
- Per arrow, centered on the grid point p: `d = F(p) * k`; shaft
  `p - d/2 → p + d/2`; two head barbs at the tip, length
  `h = min(0.3*|d|, 0.22*pitch)`, rotated ±~27° back from `d`'s
  direction. Append each arrow as 3 segments (shaft, barb, barb)
  separated by NaN. Skip points with non-finite or ~0 magnitude.
- Return the framing box: rng padded by ~0.5·pitch each side.
- Optional (nice): a `'field-tips'` markers-only scatter at the tips
  with a hovertemplate `x: {u:.2f} y: {v:.2f} → F = ({du:.2f}, {dv:.2f})`.
  If you add it, append `'field-tips'` to `_MC_FIELD_NAMES`.

### 2. `interimFieldTraces` (calculator.svelte.ts)

Same geometry in TS on a coarse grid (add `PLOT_NF = 21` next to the
existing `PLOT_*` constants; `PLOT_R2` already exists). Sample each
component's `run` via `sampleNum` at each grid point. Emit the same
trace shape: `{ type: 'scatter', mode: 'lines', name: 'field',
line: { color: PLOT_ACCENT, width: 2 }, x: [...], y: [...] }` with
NaN separators (`sampleNum` returns NaN — the echarts converter maps
non-finite to gaps; keep NaN in the arrays, matching the worker's
payload). Return null when every sampled magnitude is non-finite
(all-gaps convention — the row stays empty until SymPy lands).

### 3. `emitPlotFieldPython` (codegen.ts)

The python-target line for the field view. SymPy ≥1.9 ships
`plot_vector_field` in `sympy.plotting` — verify the import path that
works on the pinned sympy (pyodide v0.29): either top-level
`sp.plot_vector_field` (qualified mode) / bare `plot_vector_field`
(import-* mode), or emit an explicit
`from sympy.plotting import plot_vector_field` line first — StatementOut
`lines` can be multiple lines. Emit the call with the R2 window:
`plot_vector_field((<e0>, <e1>), (<v0>, -3, 3), (<v1>, -3, 3))`. Set
`plot: true`. If it truly isn't available, keep a comment + note
(prefer real code — check first).

## Files you own

- `src/calc/calculator.worker.ts` — ONLY inside `_MC_FIELD_SRC` (plus
  `_MC_FIELD_NAMES` if you add traces). Do not touch `_MC_GRIDIMG_SRC`,
  `_mc_plot_figure`, `_mc_plot_code`, `_mc_plot_payload`.
- `src/calc/calculator.svelte.ts` — `interimFieldTraces` + a `PLOT_NF`
  const. Do not touch the `interimPlotRow` dispatch (already wired).
- `src/compile/codegen.ts` — `emitPlotFieldPython` body only.
- `src/compile/plot.test.ts` — update the 'R²→R² emits the field view
  plus commented image view' test to pin your real emission.
- NEW `src/calc/calculator-field.test.ts` — interimPlotRow coverage
  (kind '2x2', 'field' trace present, NaN-segmented).
- NEW `e2e/plot-field.spec.ts` — see below.
- Do NOT edit AGENTS.md, CALCULATOR-ENGINES.md, echarts.ts, theme.ts,
  types.ts, PlotView/EchartsPlot — the integration pass handles docs;
  the ECharts `opt2d` converter already renders scatter-lines traces.

## e2e spec (`e2e/plot-field.spec.ts`)

Follow `e2e/plot.spec.ts`'s pattern (serial describe, seeded
localStorage worksheet, real Pyodide boot — `test.setTimeout(180_000)`):

- Seed `{ target: 'calculator' }` prefs + a cell
  `\text{plot} \begin{pmatrix} -y \\ x \end{pmatrix}`.
- While the engine loads: `.plot-interim canvas` visible (your interim
  field traces through echarts).
- After 'SymPy ready': `.js-plotly-plot` visible; assert via
  `page.evaluate` on the graph div's `.data` that a trace named
  'field' exists, is a `scatter`/`lines` trace, and that
  `.layout.updatemenus[0].buttons` has labels 'field' and 'image'.
- Optionally click the 'image' menu entry and assert the img traces
  show — only if the DOM interaction is reliable; otherwise assert the
  button's `args[0].visible` marks `img-*` names.

## Verify before finishing

1. `npm ci` in the worktree.
2. `npm test`, `npm run check`, `npm run lint` — all clean
   (pre-existing warnings fine; 0 errors).
3. Fast worker loop WITHOUT pyodide:
   `python3 -m venv /tmp/mc-plot && /tmp/mc-plot/bin/pip install sympy
   numpy plotly`, then extract SETUP_PY:
   `node -e "const fs=require('fs');const s=fs.readFileSync('src/calc/calculator.worker.ts','utf8');const lit=s.match(/const SETUP_PY = (\x60[\s\S]*?\x60);/)[1];fs.writeFileSync('/tmp/setup.py',eval(lit))"`
   (eval'ing the literal is REQUIRED — regex capture keeps raw `\\n`
   escapes, and the extracted python then produces a `code` field with
   literal backslash-n that fails `exec` spuriously)
   and in that venv: `exec(open('/tmp/setup.py').read())` then
   `res = _mc_plot_payload(sp.Matrix([-sp.Symbol('y'), sp.Symbol('x')]))`
   — assert `res['plot']['kind'] == '2x2'`, trace names, menu buttons,
   and that `exec(res['code'], {})` runs standalone (the shown program
   must reproduce the figure — it includes your `_MC_FIELD_SRC`
   verbatim).
4. `PW_PORT=5611 npx playwright test e2e/plot-field.spec.ts` (spins up
   its own dev server on 5611 — never use the default :5573, a sibling
   checkout may be running it).
5. Commit on `devin/r2r2-quiver` (already checked out). Use the repo's
   commit trailer (`Generated with [Devin](https://devin.ai)` +
   Co-Authored-By line).

## Hard rules

- **Never put a backtick in any python string/comment inside
  SETUP_PY** — the whole block is a JS template literal; a backtick
  terminates it and oxlint reports a baffling parse error elsewhere.
- Match the codebase comment style: dense explanatory comments, em
  dashes, no attribution banners.
- Don't change helper signatures or trace-name conventions.
