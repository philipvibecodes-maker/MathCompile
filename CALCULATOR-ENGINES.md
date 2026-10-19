# Calculator engines: Pyodide/SymPy + Compute Engine interim

Notes for agents working on the calculator target. Two engines produce a
cell's results: **SymPy on Pyodide** (authoritative, ~4s cold boot) and
**Compute Engine** (interim, ~ms while Pyodide boots — the same
`@cortex-js/compute-engine` that parses LaTeX for the compiler, so the
interim needs no second parser or extra dependency). Interim rows carry
no `code` field — the per-cell generating-code block stays SymPy-only.

## Layout

- `src/calc/calculator.worker.ts` — classic (`iife`) worker running
  Pyodide + SymPy; owns `mc_run`.
- `src/calc/calculator.svelte.ts` — `evaluate()` (real engine),
  `interimEvaluate()` (Compute Engine), `prewarm()`, `calcEngine`
  status rune.

- `src/components/CalcOutput.svelte` — per-cell output; fires
  `interimEvaluate` while `calcEngine.status !== 'ready'`, `evaluate`
  always; interim rows render dimmed via `.pending` and tagged
  `.calc-interim` until real rows land.
- `App.svelte` — shows a `.engine-status` banner in the toolbar while
  `calcEngine.status` is `loading`/`error`.
- `src/compile/codegen.ts` — `compileCellsForCalc()`: the shared
  LaTeX → IR → SymPy pipeline over the whole worksheet prefix (cells
  share one scope, so names bound above stay bound below);
  `compileCellForCalc()` is the standalone one-cell equivalent.
- `public/pyodide/` — vendored Pyodide runtime + sympy/mpmath wheels
  (gitignored; `scripts/fetch-pyodide.mjs` downloads them, wired into
  predev/prebuild).

## Input → SymPy: the codegen path (not parse_latex)

The first attempt parsed raw LaTeX inside Pyodide via
`sympy.parsing.latex.parse_latex`, which needed a vendored antlr4 wheel
(`parse_latex` hard-pins antlr 4.11.x, unshipped by pyodide) and couldn't
read `\displaylines`, `\\`, or comma-joined rows anyway. The repo's
codegen pipeline (`src/compile/` — Compute Engine parse → normalized IR →
SymPy emitter) now does the input→SymPy translation in TypeScript, so:

- **No antlr wheel, no parse_latex** — the worker only exec/evals the
  emitted Python. Boot is `importScripts` pyodide → wasm+stdlib →
  `loadPackage(['sympy'])` → `mc_run` def, all off the vendored
  `public/pyodide/` directory — zero runtime network. When
  `pyodide/engine.snapshot` is present (desktop builds only, see
  `scripts/make-pyodide-snapshot.cjs`) the worker instead restores that
  frozen post-`import sympy` memory image via `_loadSnapshot`; a missing
  or stale snapshot falls back to the normal boot.
- `compileCellsForCalc(cells)` returns `{ prelude, cells }`: `prelude` =
  `import sympy as sp` + the `mc_*` runtime block; each cell program is
  `{ defs, statements, issues, errorLine?, statementLines }` where
  `defs` holds the `x = sp.Symbol("x")` / `f = sp.Function("f")` decl
  lines first needed by that cell and `statements` is one
  `{ code, display?, error? }` per top-level statement (per `\\` row).
- The worksheet is one sequential namespace: cells compile into a shared
  scope, so a name bound by an earlier cell (`a = 5`, `def g`) is in
  scope below — no shadowing decl is emitted for it — while names
  declared only below stay invisible to the cells above.
- Worker protocol (`mc_run`): each request is the worksheet prefix
  ending at the requesting cell (`{ prelude, cells }`, each cell keyed
  by a content hash). `_ns` is the shared exec namespace and `_snaps[i]`
  caches the namespace + rows after cell i; a changed cell rewinds to
  the snapshot before it and re-runs just the tail, so earlier cells
  aren't re-evaled. Per statement — `display === undefined` →
  `eval(code)`, else `exec(code)` then `eval(display)`; a `defs` line
  execs before the cell's statements.
- **Rows are per statement, not folded**: multi-line cells show one
  result per line (Desmos-style), replacing the old `sp.Tuple` fallback
  (`(2, 5)` for a two-line cell — that existed only because parse_latex
  couldn't take `\\`).
- Assignments/defs get a `display` expression so their row renders
  meaningfully: `a = 5` → `sp.Eq(sp.Symbol("a"), 5)`;
  `def f(x): return x**2` →
  `(lambda x: sp.Eq(sp.Function("f")(x), x**2))(sp.Symbol("x"))`
  (an undefined `f` — the real def would evaluate back to its body).
- Statements bind python names, not Symbols (`a = 5` emits no
  `a = sp.Symbol("a")` def) — same convention as the python target.
- Cells the compiler already rejects (severity `error` issues) become
  error rows client-side; no worker round-trip.

## Results

- Each row: `doit()` (evaluates integrals/sums) → `simplify()` →
  `{latex: sp.latex(val)}` (or `text: sstr` fallback), `approx` (`sp.N`
  for non-integer numbers).
- The cell's emitted program (prelude + statement code) renders as one
  block at the end of the cell behind its per-cell "Show generating
  code" toggle; a display-plumbing variant with the `e = ...` capture
  lines inlined sits behind the settings menu's "display plumbing"
  toggle.
- Equations evaluate honestly: `2^n = \sum\binom{i}{n}` simplifies to
  `True`, `x + 1 = 2` stays an `Eq` — no equation solving.
- Indefinite integrals carry a constant of integration: codegen emits
  `sp.integrate(body, v) + sp.Symbol(<letter>)` at add-precedence (the
  constant parenthesizes when the integral nests inside a bigger term).
  The letter is the first capital not used by the cell or worksheet —
  `C`, else `D`, `E`, …; each boundless `Integrate` takes the next free
  one, including each level of an iterated integral — `∬f dxdy` shows
  `F + C·y + D`, not `F + C`. The Compute Engine interim matches:
  each boundless `Integrate` node is wrapped in `Add(…, letter)` before
  evaluation, so inner constants integrate into the result the same
  way.
- After `simplify()`, `_mc_order` rewrites each `Add` (and `Eq` sides)
  with terms in decreasing degree, constants of integration last — so a
  result displays `x^2/2 + x + C`, not SymPy's canonical `C + x^2/2`.

## Pyodide/SymPy — what it costs

Measured boot (M-series laptop): ~3.5s now that everything is vendored
and the antlr wheel install is gone. The ~3s CPU floor (SymPy import)
has two escapes: `prewarm()` on app mount (the worker self-boots on
spawn) plus the Compute Engine interim below, and
`npm run pyodide:snapshot` freezes a post-import interpreter into
`public/engine.snapshot.gz` that the worker restores (`_loadSnapshot`),
cutting boot to ~1s. Two snapshot gotchas the implementation earns:
`loadPackage` pollutes a reserved hiwire slot that
`makeMemorySnapshot()` refuses to serialize, so the generator unzips
the wheels via `zipfile` instead; and the EMFS directory tree lives
outside the WASM heap, so package files never survive a restore — the
worker re-runs `loadPackage` post-restore to repopulate them for lazy
imports (`sympy.physics`, …), and unzips the committed plotly wheel for
the same reason.

## Compute Engine interim — how it works

`interimEvaluate(latex)` in `calculator.svelte.ts` reuses the compiler's
own front end: `parseCellLatex` → `normalizeIR` (the same tree codegen
emits — chained `Equal` flattens, `name = rhs` becomes `Assign`,
`\text{def}` becomes a `Def` head) → per-statement
`ce.box(json).evaluate().evaluate()` → `restoreMatrices` on the result
json → rebox → `.latex`.
One interim row per statement row the real engine emits, matching its
row-per-statement shape so results swap in place. CE lives in the main
bundle already (the compiler needs it), so there is no lazy chunk — the
interim is effectively synchronous.

CE's `evaluate()` covers the interim's whole calculus surface natively:
`Integrate` definite *and* indefinite, `D` derivatives, `Sum`/`Product`
with numeric bounds (symbolic bounds stay unevaluated, like the real
engine's un-evaluable forms), `Limit`, `Root`, `Binomial`, `Det`, exact
trig values. Examples: `\int_{0}^{1}x` → `1/2`, `\int x dx` → `x²/2 + C`,
`\frac{d}{dx}x^2` → `2x`, `\lim_{x→0} sin x/x` → `1`, `\binom{5}{2}` → `10`.
First row lands in ~ms, dimmed until SymPy's answer replaces it.


### Interim mechanics (earned, not docs-read)

- **Pushed scope per call**: `engine.pushScope()`/`popScope()` wraps the
  per-statement evaluations so `name = rhs` rows bind for the rows below
  (`a = 5 \\ a+1` → `a=5`, `6`) without leaking into other cells or
  later evals.
- **`name = rhs` is a binding**: `Equal`/`Assign` with a bare-name lhs
  evaluates `Assign(name, rhs)` (the binding side effect) and displays
  `name = evaluated-rhs` — mirroring the worker's `Eq` display for
  assignments.
- **`+C` per boundless Integrate**: `addConstants` wraps each
  `['Integrate', body, 'v']` (a bare string var slot = indefinite; a
  `Limits` slot = definite) in `Add(…, letter)`, letters drawn from
  codegen's shared `firstFreeCapital` over a used-name set seeded by
  `collectDeclared` on the cells above plus every name token in this
  cell — so a `C = …` in an earlier cell can't collide.
- **`\text{d}` differentials peel out of the integrand**: CE leaves
  `\int x²\text{d}x` as `d·x` factor pairs in the body (flat or nested
  in the last factor's args); `peelDiffs` removes them the way codegen's
  integral emitter does and uses the names to fill the var slot — extra
  names (`\iint f dxdy`) become iterated integrals.
- **`Nothing` handling**: a `Nothing` in the var slot means no
  differential was written — `repairBounds` fills it from the peeled
  names or the body's single free name (codegen's `freeNames`, which
  skips constants like `Pi`). Both bounds `Nothing` = indefinite; one
  `Nothing` bound (`\int_{0}^{ }x`, `\sum_{i=0}^{ }i`) poisons the
  statement — matching the real engine's error.
- **Double evaluate**: CE's first `.evaluate()` only resolves the
  outermost `Integrate` — a second pass reaches nested ones (`∬x dxdy`
  → `y(x²/2 + C) + D`).
- **`\text{where}` blocks expand like `cellBody`**: `x² \text{ where }
  x>0` parses `WhereBlock(cond, body)` — the interim emits the body row
  before its conditions, same order the real engine uses.
- **Skipped statements stay empty**: `\text{def}` lines, parse `Error`
  nodes, and custom IR heads (`call`, `Declare`, `IntegerRange`, …)
  return no row — never show a guess as a real result. (Real-engine
  errors *are* shown: normalization issues and per-statement exceptions
  land as error rows.)
- **`\text{plot}` gets a real interim row**: `interimPlotRow` compiles
  each component with CE's `compile()` (free function — bound same-cell
  names fold in) and samples on the worker's grids (`PLOT_R1/N1`,
  `PLOT_R2/N2` mirror `_MC_PLOT_*`), emitting a `PlotData` whose
  figure is a minimal plotly dict (no Desmos decor) flagged
  `interim: true`. `PlotView` keeps the `EchartsPlot` overlay mounted
  while `plot.interim` — ECharts owns the whole boot window — and
  while plotly.js downloads on real rows; the overlay unmounts when a
  worker payload lands (same index key, so the component persists and
  only the prop swaps). Declines (null → no row): prior-cell-bound
  vars (value unknowable — `priorDeclared` is snapshotted before
  `reserve()` folds this cell's own names in), unknown/def'd
  functions (compile returns non-'expression' calling or all-NaN
  samples), and signatures the worker would reject (d∉{1,2},
  c∉{1,2,3}).
- **ℝ²→ℝ² (`kind: '2x2'`) is one figure, two views**: the worker's
  `_mc_field_view`/`_mc_gridimg_view` (sources in `_MC_FIELD_SRC`/
  `_MC_GRIDIMG_SRC`, exec'd and shown verbatim in the generating-code
  block) build four named traces — `field` (the native `go.Quiver`
  trace, plotly ≥7.0: 9×9 grid, `anchor='center'`,
  `lengthmode='scaled'` × `lengthfactor 1.5`, hover `F = (%{u}, %{v})`,
  non-finite grid points dropped) and `input square`/`input y = k`/
  `image of square`/`image of y = k` (a filled dimmed [-3,3]²
  source-domain square plus its horizontal grid lines — owned by the
  `input square` checkbox's `meta.inputToggle`, image-mode only —
  plus the mapped boundary and same-color images of those `y = k`
  lines — always `_MC_PLOT_GLINES` = 10, evenly spaced across the
  y-window regardless of domain size, NaN-broken at poles; `legendrank`
  sinks the two input entries below the image ones). A
  `field`/`image` updatemenu flips `visible` *and* carries a
  per-mode relayout — field frames the grid box padded ½·pitch,
  image frames the finite image extent (~6% pad, 0.5 floor), turns
  `showlegend` on, and sets the `input: [x0,x1]×[y0,y1] — line
  images at y = …`
  annotation the field button clears again. The python target emits
  `sympy.plotting.plot_vector_field` for the field view; the image
  view has no SymPy equivalent, so a numpy+matplotlib equivalent
  rides along *commented* under it. The interim previews the field
  view only (image mode is worker-figure-only);
  `interimFieldTraces` emits the same quiver trace shape on
  `PLOT_NF = 9` and the echarts converter synthesizes NaN-separated
  shaft+barb segments from x/y/u/v (ECharts has no quiver series —
  worker arrays must stay plain lists, not numpy, or the JSON turns
  into undecodable `bdata` dicts). Two frontend gotchas: `quiver`
  must count as cartesian in `applyModeAxes` or the field mode
  renders with the xy axes/grid hidden; and a payload swap rebuilds
  the figure at its defaults — PlotView captures each updatemenu's
  active button into `menuSel` (afterplot/relayout) and
  `applyActiveMenus` re-applies that button's vis/relayout args to
  the incoming figure, so an edit doesn't snap the mode back to
  `field` (the interim payload has no menus at all — the selection
  can't ride on `_fullLayout` alone).
- **ℝ²→ℝ³ (`kind: '2x3'`) parametrizations** sample the same
  [-3,3]² window as 2-D scalar surfaces — the surface is the image
  of the domain, so the
  trace carries per-component 2-D x/y/z grids instead of axis
  vectors. A `\text{for}` clause sets the sampling domain:
  `\text{plot} f \text{ for } x ∈ (a,b)` (also `[a,b]`, `a ≤ x ≤ b`,
  one-sided `x > a`, `u ∈ … \land v ∈ …`, `(u,v) ∈ I₁×I₂`) parses to
  `['Plot', expr, cond]`; `plotDomainBounds` reads it into per-var
  (lo, hi) ends — calc emits `_mc_plot(expr, {'v': (lo, hi)})` (None
  keeps the default end), python emits `(v, lo, hi)` ranges, and
  `_mc_rng`/the interim's `rng` apply the same defaults-fallback
  rules.
  The same per-var domain also drives the 2x2 quiver/image
  sampling windows.
- **`src/plot/echarts.ts` converts the figure dict**, not the
  expression: scatter→line (NaN→null gaps), scatter3d→line3D,
  surface→gl `surface` (x/y vectors — or per-component 2-D grids for
  a 2x3 parametrization — flattened to `[x,y,z]` triples +
  `dataShape`), heatmap→category-axis heatmap + viridis `visualMap`.
  Scene-decor names (`wallgrid`/`box`/`axis`/`ticks`/`xysheet`) and
  `mode:'text'` traces are skipped; a 2x1 figure prefers the gl
  surface over its hidden heatmap. Updatemenus aren't read — a 2x2
  figure shows its default (field) mode: the `quiver` trace becomes
  a synthesized segment line and the hidden `img-*` traces are
  dropped. Gotchas: echarts **defers canvas
  creation to the first `setOption`** — `init` alone leaves an empty
  wrapper; and the chart handle must be `$state` or the render effect
  fires once before init and never re-runs. echarts-gl's `surface`
  accepts flat data + `dataShape: [rows, cols]` (it can also infer it
  from x-reset boundaries).
- **Serializer fixups**: `.latex` emits `\exponentialE`, `\imaginaryI`,
  `\lparen`/`\rparen` — `cleanLatex` maps them to `e`, `i`, `(`, `)` so
  MathQuill renders the names instead of italicizing the command text.
  `arcTrigNames` isn't needed here — CE already writes `\arcsin`.
- **Matrices rebox before serializing**: CE evaluates a `Matrix` to a
  bare `List` of row `List`s and serializes lists as
  `\bigl\lbrack…\bigr\rbrack` — MathQuill has no `\lbrack`
  sized-delimiter glyph and prints "lbrack" literally. `restoreMatrices`
  rewrites a `List`-of-flat-`List`s back to `Matrix` (flat rows only;
  deeper nests stay lists) so results emit `\begin{pmatrix}`, and
  `cleanLatex` maps `\lbrack`/`\rbrack`/`\lbrace`/`\rbrace` to the plain
  delimiters for the flat lists and sets that remain.
- **Error results emit no row**: a result json containing an `Error`
  node (`\det` on a scalar-bound name) serializes to
  `\mathtip{\error{…}}` junk — suppressed like the other unevaluable
  heads; the SymPy row lands with the real diagnostic.


## Related incident fixed during this work

`CommandPalette.svelte` items selected on `mouseenter`, so a cursor
parked over the palette fired `mouseenter` on the layout hit-test and
reset the keyboard selection — Enter ran the wrong command (~20% e2e
flake). Items now select on `mousemove` only. If a palette e2e flakes,
suspect hit-test-driven pointer events first.
