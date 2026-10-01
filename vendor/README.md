# Vendored dependencies

## mathquill/

Vendored copy of the Desmos fork of MathQuill
(`https://github.com/desmosinc/mathquill`).

- Pinned commit: `bb9974ab637e1dd57673fe8c96a00c85cfc3da37`
  (2026-08-07, "Merge pull request #358 from
  desmosinc/feature-detect-spacing-bug")
- License: MPL-2.0 (see `mathquill/README.md` / upstream headers)

### Local patches on top of upstream

`src/commands/math/environments.ts` (new file, appended to
`SOURCES_FULL` in the Makefile):

- `CellGrid`/`MatrixCell` — grid commands, a TypeScript port of
  Learnosity/mathquill's `matrix` branch (upstream PR
  mathquill/mathquill#762, jQuery-era) onto the jQuery-free internals
  here (`h()`, `domFrag()`, `DOMView`, `SVG_SYMBOLS` parens — no JS
  scaling needed).
- Environments: `matrix`, `pmatrix`, `bmatrix`, `Bmatrix`, `vmatrix`,
  `Vmatrix` via `\begin{env}…\end{env}`, and the same names as bare
  `LatexCmds` parsing `\pmatrix{a&b\\c&d}` brace form.
- `displaylines` (`\displaylines{a\\ b}`, also as an environment) — the
  multi-line row model; a 1-column CellGrid.
- `LatexCmds.derivative` — expands to `\frac{d#1}{d#2}` (default) or
  `D(#1)` when `config({dIsDerivative:false})`, via `writeLatex` so the
  expansion is ordinary editable atoms.
- `EditableField.insertLineBreak()` (added in `src/publicapi.ts`) —
  Enter semantics: add a row inside a matrix cell, split a
  `\displaylines` row, or wrap top-level content in `\displaylines`.
- `mathquill.d.ts`: `insertLineBreak()` on `EditableMathQuill` and
  `dIsDerivative` on `v1.Config`.
- `src/css/math.less`: `.mq-matrix` / `.mq-displaylines` rules.
- `src/commands/math/basicSymbols.ts`: the `autoCommands` option
  processor accepts `''` (empty dict — disables auto-commands) so the
  app's smartMode toggle can turn it back off; upstream had no way to
  clear the list once set.
- `src/commands/math/commands.ts` + `src/css/math.less`: boundless
  `\iint`/`\antid` signs — `LatexCmds.iint`/`∬` produce a leaf `MQSymbol`
  (`\iint `, double-integral glyph) and `LatexCmds.antid` one for
  `\antid ` (single-integral glyph), instead of the `SummationNotation`
  with mandatory bound blocks that `\int` uses, so the caret lands
  right of the sign and an indefinite integral (`\antid x dx`) types
  linearly. Bounds come from ordinary `_`/`^` SupSub on demand (or from
  parsing `\iint_{a}^{b}`), and `.mq-int` sibling-supsub rules keep the
  bound styling. `\antid` is an insertion alias: the app maps it to
  `\int` at compile time (CE has no `\antid`).

Coverage: `test/unit/environments.test.js` (mocha; run `make test` then
open `test/unit.html`, or run `npx playwright test e2e/vendor.spec.ts`
at the repo root to run the whole vendor suite headlessly).

### Rebuilding

```
cd vendor/mathquill
npm install   # devDeps only: less, typescript, uglify-js, mocha
make dev      # = font + css + js (unminified build/mathquill.js)
```

Outputs land in `vendor/mathquill/build/` (`mathquill.js`, `mathquill.css`,
`fonts/`) and are committed so the app works without a rebuild.
