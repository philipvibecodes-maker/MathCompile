# MathCompile bug-hunt reports

Repository: https://github.com/philipvibecodes-maker/MathCompile

Baseline: `eb8cdc2318f219d2f6d97cfe1dcc67c5d2ba268f`

**All four investigations are complete. There are 127 numbered findings across the reports. No fixes were made.** The user cancelled the original later fix phase; no fix agents or product patches were made. The completed reports are published separately from product code at the user’s request.

## Reports and stopping conditions

| Area | Findings | Credited active search | Stopping condition | Report |
| --- | ---: | --- | --- | --- |
| UI | 34 | 5h00m24.613s | Five active hours completed | [UI report](ui.md) |
| Code generation and calculator execution | 39 | 5h00m10.598s | Five active hours completed | [Code-generation report](codegen.md) |
| Rendering and mathematical display | 36 | 5h00m30s | Five active hours completed | [Rendering report](rendering.md) |
| Plot compilation, sampling, and chart display | 18 | 3h45m07s | 1h00m27s without substantive progress | [Plotting report](plotting.md) |

Individual reports contain ordered findings indexes, severity, exact inputs and reproduction steps, expected versus actual behavior, source locations, root-cause analysis, named evidence, and validation limits. Suggested remediation is analysis only; none was implemented.

The numbered findings are grouped by investigator ownership. Related symptoms and shared causes are identified within the reports; several findings group multiple manifestations. Raw fuzzer failures and uncertain hypotheses are not additional confirmed bug counts. Browser, host-runtime, pure-unit, source-only, conditional, and deliberately injected evidence are distinguished. In particular, plotting PLOT-17 uses an explicit one-shot dependency rejection, and some UI/layout compatibility conclusions remain qualified rather than claimed as real-platform tests.

## Examples to review first

- **UI-01, UI-21, UI-27:** cell conversion can rewrite Python source; colliding worksheet IDs can reuse another sheet's undo history; numeric undo can leave displayed input, output, and persisted source inconsistent.
- **CG-03, CG-06:** typed large integers can produce incorrect arithmetic, and subtraction of parenthesized sums can lose necessary grouping.
- **CG-07, CG-09:** edited or deleted Python mutations can survive cached rollback, and a trailing Python expression can execute twice.
- **RENDER-12, RENDER-14:** accepted mathematical input can be replaced with unrelated symbols, and an empty basis can be displayed as the empty set instead of the zero subspace.
- **PLOT-02:** nonfinite or extreme finite plot bounds can trigger errors or nonadvancing grid-generation loops.

These examples are entry points into the detailed reports, not a separate implementation plan or an exhaustive priority list.

## Timing and interruptions

The requested rule was five hours of active searching per investigator, with early completion after one full active hour without meaningful progress. All four investigators met one of those conditions. Plotting used the explicit early-stop exception; the other three completed five active hours.

Quota limits, environment resets, and paused or blocked review periods split the work across sessions. These gaps, waiting, and final editorial cleanup are excluded from credited search time. Additional counters from saturated test families did not reset the no-progress clock. Each report records its supported active windows and exact stopping reason. Detailed technical evidence logs retain explicit UTC timestamps.

## Untouched baseline validation

- Unit tests: **26 files, 990 tests passed**.
- Vendored MathQuill suite: **944 assertions passed**, checked independently against its static test page.
- Type checking: **zero errors**, three existing warnings.
- Lint and production build: passed with existing warnings.
- Production browser baseline, run in fresh processes per spec: **19 of 21 non-vendor spec files passed**. The palette blur assertion in `escape.spec.ts` was reproduced as intermittent behavior and is documented as UI-11. The 3D interaction in `plot.spec.ts` timed out under parallel load; a clean isolated rerun subsequently passed and is treated as a testing limitation, not another confirmed defect.
- Earlier whole-suite runs were interrupted by a stopped dev server and retained-page memory pressure. Their connection failures and resulting timeouts do not establish additional application defects.

Diagnostic tests sometimes deliberately assert the observed defect state. A passing diagnostic therefore confirms its reproduction, not a repaired product. No post-fix test result is claimed because there were no fixes.

## Evidence and workspace

Raw logs, screenshots, probe outputs, campaign records, and timing evidence are retained under `/workspace/bug-hunt-evidence/`. Exact filenames and reproduction commands are listed in each report. Diagnostic scripts remain in the corresponding isolated `/workspace/hunt-*` worktrees; their product source stays at the pinned baseline.

The main repository contains these report documents only as new task artifacts. Its temporary baseline Playwright configuration was archived to `/workspace/bug-hunt-evidence/playwright.hunt.config.ts`; copy it back to the repository root if rerunning the archived per-file baseline harness, because its import is relative to that root. No product file was changed.
