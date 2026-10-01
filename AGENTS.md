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
  server on :5573 or starts `npm run dev`). Includes `spike.spec.ts`
  (MathQuill API + adapter checks via `e2e/spike.html`) and
  `vendor.spec.ts` (the upstream mocha suite run headlessly through the
  dev server).
- `npm run test:perf` — framework-agnostic perf battery (`perf/`); builds and
  serves the production bundle on :4173. For another implementation: serve
  its prod build and run `PERF_BASE_URL=<url> PERF_LABEL=<name> npm run
  test:perf`; `node perf/compare.mjs <labelA> <labelB>` diffs runs in
  `perf-results/`.

## Architecture

```
src/
  App.svelte          worksheet UI: cell list, output column, header
  commands.ts         Command type + command list factory
  fuzzy.ts            palette search scoring
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
    nerdamer-latex.ts     latex -> nerdamer calls (interim engine)
    python-highlight.ts   tiny tokenizer for the Show code block
  editor/
    mathquill.ts      imports the vendored build + CSS; exports mq3 + types
    math-field.ts     <math-field> custom element + attachField() ->
                      FieldHandle; the ONLY module that touches MQ
    keymap.ts         capture-phase global keys (Ctrl+K, Alt+S)
  components/
    MathField.svelte    <math-field> bind:this -> attachField; registers
                        its handle in the store on mount
    CalcOutput.svelte   per-cell calculator output (interim -> real rows)
    CommandPalette.svelte  always mounted, .open class toggles visibility
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
  so an upstream bump fails in one file, not across event handlers.
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

- `target === 'calculator'` renders `CalcOutput` per cell: nerdamer
  interim rows (dimmed, no `code`) until the Pyodide/SymPy worker is
  ready, then one result row per top-level statement.
- The cell compiles via `compileCellForCalc` — the shared pipeline, not
  a second parser — so the worker only exec/evals Python. Assignments/
  defs carry a `display` expression (`a = 5` -> `Eq(a, 5)`).
- See CALCULATOR-ENGINES.md for the engine protocol, nerdamer coverage,
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
- `<math-field>` carries `tabindex="-1"` and forwards host `focus` events
  into MQ's hidden textarea — plain `element.focus()`/`locator.focus()`
  work, and `document.activeElement` inside a field is the textarea
  (assert focus with `el.contains(document.activeElement)` or
  `.mq-focused`, not `activeElement === el`).
- MQ has **no deferred internal refocus** — `click()` alone is reliable
  in e2e; no settle window needed.
- `Home`/`End` move within the *current block*; field edges need
  `Ctrl+Home`/`Ctrl+End` (or `mq.moveToLeftEnd()`).
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
- Matrices: `\begin{matrix|pmatrix|…}` environments + bare
  `\pmatrix{a&b\\c&d}`. Inside a matrix cell, Enter adds a row and
  Shift+Space adds a column; arrows move cell-to-cell without leaving
  the field.
- Serializations to pin in tests: empty blocks are `{ }` (with a space);
  `\int_{ }^{ }` writes sub before sup and lands the caret in the lower
  bound; `x^2` serializes `x^{2}`; `\displaylines{x\\ y}` puts a space
  after `\\` before binary operators like `+`.

## Testing notes

- `caretInfo` in `e2e/limits.spec.ts` reads `.mq-cursor` ancestors:
  `\int` uses `.mq-sub`/`.mq-sup`; `\sum` (over/under) uses
  `.mq-from`/`.mq-to`; `.mq-large-operator`/`.mq-int` is the atom.
- Focus assertions use `el.contains(document.activeElement)` (MQ's
  hidden textarea), not `activeElement === el`.
- The palette stays mounted: assert `.palette` hidden via
  `not.toBeVisible()`, not `toHaveCount(0)`.
- Vendor internals are verified by `e2e/spike.spec.ts` (via
  `/e2e/spike.html`'s `window.spike` handles) and `e2e/vendor.spec.ts`
  (headless mocha suite, includes `test/unit/environments.test.js`).
- The `perf/` suite measures in-page: capture-phase `event.timeStamp` at
  input -> DOM-outcome `waitForFunction` -> double rAF (`perf/measure.ts`).
  Selectors live in `perf/contract.ts` — the same DOM contract the e2e suite
  pins — so results stay comparable across rewrites. Serial runs only
  (`workers: 1`); never measure against the dev server.

## Persistence

- `src/state/persistence.ts` owns all `localStorage` access: `mathcompile-theme`
  (read pre-paint by `index.html`), `mathcompile-cells` (the worksheet),
  `mathcompile-prefs` (smartMode + target + guideOpen). Everything is node-guarded so
  the store stays importable in vitest.
- Writes are **debounced ~300ms** (`persistCells`) and flushed on
  `pagehide`/`visibilitychange:hidden` — the keystroke path never calls
  `setItem` synchronously. The store triggers writes from its mutating
  methods (`setLatex`, `addCell`, `removeCell`, `clearAll`), not an
  `$effect`.
- Hydration is synchronous in the `AppStore` field initializers:
  `initCells()` restores cells and bumps `nextId` past `maxId`;
  `MathField.svelte`'s existing mount-time `setValue(cell.latex)` does
  the field hydration for free. Corrupt/missing data falls back to the
  seeded example cell.
- E2e caveat: a mid-test `localStorage.clear()` is undone by the
  pagehide flush if a write is still pending — wait for
  `mathcompile-cells` to land first (see `e2e/cells.spec.ts`).

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

`.codegraph/` is git-ignored and machine-local. Run `codegraph init` to
build an index for this checkout.
