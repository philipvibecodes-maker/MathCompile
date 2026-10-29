# Plotting bug hunt report

Repository: philipvibecodes-maker/MathCompile. Original hunt baseline: `eb8cdc2318f219d2f6d97cfe1dcc67c5d2ba268f`. Current reassessment baseline: **`8e69e4d92e18b534d51a98f369c66a6778ea6637`**, merged [compiler refactor PR #113](https://github.com/philipvibecodes-maker/MathCompile/pull/113). Original hunt checkout: `/workspace/hunt-plotting`; read-only reassessment checkout: `/workspace/refactor-review`.

Reported: **18 issues — 3 high, 14 medium, 1 low**. PLOT-17 is confirmed under explicit one-shot dependency fault injection; no naturally occurring renderer rejection was reproduced. Other findings use ordinary baseline inputs, exact worker payloads or real browser behavior. All fixes were canceled by the user: **no product fixes were made**. Subsequent commits and pushes publish report documents only. Tracked product files in each investigation checkout match its stated baseline; the temporary Vite cacheDir diagnostic change was restored. Untracked diagnostic probes, cache and evidence remain available.

## Reassessment after the merged compiler refactor

Reviewed on **2026-10-29** against the pinned merge above. **All 18 finding groups remain open: 13 have a current bounded executable reproduction, and 5 are carried forward on byte-identical implicated source without a new browser or hazardous-input run. No finding is marked fixed.** Severity and the original evidence qualifications are retained; source continuity is not presented as a fresh end-to-end reproduction.

PR #113 extracted plot compilation into `src/compile/codegen/plotting.ts`, with statement orchestration in `codegen/statements.ts` and free-name analysis in `codegen/analysis.ts`. It did not change any of the 17 tracked files under `src/calc/` and `src/plot/`, or either dependency manifest: all **19 files are byte-identical** between the pinned baselines (`refactor-review/source-identity.json`). This includes the worker, interim sampler, chart adapters and both rendering components.

Current verification was deliberately bounded:

- **39 retained plot cases** were recompiled against both baselines. Raw and normalized IR, qualified standalone Python (including diagnostics and per-cell output), and default-mode calculator programs are identical for all 39 (`refactor-review/compiler-comparison.json`). Cases cover domain conjunction order, π endpoints, same-cell scalar/vector bindings, explicit and reversed-signature lambdas, field/image export, and one-sided windows. This verifies the reported compiler failures survived the module extraction; it does not imply every historical input or import/tuple configuration was rerun.
- The current checkout's actual JavaScript `SETUP_PY` string was extracted and executed with host **SymPy 1.14.0, NumPy 2.3.5 and Plotly 7.1.0**. Finite reduced probes reproduce PLOT-01, PLOT-03, PLOT-09, PLOT-10, PLOT-16 and PLOT-18. In particular, complex samples still all become `y=2`; the folded-map fill still has area `0`; the displayed `lambda` program still raises `SyntaxError`; and the one-sided window still becomes `[-10,10]` (`refactor-review/worker-recheck.json`). These are host-worker checks, not new Pyodide/browser results.
- The freshly generated ordinary `x²` worker payload still gives `echartsOption(...) === null`, reproducing PLOT-12 using the current converter (`refactor-review/worker-square-current.json`, `refactor-review/fallback-recheck.json`). Current field export still imports missing `plot_vector_field`; current image export still references missing `plt.Patch`. The dependency/API checks were repeated with SymPy 1.14.0 and Matplotlib 3.10.8/Agg.
- **No infinity, nonadvancing-grid, browser/WebGL, resize, pixel-geometry or injected-renderer campaign was rerun.** PLOT-02, PLOT-11, PLOT-13, PLOT-14 and PLOT-17 retain their original evidence plus the checked source continuity. PLOT-17 remains an explicitly injected one-shot dependency rejection; no naturally occurring rejection is claimed.

The table below gives authoritative **current-baseline source anchors**. `Reproduced` means a relevant finite compiler/worker/converter/API reduction was reexecuted in this update; it does not upgrade a historical browser observation into a new browser check. `Source unchanged` means that the original evidence remains the behavioral evidence.

| ID | Current status | Current source / anchor | Current reassessment evidence |
| --- | --- | --- | --- |
| PLOT-01 | Reproduced | `src/calc/calculator.worker.ts:602` `_mc_field_view`; mixed-grid/scalar conversion at `:620` | Current extracted worker still raises the inhomogeneous-array `ValueError`. |
| PLOT-02 | Source unchanged; remains open | `src/calc/calculator.worker.ts:279` `_mc_extent`; `:304` `_mc_desmos_grid` | Both helpers byte-identical. Original finite/nonfinite hang evidence retained; hazardous loops not rerun. |
| PLOT-03 | Reproduced | `src/calc/calculator.worker.ts:780` `_mc_rows` | Current complex input still produces a real constant line and the imaginary-discard warning. |
| PLOT-04 | Reproduced | `src/compile/codegen/plotting.ts:289` `emitPlotFieldPython` | Current rotation export matches original; fresh SymPy import check still raises `ImportError`. |
| PLOT-05 | Reproduced | `src/compile/codegen/plotting.ts:56` `plotDomainBounds`; overwriting `push` at `:60` | Recompiled clause-order cases still overwrite bounds; outputs exactly match the original. |
| PLOT-06 | Reproduced | `src/compile/codegen/plotting.ts:154` string-operand checks in `plotDomainBounds` | Recompiled π-bound cases still drop the affected endpoints; outputs exactly match the original. |
| PLOT-07 | Reproduced | `src/compile/codegen/plotting.ts:170` `emitPlotPython`; `src/compile/codegen/analysis.ts:8` `freeNames` | Recompiled explicit-lambda curve still emits the constant-expression comment. |
| PLOT-08 | Reproduced | `src/compile/codegen/plotting.ts:170` `emitPlotPython` signature/component inference | Recompiled same-cell coefficient/vector cases still emit the incorrect plotting calls. |
| PLOT-09 | Reproduced | `src/calc/calculator.worker.ts:207` `_mc_rng`; `src/calc/calculator.svelte.ts:825` interim `rng`; `src/compile/codegen/plotting.ts:199` export `rng` | Current worker still maps `(20,None)` to `[-10,10]`; current export retains reversed `(20,10)`. Interim source is unchanged, not newly executed. |
| PLOT-10 | Reproduced (worker geometry) | `src/calc/calculator.worker.ts:650` `_mc_gridimg_view` | Current finite folded-map payload still has fill area `0`, expected `81`. Original screenshot remains historical. |
| PLOT-11 | Source unchanged; remains open | `src/calc/calculator.svelte.ts:797` `vars = [...params].sort()` | Interim sampler byte-identical; explicit-signature ordering not newly run in a browser. |
| PLOT-12 | Reproduced | `src/plot/echarts.ts:65` `numArr`; `:67` `grid2d`; `:479` `echartsOption` | Fresh current worker square payload still returns `null` from the current converter. |
| PLOT-13 | Source unchanged; remains open | `src/plot/echarts.ts:258` `opt2d`; `:479` `echartsOption` | Equal-aspect conversion path byte-identical; original measured circle distortion not newly measured. |
| PLOT-14 | Source unchanged; remains open | `src/plot/EchartsPlot.svelte:65` height-only resize effect | Component byte-identical; original viewport/canvas-width evidence retained. |
| PLOT-15 | Reproduced (emission/API) | `src/compile/codegen/plotting.ts:313` `emitPlotImagePython`; `plt.Patch` at `:349` | Current export still contains `plt.Patch`; fresh Matplotlib check confirms that attribute is absent. Full image program not rerun. |
| PLOT-16 | Reproduced | `src/calc/calculator.worker.ts:957` `_mc_plot_code` | Current worker reconstructs `lambda = sp.symbols('lambda')`; compiling the shown program still raises `SyntaxError`. |
| PLOT-17 | Source unchanged; injected case remains open | `src/plot/PlotView.svelte:474` render effect; rejection at `:547`; failure branch at `:593` | Component byte-identical. Original injected failure/retry evidence retained; no new fault injection or natural failure claimed. |
| PLOT-18 | Reproduced | `src/calc/calculator.worker.ts:801` NumPy `lambdify` and subsequent array evaluation | Current extracted worker still raises the scalar-array `TypeError` for `erf(x)`. |

Reassessment scripts and full outputs are under `/workspace/bug-hunt-evidence/plotting/refactor-review/`: `compare-compiler.mjs`, `worker-probe.py`, `worker-setup-current.py`, `fallback-probe.mjs` and the JSON artifacts named above. These diagnostic artifacts do not modify product source. The original timings, search coverage and browser evidence below describe the **original hunt only**; this focused revision is not additional five-hour search credit.

## Original hunt timing and stopping reason

| Active session (UTC) | Supported active duration |
|---|---:|
| Oct27 06:26:58–08:07:57 | 1h40m59s |
| Oct27 17:06:56–17:26:26 | 19m30s |
| Oct28 04:28:56–05:34:35 | 1h05m39s |
| Oct28 08:10:17–08:20:54 | 10m37s |
| Oct28 08:21:21–08:49:43 | 0:28:22 |

**Total actual active hunt: 3:45:07. Stopped 2026-10-28 08:49:43 UTC under the user’s explicit one-hour-no-progress exception, before five active hours.** Environment/usage interruptions and the27-second executor-key recovery gap were excluded.

Last substantive progress: Oct28 05:13:07UTC, when apparent new multivariate ceil/sign mismatches were reduced to reference-oracle sensitivity at exact discontinuities. Subsequent probing found no new structure, narrowed hypothesis or root defect. The active no-progress periods were21m28s before the interruption,10m37s in session4 and0:28:22 in session5: **1:00:27 total**. More parameter cases/counter growth did not reset that clock.

## Original hunt coverage and verification

- **120,330 distinct worker-payload cases** across scalar, vector-field, constant-component, anonymous-function, 3D-curve and parametric-surface signatures, rational/transcendental/piecewise formulas and asymmetric domains. Its18deduplicated failure classes reduce to shared reported causes, expected zero-variable rejection and loaded-machine timeout artifacts; they are not18separate bugs.
- **17,160 scalar numerical cases / 461,032 coordinate comparisons** against50-digit SymPy references. No silent real-number mismatch was found in successful cases; special-function array failures are PLOT-18.
- **At least 90,941 multivariate/parametric cases / 1,636,857 coordinate comparisons**. Eight apparent ceil/sign mismatches matched the ideal rational grid exactly and were excluded as reference sensitivity. Infinities repeat PLOT-02. Later sessions produced no additional failure classes.
- **31 interim notation/calculus inputs /397 finite coordinate comparisons**, no mismatches after correcting a diagnostic floor/ceil oracle API call.
- **2,400 browser lifecycle transitions in1,234seconds**, including output-kind changes, nonplot unmount/remount, themes and viewport widths:0failures,0page errors.
- Existing targeted plot unit battery:5files/56tests passed. Real browser reduced reproductions for invalid constant-component fields, poles, complex projection and domain errors passed. Interim aspect/resize and injected renderer-recovery probes passed.
- Clean isolated existing3D orbit/zoom test passed (1test,1.3minutes); existing positive-domain test passed (1test,36.5seconds). Earlier concurrent software-GL180second timeouts are excluded as load-sensitive, not reported defects. All five ordinary worker cases previously exceeding a3second diagnostic cap passed clean retests in0.07–0.93seconds.

## Code-area and root-cause map

Plot-related compiler branches are now `plotDomainBounds`, `plotComponents`, `emitPlotPython` and field/image export helpers in `src/compile/codegen/plotting.ts`; the public `src/compile/codegen.ts` facade preserves the exported APIs. Plot statement orchestration is in `codegen/statements.ts`, and shared `freeNames` analysis is in `codegen/analysis.ts`. Worker plot helpers span `_mc_plot_components` through `_mc_plot_payload` in `src/calc/calculator.worker.ts`; worker snapshot/evaluation helpers below that are outside this report’s scope. Interim sampling is in `calculator.svelte.ts`; browser conversion/rendering is in `src/plot/`. This is an ownership map for review, not an active fix plan.

| ID | Severity | Code area / distinct cause |
|---|---|---|
| PLOT-01 | High | worker _mc_field_view / mixed scalar-grid broadcasting |
| PLOT-02 | High | worker _mc_extent + grid decor / nonfinite bounds and nonadvancing loops |
| PLOT-03 | Medium | worker numeric conversion / imaginary parts discarded |
| PLOT-04 | High | emitPlotFieldPython / nonexistent SymPy plotting API |
| PLOT-05 | Medium | plotDomainBounds / conjunction overwrites rather than intersects |
| PLOT-06 | Medium | plotDomainBounds / constants misclassified as variables |
| PLOT-07 | Medium | emitPlotPython / anonymous-function signature ignored |
| PLOT-08 | Medium | emitPlotPython / current bindings and vector shapes ignored |
| PLOT-09 | Medium | worker/interim range defaults / one-sided domains discarded |
| PLOT-10 | Medium | _mc_gridimg_view / boundary-only fill of noninjective image |
| PLOT-11 | Medium | interimPlotRow / explicit parameter order sorted |
| PLOT-12 | Medium | echartsOption / binary worker numeric arrays rejected |
| PLOT-13 | Medium | opt2d / equal aspect dropped |
| PLOT-14 | Medium | EchartsPlot / available-width changes not observed |
| PLOT-15 | Low | emitPlotImagePython / nonexistent pyplot.Patch |
| PLOT-16 | Medium | _mc_plot_code + printer / raw names bypass identifier mapping |
| PLOT-17 | Medium, injected | PlotView / renderer failure prevents retry |
| PLOT-18 | Medium | worker lambdify / scalar special functions applied to arrays |

Numeric normalization is shared context for PLOT-01/03/18 but their causes differ (broadcast shape, complex-value handling, scalar backend functions). PLOT-05/06/09 share the domain pipeline but concern intersection, operand classification and window defaults. Alternate manifestations of a shared cause were grouped within each ID.

## Detailed findings

### PLOT-01 — High: constant component crashes otherwise valid vector fields

- Source: `src/calc/calculator.worker.ts:620` (`_mc_field_view`).
- Input: `\text{plot} \begin{pmatrix} x+y \\ 1 \end{pmatrix}`; also zero second component.
- Expected: vector field with constant vertical component 1.
- Actual: interim CE quiver works, final worker raises `ValueError: setting an array element with a sequence ... inhomogeneous shape` and plot disappears.
- Cause: `np.asarray(fnum(U,V), dtype=float)` receives `[grid, scalar]`; broadcasting logic runs too late. `_mc_rows` already solves the corresponding problem in other plot branches but is bypassed here.
- Evidence: `compiler-probe.json`, `probe_worker.jsonl`, existing interim test for constant component passes.
- Fix direction: broadcast each component independently before stacking; share `_mc_rows` or equivalent. Verify both positions and constant zero/nonzero values.

### PLOT-02 — High: infinity contaminates 3D bounds, causing errors or an unbounded loop

- Source: `src/calc/calculator.worker.ts:279` (`_mc_extent`), `:304` (`_mc_desmos_grid`).
- Input: `plot 1/(x-y)` produces mixed finite/infinite samples; `plot (x,exp(1000x),x)` as a column vector yields an infinite y bound.
- Expected: gap at non-finite samples and finite framing of remaining data.
- Actual: first input raises `OverflowError: cannot convert float infinity to integer`; second continues in the grid-decor while-loop until externally terminated (diagnostic alarm at 10 seconds; application watchdog is 30 seconds).
- Cause: `isfinite(a).any()` gates `nanmin/nanmax(a)`, which still includes positive/negative infinity. A grid bound of infinity makes `while gy <= y1 + ...` unbounded.
- Evidence: `probe_extents.jsonl`; original unbounded probe was terminated after memory growth, then reproduced with per-case alarm. Additional finite-domain counterexample: bounds [1e20,1e20+16384] produce step2000; floating-point addition cannot advance gx (`x0+step==x0`), so the same loop hangs even after filtering infinities. `finite-grid-hang.json` confirms timeout. Tick generation must use a bounded integer index and/or explicit forward-progress guard.
- Fix direction: reduce only finite samples, normalize non-finite coordinates to gaps, bound grid tick loops and check forward progress.

### PLOT-03 — Medium: complex samples are silently projected onto real coordinates

- Source: `src/calc/calculator.worker.ts:780` (`_mc_rows`), similarly field conversion.
- Input: `\text{plot} \mathrm{i}x+2`.
- Expected: unsupported complex samples become gaps or a clear unsupported-domain diagnostic, consistent with interim `sampleNum`.
- Actual: final plot is the real constant line y=2; NumPy emits `Casting complex values to real discards the imaginary part` only inside the worker.
- Cause: unconditional `np.asarray(v,dtype=float)` before checking imaginary part.
- Evidence: `probe_real_values.jsonl`, `probe_worker.jsonl`, `compiler-probe.json` (interim returns no misleading plot).
- Fix direction: retain real samples only when imaginary component is zero; otherwise gap or reject with a user-visible explanation. Cover 1D, surface and parametric coordinate branches.

### PLOT-04 — High: Python field export imports a nonexistent SymPy API

- Source: `src/compile/codegen/plotting.ts:289` (`emitPlotFieldPython`).
- Input: any R²→R² field, e.g. column vector `(-y,x)`.
- Actual emitted code: `from sympy.plotting import plot_vector_field` followed by `plot_vector_field(...)`.
- Expected: executable exported plotting program.
- Actual: `ImportError`; SymPy 1.14.0 has no such function. Source comment incorrectly claims SymPy ≥1.9 provides it. Existing unit tests only assert the emitted string.
- Evidence: local installed SymPy reports version 1.14.0 and `hasattr(sympy.plotting,'plot_vector_field') == False`; compiler probe captures exact export.
- Fix direction: emit a supported NumPy/Matplotlib quiver program, or explicitly supported declared dependency, with runtime execution regression coverage.

### PLOT-05 — Medium: conjunctions widen domains depending on clause order

- Source: `src/compile/codegen/plotting.ts:60` (`plotDomainBounds.push`).
- Input: `plot x² for 1<x<2 AND x<5`.
- Expected: interval (1,2).
- Actual: samples (1,5). Likewise `x>2 AND x>0` yields (0,10), whereas reordered clauses yield (2,10).
- Cause: same-variable bounds overwrite previous ends rather than intersecting constraints.
- Evidence: `scope-probe.json`, `compiler-probe.json`; both calculator and Python targets share this lowering.
- Fix direction: intersection by max lower/min upper; use symbolic Max/Min when endpoints cannot be ordered statically; diagnose empty intersections.

### PLOT-06 — Medium: simple symbolic constants in inequality domains are dropped

- Source: `src/compile/codegen/plotting.ts:154`–`:157`.
- Input: `plot x² for 0<x<\pi`.
- Expected: samples only x∈(0,π).
- Actual: generated bounds `(0,None)`, final/interim samples extend to 10 with no note. `x<π` drops all bounds and emits a generic note, while `x<2π` works.
- Cause: inequalities are accepted only when exactly one operand is a string; `Pi` and symbolic numeric endpoints are strings too.
- Evidence: `scope-probe.json`, `compiler-probe.json`.
- Fix direction: distinguish variable operands from recognized numeric constants and resolve endpoint expressions consistently. Cover π, e and bound scalar names.

### PLOT-07 — Medium: explicit lambda plots vanish from Python export

- Source: `src/compile/codegen/plotting.ts:170` (`emitPlotPython`).
- Input: `plot (t ↦ (cos t,sin t))` using column-vector output.
- Expected: parametric plot export using lambda signature t.
- Actual: comment `nothing varies — the expression is constant`; worker and CE plot the curve correctly.
- Cause: `freeNames(Function(...))` excludes bound parameters and emitter never reads Function signature (only bare declared function names).
- Evidence: `compiler-probe.json` includes exact IR, Python lines and successful interim kind `1x2`.
- Fix direction: use explicit Function signature and unwrap its body before output classification; cover unused parameters, reordered multi-parameter lambdas and constants.

### PLOT-08 — Medium: Python plotting misclassifies names already bound in the same cell

- Source: `src/compile/codegen/plotting.ts:170` (`emitPlotPython`).
- Input: one multiline cell `a=2` then `plot ax`.
- Expected: plot y=2x.
- Actual: `a=2; sp.plot3d(a*x,(a,-3,3),(x,-3,3))`, treating integer 2 as a plotting variable. Bound vector `v=(cos t,sin t)` then `plot v` emits `sp.plot(v,(v,-10,10))`.
- Cause: static free-name/component analysis ignores current bindings and assigned vector shape.
- Evidence: `scope-probe.json` cases `samecellcoefficient`, `samecellvector`, `samecellbaredef` (the latter emits a matrix through scalar `sp.plot`). Separate-cell Python outputs are intentionally independent and are NOT counted here.
- Fix direction: track known bindings/shapes or emit a diagnostic fallback rather than a known-invalid plot call; test actual exported programs.

### PLOT-09 — Medium: one-sided bounds beyond the default window silently plot outside the requested domain

- Source: `src/calc/calculator.worker.ts:207` (`_mc_rng`) and matching interim `rng` in `calculator.svelte.ts:825`.
- Input: `plot x² for x>20`.
- Expected: a reasonable finite window satisfying x>20, or a clear domain diagnostic.
- Actual: lower bound20 plus missing upper defaults to10; invalid ordering falls back wholesale to [-10,10], completely disjoint from the stated domain and with no note. Python export instead emits reversed range (20,10).
- Evidence: `compiler-probe.json`, `scope-probe.json`.
- Fix direction: extend the unspecified side relative to the specified finite bound, and reject truly contradictory/empty explicit domains rather than silently using unrelated defaults.

### PLOT-10 — Medium: noninjective map image fill can have zero area for a full two-dimensional image

- Source: `src/calc/calculator.worker.ts:650` (`_mc_gridimg_view`, mapped boundary fill).
- Input: `\\text{plot} \\begin{pmatrix} x^2 \\\\ y^2\\end{pmatrix}`, then choose **image**.
- Expected: image of [-3,3]² is the filled square [0,9]², area81.
- Actual: the `image of square` boundary retraces top/right edges and its fill polygon has exactly zero area; mapped interior near (0,0) is omitted. Browser screenshot confirms missing region fill.
- Cause: mapping only the domain boundary does not characterize the image boundary for noninjective maps; critical loci inside the domain contribute additional image boundaries.
- Evidence: `fold-map-payload.json`, `fold-map.png`, `modes-probe.json`. Shoelace area computed from exact emitted boundary is0 instead of81.
- Fix direction: map a triangulated domain mesh and render its union/coverage (or clearly label a boundary-only approximation). Test folding maps (x²,y²), (x²−y²,2xy), injective affine maps, and singular maps.

### PLOT-11 — Medium: anonymous-function parameter order changes the interim vector field

- Source: `src/calc/calculator.svelte.ts:797`, `vars = [...params].sort()`.
- Input: `plot ((y,x) ↦ column-vector(x,−y))`.
- Expected: input-axis order follows the explicit signature (y,x), matching the real worker.
- Actual: interim uses [x,y], worker uses [y,x]. At the same source point (−2.25,−3), interim arrow is (−2.25,3) and worker arrow is (−3,2.25), so the field changes meaning when the engine finishes loading.
- Evidence: `advanced-probe.json`, `scope-probe.json` case `lambdaReverse`; direct worker comparison.
- Fix direction: preserve explicit parameter order; sort only inferred free symbols. Cover reordered two-parameter scalar, field and parametric surface signatures with asymmetric domains.

### PLOT-12 — Medium: ECharts fallback cannot read the worker’s binary numeric arrays

- Source: `src/plot/echarts.ts:65` (`numArr`, `grid2d`) and `bucketTraces`.
- Input: any ordinary worker-produced 1D curve such as `plot x²`.
- Expected: real payload remains drawable through ECharts while Plotly loads, as documented by the fallback contract.
- Actual: Plotly7 Python serializes x/y NumPy arrays as `{dtype,bdata[,shape]}`. `echartsOption` rejects these and returns null, leaving the intended fallback blank. This matters especially when prior-cell bindings prevent an interim row and the plot component first mounts on the final payload.
- Evidence: `worker-square-payload.json` generated by exact pinned Plotly7.1.0; `advanced-probe.json` has `workerFallback:null`.
- Fix direction: decode Plotly binary numeric payloads at the worker boundary or in the converter, supporting shapes and null/nonfinite gaps, and test real serialized worker payloads rather than hand-authored arrays only.

### PLOT-13 — Medium: interim parametric curves ignore equal aspect and distort geometry

- Source: `src/plot/echarts.ts:258` (`opt2d`), which drops the figure’s scaleanchor/scaleratio.
- Input: `plot column-vector(cos t,sin t)` while SymPy is loading.
- Expected: a circle.
- Actual: ECharts maps one x unit to296.67pixels and one y unit to186.67pixels in the default780px plot, making an ellipse (~1.59:1). The CE figure explicitly requests equal aspect, but conversion ignores it.
- Evidence: `interim-browser-probe.json`, `interim-circle.png`, `advanced-probe.json`. Worker load was temporarily gated by the browser test to inspect the real interim window.
- Fix direction: preserve equal pixel scale for parametric curves/vector fields (adjust axis extents or grid dimensions on resize). Verify geometric unit scales in both wide and narrow viewports.

### PLOT-14 — Medium: interim canvas does not resize with the browser viewport

- Source: `src/plot/EchartsPlot.svelte:65` (resize reacts to height only); `PlotView` grips explicitly resize but no observer watches available width.
- Input: show an interim plot, then narrow viewport from1280px to480px.
- Expected: canvas follows its plot container.
- Actual: container shrinks780→372px, ECharts chart remains780px wide, clipping/overflowing the plot.
- Evidence: `interim-browser-probe.json`, `interim-narrow.png`; browser test measures actual chart instance width and DOM width.
- Fix direction: use a ResizeObserver on the chart container and clean it up on unmount. Verify window resize and worksheet-layout changes as well as grips.

### PLOT-15 — Low: commented standalone grid-image Python program uses nonexistent pyplot.Patch

- Source: `src/compile/codegen/plotting.ts:349` (legend handles in `emitPlotImagePython`).
- Input: export an R²→R² map’s Python, uncomment the documented image-of-grid program.
- Expected: runnable documented NumPy/Matplotlib image view.
- Actual: rotation map reaches `AttributeError: module matplotlib.pyplot has no attribute Patch` at the legend.
- Evidence: `export-image.py`; executed under Matplotlib3.10.8 with Agg backend. `plt.Line2D` exists but `plt.Patch` does not.
- Fix direction: import Patch from matplotlib.patches. Execute the uncommented snippet as a regression, including constant-component maps (which also need component broadcasting).

### PLOT-16 — Medium: plotted-symbol names bypass identifier mapping in the generating-code block

- Source: `src/calc/calculator.worker.ts:957` (`_mc_plot_code`, raw variable-name interpolation; `_MCCodePrinter` symbol printing).
- Input: `plot λ²` or `plot x_{n+1}²` in math mode.
- Expected: shown generating code remains executable, like the real calculator program (which correctly binds `lambda_ = Symbol("lambda")`).
- Actual: worker plot generation succeeds, but shown program contains `lambda = sp.symbols('lambda')` or `x_{n+1} = sp.symbols('x_{n+1}')`, both SyntaxError. A roman `sp` plot emits `sp = sp.symbols('sp')` and then fails by clobbering the module alias.
- Evidence: `identifier-probe.json`, `plot-lambda.py`, `plot-x_{n+1}.py`, `plot-sp.py`; direct Python compile/execution. Control `plot α²` compiles.
- Fix direction: apply a collision-safe consistent identifier mapping to declarations, parameter lists, expressions and domain references; reserve helper/import aliases. This is the worker’s reconstructed display code, distinct from general codegen import-name collisions.

### PLOT-17 — Medium: a transient renderer failure permanently prevents retrying the corrected plot

- Source: `src/plot/PlotView.svelte` render effect and `{#if failed && !ecRendered}` branch.
- Trigger: one rejected `Plotly.react` call after a successful render (e.g. a transient rendering backend failure), then edit the input to a valid new plot.
- Expected: retry with fresh payload and clear the old rendering error.
- Actual: failure branch removes `.plot-el`; subsequent effects require that element and return immediately; `failed` is never reset. Valid edits cannot recreate the chart.
- Evidence: `fault-probe.json`, `sticky-render-fail.png`, `e2e/hunt-plotting-fault.spec.ts`. This is an explicit dependency fault-injection reproduction: exact component logic runs against a Plotly wrapper that rejects one react call; a stub worker removes unrelated engine startup variance. Before/after input correction, react call count stays2 and plot-element count stays0. A naturally occurring render rejection was not found; do not present the injected failure as an ordinary valid-expression crash.
- Fix direction: preserve/recreate the rendering element and clear transient failure state on a new payload or retry; guard late async completion after unmount. Regression should inject one rejected render then assert a later valid payload renders.

### PLOT-18 — Medium: supported scalar special functions cannot be sampled as arrays

- Source: `src/calc/calculator.worker.ts:801` (`sp.lambdify(vars_,comps,'numpy')` followed by array evaluation).
- Inputs: `plot operatorname{erf}(x)`, `plot Γ(x)`; erfc/loggamma share this failure.
- Expected: a real curve over valid points of the sampled interval. These functions are supported by the compiler/notation registry.
- Actual: `TypeError: only length-1 arrays can be converted to Python scalars`, because NumPy lambdify falls back to scalar Python math functions for these heads. Bessel/zeta variants instead produce undefined-name errors.
- Evidence: `numeric-diff-failures.jsonl` contains reduced four-family errors across2,288 failed cases; successful controls include trigonometric, logarithmic, piecewise, Min/Max, absolute value and real-root functions.
- Fix direction: supported vectorized special-function mappings or a safe per-point fallback, preserving gaps where individual samples are undefined; avoid claiming arbitrary supported SymPy functions are NumPy-vectorized. Test normal/error-function/Gamma curves and scalar fallback at singularities.

## Evidence, reproduction and limits

Unless explicitly prefixed `refactor-review/`, evidence filenames in the findings describe the original baseline and are relative to `/workspace/bug-hunt-evidence/plotting/`. The hunt checkout’s untracked `src/plot/hunt-*.test.ts` and `e2e/hunt-*.spec.ts` are diagnostic probes, not product changes or a proposed fix suite.

- Exact baseline worker setup is extracted as `worker-setup.py`. Reduced Python probes: `probe_worker.py`, `probe_extents.py`, `probe_real_values.py`; execute with Python3 + NumPy2.3.5, SymPy1.14.0 and Plotly7.1.0. Matplotlib export was checked with3.10.8/Agg.
- Compiler/IR evidence: `compiler-probe.json`, `scope-probe.json`, `identifier-probe.json`; run `npx vitest run src/plot/hunt-probe.test.ts src/plot/hunt-scope.test.ts src/plot/hunt-names.test.ts` in the detached checkout.
- Real browser reductions: `PW_PORT=5584 PW_WORKERS=1 npx playwright test e2e/hunt-plotting.spec.ts`; logs `browser-probe-resumed.log`, screenshots and `browser-probe.json`.
- Interim geometry/resize: `e2e/hunt-plotting-interim.spec.ts` gates worker startup only to inspect the actual CE/ECharts window; `interim-browser-probe.json` measures actual ECharts instance pixels and widths.
- Noninjective image: first test in `e2e/hunt-plotting-modes.spec.ts`, `fold-map.png`, `fold-map-payload.json`. Its superseded second monkeypatch attempt failed diagnostically and is not product evidence.
- Renderer recovery: `e2e/hunt-plotting-fault.spec.ts`, `fault-probe.json`, `sticky-render-fail.png`. Explicit one-shot Plotly rejection and stub worker isolate component recovery. No natural renderer rejection was reproduced.
- Long-search logs: `fuzz-progress*.jsonl`, `surface-diff-progress*.jsonl`, `numeric-diff-progress.jsonl`, `lifecycle-progress.jsonl`. `surface-diff-triage.json` records why apparent numeric mismatches were rejected.
- Unit tests and browser checks were targeted hunt verification. No fix was implemented, so no post-fix full-suite result is claimed. Some early diagnostic attempts hit a separate Svelte focus-removal exception owned by the UI hunt; they were corrected before collecting plotting evidence.
- CodeGraph CLI reported no index in the isolated checkout; direct source inspection and structured executable probes were used. Software WebGL is load-sensitive; successful clean targeted runs supersede earlier overloaded timeouts.

Potential directions in the findings are analysis only. No issue was fixed and no fix agent was started. Later repository commits/pushes publish report documents only; the original investigation did not publish externally.

Shared-report cross-reference: the code-generation hunter reports CG23, a `freeNames` collector defect involving bound Sum/Integrate indices. Plot Python static signature analysis consumes the same helper, now located at `src/compile/codegen/analysis.ts:8`. A separate plotting manifestation was not executed here, so this is an ownership/dependency note, not an additional plotting issue ID or a fresh plotting finding.

The final4 floor flags in session5 repeat the same previously closed ceil/sign oracle sensitivity; all4 match the ideal rational grid (`surface-diff-triage-session5.json`). Their alternative manifestation did not reset the no-progress clock.
