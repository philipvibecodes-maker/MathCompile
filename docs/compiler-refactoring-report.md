# MathCompile refactoring report

Baseline: `eb8cdc2318f219d2f6d97cfe1dcc67c5d2ba268f` on main.
Changes are recorded as a series of independently validated local commits.

## A. Summary

The public compiler entry points now delegate to cohesive implementation
modules. Code generation separates worksheet orchestration, cell assembly,
statements, plotting, scope ownership and expression domains. Normalization
separates parsing, shapes, diagnostics, differential/solver/statement helpers
while keeping the ordered rules and recursive traversal together.

The existing architecture, source-order semantics and notation registry remain
in place. There are no new dependencies, storage migrations or vendor changes.
See [compiler-refactoring.md](compiler-refactoring.md) for the dependency map,
state-lifetime table, ordering contracts, baseline and architectural tradeoffs.

## B. Significant files changed

| Responsibility | Files |
| --- | --- |
| Compatibility APIs | `src/compile/codegen.ts`, `src/compile/ir.ts` |
| Code generation | `src/compile/codegen/`: worksheet/cells, statements, plotting, emitter, bound operators, derivatives, functions, collections, scope, analysis/declarations, identifiers/nodes, shared head/precedence metadata and contracts |
| IR and normalization | `src/compile/ir/`: types, normalized tuples, parse, normalize, context, shapes, diagnostics, differentials, solvers, statements |
| Regression coverage | `src/compile/baseline.test.ts`, `fixtures/compiler-baseline.json`, `state-lifetimes.test.ts`, `ir/normalized.test.ts`, `ir/ordering.test.ts` |
| State boundary coverage | `src/state/store.test.ts`, `src/state/persistence.test.ts` |
| Verification tools | `scripts/check-compiler-boundaries.mjs`, `scripts/benchmark-compiler.mjs` |
| Documentation | `AGENTS.md`, `docs/compiler-refactoring.md`, this report |

Production store, persistence, editor, calculator worker and notation registry
implementations retain their existing behavior.

## C. Type-safety improvements

`RawMathJson` explicitly names the external permissive representation;
`MathJson` remains a compatible alias. Checked local tuple views and typed
constructors cover Power, Negate, nonempty Add/Multiply, List, call, scalar-name
Assign, Def and PythonSource. Constructors prevent missing operands and
non-string definition parameters at compile time. Guards check arity,
missing/sparse slots, names, parameters and source payloads before narrowing.

Normalization constructs common outputs with these types. Definition emission
uses checked signatures. Unknown heads, malformed/noncanonical expressions and
tuple assignments retain their existing runtime paths. No assertion declares
the entire IR canonical or fully validated. Negative compile-time tests and
malformed-shape tests protect this boundary.

## D. Compiler-state improvements

Scope is an internal module with documented field lifetimes. `beginCell`
explicitly selects the cell index/diagnostic sink and resets the cell error
count while retaining worksheet bindings and classifications. Python-export
cells remain independent; calculator cells share scope in written order.

Tests cover nested/shadowed bindings and restoration after throws, function
cycle guards, integration constants, matrix/scalar rebinding, repeated and
independent requests, unchanged inputs, and failed-then-valid compilation.
Existing `try/finally` operations were preserved rather than replaced with a
context-management framework.

## E. Validation results

| Command | Result |
| --- | --- |
| `npm ci` | Passed before implementation |
| `npm ci --prefix vendor/mathquill` | Passed; vendored test dependencies available |
| `npm run check` | Passed: 0 errors, 3 existing Svelte warnings |
| `npm run lint` | Passed: 7 existing warnings; the IR warning moved with parsing code |
| `npm test` | Baseline: 990 passed, 26 files |
| `npm test -- --maxWorkers=2` | Final: **1,021 passed, 30 files** |
| `npm run build` | Passed; existing Svelte/large-chunk warnings remain |
| `npm run test:e2e:smoke` | Final rerun: **14 passed** |
| `npm run test:e2e` | Final: **185 passed**, including vendored MathQuill, calculator and plotting tests; no skips |
| `node scripts/check-compiler-boundaries.mjs` | Passed: 35 modules, no cycles including type/re-export edges; no internal imports of own facade |
| `PERF_LABEL=baseline-eb8cdc2 npm run test:perf` | Baseline: 14 passed, 2 failed |
| `PERF_LABEL=refactor-final npm run test:perf` | Final: 14 passed, the same 2 failed |
| `git diff --check` | Passed |

Focused commands used between extractions:

```sh
npx vitest run src/compile/baseline.test.ts
npx vitest run src/compile
npx vitest run src/compile --maxWorkers=2
npx vitest run src/compile/state-lifetimes.test.ts --maxWorkers=2
npx vitest run src/compile/ir/ordering.test.ts --maxWorkers=2
npx vitest run src/state --maxWorkers=2
npx vitest run src/compile src/state --maxWorkers=2
```

The final focused compiler run contains 606 passing tests; the state suite has
50. Compiler baseline coverage pins 11 case groups across 44 import/tuple
option combinations, including exact raw/normalized IR, generated Python,
calculator programs, diagnostics and line metadata. Export inspection retained
all 16 original codegen exports and all 12 original IR exports; the only added
public type is `RawMathJson`.

The two unresolved performance-test failures are unchanged from main:

- `perf/options.spec.ts`: target switch -> output repaint.
- `perf/typing.spec.ts`: keystroke -> output panel reflects the character.

Both report `timed: outcome never became true`. Their tests and timeouts were
not modified. Initial missing-browser failures were resolved by installing
Chromium. Intermediate runs also encountered compiler/browser timeouts under
load; reruns of unchanged tests passed. One early full E2E repeat had 182
passes, two timeouts and one unrun test; the final full run passed all 185.
The first final smoke attempt had 12 passes and two reload timeouts; the next
unchanged run passed all 14. No requested validation suite was left unexecuted.

## F. Performance comparison

Production UI battery, p50 in milliseconds:

| Metric | Before | After |
| --- | ---: | ---: |
| Startup paint (5 samples) | 574.8 | 616.4 |
| Typing, 1 cell (30 samples) | 47.7 | 40.7 |
| Typing, 10 cells (20 samples) | 40.7 | 38.8 |
| Typing, 30 cells (20 samples) | 28.8 | 27.2 |
| Typing, complex expression (15 samples) | 39.3 | 40.4 |

Startup JS increased by 416 transferred bytes (1,048,085 to 1,048,501).
Results are environment-specific and include frame/scheduling noise; these
measurements are not a performance-improvement claim.

Insertion/deletion/backspace differences were investigated with three repeated
runs per checkout, then with the checkout order reversed. Each confirmation
command passed 9 tests (36 total across four commands). Insertion paint changed
from 59.6 -> 72.3 ms in baseline-first order, and 65.5 -> 50.5 ms in
candidate-first order (30 samples per checkout/order). Deletion remained around
45 ms in both orders; backspace was 38.6 -> 39.0 ms, then 34.8 -> 38.9 ms.
The insertion difference reversed with run order rather than consistently
following the refactor.

Commands used for the UI comparison:

```sh
node perf/compare.mjs baseline-eb8cdc2 refactor-final
PERF_BASE_URL=http://localhost:4174 PERF_LABEL=baseline-confirm npx playwright test -c playwright.perf.config.ts perf/cells.spec.ts perf/typing.spec.ts --grep 'Shift\+Enter|delete button|backspace' --repeat-each=3
PERF_BASE_URL=http://localhost:4175 PERF_LABEL=refactor-confirm npx playwright test -c playwright.perf.config.ts perf/cells.spec.ts perf/typing.spec.ts --grep 'Shift\+Enter|delete button|backspace' --repeat-each=3
PERF_BASE_URL=http://localhost:4175 PERF_LABEL=refactor-confirm-reverse npx playwright test -c playwright.perf.config.ts perf/cells.spec.ts perf/typing.spec.ts --grep 'Shift\+Enter|delete button|backspace' --repeat-each=3
PERF_BASE_URL=http://localhost:4174 PERF_LABEL=baseline-confirm-reverse npx playwright test -c playwright.perf.config.ts perf/cells.spec.ts perf/typing.spec.ts --grep 'Shift\+Enter|delete button|backspace' --repeat-each=3
node perf/compare.mjs baseline-confirm refactor-confirm
node perf/compare.mjs baseline-confirm-reverse refactor-confirm-reverse
```

Compiler throughput was also measured against a pristine baseline worktree,
with identical dependencies, no concurrent browser tests, production-bundled
pure-TS APIs, 200 warmup batches and 200 samples per job. The order was reversed
in a second run. P50 ranges across the two orders, milliseconds per corpus batch:

| Work | Baseline | Refactor |
| --- | ---: | ---: |
| Parse source corpus | 1.12–1.17 | 0.99–1.03 |
| Python worksheet compilation, 44 variants | 1.49–1.76 | 1.56–1.63 |
| Calculator compilation, 44 variants | 1.25–1.29 | 1.25–1.49 |

```sh
node scripts/benchmark-compiler.mjs /workspace/MathCompile-baseline /workspace/MathCompile
node scripts/benchmark-compiler.mjs /workspace/MathCompile /workspace/MathCompile-baseline
```

Initial Vite SSR timings charged development import-wrapper/background optimizer
costs. The committed benchmark bundles before timing so it measures the compiler
as deployed. The production measurements and order-reversed UI checks did not
identify a consistent material regression. Calculator evaluation and plotting
were verified in real-engine E2E tests; this benchmark measures compilation,
not SymPy execution or Pyodide boot time.

## G. Remaining concerns and deliberate deferrals

- The two existing performance-battery outcome timeouts remain unresolved and
  should be corrected separately, without weakening their intended coverage.
- Development browser logs still contain the pre-existing Svelte
  `state_unsafe_mutation` during field teardown (`MathField` caret-context
  callback). This behavioral issue was not mixed into compiler restructuring.
- A fully recursive typed/canonical IR is deferred because permissive unknown,
  error and noncanonical calculus forms remain part of the current pipeline.
- Tightly coupled arithmetic, matrix resolution and call escape-hatch logic
  remain together in the emitter. Splitting them further would expand context
  interfaces without a demonstrated benefit. Ordered normalization rules stay
  together for traceability.
- Store/persistence service extraction and further registry consolidation were
  not justified: current ownership is cohesive, and overlapping metadata tables
  often express distinct concepts.

## H. Observable behavior changes

None intended or found in the regression corpus or final functional suites.
Generated Python matches byte-for-byte for the captured cases. Source ordering,
worksheet execution, diagnostics, focus ownership and persisted data formats
retain their existing behavior. No behavioral fixes were silently included.
