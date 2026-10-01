# Calculator engines: Pyodide/SymPy + nerdamer interim

Notes for agents working on the calculator target. Two engines produce a
cell's results: **SymPy on Pyodide** (authoritative, ~4s cold boot) and
**nerdamer** (interim, ~ms while Pyodide boots). Interim rows carry no
`code` field — the console log and Show code block stay SymPy-only.

## Layout

- `src/calc/calculator.worker.ts` — classic (`iife`) worker running
  Pyodide + SymPy; owns `mc_run`.
- `src/calc/calculator.svelte.ts` — `evaluate()` (real engine),
  `interimEvaluate()` (nerdamer), `prewarm()`, `calcEngine` status rune.
- `src/calc/nerdamer-latex.ts` — LaTeX → nerdamer-call translator (the
  piece that makes the interim engine do real calculus).
- `src/components/CalcOutput.svelte` — per-cell output; fires
  `interimEvaluate` while `calcEngine.status !== 'ready'`, `evaluate`
  always; interim rows render dimmed via `.pending` until real rows land.
- `src/compile/codegen.ts` — `compileCellForCalc()`: the shared
  LaTeX → IR → SymPy pipeline, split into an evaluable program.
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
- `compileCellForCalc(cell)` returns `{ prelude, statements, issues }`:
  `prelude` = `import sympy as sp` + the cell's `x = sp.Symbol("x")` /
  `f = sp.Function("f")` def lines; `statements` = one
  `{ code, display? }` per top-level statement (per `\\` row).
- Per-statement protocol in the worker (`mc_run`): a fresh
  `ns = {'sp': sp}` per request; exec prelude; per statement —
  `display === undefined` → `eval(code)`, else `exec(code)` then
  `eval(display)`.
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
  for non-integer numbers), `code: python(val)` (SymPy's code printer;
  `e` is its result-name convention) — same string for console `[calc]`
  logs and the Show code block.
- Equations evaluate honestly: `2^n = \sum\binom{i}{n}` simplifies to
  `True`, `x + 1 = 2` stays an `Eq` — no equation solving.
- Indefinite integrals carry a constant of integration: codegen emits
  `sp.integrate(body, v) + sp.Symbol(<letter>)` at add-precedence (the
  constant parenthesizes when the integral nests inside a bigger term).
  The letter is the first capital not used by the cell or worksheet —
  `C`, else `D`, `E`, …; each boundless `Integrate` takes the next free
  one. The nerdamer interim matches (`integrate(f, v) + C`).

## Pyodide/SymPy — what it costs

Measured boot (M-series laptop, warm network): ~4.5s cold → ~3.5s with
the SW cache, and a touch less now that the antlr wheel install is gone.
The ~3s CPU floor (SymPy import) is irreducible — hence `prewarm()` on
the Output dropdown's pointerdown/focus (the worker self-boots on spawn)
and the nerdamer interim below.

## nerdamer interim — coverage and gaps

`nerdamer@1.1.13` is dynamically imported (`import('nerdamer/all')`) —
a separate ~440KB chunk that only loads when a cell evaluates before the
engine is ready. Never in the main bundle.

`convertFromLaTeX` alone handles arithmetic/algebra/powers/roots/
fractions (e.g. `x+\sqrt{2}` → `\sqrt{2}+x`). It **throws** on `\int`,
`\sum`, `\prod`, `\lim`, `\binom`, `\sqrt[n]`, and malformed input —
those were mapped to nerdamer's real CAS calls in `nerdamer-latex.ts`:

| LaTeX | nerdamer call | interim result |
|---|---|---|
| `\int_{0}^{1}x\,dx` | `defint(x, 0, 1, x)` | `1/2` |
| `\int x` | `integrate(x, x)` | `x^2/2` |
| `\frac{d }{d x}x^2` (MathQuill's `\derivative` expansion) | `diff(x^2, x)` | `2x` |
| `\sum_{i=0}^{n}\binom{i}{n}` | `sum(factorial-expansion, i, 0, n)` | renders `Σ` symbolic |
| `\lim_{x\to 0}…` | `limit(…, x, 0)` | `1` for `sin(x)/x` |
| `\sqrt[3]{8}` | `nthroot(8, 3)` | `2` |

Interim rows are per-`\\`-row too, matching the real engine's
row-per-statement shape so results swap in place. First row lands in
~750ms instead of ~5s, dimmed until SymPy's answer replaces it.

### nerdamer gotchas (earned, not docs-read)

- **No `binomial`** — expand `\binom{a}{b}` to
  `factorial(a)/(factorial(b)*factorial(a-b))`; evaluates for numbers,
  renders `n!/(k!(n-k)!)` for symbols.
- **Symbolic `sum`/`product` stay unevaluated** — good for display
  (`\sum\limits_{i=0}^{n}`), don't expect a closed form.
- `toTeX()` emits `\limits` — strip it (`.replace(/\\limits/g, '')`);
  MathQuill renders bounds under/over anyway.
- **Trailing `=` / `\to` break `convertFromLaTeX`** — leaf fallback
  strips `{}` and returns raw (`2^{n}=…` survives as `2^n=…`).
- **Splicing bug shape**: a translated command's `after` text must keep
  a leading operator verbatim — feeding `+\sqrt{2}` to
  `convertFromLaTeX` eats the unary `+` (`∛x + √2` → `∛x·√2`). The
  translator's `START_OP`/`END_OP` joiners exist because of this.
- Interim unknowns are silent: any throw → `[]` → cell stays dimmed/
  empty until SymPy lands. That failure mode is intentional — never
  show a guess as a real result. (Real-engine errors *are* shown:
  normalization issues and per-statement exceptions land as error rows.)

## Related incident fixed during this work

`CommandPalette.svelte` items selected on `mouseenter`, so a cursor
parked over the palette fired `mouseenter` on the layout hit-test and
reset the keyboard selection — Enter ran the wrong command (~20% e2e
flake). Items now select on `mousemove` only. If a palette e2e flakes,
suspect hit-test-driven pointer events first.
