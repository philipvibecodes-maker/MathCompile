# Using MathCompile

MathCompile is a worksheet of math cells. Type math on the left, and the
output column on the right gives you the result in the format you pick:
LaTeX source, computed answers, or SymPy Python code. It runs entirely in
your browser and saves your worksheet automatically.

## The worksheet at a glance

- **Cells** are numbered rows. Click a cell to edit it; the up and down
  arrow keys move between cells when the caret reaches an edge.
  **+ Add expression** appends a cell, and **×** deletes one. Pressing
  Backspace in a cell that holds only blank space deletes it too.
- **The output column** shows whatever the current output target
  produces for each cell. Drag the divider between the columns to
  resize it.
- **The header** holds Smart mode, the Output target picker, the
  dark-mode toggle, and the Commands button (or press `Ctrl+K` /
  `⌘K`).
- **How do I…**, under the cell list, is a quick keystroke cheat sheet.
  This document is the long version.

The command palette (`Ctrl+K`) covers: insert an expression below,
duplicate the current one, delete it, clear all expressions, toggle
Smart mode and dark mode, switch the output target, and jump to any
cell by number.

## Typing math

### Smart mode (the default)

With Smart mode on — the checkbox in the header — you rarely need a
backslash. Whole words convert to symbols as you type, and a digit
right after a letter becomes a subscript:

| Type | Get |
| --- | --- |
| `int` | \(\int\) with upper and lower bound blocks |
| `iint` or `antid` | a bare \(\int\) for indefinite integrals |
| `sum`, `prod` | \(\sum\), \(\prod\) with bound blocks |
| `sqrt` | \(\sqrt{\phantom{x}}\) |
| `pi`, `theta`, `infty` | \(\pi\), \(\theta\), \(\infty\) |
| `derivative` | \(\frac{d}{d}\) — caret lands in the denominator |
| `def` | the function-definition marker (see *Output*) |
| `x2` | \(x_2\) |

Operator names like `sin`, `lim`, and `det` stay upright and space
correctly without any command.

### LaTeX commands

Type `\` followed by a command name — `\frac`, `\sqrt`, `\int`,
`\alpha` — and press **Enter** or **Space** to accept it. As you type,
a suggestion menu lists matching commands; the arrow keys highlight and
Enter accepts the highlight, or just keep typing to filter. `Esc`
dismisses the menu. Word-runs of two or more letters suggest too
(`sq` offers `\sqrt`).

`Ctrl+Space` opens the searchable symbol picker: type to filter, Enter
inserts, `Esc` closes.

Unicode characters insert directly — typing `α`, `≤`, `∫`, `∀` just
works.

### Common things you'll type

| You want | Type |
| --- | --- |
| Fraction | `1/2`, or `\frac` then fill the blocks |
| Subscript / superscript | `_`, `^` (or `x2` in Smart mode) |
| Square / nth root | `sqrt`, or `\nthroot` |
| Sum / product with bounds | `sum` or `prod`, then `_` and `^` |
| Definite integral | `int`, then `_` and `^` |
| Indefinite integral | `iint` or `antid` — add bounds later with `_` |
| Limit | `\lim`, then `_` for \(x\to0\) |
| Binomial coefficient | `\binom` |
| Matrix | `\pmatrix` — Enter adds a row, `Shift+Space` a column |
| Piecewise | `\cases` |
| Greek letters | `\alpha`, `\beta`, … or `pi`, `theta`, `infty` |
| Text inside math | `\text{…}` |
| Accents | `\dot`, `\ddot`, `\bar`, `\hat`, `\vec`, `\tilde` |
| Sets | `\in`, `\notin`, `\subseteq`, `\cup`, `\cap`, `\emptyset`, `\mathbb{R}` |
| Relations | `\leq`, `\geq`, `\neq`, `\approx`, `\pm` |
| Arrows | `\to`, `\Rightarrow`, `\Leftrightarrow` |
| Calculus | `\partial`, `\nabla`, `\infty`, `\prime` |
| Logic | `\forall`, `\exists`, `\therefore`, `\land`, `\lor`, `\lnot` |

`SYMBOLS.md` in the repository lists every command the editor accepts.

### Getting in and out of blocks

Commands like `\frac` open placeholder blocks, and the caret stays
inside the block you're filling. Everything you type lands there —
including `+`, `=`, and spaces. To move on:

- **Right** or **Tab** steps out of the current block.
- `(` `[` `{` insert closed pairs with the caret inside; typing the
  closer again hops over it. `\langle` pairs with `\rangle`.
- Backspace clears the block you're in before it removes the command
  that owns it.

### Multi-line cells and cells

**Enter** starts a new line inside the same cell (useful for aligned
derivations); **Shift+Enter** starts a whole new cell. While a
`\command` input is still open, Enter accepts the command instead of
breaking a line.

### Linear algebra

Environments open two ways: type `\name` directly (the shortcut) or
`\begin{name}` the long way. In the table, each entry shows the
shortcut and what a `a,b / c,d` grid renders as.

#### Matrices

| Type | Renders |
| --- | --- |
| `\pmatrix` | \(\begin{pmatrix} a & b \\ c & d \end{pmatrix}\) |
| `\bmatrix` | \(\begin{bmatrix} a & b \\ c & d \end{bmatrix}\) |
| `\Bmatrix` | \(\begin{Bmatrix} a & b \\ c & d \end{Bmatrix}\) |
| `\vmatrix` | \(\begin{vmatrix} a & b \\ c & d \end{vmatrix}\) |
| `\Vmatrix` | \(\begin{Vmatrix} a & b \\ c & d \end{Vmatrix}\) |
| `\matrix` | \(\begin{matrix} a & b \\ c & d \end{matrix}\) |
| `\smallmatrix` | \(\begin{smallmatrix} a & b \\ c & d \end{smallmatrix}\) |

Inside a matrix grid: **Enter** adds a row, **Shift+Space** adds a
column, and the arrow keys walk cell to cell. `&` separates columns
and `\\` ends a row in the stored LaTeX. The bare forms
`\pmatrix{a&b\\c&d}` and friends also work — one brace argument, no
`\begin`.

#### Matrix operations

`det` is an upright name (works with or without Smart mode); the rest
of the ops go through `\mathrm{name}` — the compiler reads upright
names as functions, so these become real matrix methods in the
Calculator and Python targets. A name that isn't built in, like
`\rank`, types as plain `\text{rank}` — not an operator.

| Operation | Type | Renders |
| --- | --- | --- |
| Determinant | `det` then the matrix | \(\det A\) |
| Trace | `\mathrm{trace}` (or `\mathrm{tr}`) | \(\mathrm{trace}(A)\) |
| Rank | `\mathrm{rank}` | \(\mathrm{rank}(A)\) |
| Inverse | `A^{-1}` or `\mathrm{inverse}` | \(A^{-1}\) |
| Transpose | `A^{\mathrm{T}}` or `\mathrm{transpose}` | \(A^{\mathrm{T}}\) |
| Norm | `\lVert` (auto-pairs) | \(\lVert A \rVert\) |
| Eigenvalues | `\mathrm{eigenvals}` | \(\mathrm{eigenvals}(A)\) |
| Eigenvectors | `\mathrm{eigenvects}` | \(\mathrm{eigenvects}(A)\) |
| Kernel / null space | `\ker` | \(\ker A\) |

### Multi-line equations

| Type | Renders |
| --- | --- |
| `\gathered` | \(\begin{gathered} x + y = 1 \\ x - y = 3 \end{gathered}\) |
| `\aligned` | \(\begin{aligned} x &= y \\ a &= b \end{aligned}\) |
| `\cases` | \(\begin{cases} x^2 & x > 0 \\ 0 & x \le 0 \end{cases}\) |

Aliases open the same grid: `\gather`, `\equation`, `\multline`, and
`\flalign` all open a centered stack like `\gathered`; `\align` and
`\split` open an aligned grid. `\begin{…}` additionally accepts
`eqnarray` and `eqalign` (also aligned grids) — those two have no
`\name` shortcut. Rows and cells edit like matrices: Enter adds a
row, `&` separates columns.

### Custom grids

Grids that take a column spec or a count open a pending `{ }` block
when you type the `\name` — enter the argument (`cc`, `l|r`, `2`)
and press `}`, `Enter`, or `Tab` to apply it.

| Type | Renders |
| --- | --- |
| `\array{lr}` | \(\begin{array}{lr} a & b \\ cc & d \end{array}\) |
| `\tabular{ll}` | a spec'd grid like `\array`, for text content |
| `\subarray{c}` | \(\begin{subarray}{c} a \\ b \end{subarray}\) |
| `\alignat{2}` / `\alignedat{2}` | \(\begin{alignedat}{2} x &= y &\;\;& u = v \\ a &= b &\;\;& c = d \end{alignedat}\) |
| `\substack` | \(\substack{a \\ b}\) |

### Set theory

The named sets are single-letter commands — `\R`, `\N`, `\Z`, `\Q`,
`\C`, `\P`, `\H`. Spelling out `\mathbb{R}` doesn't resolve as a
command; use the letter.

| Type | Renders |
| --- | --- |
| `\R` (same pattern for `\N` `\Z` `\Q` `\C` `\P` `\H`) | \(\mathbb{R}\) |
| `\Z` then `_n` | \(\mathbb{Z}_{n}\) |
| `x` `\in` `A`, `\notin` | \(x \in A\), \(x \notin A\) |
| `\cup` `\cap` `\setminus` | \(A \cup B\), \(A \cap B\), \(A \setminus B\) |
| `\subset` `\subseteq` `\nsubseteq` | \(A \subset B\), \(A \subseteq B\), \(A \nsubseteq B\) |
| `\emptyset` or `\varnothing` | \(\varnothing\) |
| `\{1,2,3\}` | \(\{1, 2, 3\}\) — braces auto-pair |
| `\{ x \in \R \mid x > 0 \}` | \(\{x \in \mathbb{R} \mid x > 0\}\) |
| `\bigcup` `\bigcap`, then `_{i=1}^{n}` | \(\bigcup_{i=1}^{n} A_i\), \(\bigcap_{i=1}^{n} A_i\) |
| `(a,b)`, `[a,b)`, `[a,b]` | \((a,b)\), \([a,b)\), \([a,b]\) — parens/brackets auto-pair |

These compile to real SymPy sets: `x \in \mathbb{R}` puts `real=True`
on `x`'s symbol (likewise `\Z` → integer, `\Q` → rational, `\C` →
complex), `\cup` / `\cap` / `\setminus` become `Union` /
`Intersection` / `Complement`, `\{1,2,3\}` a `FiniteSet`,
`\{x \mid p(x)\}` a `ConditionSet`, and
`\{f(x) \mid x \in D\}` an `ImageSet`. `A \subseteq B` needs concrete
sets on both sides — SymPy can't name an unknown set, so bare symbols
get an `!` error note.

### Logic

| Type | Renders |
| --- | --- |
| `\land` `\lor` `\neg` | \(p \land q\), \(p \lor q\), \(\neg p\) |
| `\implies` `\iff` | \(p \implies q\), \(p \iff q\) |
| `\forall` `\exists` | \(\forall x \in S\), \(\exists x \in S\) |
| `\vdash` `\models` | \(T \vdash p\), \(M \models p\) |
| `\top` `\bot` | \(\top\), \(\bot\) |
| `\therefore` `\because` | \(\therefore\), \(\because\) |

Connectives lower to `And` / `Or` / `Not` / `Implies` / `Equivalent`.
A quantifier over a concrete set folds elementwise (`\forall x \in
\{1,2,3\}` becomes an `And` over the elements); SymPy has no general
quantifiers, so an abstract `\forall` is flagged rather than computed.

### Calculus

`\int`, `\sum`, and `\prod` come with `_`/`^` bound blocks already
made — type the bound, then `Right` or `Tab` to the next block. A
typed `_`/`^` inside a bound nests a block instead of moving.
`\lim` has no pre-made bound: type `_{x \to 0}` yourself.

| Type | Renders |
| --- | --- |
| `\int`, bounds `0` then `1`, `x^2` `Right` `dx` | \(\int_{0}^{1} x^2\,dx\) |
| `\antid` | \(\int f\,dx\) — indefinite (adds \(+C\) in the calculator) |
| `\iint` `\iiint` | \(\iint\), \(\iiint\) — boundless signs |
| `\oint` `\oiint` | \(\oint\), \(\oiint\) — closed integrals |
| `\frac{d}{dx}` or `\derivative` | \(\frac{dy}{dx}\) |
| `f'`, `f''`, `f^{(n)}` | \(f'(x)\), \(f''(x)\), \(f^{(n)}(x)\) |
| `\sum` then `k=1` `Right` `n`; `\prod` same | \(\sum_{k=1}^{n} a_k\), \(\prod_{k=1}^{n} a_k\) |
| `\lim` then `_{x \to 0}`; one-sided `0^{+}` | \(\lim_{x \to 0} f(x)\), \(\lim_{x \to 0^{+}} f(x)\) |
| `lim`, `limsup`, `liminf` | \(\lim\), \(\limsup\), \(\liminf\) — upright operator names |
| `\infty` | \(\infty\) |

Integrals, derivatives, sums, products, and limits all compile to the
real SymPy calls — `integrate`, `diff`, `Sum`/`Product`, `limit`
(one-sided included).

### Multivariable calculus

| Type | Renders |
| --- | --- |
| `\partial` | \(\partial\) |
| `\frac{\partial u}{\partial t}` | \(\frac{\partial u}{\partial t}\) |
| `\partial_` `x` then `u` | \(\partial_{x} u\) — reads as the same partial derivative |
| `\iint`, `\iiint`, then `f` `dx dy` | \(\iint f\,dx\,dy\), \(\iiint f\,dx\,dy\,dz\) |
| `\oiint` | \(\oiint\) — closed surface integral |
| `\nabla` | \(\nabla f\), \(\nabla^{2} u\) |
| `\Delta` | \(\Delta u\) |
| `\vec{v}` | \(\vec{v}\) |

`\partial_{x}u` compiles to the partial derivative like the `\frac`
form. `\nabla` and `\Delta` are display notation — the compiler reads
`\nabla` as an ordinary symbol, so `\nabla f` stays symbolic rather
than becoming a gradient call.

### Topology

| Type | Renders |
| --- | --- |
| `f : X` `\to` `Y` | \(f : X \to Y\) — a continuous map |
| `\mapsto` | \(x \mapsto x^2\) |
| `\cong` | \(X \cong Y\) — homeomorphic |
| `\times` | \(X \times Y\) — product |
| `\bar{A}` or `\overline{A}` | \(\overline{A}\) — closure |
| `\partial` `A` | \(\partial A\) — boundary |
| `A^{\circ}` | \(A^{\circ}\) — interior |
| `A'` | \(A'\) — complement |
| `(a,b)`, `[a,b)` | \((a,b)\), \([a,b)\) — open/half-open sets |
| `\varepsilon` `\delta` | \(\varepsilon\), \(\delta\) |

Topology rows are notation — unions, intersections, closures, and
maps display but carry no topological semantics. One exception to
know: `\cong` is read by the compiler as modular congruence
(`x \cong b \pmod m` → `Eq(Mod(x, m), b)`), not isomorphism.

### Complex analysis

| Type | Renders |
| --- | --- |
| `\C` | \(\mathbb{C}\) |
| `\Re` `\Im` | \(\Re z\), \(\Im z\) |
| `\arg` | \(\arg z\) |
| `\bar{z}` or `\overline{z}` | \(\overline{z}\) — conjugate |
| `\|z\|` | \(\lvert z \rvert\) — modulus; `\|` auto-pairs |
| `e^{i\theta}` | \(e^{i\theta}\) |
| `\oint` | \(\oint_{\gamma} f(z)\,dz\) — contour integral |
| `\wp` `\ell` | \(\wp\), \(\ell\) |

`\Re`, `\Im`, `\arg`, and `\overline{z}` compile to `re`, `im`,
`arg`, and `conjugate`; `i` is the imaginary unit.

### Abstract algebra

| Type | Renders |
| --- | --- |
| `\Z` then `_n` | \(\mathbb{Z}_{n}\) — integers mod n |
| `\langle a \rangle` | \(\langle a \rangle\) — generated subgroup; auto-pairs |
| `\times` `\oplus` `\otimes` | \(G \times H\), \(G \oplus H\), \(G \otimes H\) |
| `\circ` | \(f \circ g\) — composition |
| `\star` | \(a \ast b\) — generic operation |
| `\ker` `\phi` | \(\ker \phi\) — kernel of a map |
| `\|G\|` | \(\lvert G \rvert\) — order |
| `\trianglelefteq` | \(N \trianglelefteq G\) — normal subgroup |
| `G/H` | \(G/H\) — quotient |
| `\mathfrak{g}` | \(\mathfrak{g}\) — Lie algebra |
| `x \equiv b \pmod{m}` | \(x \equiv b \pmod{m}\) |

The modular form compiles: `x \equiv b \pmod{m}` lowers to
`Eq(Mod(x, m), b)`. Group notation (`\langle`, `\circ`, `\star`,
`\trianglelefteq`) is display-level — infix symbols, no algebraic
structure attached.

### Differential equations

| Type | Renders |
| --- | --- |
| `y'`, `y''` | \(y'\), \(y''\) |
| `\dot{x}` `\ddot{x}` | \(\dot{x}\), \(\ddot{x}\) — time derivatives |
| `f^{(n)}(x)` | \(f^{(n)}(x)\) — nth derivative |
| `\frac{dy}{dx}` | \(\frac{dy}{dx}\) |
| `\text{def} y(t)` | declares `y` a function of `t` |
| `\mathcal{L}` | \(\mathcal{L}\{f\}\) — Laplace transform notation |

Declaring `\text{def} y(t)` marks `y` as a dependent variable, so
`y'`, `y''`, and `y^{(n)}` emit real `Derivative`/`diff` calls in
`t`. Dotted names read as functions of `t` on their own — `\dot{x}`
is `x(t)` differentiated once. `\mathcal{L}` is notation only.

### Partial differential equations

| Type | Renders |
| --- | --- |
| `\frac{\partial u}{\partial t}` | \(\frac{\partial u}{\partial t}\) |
| `\partial_` `t` then `u` | \(\partial_{t} u\) — same operator, shorter |
| `\nabla^{2}` `u` or `\Delta` `u` | \(\nabla^{2} u\), \(\Delta u\) — Laplacian |
| `\nabla` `\cdot` / `\nabla` `\times` | \(\nabla \cdot \vec{F}\), \(\nabla \times \vec{F}\) |
| `u_t`, `u_{xx}` | \(u_{t}\), \(u_{xx}\) — subscript notation |
| `\infty` | \(\infty\) — conditions at infinity |

`\partial_{t}u` compiles to the partial derivative, like the `\frac`
form. The `\nabla`, `\Delta`, divergence, and curl spellings are
display notation — no vector-calculus semantics behind them.

### Combinatorics

| Type | Renders |
| --- | --- |
| `\binom{n}{k}` | \(\binom{n}{k}\) — `binomial(n, k)` |
| `n!`, `n!!` | \(n!\), \(n!!\) — factorial / double factorial |
| `\lfloor x \rfloor`, `\lceil x \rceil` | \(\lfloor x \rfloor\), \(\lceil x \rceil\) |
| `\sum` / `\prod` with bounds | \(\sum_{k=0}^{n}\), \(\prod_{k=1}^{n}\) |
| `\Gamma(z)` | \(\Gamma(z)\) — `gamma(z)` |
| `\mathrm{totient}(n)` | \(\mathrm{totient}(n)\) — Euler's totient |
| `\dots` `\cdots` | \(1, 2, \dots, n\) |

`\binom`, `!`/`!!`, floors, ceilings, and `\Gamma` compile to the
matching SymPy calls. Other number-theory words work like `totient`
via `\mathrm{name}` — `mobius`, `nextprime`, `factorint` — as long
as the name is a plain word.

## Output targets

Pick a target from the **Output** menu in the header.

### LaTeX

The output column shows each cell's serialized LaTeX; **Copy** puts it
on the clipboard.

### Calculator

Each cell evaluates through SymPy — a real computer-algebra system that
runs in the page as WebAssembly. It takes a while to download and boot;
until the engine is ready, results come from a lightweight JavaScript
engine and are dimmed and marked *estimate*. The chip at the top shows
engine status.

- Each statement in a cell gets a result row; `≈` adds a decimal
  approximation when one exists.
- `!` marks a statement that failed, `i` a note; hover for the message.
- **Show generating code** reveals the exact Python program that
  produced the results, with a copy button.
- The **Settings** menu (calculator and Python targets) exposes
  display plumbing and animation timing — default values are fine.

### Python

The output column shows the SymPy program MathCompile generates per
cell, syntax-highlighted. **Copy** grabs one cell's lines; **Copy
script** grabs the whole worksheet as one runnable program. The
`import *` checkbox controls the import style. Statements the compiler
can't express appear as `!`/`i` notes under the code.

One rule to know: write `\text{def} f(x) = 2x` (type `def` in Smart
mode) to define a function — the generated code is `def f(x): return
2*x`. A bare `f(x)` is read as multiplication, `f * x`.

## Keyboard reference

| Key | What it does |
| --- | --- |
| `Enter` | new line in the cell; accepts an open `\command`; adds a row in a matrix |
| `Shift+Enter` | new cell below |
| `Right`, `Tab` | step out of the current block |
| `Esc` | dismiss the autocomplete menu or picker; returns focus to the field |
| `Ctrl+Space` | open the symbol picker |
| `Ctrl+K` / `⌘K` | command palette |
| `Shift+Space` | new column inside a matrix |
| `↑`, `↓` | move between cells at field edges |
| `Home`, `End` | block edges (`Ctrl+Home`/`Ctrl+End` for the whole field) |
| `Backspace` on a blank cell | delete the cell |

## Saving

The worksheet, theme, Smart mode, and target choice persist in your
browser's local storage — there's nothing to click. Clearing the
site's data resets everything.

---

*Repository docs: `README.md` (build/run), `SYMBOLS.md` (command
inventory), `AGENTS.md` (architecture), `CALCULATOR-ENGINES.md`
(calculator internals).*
