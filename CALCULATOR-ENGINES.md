# Calculator engines: Pyodide/SymPy + nerdamer interim

Notes for agents working on the calculator target. Two engines produce a
cell's result: **SymPy on Pyodide** (authoritative, ~4.5s cold boot) and
**nerdamer** (interim, ~ms while Pyodide boots). Interim rows carry no
`code` field — the console log and Show code block stay SymPy-only.

## Layout

- `src/calc/calculator.worker.ts` — classic (`iife`) worker running
  Pyodide + SymPy; owns `mc_calc`.
- `src/calc/calculator.svelte.ts` — `evaluate()` (real engine),
  `interimEvaluate()` (nerdamer), `prewarm()`, `calcEngine` status rune.
- `src/calc/nerdamer-latex.ts` — LaTeX → nerdamer-call translator (the
  piece that makes the interim engine do real calculus).
- `src/components/CalcOutput.svelte` — per-cell output; fires
  `interimEvaluate` while `calcEngine.status !== 'ready'`, `evaluate`
  always; interim rows render dimmed via `.pending` until real rows land.
- `public/pyodide-sw.js` — cache-first service worker for the CDN assets.
- `public/antlr4_python3_runtime-4.11.1-py3-none-any.whl` — vendored wheel.

## Pyodide/SymPy — what it does and what it costs

Boot sequence (all client-side, no server): `importScripts` the pinned
jsDelivr pyodide 0.29.0 loader → wasm interpreter + stdlib →
`loadPackage(['sympy'])` in parallel with unpacking the vendored antlr
wheel (`py.unpackArchive(buf, 'zip')` into `/deps/antlr4` +
`sys.path.insert`). Runtime network: **jsDelivr only** — the PyPI
round-trip was removed by vendoring antlr (SymPy's `parse_latex` hard-pins
antlr 4.11.x and pyodide doesn't ship it).

Measured boot (M-series laptop, warm network):

| stage | cold | SW-cached |
|---|---|---|
| loader | ~36ms | ~36ms |
| wasm + stdlib | ~1.3s | ~0.1s |
| sympy + antlr wheels | ~0.3s | ~0.05s |
| `import sympy` + first ANTLR parse | ~3s | ~3s |
| **total** | **~4.5s** | **~3.5s** |

The ~3s CPU floor (SymPy import + ANTLR table init) is irreducible —
hence `prewarm()` on the Output dropdown's pointerdown/focus, and the
nerdamer interim engine below.

### SymPy quirks that shaped the design

- `parse_latex` cannot consume `\\`, `\displaylines{}`, `aligned`, or
  comma-joined rows — and a `,`-join silently keeps only the first
  expression. So the worker folds a multi-line cell into
  `sp.Tuple(*rows)` as a fallback, producing one consolidated result
  (e.g. two-line cell → `(2, 5)`).
- Each row reports `python(val)` (SymPy's code printer; `e` is its
  result-name convention) — same string for console `[calc]` logs and
  the Show code block.
- `doit()` evaluates integrals/sums before `simplify()`.

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

Effects seen in e2e: first row lands in ~750ms instead of ~5.8s, dimmed
until SymPy's answer replaces it.

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
  show a guess as a real result.

## Related incident fixed during this work

`CommandPalette.svelte` items selected on `mouseenter`, so a cursor
parked over the palette fired `mouseenter` on the layout hit-test and
reset the keyboard selection — Enter ran the wrong command (~20% e2e
flake). Items now select on `mousemove` only. If a palette e2e flakes,
suspect hit-test-driven pointer events first.
