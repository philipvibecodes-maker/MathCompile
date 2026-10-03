# Typing math into MathCompile — input reference

How to type the math a typical undergraduate needs into `<math-field>`
cells. Companion to `SYMBOLS.md` (the full command inventory) and
`MISSING-INPUT-FEATURES.md` (what *can't* be typed, or misbehaves).

Every keystroke sequence below was verified by driving real cells in the
dev app (`npm run dev`, port 5573) with synthetic keyboard input — ~800
probes — and recording the serialized LaTeX the cell produces. Worked
examples are taken from three Harvard undergraduate theses: Buller (knot
theory), Fogelson (bifurcation theory/ODEs), Salkinder (knot theory /
low-dimensional topology). Verified against `main` @ `4f65954`.

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
   matrix cell, or `\text` argument until you press **Right** or **Tab**.
   Everything you type meanwhile lands inside the block — including `+`,
   `-`, `,`, `*`, spaces, parens, and even `_`/`^`/`/` (which nest):
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
   `<`/`>` do **not** pair — use `\langle`, which auto-pairs to
   `\left\langle…\right\rangle`. **Do not type `\rangle` (or `\rVert`)**
   to close it — the close is already there; typing it swaps the close
   glyph to `\langle` and produces latex that fails to re-parse (blank
   cell on reload). Exit with Right/Ctrl+End instead.
4. **Enter vs Shift+Enter.** At top level **Enter** inserts a
   `\displaylines` line break *in the same cell*; **Shift+Enter** makes a
   **new cell**. Inside an open `\command`, Enter accepts the command.
   Inside a matrix/environment, Enter adds a **row** (keeping the
   column) and Shift+Space adds a **column**. Inside a script/fraction,
   Enter snaps the caret out to the atom first, then breaks the line.
5. **Smart mode** (the default toggle in the header) adds two things on
   top of plain mode: `autoCommands` — the words
   `int iint antid sum sqrt prod pi infty theta derivative` work with no
   backslash — and `autoSubscriptNumerals` (`x2` → `x_{2}`). Upright
   operator names (`sin`, `lim`, `det`, …) and unicode symbol typing are
   on in **both** modes.
6. **Unicode input works.** Typing `α β π θ ∞ ≤ ≥ ≠ ≈ → ↦ ° √ ∫ ∬ ∑ ∏ ∀ ∃
   ∈ ∉ ⊂ ⊆ ∪ ∩ ∧ ∨ ¬ ⇒ ∋ ⟨ ⟩ ‖ ℝ ℤ ℕ ℚ ℂ ± × ÷ −` directly inserts the
   symbol — no backslash needed (ℝℤℕℚℂ become `\mathbb{…}`, `∬`→`\iint`).
   Caveats: `∫`/`∑` insert the *bounded* templates (caret lands in the
   lower bound), `√`/`∑`/`∏` open their structure while inside a bound,
   `⟨⟩‖` stay literal unicode chars (a usable workaround for the `\rangle`
   bug in rule 3), `⇔` stays a literal `⇔`, and the unicode prime `′`
   stays unicode — use ASCII `'`.

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
descending into it. `{…}` inside a script groups invisibly:
`x_{i+1}` → `x_{i+1}`.

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
| \(\frac ab\) infix | `a\atop`+Enter `b` | `a\atop b` (serialize stays `\atop`) |
| \(\binom nk\) | `\binom`+Enter `n` Tab `k` | `\binom{n}{k}` |
| \(\binom nk\) infix | `n\choose`+Enter `k` | `\binom{n}{k}` |
| \(\binom nk\) display/text | `\dbinom`+Enter `n` Tab `k` | serializes `\binom{n}{k}` — `\tbinom` same |

Aliases that serialize to `\frac`: `\dfrac`, `\cfrac`, `\fraction`.
Inline slash instead of a fraction: `a\slash`+Enter `b` → `a/b`.
`\tfrac`, `\genfrac` are missing (see MISSING-INPUT-FEATURES.md).

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

**Custom operator names:** `\operatorname` itself is dropped (typed
`\operatorname{tr}`+Enter produces italic `tr`) — but **`\mathop{…}`
works**: `\mathop`+Enter `tr` Right `(A)` → `\mathop{tr}\left(A\right)`
which renders upright. Use it for `tr`, `Aut`, `Hom`, `GL`, etc.

**Mid-word trap:** these fire anywhere inside a word, so `crossings` →
`cros\sin gs`, `single` → `\sin gle`, `cosine` → `\cos ine`, `info` →
`\inf o`, `minimum` → `\min imum`, `elim` → `e\lim`, `asin` → `a\sin`.
Workaround: `\text{crossings}`+Enter for words, or use a symbol (`C`).

## Derivatives

| Want | Type | Get |
|---|---|---|
| \(\frac{dy}{dx}\) | `dy/dx` | `\frac{dy}{dx}` |
| \(\frac{d}{dx}\) | `d/dx` | `\frac{d}{dx}` |
| \(\frac{df}{dx}\) via command | `\derivative`+Enter `x` Up `f` | expands at insertion to `\frac{d}{d}` atoms, caret in denominator → `\frac{df}{dx}` |
| \(\frac{d}{dx}f\) | `\derivative`+Enter `x` Right `f` | `\frac{d}{dx}f` |
| \(\frac{\partial F}{\partial x}\) | `\frac`+Enter `\partial`+Enter `F` Right `\partial`+Enter `x` | `\frac{\partial F}{\partial x}` |
| \(\dot x\), \(\ddot x\) | `\dot`+Enter `x` Right / `\ddot`+Enter `x` Right | `\dot{x}`, `\ddot{x}` |
| \(x'=F(x,\mu)\) (Fogelson) | `x'=F(x,\mu` `)` | `x'=F\left(x,\mu\right)` |

`dIsDerivative` off makes `\derivative` expand to `D( )` instead.

## Integrals

| Want | Type | Get |
|---|---|---|
| \(\int_a^b x^2\,dx\) | `\int`+Enter `a` Tab `b` Tab `x^2` Tab `dx` | `\int_{a}^{b}x^{2}dx` — caret lands in the **lower** bound; Tab walks lower→upper→baseline |
| same, smart | `int` `a` Tab `b` Tab `x^2` Tab `dx` | identical |
| skip the upper bound | `\int`+Enter `a` Right Right `x` | `\int_{a}^{ }x` — Right×2 hops past the empty upper |
| \(\iint_D f\) boundless | `iint` or `\iint`+Enter `_D` Right `f(x)` | `\iint_{D}f\left(x\right)` — `_`/`^` after it weld a plain supsub |
| \(\antid\) indefinite | `antid` | `\antid x^{2}dx` — insertion alias for `\int` at compile time |
| \(\iiint \oiint \idotsint \intop\) | `\iiint`+Enter etc. | boundless signs; weld bounds with `_`/`^` |
| \(\oint_C\) | `\oint`+Enter `_C` Right | `\oint_{C}` |
| unicode | `∫` / `∬` char | `\int_{ }^{ }` bounded / `\iint` boundless |

**Trap:** after `int`/`sum`/`prod` smart words the caret is already
inside the lower bound — do **not** type `_`: `int _a ^b x dx` →
`\int_{_{a}^{b}xdx}^{ }` garbage.

## Sums, products, big operators

| Want | Type | Get |
|---|---|---|
| \(\sum_{i=1}^n i^2\) | `\sum`+Enter `i=1` Right `n` Right `i^2` | `\sum_{i=1}^{n}i^{2}` |
| \(\sum_{i=1}^\infty x^i\) | `\sum`+Enter `i=1` Right `\infty`+Enter Right `x^i` | `\sum_{i=1}^{\infty }x^{i}` — **use `\infty`+Enter inside bounds**; bare `infty` in a bound → `\inf ty` |
| \(\sum_c\) | `\sum`+Enter `c` Right Right | `\sum_{c}^{ }` then keep typing |
| \(\prod\) | `prod` or `\prod`+Enter | `\prod_{ }^{ }` bounded template |
| \(\bigcup_{i=1}^n K_i\) | `\bigcup`+Enter `_i=1` Right `^n` Right `K_i` | `\bigcup_{i=1}^{n}K_{i}` — bigops are boundless; `_`/`^` weld bounds |
| \(\bigcap \bigoplus \bigotimes \bigvee \bigwedge \bigsqcup \biguplus \coprod \bigodot\) | `\bigcap`+Enter etc. | boundless signs; weld bounds with `_`/`^` |
| \(\underset{c\in X}{\sum}\) | `\underset`+Enter `c` `\in`+Enter `X` Tab `\sum`+Enter | `\underset{c\in X}{\sum_{ }^{ }}` — arg1 = below-text, arg2 = base |
| \(\overset{\mathrm{def}}{=}\) | `\overset`+Enter `def` Tab `=` | `\overset{def}{=}` — `\stackrel`+Enter is an alias |
| multi-line bound | `\sum`+Enter `\substack`+Enter `i=1` Enter `j=2` | `\sum_{\substack{i=1\\ j=2}}^{ }` — Enter inside `\substack` adds a bound row |
| \(\sum\limits\), \(\int\nolimits\) | `\limits` / `\nolimits`+Enter after the sign | serialize as a trailing leaf (`\sum_{i=1}^{ }\limits`) |

Aliases: `\summation`, `\product`, `\integral`, `\coproduct`.

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

AMS relations now work: `\approxeq \lesssim \gtrsim \leqslant
\thickapprox \risingdotseq \fallingdotseq \subsetneq \supsetneq \Subset
\Supset \subseteqq \eqcirc \circeq \bumpeq \Bumpeq \backsim \between
\Join \shortmid \shortparallel \precsim \succsim \vDash \Vvdash
\triangleq \coloneq \coloneqq \colonequals \eqqcolon`.

Definitional equals `:=`: type `:=` literally, or `\assign` /
`\coloneqq` / `\colonequals` (all serialize `\coloneqq`). For
\(\overset{def}{=}\) use `\overset`+Enter `def` Tab `=` or
`\stackrel`+Enter.

**Negations — `\not` is a no-op prefix.** Typing `\not`+Enter before
`=`, `\in`, `\sim`, `\mid`, `\subset` inserts *nothing* (`x\not=` →
`x=y`). Use the dedicated `\n…` commands, which serialize as
`\not\X`: `\nless \ngtr \nleq \ngeq \nsim \ncong \nparallel \nsub \nsube
\nsubset \nsubsete \nsubseteq \nsup \nsupe \nsupset \nsupsete \nsupseteq
\nmid \nprec \nsucc \nvDash \notin (\notni \niton \notcontains
\doesnotcontain for \ni) \nexists`.

Still missing: `\pitchfork`, `\varpropto`, `\eqdef`, `\questeq`,
`\hateq`, `\veeeq` — see MISSING-INPUT-FEATURES.md.

## Arrows

| Want | Type | Get |
|---|---|---|
| \(x\to y\) | `x->y` or `x\to`+Enter `y` | `x\to y` |
| \(x\mapsto y\) | `x\mapsto`+Enter `y` | `x\mapsto y` — **`x|->y` does NOT work** (`\left|\to` pair garbage) |
| \(f:X\twoheadrightarrow Y\) surjection | `\twoheadrightarrow`+Enter | `f:X\twoheadrightarrow Y` — Salkinder's `ρ:G(K)→D_{2n}` |
| \(x\rightarrowtail y\) inclusion | `\rightarrowtail` / `\leftarrowtail` / `\twoheadleftarrow` | |
| labelled arrow | `\xrightarrow`+Enter `f` | `\xrightarrow{f}` — `\xleftarrow` same; single label arg only |
| \(\Rightarrow \Leftrightarrow \Leftarrow\) | `\Rightarrow` or `\implies` / `\Leftrightarrow` or `\iff` / `\Leftarrow` or `\impliedby` | `\implies`/`\iff`/`\impliedby` serialize literally (render the same) |
| long/hook/harpoon | `\longrightarrow \Longrightarrow \longleftarrow \Longleftarrow \longleftrightarrow \Longleftrightarrow \hookrightarrow \hookleftarrow \leftharpoondown \leftharpoonup \rightharpoondown \rightharpoonup` | all serialize |
| AMS arrows | `\rightsquigarrow \leadsto \looparrowright \looparrowleft \curvearrowright \curvearrowleft \circlearrowright \circlearrowleft \Rsh \Lsh \dashrightarrow \dashleftarrow \Lleftarrow \Rrightarrow \upharpoonright \upharpoonleft \downharpoonright \downharpoonleft \rightleftharpoons \leftrightharpoons` | all serialize |
| directions | `\uparrow \downarrow \updownarrow \Uparrow \Downarrow \Updownarrow \nearrow \nwarrow \searrow \swarrow` | |
| misc | `\gets`→`\leftarrow`, `\leftarrow (\larr) \rightarrow (\rarr) \leftrightarrow (\lrarr \harr)`, capital `\lArr \rArr \lrArr \hArr` | aliases |
| restriction ↾ | `\upharpoonright`+Enter | `f\upharpoonright_{S}` — or `f` `\vert`+Enter `_S` → `f|_{S}` |

Missing: `\longmapsto`, `\mapsfrom`, `\multimap`, `\nrightarrow`,
`\nRightarrow`.

## Sets, intervals, delimiters

| Want | Type | Get |
|---|---|---|
| \(\{1,2,3\}\) | `{1,2,3}` | `\left\{1,2,3\right\}` (auto-pair) |
| \(\{x\mid x>0\}\) | `{x\mid`+Enter `x>0}` | `\left\{x\mid x>0\right\}` — cleanest |
| \(\{x:x>0\}\) | `{x:x>0}` | `\left\{x:x>0\right\}` — colon also fine |
| \(\{x|x>0\}\) pipe | `{x|x>0}` | `\left\{\left\{x\right|x>0\right\}` — pipe toggles the pair early; renders OK but the latex is ugly. Prefer `\mid` or `:` |
| \((0,1)\) \([0,1)\) \((-\infty,t]\) | typed literally | `\left(0,1\right)` `\left[0,1\right)` `\left(-\infty,t\right]` — `-` then `\infty`+Enter |
| \(\in \notin \ni\) | `\in` / `\notin` / `\ni` | |
| \(\subset \subseteq \nsubseteq \supset \cup \cap \setminus \backslash \smallsetminus\) | `\subset` `\sube` `\nsubseteq` `\supset` `\cup` `\cap` `\setminus` `\backslash` `\smallsetminus` | `\union`/`intersect`/`intersection` → `\cup`/`\cap` |
| \(\varnothing\) | `\emptyset` or `\varnothing` | `\varnothing` |
| \(\lvert x\rvert\) | `|x|` or `\left|` `x` `\right|` | `\left|x\right|` — `|` toggles `\left|`/`\right|`, so `a|b` gives `a\left|b\right|` (NOT "a divides b"; use `\mid`) |
| non-paired `\|` | `\vert`+Enter | bare `|` — for restriction/eval bars: `f` `\vert`+Enter `_S` → `f|_{S}` |
| \(\lVert x\rVert\) | `\lVert`+Enter `x` then Right/Ctrl+End | `\left\lVert x\right\rVert` — **do not type `\rVert`** (it swaps the close to `\lVert`, see rule 3). `||x||` gives two empty pairs `\left|\right|x\left|\right|` ✗; unicode `‖x‖` stays literal and works |
| \(\langle x,y\mid x^p=y^q\rangle\) | `\langle`+Enter `x,y\mid`+Enter `x^p` Right `=y^q`, exit with Ctrl+End | `\left\langle x,y\mid x^{p}=y^{q}\right\rangle` — **do not type `\rangle`**; also inside `⟨…⟩` raw `|` becomes the close delimiter — use `\mid`+Enter |
| \(\lfloor \rfloor \lceil \rceil\) | `\lfloor`+Enter `x` `\rfloor`+Enter … | plain delimiters (no `\left`) |
| eval bar \(x^2\big|_1^2\) | `x^2` Right `\vert`+Enter `_1` Right `^2` | `x^{2}\vert_{1}^{2}` — clean, no trailing pair close |
| `\left(` + any closer | `\left`+Enter then `(` `[` `{` or `|` | `\left…\right` pair. `<` and `.` do NOT work (`\left.` missing) |
| `\big`/`\Big`/`\bigg`/`\Bigg` | `\big`+Enter then delimiter | flaky — produced inconsistent results in probes; `\left…\right` is reliable |

## Binary operators

`\pm \mp \times \cdot \div \circ \ast \oplus \otimes \ominus \odot
\sqcup \uplus \amalg \wedge \vee \sqcap \wr \diamond \bullet \dagger
\ddagger \bowtie \triangleleft \triangleright \frown \smile \bigcirc
\slash \setminus \smallsetminus \bigstar \circledR \circledS` — all
`\word`+Enter. (`\dagger`/`\ddagger` serialize as `\dag`/`\ddag`.)

Typing `*` gives `\cdot`. Aliases: `\land`/`\and`→`\wedge`,
`\lor`/`\or`→`\vee`, `\star`/`\loast`/`\lowast`→`\ast`,
`\cross`→`\times`, `\sdot`→`\cdot`, `\circle`→`\circ`,
`\bullet`/`\bull`→`\bullet`, `\circledot`→`\odot`,
`\union`→`\cup`, `\intersect`→`\cap`, `\plusminus`→`\pm`,
`\minusplus`→`\mp`.

**Wrong-symbol bugs** (registered but serialize to the wrong thing):
`\oslash`, `\O`, `\o`, `\Oslash` → `\varnothing`; `\divides` → `\div`
(should be ∣); `\converges`→`\downarrow`, `\diverges`→`\uparrow`;
`\P`→`\mathbb{P}` (should be ¶).

## Logic and quantifiers

`\forall \exists (\exist \xist \xists) \nexists (\nexist) \neg
\therefore (\therefor) \because (\cuz) \top \bot \models \vdash \dashv
\vDash \Vdash \Vvdash` — all standard. `p\land`+Enter `q\lor`+Enter `r`
→ `p\wedge q\vee r` (the `\land`/`\lor` aliases serialize to
`\wedge`/`\vee`). `\not`+Enter inserts nothing — use `\nexists`/`\ne`
etc. (see Relations).

## Accents and decorations

| Want | Type | Get |
|---|---|---|
| \(\hat{x}\) \(\hat{AB}\) | `\hat`+Enter `x` | `\hat{x}` |
| \(\vec{v}\) \(\vec{AB}\) | `\vec`+Enter `v` | `\vec{v}` |
| \(\overline{x}\), \(\overline{z_1z_2}\) | `\overline`+Enter `z_1z_2` Right | `\overline{z_{1z_{2}}}` — **accent args stay open**: `\bar`+Enter `x+y` swallows the `+` (`\overline{x+…}`), Right exits |
| \(\tilde{H}\) \(\widetilde{abc}\) | `\tilde`+Enter / `\widetilde`+Enter `abc` Right | `\tilde{H}`, `\widetilde{abc}` |
| \(\underline\), \(\dot x\), \(\ddot x\) | `\underline`+Enter / `\dot`+Enter / `\ddot`+Enter `x` Right | `\dot{x}`, `\ddot{x}` — exit with Right |
| \(\acute \grave \breve \check \mathring \b \c \d\) accents | `\acute`+Enter `x` Right … | `\acute{x}`, `\b{o}` — under-accents `\b`/`\c`/`\d` work; each accent's arg is an open block (Right to exit) |
| arrows over | `\overrightarrow \overleftarrow \overleftrightarrow \overarc`+Enter | `\overrightarrow{AB}` |
| \(\overbrace{x+y}^{n}\) / \(\underbrace{x+y}_{n}\) | `\overbrace`+Enter `x+y` Right `^n` | `\overbrace{x+y}^{n}` |
| \(\cancel{x}\) | `\cancel`+Enter `x` Right | `\cancel{x}` |
| \(\boxed{x=1}\) | `\boxed`+Enter `x=1` | `\boxed{x=1}` |
| \(\underset\)/\(\overset\) | `\underset`+Enter `a` Tab `b` | two-arg: `{under}{base}`, `{over}{base}` |

`\widehat` works but serializes `\hat`; `\bar` serializes `\overline`.

## Fonts, text, spacing

| Want | Type | Get |
|---|---|---|
| \(\mathbb{R}\) | `\R`+Enter, `reals`, or unicode `ℝ` | `\mathbb{R}` — also `\Z \N \Q \C \P \H`, words `naturals integers rationals complexes quaternions`, unicode `ℤ ℕ ℚ ℂ` |
| \(\mathbb{F}_p\) | — | `\mathbb`+Enter drops its wrapper and unicode `𝔽` is dropped entirely — `\mathbb{F}` is unwritable (see missing-features) |
| \(\mathcal{L} \mathfrak{g} \mathscr{L}\) | `\mathcal`+Enter `L` Right etc. | `\mathcal{L}`, `\mathfrak{g}`, `\mathscr{L}` |
| \(\mathbf{x} \mathrm{dx} \mathit{x} \mathsf{x} \mathtt{x} \boldsymbol{x}\) | `\mathbf`+Enter `x` etc. | kept — `\bf`+Enter also works |
| custom upright operator | `\mathop`+Enter `tr` Right `(A)` | `\mathop{tr}\left(A\right)` — the workaround for dropped `\operatorname` |
| text in math | `\text`+Enter `if x>0` Right | `\text{if x>0}` — spaces allowed; Right exits |
| bold/italic text | `\textbf`+Enter / `\textit`+Enter | `\textbf{note}`, `\textit{note}` |
| spacing | `\quad` `\qquad` `\,` `\;` `\!` `\ ` | `\quad \qquad \, \; \!` all work now (`\!` = negative thin space) |
| measured spacing | `\hspace`+Enter `1em` Right / `\kern`+Enter `5pt` Right | `\hspace{1em}`, `\kern{5pt}` |
| invisible height | `\phantom`+Enter `x` Right | `\phantom{x}` |
| dots | `\dots \cdots \vdots \ddots \ldots \hdots \dotsb \dotsi` | all serialize |

`\mathbb{F}` freeform, `\operatorname`, `\textcolor` are still dead —
see MISSING-INPUT-FEATURES.md. Text-style words `textnormal textrm textsf
texttt textbf textit textmd textsc textsl textup emph italic italics bold
strong tt sf uppercase lowercase` are registered.

## Matrices, piecewise, environments

`\begin{env}` typed literally now works — type the whole `\begin{pmatrix}`
then Enter. A blank grid is inserted (2 cols × 3 rows) with the caret in
**row 2, col 1** — press **Up** to reach row 1. The bare words
`\pmatrix \bmatrix \Bmatrix \vmatrix \Vmatrix \matrix` still work and
insert a 2×2 with the caret in row 1 (prefer these for small matrices).

| Want | Type | Get |
|---|---|---|
| 2×2 parens matrix | `\pmatrix`+Enter `a` Tab `b` Enter `c` Tab `d` | `\begin{pmatrix}a&b\\c&d\end{pmatrix}` (after filling) |
| same, literal env | `\begin{pmatrix}`+Enter Up `a` Tab `b` … | works — caret starts row 2, Up reaches row 1 |
| det matrix | `det` `\vmatrix`+Enter … | `\det\begin{vmatrix}…` — `\vmatrix` = det bars, `\Vmatrix` = double bars, `\bmatrix` = `[]`, `\Bmatrix` = `{}`, `\matrix` = bare |
| piecewise \(f(x)=\begin{cases}…\) | `f(x)=` `\begin{cases}`+Enter `x^2` Right Tab `x>0` Enter `0` Tab `x<0` | `\begin{cases}x^{2}&x>0\\0&x<0\end{cases}` — col 2 is the condition; Right exits the sup block *then* Tab moves to it |
| \(\begin{smallmatrix}\) | `\begin{smallmatrix}`+Enter | works (bare `\smallmatrix` word does not) |
| \(\begin{array}\) | `\begin{array}`+Enter | works, but the `{cc}` colspec can't be typed — typing it mangles (`\begin{array}{}cc…`). Leave the spec empty |
| `\begin{subarray}` | same pattern | works |
| aligned work | `\begin{aligned}`+Enter `x` Tab `=1` Enter … | `\begin{aligned}x&=1\\…` — col1 = left side, col2 = `=rhs`. **Enter adds a row keeping the column** — arrow Left back to col 1 to start each row. `&` types literal `\&`, never a column break |
| gathered lines | `\begin{gathered}`+Enter `x=1` Enter `y=2` | `\begin{gathered}x=1\\y=2\end{gathered}` — also `\begin{gather}` `\begin{equation}` `\begin{multline}` `\begin{flalign}` (all serialize as `gathered`) |
| more aligned aliases | `\begin{split}` `\begin{align}` `\begin{eqnarray}` `\begin{alignat}` | serialize as `\begin{aligned}` |

- **Tab/Right move to the next cell**; arrows move cell-to-cell;
  **Enter inserts a row below** keeping the column; **Shift+Space adds a
  column**. Typing `&` inside a cell inserts literal `\&`.
- **The only keyboard exit is Ctrl+End** (jump to field end, landing at
  baseline after the env) — Right at the last cell stays inside, Down on
  the last row stays inside.
- Typing `\pmatrix{a&b\\c&d}` inline mangles — the `&`/brace chars are
  not cell syntax while typing.

## Multi-line work

- **Enter at top level** wraps the cell in `\displaylines{…}` and adds a
  row: `x=1` Enter `y=2` → `\displaylines{x=1\\ y=2}`. More Enters → more
  rows (`a` Enter `b` Enter `c` → `\displaylines{a\\ b\\ c}`).
- Enter inside an incomplete construct (e.g. mid-`\frac`) snaps the caret
  out to the atom first, then breaks the line — the incomplete atom is
  left as-is.
- `\displaylines`+Enter as a command also inserts the block.
- For real aligned/gathered structure use `\begin{aligned}` /
  `\begin{gathered}` (above) — `\displaylines` rows are simpler but have
  no alignment columns.
- **Shift+Enter → new cell** (verified: field count grows, new cell gets
  focus). Backspace/Delete on a blank cell deletes the cell.
- Navigation: `Home`/`End` are block-local; `Ctrl+Home`/`Ctrl+End` go to
  field start/end. Up/Down at a cell's vertical edge hop to the
  neighboring cell (`move-out`).

## Special characters and unicode

| Type | Get |
|---|---|
| `50%` | `50\%` |
| `a&b` `a#b` `a$b` `a_b` | `a\&b` `a\#b` `a\$b` `a\_b` (literal, escaped) |
| `a?b!` `a;b` `a:b` | literal `?` `!` `;` `:` |
| `~` | `\sim` |
| `...` | literal `...` — use `\dots` `\cdots` `\vdots` `\ddots` `\ldots` for real dots |
| `\S` `\AA` `\dag` `\ddag` `\yen` `\euro` `\pounds` `\copyright` `\checkmark` | `\S` (§) `\AA` (Å) `\dag` `\ddag` `¥` `€` `£` `©` `✓` — `\P` gives `\mathbb{P}` not ¶ |
| `\imath \jmath \eth \mho \hslash \beth \gimel \daleth \Finv \Game \complement` | all work |
| unicode `αβπθ∞≤≥≠≈→°∑√∫∬∀∃∈∉⊂⊆∪∩∧∨¬⇒∋⟨⟩‖ℝℤℕℚℂ±×÷−` | mapped — `°`→`\degree`, `∑`/`∫`→bounded templates, `⟨⟩‖` stay literal, `⇔` stays literal |
| unicode prime `′` | stays unicode `′` — use `'` |
| `\dprime` | `″` |

## Worked examples from the theses

All verified end-to-end in the app. `Right` presses are the block exits
that matter.

| Expression | Keystrokes | Result |
|---|---|---|
| \(f:S^1\to R^3\) (Buller) | `f:S^1` Right `\to`+Enter `R^3` | `f:S^{1}\to R^{3}` |
| \(H:Y\times[0,1]\to Y\) | `H:Y\times`+Enter `[0,1]\to`+Enter `Y` | `H:Y\times\left[0,1\right]\to Y` |
| \(L=K_1\cup K_2\cup\cdots\cup K_n\subset S^3\) (Buller) | `L=K_1` Right `\cup`+Enter `K_2` Right `\cup`+Enter `\cdots`+Enter `\cup`+Enter `K_n` Right `\subset`+Enter `S^3` | `L=K_{1}\cup K_{2}\cup\cdots\cup K_{n}\subset S^{3}` |
| \(G(T_{p,q})=\langle x,y\mid x^p=y^q\rangle\) (Salkinder) | `G(T_p,q` Right `)=\langle`+Enter `x,y\mid`+Enter `x^p` Right `=y^q` Ctrl+End | `G\left(T_{p,q}\right)=\left\langle x,y\mid x^{p}=y^{q}\right\rangle` — do **not** type `\rangle` (see rule 3) |
| \(D_{2n}=\langle s,t\mid s^2=t^n=1,sts^{-1}=t^{-1}\rangle\) (Salkinder) | `D_2n` Right `=\langle`+Enter `s,t\mid`+Enter `s^2=t^n=1,sts^-1=t^-1` Right Ctrl+End | `D_{2n}=\left\langle s,t\mid s^{2}=t^{n}=1,sts^{-1}=t^{-1}\right\rangle` |
| \(\frac{\mathbb{Z}}{p}\ast\frac{\mathbb{Z}}{q}\) | `\Z`+Enter `/p` Right `\ast`+Enter `\Z`+Enter `/q` | `\frac{\mathbb{Z}}{p}\ast\frac{\mathbb{Z}}{q}` — for inline `Z/p` use `\slash` |
| \(g_4(K)=\min\{g(S)\mid S\subset B^4\}\) (Buller) | `g_4` Right `(K)=min{g(S)\mid`+Enter `S\subset`+Enter `B^4` Right `}` | `g_{4}\left(K\right)=\min\left\{g\left(S\right)\mid S\subset B^{4}\right\}` |
| \(t^{-1}V(L+)-tV(L-)-(t^{1/2}-t^{-1/2})V(L_0)=0\) (Buller, Alexander poly.) | `t^-1` Right `V(L+)-tV(L-)-(t^1/2` Right Right `-t^-1/2` Right Right `)V(L_0` Right `)=0` | `t^{-1}V\left(L+\right)-tV\left(L-\right)-\left(t^{\frac{1}{2}}-t^{-\frac{1}{2}}\right)V\left(L_{0}\right)=0` |
| \(x'=F(x,\mu)\) (Fogelson) | `x'=F(x,\mu` `)` | `x'=F\left(x,\mu\right)` |
| \(\operatorname{tr}(DF(x,\mu))\) (Fogelson) | `\mathop`+Enter `tr` Right `(DF(x,\mu` `))` | `\mathop{tr}\left(DF\left(x,\mu\right)\right)` — upright `tr` |
| \(\lim_{t\to0}x(t)=x\) (Fogelson) | `lim` `_t->0` Right `x(t)=x` | `\lim_{t\to0}x\left(t\right)=x` |
| \(\Re\lambda_i(DF)\) (Fogelson, eigenvalues) | `\Re`+Enter `\lambda`+Enter `_i` Right `(DF)` | `\Re\lambda_{i}\left(DF\right)` |
| \(M_t:=f^{-1}((-\infty,t])\) (Fogelson, sublevel set) | `M_t` Right `:=f^-1` Right `((-\infty`+Enter `,t])` | `M_{t}:=f^{-1}\left(\left(-\infty,t\right]\right)` — `:=` literal works, or `\assign`+Enter |
| \(D^k\times D^{n-k}\) (Salkinder, handles) | `D^k` Right `\times`+Enter `D^n-k` | `D^{k}\times D^{n-k}` |
| \(\tilde{H_i}(S^n\setminus A)\) (Salkinder, homology) | `\tilde`+Enter `H_i` Right `(S^n` Right `\setminus`+Enter `A)` | `\tilde{H_{i}}\left(S^{n}\setminus A\right)` |
| \(\rho:G\to Aut(V)\) (Salkinder) | `\rho`+Enter `:G\to`+Enter `\mathop`+Enter `Aut` Right `(V)` | `\rho:G\to\mathop{Aut}\left(V\right)` — upright `Aut` via `\mathop` |
| \(w(L)=\sum_{c\in C}sgn(c)\) (Buller, writhe) | `w(L)=\sum`+Enter `c\in`+Enter `C` Right Right `sgn(c)` | `w\left(L\right)=\sum_{c\in C}^{ }sgn\left(c\right)` — typing `crossings` verbatim traps on `sin`; use `\text{crossings}` |
| \(x+y\equiv 2z \pmod{3}\) (Buller) | `x+y\equiv`+Enter `2z` `\pmod`+Enter `3` | `x+y\equiv2z\pmod{3}` — `\pmod`/`\bmod`/`\mod` all work |
