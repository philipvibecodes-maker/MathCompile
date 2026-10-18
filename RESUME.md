# Resume: ℝ²→ℝ² interactive plots (quiver + grid-image)

State as of session end — everything below is already on disk.

## What's done

- `main` is at 71d9892 (includes the merged ECharts interim PR #103
  and plotly plotting #85).
- Scaffold branch `devin/r2r2-plots-base` (2 commits on top of main)
  lives in worktree `/home/claude/personal-utilities/MathCompile-wt-plots-main`.
  It wires the 2x2 signature end to end with stub builders:
  - `src/plot/types.ts`: kind '2x2' added.
  - `src/calc/calculator.worker.ts`: `_mc_plot_payload` accepts
    d=2/c=2; `_mc_plot_figure`'s `c==2` branch builds ONE figure with
    a `field`/`image` mode menu (`_mc_plot_menu` now takes optional
    per-button relayout args; `_mc_range_rel`/`_mc_mode_vis` moved to
    `_MC_VIEWS_SRC`); stub helpers `_mc_field_view` (`_MC_FIELD_SRC`)
    and `_mc_gridimg_view` (`_MC_GRIDIMG_SRC`) are exec'd AND shown
    verbatim in the generating-code block; `_mc_plot_code` emits the
    matching 2x2 program.
  - `src/calc/calculator.svelte.ts`: interim gate allows 2x2; stub
    `interimFieldTraces` returns null until implemented.
  - `src/compile/codegen.ts`: `emitPlotPython` delegates 2x2 to stubs
    `emitPlotFieldPython` (real lines) + `emitPlotImagePython`
    (auto-'# '-commented lines).
  - `src/plot/theme.ts`: 'img-src' trace themed to the guide color.
  - `src/compile/plot.test.ts`: 2x2 python test updated to the stub
    shape. All 921 vitest tests pass; svelte-check clean; lint clean.
- Custom subagent profile `swe2-medium` (`model: swe-2-medium`,
  write-capable) is at `~/.config/devin/agents/swe2-medium.md` — it is
  picked up at session start (a mid-session spawn failed with
  "Unknown subagent profile").
- Agent worktrees (both at the scaffold head e875477):
  - `/home/claude/personal-utilities/MathCompile-wt-quiver` on
    `devin/r2r2-quiver`
  - `/home/claude/personal-utilities/MathCompile-wt-gridimg` on
    `devin/r2r2-grid-image`

## Next step: spawn the two agents

Launch two BACKGROUND subagents with profile `swe2-medium`:

1. **Quiver** — worktree `MathCompile-wt-quiver`, plan file
   `/home/claude/personal-utilities/MathCompile-wt-plots-main/PLAN-QUIVER.md`.
   Implements `_mc_field_view` (worker), `interimFieldTraces`
   (interim CE sampling), `emitPlotFieldPython` (sp.plot_vector_field),
   tests + `e2e/plot-field.spec.ts` (PW_PORT=5611).
2. **Grid image** — worktree `MathCompile-wt-gridimg`, plan file
   `/home/claude/personal-utilities/MathCompile-wt-plots-main/PLAN-GRIDIMG.md`.
   Implements `_mc_gridimg_view` (worker), `emitPlotImagePython`
   (commented matplotlib program), tests + `e2e/plot-image.spec.ts`
   (PW_PORT=5612).

## Then: merge into one PR

- Integration branch (e.g. `devin/r2r2-plots`) off `devin/r2r2-plots-base`,
  merge `devin/r2r2-quiver` + `devin/r2r2-grid-image`. Owned-file split
  should make merges clean (field vs gridimg stubs; adjacent
  emitPlot*Python fns may need a trivial resolve).
- Update AGENTS.md / CALCULATOR-ENGINES.md plot docs yourself.
- `npm run check`, `npm test`, `npm run lint`, then
  `PW_PORT=5613 npx playwright test e2e/plot.spec.ts e2e/plot-field.spec.ts e2e/plot-image.spec.ts`
  (real Pyodide boot — slow, run anyway).
- Push + `gh pr create`.
