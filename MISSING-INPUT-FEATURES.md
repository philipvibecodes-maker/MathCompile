# MathCompile — missing input features

Constructs an undergraduate would reach for that **cannot be typed** (or
serialize wrong) in the vendored MathQuill, as of `main` @ `3117de9`.
Everything below was verified by driving a real cell with synthetic
keystrokes and recording the latex. "→ `\text{…}`" means the word lands
as literal italic-ish text with no semantics.

Thesis citations: Buller (knot theory), Fogelson (bifurcations/ODEs),
Salkinder (knots/topology).

## Large operators / calculus

| Wanted | What happens instead | Workaround | Thesis example |
|---|---|---|---|
| `\iiint` triple integral | `\text{iiint}` | none (only `\int`, `\iint`, `\antid`, `\oint` exist) | — |
| `\iiiint`, `\oiint`, `\idotsint`, `\intop` | `\text{…}` / `""` | none | — |
| `\limits` / `\nolimits` on `\sum` | typed inside the open bound → `\sum_{i\text{limits}}^{ }` | none | — |
| `\substack` (multi-line bound) | `\text{substack}` | none | — |
| `\displaystyle` | `\text{displaystyle}` | none | — |

## Fonts and operator names

| Wanted | What happens instead | Workaround | Thesis example |
|---|---|---|---|
| `\operatorname{tr}` custom operator | wrapper dropped → italic `tr(A)` | none; only built-in auto-ops render upright | Fogelson: `tr(DF(x,μ))`; Salkinder: `Aut(V)`, `Hom(G,H)`, `GL(V)` |
| `\mathbb{F}` freeform blackboard | `\mathbb`+Enter drops wrapper → plain `F` | `\R \Z \N \Q \C \P \H` + `reals`/`integers`/… cover only those 7 | — (finite fields `\mathbb{F}_p`) |
| `\mathcal{O}`, `\mathfrak{p}`, `\mathscr{L}` | `\text{mathcal}L` etc. | none | sheaves/ideals in algebra |
| `\textcolor{red}x` | accepts, vanishes → `redx` | none | — |
| `\boldsymbol`, `\bf` | `\text{…}` | `\mathbf` works | — |

## Constructs / environments

| Wanted | What happens instead | Workaround | Thesis example |
|---|---|---|---|
| `cases` / piecewise `f(x)={…` | `\begin{cases}` mangles; `\lbrace`+`\matrix`+Enter gives `\lbrace x&\\y&` — left-braced grid, nonstandard latex, no `\end` | partial visual only via `\lbrace` + `\matrix` | piecewise defs (Salkinder: "homotopic piecewise linear copy"; bifurcation definitions in Fogelson) |
| `aligned`/`array`/`split` + `&` anchors | `\begin{aligned}` mangles; `&` types `\&` | `\displaylines` rows only (Enter) | aligned multi-line derivations, all three theses |
| `\begin{pmatrix}` typed literally | `{` breaks command input → mangled latex | bare `\pmatrix`+Enter works | — |
| `\pmod`/`\bmod`/`\mod` congruence | `x\text{pmod}3` | `x \equiv y (mod\ n)` — type `(`, `mod`, `\ ` (backslash-space), `n`, `)` | Buller: `x+y≡2z (mod 3)`; Salkinder: `=0 (mod 2π)` |
| `\left.` invisible delimiter | literal `.` inserted | eval bar works without it: `x^2` Right `|` `_1` Right `^2` → `x^{2}\left|_{1}^{2}\right|` | — |
| `‖x‖` via `\Vert` | `\text{Vert}` | `\lVert`+Enter `x` `\rVert`+Enter → `\left\lVert x\right\rVert` | — |

## Relations and arrows

| Wanted | What happens instead | Workaround | Thesis example |
|---|---|---|---|
| `\twoheadrightarrow` ↠ (surjection) | `\text{twoheadrightarrow}` | none | Salkinder: Fox-coloring representations `ρ:G(K)→D_{2n}` are surjective |
| `\rightarrowtail`, `\mapsfrom`, `\longmapsto`, `\leftarrowtail`, `\twoheadleftarrow`, `\rightsquigarrow`, `\leadsto`, `\looparrow…`, `\curvearrow…`, `\circlearrow…`, `\Rsh`, `\Lsh`, `\dashrightarrow`, `\Lleftarrow`, `\Rrightarrow`, `\multimap`, `\nrightarrow`, `\nRightarrow` | all `\text{…}` | none | — |
| `\xrightarrow`/`\xleftarrow` labelled arrows | `\text{xrightarrow}f` | `\underset{label}{\to}`/`{ \to }` approximations | — |
| `|->` typed mapsto | `x\left|\to y\right|` (pipe opens a `\left|` pair) | `\mapsto`+Enter | — |
| `=>` typed | stays literal `=>` | `\implies` / `\Rightarrow` | — |
| `\coloneqq \coloneq \triangleq \eqdef \Assign \questeq \hateq \veeeq` definitional equals | `\text{…}` | `:=` literal works; `\overset{def}{=}` verified | Salkinder: `R_H(X) := R_H(π_1(X))` |
| `\approxeq \lesssim \gtrsim \leqslant \thickapprox \risingdotseq` | `\text{…}` | `\approx`, `\le` | — |
| `\subsetneq \supsetneq \Subset \Supset \subseteqq` | `\text{…}` | `\not\subseteq` works | — |
| `\nmid`, `\vDash`, `\nvDash`, `\Vvdash` | `\text{…}` | `\mid`, `\models`, `\vdash` | — |
| `\eqcirc \circeq \bumpeq \Bumpeq \backsim \between \pitchfork \Join \varpropto \shortmid \shortparallel` | `\text{…}` | `\cong \sim \propto \mid \parallel` | — |
| `\precsim \succsim \nprec \nsucc` | `\text{…}` | `\preceq \succeq` | — |

## Accents and misc symbols

| Wanted | What happens instead | Workaround | Thesis example |
|---|---|---|---|
| `\widetilde` | `\text{widetilde}H` | `\tilde` works (no wide form) | — |
| `\ddot \acute \grave \breve \check \mathring` | `\text{…}` | `\dot`, `\hat`, `\bar`, `\vec`, `\tilde` only | Fogelson: `\ddot{x}` second derivatives |
| `\cancel` | `\text{cancel}x` | none | — |
| `\blacksquare \imath \jmath \eth \mho \hslash \beth \gimel \daleth \Finv \Game \complement \checkmark \yen \euro \copyright \dag \hdots \dotsb \dotsi \restriction \upharpoonright \downharpoonright` | `\text{…}` | `\square \iota?` no — `\imath`/`jmath` have no dotless-i workaround | — |
| `\hspace{1em} \phantom \kern1em \! \displaystyle` | `\text{…}` or `\ `+`!` garbage | `\ `, `\,`(via `\thinspace`), `\quad`, `\qquad` | — |
| `\S` section sign | `\text{S}` | none | — |
| `\dbinom \tbinom \genfrac` | `\text{…}` | `\binom`, `\choose` work | — |

## Registered-but-wrong (aliases that serialize to the wrong symbol)

Not missing words — they accept but emit the wrong latex:

| Type | Get | Should be |
|---|---|---|
| `\oslash`, `\O`, `\o`, `\Oslash` | `\varnothing` | `⊘` / `Ø` |
| `\divides` | `\div` | `∣` (use `\mid`) |
| `\converges` | `\downarrow` | `↘`-ish semantics |
| `\diverges` | `\uparrow` | — |
| `\ring` | `\circ` | ring accent |
| `\P` | `\mathbb{P}` | ¶ paragraph sign |
| `\|` | `\ ` | `‖` |
| `\,`/`\;` commands | `\ ,` / `\ ;` | thin/med space (use `\thinspace`) |
| `\!` | `\ ` + `!` + broken row | negative thin space |

## Input-behavior traps (workable, but wrong if you don't know)

- **Open blocks swallow everything** — `x_1+1` → `x_{1+1}`, `v_1,v_2` →
  `v_{1,v_{2}}`, `x^2 y` → `x^{2\ y}`. Right/Tab required.
- **`infty` word is eaten by `inf`**: bare `infty` (or `(-\infty` via the
  word) → `\inf ty`. Must use `\infty`+Enter or `\infinity`.
- **`sin`/`lim`/etc. fire mid-word**: `crossings` → `cros\sin gs`
  (Buller's `c∈crossings`), `info` → `\inf o`. Use `\text{…}`.
- **`a|b` is absolute-value pairing**, not divides: `a\left|b\right|`.
  Use `\mid` or `\nmid`(missing).
- **unicode `′` stays a unicode char** — ASCII `'` is the working prime.
- **`\int`/`∫`/`∑` insert bounded templates with the caret in the lower
  bound** — typing `x` next fills the bound, not the integrand.
- `smart mode off` also disables `autoSubscriptNumerals` (`x2` stays
  `x2`), but `autoOperatorNames` (`sin`, `lim`, …) are on regardless.
