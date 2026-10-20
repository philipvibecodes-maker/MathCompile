# Custom functions in MathCompile

This file is the reference an AI agent needs to write a custom function
for a MathCompile user. It documents the *only* extension mechanism —
no builds, no forks: a function is a Python `def` (or `lambda`) written
in a worksheet cell, callable from math cells through a documented
call convention.

If you are an agent: produce worksheet cell contents (Python source for
a **Python cell**, LaTeX for **math cells**) the user can paste in.
Everything below is what the compiler actually implements — stay inside
these conventions and the result works on the Calculator and Python
targets immediately.

## The mechanism

- A worksheet is a top-to-bottom list of **cells**. Cells share one
  Python namespace, evaluated in order — anything defined in a cell is
  visible to every cell *below* it.
- A **Python cell** holds verbatim Python. Use `+ Python cell` (bottom
  of the sheet) or the palette command "Insert Python cell below".
- Top-level `def name(…)` and `name = lambda …` bindings in Python
  cells — and in `\python{…}` blocks inside math cells — are collected
  into a function registry. A call written in a math cell then routes
  to that definition instead of minting an abstract `sp.Function`.
- SymPy is available in every Python cell: `import sympy as sp` (or use
  names directly — the worksheet runs with SymPy's public names in
  scope, e.g. `Symbol`, `sin`, `Matrix`). Python cells may also
  `import` other installed packages.

## Calling a function from a math cell

Write the call as an **upright name applied in parentheses**:

```
\mathrm{relu}(x)        \mathrm{relu}(-3)
\mathrm{add}(a, b)      \mathrm{norm}\left(\begin{pmatrix}1\\2\end{pmatrix}\right)
```

- Multi-letter names register under their own name: `def relu` is
  callable as `\mathrm{relu}(x)`.
- **Single-letter names register only the upright form**: `def f(x)`
  is called `\mathrm{f}(x)`. A bare italic `f(x)` keeps reading as
  `f * x` (implicit multiplication), matching ordinary math notation.
- `\operatorname{name}(x)` reaches the same registry — both spellings
  work.
- The call must map cleanly onto the def's parameters. Each argument
  lands as one Python argument; `\mathrm{add}(a,b)` calls `add(a, b)`.
- A def used by a call sits in that cell's standalone Python output
  too (Python target): the source snippet is injected above the call,
  so exported scripts stay self-contained.

## Naming the call form: `# @latex` aliases

If the default `\mathrm{name}` spelling isn't the notation you want,
annotate the def — on its line or on comment lines directly above:

```python
# @latex \mathcal{F}
def my_func(x):
    return x**2

def g(x):  # @latex \tilde{g}
    return x
```

The annotation's LaTeX is parsed the same way a call site is; whatever
name it produces becomes an additional registry key. After the example
above, `\mathcal{F}(x)` and `\tilde{g}(x)` call `my_func` and `g`.

Rules the compiler enforces (each violation is flagged as a note on the
Python cell, so check the cell's output):

- The annotation must resolve to a **callable name** — `# @latex x + 1`
  is rejected ("doesn't resolve to a callable name").
- `name(x)` must expand to exactly `name` applied to `x`. Notations that
  rewrite into other forms can't be call names — e.g. `\pm(x)` parses
  as `Measurement(0, x)`, so `\pm` can never alias a def.
- Names already claimed by built-in behavior never reach your def:
  SymPy call names (`solve`, `Min`, `Trace`, …), matrix word-ops
  (`\mathrm{rref}`, `\mathrm{rank}`, …), and special-cased forms. Pick
  a different `# @latex` name — the note tells you when this happens.
- If two defs claim the same alias, the later def wins (noted).

## Ordering

Cells evaluate top to bottom in the Calculator target. A def **above**
its call evaluates; a call **above** its def still compiles (the
emitter trusts it) but is flagged: `"name" is defined in python cell N
— it must sit above this cell for the call to evaluate`. Put Python
cells defining functions near the top of the worksheet.

## Worked example

Python cell:

```python
# @latex \mathrm{conv}
def convolve(f, g, x):
    """Discrete convolution on samples f, g evaluated at x."""
    import sympy as sp
    k = sp.Symbol("k", integer=True)
    return sp.Sum(f.subs(x, k) * g.subs(x, x - k), (k, -sp.oo, sp.oo))
```

Math cell below it:

```
\mathrm{conv}(f, g, x)
```

## Pure notation: `\newcommand`

For notation that only *expands* to existing math (no new function
semantics), write a `\newcommand` cell instead:

```
\newcommand{\vv}[1]{\mathbf{#1}}
```

`\newcommand{\name}[n]{body}` defines a macro usable in later cells;
`\renewcommand` / `\providecommand` variants work too. Arguments are
referenced as `#1`…`#n` and called with braces: `\vv{u}`. Macros expand
before compilation, so they add *spelling*, not semantics — use a
Python def when the function needs behavior.

## Inline blocks: `\python{…}`

A math cell can interleave statements with verbatim Python:

```
y = 1 \\ \python{relu = lambda x: max(0, x)} \\ \mathrm{relu}(y)
```

`\python{…}` blocks exec in the same namespace and register defs the
same way Python cells do.

## Limits (what a custom function can't do)

- It can't add a new LaTeX *glyph* or editing behavior — `\vv{u}`-style
  macros and `# @latex` aliases are the whole notation surface.
- It can't change how other expressions compile — custom functions are
  call targets, not codegen rules.
- Results render through the standard pipeline (`clean_and_simplify`),
  so return ordinary SymPy/Python values.
