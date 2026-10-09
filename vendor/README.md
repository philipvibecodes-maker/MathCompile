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
  so the expansion is ordinary editable atoms. Every environment is
  also reachable by a `\name` insertion shortcut (`\cases`, `\aligned`,
  `\gathered`…) that opens the same grid `\begin{name}` resolves to;
  spec-taking envs (`\array`, `\subarray`, `\tabular`, `\alignat`,
  `\alignedat` — and typed `\begin{<spec-env>}`) go through a pending
  `\begin{name}{arg}` input (`EnvSpecInput`) that applies the arg on
  `}`/Enter/Tab.
- `src/commands/math/extraCommands.ts` (in `SOURCES_FULL` and
  `SOURCES_BASIC`) — the additions that used to be
  inline in `commands.ts`: `LatexCmds`/`CharCmds` and their helper
  classes, grouped into banner sections — fonts (`\mathcal` `\mathscr`
  `\mathfrak` `\boldsymbol` …), boxes/colors/links (`\boxed` `\color`
  `\fcolorbox` `\href` …), under/over scripts and braces (`\underbrace`
  `\overset` `\stackrel` …), modular arithmetic (`\pmod` `\pod` `\bmod`
  `\mod`), boundless integral signs (`\iint` `\antid` `\oiint` `\oiiint`
  …), fractions (`\cfrac` `\tfrac` `\dbinom` `\tbinom` …), accents and
  diacritics, extensible arrows (`\xrightarrow` `\xmapsto` …), cancels,
  delimiters (`\langle` `\bra` `\big` `\middle` `\[` …), line
  breaks/layout (`\\` `\hline` `\smash` …), misc large operators,
  and `\lim` — a displaystyle operator whose `_{x\to a}` bound types
  and renders below the "lim" text (ported from unmerged upstream PR
  desmosinc/mathquill#252), reachable via `autoCommands` or `\lim`.
  One override also lives here: `LatexCmds.def` (extracted from
  `advancedSymbols.ts`, tagged at the cut site) — an insertion alias
  that expands to a real `\text{def}` TextBlock, which is the
  function-definition marker the app's compiler reads.
  Because these commands previously shipped inside `commands.ts` — part
  of `mathquill-basic` — `extraCommands.ts` is in `SOURCES_BASIC` too:
  anything added there may only reference symbols from `BASE_SOURCES` +
  `math.ts` + `basicSymbols.ts` + `commands.ts`.
- `src/commands/math/pythonBlock.ts` (in `SOURCES_FULL` between
  `extraCommands.ts` and `environments.ts` — it subclasses `TextBlock`
  from `text.ts`, which `SOURCES_BASIC` omits, and `environments.ts`'s
  line-break path references it) — `\python{ ... }`: a `TextBlock`
  subclass whose body is raw Python source, potentially multi-line,
  edited as plain text with none of MathQuill's math-key behavior
  (every character goes through `write`; Enter/Tab insert `\n`/`\t`;
  Up/Down move between source lines with a goal column; Home/End bound
  the current line; a real Enter is swallowed in `keystroke` so the
  keypress path never routes to `insertLineBreak`). The `\python{` and
  `}` delimiters are `::before`/`::after` pseudo content in CSS — the
  editable DOM stays a single text node, so TextBlock's fuse/seek/
  caret contract is untouched. Python syntax highlighting uses the CSS
  Custom Highlight API (`CSS.highlights` ranges over that text node —
  no DOM mutation, so nothing interferes with selection or deletion),
  refreshed on the `reflow` bubble; the `::highlight(mq-py-*)` rules
  live in `editable.less`, the block styles in `math.less`, and the
  dark-theme palette overrides in `src/index.css`. The body parser
  scans balanced braces honoring `\` escapes and consumes the rest of
  the stream when unclosed (same contract the app-side extractor
  `extractPythonBlocks` in `src/compile/ir.ts` mirrors); the
  serializer emits raw code when balanced, else braces/backslashes
  escaped.
- `src/services/undo.ts` (in `BASE_SOURCES` between `latex.ts` and
  `mouse.ts`) — Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y (and Cmd variants) undo
  history for editable fields: a snapshot stack of `{latex, caret
  path}` fed by the `'edit'` reflow signal (see controller.ts), with
  ~1s typing coalescing, burst-break on caret moves/selections, and
  suspend-and-rebase around programmatic `latex()` calls — loads and
  restores never become undo steps.

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
  numerator scan stops at a boundless integral like at `\sum`, and at
  `\lim` — `lim` is a real command now, not an operator name; a pasted
  `\over` that can't bind falls back to a visible leaf instead of
  blanking; an accent with no following block degrades to a standalone
  mark (`f\'` still parses); `\left.`/`\right.` null delimiters render
  as zero-width spans and `\|` works as a `\left/\right` delimiter;
  `Binomial`'s strict two-block parser is invoked directly in the
  `\choose` path.
- `src/commands/math/advancedSymbols.ts` — `\mathbb` gets a glyph table
  for the double-struck capitals plus `\Bbb`/`mathds` spellings; typed
  `\mathbb` opens a pending `\mathbb{arg}` input (`FontArgInput`, the
  arg-entry twin of `EnvSpecInput`) that resolves via `writeLatex` on
  `}`/Enter/Tab — before this its no-op `createLeftOf` deleted the typed
  command on the next key; `\mathcal` opens the same pending input so
  the typed command shows its literal `\mathcal{arg}` text like
  `\mathbb` (its builder returns a `Style` subclass whose `createLeftOf`
  opens the input; parse still lands the plain `Style`);
- `src/css/font.less` + `src/fonts/KaTeX_Caligraphic-Regular.woff2` —
  bundles the OFL-licensed KaTeX caligraphic face (maps A-Z to script
  shapes) and `@font-face`s it; `math.less`'s `.mq-caligraphic` uses it
  first in the stack and suppresses synthetic italic, since the old
  Lucida Calligraphy/Apple Chancery stack isn't installed anywhere and
  `\mathcal{P}` rendered as a plain italic P;
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
  atoms instead of writing the raw character; the `{` that opens a
  `\python` block is swallowed since it's the block's visible
  delimiter, not source text.
- `src/commands/math/basicSymbols.ts` — also: `lim` removed from the
  default `autoOperatorNames` list — `\lim` is a real command (see
  extraCommands.ts), so typed `lim` resolves through `autoCommands`.
- `src/publicapi.ts` + `src/mathquill.d.ts` —
  `EditableField.insertLineBreak()` Enter semantics (matrix row inside
  a matrix cell, `\displaylines` row split, or wrap top-level content
  in `\displaylines`) and `dIsDerivative`/`limStartsWithArrow` on
  `v1.Config` typings.
- `src/css/math.less` — styles for the additions: `.mq-matrix`/
  `.mq-displaylines` (with zero horizontal indent, plus negative
  `margin-top` and a `padding-top: 0` first row canceling
  border-spacing's top pad so line 1 doesn't shift at all when a
  second line is added), display-mode comma spacing
  (`.mq-comma` thin space after), script fonts, boxes/braces/cancels/
  extensible arrows/delimiters, `\bra`/`\ket`, the
  boundless-integral sibling supsub rules, and `.mq-limit` (the
  underscript stacks below "lim" via the `\sum`-style
  float-right/width:100% baseline trick). Also: the block holding the
  caret keeps the empty-slot box — always while it's empty
  (`.mq-hasCursor:has(> .mq-cursor:only-child)`, upstream strips
  `.mq-empty` on focus so `\mathrm{ }` collapsed to zero width and
  looked like a no-op), and once it has content only when the command
  renders no boundary around its input — font/text wrappers
  (`.mq-font`/`.mq-bf`/`.mq-text-mode`) versus scripts, fraction slots
  and roots, which show their structure. The root block, quiet
  delimiters and the `\`-command input keep their own chrome, and
  `<td>` blocks are environment grid cells (a `\displaylines` row),
  line-level rather than slots, and stay unboxed.
- `src/cursor.ts` — a `\displaylines` that fills the whole root owns
  the field edges: `insDirOf`/`insAtDirEnd` re-descend to the first
  line's start / last line's end instead of leaving the caret beside
  the vertically-centered block (`Cursor::rootEdgeEnd`, keyed off
  `DisplayLines.fillsRootEdge`). `Cursor::reanchorIfStranded`
  re-parks the caret at the root's left edge when its parent is
  detached or its links no longer line up — deleting a selection that
  covers a root-filling grid's cells used to strand the caret inside
  the disowned subtree (typing wrote nowhere); `deleteSelection`
  calls it directly.
- `src/tree.ts` — `createDir` calls `cursor.reanchorIfStranded()`
  before `adopt` so the same stranded-caret case can't trip
  `prayWellFormed` on inserts that replaced the selection via
  `replaceSelection`/`disown` instead of `deleteSelection`.
- `src/commands/math/advancedSymbols.ts` — also: `\mapsto` is a
  `bindBinaryOperator` (relation spacing like `\to`), not a
  `VanillaSymbol`.
- `src/commands/math/extraCommands.ts` — also: typed `:` is a
  `BinaryOperator` relation (`f : X → Y`), with `.mq-comma` styling
  covered in `math.less`.
- `src/commands/math/environments.ts` — `insertLineBreakAtCursor`
  inside a `\python` block inserts a `\n` into the source instead of
  splitting a `\displaylines` row (covers programmatic
  `typedText('\n')`/`insertLineBreak()`; real keypresses are swallowed
  by the block's own `keystroke`). Also: `MatrixCell` carries a
  `lineCell` flag marking grid cells as visual line containers for
  Home/End.
- `src/services/keystroke.ts` — "standard textbook" keys on multi-line
  cells: Home/End (and Shift-) go to the visual line edges — the
  innermost grid cell (`lineCell`) or the root block — instead of the
  innermost syntax block; Tab/Shift-Tab in the far-edge cell of a
  root-filling grid (`\displaylines`) falls through to the browser
  default like the root case, so the keys leave the field instead of
  trapping in the snap-back loop; `selectAll`/`selectToRootEndInDir`
  break their selectOutOf march when a step makes no progress — the
  root-edge snap used to make Ctrl+A cover only the last line and
  Ctrl-Shift-Home/End loop forever; Ctrl-Z/Ctrl-Shift-Z/Ctrl-Y (and
  Meta-) dispatch undo/redo to `services/undo.ts`.
- `src/controller.ts` — `handle('edit')` routes to
  `Controller::noteEdited` (the undo history's after-change signal);
  `suspendHistory` flag plus `noteEdited`/`rebaseHistory` no-op hooks
  on `ControllerBase`, overridden by the undo layer.
- `src/services/latex.ts` — `renderLatexMath` wraps itself in
  `suspendHistory` and calls `rebaseHistory()` afterward so every
  programmatic latex load (hydration, `mq.latex()`, undo/redo restore)
  silently rebases the history instead of recording a step.
- `src/services/mouse.ts` — `Controller_mouse extends Controller_undo`
  (the undo layer slots between `latex` and `mouse` in the service
  chain).
- `src/services/mouse.ts` + `src/cursor.ts` — `Controller_mouse.seek`
  stashes the click's clientY on the cursor (`cursor.seekClientY`) so
  seek implementations that hit-test rendered lines (`PythonBlock`'s
  `caretRangeFromPoint` path) can use it.
- `Makefile` — `extraCommands.ts` + `environments.ts` added to
  `SOURCES_FULL` (in that order: environments calls
  `boundlessIntegral()` from extraCommands), `pythonBlock.ts` between
  them (environments' line-break path references it),
  `extraCommands.ts` to `SOURCES_BASIC`, and `services/undo.ts` to
  `BASE_SOURCES` between `latex.ts` and `mouse.ts`.

Boundless-integral note: `LatexCmds.iint`/`∬` and `LatexCmds.antid`
produce a leaf `MQSymbol` (bare ∫ glyph) instead of the
`SummationNotation` with mandatory bound blocks that `\int` keeps, so
the caret lands right of the sign and an indefinite integral
(`\iint x dx`) types linearly. Bounds come from ordinary `_`/`^`
SupSub on demand (or from parsing `\iint_{a}^{b}`), and `.mq-int`
sibling-supsub rules keep the bound styling. `\antid` is an insertion
alias: the app maps it to `\int` at compile time (CE has no `\antid`).

Coverage: `test/unit/environments.test.js` and
`test/unit/undo.test.js` (mocha; run `make test` then open
`test/unit.html`, or run `npx playwright test e2e/vendor.spec.ts`
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
