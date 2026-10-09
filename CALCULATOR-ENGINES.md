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
- `public/pyodide-sw.js` — cache-first service worker for the CDN assets.

## Input → SymPy: the codegen path (not parse_latex)

The first attempt parsed raw LaTeX inside Pyodide via
`sympy.parsing.latex.parse_latex`, which needed a vendored antlr4 wheel
(`parse_latex` hard-pins antlr 4.11.x, unshipped by pyodide) and couldn't
read `\displaylines`, `\\`, or comma-joined rows anyway. The repo's
codegen pipeline (`src/compile/` — Compute Engine parse → normalized IR →
SymPy emitter) now does the input→SymPy translation in TypeScript, so:

- **No antlr wheel, no parse_latex** — the worker only exec/evals the
  emitted Python. Boot is `importScripts` pyodide → wasm+stdlib →
  `loadPackage(['sympy'])` → `mc_run` def; runtime network is jsDelivr
  only.
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

Measured boot (M-series laptop, warm network): ~4.5s cold → ~3.5s with
the SW cache, and a touch less now that the antlr wheel install is gone.
The ~3s CPU floor (SymPy import) is irreducible — hence `prewarm()` on
the Output dropdown's pointerdown/focus (the worker self-boots on spawn)
and the Compute Engine interim below.

## Compute Engine interim — how it works

`interimEvaluate(latex)` in `calculator.svelte.ts` reuses the compiler's
own front end: `parseCellLatex` → `normalizeIR` (the same tree codegen
emits — chained `Equal` flattens, `name = rhs` becomes `Assign`,
`\text{def}` becomes a `Def` head) → per-statement
`ce.box(json).evaluate().evaluate().latex`.
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
- **Serializer fixups**: `.latex` emits `\exponentialE`, `\imaginaryI`,
  `\lparen`/`\rparen` — `cleanLatex` maps them to `e`, `i`, `(`, `)` so
  MathQuill renders the names instead of italicizing the command text.
  `arcTrigNames` isn't needed here — CE already writes `\arcsin`.


## Related incident fixed during this work

`CommandPalette.svelte` items selected on `mouseenter`, so a cursor
parked over the palette fired `mouseenter` on the layout hit-test and
reset the keyboard selection — Enter ran the wrong command (~20% e2e
flake). Items now select on `mousemove` only. If a palette e2e flakes,
suspect hit-test-driven pointer events first.
