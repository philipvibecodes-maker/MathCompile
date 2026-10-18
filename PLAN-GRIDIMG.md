# Plan: image-of-grid view for `\text{plot}` of ℝ²→ℝ²

## Context

`\text{plot} <expr>` is a statement marker. The compiler emits
`_mc_plot(<expr>)` for the calculator target; the worker
(`src/calc/calculator.worker.ts`, inside the `SETUP_PY` python string)
classifies the value into `(vars, components)` via `_mc_plot_signature`
and builds a plotly figure dict that `src/plot/PlotView.svelte`
(plotly.js) renders. While SymPy/plotly load, an ECharts overlay draws
the same figure dict; a CE-sampled interim figure covers the boot
window (the interim previews only the default `field` mode — you do
NOT touch the interim path).

A scaffold commit already wired the 2-variable/2-component (2x2)
signature end to end:

- `_mc_plot_payload` accepts d=2, c=2 (was: error "only ℝ²→ℝ").
- `_mc_plot_figure`'s `c == 2` branch builds ONE figure with two views
  behind the `_mc_plot_menu` mode menu: `field` (the other agent's
  plan) visible by default, `image` (yours) hidden until selected.
- `_mc_gridimg_view(fig, fnum, rng, nlines, npts, imgx, imgy, src)` —
  a STUB you implement — lives inside `_MC_GRIDIMG_SRC`, a python
  source string that is both `exec`'d at engine setup AND included
  verbatim in the generating-code block. Keep its signature and keep
  every trace's `name` in `_MC_GRIDIMG_NAMES` — the menu's visibility
  lists and the shown-code emission depend on both.
- `_mc_gridimg_view` must return `(x0, x1, y0, y1)` — the box framing
  the drawn image curves (with padding) — or None when nothing finite
  sampled. The figure uses it for the `image` mode button's relayout
  arg, so switching to the view reframes the axes.
- `emitPlotImagePython` in `src/compile/codegen.ts` — a STUB you
  implement — emits the python-target program; the caller '# '
  prefixes every line so it rides under the field view's real code as
  a commented program.
- The figure already sets `scaleanchor='x'` (equal aspect) — a
  rotation/shear reads true to shape.

## What to implement

### `_mc_gridimg_view` (worker python, in `_MC_GRIDIMG_SRC`)

The classic "where does the grid go" transform picture: draw the
domain's integer grid faintly, then the image of each grid line under
the map as a polyline.

Geometry (`import numpy as _mc_np` inside the function — lazy-import
convention; `fig`/`fnum` are args; `fnum(xArr, yArr)` returns the two
component arrays):

- Grid positions: integers inside rng —
  `ks = range(ceil(rng[0]), floor(rng[1]) + 1)`; if more than `nlines`,
  thin with a stride (`ks[::ceil(len(ks)/nlines)]`). For the default
  ±3 window that's 7 lines per direction.
- `'img-src'` trace: the SOURCE grid — for each k, vertical segment
  `(k, lo)→(k, hi)` and horizontal `(lo, k)→(hi, k)`, NaN-separated in
  one `scatter` `mode='lines'` trace, `line=dict(color=src, width=1)`,
  `visible=False`, `hoverinfo='skip'`.
- `'img-x'` trace: images of the VERTICAL lines `x = k` — for each k,
  `ts = linspace(lo, hi, npts)`, evaluate `fnum(full_like(ts, k), ts)`
  → polyline (xs, ys); NaN-separate between lines. Same for `'img-y'`
  with horizontal lines `y = k` → `fnum(ts, full_like(ts, k))`.
  `mode='lines'`, width 1.5, colors imgx/imgy, `visible=False`.
- Guard lambdify shape quirks the way `_mc_plot_figure` does
  (`asarray(..., dtype=float)`, scalar/constant comps broadcast to the
  line shape). Replace non-finite coords with NaN (breaks polylines at
  poles instead of streaking across the plot).
- Optional: `'img-pts'` markers at the images of the lattice nodes
  `(k_i, k_j)` — small scatter markers in a neutral color. If added,
  append `'img-pts'` to `_MC_GRIDIMG_NAMES`.
- Return the framing box: finite extents over the image samples
  (union of both direction traces), padded ~6% per side, so the image
  mode reframes to where the geometry actually is. None if everything
  was non-finite.

### `emitPlotImagePython` (codegen.ts)

Emit the equivalent standalone program as lines (the caller comments
them out). Something like:

    fnum = sp.lambdify((<v0>, <v1>), (<e0>, <e1>), 'numpy')
    import numpy as np
    import matplotlib.pyplot as plt
    ts = np.linspace(-3, 3, 160)
    fig, ax = plt.subplots()
    for k in range(-3, 4):
        ax.plot(*fnum(np.full_like(ts, k), ts), ...)
        ax.plot(*fnum(ts, np.full_like(ts, k)), ...)

(reasonable, commented, honest — it's documentation, not executed by
our pipeline). Do NOT set `plot: true` — only the field view's lines
are real code.

## Files you own

- `src/calc/calculator.worker.ts` — ONLY inside `_MC_GRIDIMG_SRC`
  (plus `_MC_GRIDIMG_NAMES` if you add traces). Do not touch
  `_MC_FIELD_SRC`, `_mc_plot_figure`, `_mc_plot_code`, `_mc_plot_payload`.
- `src/compile/codegen.ts` — `emitPlotImagePython` body only.
- NEW `src/compile/plot-image.test.ts` — pin the emitted commented
  block's shape (each line starts '# ', contains the lambdify/loop).
- NEW `e2e/plot-image.spec.ts` — see below.
- Do NOT edit AGENTS.md, CALCULATOR-ENGINES.md, echarts.ts, theme.ts,
  types.ts, PlotView/EchartsPlot, calculator.svelte.ts — the other
  agent owns the interim/field path; integration handles docs. (The
  theme already maps `img-src` to the guide-line color.)

## e2e spec (`e2e/plot-image.spec.ts`)

Follow `e2e/plot.spec.ts`'s pattern (serial describe, seeded
localStorage worksheet, real Pyodide boot — `test.setTimeout(180_000)`):

- Seed `{ target: 'calculator' }` + a cell
  `\text{plot} \begin{pmatrix} -y \\ x \end{pmatrix}`.
- After 'SymPy ready': `.js-plotly-plot` visible; assert via
  `page.evaluate` on the graph div's `.data` that traces named
  'img-src', 'img-x', 'img-y' exist with `visible === false`, and the
  updatemenu's buttons are 'field'/'image' with the 'image' button
  carrying a second relayout arg containing `xaxis.range`.
- If the updatemenu DOM interaction is reliable, click 'image' and
  assert the img traces flip visible — otherwise asserting the args
  payload is enough.

## Verify before finishing

1. `npm ci` in the worktree.
2. `npm test`, `npm run check`, `npm run lint` — clean (pre-existing
   warnings fine; 0 errors).
3. Fast worker loop WITHOUT pyodide:
   `python3 -m venv /tmp/mc-plot && /tmp/mc-plot/bin/pip install sympy
   numpy plotly`, extract SETUP_PY:
   `node -e "const fs=require('fs');const s=fs.readFileSync('src/calc/calculator.worker.ts','utf8');const lit=s.match(/const SETUP_PY = (\x60[\s\S]*?\x60);/)[1];fs.writeFileSync('/tmp/setup.py',eval(lit))"`
   (eval'ing the literal is REQUIRED — regex capture keeps raw `\\n`
   escapes, and the extracted python then produces a `code` field with
   literal backslash-n that fails `exec` spuriously)
   then `exec(open('/tmp/setup.py').read())` and
   `res = _mc_plot_payload(sp.Matrix([-sp.Symbol('y'), sp.Symbol('x')]))`
   — assert `kind == '2x2'`, the img traces exist hidden, the 'image'
   button's second arg has axis ranges, and `exec(res['code'], {})`
   runs standalone. Try a nonlinear map too, e.g.
   `sp.Matrix([x**2 - y**2, 2*x*y])` — the image should curve.
4. `PW_PORT=5612 npx playwright test e2e/plot-image.spec.ts` (its own
   dev server on 5612 — never the default :5573, a sibling checkout
   may be running it).
5. Commit on `devin/r2r2-grid-image` (already checked out). Use the
   repo's commit trailer (`Generated with [Devin](https://devin.ai)` +
   Co-Authored-By line).

## Hard rules

- **Never put a backtick in any python string/comment inside
  SETUP_PY** — the whole block is a JS template literal; a backtick
  terminates it and oxlint reports a baffling parse error elsewhere.
- Match the codebase comment style: dense explanatory comments, em
  dashes, no attribution banners.
- Don't change helper signatures or trace-name conventions.
