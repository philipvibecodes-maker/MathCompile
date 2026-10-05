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
