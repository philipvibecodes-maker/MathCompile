# MathCompile — missing input features

Constructs an undergraduate would reach for that **cannot be typed** (or
serialize wrong / corrupt the cell) in the vendored MathQuill, verified
against `main` @ `6e4bf04`. Everything below was verified by driving a
real cell with synthetic keystrokes and recording the latex.
"→ `\text{…}`" means the word lands as literal italic-ish text with no
semantics.

Thesis citations: Buller (knot theory), Fogelson (bifurcations/ODEs),
Salkinder (knots/topology).

## Regressions / serialization bugs on current main

| Wanted | What happens instead | Workaround | Thesis example |
|---|---|---|---|
| `\rangle` typed to close a `⟨…⟩` pair | typing `\rangle`+Enter at the auto-pair's close swaps it to `\right\langle` — renders the wrong glyph, and the serialized latex **fails to re-parse on reload (cell renders blank)** | `\langle`+Enter inserts the complete `\left\langle…\right\rangle` pair — don't type `\rangle`, exit with Right/Ctrl+End. Or type unicode `⟨⟩` (stays literal, round-trips fine) | Salkinder: `⟨x,y \mid x^p=y^q⟩`, `D_{2n}=⟨s,t\mid…⟩` |
| `\rVert` typed to close `‖x‖` | same swap: `\right\lVert` — invisible (‖ is symmetric) but the latex still won't re-parse | `\lVert`+Enter and don't type `\rVert`; or unicode `‖x‖` | — |
| bare `infty` inside an operator bound | `\inf ty` — `inf` matches as the auto-operator first | `\infty`+Enter inside the bound | sums to ∞ everywhere |

## Fonts and operator names

| Wanted | What happens instead | Workaround | Thesis example |
|---|---|---|---|
| `\operatorname{tr}` custom operator | command dropped → italic `tr(A)` | `\mathop`+Enter `tr` Right `(A)` → `\mathop{tr}\left(A\right)`, renders upright | Fogelson: `tr(DF(x,μ))`; Salkinder: `Aut(V)`, `Hom(G,H)`, `GL(V)` |
| `\mathbb{F}` freeform blackboard | `\mathbb`+Enter drops wrapper → plain `F` | `\R \Z \N \Q \C \P \H` + `reals`/`integers`/… + unicode `ℝℤℕℚℂ` cover only those; `\mathbb{F}`/`𝔽` unwritable | — (finite fields `\mathbb{F}_p`) |
| `\textcolor{red}x` | accepts, vanishes → `redx` | none | — |
| `\DeclareMathOperator` | garbles into `\DeclareMathOperatortrtr(A)` | `\mathop{…}` per use | — |
| `\Bbb` | dropped → plain `R` | `\mathbb` shortcuts / unicode | — |

## Constructs / environments

| Wanted | What happens instead | Workaround | Thesis example |
|---|---|---|---|
| `\left.` invisible delimiter | literal `.` inserted | `x^2` Right `\vert`+Enter `_1` Right `^2` → `x^{2}|_{1}^{2}` eval bars work without it | — |
| `‖x‖` via `\Vert` | `\text{Vert}` | `\lVert`+Enter `x` (don't type `\rVert`); unicode `‖x‖` | — |
| `\restriction` word | `\text{restriction}` | `f` `\vert`+Enter `_S` → `f|_{S}`, or `f` `\upharpoonright`+Enter `_S` → `f\upharpoonright_{S}` (↾) | restriction/eval bars throughout all three |
| `\restriction` via `\right|_S` | `|` auto-pairs → `f\left|_{S}\right|` (extra trailing bar) | same `\vert` workaround | — |
| `\genfrac` (custom delimited fractions) | `\genfrac\left(\right)ab` garbled | `\binom`, `n\choose`+Enter | — |
| `\buildrel` | `\frac{x\buildrel def}{=y}` garbage | `\overset{def}{=}` verified | — |
| `\tfrac` | `\frac{x}{ }` with open numerator | `\frac` | — |

## Relations and arrows

| Wanted | What happens instead | Workaround | Thesis example |
|---|---|---|---|
| `\mapsfrom` | `\text{mapsfrom}` | `\mapsto`+Enter | — |
| `\longmapsto`, `\nrightarrow`, `\nRightarrow`, `\multimap` | `\text{…}` | none | — |
| `\pitchfork`, `\varpropto`, `\eqdef`, `\questeq`, `\hateq`, `\veeeq` | `\text{…}` | `\propto`, `:=`, `\overset{def}{=}` | Salkinder: `R_H(X) := R_H(π_1(X))` types via `:=` or `\assign` |
| `|->` typed mapsto | `x\left|\to y\right|` (pipe opens a `\left|` pair) | `\mapsto`+Enter | — |
| `=>` typed | stays literal `=>` | `\implies` / `\Rightarrow` | — |

## Accents and misc symbols

| Wanted | What happens instead | Workaround | Thesis example |
|---|---|---|---|
| `\blacksquare` | `\text{blacksquare}` | `\square` works (open box); `\Box` is also `\text{…}` | QED tombstone |
| `\bigl`/`\Big`/`\bigg`/`\Bigg` delimiter sizing | flaky — `\bigl (x)` → `\left(x\right)` sometimes drops the delimiter | `\left…\right` is reliable | — |

## Registered-but-wrong (aliases that serialize to the wrong symbol)

Not missing words — they accept but emit the wrong latex:

| Type | Get | Should be |
|---|---|---|
| `\oslash`, `\O`, `\o`, `\Oslash` | `\varnothing` | `⊘` / `Ø` |
| `\divides` | `\div` | `∣` (use `\mid`) |
| `\converges` | `\downarrow` | `↘`-ish semantics |
| `\diverges` | `\uparrow` | — |
| `\P` | `\mathbb{P}` | ¶ paragraph sign |

## Input-behavior traps (workable, but wrong if you don't know)

- **Open blocks swallow everything** — `x_1+1` → `x_{1+1}`, `v_1,v_2` →
  `v_{1,v_{2}}`, `x^2 y` → `x^{2\ y}`. Right/Tab required. This applies
  inside matrix/env cells and accent args too (`\dot x+1` needs Right
  before the `+`).
- **`\begin{env}` caret lands in row 2** — the literal env form inserts
  a 2-col × 3-row grid with the caret on the *middle* row; press Up to
  reach row 1. The `\name` shortcuts (`\pmatrix`, `\cases`, `\align`, …)
  land in row 1 correctly — prefer them.
- **`aligned`/`cases` Enter keeps the column** — after `x` Tab `=1`
  Enter lands you in the next row's *second* column; arrow Left back to
  column 1 to start the next row.
- **`\not`+Enter completes to `\notin`** — the autocomplete's top
  suggestion wins; a bare `\not` can't be entered (was a no-op anyway).
  Type `\nX` directly.
- **`sin`/`lim`/etc. fire mid-word**: `crossings` → `cros\sin gs`
  (Buller's `c∈crossings`), `info` → `\inf o`. Use `\text{…}`.
- **`a|b` is absolute-value pairing**, not divides: `a\left|b\right|`.
  Use `\mid` or `\nmid`.
- **inside `⟨…⟩`, raw `|` becomes the close delimiter** — use
  `\mid`+Enter for the "such that" bar in presentations/set-builder
  inside langle pairs.
- **unicode `′` stays a unicode char** — ASCII `'` is the working prime.
- **`\int`/`∫`/`∑` insert bounded templates with the caret in the lower
  bound** — typing `x` next fills the bound, not the integrand.
- `smart mode off` also disables `autoSubscriptNumerals` (`x2` stays
  `x2`), but `autoOperatorNames` (`sin`, `lim`, …) are on regardless.
