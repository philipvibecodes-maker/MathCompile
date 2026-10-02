# Typing math into MathCompile — input reference

How to type the math a typical undergraduate needs into `<math-field>`
cells. Companion to `SYMBOLS.md` (the full command inventory) and
`MISSING-INPUT-FEATURES.md` (what *can't* be typed).

Every keystroke sequence below was verified by driving real cells in the
dev app (`npm run dev`, port 5573) with synthetic keyboard input — roughly
700 probes — and recording the serialized LaTeX the cell produces. Worked
examples are taken from three Harvard undergraduate theses: Buller (knot
theory), Fogelson (bifurcation theory/ODEs), Salkinder (knot theory /
low-dimensional topology).

**Notation used here:** `\frac`+Enter means "type the word after a
backslash, press Enter to accept it". `Right`/`Tab`/`Up`/`Down` are arrow
and tab keys. Quoted strings are typed literally.

## The six rules that govern everything

1. **`\` opens the command input.** Type `\` then a word, accept with
   **Enter** (or Space, or any non-letter). Accepting inserts the symbol
   or command. Space after a command word also accepts it
   (`\alpha ` → `\alpha` + space).
2. **Blocks stay open — this is the #1 gotcha.** The caret stays *inside*
   a subscript, superscript, fraction half, root, operator bound, accent,
   or `\text` argument until you press **Right** or **Tab**. Everything
   you type meanwhile lands inside the block — including `+`, `-`, `,`,
   `*`, spaces, parens, and even `_`/`^`/`/` (which nest):
   - `x_1+2` → `x_{1+2}` ✗ (you wanted `x_{1}+2`)
   - `x^2-3` → `x^{2-3}` ✗
   - `v_1,v_2,v_k` → `v_{1,v_{2,v_{k}}}` ✗ (the `,` is inside, next `_` nests)
   - `x^2 y` → `x^{2\ y}` ✗ (space inside a sup is a `\ ` gap)
   - `x_1(t)` → `x_{1\left(t\right)}` ✗
   - `e^x^2` → `e^{x^{2}}` (nested sup — not `e^{x^{2}}` ambiguity,
     it literally nests)
   Always **Right** (or **Tab**) to close a block before typing what
   follows it. `T_p,q` → `T_{p,q}` is the lucky exception where a comma
   inside a sub is what you wanted anyway.
3. **Auto-pairs.** `(` `[` `{` `|` insert a `\left…\right` pair; the caret
   sits inside. Typing the same closer hops over it; typing a *different*
   closer still closes it — `(0,1]` → `\left(0,1\right]` for free.
   `<`/`>` do **not** pair (use `\langle`/`\rangle`).
4. **Enter vs Shift+Enter.** At top level **Enter** inserts a
   `\displaylines` line break *in the same cell*; **Shift+Enter** makes a
   **new cell**. Inside an open `\command`, Enter accepts the command.
   Inside a matrix, Enter adds a **row** and Shift+Space adds a
   **column**. Inside a script/fraction, Enter snaps the caret out to the
   atom first, then breaks the line.
5. **Smart mode** (the default toggle in the header) adds two things on
   top of plain mode: `autoCommands` — the words
   `int iint antid sum sqrt prod pi infty theta derivative` work with no
   backslash — and `autoSubscriptNumerals` (`x2` → `x_{2}`). Upright
   operator names (`sin`, `lim`, `det`, …) and unicode symbol typing are
   on in **both** modes.
6. **Unicode input works.** Typing `α β π θ ∞ ≤ ≥ ≠ ≈ → ° √ ∫ ∑`
   directly inserts the symbol — no backslash needed. Caveat: `∫`/`∑`
   insert the *bounded* templates (caret lands in the lower bound), and
   `√` typed while inside a bound nests a `\sqrt{ }` there. The unicode
   prime `′` stays a unicode char — use ASCII `'` instead.

## Scripts, primes, factorials

| Want | Type | Get |
|---|---|---|
| \(x_1\) | `x_1` | `x_{1}` |
| \(x_{12}\) | `x_12` | `x_{12}` (subscript grabs all digits) |
| \(x_{\max}\) | `x_max` | `x_{\max}` (auto-operator inside sub) |
| \(x^2\) | `x^2` | `x^{2}` |
| \(A^{-1}\) | `A^-1` | `A^{-1}` |
| \(t^{1/2}\) | `t^1/2` | `t^{\frac{1}{2}}` (`/` inside a sup makes a nested frac) |
| \(x_1^2\) | `x_1` Right `^2` | `x_{1}^{2}` |
| prescript \({}_ix\) | `_i` Right `x` | `_{i}x` — without Right, `_ix` → `_{ix}` nests |
| \(e^{i\pi}\) | `e^(` `i` `\pi`+Enter `)` | `e^{\left(i\pi\right)}` |
| \(f'\), \(f''\), \(f'''\) | `f'` / `f''` / `f'''` | `f'`, `f''`, `f'''` |
| \(g'_x\) | `g'_x` | `g'_{x}` |
| ″ | `\dprime`+Enter | `″` (unicode glyph) |
| \(n!\), \(n!!\) | `n!` / `n!!` | `n!`, `n!!` |
| \(x_2\) (smart mode) | `x2` | `x_{2}` — autoSubscriptNumerals. Trap: `d3` in `(mod3)` becomes `d_{3}`; smart off gives `x2` literal |

A lone subscript like `x_i` is arrow-skippable at baseline (Right hops
over it cleanly). Backspace on a bound deletes the whole bound before
descending into it.

## Fractions and binomials

`/` is the fast path: it grabs the atoms to the *left* since the last
binary operator and builds a `\frac`.

| Want | Type | Get |
|---|---|---|
| \(\frac12\) | `1/2` | `\frac{1}{2}` — caret lands in **denominator** |
| \(\frac{x}{2}\) | `x/2` | `\frac{x}{2}` |
| \(x+\frac{y}{2}\) | `x+y/2` | `x+\frac{y}{2}` — `/` stops at the `+` |
| \(\frac{a+b}{2}\) | `(a+b)/2` | `\frac{\left(a+b\right)}{2}` |
| empty frac template | `\frac`+Enter | caret in numerator; Tab → denominator; Right/Tab → baseline |
| \(\frac{a+b}{c+d}\) | `\frac`+Enter `a+b` Right `c+d` | `\frac{a+b}{c+d}` |
| \(\frac{1}{2/3}\) | `1/2/3` | `\frac{1}{\frac{2}{3}}` (nested, right-associative) |
| \(\frac ab\) infix | `a\over`+Enter `b` | `\frac{a}{b}` |
| \(\binom nk\) | `\binom`+Enter `n` Tab `k` | `\binom{n}{k}` |
| \(\binom nk\) infix | `n\choose`+Enter `k` | `\binom{n}{k}` |

Aliases that serialize to `\frac`: `\dfrac`, `\cfrac`, `\fraction`.
Inline slash instead of a fraction: `a\slash`+Enter `b` → `a/b`.
`\tfrac`, `\dbinom`, `\tbinom`, `\genfrac` are missing (see
MISSING-INPUT-FEATURES.md).

## Roots

| Want | Type | Get |
|---|---|---|
| \(\sqrt{x}\) | `sqrt` (smart) or `\sqrt`+Enter | `\sqrt{x}` — caret in the radicand, Right/Tab exits |
| \(\sqrt[3]{x}\) | `\nthroot`+Enter `3` Tab `x` | `\sqrt[3]{x}` — index first, Tab → radicand |
| \(\sqrt[3]{x}\) | `\cbrt`+Enter `x` | `\sqrt[3]{x}` |
| \(i=\sqrt{-1}\) | `i=sqrt` `-1` | `i=\sqrt{-1}` |

Trap: `\sqrt` then `[3]` gives `\sqrt{\left[3\right]x}` — brackets inside
a radicand are literal; the index only exists via `\nthroot`/`\cbrt`.
Smart mode off: `sqrt` is the literal letters `sqrtx`; use `\sqrt`+Enter.

## Greek letters

`\`+word+Enter for every Greek letter, lower and capital:
`\alpha \beta \gamma \Gamma \delta \Delta \epsilon \zeta \eta \theta
\Theta \iota \kappa \lambda \Lambda \mu \nu \xi \Xi \pi \Pi \rho \sigma
\Sigma \tau \upsilon \Upsilon \phi \Phi \chi \psi \Psi \omega \Omega`.

Variants: `\varepsilon` (also `\epsiv`), `\varphi` (`\phiv`),
`\vartheta` (`\thetasym`, `\thetav`), `\varrho` (`\rhov`), `\varsigma`
(`\sigmaf`, `\sigmav`), `\varkappa` (`\kappav`), `\varpi` (`\piv`),
`\digamma` (`\gammad`).

Smart mode: bare `pi` → `\pi` and `theta` → `\theta` with no backslash.
Bare `alpha` stays the literal letters `alpha` — only `pi`/`theta` are
smart commands. Typing the unicode chars `αβπθ` directly also works.

## Named functions and upright operators

Auto-operator names (upright, both modes, no backslash needed) — type the
word then the argument:

```
sin cos tan arcsin arccos arctan sinh cosh tanh sec csc cot coth
ln log lg exp det dim ker gcd hom arg deg Pr injlim projlim
min max sup inf lim limsup liminf
gcf hcf lcm proj span ctg cosec   → serialize as \operatorname{...}
arctanh and other generated arc/h/arh/arch variants of sin cos tan sec
cosec csc cotan cot ctg           → \operatorname{...}
```

`sin(x)` → `\sin\left(x\right)`, `gcd(a,b)` → `\gcd\left(a,b\right)`.
`\sin`+Enter works too. Bounds weld like subscripts and stay open:
`log_2x` → `\log_{2x}` (the `x` is *inside* the sub) — for `\log_{2}x`
type `log_2` Right `x`.

**Mid-word trap:** these fire anywhere inside a word, so `crossings` →
`cros\sin gs`, `single` → `\sin gle`, `cosine` → `\cos ine`, `info` →
`\inf o`, `minimum` → `\min imum`, `elim` → `e\lim`, `asin` → `a\sin`.
Workaround: `\text{crossings}`+Enter for words, or use a symbol (`C`).
`sgn`, `tr`, `Aut`, `Hom` are **not** operators and `\operatorname` is
dropped (typed `\operatorname{sgn}`+Enter produces italic `sgn`) — see
missing-features doc.

## Derivatives

| Want | Type | Get |
|---|---|---|
| \(\frac{dy}{dx}\) | `dy/dx` | `\frac{dy}{dx}` |
| \(\frac{d}{dx}\) | `d/dx` | `\frac{d}{dx}` |
| \(\frac{df}{dx}\) via command | `\derivative`+Enter `x` Up `f` | expands at insertion to `\frac{d}{d}` atoms, caret in denominator → `\frac{df}{dx}` |
| \(\frac{d}{dx}f\) | `\derivative`+Enter `x` Right `f` | `\frac{d}{dx}f` |
| \(\frac{\partial F}{\partial x}\) | `\frac`+Enter `\partial`+Enter `F` Right `\partial`+Enter `x` | `\frac{\partial F}{\partial x}` |
| \(\dot x\) | `\dot`+Enter `x` | `\dot{x}` |
| \(x'=F(x,\mu)\) (Fogelson) | `x'=F(x,\mu` `)` | `x'=F\left(x,\mu\right)` |

`dIsDerivative` off makes `\derivative` expand to `D( )` instead. `\ddot`
and the rest of the double accents are missing.

## Integrals

| Want | Type | Get |
|---|---|---|
| \(\int_a^b x^2\,dx\) | `\int`+Enter `a` Tab `b` Tab `x^2` Tab `dx` | `\int_{a}^{b}x^{2}dx` — caret lands in the **lower** bound; Tab walks lower→upper→baseline |
| same, smart | `int` `a` Tab `b` Tab `x^2` Tab `dx` | identical |
| skip the upper bound | `\int`+Enter `a` Right Right `x` | `\int_{a}^{ }x` — Right×2 hops past the empty upper |
| \(\iint\) boundless | `iint` or `\iint`+Enter | `\iint` leaf at baseline; `_a`/`^b` after it weld a plain supsub → `\iint_{a}^{b}` |
| \(\antid\) indefinite | `antid` | `\antid x^{2}dx` — insertion alias for `\int` at compile time |
| \(\oint_C\) | `\oint`+Enter `_C` Right | `\oint_{C}` |
| unicode | `∫` char | `\int_{ }^{ }` bounded template, caret in lower bound |

**Trap:** after `int`/`sum`/`prod` smart words the caret is already
inside the lower bound — do **not** type `_`: `int _a ^b x dx` →
`\int_{_{a}^{b}xdx}^{ }` garbage. `\iiint`, `\iiiint`, `\oiint`,
`\idotsint`, `\intop` are missing.

## Sums, products, big operators

| Want | Type | Get |
|---|---|---|
| \(\sum_{i=1}^n i^2\) | `\sum`+Enter `i=1` Right `n` Right `i^2` | `\sum_{i=1}^{n}i^{2}` |
| \(\sum_c\) | `\sum`+Enter `c` Right Right | `\sum_{c}^{ }` then keep typing |
| \(\prod\) | `prod` or `\prod`+Enter | `\prod_{ }^{ }` bounded template |
| \(\bigcup_{i=1}^n K_i\) | `\bigcup`+Enter `_i=1` Right `^n` Right `K_i` | `\bigcup_{i=1}^{n}K_{i}` — bigops are boundless; `_`/`^` weld bounds |
| \(\bigcap \bigoplus \bigotimes \bigvee \bigwedge \bigsqcup \biguplus \coprod \bigodot\) | `\bigcap`+Enter etc. | boundless signs; weld bounds with `_`/`^` |
| \(\underset{c\in X}{\sum}\) | `\underset`+Enter `c` `\in`+Enter `X` Tab `\sum`+Enter | `\underset{c\in X}{\sum_{ }^{ }}` — arg1 = below-text, arg2 = base |
| \(\overset{\mathrm{def}}{=}\) | `\overset`+Enter `def` Tab `=` | `\overset{def}{=}` |

Aliases: `\summation`, `\product`, `\integral`, `\coproduct`.
`\limits`/`\nolimits`/`\substack` are missing.

## Limits and bound-taking operators

`lim limsup liminf sup inf max min` are **boundless** auto-operators —
there is no bound template; type `_` to weld the condition:

| Want | Type | Get |
|---|---|---|
| \(\lim_{x\to0}f(x)\) | `lim` `_x->0` Right `f(x)` | `\lim_{x\to0}f\left(x\right)` — `->` becomes `\to` for free |
| \(\limsup_n a_n\) | `\limsup`+Enter `_n` Right `a_n` | `\limsup_{n}a_{n}` |
| \(\sup_x\), \(\inf_x\), \(\max_i\), \(\min_S\) | `sup_x` Right … | `\sup_{x}` etc. |
| \(a_n\downarrow L\) (converges) | `a_n` Right `\converges`+Enter `L` | `a_{n}\downarrow L` — Desmos semantics: `\converges`→`\downarrow`, `\diverges`→`\uparrow` (without the Right, `a_n\converges`+Enter`L` → `a_{n\downarrow L}`, arrow inside the sub) |

`\lim`+Enter alone gives boundless `\lim`; the `_` after it welds.

## Relations and inequalities

Typing shortcuts: `<=`→`\le`, `>=`→`\ge`, `->`→`\to` (all auto). `=>`,
`!=`, `<>` stay **literal** — use `\Rightarrow`, `\ne`.

Commands (all `\word`+Enter): `\ne \neq \approx \asymp \sim \simeq \cong
\equiv \propto (\prop) \doteq \ll \gg \prec \preceq \succ \succeq \models
\vdash \dashv \perp \parallel \mid \in (\isin) \ni (\contains) \subset
(\sub) \subseteq (\sube \subeq \subsete) \supset (\sup) \supseteq (\supe
\supeq \supsete) \sqsubset \sqsubseteq \sqsupset \sqsupseteq`.

Negations — `\not` as a prefix works (`\not\subseteq` → `\not\subseteq`,
`\not\ni` → `\not\ni`), and the `\n…` forms: `\nless \ngtr \nleq \ngeq
\nsim \ncong \nparallel \nsub \nsube \nsubset \nsubsete \nsubseteq \nsup
\nsupe \nsupset \nsupsete \nsupseteq \notin (\notni \niton
\notcontains \doesnotcontain for \ni)`.

`x:=y` types literally (`:=` works). `\coloneq`, `\coloneqq`,
`\triangleq`, `\eqdef`, `\Assign` are missing — workaround
`\overset{def}{=}`. Most AMS variants (`\approxeq`, `\lesssim`,
`\subsetneq`, `\bumpeq`, `\pitchfork`, `\eqcirc`, …) are missing — see
the missing-features table.

## Arrows

| Want | Type | Get |
|---|---|---|
| \(x\to y\) | `x->y` or `x\to`+Enter `y` | `x\to y` |
| \(x\mapsto y\) | `x\mapsto`+Enter `y` | `x\mapsto y` — **`x|->y` does NOT work** (`\left|\to` pair garbage) |
| \(\Rightarrow \Leftrightarrow \Leftarrow\) | `\Rightarrow` or `\implies` / `\Leftrightarrow` or `\iff` / `\Leftarrow` or `\impliedby` | canonical names |
| long/hook/harpoon | `\longrightarrow \Longrightarrow \longleftarrow \Longleftarrow \longleftrightarrow \Longleftrightarrow \hookrightarrow \hookleftarrow \leftharpoondown \leftharpoonup \rightharpoondown \rightharpoonup` | all serialize |
| directions | `\uparrow \downarrow \updownarrow \Uparrow \Downarrow \Updownarrow \nearrow \nwarrow \searrow \swarrow` | |
| misc | `\gets`→`\leftarrow`, `\leftarrow (\larr) \rightarrow (\rarr) \leftrightarrow (\lrarr \harr)`, capital `\lArr \rArr \lrArr \hArr` | aliases |

Missing: `\twoheadrightarrow` (↠ surjection), `\rightarrowtail`,
`\xrightarrow`/`\xleftarrow` (labelled arrows), `\longmapsto`,
`\mapsfrom`, `\rightleftharpoons`, squiggle/dash/loop arrows, `\nrightarrow`,
`\restriction` (`\upharpoonright`).

## Sets, intervals, delimiters

| Want | Type | Get |
|---|---|---|
| \(\{1,2,3\}\) | `{1,2,3}` | `\left\{1,2,3\right\}` (auto-pair) |
| \(\{x\mid x>0\}\) | `{x\mid`+Enter `x>0}` | `\left\{x\mid x>0\right\}` — cleanest |
| \(\{x:x>0\}\) | `{x:x>0}` | `\left\{x:x>0\right\}` — colon also fine |
| \(\{x|x>0\}\) pipe | `{x|x>0}` | `\left\{\left\{x\right|x>0\right\}` — pipe toggles the pair early; renders OK but the latex is ugly. Prefer `\mid` or `:` |
| \((0,1)\) \([0,1)\) \((-\infty,t]\) | typed literally | `\left(0,1\right)` `\left[0,1\right)` `\left(-\infty,t\right]` — `-` then `\infty`+Enter |
| \(\in \notin \ni\) | `\in` / `\notin` / `\ni` | |
| \(\subset \subseteq \nsubseteq \supset \cup \cap \setminus \backslash\) | `\subset` `\sube` `\not\subseteq` `\supset` `\cup` `\cap` `\setminus` `\backslash` | `\union`/`intersect`/`intersection` → `\cup`/`\cap` |
| \(\varnothing\) | `\emptyset` or `\varnothing` | `\varnothing` |
| \(\lvert x\rvert\) | `|x|` or `\vert`+Enter | `\left|x\right|` — `|` toggles `\left|`/`\right|`, so `a|b` gives `a\left|b\right|` (NOT "a divides b"; use `\mid`) |
| \(\lVert x\rVert\) | `\lVert`+Enter `x` `\rVert`+Enter | `\left\lVert x\right\rVert` — typing `||` gives two empty pairs `\left|\right|x\left|\right|` ✗ |
| \(\langle x,y\mid x^p=y^q\rangle\) | `\langle`+Enter `x,y\mid`+Enter `x^p`Right`=y^q`Right `\rangle`+Enter | `\left\langle x,y\mid x^{p}=y^{q}\right\rangle` |
| \(\lfloor \rfloor \lceil \rceil\) | `\lfloor`+Enter `x` `\rfloor`+Enter … | plain delimiters (no `\left`) |
| eval bar \(x^2\big|_1^2\) | `x^2` Right `|` `_1` Right `^2` | `x^{2}\left|_{1}^{2}\right|` — `\right|`, `\big|`, or plain `|` all land here; bounds weld to the bar |
| `\left(` + any closer | `\left`+Enter then `(` `[` `{` or `|` | `\left…\right` pair. `<` and `.` do NOT work (`\left.` missing) |
| `\big`/`\Big`/`\bigg`/`\Bigg` | `\big`+Enter then delimiter | serializes as `\left…\right` — renders fine, but the size hint is lost in the latex |

## Binary operators

`\pm \mp \times \cdot \div \circ \ast \oplus \otimes \ominus \odot
\sqcup \uplus \amalg \wedge \vee \sqcap \wr \diamond \bullet \dagger
\ddagger \bowtie \triangleleft \triangleright \frown \smile \bigcirc
\slash \setminus` — all `\word`+Enter.

Typing `*` gives `\cdot`. Aliases: `\land`/`\and`→`\wedge`,
`\lor`/`\or`→`\vee`, `\star`/`\loast`/`\lowast`→`\ast`,
`\cross`→`\times`, `\sdot`→`\cdot`, `\circle`→`\circ`,
`\bullet`/`\bull`→`\bullet`, `\circledot`→`\odot`,
`\union`→`\cup`, `\intersect`→`\cap`, `\plusminus`→`\pm`,
`\minusplus`→`\mp`.

**Wrong-symbol bugs** (registered but serialize to the wrong thing):
`\oslash`, `\O`, `\o`, `\Oslash` → `\varnothing`; `\divides` → `\div`
(should be ∣); `\converges`→`\downarrow`, `\diverges`→`\uparrow`;
`\ring`→`\circ`; `\S`→`\text{S}` (should be §); `\P`→`\mathbb{P}`;
`\AA`/`\angstrom`→`\text\AA`; `\Vert` missing → `\text{Vert}`.

## Logic and quantifiers

`\forall \exists (\exist \xist \xists) \nexists (\nexist) \neg (\not)
\therefore (\therefor) \because (\cuz) \top \bot \models \vdash \dashv`
— all standard. `p\land`+Enter `q\lor`+Enter `r` → `p\wedge q\vee r`
(the `\land`/`\lor` aliases serialize to `\wedge`/`\vee`).

## Accents and decorations

| Want | Type | Get |
|---|---|---|
| \(\hat{x}\) \(\hat{AB}\) | `\hat`+Enter `x` | `\hat{x}` |
| \(\vec{v}\) \(\vec{AB}\) | `\vec`+Enter `v` | `\vec{v}` |
| \(\overline{x}\), \(\overline{z_1z_2}\) | `\overline`+Enter `z_1z_2` Right | `\overline{z_{1z_{2}}}` — **accent args stay open**: `\bar`+Enter `x+y` swallows the `+` (`\overline{x+…}`), Right exits |
| \(\tilde{H}\) \(\tilde{H_i}\) | `\tilde`+Enter `H_i` Right | `\tilde{H_{i}}` |
| \(\underline\), \(\dot x\) | `\underline`+Enter / `\dot`+Enter | |
| arrows over | `\overrightarrow \overleftarrow \overleftrightarrow \overarc`+Enter | `\overrightarrow{AB}` |
| \(\overbrace{x+y}^{n}\) / \(\underbrace{x+y}_{n}\) | `\overbrace`+Enter `x+y` Right `^n` | `\overbrace{x+y}^{n}` |
| \(\boxed{x=1}\) | `\boxed`+Enter `x=1` | `\boxed{x=1}` |
| \(\underset\)/\(\overset\) | `\underset`+Enter `a` Tab `b` | two-arg: `{under}{base}`, `{over}{base}` |

Missing: `\widetilde`, `\ddot`, `\acute`, `\grave`, `\breve`, `\check`,
`\mathring`, `\cancel`. `\widehat` works but serializes `\hat`.
`\bar` serializes `\overline`.

## Fonts, text, spacing

| Want | Type | Get |
|---|---|---|
| \(\mathbb{R}\) | `\R`+Enter or `reals` | `\mathbb{R}` — also `\Z \N \Q \C \P \H`, words `naturals integers rationals complexes quaternions` |
| \(\mathbf{x} \mathrm{dx} \mathit{x} \mathsf{x} \mathtt{x}\) | `\mathbf`+Enter `x` etc. | kept |
| text in math | `\text`+Enter `if x>0` Right | `\text{if x>0}` — spaces allowed; Right exits |
| bold/italic text | `\textbf`+Enter / `\textit`+Enter | `\textbf{note}`, `\textit{note}` |
| spacing | `\quad` `\qquad` `\thinspace` `\ ` (backslash-space) | `\quad \qquad \, \ ` |

**`\mathbb`+Enter drops its wrapper** — `\mathbb`+Enter `R` gives plain
`R`. Only the named shortcuts work; `\mathbb{F}` is unwritable.
`\mathcal \mathfrak \mathscr` are missing (→`\text{…}`). `\operatorname`
and `\textcolor` accept but vanish. `\boldsymbol`/`\bf` missing.
Text-style words `textnormal textrm textsf texttt textbf textit textmd
textsc textsl textup emph italic italics bold strong tt sf uppercase
lowercase` are registered.

## Matrices and vectors

- `\pmatrix`+Enter → 2×2 grid `\begin{pmatrix}…\end{pmatrix}`, caret in
  the first cell. Also `\bmatrix` `[…]`, `\Bmatrix` `{…}`, `\vmatrix`
  (det bars), `\Vmatrix` (double bars = norm matrix), `\matrix` (bare —
  serializes without the `\begin`/`\end` wrapper).
- **Tab/Right move to the next cell**; arrows move cell-to-cell;
  **Enter inserts a row below** (caret keeps its column — the starting
  2×2 leaves the other column and the pushed-down row as empty `&`s);
  **Shift+Space adds a column**. `\pmatrix`+Enter `a` Tab `b` Enter `c`
  Tab `d` → `\begin{pmatrix}a&b\\&c\\d&\end{pmatrix}`. Typing `&`
  inside a cell inserts literal `\&`, not a column split.
- **The only keyboard exit is Ctrl+End** (jump to field end, landing at
  baseline after the matrix) — Right at the last cell stays inside, Down
  on the last row stays inside.
- Do **not** type `\begin{pmatrix}` literally — the `{` breaks the
  command input and produces mangled latex. Always the bare `\pmatrix`
  word. Typing `\pmatrix{a&b\\c&d}` inline mangles too; the `&`/brace
  chars are not cell syntax while typing.
- Determinant: `det` then `\vmatrix`+Enter → `\det\begin{vmatrix}…`.
- `cases`, `aligned`, `array` environments are missing; `piecewise`
  (left brace + cases) is missing — the `\lbrace`+`\matrix` approximation
  produces nonstandard latex. See MISSING-INPUT-FEATURES.md.

## Multi-line work

- **Enter at top level** wraps the cell in `\displaylines{…}` and adds a
  row: `x=1` Enter `y=2` → `\displaylines{x=1\\ y=2}`. More Enters → more
  rows (`a` Enter `b` Enter `c` → `\displaylines{a\\ b\\ c}`).
- Enter inside an incomplete construct (e.g. mid-`\frac`) snaps the caret
  out to the atom first, then breaks the line — the incomplete atom is
  left as-is.
- `\displaylines`+Enter as a command also inserts the block.
- **Shift+Enter → new cell** (verified: field count grows, new cell gets
  focus). Backspace/Delete on a blank cell deletes the cell.
- `aligned`/`split` alignment with `&` anchors is missing — typed `&`
  gives `\&`.
- Navigation: `Home`/`End` are block-local; `Ctrl+Home`/`Ctrl+End` go to
  field start/end. Up/Down at a cell's vertical edge hop to the
  neighboring cell (`move-out`).

## Special characters and unicode

| Type | Get |
|---|---|
| `50%` | `50\%` |
| `a&b` `a#b` `a$b` | `a\&b` `a#b` `a\$b` (literal, escaped) |
| `a?b!` `a;b` `a:b` | literal `?` `!` `;` `:` |
| `~` | `\sim` |
| `...` | literal `...` — use `\dots` `\cdots` `\vdots` `\ddots` `\ldots` for real dots |
| unicode `αβπθ∞≤≥≠≈→°∑√∫` | `\alpha \beta …` — `°`→`\degree`, `∑`/`∫`→bounded templates |
| unicode prime `′` | stays unicode `′` — use `'` |
| `\dprime` | `″` |

Spacing quirks: `\,` typed as a command → `\ ,`; `\;` → `\ ;`; `\!` →
`\ `+`!` garbage; use `\thinspace`→`\,`, `\quad`, `\qquad`, `\ ` instead.

## Worked examples from the theses

All verified end-to-end in the app. `Right` presses are the block exits
that matter.

| Expression | Keystrokes | Result |
|---|---|---|
| \(f:S^1\to R^3\) (Buller) | `f:S^1` Right `\to`+Enter `R^3` | `f:S^{1}\to R^{3}` |
| \(H:Y\times[0,1]\to Y\) | `H:Y\times`+Enter `[0,1]\to`+Enter `Y` | `H:Y\times\left[0,1\right]\to Y` |
| \(L=K_1\cup K_2\cup\cdots\cup K_n\subset S^3\) (Buller) | `L=K_1` Right `\cup`+Enter `K_2` Right `\cup`+Enter `\cdots`+Enter `\cup`+Enter `K_n` Right `\subset`+Enter `S^3` | `L=K_{1}\cup K_{2}\cup\cdots\cup K_{n}\subset S^{3}` |
| \(G(T_{p,q})=\langle x,y\mid x^p=y^q\rangle\) (Salkinder) | `G(T_p,q` Right `)=\langle`+Enter `x,y\mid`+Enter `x^p` Right `=y^q` Right `\rangle`+Enter | `G\left(T_{p,q}\right)=\left\langle x,y\mid x^{p}=y^{q}\right\rangle` |
| \(D_{2n}=\langle s,t\mid s^2=t^n=1,sts^{-1}=t^{-1}\rangle\) (Salkinder) | `D_2n` Right `=\langle`+Enter `s,t\mid`+Enter `s^2=t^n=1,sts^-1=t^-1` Right Right `\rangle`+Enter | `D_{2n}=\left\langle s,t\mid s^{2}=t^{n}=1,sts^{-1}=t^{-1}\right\rangle` |
| \(\frac{\mathbb{Z}}{p}\ast\frac{\mathbb{Z}}{q}\) | `\Z`+Enter `/p` Right `\ast`+Enter `\Z`+Enter `/q` | `\frac{\mathbb{Z}}{p}\ast\frac{\mathbb{Z}}{q}` — for inline `Z/p` use `\slash` |
| \(g_4(K)=\min\{g(S)\mid S\subset B^4\}\) (Buller) | `g_4` Right `(K)=min{g(S)\mid`+Enter `S\subset`+Enter `B^4` Right `}` | `g_{4}\left(K\right)=\min\left\{g\left(S\right)\mid S\subset B^{4}\right\}` |
| \(t^{-1}V(L+)-tV(L-)-(t^{1/2}-t^{-1/2})V(L_0)=0\) (Buller, Alexander poly.) | `t^-1` Right `V(L+)-tV(L-)-(t^1/2` Right Right `-t^-1/2` Right Right `)V(L_0` Right `)=0` | `t^{-1}V\left(L+\right)-tV\left(L-\right)-\left(t^{\frac{1}{2}}-t^{-\frac{1}{2}}\right)V\left(L_{0}\right)=0` |
| \(x'=F(x,\mu)\) (Fogelson) | `x'=F(x,\mu` `)` | `x'=F\left(x,\mu\right)` |
| \(\lim_{t\to0}x(t)=x\) (Fogelson) | `lim` `_t->0` Right `x(t)=x` | `\lim_{t\to0}x\left(t\right)=x` |
| \(\Re\lambda_i(DF)\) (Fogelson, eigenvalues) | `\Re`+Enter `\lambda`+Enter `_i` Right `(DF)` | `\Re\lambda_{i}\left(DF\right)` |
| \(M_t:=f^{-1}((-\infty,t])\) (Fogelson, sublevel set) | `M_t` Right `:=f^-1` Right `((-\infty`+Enter `,t])` | `M_{t}:=f^{-1}\left(\left(-\infty,t\right]\right)` — `-` then `\infty`+Enter |
| \(D^k\times D^{n-k}\) (Salkinder, handles) | `D^k` Right `\times`+Enter `D^n-k` | `D^{k}\times D^{n-k}` |
| \(\tilde{H_i}(S^n\setminus A)\) (Salkinder, homology) | `\tilde`+Enter `H_i` Right `(S^n` Right `\setminus`+Enter `A)` | `\tilde{H_{i}}\left(S^{n}\setminus A\right)` |
| \(\rho:G\to Aut(V)\) (Salkinder) | `\rho`+Enter `:G\to`+Enter `Aut(V)` | `\rho:G\to Aut\left(V\right)` — `Aut` is italic (no `\operatorname`) |
| \(w(L)=\sum_{c\in C}sgn(c)\) (Buller, writhe) | `w(L)=\sum`+Enter `c\in`+Enter `C` Right Right `sgn(c)` | `w\left(L\right)=\sum_{c\in C}^{ }sgn\left(c\right)` — typing `crossings` verbatim traps on `sin`; use `\text{crossings}` |
| \(x+y\equiv 2z\ (mod\ 3)\) | `x+y\equiv`+Enter `2z` `(mod` `\ ` `3)` | `x+y\equiv2z\left(mod\ 3\right)` — `\ ` needed so `3` doesn't weld to `mod` (see below) |
