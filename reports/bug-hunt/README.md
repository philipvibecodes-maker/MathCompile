# MathCompile bug-hunt reports

Repository: https://github.com/philipvibecodes-maker/MathCompile

Original investigation baseline: `eb8cdc2318f219d2f6d97cfe1dcc67c5d2ba268f`

Current review baseline: `8e69e4d92e18b534d51a98f369c66a6778ea6637` — [merged compiler refactor, PR #113](https://github.com/philipvibecodes-maker/MathCompile/pull/113).

**All four investigations are complete. There are 127 numbered findings across the reports. No fixes were made.** The user cancelled the original later fix phase; no fix agents or product patches were made. The completed reports are published separately from product code at the user’s request.

## Review after the merged refactor

The reports were reassessed on **2026-10-29** against the merged commit above. This is a bounded reassessment of the existing findings, not another five-hour investigation. The original timing, severity, inputs and observations remain an audit record for the original baseline. Each report now gives current status, new implementation locations, and the extent of fresh validation for its findings. Original monolithic `codegen.ts` / `ir.ts` line references in historical analysis must be read alongside those current mappings; the public files are now facades.

PR #113 separates compiler and normalization responsibilities, introduces checked IR tuple helpers and explicit cell-state boundaries, adds regression tests, and repairs performance-test assumptions. It does not change product UI, editor, storage, calculator worker, plotting renderer, notation registry, or vendored MathQuill implementations. Passing the refactor's tests alone does not establish that a reported defect was fixed. The individual reviews distinguish fresh reproductions from findings carried forward through source comparison; source-identical findings are not presented as fresh browser tests.

**All 127 finding groups are retained; none is established as fixed by this refactor.** Each of the 39 code-generation groups has a freshly reproduced representative manifestation. Other areas combine bounded rechecks with explicitly labeled unchanged-source carryforwards, as summarized below.

Fresh checks executed on the merged baseline:

| Check | Result |
| --- | --- |
| `npm test -- --maxWorkers=2` | **1,021 tests passed across 30 files**, including the new compiler baseline, normalized-IR, ordering and state-lifetime suites. |
| `npm run check` | **0 errors**, 3 existing warnings. |
| `npm run lint` | Passed with 7 existing warnings. |
| `npm run build` | Passed with existing Svelte and bundle-size warnings. |
| `node scripts/check-compiler-boundaries.mjs` | **35 modules, no cycles**, including type imports. |

New logs and probe artifacts are under `/workspace/bug-hunt-evidence/refactor-review/` and the report-specific paths identified in each revision section. The refactor's own reported e2e/performance results are documented in [`docs/compiler-refactoring-report.md`](https://github.com/philipvibecodes-maker/MathCompile/blob/8e69e4d92e18b534d51a98f369c66a6778ea6637/docs/compiler-refactoring-report.md); those are upstream results, not browser or performance reruns performed for this reassessment. No new full browser suite or renewed fuzzing campaign is claimed.

Current reassessment coverage:

| Area | Fresh evidence and retained limits |
| --- | --- |
| UI | 28 Node diagnostic tests reproduce mechanisms for UI-21/22/24/25/26; 29 other findings carried forward through unchanged-source review. UI-21's browser undo consequence and UI-26's real keyboard-layout consequence were not rerun. |
| Code generation | All 39 groups have a freshly reproduced representative manifestation. Across 376 retained worksheet cases, IR, Python, calculator metadata and diagnostics match the original outputs in both import modes. 36 regenerated worksheet cases were executed in both modes; edit/delete rollback, import-prelude caching, standalone dependency omission and compiler exceptions received separate checks. No new browser/Pyodide run. |
| Rendering | Four pure-helper defects reproduced (RENDER-22/32/33/35), two source/CSS contradictions rechecked (RENDER-34/36), and 30 findings carried forward through unchanged-source review. No new browser, worker, or depth/capacity tests. |
| Plotting | 39 retained compiler cases match the original outputs; 13 findings have fresh finite compiler/host-worker/converter/API reductions, and 5 are carried forward through unchanged-source review. No grid-loop, browser/WebGL, resize, or renderer-fault campaign rerun; PLOT-17 remains an injected case. |

## Reports and original stopping conditions

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

## Original investigation baseline validation

- Unit tests: **26 files, 990 tests passed**.
- Vendored MathQuill suite: **944 assertions passed**, checked independently against its static test page.
- Type checking: **zero errors**, three existing warnings.
- Lint and production build: passed with existing warnings.
- Production browser baseline, run in fresh processes per spec: **19 of 21 non-vendor spec files passed**. The palette blur assertion in `escape.spec.ts` was reproduced as intermittent behavior and is documented as UI-11. The 3D interaction in `plot.spec.ts` timed out under parallel load; a clean isolated rerun subsequently passed and is treated as a testing limitation, not another confirmed defect.
- Earlier whole-suite runs were interrupted by a stopped dev server and retained-page memory pressure. Their connection failures and resulting timeouts do not establish additional application defects.

Diagnostic tests sometimes deliberately assert the observed defect state. A passing diagnostic therefore confirms its reproduction, not a repaired product. No post-fix test result is claimed because there were no fixes.

## Evidence and workspace

Raw logs, screenshots, probe outputs, campaign records, and timing evidence are retained under `/workspace/bug-hunt-evidence/`. Exact filenames and reproduction commands are listed in each report. Diagnostic scripts remain in the corresponding isolated `/workspace/hunt-*` worktrees; their product source stays at the pinned baseline.

The reports branch contains documentation changes only. The merged refactor was inspected in a separate detached worktree at `/workspace/refactor-review`; it was not merged into the reports branch. The main repository's temporary original-baseline Playwright configuration was archived to `/workspace/bug-hunt-evidence/playwright.hunt.config.ts`; copy it back to the repository root if rerunning the archived per-file baseline harness, because its import is relative to that root. No product file was changed by either reporting pass.
