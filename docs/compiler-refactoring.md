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
- Full E2E baseline: retained runner status passed; console counts were lost
  during the environment restart. See the final report for subsequent runs.
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

## Scope ownership

| State | Lifetime |
| --- | --- |
| Qualification, plot target, Python registry | One compilation request |
| Declared/defined names, minted identifiers, function signatures, value kinds, assumptions, matrix dimensions, integration-constant reservations | One standalone Python cell; one whole calculator worksheet |
| Python source-use tracking and warning deduplication | Scope lifetime (warning keys include cell index) |
| Current cell index, diagnostic sink, error count | Cell emission; selected by `beginCell` |
| Definition/lambda bindings, operator-bound variables | Recursive emission call; restored by `try/finally` |
| Applied-function cycle guards | Recursive emission call; removed by `try/finally` |
| Statement diagnostic slices and source-line attribution | Local variables in cell assembly |

The worksheet export's prefixed diagnostic label is separate from the
zero-based Python-registry cell index. Calculator scopes keep the label at
zero. `beginCell` does not reset persistent binding or classification facts.
Cycle guards are only entered when a name is not already being emitted;
recursive references take the existing guarded fallback.

## IR type boundary

`ir/types` owns the permissive `RawMathJson` (`MathJson` remains a compatible
alias), issues and public options/results. `ir/normalized` provides checked
local tuple views and constructors for Power, Negate, nonempty Add/Multiply,
List, call, scalar Assign, Def with string parameters, and PythonSource.
Normalization uses typed constructors for common outputs; statement emission
uses the checked Def signature. Constructor signatures prevent missing operands
and non-name definition parameters at compile time. Guards reject wrong arity,
missing/sparse slots and wrong name/source slots before narrowing.

Operands deliberately remain MathJSON-compatible. No type claims full
canonicalization, models every external head, or validates the whole tree
again. Unknown vocabulary, tuple assignments and malformed/noncanonical shapes
retain the prior runtime handling and diagnostics. Guards declining a shape
are not new compiler rejection rules.

## Application state and persistence audit

Keep the existing store as the focus owner and persistence as the storage
boundary. A service extraction would add indirection to their modest existing
interfaces. No production state/storage behavior or schema changed.

New tests exercise deletion, switching and renaming with a debounce pending,
including advancing the clock afterwards to prove there is no late write or
resurrection; mixed valid/invalid stored cells without a rewrite; and editing
without replacing a cell/field or requesting focus. Existing migration,
flush-time snapshot, worksheet identity, and debounce tests remain intact.
The protection against resurrection belongs to the store's flush-before-delete
contract; the low-level storage removal operation does not independently own
pending writes.

## Final module boundaries

The compatibility facades retain all former exports and caller signatures.
Implementation modules never import their own facade.

- Codegen: worksheet orchestration owns normalization options, Python-function
  discovery and scope allocation. Cell assembly owns declaration lines,
  statement order and diagnostic row mapping. Statements own assignments,
  definitions, Python source, solvers and plot dispatch. Plotting owns static
  signatures, domains and Python plot programs.
- Expressions: the emitter owns precedence dispatch, name resolution and
  recursive `emit`. Bound operators, derivatives, functions/lambdas and
  sets/predicates consume narrow structural contracts; they recurse through
  the same emitter. They do not construct scopes or import the emitter class.
  Arithmetic, matrix resolution and the call escape hatch stay in the core:
  further extraction would currently require a broad shared interface.
- Shared codegen leaves own identifier policy, name/declaration analysis,
  structural checks, precedence constants and emission-head classifications.
  These are shared policies, not a module per operator.
- IR: parsing owns the lazy Compute Engine instance and preprocessing;
  shapes and diagnostics are pure; differential, solver and statement helpers
  own their corresponding recognition/transformation logic. Helpers receive
  only the normalization callbacks they actually use.
- Normalization keeps its ordered rule list and traversal together. Its
  sequence remains: raw shape/spacing/error handling; block recursion and line
  attribution; equality-chain flattening; plot-marker recognition; callable
  declaration discovery; first-applicable rule (or DECLINE); unknown-head
  escape/known-head fallback. Total differential recognition still precedes
  generic quotient handling. No normalization pass was added or reordered.

`node scripts/check-compiler-boundaries.mjs` checks every compiler source
module, including import/re-export and type edges. The graph is acyclic.

## Shared-definition audit and deliberate limits

The existing notation registry already derives the supported-name tables for
normalization, codegen and Python-function discovery. Keep it authoritative.
Statement gating, comparison nesting, Boolean value classification and solver
recognition overlap in spelling but answer different questions; merging them
would conflate semantics. No registry/vocabulary or vendored code changed.

A fully recursive typed IR is deferred: unknown heads, malformed fragments and
noncanonical calculus shapes still need permissive handling. The ordered rule
list stays together for traceability. The emitter's tightly coupled arithmetic,
matrix and call logic remains cohesive. Store/persistence services, storage
migrations, new dependencies and behavioral bug fixes were unnecessary.

Final commands, counts, performance comparisons and remaining concerns are in
[compiler-refactoring-report.md](compiler-refactoring-report.md).
