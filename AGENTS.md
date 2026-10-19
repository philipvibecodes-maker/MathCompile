# MathCompile

Desmos-style multi-cell math expression editor. **Svelte 5 (runes)** +
TypeScript + Vite, cells are `<math-field>` custom elements backed by a
**vendored Desmos-fork MathQuill** (`vendor/mathquill`, see
`vendor/README.md` for the patch list). Each cell's LaTeX is compiled
through a MathJSON IR to LaTeX or SymPy-flavored Python (`src/compile/`).

## Commands

- `npm run dev` — dev server (vite) on **:5573** (strict; non-default so
  sibling checkouts or other dev servers can run alongside it)
- `npm run check` — `svelte-check --tsconfig ./tsconfig.app.json`
- `npm run build` — svelte-check + vite build
- `npm run lint` — oxlint (vendor/ is excluded in `.oxlintrc.json`)
- `npm test` — vitest unit tests (`src/**/*.test.ts`, node environment;
  `vitest.config.ts` loads the svelte plugin so `.svelte.ts` rune files
  compile in tests)
- `npm run test:e2e` — Playwright tests (`e2e/`, reuses a running dev
  server on :5573 or starts `npm run dev`). `vendor.spec.ts` runs the
  upstream mocha suite headlessly through the dev server (a fresh clone
  needs `npm ci` inside `vendor/mathquill` first: unit.html loads mocha
  from its node_modules, and the root install doesn't recurse into
  vendor/). MathQuill API + adapter checks are unit tests now —
  `src/editor/mq-*.test.ts` drive the vendored build headless via
  happy-dom (`// @vitest-environment happy-dom`, helpers in
  `src/editor/test-field.ts`); the former `e2e/spike.spec.ts` harness is
  gone.
- `npm run test:e2e:smoke` — the `@smoke`-tagged subset (~20 tests) for
  frequent runs: cell lifecycle, displaylines, adapter contract,
  matrices, limits, palette/focus ownership, codegen targets,
  persistence, worksheets, python cells, the branch badge. Deliberately
  excludes `calculator.spec.ts` (real Pyodide/SymPy — one shared boot
  serves the whole file, but the CDN pull still costs ~30s up front)
  and `vendor.spec.ts` (whole mocha suite); run the full suite before
  merging or after touching `vendor/`/`src/calc/`.
- `npm run test:perf` — framework-agnostic perf battery (`perf/`); builds and
  serves the production bundle on :4173. For another implementation: serve
  its prod build and run `PERF_BASE_URL=<url> PERF_LABEL=<name> npm run
  test:perf`; `node perf/compare.mjs <labelA> <labelB>` diffs runs in
  `perf-results/`.

## Architecture

```
src/
  App.svelte          worksheet UI: stacked cells (latex/python keep a
                      two-column layout under .two-col), header
  commands.ts         Command type + command list factory
  fuzzy.ts            palette search scoring (also the help search)
  help/topics.ts      "How do I…" catalog — one input per topic: the
                      `default` rows seed the pin set on first run, all
                      topics are searchable/pinnable/hidable, and most
                      carry an `insert` latex for mq.cmd
  state/
    store.svelte.ts   $state app store + field registry + focusCell() —
                      the single focus owner
    persistence.ts    all localStorage access, debounced cell writes
  compile/            pure-TS pipeline (no DOM): latex -> MathJSON IR -> code
    latex.ts            \displaylines unwrap + output/display helpers
    ir.ts               ce.parse + normalizeIR (MathJSON)
    codegen.ts          normalized IR -> SymPy Python (compileWorksheet,
                        compileCellForCalc for the calculator target)
    targets.ts          output-target registry
  calc/               calculator target: SymPy results per cell
    calculator.svelte.ts  evaluate()/interimEvaluate()/prewarm() +
                          calcEngine status rune
    calculator.worker.ts  Pyodide + SymPy in a classic worker; exec/evals
                          the emitted program (mc_run)
    result-latex.ts      output latex touch-ups (a-trig -> arc-)

    python-highlight.ts   tiny tokenizer for the generating-code block
  plot/               `\text{plot}` rendering
    types.ts          PlotData — kind/vars/label + plotly figure dict;
                        `interim` flags CE-sampled figures
    PlotView.svelte   row renderer: lazy plotly.js + EchartsPlot
                      overlay (interim figures and plotly download)
    EchartsPlot.svelte  echarts/echarts-gl canvas for the interim
                      window; owns init/setOption/dispose
    echarts.ts        lazy echarts+gl loader + PlotData->option
                      converter (echartsOption)
    theme.ts          plotly theme pass + shared light/dark palette
                      (plotPalette)
  editor/
    mathquill.ts      imports the vendored build + CSS; exports mq3 + types
    math-field.ts     <math-field> custom element: MQ handlers -> DOM
                      events (input, move-out, new-cell, delete-out)
    attach-field.ts   attachField() -> FieldHandle + FieldCallbacks —
                      the app-facing editing contract
    keymap.ts         capture-phase global keys (Ctrl+K, Ctrl+/)
  components/
    MathField.svelte    <math-field> bind:this -> attachField; registers
                        its handle in the store on mount
    CalcOutput.svelte   per-cell calculator output (interim -> real rows)
    CommandPalette.svelte  always mounted, .open class toggles visibility
    HelpSearch.svelte    centered help-search overlay (Ctrl+/); Enter
                        inserts the topic's `insert` latex via mq.cmd
                        (Shift+Enter pins instead) — same mount+focus
                        contract as the palette
```

- All MathQuill contact lives in `src/editor/` — components only see the
  `FieldHandle` contract (`focus(edge)`, `getValue`, `setValue`,
  `setSmartMode`, `dispose`).
- Commands reach fields via `fields.get(id)?.method()` — never via
  prop-encoded commands; `focusCell(id, edge)` is invoked directly.
- `{#each cells (c.id)}` keeps row identity — keys must stay stable so
  typing doesn't remount the field and lose the caret.
- `MathField.svelte` self-focuses on mount when `focusedId === id`
  (Svelte batches the DOM insert, so `focusCell` can't reach a field that
  isn't mounted yet — the mount-self-focus pattern covers that window).
- `state/store.svelte.ts` uses runes — importing it requires the svelte
  compiler; in vitest that's wired via the svelte plugin in
  `vitest.config.ts`.


## Design decisions

The architecture's load-bearing choices, distilled:

- **One adapter owns the editor.** All MathQuill contact lives in
  `src/editor/`; everything else sees only the `FieldHandle` contract,
  so an upstream bump fails inside `src/editor/`, not across event
  handlers.
- **One focus owner.** The store's field registry + `focusCell()` decide
  what is focused; nothing else calls `.focus()` and no component may
  steal focus back — deferred focus calls re-check `paletteOpen` first.
- **Semantics in the compiler, not the editor.** Options like
  `dIsDerivative` apply at insertion/`src/compile/` lowering; cell
  content is never rewritten to fit a setting.
- **Overlays designed for cold-open.** The palette is always mounted
  (`visibility` flip + `contain`), so opening costs a class flip, not a
  mount + layout.
- **The e2e contract is DOM-only.** Specs pin `math-field`/`.cell-latex`/
  `.palette` DOM behavior, never internals — the framework or editor can
  be swapped without rewriting the suite.

Accepted costs: ~600 lines of vendored environments patch to maintain,
`Home`/`End` are block-local (field edges need `Ctrl+Home`/`Ctrl+End`),
and empty blocks serialize as `{ }`.

## Calculator target

- `target === 'calculator'` renders `CalcOutput` per cell: Compute
  Engine interim rows (dimmed, no `code`) until the Pyodide/SymPy
  worker is ready, then one result row per top-level statement.
- `\text{plot}` rows carry `row.plot` (PlotData): the interim samples
  through CE's `compile()` on the worker's grids and is drawn by
  ECharts until the worker's plotly-python figure lands — see
  `src/plot/` and CALCULATOR-ENGINES.md. ℝ²→ℝ² (`kind: '2x2'`) is one
  figure with a `field`/`image` updatemenu — quiver arrows vs the
  image of the domain's grid lines.
- The worksheet prefix compiles via `compileCellsForCalc` — the shared
  pipeline, not a second parser — so the worker only exec/evals Python.
  Cells share one namespace in order (a `def g` or `a = 5` above is in
  scope below). Assignments/defs carry a `display` expression
  (`a = 5` -> `Eq(a, 5)`).
- Two engines run the same program through the same `mc_run` runtime
  (`src/calc/mc_runtime.py`, worker-loads it via `?raw`): the Pyodide
  worker in a browser, or `desktop/calc_backend.py`'s PythonSafeEval
  (nsjail/docker) sandbox under the pywebview shell — the frontend picks
  the backend when `window.pywebview.api` is injected.
- See CALCULATOR-ENGINES.md for the engine protocol, interim coverage,
  and earned gotchas.

## Command palette

- Ctrl/Cmd+K (or the header button) toggles `paletteOpen`; commands come
  from `src/commands.ts` and fuzzy-match via `src/fuzzy.ts`. The hotkey is
  registered in capture phase so it works inside `<math-field>`.
- The palette is **always mounted** (`.palette-backdrop.open` flips
  `visibility` + `pointer-events`; `.palette` has
  `contain: layout style paint`). Open cost is a class flip + `focus()`.
- Any deferred focus call must re-check `paletteOpen` inside the timeout:
  with the palette mounted, a stale `focus()` after close would steal
  focus back from a cell (the `focusout` trap and the 70ms re-assert both
  do this).
- Closing the palette refocuses the active cell via
  `focusCell(focusedId)`.

## MathQuill notes

- Multi-line cells use `\displaylines{...}` from the vendored
  environments patch: `mq.insertLineBreak()` wraps top-level content
  automatically and splits the row at the row-level ancestor (a nested
  `\frac{1}{|2}` stays whole — the caret snaps out to the atom first).
- Enter semantics live in the adapter: a real Enter arrives via
  `typedText('\n')` → MQ's `enter` handler → `insertLineBreak()`; inside
  an open `LatexCommandInput` (`\frac…`), Enter is consumed by MQ's
  keystroke dispatch and *accepts* the command instead. Shift+Enter never
  reaches MQ — the element's capture-phase keydown cancels it and emits
  `new-cell`.
- `move-out` events (`upward`/`downward`/`forward`/`backward`,
  `detail.selecting`) come from MQ's `upOutOf`/`downOutOf`/`moveOutOf`/
  `selectOutOf`; `attachField` only hops cells on vertical edges and
  ignores selection extensions.
- Backspace/Delete in a cell holding only a blank line (`''` or a lone
  `\displaylines{ }` row) is intercepted in `attachField`'s
  capture-phase keydown and deletes the cell via `deleteFocused()` —
  MQ never sees the keypress. Ctrl/Cmd/Alt-modified deletes pass
  through to MQ.
- `<math-field>` carries `tabindex="-1"` and forwards host `focus` events
  into MQ's hidden textarea — plain `element.focus()`/`locator.focus()`
  work, and `document.activeElement` inside a field is the textarea
  (assert focus with `el.contains(document.activeElement)` or
  `.mq-focused`, not `activeElement === el`).
- MQ has **no deferred internal refocus** — `click()` alone is reliable
  in e2e; no settle window needed.
- `Home`/`End` (and Shift-) move within the *current line* — the
  innermost `\displaylines` row / matrix cell, or the whole field when
  single-line; field edges need `Ctrl+Home`/`Ctrl+End` (or
  `mq.moveToLeftEnd()`). Tab/Shift-Tab at the field's last/first line
  leave the field (browser default), and Ctrl+Z/Ctrl+Shift+Z are the
  vendored undo history (`vendor/mathquill/src/services/undo.ts`).
- Theming: `data-theme` on `<html>` (`light`|`dark`) swaps the CSS vars
  in `index.css` (`--muted`, `--faint`, `--accent-text`, `--selected-bg`,
  …) — never hardcode colors, and scope vendored-MathQuill fixes under
  `:root[data-theme='dark']`. The choice persists in
  `localStorage['mathcompile-theme']`; `index.html` sets `data-theme`
  pre-paint, `App.svelte`'s `$effect` keeps it synced with
  `appStore.darkMode`.
- Smart mode maps to `autoCommands` + `autoSubscriptNumerals` config.
  The vendored patch extends `autoCommands` to accept `''` = off
  (upstream's processor throws on empty strings — no way to disable).
- `\derivative` (typed via the latex command input, or `mq.cmd`) expands
  at insertion time to real `\frac{d }{d }` atoms — or `D( )` when
  `dIsDerivative` is off — with the caret in the denominator/parens.
  There is no macro atom and no bake/canonicalize pass.
- `\def` is an insertion alias for `\text{def} ` (block + trailing
  space) — the statement marker
  `src/compile/ir.ts` reads as the function-definition prefix
  (`\text{def} g(x) = 2x` → `def g(x): return 2*x`); a bare `f(x)` is
  `f * x`, not a call or signature.
- `\solve`, `\dsolve`/`\ode`, `\pdesolve`/`\pde` are the same kind of
  insertion alias for the `\text{solve}`/`\text{dsolve}`/`\text{pdesolve}`
  solver statement markers — a cell statement that opens with one
  compiles to `sp.solve`/`sp.solveset`, `sp.dsolve`, or `sp.pdsolve`
  (see SYMBOLS.md "Solver statements").
- `\tr` is an insertion alias for `\mathrm{tr}` — the matrix-trace
  word-op codegen lowers to `(A).trace()` / `sp.Trace(A)`.
- `\operatorname{…}` is a real one-block group (a `mq-roman mq-font`
  wrapper, like `\mathrm`) — typed `\operatorname{f}` types into the
  arg block and round-trips. Interior letters stay one upright word:
  autoCommands/autoParenthesize are skipped and `autoUnItalicize` marks
  the run without splitting it into built-ins (`\operatorname{argmin}`
  stays `argmin`, unlike `\mathrm{argmin}` → `\mathrm{\arg\min}`).
  The group wears `mq-operatorname`; `math.less` gives it LaTeX
  `\mathop` spacing (thin space each side, dropped at block edges and
  before/after binary ops, summation signs — `.mq-large-operator` and
  `.mq-int`, not `.mq-boundless-int` — and before real brackets; a
  following `.mq-supsub` carries the right-hand space, like
  `mq-after-operator-name`). `.mq-binomial` marks `\binom` so it isn't
  mistaken for a real bracket. A caret sitting at a block edge next to
  the group keeps the space (the caret is the "next atom" — the next
  char lands in the gap instead of the gap popping in), while a truly
  last-child node drops it, so rendered output gets no trailing space.
- Matrices: `\begin{matrix|pmatrix|…}` environments + bare
  `\pmatrix{a&b\\c&d}`. Typed `\name` shortcuts (`\cases`, `\aligned`,
  `\gathered`, …) open the same grid `\begin{name}` resolves to;
  spec-taking envs (`\array`, `\subarray`, `\tabular`, `\alignat`,
  `\alignedat` — and typed `\begin{<spec-env>}`) first open a pending
  `\begin{name}{arg}` input that applies the arg on `}`/Enter/Tab.
  Typed matrix-family commands defer to a rows/columns menu
  (`src/editor/matrix-menu.ts` via the vendored `matrixDimensionsMenu`
  option — Enter inserts the grid, Escape cancels); `\cases` and the
  non-matrix grids skip it. Inside a matrix cell, Enter adds a row and
  Shift+Space adds a column; Ctrl+Shift+Backspace deletes the current
  row and Ctrl+Shift+Delete deletes the current column (each a no-op
  once only one remains) — those keys keep their usual word-delete
  everywhere else, including \displaylines cells;
  arrows move cell-to-cell without leaving
  the field. `I_n` (capital I, whole-number subscript) compiles to
  `sp.eye(n)` and takes matrix-op paths like a literal; an explicit
  `I_n = …` binding wins.
- Serializations to pin in tests: empty blocks are `{ }` (with a space);
  `\int_{ }^{ }` writes sub before sup and lands the caret in the lower
  bound (definite form); `\iint`/`\antid` are boundless leaves —
  `iint`/`antid` insert just the sign (indefinite) with the caret at
  baseline right of it, and typed `_`/`^` grow an ordinary SupSub
  sibling (`\iint_{a}^{b}`), which autoSubscriptNumerals treats like
  `x_1` (a lone `_{a}` is arrow-skippable at baseline, and Backspace
  deletes a bound wholesale before descending); `\antid` is an
  insertion alias — `src/compile/ir.ts` maps it to `\int` before
  `ce.parse` (CE has no `\antid`); `x^2` serializes `x^{2}`;
  `\displaylines{x\\ y}` puts a space after `\\` before binary
  operators like `+`.

## Testing notes

- While iterating, run the e2e spec(s) covering the area you changed —
  `npx playwright test e2e/<area>.spec.ts` reuses or starts the dev
  server on :5573. `@smoke` is a sanity floor, not coverage of your
  diff: matrices → `matrix` + `matrix-menu`; codegen/output → `output`
  (+ `npm test`); calc target → `calculator` (real Pyodide/SymPy — the
  shared page boots it once per run, ~40s total); vendored MathQuill → `npm test` (`src/editor/mq-*.test.ts`) +
  `vendor`; focus/palette →
  `palette` + `escape` + `autocomplete`; storage → `persistence` +
  `worksheets`; editing keys → `cells` + `standard-keys` + `limits` +
  `empty-slot`. Run the full `npm run test:e2e` before merging.
- **Every spec shares one page per file.** `test.beforeAll` boots it via
  `sharedPage(browser, testInfo)` (which raises the hook's budget to
  90s — the `goto` re-pays the module waterfall); `test.beforeEach`
  calls `resetApp(page)` instead of `page.goto('/')`. Tests take
  `async () =>` and close over `page` — do NOT destructure
  `({ page })`, which would grab a second fixture page. The reset runs
  through the dev-only `window.__mc` hook (`src/main.ts`; eliminated
  from prod builds): it drains the debounced cell write, clears
  localStorage, restores every store field to first-run defaults
  (prefs, help pins, overlays, theme, workbook down to one
  'Worksheet 1'), then `clearAll()` leaves a single blank focused cell.
  Rules earned the hard way:
  - Tests needing a real fresh boot `page.reload()` in the body —
    persistence/reload behavior is unchanged, just warm.
  - Tests needing the *seeded* first-run cell use `reloadToSeed(page)`:
    it flushes the pending write BEFORE clearing storage, because
    `installFlushOnHide`'s pagehide handler would otherwise re-seed the
    workbook mid-reload and hide the seed path.
  - **Never `page.addInitScript`** on the shared page — init scripts
    stay armed for the page's lifetime and leak into every later
    reload. One-shot state seeds go through `page.evaluate` + `reload`.
  - resetApp also calls `__mc.resetLastPointerDown()`: tests run
    back-to-back in ~100ms, so a click from the PREVIOUS test can
    still be inside `pointerRecentlyDown()`'s 300ms window when the
    next test's `blur()` runs — the focusout guards would read it as
    a click-away and skip the Vimium refocus. Module-level time state
    like this is the other class of shared-page leak; reset it in the
    hook, don't sleep in tests.
  - Calculator/python-cell engine tests keep the worker warm across
    tests on the same page — a `page.reload()` kills it, so the two
    cold-boot calculator tests and the final reload test sit at the
    file edges (see the spec's ordering comment).
- Timeouts are tight on purpose: the global test timeout is 10s (most
  tests run <2s on the shared page; a stuck page dies fast instead of
  spinning). Real-engine tests raise their own ceiling with
  `test.setTimeout` (120s) and long `expect` timeouts only on the
  cold-boot path — a `timeout: 90_000` inside a test without
  `setTimeout` is dead code, the 10s cap wins first. `workers: 2`
  (override with `PW_WORKERS`) keeps Chromium + Pyodide memory off the
  swap ceiling; the suite ran ~2min there.
- `PW_PREVIEW=1` runs the suite against the production bundle instead
  of dev modules (`vite build && vite preview`): page boots drop to
  static files and the suite ran ~1.2min. The build bakes
  `VITE_BRANCH_BADGE=1` (badge test) and `VITE_E2E_HOOK=1` (the
  `window.__mc` reset hook — dev builds get it free via
  `import.meta.env.DEV`). `vendor.spec.ts` self-skips (the mocha page
  isn't in `dist/`), and `reuseExistingServer` is forced off so a stale
  `dist/` can't masquerade as the current code.
- The header shows a `.branch-badge` chip with the checked-out git
  branch on `vite dev` (so it appears in e2e runs and screenshots).
  `vite.config.ts` bakes `__APP_BRANCH__` via `define` only for
  dev-server mode (`command === 'serve' && !isPreview`); production
  builds get `''` and the chip never renders. `VITE_BRANCH_BADGE=1` opts
  a `vite build`/`preview` in for test deployments. Detached HEAD falls
  back to the short sha; the value is read once at server start, so a
  branch switch needs a dev-server restart to refresh it. Declared in
  `src/vite-env.d.ts`.
- Worktrees: `PW_PORT=<n> npx playwright test` runs the suite against a
  dev server the runner starts on that port (`vite --port <n>`), so a
  worktree's e2e doesn't clobber or reuse the main checkout's :5573.
- `caretInfo` in `e2e/limits.spec.ts` reads `.mq-cursor` ancestors:
  `\int` uses `.mq-sub`/`.mq-sup`; `\sum` (over/under) uses
  `.mq-from`/`.mq-to`; `.mq-large-operator`/`.mq-int` is the atom; on
  boundless signs (`\iint`/`\antid`) the bounds are a sibling
  `.mq-supsub` in the field, not children of the atom.
- Focus assertions use `el.contains(document.activeElement)` (MQ's
  hidden textarea), not `activeElement === el`.
- The palette stays mounted: assert `.palette` hidden via
  `not.toBeVisible()`, not `toHaveCount(0)`.
- Test keyboard UX with **Vimium installed**: it captures keys on
  `window` (capture phase) and its insert-mode `Escape` does
  `activeElement.blur()` + `stopImmediatePropagation` — the page never
  sees the keydown, only a pointer-less blur to nowhere
  (`relatedTarget === null`, no `pointerdown`). `attach-field`'s
  focusout guard refocuses the cell on that signature; don't break it
  (`e2e/autocomplete.spec.ts` simulates it with `.blur()`). To test
  with the real extension, launch headed Chromium with
  `--load-extension=<vimium checkout>` (see
  `e2e/autocomplete.spec.ts` comment / `pointerRecentlyDown`).
- Vendor internals are verified by the headless MQ unit suite
  (`src/editor/mq-*.test.ts`, driven via `src/editor/test-field.ts`) and
  `e2e/vendor.spec.ts` (headless mocha suite, includes
  `test/unit/environments.test.js`).
- The `perf/` suite measures in-page: capture-phase `event.timeStamp` at
  input -> DOM-outcome `waitForFunction` -> double rAF (`perf/measure.ts`).
  Selectors live in `perf/contract.ts` — the same DOM contract the e2e suite
  pins — so results stay comparable across rewrites. Serial runs only
  (`workers: 1`); never measure against the dev server.

## Persistence

- `src/state/persistence.ts` owns all `localStorage` access: `mathcompile-theme`
  (read pre-paint by `index.html`), `mathcompile-worksheets` (the workbook:
  `{version, active, sheets:[{id, name, cells}]}`, one record per worksheet),
  `mathcompile-prefs` (smartMode + target + guideOpen + pinnedHelp +
  hiddenHelp). `mathcompile-cells`
  was the single-worksheet format — `loadWorkbook()` migrates it on first
  read, then removes the key. Everything is node-guarded so
  the store stays importable in vitest.
- Writes are **debounced ~300ms** (`persistCells`, into the active sheet's
  record) and flushed on `pagehide`/`visibilitychange:hidden` and before
  every worksheet structural op (switch/create/rename/delete/import) — the
  keystroke path never calls `setItem` synchronously. The store triggers
  writes from its mutating methods (`setLatex`, `addCell`, `removeCell`,
  `clearAll`), not an `$effect`.
- Hydration is synchronous in the `AppStore` field initializers:
  `initWorkbook()` restores the active sheet's cells and bumps `nextId`
  past `maxId` (imports remap their cell ids instead);
  `MathField.svelte`'s existing mount-time `setValue(cell.latex)` does
  the field hydration for free. Corrupt/missing data falls back to the
  seeded example cell; a stored sheet with no cells opens as one blank cell.
- The header worksheet menu (`WorksheetMenu.svelte`) switches, renames,
  and deletes sheets and moves them through files —
  `src/state/worksheet-file.ts` serializes a sheet to a downloadable
  `.mathcompile.json` and parses files back (`Open from file` — in the
  header menu and the command palette — imports as a new sheet named
  after the file, `foo.mathcompile.json` → `foo`).
- E2e caveat: a mid-test `localStorage.clear()` is undone by the
  pagehide flush if a write is still pending — wait for
  `mathcompile-worksheets` to land first (see `e2e/cells.spec.ts`).

## Rebuilding the vendor bundle

```
cd vendor/mathquill
npm install   # devDeps only (less, typescript, uglify-js, mocha)
make dev      # font + css + js -> build/ (committed)
```

## Deployment

GitHub Pages via `.github/workflows/deploy.yml` (push to `main` → build →
`actions/deploy-pages`). The workflow sets `BASE_PATH=/<repo-name>/` so the
bundle is emitted under the Pages subpath; `vite.config.ts` defaults `base`
to `/` when `BASE_PATH` is unset, so dev/e2e/perf are unaffected. Requires
repo Settings → Pages → Source = "GitHub Actions".

## Codegraph

Use CodeGraph ([`@colbymchenry/codegraph`](https://www.npmjs.com/package/@colbymchenry/codegraph))
for code navigation before falling back to grep: who calls a symbol, what it
calls, and how an area fits together.

- MCP tool, when configured: `codegraph_explore`.
- CLI: `codegraph callers <symbol>`, `codegraph callees <symbol>`,
  `codegraph node <symbol>` (source + caller/callee trail),
  `codegraph explore <query...>`, `codegraph impact <symbol>`.
- Not installed? `npx -y @colbymchenry/codegraph <command>` works too.

`.codegraph/` is git-ignored and machine-local. `codegraph init` builds the
index for this checkout (about 5 s); `codegraph sync` refreshes it after edits.

For Devin Local/CLI: this repo commits `.devin/mcp_config.json` (the
`codegraph` server — `codegraph serve --mcp`, project root taken from the
client's `rootUri`) and allows `mcp__codegraph__*` in `.devin/config.json`,
so no per-call approval prompt. Personal overrides go in
`.devin/mcp_config.local.json` / `.devin/config.local.json` (gitignored by
Devin's convention, though `config.local.json` is currently tracked here).
