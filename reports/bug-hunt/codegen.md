# Code generation bug hunt — complete

Baseline: `eb8cdc2318f219d2f6d97cfe1dcc67c5d2ba268f`.

**39 confirmed issues: 18 high, 20 medium, 1 low.** The index below maps each issue to its source area; detailed reproductions, expected/actual results, root causes and regression ideas follow in ID order. Remediation discussion is analysis only. **The user explicitly prohibited fixes; no product source changes or fix patches have been made. Report documents were subsequently committed and pushed at the user’s request.**

Worktree: `/workspace/hunt-codegen`. Evidence directory: `/workspace/bug-hunt-evidence/codegen/`. Diagnostic scripts/tests are untracked files in the hunt worktree; the product baseline remains unchanged. Search stopped after the full five-hour active requirement; the timing and stopping record below exclude interruptions and final editorial cleanup.

## Issue index

| ID | Severity | Primary file / function | Root-cause group | Code area |
|---|---|---|---|---|
| CG-01 | High | `codegen.ts`: Scope.withLambdaBound, Emitter.sym, bound operators | Bound-variable scopes | Compiler semantics |
| CG-02 | High | `codegen.ts`: pyIdent, RESERVED_IDENTS, unqualified emission | Identifier namespace collisions | Compiler semantics |
| CG-03 | High | `codegen.ts`: Divide / numeric literal emission | Native Python numeric values | Compiler semantics |
| CG-04 | Medium | `codegen.ts`: Minimum/Maximum | Native Python numeric values | Compiler semantics |
| CG-05 | Medium | `codegen.ts`: Abs/Norm, Trace call special case | Concrete/abstract/list matrix APIs | Compiler semantics |
| CG-06 | High | `codegen.ts`: Add / Negate parenthesization | Operator precedence | Compiler semantics |
| CG-07 | High | `calculator.worker.ts`: mc_run, _snaps | Mutable snapshot rollback | Calculator runtime |
| CG-08 | High | `codegen.ts`: Assign, assignDisplay | Display re-executes RHS | Compiler semantics |
| CG-09 | High | `codegen.ts`: PythonSource; worker _mc_eval_stmt | Trailing expression executes twice | Calculator runtime / Python source |
| CG-10 | High | `codegen.ts`: Congruent and IdenticallyEqual | Incomplete modulus normalization | Compiler semantics |
| CG-11 | High | `codegen.ts`: PythonSource/scope bookkeeping; pydefs.ts | Python value bindings invisible to math | Calculator runtime / Python source |
| CG-12 | Medium | `codegen.ts`: Assign tuple target | Value-kind facts lost on binding | Compiler semantics |
| CG-13 | Medium | `codegen.ts`: TotalD | Jacobian shape / higher-rank derivative | Compiler semantics |
| CG-14 | High | `codegen.ts`: relationalDomain, Solve/comprehension callers | Domain variable selection | Compiler semantics |
| CG-15 | Medium | `codegen.ts`: matrixShape, Integrate constants | Identity matrix shape metadata | Compiler semantics |
| CG-16 | High | `codegen.ts`: Emitter.sym/fn/mat, allocated identifier maps | Cross-cell mangling identity lost | Compiler names/scopes |
| CG-17 | Medium | `codegen.ts`: matrixValuedNode / MatrixMethod result typing | Matrix-returning operations treated scalar | Compiler names/scopes |
| CG-18 | Medium | `codegen.ts`: notePyUse, compileWorksheet pySrc injection | Standalone Python dependencies incomplete | Python interoperability |
| CG-19 | High | `codegen.ts`: Solve; calc-runtime.ts mc_answers | Tautologies conflated with no-solution results | Solver semantics |
| CG-20 | High | `ir.ts`: callable registration/call folding; `codegen.ts`: Assign/Ring | Callable values lowered as multiplication | Function semantics |
| CG-21 | Medium | `codegen.ts`: Emitter.matrixArg, Scope.claimFunction, matrixFns | Historical type facts survive rebinding | Binding/type facts |
| CG-22 | Medium | `ir.ts`: defMarkedShape/functionDefShape | Applied-head signature drops def marker | Function definition normalization |
| CG-23 | Medium | `codegen.ts`: freeNames, TotalD/Integrate inference | Calculus-bound variables counted free | Lexical free-name collection |
| CG-24 | High | `codegen.ts`: Scope.noteCallArgs, TotalD/Gradient signature lookup | Observed arguments overwrite declared signature | Function signature lifetime |
| CG-25 | Medium | `ir.ts`: parseCellLatex / subscript-name / assignment target normalization | Assignment targets and references use different names | Parser / binding normalization |
| CG-26 | Medium | `codegen.ts`: Which/Piecewise, Def function evaluation | Inactive branches execute eagerly | Conditional evaluation |
| CG-27 | Medium | `calculator.svelte.ts`: content keys; worker mc_run prelude reuse | Cache omits prelude identity | Calculator runtime |
| CG-28 | Medium | `codegen.ts`: CircleMinus/CircledAst, vectorEntries/vectorLen | Vector-field shape validation differs after binding | Vector calculus |
| CG-29 | Medium | `codegen.ts`: CircledAst curl row emitter | Coordinates referenced without symbolic binding | Vector calculus |
| CG-30 | Medium | `codegen.ts`: DSolve IC dictionary construction | Contradictory duplicate conditions silently discarded | Differential solver constraints |
| CG-31 | High | `codegen.ts`: assumeFrom, assume, cell declaration emission | Membership assumptions ignored after first symbol use | Assumptions / solver domains |
| CG-32 | Medium | `ir.ts`: SUB_DERIV_RE, collectDepEvidence, rewriteDepNotation | Bound coefficient names reinterpreted as derivatives | Differential-notation normalization |
| CG-33 | High | `codegen.ts`: D emitter; ir.ts rewriteDepNotation | Derivative argument tail silently discarded | Differential operator arity |
| CG-34 | Medium | `ir.ts`: implicit-product and normalize empty-node shortcut | Valid zero-argument calls become missing values | Function application arity |
| CG-35 | High | `codegen.ts`: NotLess/negated relation emission, cmpChain | Chained relation operands silently dropped | Comparison/operator arity |
| CG-36 | Low | `codegen.ts`: firstFreeCapital, nextConstName, Integrate constTerm | Integration constant allocator exhausts fixed alphabet | Generated constant hygiene |
| CG-37 | High | `codegen.ts`: Add/Negate, list-bound values, assignDisplay | Vector addition executes native list concatenation | List/vector arithmetic coercion |
| CG-38 | Medium | `codegen.ts`: Assign/Def state transitions and error guard | Failed statements commit compiler binding/type facts | Error recovery / scope state |
| CG-39 | Medium | `notation.ts`: CONSTANTS; ir.ts ACCENT_SUFFIX; codegen.ts constant lookup | Lookup tables accept inherited Object keys | Identifier normalization / compiler exceptions |

## Reproduction table

Each row gives one representative reproduction from the corresponding finding below. Math inputs are LaTeX to enter in a math cell; Python inputs are marked explicitly. Numbered cells must be separate and evaluated in order. Within one cell, use the stated multiline input. Expected values describe mathematical results, not exact typography. Actual values and errors come from the retained investigation evidence; this table does not imply a new verification run. Detailed findings below cover additional manifestations, controls, and evidence limits. Default calculator/import settings apply unless stated otherwise; CG-18 uses the standalone Python target, and CG-39 fails during compilation.

| Issue | Input required to reproduce | Expected output | Actual output |
| --- | --- | --- | --- |
| [CG-01](#cg-01--assigned-values-leak-into-operator-bound-variables-high) | Cell 1: `x=2`.<br>Cell 2: `\sum_{x=1}^{3}x`. | Second cell: `6`; the bound index is local. | `ValueError: Invalid limits given: ((2, 1, 3),)` because the emitted index resolves to the assigned value `2`. |
| [CG-02](#cg-02--default-import--permits-user-symbols-to-overwrite-required-sympy-names-high) | With import* enabled, one cell: `\displaylines{I=2\\i^2}`. | Second row: `-1`. | `4`; the assignment overwrites SymPy's imported imaginary unit `I`. |
| [CG-03](#cg-03--native-python-numbers-corrupt-exact-integer-arithmetic-and-range-high) | One cell: `\displaylines{a=2\\\frac{1}{a}}`. | Exact rational `1/2`. | Floating-point `0.500000000000000` in both import modes. |
| [CG-04](#cg-04--constant-finite-range-minmax-emits-invalid-python-medium) | `\min_{i=1}^{3}2` | `2`. | Generated `Min(*[2.subs(i, _i) for _i in range(1, 4)])` fails with `SyntaxError: invalid decimal literal`. |
| [CG-05](#cg-05--norms-of-abstract-matrices-call-unavailable-matrixsymbol-method-medium) | One cell: `\displaylines{A\in\mathbb{R}^{2\times2}\\\left\|A\right\|}`. | Symbolic norm of `A`, or an explicit unsupported-operation diagnostic before execution. | Runtime `AttributeError`: `MatrixSymbol` has no `.norm()` method. |
| [CG-06](#cg-06--subtraction-of-parenthesized-sums-silently-changes-signs-high) | `1-(2+2)` | `-3`. | Generated `1 - 2 + 2` evaluates to `1`. |
| [CG-07](#cg-07--calculator-snapshots-preserve-mutations-from-cells-that-were-edited-or-deleted-high) | Python cells: (1) `a=[]`, (2) `a.append(1)`, (3) `len(a)`.<br>After evaluation, change cell 2 to `a.append(2)`; evaluate, then delete cell 2. | Cell 3: initially `1`, still `1` after the edit, then `0` after deletion. | Cell 3: initially `1`, then `2` after the edit and still `2` after deletion. |
| [CG-08](#cg-08--assignment-display-re-evaluates-the-rhs-after-the-value-has-changed-high) | One cell: `\displaylines{a=2\\a=a+1\\a}`. | Rows: `a = 2`, `a = 3`, `3`. | Rows: `a = 2`, `a = 4`, `3`; assignment display disagrees with the stored value. |
| [CG-09](#cg-09--python-cells-trailing-expression-executes-twice-high) | One Python cell, two lines:<br>`it = iter([1,2,3])`<br>`next(it)` | `1`, consuming one iterator item. | `2`; the trailing expression executes twice. |
| [CG-10](#cg-10--modular-congruence-reduces-only-its-left-hand-operand-high) | `8\equiv5\pmod{3}` | `True`. | `False`; generated expression is `Eq(Mod(8,3),5)`. |
| [CG-11](#cg-11--math-cells-silently-overwrite-python-cell-assignments-high) | Cell 1 (Python): `a=2`.<br>Cell 2 (math): `a+1`. | `3`. | Symbolic `a+1`; the math cell redeclares `a` as a Symbol. |
| [CG-12](#cg-12--tuple-destructuring-drops-matrixvector-value-kinds-medium) | One cell: `\displaylines{(u,v)=([1,2,3],[4,5,6])\\u\bullet v}`. | Dot product `32`. | Generated `u * v` raises `can't multiply sequence by non-int of type 'list'`. |
| [CG-13](#cg-13--higher-total-derivatives-fail-once-a-jacobian-is-a-full-matrix-medium) | `\D^3(x^3+y^3)` | Third derivative tensor: entries `xxx = 6`, `yyy = 6`, mixed entries `0`; alternatively an explicit unsupported-order diagnostic. | Runtime error: “self must be a row or a column matrix.” |
| [CG-14](#cg-14--reversed-inequalities-with-named-constants-solve-for-the-constant-high) | `\text{solve} x^2=16\text{ for }\pi<x` | `x=4`. | `π∈∅`; the generated solver targets `pi` rather than `x`. |
| [CG-15](#cg-15--indefinite-integral-of-an-identity-matrix-adds-a-scalar-integration-constant-medium) | `\int I_2 dx` | `x I₂ + C`, with `C` a 2×2 constant matrix, or an explicit unsupported-operation diagnostic. | Runtime error: `unsupported operand type(s) for +: ImmutableDenseMatrix and Symbol`. |
| [CG-16](#cg-16--cross-cell-references-forget-allocated-name-disambiguation-high) | Cell 1: `x_{-}+x_{+}`.<br>Cell 2: `x_{-}-x_{+}`. | Second cell: `x₋−x₊`, retaining two distinct free symbols. | `0`; generated second-cell expression is `x - x`. |
| [CG-17](#cg-17--assigning-matrix-valued-word-operations-loses-the-matrix-type-medium) | Cell 1: `A=\begin{pmatrix}2&1\\1&2\end{pmatrix}`.<br>Cell 2: `B=\mathrm{inverse}(A)`.<br>Cell 3: `\det B`. | Cell 2 displays `B` equal to the inverse matrix; cell 3 returns `1/3`. | Cell 2 displays `False`; cell 3 is rejected with `B is a scalar here`. |
| [CG-18](#cg-18--standalone-python-cell-output-omits-transitive-helper-definitions-medium) | Python cell 1: `def helper(x): return x+1`.<br>Python cell 2: `def outer(x): return 2*helper(x)`.<br>Math cell 3: `\mathrm{outer}(3)`.<br>Select the Python target and execute cell 3's copied standalone script. | Copied script evaluates to `8`, including its prerequisite definitions. | `NameError: helper is not defined`; the script includes `outer` but omits `helper`. The calculator itself returns `8`. |
| [CG-19](#cg-19--solver-identities-are-displayed-as-having-no-solutions-high) | `\text{solve}x^2=x^2,x` | All `x` in the applicable domain. | `x∈∅`. |
| [CG-20](#cg-20--callable-compositionparenthesized-lambda-assignments-are-later-multiplied-high) | One cell: `\displaylines{h=(x\mapsto x^2)\\h(3)}`. | `9`. | `3·(x↦x²)`; the call becomes multiplication. |
| [CG-21](#cg-21--historical-symbolmatrix-facts-override-later-bindings-medium) | Cell 1: `A+1`.<br>Cell 2: `A=\begin{pmatrix}2&1\\1&2\end{pmatrix}`.<br>Cell 3: `\det A`. | `3`. | Compiler error: `det needs a matrix — A is a scalar here`. |
| [CG-22](#cg-22--explicit-definitions-with-already-applied-parser-heads-lose-the-def-marker-medium) | Cell 1: `\text{def} A(x)=x^2`.<br>Cell 2: `A(2)`. | A function definition, then `4`. | First cell becomes an equation involving a free symbol `def` and undefined `A(x)`; across cells the call fails with `A is bound to a value — not callable`. |
| [CG-23](#cg-23--free-name-collection-includes-calculus-bound-indices-medium) | `\D(\sum_{j=1}^{3}jx)` | Scalar `6`. | Row matrix `[0,6]`; the bound index is included as an extra coordinate. |
| [CG-24](#cg-24--evaluating-a-function-changes-its-later-derivativegradient-high) | Cell 1: `\text{def} f(x)=x^2`.<br>Cell 2: `f(2)`.<br>Cell 3: `\D f`. | Cell 2: `4`; cell 3: `2x`. | Cell 2: `4`; cell 3: `total derivative needs a free variable`. |
| [CG-25](#cg-25--explicit-assignment-to-subscripted-names-binds-a-different-name-or-function-medium) | One cell: `\displaylines{a_n:=2\\a_n+1}`. | Assignment followed by `3`. | Assignment displays `a_n=2`, but the next row stays symbolic `a_n+1`; assignment and reference use different Python names. |
| [CG-26](#cg-26--a-guarded-piecewise-function-evaluates-its-inactive-singular-branch-medium) | Cell 1: `\text{def} f(x)=\begin{cases}1/x & x\ne0\\0 & \mathrm{otherwise}\end{cases}`.<br>Cell 2: `f(0)`. | `0`. | `division by zero` from the inactive reciprocal branch. |
| [CG-27](#cg-27--changing-the-import-setting-reuses-snapshots-with-the-wrong-prelude-medium) | Disable import*. Evaluate a worksheet containing only math cell `1`.<br>Enable import*, then append math cell `x^2`. | `x²`. | `name 'Symbol' is not defined`; the retained snapshot has the old qualified prelude. |
| [CG-28](#cg-28--vector-field-dimensions-are-lost-after-assignment-and-curl-accepts-invalid-shapes-medium) | Cell 1: `F=\begin{pmatrix}x^2\\y^2\end{pmatrix}`.<br>Cell 2: `\nabla\cdot F`. | `2x+2y`, matching divergence of the literal 2D column vector. | `index out of range`; the bound field is treated as having three components. |
| [CG-29](#cg-29--curl-references-undeclared-or-value-bound-coordinate-variables-medium) | Fresh worksheet: `\nabla\times[1,2,3]`. | Zero vector `[0,0,0]`. | `name 'y' is not defined`. |
| [CG-30](#cg-30--contradictory-duplicate-ode-initial-conditions-silently-use-the-last-value-medium) | `\text{dsolve}\frac{dy}{dx}=y,y(0)=1,y(0)=2` | No solution / incompatible-initial-conditions diagnostic. | Success row `y(x)=2e^x`, silently discarding `y(0)=1`. |
| [CG-31](#cg-31--an-earlier-use-of-a-symbol-makes-later-membership-assumptions-ineffective-high) | Three separate math cells:<br>(1) `x`<br>(2) `x\in\mathbb{Z}`<br>(3) `\text{solve}x^2=2,x`. | Empty solution set under the declared integer domain. | `x=−√2,√2`, violating the declaration. |
| [CG-32](#cg-32--differential-notation-overwrites-explicitly-bound-subscripted-coefficients-medium) | One cell: `\displaylines{k_a=2\\\text{dsolve}\frac{dy}{dx}=k_a y}`. | `y(x)=C₁e^(2x)`. | `'list' object has no attribute 'args'`; bound coefficient `k_a` is reinterpreted as derivative notation. |
| [CG-33](#cg-33--third-subscript-derivatives-silently-become-second-derivatives-high) | `\text{dsolve} y_{xxx}=0` | Three-parameter family `y(x)=C₁+C₂x+C₃x²`. | Two-parameter family `y(x)=C₁+C₂x`; emitted derivative is only second order. |
| [CG-34](#cg-34--python-zero-argument-functions-cannot-be-called-from-math-medium) | Cell 1 (Python): `def ready(): return 7`.<br>Cell 2 (math): `\mathrm{ready}()`. | `7`. | `missing argument cannot be emitted`. |
| [CG-35](#cg-35--chained-negated-inequalities-ignore-later-operands-high) | `2\nless1\nless2` | `False`, since `1≥2` is false. | `True`; only the first relation is emitted. |
| [CG-36](#cg-36--exhausting-constant-letters-merges-independent-integration-constants-low) | One cell: `\displaylines{C+D+E+F+G+H+I+J+K+L+M+N+O+P+Q+R+S+T+U+V+W+X+Y+Z\\\int(\int0dx)dx}`. | Second row: `C₁x+C₂`, with fresh independent constants. | `Cx+C`, tying the slope to the intercept. |
| [CG-37](#cg-37--displayed-vectors-add-by-concatenating-their-python-lists-high) | One cell: `\displaylines{u=[1,2,3]\\v=[4,5,6]\\u+v}`. | Vector `[5,7,9]`. | Six-element sequence `[1,2,3,4,5,6]`. |
| [CG-38](#cg-38--failed-assignmentsdefinitions-commit-scope-changes-despite-emitting-no-code-medium) | One cell: `\displaylines{a=2\\a=\begin{pmatrix}1&\frac{}{2}\\0&1\end{pmatrix}\\\|a\|}`.<br>Leave the fraction numerator empty to trigger the invalid assignment. | Invalid-assignment diagnostic; the last row remains `2` using the previous valid binding. | The last row errors with `'int' object has no attribute 'norm'`; the failed assignment changed compiler type facts while runtime `a` stayed `2`. |
| [CG-39](#cg-39--ordinary-identifier-names-collide-with-inherited-javascript-object-properties-medium) | `\mathrm{constructor}` | A symbolic identifier, or a structured compiler diagnostic. | Uncaught compiler `TypeError: c.startsWith is not a function`. |

## Methods and validation limits

Read AGENTS.md. CodeGraph CLI refused navigation without a worktree-local index, so ordinary source navigation was used. Baseline `npm test -- --maxWorkers=2`: **26 files, 990 tests passed** (36.80s). Node24.19.0 and host SymPy1.14.0 were used.

Diagnostic harnesses parse actual LaTeX, normalize it and call Python/calculator codegen in both import modes. The actual worker SETUP_PY was extracted without modifying its code and executed under host Python/SymPy. This verifies generated program semantics and snapshot behavior, while avoiding a separate reimplementation of the worker. Browser probes independently confirmed bound-index failure, I-name collision, constant min, abstract norm and exactness issues. A later fresh browser/Pyodide page also confirmed CG-16/20/21/22 after real MathQuill serialization, with parenthesized-lambda/unparenthesized and uppercase/lowercase definition controls. The first subtraction browser row was stale seed output, so CG-06 is supported by host execution/differential evidence, not claimed as browser-verified.

Coverage:

- **100,000** seeded arithmetic cases against independently constructed exact SymPy expressions. Outcomes:2,784 mismatches,133 errors,26 capped timeouts,1,518 nonfinite cases. These are probe outcomes, **not distinct bug counts**; major discrepancies reduced to CG-06/CG-03, with undefined/nonfinite domains excluded.
- **51,100** calculus cases over derivatives, indefinite/definite integrals and two-sided limits (39,320 before the first interruption plus11,780 before the next). Retained discrepancy streams were triaged: documented bare-y dependent-function behavior, equal AccumBounds/RootSum oracle artifacts, and expected SymPy undefined-limit/internal limitations were not counted as bugs.
- **260 existing codegen fixtures**, executed in both calculator import modes. Shape-invalid inputs and explicitly unsupported symbolic enumeration/abstract-matrix computation were distinguished from confirmed product errors.
- **63,675** deduplicated direct-solver cases using independently known rational/complex roots, finite domains, and known-solution linear/nonlinear systems:zero mismatches/errors/timeouts.
- **32,975** cross-cell solver/function cases (math defs, lambda assignments, colon defs, Python functions, ordinary/Greek/mangled callable names):zero mismatches/errors/timeouts before interruption. Additional coefficient variations from saturated grammars do not reset the no-progress clock.
- Targeted cases cover namespace collisions, lexical binders, assignments and tuple kinds, matrix representations/method returns, constants of integration, Python interoperability, standalone dependency injection, mutable rewind and solver identities.

Additional closing coverage:

- **230,700** distinct lowercase temporal binding histories were reduced to the reported historical type-fact issue; the uppercase corpus independently exposed CG-22. Saturated sweeps were stopped, not treated as new issues.
- **52,800** valid operator-composition expressions covered floor/ceiling, roots/logarithms, factorial/binomial, gcd/lcm/Mod and arithmetic nesting:zero mismatches/errors/timeouts,657 expected-domain exclusions. An earlier invalid floor/ceiling token generator was corrected; its malformed inputs were not counted as product bugs.
- A finite **444-case** manufactured-solution differential-equation audit covered first-/second-order ODEs, initials, linear systems and first-order PDEs.372 passed exact solution/initial-condition or residual checks;72 failures reduced to the uppercase applied-head normalization root in CG-22. No unexplained mismatch or timeout remained.
- Targeted closing checks covered native-number range and discrete modulo, import-prelude cache invalidation, vector calculus dimensions/coordinates, duplicate ODE conditions, derivative arity, empty calls, error recovery, function-default mutation, generated constant capacity and inherited identifier lookup keys. Variadic gcd/lcm controls and ordinary nested logical connectives passed; unsupported command spellings and ambiguous unimplemented statistics conventions were excluded.

Real browser/Pyodide evidence supplements host execution. Later pages confirm CG-25/26/27/28/29/30/31/32/33/34/35/37 and the newer CG-01/03/05/23 reductions with actual MathQuill serialization and successful controls. CG-30's earlier blank browser row was resolved in the later page by waiting for a present result row; `browser-integer-results.json` confirms its discarded-condition result. Browser artifacts also record the independently investigated UI state_unsafe_mutation baseline error, which is not attributed to these compiler findings.

No production changes were made to test these hypotheses. Host Python and real browser/Pyodide are separate environments; host-only claims are labeled by their evidence. No full production deployment or comprehensive browser matrix is claimed. Recommendations and regression suggestions describe possible follow-up validation, not an authorized implementation phase.

## Active timing and interruption accounting

Search completed on **2026-10-29 at06:01:05 UTC**. Conservative credited active search time is **5h00m10.598s**. The full five-hour requirement was reached; the one-hour no-progress early-stop exception was **not** used. Final editorial cleanup after this endpoint is excluded.

| Window | Active start UTC | Retained active endpoint UTC | Duration |
|---|---|---|---|
|1|2026-10-27 06:26:35|2026-10-27 08:08:26.699|1h41m51.699s|
|2|2026-10-27 17:06:34|2026-10-27 17:27:05.636|20m31.636s|
|3|2026-10-28 04:28:40|2026-10-28 05:35:31.576|1h06m51.576s|
|4|2026-10-28 08:09:56|2026-10-28 about08:20:00|About10m04s|
|5|2026-10-28 08:21:26|2026-10-28 08:53:24|31m58s|
|6|2026-10-28 16:20:32|2026-10-28 16:55:14.648|34m42.648s|
|7|2026-10-28 17:17:03|2026-10-28 17:25:59.039|8m56.039s|
|8|2026-10-29 05:35:20|2026-10-29 06:01:05|25m45s|

These retained windows total5h00m40.598s. An additional30s is conservatively uncredited, preserving the parent's carried timing ledger and allowing for the approximate brief outage endpoint. All gaps between windows are excluded, including the approximately1m26s transport outage between windows4/5 and the environment/usage resets between later windows. Downtime was never treated as search or as product failure.

The last new root issue was CG-39 at05:57:36 UTC on29October; closing source/evidence consistency validation continued to the recorded endpoint. Counter-only variations from saturated sweeps did not reset the no-progress clock. The retained chronological notes are in `search-log.md`; individual artifacts preserve probe inputs, results and timing stats.

## Confirmed findings

### CG-01 — assigned values leak into operator-bound variables (high)

Input one multiline cell: `\displaylines{x=2\\\sum_{x=1}^{3}x}` (equivalently two cells `x=2` and `\sum_{x=1}^{3}x`). Expected second row **6**: the summation's `x` is a local bound index. Actual emitted `summation(x, (x, 1, 3))` sees Python variable `x=2` and raises `ValueError: Invalid limits given: ((2, 1, 3),)`.

Root cause: `Scope.withLambdaBound()` (codegen.ts:546) records operator-bound variables, but `Emitter.sym()` (codegen.ts:902) only consults that set to distinguish imaginary `i`; all other bound names still return their assigned Python identifier at line 947. Sum/Product emitter (3030–3083) wraps this insufficient binding mechanism. The body and bounds must use fresh symbolic binding for local indices, preserving outer values and correctly handling nested binders.

Regression: execute programs with an assigned index, nested repeated indices, independent bounds using an outer same-named value, and assert outer value remains intact. Check Integrate/Limit/Lambda/comprehension/quantifier paths for same class.

#### Further CG-01 binder coverage: imaginary i leaks into quantified/set-bound variables

Even without a previous assignment, `\forall i\in\{1,2\}, i>0` and the existential version emit `Gt(I,0)` and fail **Invalid comparison of non-real I**, while the equivalent x-bound forms return True. `\{i^2\mid i\in\{1,2\}\}` and `i² for i∈{1,2}` emit `Lambda(I,I**2)` and fail **Lambda signature should be only tuples and symbols, not I**. These Set/Comprehension/ForAll/Exists paths never establish operator-bound i before emission. Include all binding constructs in CG-01 fix, in addition to protecting existing assigned values. Expected set image {1,4}; expected quantified booleans True. Evidence `input-quantifiers.json`, `output-quantifiers.json`, `quantifier-results.json`.

#### Additional CG-01 reduction: function-local parameters inherit global value kinds

With global A=[[2,1],[1,2]], define f(A)=|A| and call f(2). Expected2; actual function body emits A.norm(), so its display fails on Symbol A and its call fails on int2. The same f(A) definition without a global matrix A correctly returns2. Likewise global v=[1,2,3] followed by f(v)=2v makes f(2) attempt Matrix(2), whereas the fresh function correctly returns4.

withBoundOnly correctly shadows the emitted identifier, but matrixRef/matrixValued and listNames queries still read the unrelated global binding's kind. Lexical binding scopes must apply to type facts as well as identifier/value lookup. Evidence `input-local-kind-shadow.json`, `output-local-kind-shadow.json`, `local-kind-shadow-results.json`. This is grouped with CG-01's bound-scope leakage, not counted again as another ID.

#### Further CG-01 reduction: synthetic image variables capture free symbols inside Python functions

Python cell `def shift(x): return x + sp.Symbol("a")`, followed by math `\mathrm{shift}(\{1,2\})`, should return **{a+1,a+2}**, exactly the image of the documented function. Actual result is **{2,4}**. A direct shift(1) returns a+1; changing the function's internal free symbol from a to b makes the set image correctly return {b+1,b+2}.

`Emitter.callOrImage` (codegen.ts:1417–1441) picks a fresh *spelling* through `freshLetters` and constructs `Lambda(Symbol("a"), shift(Symbol("a")))`. The Python function also creates an ordinary Symbol("a"), so the two identities merge and the synthesized binder captures the previously free symbol. `takenLetters` correctly prevents this for visible math-side free names; it cannot see free symbols created inside arbitrary Python functions. This is another CG-01 binding hygiene case, with a distinct synthesized-binder path: use symbol identities that cannot capture arbitrary returned free symbols, rather than relying only on unused spellings. Regression ideas include multiple image arguments and Python functions returning expressions with free a/b/_a0 symbols. Evidence `input-python-image-capture.json`, output and `python-image-capture-results.json`; `image-capture-results.json` also records successful math-defined-function controls. No fix performed.

Further CG-01 reserved-name binder validation: defining f(e)=e² and calling f(2) yields Euler e²≈7.389 rather than4; summing e for e=1..3 yields3e rather than6. A mapsto e parameter behaves the same; f(E)=E² with uppercase E correctly returns4. Pi parameters are likewise accepted, displayed as capital Π, while their body resolves to constant π. The normalizer's string rule maps e to ExponentialE in expression positions (ir.ts:2490 onward), explicitly commenting that e is never a variable; Emitter.inner resolves CONSTANTS before local binding lookup (codegen.ts:1482). Thus the implementation reserves these names but nevertheless accepts them as parameter/index binders without a diagnostic. Respect lexical binding where supported, or reject reserved constant-name binders explicitly; do not silently accept an unused parameter/index. This is recorded under CG-01's binding validation, not as a new ID or a demand to change the documented constant convention. Evidence `input-constant-binders.json`, output and `constant-binder-results.json`; `constant-binding-results.json` records successful i-binding and ineffective e/Pi assignments as supporting controls. No implementation changes.

### CG-02 — default import-* permits user symbols to overwrite required SymPy names (high)

Input `\displaylines{S=2\\x\in\mathbb{R}}`. Expected membership row True for real-assumed x. Actual emits `S = 2` and `Contains(x, S.Reals)` then raises `AttributeError: 'int' object has no attribute 'Reals'`. Qualified mode produces `sp.Contains(x, sp.S.Reals)` and succeeds. No compile issues are raised.

Root cause: pyIdent's RESERVED_IDENTS (codegen.ts:80) includes helper/module aliases but excludes unqualified SymPy identifiers used by emission. The default star-import mode emits both ordinary letter `S` and imported singleton registry `S` as the same identifier. Fix needs deterministic reservation/mangling or namespace-safe emission in default mode, including names referenced by runtime cleanup functions.

Regression: execute default and qualified programs with S/Q/I/E/N and names coinciding with emitted constructors/functions; results should agree.

Additional confirmed CG-02 silent wrong answers: `\displaylines{I=2\\i^2}` emits `I=2; I**2` and returns **4** instead of **-1**; `\displaylines{E=2\\e^2}` returns **4** instead of **e²**. Qualified mode correctly separates them. `Q=2` breaks `Q.prime` in prime-set membership.

### CG-03 — native Python numbers corrupt exact integer arithmetic and range (high)

Input `\displaylines{a=2\\\frac{1}{a}}`. Expected exact rational `1/2`; actual **0.500000000000000** in both import modes. Emitted `a = 2` stores Python int; later `1 / a` performs Python float division before SymPy cleanup. Literal `\frac{1}{2}` emits Rational(1,2), so equivalent expressions diverge and non-binary fractions lose exactness.

Root cause: Divide emitter (codegen.ts:1875) only chooses Rational when syntactic isIntExpr succeeds; a name bound to a numeric integer is invisible to this predicate. Numeric literals and assignments are emitted as Python ints, while fallback division uses `/`. Suggested fix: ensure arithmetic operands enter SymPy before Python's numeric evaluation (without breaking matrix division, symbolic denominators or function parameters), or reliably emit exact division.

Regression: execute `a=3;1/a`, numeric function calls `def f(x)=x/3; f(1)`, numeric bindings used in powers/division and assert Rational results.

Additional CG-03 numerical range coverage: input `1.234567890123456789\cdot10^{400}` displays infinity, and the −400 exponent variant displays0.0, although both are finite/nonzero values representable by SymPy Float. CE preserves the full numeric token in a MathJSON `{num: "1.234567890123456789e+400"}` object; codegen emits the token as a bare Python float, so overflow/underflow occur before cleanup. A 30-digit decimal similarly truncates to machine precision; large integer controls preserve all digits. This extends the same native-Python numeric evaluation root beyond division. Evidence `input-number-boundaries.json`, output and `number-boundary-results.json`. Regression ideas should include decimal token precision and very large/small exponents, not only Rational outputs.

Exact-integer consequence and severity update: **Mod(100000000000000000000000,3)** returns **2.0**, while the mathematically identical **Mod(10^{23},3)** returns the correct **1**. CE preserves the typed integer as `{num:"1e+23"}`, but codegen emits1e+23 as a Python float, whose exact integer value is99999999999999991611392. A typed10^50 numerator divided by3 becomes the exact-looking Rational **100000000000000007629769841091887003294964970946560/3**, rather than10^50/3. The Power spelling10^{50}/3 stays exact. Thus this root changes discrete integer arithmetic, beyond display precision; severity is upgraded to **high**. Integer20-digit/nonzero-rich large-integer controls remain exact. Evidence `input-exact-large-integers.json`, output and `exact-large-integer-results.json`; `input-large-integer-consequences.json`, output and `large-integer-consequence-results.json`. For overflow cases the actual float is inf; the auxiliary host Rational(inf) conversion is not used as an oracle or claimed product result. No implementation changes.

### CG-04 — constant finite-range min/max emits invalid Python (medium)

Input `\min_{i=1}^{3}2`. Expected **2**. Actual emitted `Min(*[2.subs(i, _i) for _i in range(1, 4)])` fails at Python parse with `SyntaxError: invalid decimal literal`. The Minimum/Maximum branch (codegen.ts:2085–2094) calls `.subs` directly on emitted body, which may be a Python integer or float rather than a SymPy object. Parentheses alone avoid invalid decimal parsing but still leave an int without `.subs`; convert to SymPy or emit constant extrema directly. Regression should cover constant int/float, rational, symbolic and numeric-bound bodies for min/max.

#### Further CG-04 native-number method coverage: evaluation bars

`\left.2\right|_{x=0}^{x=1}` emits `(2).subs(x,1) - (2).subs(x,0)` and fails **int has no attribute subs**, expected0. This is the same native-Python-number method assumption as constant min/max (though parentheses make it parse successfully here). `x=2; \left.x\right|_0^1` also fails. EvaluateAt branch codegen.ts:3238 needs SymPy conversion or constant handling; include literal/computed/bound constants in regression. Evidence `input-eval-integral.json`, `output-eval-integral.json`, `eval-integral-results.json`.

### CG-05 — norms of abstract matrices call unavailable MatrixSymbol method (medium)

Inputs `\displaylines{\det A\\\left\|A\right\|}` or `\displaylines{A\in\mathbb{R}^{2\times2}\\\left\|A\right\|}`. Expected symbolic norm (or a clear unsupported diagnostic). Actual `.norm()` on SymPy MatrixSymbol raises AttributeError. The Abs/Norm branch at codegen.ts:3278–3284 uses `matrixValued(..., true)` then emits `.norm()` unconditionally; `minted` includes abstract MatrixSymbol, whose API lacks this method. Other matrix branches already distinguish abstract vs concrete and sometimes call `.as_explicit()`. Regression needs concrete bound matrices, literal matrices, declared symbolic dimensions and fixed-size MatrixSymbol; no unreported runtime crash.

#### Further CG-05 matrix API coverage

The same missing representation distinction affects **trace**: `A∈R^(2×2); \mathrm{tr}(A)` or `\operatorname{tr}(A)` emits `(A).trace()` and raises **MatrixSymbol has no attribute trace**. The special Trace call branch (codegen.ts:3522) treats matrixRef (including declared MatrixSymbol dimensions) as concrete. The general `\mathrm{trace}` branch already emits `sp.Trace(A)` correctly in this case; share that behavior.

The Abs/Norm branch also ignores list vectors: `\left\|[1,2,3]\right\|` or `v=[1,2,3]; \left\|v\right\|` emits `Abs(list)` and raises **Bad argument type for Abs(): list**, expected Euclidean norm sqrt(14). Dot/cross/multiplication already wrap list vectors in Matrix; norm needs the same vector conversion. Use a 3-element list in regression to avoid the separate 2-element interval convention. `matrix-vector-results.json` confirms all these real-worker failures.

#### Further CG-05 representation reductions (05:15 UTC)

For concrete `A=[[2,1],[1,2]]`, assign `B=A^T`, then compute `||B||` or rank(B). B displays a concrete matrix, but the actual stored object is SymPy **Transpose**, so norm/rank fail with missing-method errors. `B=A^dagger` stores **Adjoint** and `B=A^-1` stores **MatPow**, with the same failures. The cleanup on assignment display calls doit on a displayed copy; it does not replace the stored B. Thus the bug affects ordinary derived matrices, beyond unconstrained MatrixSymbol inputs. Concrete/abstract typing must follow the actual emitted/retained value representation.

Conversely, `rank(∇x)` and `norm(∇x)` fail **MutableDenseMatrix has no attribute as_explicit**: Gradient emits an actual concrete matrix, but concreteMatrix omits Gradient and selects the abstract conversion path. These opposite failures reduce to the same representation-model mismatch. `input-matrix-representations.json`, `output-matrix-representations.json`, `matrix-representation-results.json` retain source/program/actual rows.

CG-15 shape propagation also misses Gradient: `∫(∇x)dx` adds scalar C to its matrix result and fails. Include gradient and other matrix-valued compositions in matrixShape coverage, in addition to I_n.

Further representation check for CG-05: direct `\nabla\cdot\nabla(x²+y²+z²)` is rejected as not a concrete field; curl of that gradient is rejected too. Assigning the identical gradient to G first makes divergence return6, as does an explicit [2x,2y,2z] matrix. `concreteMatrix(Gradient)` omits an operation that always returns a concrete Matrix, so the same representation classification gap also breaks standard operator compositions. Evidence `input-vector-composition-controls.json`, output and `vector-composition-control-results.json`. These are additional manifestations of CG-05, not new issue IDs.

Additional CG-05 function-return representation proof: defining f(t)=[t,t²,t³] stores a Python function returning a native list, while its matrixFns metadata treats it as matrix-valued. Its definition display errors SympifyError on the list; f(2) returns[2,4,8], but norm(f(2)) errors because list has no norm. Changing only the body to the tuple-matrix (t,t²,t³) gives a valid definition and norm2sqrt(21). Dotting the list-returned value with [1,1,1] fails too. Evidence `input-list-returning-functions.json`, output and `list-returning-function-results.json`. This extends the same actual-versus-recorded matrix/list representation gap, not a new ID.

### CG-06 — subtraction of parenthesized sums silently changes signs (high)

Input `1-(2+2)`. Expected **-3**. Actual Python output `1 - 2 + 2` evaluates **1**. Input `((6)+(3))-((y)+(4))` yields **13-y**, expected **5-y**. A seeded differential grammar sweep independently constructs expected exact SymPy expressions and found hundreds of such mismatches.

Root cause: Add emission (codegen.ts:1515–1522) detects a Negate child, emits its body with minimum precedence `PREC_ADD`, then inserts ` - `. A nested Add has exactly that precedence, so no parentheses are produced. Raising the required precedence for subtracted Add bodies (or emitting unary negation faithfully) fixes the loss; also audit defensive Subtract path at 1538. Regression: subtraction of multi-term sums, nested differences, negated sums at first and later terms, and symbolic/function/matrix terms. Capture actual numerical results, not only expected strings.

### CG-07 — calculator snapshots preserve mutations from cells that were edited or deleted (high)

Actual worker `SETUP_PY` extracted from calculator.worker.ts and executed with SymPy 1.14.0 via `snapshot-probe.py`.

Reproduction:
1. Python cell 1 `a=[]`; Python cell 2 `a.append(1)`; Python cell 3 `len(a)` gives **1**.
2. Change cell 2 to `a.append(2)`. Expected **1** (re-evaluate from empty list), actual **2**.
3. Delete cell 2. Expected **0**, actual **2**. Stale data persists until the first defining cell changes or engine reloads.

Matrix variant: `A=sp.Matrix([[1,2],[3,4]])`, then `A[0,0]=9`, then `sp.trace(A)` gives 13. Delete mutation cell: expected **5**, actual **13**.

Root cause: `mc_run` appends snapshots with `dict(_ns)` (calculator.worker.ts:1260); these are shallow copies. Mutations in later cells alter the mutable objects stored in all earlier snapshots. Rewind restores a dictionary already containing downstream side effects. Need a valid rollback strategy for user mutable objects (safe replay from earliest relevant boundary or isolated/deep snapshot with careful function/global semantics); blindly deepcopy-ing imported modules/functions will need testing. Regression must execute the real worker program twice and after deletion, covering lists, matrices, aliased mutables and Python functions with mutable state. Evidence `snapshot-probe.py`, `snapshot-results.txt`, extracted `worker-setup.py`.

Further CG-07 function-state proof: Python counter(state=[]) appends1 and returns its length. A later assignment n=counter() initially gives1; editing only a comment on that call cell gives2 instead of replayed1. Deleting the call then inspecting the function default-list length gives2 instead of0. The shallow snapshot shares the function and its mutable __defaults__, not only directly bound lists/matrices. A generic deep copy of namespace dictionaries does not necessarily isolate function objects/defaults/closures, so this case must be included in any future rollback validation. Evidence `input-default-state-snapshots.json`, output and `default-state-snapshot-results.json` use actual frontend-style content keys and the extracted worker across all three requests. No extra ID or implementation change.

### CG-08 — assignment display re-evaluates the RHS after the value has changed (high)

Input `\displaylines{a=2\\a=a+1\\a}`. Real worker outputs `a = 2`, **`a = 4`**, then **`3`**. Expected second row `a = 3`, matching the actual binding. `x=x+1` starting symbolic displays False because its display computes `Eq(x,x+2)`.

Root cause: emitStatement Assign emits `a = a+1` and sets display to `Eq(Symbol("a"), a+1)` via assignDisplay (codegen.ts:4190, 4613). `_mc_eval_stmt` execs the assignment, then evals display. Therefore RHS sees the newly assigned value. Side-effecting Python functions on RHS also execute twice. Use actual bound result in display (preserve intended list/matrix/set display conversions) and avoid executing RHS twice. Regression should evaluate real assignment+display programs for self-reference, matrix rebindings and side-effecting Python calls.

Further CG-08 display-effect reduction: a Python tick(x) that increments a counter is executed merely by defining math f(x)=tick(x), before any f call. Counter is0 after the Python definition cell and1 immediately after the math definition. The Def display expression (codegen.ts:4670 onward) executes the body with Symbol parameters to show the definition. A numerical-only Python helper native(x)=math.sin(x) makes the valid f definition show **Cannot convert expression to float**, although f(0) subsequently works. Definition display must not alter user state or require every helper to accept symbolic arguments. Evidence `input-definition-display-effects.json`, output and `definition-display-effect-results.json` retain actual prefix runs/counter state. This is grouped with CG-08's display-executes-user-code root, not an extra ID.

### CG-09 — Python cell's trailing expression executes twice (high)

Python cell input:
```python
it = iter([1,2,3])
next(it)
```
Expected **1**, actual worker displays **2**. `a=[1]\na.pop()` should display 1 but errors **pop from empty list**.

Root cause: PythonSource branch (codegen.ts:4940) returns full source including final expression as `code`, and the trailing expression separately as `display`. Worker `_mc_eval_stmt` execs full source then evals display, duplicating expression side effects. Need execute preceding statements once and evaluate final expression once, ideally with Python AST support for multiline expressions/strings rather than fragile textual extraction. Preserve code display and standalone Python target. Regression should cover iterators, mutable pop/counter functions and pure trailing expressions.

Additional CG-09 extraction failures: a valid Python cell `x=1` followed by `x+=1` executes the assignment (x becomes2), then shows **invalid syntax** because display is emitted as clean_and_simplify(x+=1). Indexed *= assignments fail likewise. `trailingPythonExpr` (codegen.ts:4162 onward) excludes += etc. from the simple-assignment regex but never classifies those forms as statements. A final standalone triple-quoted multiline string is executed successfully, then its last line `"""` is re-evaluated as an unterminated string. Single expression `"a=b"` is falsely classified as assignment and echoes the source including quote characters, rather than the string value. The simple `x=x+1` statement control succeeds. These strengthen the same PythonSource/trailing-expression root and AST-based remediation analysis; they are not extra IDs. Evidence `input-python-trailing-forms.json`, output and `python-trailing-form-results.json`, including post-execution variable values.

### CG-10 — modular congruence reduces only its left-hand operand (high)

`8\equiv5\pmod{3}` is True because 8−5 is divisible by 3. Actual generated `Eq(Mod(8,3),5)` returns **False**. The relation is incorrectly asymmetric: `-1 ≡ 2 (mod 3)` returns True, while `2 ≡ -1 (mod 3)` returns False. No diagnostics.

Root cause: Congruent special case in codegen.ts:3636 emits `Eq(Mod(a,m), b)`, leaving the RHS outside the residue class normalization. Emit `Eq(Mod(a-b,m),0)` or compare both residues; preserve symbolic behavior. Regression: both non-canonical residues, swapped operands, negatives, and symbolic congruences. Evidence `input-congruence.json`, `output-congruence.json`, `python-values-congruence-results.json` (actual worker SETUP_PY execution).

CG-10 occurs in **three** emit paths: IdenticallyEqual with Mod RHS (~1998), Congruent head (~2013), and call-tier Congruent (~3636). Fixing only the call-tier branch leaves common parsed `\pmod` input wrong.

### CG-11 — math cells silently overwrite Python cell assignments (high)

Python cell `a=2`, then math cell `a+1`. Expected **3**, actual **a+1**. Compiler emits `a = Symbol("a")` before the math cell, wiping the existing value. Python `A=sp.Matrix([[1,2],[3,4]])` followed by math `\det A` similarly replaces A with MatrixSymbol and displays unevaluated determinant instead of **−2**. Python assumptions (`a=sp.Symbol("a",positive=True)`) are lost too. Python `i=3`, then math `i+1` returns **1+i**, ignoring assigned i entirely.

This contradicts USER-GUIDE.md:462–464: “Python cells run in the same shared namespace as the math cells, in worksheet order — import, assignments, and defs above are in scope below.”

Root cause: collectPyFns registers Python function definitions only; PythonSource emission leaves scope.decls.defined and value-kind tracking unaware of Python assignments/imports. Subsequent math emission mints Symbol/MatrixSymbol declarations (or constant i) as though nothing had been bound. Need propagate bindings or defer declaration selection against actual worker namespace, retaining matrix/type behavior and deterministic shown code. Regression: Python scalar/matrix/set assignments, imported symbols, assumptions and subsequent math use; verify new math definitions can intentionally override prior Python bindings.

Evidence: `input-python-values.json`, `output-python-values.json`, `python-values-congruence-results.json`.

CG-11 registry false-positive counterpart: adding a Python cell containing only `if False:` with an indented `def ghost(x): return x+1` changes a later math `\mathrm{ghost}(2)` from a valid symbolic unknown function to **name 'ghost' is not defined**. The same happens when the apparent def is merely text inside a triple-quoted string, or a local function nested inside outer(). No top-level ghost is bound in any of those Python namespaces. A true conditional definition control returns3. `scanSource` (pydefs.ts:131–177) regex-scans every text line without Python lexical strings/indentation/execution scope, and collectPyFns treats every match as a worksheet-global callable. Thus inferred Python bindings are wrong in both directions: real values are missed, and nonbindings are invented. Evidence `input-python-false-bindings.json`, output and `python-false-binding-results.json`, with the no-Python symbolic control and namespace membership checks. This resolves the earlier nested-def/string-registry uncertainty through an explicit noninterference control; no additional ID or implementation change.

CG-11 valid-definition spelling coverage: a Python function named α with an explicit #@latex mathcal-F alias remains an unknown symbolic F(2) in math instead of returning3. The same alias on an ASCII alpha function correctly returns3. A legal backslash-continued def whose name is on the next line is missed too. scanSource's ASCII-only first-identifier character and per-line regex cannot represent these valid Python definitions; the explicit alias controls remove ambiguity about how Greek math names should map. Evidence `input-python-definition-spellings.json`, output and `python-definition-spelling-results.json`. These extend the already reported registry inference root without adding an ID.

### CG-12 — tuple destructuring drops matrix/vector value kinds (medium)

Input `\displaylines{(u,v)=([1,2,3],[4,5,6])\\u\bullet v}`. Expected dot product **32**, actual emitted `u * v` raises **can't multiply sequence by non-int of type 'list'**. Tuple destructuring of two matrix literals followed by `\det A` is rejected as **A is a scalar here**, despite A actually being a Matrix at runtime.

Root cause: emitStatement Assign's tuple-target branch (codegen.ts:4549) calls only markDefined for members. It does not bindAssigned with each corresponding RHS element's list/matrix/set/finite kind. Scalar assignments take that full transition; tuple assignments need equivalent per-member facts and should clear stale kinds on rebind. Regression: list/matrix/set tuple assignments followed by their operators, chained/cross-cell uses, tuple swap/rebind clearing stale kinds. Actual worker evidence `input-matrix-types.json`, `output-matrix-types.json`, `matrix-vector-results.json`.

### CG-13 — higher total derivatives fail once a Jacobian is a full matrix (medium)

`\D^3(x^3+y^3)` and `\D^2(x^2,y^2,z^2)` both compile without diagnostics but fail at runtime **``self`` must be a row or a column matrix**. Scalar second total derivative `\D^2(xy)` does work (Hessian [[0,1],[1,0]]), so the next order/same operation on vector fields is the uncovered transition.

Root cause: TotalD branch codegen.ts:2514–2518 computes repeated `.jacobian(vars)` calls. After a scalar Hessian or vector field's first Jacobian, the intermediate result is a genuine m×n matrix. SymPy's Matrix.jacobian only accepts row/column vectors. The derivative is a higher-rank tensor; use a representation/elementwise tensor differentiation that preserves shape, or issue an explicit unsupported-order diagnostic before execution. Regression: scalar orders 1/2/3, vector orders 1/2, univariate high order, and correct tensor shape/results for supported forms. Evidence `input-vector-calculus.json`, `output-vector-calculus.json`, `matrix-vector-results.json`.

### CG-14 — reversed inequalities with named constants solve for the constant (high)

Input `\text{solve} x^2=16\text{ for }\pi<x`. Expected **x=4**, identical to `for x>\pi`. Actual generated `solveset(Eq(x**2,16), pi, domain=Interval.open(-oo,x))` and output **π∈∅** with no diagnostic. Forward inequality `x>\pi` correctly returns x=4. The same relational-domain helper miscompiles `x² for π<x` as an image over a manufactured Pi symbol instead of x.

Root cause: Emitter.relationalDomain (codegen.ts:1037–1091) chooses the first string operand as the variable. MathJSON constants such as Pi and ExponentialE are also strings, so `Pi < x` incorrectly selects Pi instead of recognizing the constant and reversing the relation around x. Respect known constants and bound values when selecting a variable, and use explicit solver variables when available. Regressions: both orientations of x>π, x<e, inequalities against assigned constants, and domain-comprehension inputs; verify equivalence to corresponding interval domains. Evidence `input-solver-domain.json`, `output-solver-domain.json`, `solver-domain-results.json`.

Related domain limitation, **not counted as a separate confirmed bug**: chained `for 0<x<2` is explicitly downgraded with “solving without one” note and returns ±1 for x²=1, rather than restricting to1. The current helper only supports binary relations. Explicit solver variables also deserve validation when a domain clause names a different parameter: currently `solve x+y=1,x for y>0` solves for y but labels output as x. These are useful follow-up coverage cases for any domain fix.

### CG-15 — indefinite integral of an identity matrix adds a scalar integration constant (medium)

Input `\int I_2 dx`. The documented I_n shorthand correctly emits `eye(2)` as integrand, but integral emits `integrate(eye(2),x) + Symbol("C")`. Actual worker raises **unsupported operand type(s) for +: ImmutableDenseMatrix and Symbol**. Expected x*I₂ plus a 2×2 matrix integration constant (or an explicit unsupported diagnostic).

Literal matrix/vector integrals already work and emit MatrixSymbol constants of matching shape; this is a missing identity-matrix shape case. Emitter.matrixShape (codegen.ts:866) handles Matrix literals and bound matrix names but does not ask identityDim for I_n. Integrate's constant creation depends on that returned shape. Add identity shape propagation, respecting an explicit I_n binding override. Regression: indefinite/iterated I₂ integral, identity sums/products, explicit scalar I₂ rebind, and existing literal matrix/vector integral shapes. Evidence `input-eval-integral.json`, `output-eval-integral.json`, `eval-integral-results.json`.

### CG-16 — cross-cell references forget allocated name disambiguation (high)

Cell1: `x_{-}+x_{+}`. Cell2: `x_{-}-x_{+}`. Expected second row **x₋−x₊**, two distinct free symbols. Actual second row **0**, with no diagnostic. The same difference in a fresh single cell correctly remains symbolic.

Generated cell1 declarations correctly disambiguate the Python identifiers:
```python
x = Symbol("x_{-}")
x_2 = Symbol("x_{+}")
```
But generated cell2 is `clean_and_simplify(x - x)`, discarding the allocated x_2 mapping.

Root cause: Emitter.alloc stores disambiguated mappings in scope.emit.symbols/functions/matrices. At a cell boundary, cellBody marks raw names defined. Emitter.sym's defined-name shortcut (~947) returns `pyIdent(name)` rather than the previously allocated identifier; both sign-subscript names mangle to x. Matrix/function defined-name shortcuts deserve the same audit. Resolve bound raw names through their allocated maps consistently, including assignment/parameter emission paths, and ensure deliberate rebindings keep one stable identifier.

Regression: same/cross-cell sign-subscript pairs, complex-subscript names whose punctuation mangles identically, three-or-more collisions, and matrix/function uses; assert actual semantic results and persistent identifier identity across cells. Evidence `input-allocator.json`, `output-allocator.json`, `allocator-results.json` (actual worker execution).

### CG-17 — assigning matrix-valued word operations loses the matrix type (medium)

`A=\begin{pmatrix}2&1\\1&2\end{pmatrix}`, then `B=\mathrm{inverse}(A)`, then `\det B`. Expected B displays the inverse matrix and det B is **1/3**. Actual B row displays **False**, then the determinant is rejected as **B is a scalar here**, despite B being a concrete Matrix at runtime. transpose/rref/adjugate versions fail the same way (expected det3/1/3 respectively). Inline literal matrix operands also fail.

Root cause: matrixValuedNode recognizes direct Matrix/Transpose/Inverse nodes and registered matrix-returning functions, but not call-tier matrix-valued word methods (inverse/transpose/rref/adjugate) or MatrixMethod nodes. Assign infers matrixRhs=false, emits Eq(Symbol,Bvalue) without evaluate=False (collapses False), and binds B as scalar. This also hides matrix-returning function bodies from downstream matrix operations.

Add return-kind metadata for each matrix word operation/MatrixMethod and share it between matrixValuedNode, concreteMatrix and shape typing; do not classify scalar-returning rank/det/trace/norm or list/tuple-returning nullspace/diagonalize incorrectly. Regression: each matrix-returning method with literal/bound operands assigned to a name and used directly/as function body; expected runtime determinant and proper displayed equation. Evidence `input-matrix-return-kinds.json`, `output-matrix-return-kinds.json`, `matrix-return-kind-results.json`.

### CG-18 — standalone Python cell output omits transitive helper definitions (medium)

Python cell1:
```python
def helper(x):
    return x+1
```
Python cell2:
```python
def outer(x):
    return 2*helper(x)
```
Math cell3: `\mathrm{outer}(3)`. Calculator correctly returns8. The Python target advertises standalone per-cell scripts but cell3 output is only:
```python
from sympy import *
def outer(x):
    return 2*helper(x)
outer(3)
```
Executing that copied cell script raises **NameError: helper is not defined**. A variant where helper's source also imports math fails similarly; the needed source/import never gets included.

Root cause: Scope.notePyUse records only directly called registry entries in py.usedSrcs. compileWorksheet (~5087) injects exactly those snippets into cellLines; calls inside their Python source are not dependency-closed, so helper snippets from other cells disappear. The whole sequential worksheet and calculator work because those earlier sources execute in place. Standalone output needs its complete prerequisite namespace/source closure, or a clear limitation/diagnostic if arbitrary Python dependency analysis is unsupported. Regression: two-/three-level helper chains across cells, imports, global constants, shared/cyclic helpers and same-source helpers. Evidence `input-python-transitive.json`, `output-python-transitive.json`, `python-transitive-results.json`.

### CG-19 — solver identities are displayed as having no solutions (high)

`\text{solve}x=x`, `\text{solve}x^2=x^2,x` and `\text{solve}0=0,x` all display **x∈∅**, with no diagnostic. Expected all x in the applicable domain. The control `solve x=x for x∈R` correctly displays x∈R, while the genuinely inconsistent `solve x=x+1,x` also displays x∈∅.

Root cause: the default Solve branch calls sp.solve, which returns[] both for a tautology and for an inconsistent equation. calc-runtime.mc_answers interprets every[] result as empty solution set. The solver/formatting protocol loses the original equation's truth/domain information, so the formatter cannot distinguish these mathematically opposite cases. Preserve equation/domain solution semantics before formatting (e.g. identity classification or a set-valued solve path); ensure underdetermined systems and empty/false constraints are distinguished too. Regression: True/False equations with explicit/inferred variables, identities after simplification, domain-qualified controls, and underdetermined systems. Evidence `input-solver-identities.json`, `output-solver-identities.json`, `solver-identity-results.json` from the real worker.

This issue was suggested by the rendering agent and is owned here as solver/codegen semantics; RENDER14 (zero-space formatter) remains separately owned by rendering. No fixes performed.

### CG-20 — callable composition/parenthesized-lambda assignments are later multiplied (high)

Define f(x)=x+1 and g(x)=2x with the normal math `\text{def}` marker; assign `h=f\circ g`, then write `h(3)`. Expected **7**. Actual output is **3·(a↦2a+1)**, with no diagnostic: the compiler emits `h * 3` instead of calling h. This occurs in one multiline cell and across separate cells. h itself correctly displays as a Lambda, so its value and later interpretation disagree.

A reduced second variant is one multiline cell `\displaylines{h=(x\mapsto x^2)\\h(3)}`. Expected9; actual3·(x↦x²). Controls `h=x\mapsto x²` without RHS parentheses in the same cell, or parenthesized h definition in one cell followed by h(3) in another, both correctly return9.

Root cause: the normalizer's callable-name registration relies on raw RHS shape rather than the normalized callable value. Parenthesized Lambda loses same-cell registration even though normalized Assign RHS is Function. Composition is a call-tier Ring that emits SymPy Lambda, but Assign only declares functions for a direct Function RHS; subsequent normalizations never learn h is callable. Consequently InvisibleOperator(h,Delimiter(3)) folds to Multiply. Carry consistent callable-result facts through normalization and emission rather than treating callable values as ordinary scalar assignments. This is diagnostic analysis only; no implementation performed.

Regression ideas: same-/cross-cell parenthesized and unparenthesized Lambda assignments, composition assignment/application with declared functions, Greek/mangled names and valid noncallable scalar controls. Evidence `input-composition.json`, `output-composition.json`, `composition-results.json`, plus `input-lambda-callfold.json`, `output-lambda-callfold.json`, `lambda-callfold-results.json` for controls. Actual worker execution confirms the wrong mathematical value, not merely a generated-string difference.

### CG-21 — historical symbol/matrix facts override later bindings (medium)

Variant1: first use free A (`A+1`), then assign A=[[2,1],[1,2]], then request det A. Expected3; actual compiler error **det needs a matrix — A is a scalar here**. This occurs in one cell or across three cells. Control A=2 followed by the same matrix assignment and determinant correctly returns3.

Root cause: Emitter.matrixArg checks whether the raw name ever existed in scope.emit.symbols/functions before considering its current matrix binding. The historical declaration maps intentionally persist, so a prior free-symbol use permanently misclassifies a subsequently matrix-bound name. Current binding facts must take precedence over historical declaration bookkeeping.

Variant2: define f(x)=(x,x²,x³), then redefine f(x)=x², then evaluate |f(2)|. Expected4; actual **int has no attribute norm**. A fresh scalar-only f definition correctly returns4. Scope.claimFunction does not clear the old matrixFns mark when a later scalar-valued definition replaces the matrix-valued function, so Abs/Norm still selects the matrix path.

These are binding transitions involving previously valid names, not a missing return-kind case on a new operation (CG-17), nor tuple assignment metadata (CG-12). Regression ideas: symbol→matrix, dependent-function→matrix, matrix-returning→scalar-returning function, reverse transitions, and same-/cross-cell controls. Evidence `input-rebind-matrix.json`, `output-rebind-matrix.json`, `rebind-matrix-results.json`, and `input-rebind-function.json`, `output-rebind-function.json`, `rebind-function-results.json` (actual worker execution). The matrix→function-name attempt produced an explicit not-callable diagnostic and is retained as a control, not a separate confirmed bug.

#### Additional CG-21 reduction: abstract function stubs become noncallable at a cell boundary

Cell1 operatorname{foo}(x), cell2 operatorname{foo}(2) should retain the same undefined callable and display foo(2). Actual cell2 is rejected **foo is bound to a value — not callable**. Both calls in one displaylines cell work. Emitter.fn checks scope.decls.defined before recognizing the already allocated Function entry; cellBody marks new function declarations defined at the boundary, but declaredFns only tracks explicit defs. The historical “defined” bookkeeping is incorrectly equated with a concrete noncallable value. Evidence `input-abstract-function-reuse.json`, `output-abstract-function-reuse.json`, `abstract-function-reuse-results.json`. This is grouped with CG-21's current-binding classification inconsistencies rather than counted again.

### CG-22 — explicit definitions with already-applied parser heads lose the def marker (medium)

`\text{def} A(x)=x²` followed by A(2) does not define A and return4. The parser emits an already-applied signature node inside the marker: `InvisibleOperator('def', ['A','x'])`. defMarkedShape wraps that lone array in another InvisibleOperator instead of passing the applied signature directly to functionDefShape, so no Def IR is created. The line becomes an equation involving a free symbol named **def** and an undefined A(x). Subsequent application remains undefined or raises **A is bound to a value — not callable** across cell boundaries (the separate callable-state symptom is covered under CG-21).

A and F both reproduce this. Lowercase g, an ordinary operatorname{foo}, and Greek lambda controls define successfully and return4. With an earlier A=x↦x², an attempted explicit vector-valued redefinition is likewise ignored, leaving the old scalar function/result4 instead of the newly defined vector.

Root cause: defMarkedShape (~ir.ts:856) supports rest consisting of a bare name or a split name+Delimiter, but not the one-node applied signature representation that functionDefShape itself already understands. This is a normalization shape gap, not a request to override a protected builtin. Regression ideas: parser representations for uppercase/nonbuiltin applied heads, bare declarations and definitions, same-/cross-cell application and redefinition controls. Evidence `input-def-head-shapes.json`, `output-def-head-shapes.json`, `def-head-shape-results.json`, plus `input-callable-redefinition.json`, `output-callable-redefinition.json`, `callable-redefinition-results.json` for the ignored-redefinition reduction.


Browser integration confirmation: `browser-final-results.json` and `browser-final.png` verify CG-20 lambda/composition multiplication, CG-21 false scalar classification after matrix rebinding, CG-22 uppercase def marker loss, and CG-16 cross-cell difference→0 in the actual app. Controls return9/4 correctly. Recorded row text includes both accessible speech and visible glyph text, so duplicate digits in allTextContents are accessibility duplication, not an extra numeric error. Serialized field values are retained to show these inputs survive MathQuill round-trip. No product modifications.

Related applied-head coverage for CG-22: ODE dependent-variable specs and initial conditions also recognize only InvisibleOperator-style application. `\text{dsolve}\frac{dA}{dx}=A,A(0)=1,A(x)` should give A(x)=e^x, but keeps A(0)=1 and A(x) as extra equations and errors **Number of equations and number of functions do not match**. The same A ODE without those suffixes correctly returns C₁e^x; lowercase y with the identical initial condition/spec correctly returns e^x. `depSpecOf` (ir.ts:939 onward) and `icShapeOf` (1065 onward) miss CE's direct applied head ['A',arg], just as defMarkedShape misses that representation. A finite manufactured-solution audit found72 errors sharing precisely this uppercase applied-head root;372 other ODE/PDE/system programs passed independent solution/initial-condition or residual checks, with zero mismatches/timeouts. Evidence `diffeq-cases.json`, `diffeq-compiled.json`, `check-diffeq.py`, `diffeq-stats.json`, `diffeq-anomalies.json`, and reduced `ode-applied-head-control-results.json` with matching input/output. This is grouped with the existing applied-head normalization issue rather than counted again.

### CG-23 — free-name collection includes calculus-bound indices (medium)

`\D(\sum_{j=1}^{3} jx)` should return scalar6 (equivalent to D(6x)); actual output is the row matrix **[0,6]**. With dummy index i instead of j, it fails **Can't calculate derivative wrt I**. `\D(\int_0^1 tx dt)` similarly returns **[0,1/2]** instead of scalar1/2. The local summation/integration variable is being treated as an extra free coordinate.

The same collector affects implicit integration-variable inference: `\int(\sum_{j=1}^{3}jx)` has only free x, so it should infer x and integrate6x to3x²+C. Actual compilation rejects it **can't infer the integration variable — add a differential like dx** because it incorrectly sees both j and x as free.

Root cause: freeNames (~codegen.ts:3780) understands Function binders, and skips the variable slot of Limits, but still collects those operator-bound names from Sum/Integrate bodies. It lacks a lexical binding scope for the operator body. TotalD uses this result directly as Jacobian coordinates; outside the Sum's emission scope, i resolves to the imaginary unit. Integration inference likewise receives an inflated name set. This is a collector defect distinct from CG-01's emission-time binding lookup/type leakage.

Regression ideas: Sum/Product/definite Integral/Limit binders nested within other expressions, repeated/shadowed dummy variables, body variables versus bound expressions, and equivalent dummy-index renaming. Evidence `input-free-binders.json`, `output-free-binders.json`, `free-binder-results.json` from actual worker execution. Plot signature inference also consumes freeNames; any plot-specific symptom should reference this shared root rather than double-count it.

Additional CG-23 scope-resolution reduction: after f(x)=x² and g(x)=x³, `\D(f+g)` and `\D(2f)` are rejected as needing a free variable, while `\D(f(x)+g(x))` correctly gives3x²+2x and an ordinary bare `\D f` works. Bare functions are implicitly applied at their recorded signatures during emission, but the syntactic free-name collector sees f/g, and TotalD removes those already-defined names without adding their signature variables. Similarly `\int f` emits an invalid integration variable f(x)=x², while `\int f dx` succeeds. Expected D(2f)=4x and the single-variable integral x³/3+C. Remediation analysis must include semantic implicit applications alongside lexical binders when deriving free variables. Evidence `input-implicit-function-freevars.json`, output and `implicit-function-freevar-results.json`; explicit-application/differential controls retained. No additional ID or implementation change.

Further CG-23 lexical-scope proof: Python higher(a,g)=g(a), then math higher(x,(x↦x²)), correctly evaluates to x². Its total derivative is rejected as needing a free variable; renaming only the Lambda's bound parameter from x to t makes it correctly return2x. The inferred integral likewise fails for the x-bound spelling but succeeds as x³/3+C after the dummy rename. freeNames(Function) mutates the shared accumulator and deletes its bound x, incorrectly erasing the earlier, independent free x from the first call argument. This alpha-renaming control proves a true lexical-scope defect beyond operator-bound Sum/Integral handling. Evidence `input-lambda-free-name-deletion.json`, output and `lambda-free-name-deletion-results.json`. No additional ID or implementation change.

### CG-24 — evaluating a function changes its later derivative/gradient (high)

Define f(x)=x², then evaluate f(2), then request D f. Expected2x, as in the control without the intervening f(2); actual **total derivative needs a free variable**. More seriously, gradient f after the same f(2) returns **[0,0,0]**, while the control correctly returns **[2x,0,0]**. A function evaluation has not changed its definition, yet subsequent calculus does. The total-derivative error also occurs across separate cells.

Root cause: Scope.noteCallArgs overwrites fnArgs with observed call-site arguments (here[2]), replacing the declared formal signature[x]. TotalD filters those recorded arguments to string variables, finds none and errors; Gradient applies f at the recorded numeric point and differentiates constant4. Declared function signatures and observed application points have different lifetimes but are stored/read as interchangeable facts. Lambda's separate signature fallback also merits validation when observed fnArgs takes precedence.

Regression ideas: numeric/symbolic calls between a definition and D/gradient, single-/multi-parameter functions, Lambda definitions and repeated/cross-cell calls. The derivative must be invariant under unrelated evaluations of the same unchanged function. Evidence `input-call-signature-history.json`, `output-call-signature-history.json`, `call-signature-history-results.json` from the actual worker, with no-intervening-call controls. No implementation performed.

### CG-25 — explicit assignment to subscripted names binds a different name or function (medium)

Reproduce one cell `\displaylines{a_n:=2\\a_n+1}`. Expected assignment followed by **3**, matching `a_n=2; a_n+1`. Actual assignment display says a_n=2 but the next row stays a_n+1. Generated Python assigns `a__n = 2` while referencing a separately declared `a_n = Symbol("a_n")`. Numeric subscripts fail similarly; compound subscripts a_{n+1} and a_{ij} are controls that correctly return3.

A related sign-subscript path is more destructive: `\displaylines{x_{-}:=2\\x_{+}:=3\\x_{-}+x_{+}}` should yield5, but defines **Subminus=Lambda(x,2)** and **Subplus=Lambda(x,3)** and leaves the sum symbolic. This is independent of CG-16: all statements are in one cell and the binding targets themselves are already wrong before allocation.

Root cause: `parseCellLatex` (ir.ts:526–555) trusts CE's raw assignment representation. A simple-subscript assignment target arrives as Subscript(a,n), while the same expression reference arrives as the atom a_n. `subscript-name` (ir.ts:2217–2236) always rewrites structural Subscript(a,n) as a_{n}, producing two distinct symbol identities. For sign subscripts CE has already interpreted the structural head as a function signature before the normalizer sees it: raw Assign(Subminus,Function(2,x)). The existing subscript-sign expression rule correctly maps Subminus(x) to x_{-}, but cannot recover the assignment target from that shape. An ordinary equals sign does not repair sign-subscript assignments: those rows remain equations rather than assignments because statement equality classifies the unnormalized structural LHS. These are target/reference normalization gaps, not floating-point or allocator errors.

Suggested remediation analysis: consistently normalize supported symbol-name shapes before classifying/binding assignments; preserve supported sign-subscript assignment identity when interfacing with the upstream parser. Do not silently turn a variable assignment into a structural-head function definition. Regression ideas: same/cross-cell `=` and `:=`, simple/numeric/compound/sign subscripts, with controls for actual f(x):=x² function definitions (correctly f(2)=4). Evidence: `input-assignment-name-shapes.json`, `output-assignment-name-shapes.json`, `assignment-name-shape-results.json`; `input-assignment-name-controls.json` / corresponding output and worker results; `input-colon-subscript-controls.json`, corresponding output and `colon-subscript-control-results.json`. All executions used the extracted actual worker; no implementation changes.

### CG-26 — a guarded piecewise function evaluates its inactive singular branch (medium)

Define `\text{def} f(x)=\begin{cases}1/x & x\ne0\\0 & \mathrm{otherwise}\end{cases}`, then evaluate f(0). Expected **0**, since the reciprocal branch is excluded at zero. The function displays correctly, but f(0) raises **division by zero**. Directly assign x=0 before the same cases expression and it fails too. The equivalent mapsto-Lambda definition correctly returns0; f(2) is an ordinary successful control. A literal cases expression containing 1/0 in an inactive branch also returns0 because that literal lowers through Rational rather than native Python division.

Root cause: Which/Piecewise (codegen.ts:2289–2320) eagerly evaluate each emitted Python branch argument before constructing SymPy Piecewise. Def (4642 onward) directly executes that body on native Python argument values. Thus Python computes 1/0 before Piecewise can discard the false branch. This is not merely CG-03's approximate result: a mathematically defined, explicitly guarded expression errors. A Python helper that raises when called in a provably false branch reproduces the broader eager-branch problem as well; that supporting example does not depend on division.

Suggested remediation analysis: retain symbolic or lazy branch evaluation through concrete function application, and ensure branches excluded by a decidable condition cannot raise or perform side effects. Preserve symbolic Piecewise behavior when conditions remain unknown. Regression ideas: guarded reciprocals at/away from zero, definition and Lambda equivalence, nested cases, and failing Python helpers in false versus true branches. Evidence `input-piecewise-guards.json`, `output-piecewise-guards.json`, `piecewise-guard-results.json`; matching `piecewise-guard-controls` input/output/results verify the controls and helper branch. Host execution used the actual extracted worker. No implementation changes.

### CG-27 — changing the import setting reuses snapshots with the wrong prelude (medium)

Start a worksheet with only the numeric math cell **1**, in qualified-import mode (Settings: import* unchecked). Let it finish. Enable import*, then append a new math cell **x²**. Expected x². Actual calculator error: **name 'Symbol' is not defined**. Appending 1/3 instead produces **name 'Rational' is not defined**. Changing the initial numeric cell from1 to2 forces a cold prelude and makes x² work; a fresh unqualified worksheet also works.

Root cause: calculator.svelte.ts:265–269 keys each cached cell using only defs/statements. Numeric cell1 emits identical code in both modes, so its key is unchanged. calculator.worker.ts mc_run (snapshot reuse at roughly1160–1172, extracted worker lines) restores that snapshot and executes the new program prelude only when no snapshots survive. The preserved qualified namespace has no unqualified Symbol/Rational imports required by the new mode. The prelude is execution state but is omitted from cache identity.

Suggested remediation analysis: include prelude/import configuration in cache invalidation, or explicitly rebuild compatible namespace state whenever it changes. Regression ideas: both toggle directions; unchanged numeric or Python-only prefixes; append/edit Symbol, Rational and matrix cells; ensure normal unchanged-mode caching still works. Evidence `input-prelude-cache.json`, output, and `prelude-cache-results.json` reproduce with actual frontend-style JSON content keys, plus cold/change-firstcell controls. **Real browser/Pyodide confirmed the Settings-equivalent store toggle and failure/recovery:** `browser-prelude-results.json` and `browser-prelude.png`. Its state_unsafe_mutation pageerror is the separately investigated UI baseline issue, not a claimed cause of this cache failure. No implementation changes.

### CG-28 — vector-field dimensions are lost after assignment and curl accepts invalid shapes (medium)

Literal `\nabla\cdot\begin{pmatrix}x^2\\y^2\end{pmatrix}` correctly returns **2x+2y**. Assign the same column to F first, then evaluate `\nabla\cdot F`: actual **index out of range**. The 1×2 row-vector variant also fails. Both have valid 2D vector-field semantics already supported by the literal path.

Conversely assigning a **2×2 matrix** F=[[x²,y²],[z²,w²]] before divergence produces2x+2y+2z, silently flattening and ignoring its fourth entry. The direct 2×2 literal correctly receives a needs-a-2-or-3-vector diagnostic. Curl accepts that 2×2 literal as well as its assigned form and returns a three-entry result, silently discarding the fourth component.

Root cause: divergence CircleMinus (codegen.ts:1596–1637) obtains literal component count, but assumes3 whenever the count is unknown for a bound name, even though its concrete runtime dimensions are available. `vectorEntries`/`vectorLen` have no bound-value dimension lookup. Curl CircledAst (1790–1818) tests literal len==3, but ORs that requirement with concreteMatrix(F); consequently every concrete matrix bypasses vector-arity validation. These paths need consistent runtime/static vector shape checks and correct 2D divergence handling, rather than assuming every concrete value is a 3-vector.

Regression ideas: row/column 2D/3D fields before and after binding; matrix-valued function returns; nonsquare and 2×2 matrices; too few/many components; literal/bound equivalence. Evidence `input-divergence-dimensions.json`, output and worker results; `input-divergence-shape-controls.json`, output and `divergence-shape-control-results.json`. Two-entry square brackets in the first corpus are closed intervals, so those errors were excluded from the valid-vector finding; the confirmed reproduction uses explicit matrices. No implementation performed.

### CG-29 — curl references undeclared or value-bound coordinate variables (medium)

Input **`\nabla\times[1,2,3]`**, expected the zero vector. Actual **name 'y' is not defined**. A nonconstant field [x²,0,0] also fails because y/z never appear in its components and therefore are not declared. The field [x²,y²,z²] is a control that correctly returns the zero vector. Divergence of [1,2,3] correctly returns0.

With x=2 assigned before curl[x,y,z], the emitter instead raises **First variable cannot be a number:2**; the field's first component is constant and its curl is still the zero vector.

Root cause: curl's row helper (codegen.ts:1806–1817) interpolates raw x/y/z Python variable names as differentiation coordinates, without calling sym() or constructing explicit symbolic coordinates. Components only mint symbols they themselves use. This differs from divergence, which emits Symbol('x') etc. independently of component occurrence. Coordinates also resolve to prior concrete user values. Regression ideas: constant fields, fields missing one or two coordinates, different assigned-coordinate histories, and fresh-qualified/unqualified namespaces. Evidence `input-curl-coordinates.json`, output and `curl-coordinate-results.json` from the actual worker. Suggested remediation analysis: create stable symbolic differentiation coordinates independent of user value bindings. No implementation changes.

### CG-30 — contradictory duplicate ODE initial conditions silently use the last value (medium)

Input `\text{dsolve}\frac{dy}{dx}=y,y(0)=1,y(0)=2`. There is **no solution** satisfying both conditions. Actual success row **y(x)=2e^x**, silently dropping y(0)=1. This result fails an explicitly supplied constraint; it should report incompatible initial conditions. The ordinary single-condition y(0)=1 control returns e^x correctly.

Root cause: DSolve emission (codegen.ts:4902–4931) joins all initial-condition entries into a Python dictionary literal, without detecting duplicate symbolic keys. Python retains only the final y(0) entry before calling SymPy. Preserve/check every constraint; exact redundant duplicates may be accepted, but contradictory ones must not disappear. Regression ideas: reverse duplicate order, agreeing duplicates, repeated derivative conditions, distinct points/functions, and contradictions expressed by algebraically equivalent keys. Evidence `input-ode-applied-head-controls.json`, output and `ode-applied-head-control-results.json` (last case), extracted actual worker. This is separate from SymPy solver limitations: the complete condition set never reaches the solver. No implementation performed.

### CG-31 — an earlier use of a symbol makes later membership assumptions ineffective (high)

Use three cells in order: **x**, **x∈ℤ**, then **solve x²=2,x**. The documented integer membership declaration should exclude irrational roots, so the expected solution set is empty. Actual success row is **x=−√2,√2**, violating the declared domain. If the first x-only cell is removed, the same declaration/solve pair correctly returns∅. Combining all three statements into one multiline cell also correctly returns∅. Thus merely splitting the same statement sequence into cells changes the mathematics.

A simpler real-assumption variant, cells x; x∈ℝ; sqrt(x²), remains sqrt(x²) instead of |x|. The worker namespace confirms x has only commutative=True after earlier use, whereas declaration-first x has integer/rational/real flags.

Root cause: `Emitter.assumeFrom` (codegen.ts:1119–1143) immediately ignores membership for names already in scope.decls.defined, which includes earlier minted free symbols. Membership kwargs and MatrixSymbol shape declarations are implemented only while first creating a name. Same-cell symbol declarations are rendered after all statements and can collect later kwargs; across-cell declarations have already executed and are not updated. USER-GUIDE.md:264–266 promises real/integer/rational/complex Symbol assumptions for membership without disclosing this first-use-only exception. The default solver then sees an unrestricted Symbol and accepts forbidden roots. This is distinct from CG-14's incorrect relational variable selection: the integer set and variable are correctly parsed, but its restriction is lost.

Suggested remediation analysis: retain declared assumptions/domain restrictions consistently across cell boundaries and use them in subsequent operations/solvers, or clearly diagnose a declaration that cannot take effect. Avoid silently treating an earlier display of x as an irrevocable choice of its mathematical domain. Regression ideas: fresh versus previously used symbols; split versus merged cells; ℤ/ℚ/ℝ/ℂ and signed subsets; membership before/after concrete rebinding; solver results validated against all declared domains. Evidence `input-assumption-history.json`, output and `assumption-history-results.json`, including actual namespace assumptions. No implementation changes.

### CG-32 — differential notation overwrites explicitly bound subscripted coefficients (medium)

One cell: assign **k_a=2**, then `\text{dsolve}\frac{dy}{dx}=k_a y`. Expected general solution **y(x)=C₁e^(2x)**. Actual **'list' object has no attribute 'args'**. Changing only the coefficient name to k_1 correctly returns C₁e^(2x). An explicitly assigned u_{max}=2 coefficient fails identically. The prior assignments display correctly; the solver does not use those values.

Root cause: SUB_DERIV_RE (ir.ts:981) classifies every alphabetic subscript of up to three letters as a derivative sighting; collectDepEvidence invents k(a) as another unknown, and rewriteDepNotation replaces k_a with D(k,a), ignoring that k_a is already bound to a scalar. u_max becomes a third mixed derivative of u(m,a,x), despite the source comment describing u_max as an ordinary variable. The code then passes a list of two unknown functions to a single-equation dsolve call, which fails. This is not an underlying SymPy limitation: the compiled differential equation/unknown list differ from the explicitly specified coefficient problem.

Suggested remediation analysis: do not reinterpret already bound ordinary symbols as dependent-function derivative notation; restrict/disambiguate shorthand based on actual unknowns/signatures/context and preserve explicit parameter names. Regression ideas: bound/unbound letter/digit/word subscripts, coefficients versus unknowns, ODE/PDE contexts, legitimate u_x/u_{xt} derivative controls and cross-cell bindings. Evidence `input-ode-coefficient-subscripts.json`, output/results; reduced bound-name cases in `input-differential-subscript-controls.json`, corresponding output and `differential-subscript-control-results.json`. No implementation performed.

### CG-33 — third subscript derivatives silently become second derivatives (high)

Input **`\text{dsolve} y_{xxx}=0`**. Expected general solution **y(x)=C₁+C₂x+C₃x²**, the third-order homogeneous equation. Actual success row **y(x)=C₁+C₂x**, with only two integration constants. The compiler emits diff(y(x),x,x), so it actually solves the second-order equation. The identical double-subscript y_{xx}=0 gives that same result; the equivalent third-prime y′′′=0 control correctly returns the quadratic family.

Root cause: rewriteDepNotation (ir.ts:1017–1060) correctly constructs variadic D(y,x,x,x) for the three derivative letters, but D emission (codegen.ts:2321–2370) emits only body, args[1], args[2] and discards all further arguments. A mixed three-coordinate derivative similarly loses its final coordinate in generated Python. No diagnostic identifies this loss. Third-order subscript syntax is explicitly accepted by SUB_DERIV_RE; this is an internal IR/emitter arity mismatch, distinct from CG-13's repeated-Jacobian tensor limitation.

Suggested remediation analysis: preserve all differentiation variables/orders when lowering supported variadic D nodes, or reject unsupported shapes before emitting a lower-order equation. Regression ideas: one/two/three repeated coordinates, mixed partials, equivalent prime/Leibniz spellings, and third-order initial conditions with nonzero second derivative (which require the missing quadratic term). Evidence `input-differential-subscript-controls.json`, output and `differential-subscript-control-results.json`; raw/normalized IR and emitted Python are retained. No implementation changes.

### CG-34 — Python zero-argument functions cannot be called from math (medium)

Python cell **`def ready(): return 7`**, followed by math **`\mathrm{ready}()`**. Expected7. Actual **missing argument cannot be emitted**. Single-letter Python f() with its upright call and a custom #@latex call alias fail identically. In contrast, a math-defined `\text{def} f()=7; f()` and a zero-parameter mapsto definition both correctly return7. A bare upright ready without parentheses displays the Python function object and does not invoke it.

Root cause: CE correctly parses InvisibleOperator(ready,Delimiter()). The implicit-product rule (ir.ts:1795–1844) recognizes the word-function call and recursively normalizes [ready] when the argument list is empty. normalize() (2526) unconditionally converts every one-element array to Nothing before callable/known-head handling, discarding a valid zero-argument application. Math-declared names use an Apply wrapper and avoid this loss. The same shortcut drops raw ['List'] from [] and undeclared word foo(), whereas the empty-set spelling is correctly parsed as the EmptySet constant and serves as a successful empty-structure control.

Suggested remediation analysis: distinguish absent grouping placeholders from legal zero-arity calls/containers; preserve the callee even when there are no arguments and let callable arity determine validity. Regression ideas: Python no-argument/default-argument functions, single-/multi-letter/custom aliases, math zero-arity definitions and invalid missing arguments for required-arity functions. Evidence `input-zero-arity-functions.json`, output and `zero-arity-function-results.json`; `input-zero-arity-controls.json`, `input-empty-structures.json`, outputs and combined `zero-arity-empty-control-results.json`. Actual worker execution and normalized/raw trees retained. No implementation changes.

### CG-35 — chained negated inequalities ignore later operands (high)

Input **`2\nless1\nless2`**, i.e.2≥1≥2. Expected **False** because1≥2 is false. Actual **True**. CE correctly supplies the n-ary chain ['NotLess',2,1,2], but codegen emits only Not(Lt(2,1)), silently discarding the final operand. The explicit equivalent `(2\nless1)\land(1\nless2)` correctly givesFalse. An all-true chain2≮1≮0 is a successful control. Ordinary positive chain1<2<0 also correctly givesFalse.

Root cause: negated-relation cases (codegen.ts:1973 onward) directly emit args[0]/args[1], whereas ordinary comparisons use cmpChain to preserve successive comparisons. Related parser-nested negated chains such as1\ngtr2\ngtr1 try to compare against a Boolean and fail **Can only compare inequalities with Expr**, rather than applying the relation pairwise. Unsupported command spellings \nleq/\ngeq were excluded; the confirmed silent defect uses supported \nless.

Suggested remediation analysis: preserve each pairwise negated relation and combine the chain consistently, handling CE flat and nested forms. Negating the conjunction of positive comparisons would be a different formula; each link needs its own negation. Regression ideas: two/three/four operands, first versus later false links, flat/nested parser forms, symbolic chains and explicit-And equivalence. This shares the general IR-arity audit theme with CG-33 but concerns comparison-chain semantics rather than derivatives. Evidence `input-logical-chain-arity.json`, output and `logical-chain-arity-results.json`; `input-negated-chain-controls.json`, output and `negated-chain-control-results.json`. Actual worker execution retained. No implementation performed.

### CG-36 — exhausting constant letters merges independent integration constants (low)

One cell with first row **C+D+E+F+G+H+I+J+K+L+M+N+O+P+Q+R+S+T+U+V+W+X+Y+Z**, then second row **`\int(\int0dx)dx`**. Expected the two-parameter family C₁x+C₂ with fresh independent constants. Actual **Cx+C**, tying the slope to the intercept. Without that first row the same double integral correctly gives Cx+D. The error is mathematical: the returned family cannot represent the valid constant antiderivative1.

The capacity limit also occurs without any preexisting capitals:25 nested indefinite integrals of0 return only24 independent constants; the 24-fold control has24 as expected. In the failing25-fold result the value and24th derivative at0 are both C, an extra constraint absent from the general antiderivative family.

Root cause: firstFreeCapital (codegen.ts:3829–3841) allocates only C through Z, then always returns C when those24 spellings are reserved. It does not generate a fresh fallback name or report exhaustion. Integrate constTerm then constructs Symbol("C"), merging it with the already used constant/parameter. This is not CG-15's matrix-shape issue; it is generated constant identity reuse. Suggested remediation analysis: retain fresh identities/names after the finite alphabet is exhausted. Regression ideas: the reserved-capital double integral,22/25 nested integrals, and independent Taylor-jet coefficients. Severity low because reaching the capacity limit is uncommon. Evidence `input-integration-constant-capacity.json`, output, `integration-constant-capacity-results.json` and `integration-constant-capacity-proof.json`; the exact24/25 boundary is retained in `input-integration-capacity-boundary.json`, output and `integration-capacity-boundary-results.json`. No implementation changes.

### CG-37 — displayed vectors add by concatenating their Python lists (high)

One cell **u=[1,2,3]; v=[4,5,6]; u+v**. The assignment rows display u/v as3×1 column vectors, so their sum should be **[5,7,9]**. Actual success row is the six-element sequence **[1,2,3,4,5,6]**. Literal [1,2,3]+[4,5,6] gives the same concatenation. Subtraction fails **unsupported operand type(s) for -:list and list** instead of [-3,-3,-3]. A corresponding tuple-matrix expression (1,2,3)+(4,5,6) correctly gives [5,7,9]. Dotting the list-vector sum with [1,1,1] then errors instead of yielding21.

Root cause: list-valued Assign keeps native Python lists while assignDisplay presents them as column matrices. Generic Add/Negate (codegen.ts:1493 onward) then emit ordinary +/− on those native lists; Python+ concatenates them. Dot/cross and other matrix-like contexts have explicit Matrix conversion, but addition/subtraction omit that vector coercion. This shares representation concerns with CG-05's norm(list) API failure, but is a separate arithmetic path that silently changes vector dimension/value rather than merely rejecting a norm.

Suggested remediation analysis: use consistent runtime/display vector semantics and ensure vector arithmetic performs componentwise addition/subtraction with shape checks, rather than exposing Python container concatenation. Keep genuine collection semantics explicit if lists are intended to serve a separate role. Regression ideas: literal and assigned vectors, same-/cross-cell use, negation/subtraction, mixed row/column representations and incompatible lengths. Evidence `input-list-vector-addition.json`, output and `list-vector-addition-results.json` from the actual worker. The standalone2[1,2,3] spelling in that corpus did not produce a result and is not used as a successful scalar-product control. No implementation changes.

### CG-38 — failed assignments/definitions commit scope changes despite emitting no code (medium)

One multiline cell: a=2; then an invalid matrix assignment a=[[1,empty-fraction],[0,1]]; then |a|. The invalid middle statement should report its parse error and leave the prior binding a=2 intact, so the last result should be2. Actual last result errors **'int' object has no attribute norm**: the failed matrix assignment changed the compiler's type for a although runtime a remains2. A scalar a=2;|a| control returns2. With a fresh invalid scalar assignment followed by a+1, the compiler also suppresses a's free-symbol declaration and produces **name a is not defined**.

Function variant: define f(x)=x², attempt the invalid redefinition f(x,y)=empty-fraction, then evaluate f+1. Expected the last valid f(x) signature, giving x²+1 alongside the invalid-definition diagnostic. Actual **f() takes1 positional argument but2 were given**. The new two-argument signature was committed even though its function body was never emitted; the old one-argument Python function remains bound.

Root cause: Assign calls Scope.bindAssigned and updates return-kind/signature facts before testing errorCount (codegen.ts:4582–4605). Def similarly calls claimFunction and matrixFns updates before its error guard (4642–4662). cellBody processes later statements with this partially committed state and performs no rollback. Suggested remediation analysis: commit binding/type facts only after a statement can emit successfully, or restore scope state on an emission failure. Regression ideas: prior/fresh bindings, invalid matrix/list/set assignments, failed function arity/return-type redefinitions, same-/cross-cell recovery and later valid replacements. Evidence `input-failed-assignment-state.json`, output and `failed-assignment-state-results.json`; `input-failed-function-state.json`, output and `failed-function-state-results.json`. Actual worker programs preserve the earlier valid runtime bindings. Program-only worker rows omit separately injected frontend normalization-issue rows; this finding claims the downstream state corruption, not disappearance of the original parse diagnostic. No implementation performed.

### CG-39 — ordinary identifier names collide with inherited JavaScript Object properties (medium)

Input **`\mathrm{constructor}`**, a valid word identifier. Parsing succeeds with the atom constructor, but calculator compilation throws an uncaught **TypeError:c.startsWith is not a function** instead of emitting a Symbol or structured issue. toString and __proto__ have the same failure; ordinary word ordinary is a successful control.

A call-shaped `\operatorname{constructor}(2)` is also corrupted: it becomes a free Symbol named **2_function Object(){[native code]}**, rather than an unknown function application. This is a normalizer lookup issue, not Python name resolution.

Root cause: lookup tables use ordinary JavaScript objects and unchecked bracket access. CONSTANTS (notation.ts:1243) is Object.fromEntries, so CONSTANTS['constructor'] returns inherited Object.prototype.constructor. Emitter.inner treats it as a constant target and constName calls startsWith on a function. Separately ACCENT_SUFFIX (ir.ts:1431) is a plain object and accent-name tests ACCENT_SUFFIX[h] !== undefined; an unknown head named constructor is therefore misidentified as an accent and the inherited function is interpolated into its generated symbol name. Other plain-object semantic tables deserve the same own-property audit.

Suggested remediation analysis: distinguish table entries from inherited properties, using own-property checks or prototype-free dictionaries consistently. Regression ideas: constructor/toString/__proto__ as symbols, call heads, aliases and binding names; valid ordinary/custom-function controls; ensure compilation never throws for a parsed identifier. Evidence `scripts/hunt-identifier-prototype.mjs` (untracked diagnostic), `identifier-prototype-results.json` retain raw trees, actual compiled program or exception/stack per case. SSR stack line offsets may differ from source, so the named functions/table anchors are authoritative. This is host/compiler-verified; no new browser availability claim. No implementation changes.

## Evidence navigation and unconfirmed observations

Each finding names its exact input/output/result artifacts in the shared evidence directory. `scripts/hunt-codegen.mjs` is the general compiler probe driver; `worker-setup.py` is the extracted real worker; `snapshot-probe.py` reproduces mutable rollback. Arithmetic/calculus/solver scripts and stats retain seeds, bounded execution and outcomes. The pre-consolidation report is retained as `report-before-consolidation.md` for chronological audit.

The domain-chaining and mismatched-domain/explicit-solve-variable cases noted under CG-14 are follow-up observations, not extra confirmed IDs. Unescaped pasted raw Python brace cases were not counted without a clear user-facing contract/reproduction. Supported canonical PythonBlock serialization escapes literal braces; the returned-string brace issue belongs to rendering.

Cross-report deduplication: **RENDER14** owns empty-span formatting (ker(I₂) / columnspace(0₂×₂) displayed as∅ rather than zero space). Raw SymPy basis[] is correct; calc-runtime.mc_span introduces the wrong space interpretation. Rendering proposed CG-19; the compiler report owns it because the default solver protocol loses tautology information. Plot-specific signature/domain/generated-printer issues are owned by the plotting report.


Documentation discrepancy, not an extra CG ID: CUSTOM-FUNCTIONS.md says [1,2,3] arguments arrive as Matrix, but a Python vnorm(v):return v.norm() receives a raw list and errors; tuple/matrix-literal controls return sqrt(14). Evidence `python-vector-contract-results.json`. Whether the documented contract or implementation should change is a product decision, so it remains separate from the confirmed count. Semantic Python-string/container coercion belongs to rendering RENDER02; text-name rewriting belongs to RENDER07.

## Final stopping record

**Complete:39 confirmed issue groups —18 high,20 medium,1 low.** Every numbered issue has a reproduction, observed/expected behavior, source/root analysis, severity and proposed regression validation. The report index and39 finding headings agree; all explicitly referenced evidence files exist. Remaining limitations and excluded/uncertain observations are stated above rather than inflated into findings.

The search stopped after **5h00m10.598s of conservatively credited active work**, excluding every interruption and the final editorial wrap-up. Last product verification at the search endpoint showed an empty tracked diff in `/workspace/hunt-codegen` against baseline `eb8cdc2318f219d2f6d97cfe1dcc67c5d2ba268f`. Only diagnostic scripts/tests, evidence and this report were created. **No product fixes, implementation patches or fix agents were performed. The later commits and pushes publish report documents only.** Recommendations are analysis only; the user's prohibition on fixes remains in force.
