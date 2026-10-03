# Vendored dependencies

## mathquill/

Vendored copy of the Desmos fork of MathQuill
(`https://github.com/desmosinc/mathquill`).

- Pinned commit: `bb9974ab637e1dd57673fe8c96a00c85cfc3da37`
  (2026-08-07, "Merge pull request #358 from
  desmosinc/feature-detect-spacing-bug")
- License: MPL-2.0 (see `mathquill/README.md` / upstream headers)

### How the local patch is organized

Two new source files carry the additions that could live on their own;
every other local change is an inline edit tagged `// MATHCOMPILE:` —
grep that marker (plus the two new files) for the complete patch
surface. Markers like `// MATHCOMPILE: \boxed moved to
extraCommands.ts` sit where a command was extracted, so upstream's file
ordering is still readable at the cut sites.

New files:

- `src/commands/math/environments.ts` (last in `SOURCES_FULL`) —
  `CellGrid`/`MatrixCell` grid commands, a TypeScript port of
  Learnosity/mathquill's `matrix` branch (upstream PR
  mathquill/mathquill#762, jQuery-era) onto the jQuery-free internals
  here (`h()`, `domFrag()`, `DOMView`, `SVG_SYMBOLS` parens — no JS
  scaling needed). Provides the `matrix`/`pmatrix`/`bmatrix`/`Bmatrix`/
  `vmatrix`/`Vmatrix` environments via `\begin{env}…\end{env}` and as
  bare `\pmatrix{a&b\\c&d}` brace forms, `displaylines`
  (`\displaylines{a\\ b}`, the multi-line row model — a 1-column
  CellGrid), and `\derivative`, which expands via `writeLatex` to
  `\frac{d#1}{d#2}` (or `D(#1)` when `config({dIsDerivative:false})`)
  so the expansion is ordinary editable atoms.
- `src/commands/math/extraCommands.ts` (in `SOURCES_FULL` and
  `SOURCES_BASIC`) — every *pure addition* that used to be
  inline in `commands.ts`: new `LatexCmds`/`CharCmds` and their helper
  classes, grouped into banner sections — fonts (`\mathcal` `\mathscr`
  `\mathfrak` `\boldsymbol` …), boxes/colors/links (`\boxed` `\color`
  `\fcolorbox` `\href` …), under/over scripts and braces (`\underbrace`
  `\overset` `\stackrel` …), modular arithmetic (`\pmod` `\pod` `\bmod`
  `\mod`), boundless integral signs (`\iint` `\antid` `\oiint` `\oiiint`
  …), fractions (`\cfrac` `\tfrac` `\dbinom` `\tbinom` …), accents and
  diacritics, extensible arrows (`\xrightarrow` `\xmapsto` …), cancels,
  delimiters (`\langle` `\bra` `\big` `\middle` `\[` …), line
  breaks/layout (`\\` `\hline` `\smash` …), and misc large operators.
  Because these commands previously shipped inside `commands.ts` — part
  of `mathquill-basic` — `extraCommands.ts` is in `SOURCES_BASIC` too:
  anything added there may only reference symbols from `BASE_SOURCES` +
  `math.ts` + `basicSymbols.ts` + `commands.ts`.

Inline `// MATHCOMPILE:` edits, by file:

- `src/services/latex.ts` — control-sequence parsing carries an
  `isCommand` flag so `\<char>` escapes (`\{`, `\|`, `\;`) resolve to
  dedicated escape commands instead of shadowing the bare character;
  `\<char>` with no dedicated escape falls back to the bare char; an
  unknown `\command` parses as a verbatim leaf instead of failing the
  whole field.
- `src/commands/math.ts` — a control sequence missing its braces
  degrades to a verbatim leaf rather than blanking surrounding content;
  a no-block command (`\verb`, `\end`) no longer lands the caret inside
  a nonexistent child.
- `src/commands/math/basicSymbols.ts` — `autoCommands` accepts `''` to
  disable the list entirely (upstream's processor throws on empty
  strings — needed for the smartMode toggle); a letter run inside
  `\operatorname{…}`/`\mathrm{…}` is kept whole instead of re-scanned
  for built-in names, and `sign` serializes as `\operatorname{sign}`
  for SymPy; `\operatorname*` consumes the star (limits form);
  `\<char>` escape commands (`\,` `\:` `\;` `\!` `\{` `\}` `\|`) and
  other escaped specials (`\_` …) register on backslash-prefixed keys.
- `src/commands/math/commands.ts` — `\textcolor[model]{color}{…}` takes
  an optional color-model argument (parse + serialize); `\class`,
  `\right` and friends are parser-only (`createLeftOf` no-op) so typed
  insertion can't produce them; `h.entityText` renders `\sum`-style
  entity glyphs (upstream `h.text` printed the entity literally);
  `\limits`/`\nolimits` between an operator and its bounds is kept on
  the node and round-trips (`\sum\limits_{i}`); the typed `a\over b`
  numerator scan stops at a boundless integral like at `\sum`; a pasted
  `\over` that can't bind falls back to a visible leaf instead of
  blanking; an accent with no following block degrades to a standalone
  mark (`f\'` still parses); `\left.`/`\right.` null delimiters render
  as zero-width spans and `\|` works as a `\left/\right` delimiter;
  `Binomial`'s strict two-block parser is invoked directly in the
  `\choose` path.
- `src/commands/math/advancedSymbols.ts` — `\mathbb` gets a glyph table
  for the double-struck capitals plus `\Bbb`/`mathds` spellings;
  invisible style switches `\displaystyle` `\textstyle` `\scriptstyle`
  `\scriptscriptstyle` `\limits` `\nolimits` serialize their command
  verbatim; `\not<rel>` produces the negated relation glyph (`\not\in`
  → `∉`) with the negated-relation symbols registered to match;
  `\ring`/`\mathring`, `\lnot`, extra relation glyphs (`\nleq` …). The
  tail of the file is a "round-trip coverage" block — commands real
  LaTeX emits that previously failed parse: named spacing
  (`\enspace`/`thinspace`…), invisible blocks (`\hspace` `\phantom`),
  `\tag`/`\notag`/`\nonumber`, atom-type wrappers (`\mathord` …),
  text-mode accents (`\v` `\u` `\r` `\d` `\b` `\c`), font-selection
  commands (`\usefont` `\fontsize` `\fontfamily` …), and the TeX
  primitives/keywords as verbatim leaves.
- `src/commands/text.ts` — text-mode content tolerates nested braces
  (depth 3) and balanced braces round-trip raw so pasted
  `\textit{x_{2}}` survives; `\sf`/`\tt` accept the old-style
  declaration form (braced group or bare switch); `\mbox`.
- `src/commands/math/LatexCommandInput.ts` — an empty input ended by a
  non-letter resolves `\<char>` escapes (`\;` `\{` `\|` …) to their
  atoms instead of writing the raw character.
- `src/publicapi.ts` + `src/mathquill.d.ts` —
  `EditableField.insertLineBreak()` Enter semantics (matrix row inside
  a matrix cell, `\displaylines` row split, or wrap top-level content
  in `\displaylines`) and `dIsDerivative` on `v1.Config` typings.
- `src/css/math.less` — styles for the additions: `.mq-matrix`/
  `.mq-displaylines`, script fonts, boxes/braces/cancels/extensible
  arrows/delimiters, `\bra`/`\ket`, and the boundless-integral sibling
  supsub rules.
- `Makefile` — `extraCommands.ts` + `environments.ts` added to
  `SOURCES_FULL` (in that order: environments calls
  `boundlessIntegral()` from extraCommands) and `extraCommands.ts` to
  `SOURCES_BASIC`.

Boundless-integral note: `LatexCmds.iint`/`∬` and `LatexCmds.antid`
produce a leaf `MQSymbol` (bare ∫ glyph) instead of the
`SummationNotation` with mandatory bound blocks that `\int` keeps, so
the caret lands right of the sign and an indefinite integral
(`\iint x dx`) types linearly. Bounds come from ordinary `_`/`^`
SupSub on demand (or from parsing `\iint_{a}^{b}`), and `.mq-int`
sibling-supsub rules keep the bound styling. `\antid` is an insertion
alias: the app maps it to `\int` at compile time (CE has no `\antid`).

Coverage: `test/unit/environments.test.js` (mocha; run `make test` then
open `test/unit.html`, or run `npx playwright test e2e/vendor.spec.ts`
at the repo root to run the whole vendor suite headlessly).

### Rebuilding

```
cd vendor/mathquill
npm install   # devDeps only: less, typescript, uglify-js, mocha
make dev      # = font + css + js (unminified build/mathquill.js)
make basic    # build/mathquill-basic.js
make test     # build/mathquill.test.js for the mocha suite
```

Outputs land in `vendor/mathquill/build/` (`mathquill.js`, `mathquill.css`,
`fonts/`) and are committed so the app works without a rebuild.
