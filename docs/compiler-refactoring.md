# Compiler refactoring

Baseline: main at `eb8cdc2318f219d2f6d97cfe1dcc67c5d2ba268f`.

## Baseline verification

- `npm ci` and `npm ci --prefix vendor/mathquill`: passed.
- `npm run check`: 0 errors, 3 existing Svelte warnings.
- `npm run lint`: passed with 7 existing warnings.
- `npm test`: 990 tests in 26 files passed.
- `npm run build`: passed; existing Svelte and large-chunk warnings.
- `npm run test:e2e:smoke`: 14 passed after `npx playwright install chromium`.
  Initial missing-browser failures were environment setup failures.
- Full E2E: retained runner status passed; repeating to retain exact counts.
- `PERF_LABEL=baseline-eb8cdc2 npm run test:perf`: 14 passed, 2 failed.
  `options: target switch -> output repaint` and `typing: keystroke -> output
  panel reflects the character` both fail with `timed: outcome never became
  true` on unchanged main. These tests remain unchanged.
- Baseline startup paint p50/p95: 574.8/607.7 ms (5 samples).
  Single-cell typing paint: 47.7/110.1 ms (30 samples).
  30-cell typing paint: 28.8/43.8 ms (20 samples).
  Measurements are environment-specific, not performance claims.

`npx vitest run src/compile/baseline.test.ts` reproduces 11 case groups
across both import modes and both tuple modes (44 combinations). The fixture
pins raw parsing, normalized IR, generated Python, calculator statements,
line metadata, and diagnostics. Runtime source is deduplicated only on disk.
Do not regenerate expected outputs to accommodate structural changes.

## Original dependencies and invariants

`compileWorksheet -> cellStatements -> cellBody -> emitStatement -> Emitter`.
`compileCellsForCalc -> compileCellInScope -> cellBody`; plotting uses the
emitter. Scope depends on declaration scans and pure name/matrix analysis.
The interim calculator also imports free-name, constant-allocation,
declaration, and plot-analysis helpers through the public codegen module.

The runtime module graph is acyclic. Python exports use fresh emission
state for each standalone cell. Calculator cells share a scope in source
order. Python-function discovery is worksheet-wide, including its existing
call-above-definition notes. Preserve these differences.

Normalization uses one recursive traversal and ordered first-match rules;
`DECLINE` permits later rules. Rule predicates must not normalize or emit
issues. Declaration discovery and line attribution happen in the traversal.
