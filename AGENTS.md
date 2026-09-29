# MathCompile

Desmos-style multi-cell math expression editor. **SolidJS** + TypeScript +
Vite; cells are `<math-field>` elements backed by a **vendored Desmos
MathQuill** build (not MathLive). Rewritten from React on the
`rewrite/solidjs-mathquill` worktree branch; see `challenges.md` for the
rationale.

## Commands

- `npm run dev` — dev server (vite) on **:5473** (strict; chosen so this
  worktree can run alongside the main checkout's :5173 and the other
  rewrite worktrees' :5273/:5373)
- `npm run build` — `tsc -b` + vite build
- `npm run lint` — oxlint (vendor/ and dist/ excluded in .oxlintrc.json)
- `npm test` — vitest unit tests (`src/*.test.ts`, node environment)
- `npm run test:e2e` — Playwright tests (`e2e/`, reuses a running dev
  server on :5473 or starts `npm run dev`)

### Vendored MathQuill bootstrap

`vendor/mathquill/` is a copy of
`desmosinc/mathquill@bb9974ab` plus local patches (see `vendor/README.md`).
Its `build/` output is gitignored — after a fresh clone:

```
cd vendor/mathquill && npm ci && make dev
```

produces `build/mathquill.{js,css}` + fonts, which `src/editor/mathquill.ts`
imports as a side effect (IIFE sets `window.MathQuill`; the ambient types
come from `vendor/mathquill/src/mathquill.d.ts`, included via tsconfig).

Vendor patches live in `vendor/mathquill/src/commands/math/environments.ts`
(matrix/displaylines envs, `\derivative` template, `insertRowBreak`) plus
edits to `src/css/*.less`, `src/publicapi.ts`, `src/mathquill.d.ts`, and the
`Makefile` source list. Rebuild with `make dev` after touching them.

## Architecture

```
src/
  store.ts            app state (createStore for exprs) + field registry +
                      focusCell() — the single focus owner
  commands.ts         Command type + createCommands() memo
  editor/
    mathquill.ts      loads the vendored IIFE + CSS; exports MQ v3 + L
    adapter.ts        attachField(el, cb) -> FieldHandle; the ONLY module
                      that talks to MathQuill (config, handlers, __controller
                      caret peeks, host element API)
    mq.d.ts           ambient Window.MathQuill + the IIFE module decl
  components/
    MathFieldInput.tsx  <math-field> ref -> attachField; ~50 lines
    CommandPalette.tsx  always mounted, .open class toggles visibility
    OutputPanel.tsx     pure render of store signals
```

- All MathQuill contact lives in `src/editor/` — components see only
  `FieldHandle`/`FieldCallbacks`, so an engine upgrade breaks types in one
  file, not across components.
- Commands reach fields via `store.fields.get(id)?.method()` — never via
  prop deltas. `focusCell(id, edge)` is the single focus owner.
- `exprs` is a `createStore` array: `setExprs(i, 'latex', v)` mutates the
  proxy in place so `<For>` keeps row identity — replacing `{...e, latex}`
  objects would remount the field and lose the caret every keystroke.
- Solid renders synchronously: `addExpr` inserts the row and `focusCell` can
  focus it in the same tick (the new field self-focuses on mount too, via
  `focusedId() === id`).
- `let x` + `ref={(el) => (x = el)}` — the callback form so oxlint doesn't
  flag the (compile-time-assigned) `ref={x}` idiom.

## Command palette

- Ctrl/Cmd+K (or the header button) toggles `paletteOpen`; commands come
  from `src/commands.ts` and fuzzy-match via `src/fuzzy.ts`. The hotkey is
  registered in capture phase so it works inside `<math-field>`.
- The palette is **always mounted** (`.palette-backdrop.open` flips
  `visibility` + `pointer-events`; `.palette` has
  `contain: layout style paint`). Open cost is a class flip + `focus()`.
- Closing the palette refocuses the active cell via an `App` effect →
  `focusCell(focusedId())`.

## MathQuill notes

- Focus: MQ focuses an inner `<textarea>`; the `<math-field>` host carries
  `.mq-focused`. `document.activeElement === mathField` is NEVER true — test
  helpers use `host.contains(activeElement)` (see `e2e/helpers.ts`).
- The host is `tabindex=-1` and forwards `focus` events to the textarea —
  so both `el.focus()` and Playwright's CDP-level `DOM.focus` work.
- Multi-line cells use the `\displaylines{...}` env (vendor patch):
  plain `Enter` calls `mq.insertRowBreak()` which wraps top-level content
  and splits the row at the caret; nested atoms snap out first.
  `\displaylines{x\\y}` serializes with no space after `\\`.
- Enter semantics (all ours): inside a matrix cell → `addRow`; at top
  level → displaylines split; `Shift+Enter` → `onNewCell` (intercepted in
  a capture-phase keydown before MQ's textarea sees it).
- Matrices: `\begin{matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix}` parse,
  render as `.mq-matrix` tables, and support cell navigation, Enter=row,
  Shift+Space=column, and empty-cell/env collapse. Typing `\begin` + Enter
  drops a fresh 2x3 pmatrix.
- `derivative` is an `autoCommands` word + `\derivative` LatexCmd that
  expands to real `\frac{d}{dx}` atoms at insertion (caret in numerator) —
  no macro atom, no bake pass.
- `\int`/`\sum`/`\prod` are autoCommands inserting `{lower}^{upper}`
  templates with the caret in the lower bound; arrow traversal goes
  lower → upper → out in written order (the old `limitNavigation.ts` shim
  is gone).
- MQ has no placeholder atoms: empty template blocks serialize `{ }`.
  Also no suggestion popover, latex mode, or virtual keyboard — those
  MathLive states/tests are gone or rewritten.
- `Home`/`End` are block-local in MQ; `Ctrl-Home`/`Ctrl-End` hit the field
  edges. `Tab`/`Esc` move between blocks (Tab works — the MathLive Tab bug
  pinned in the old limits spec doesn't exist).
- `smartMode` maps to `autoSubscriptNumerals` + `sumStartsWithNEquals`
  (live via `mq.config`); also exposed as a `smartMode` property on the
  host element for e2e.
- `moveOutOf`/`upOutOf`/`downOutOf` MQ handlers feed `onMoveOut` for
  cross-cell navigation; `Shift+Arrow` extends selection in MQ and never
  fires those handlers.

## Testing notes

- Shared e2e probes live in `e2e/helpers.ts` (`cell`, `cellValue`,
  `waitFocusedIndex`, `focusCell`, `caretInfo`). `caretInfo` reads the
  rendered `.mq-cursor` element; `leftText` (rendered text left of the
  caret) replaces MathLive's `model.position`.
- The palette stays mounted: assert `.palette` hidden via
  `not.toBeVisible()`, not `toHaveCount(0)`.
- Serialization deltas vs MathLive pinned in tests: `\\` has no trailing
  space, `\frac{1}{2}` always braced, `x^{2}` braced, empty bounds `{ }`,
  no `\placeholder{}`, no `\differentialD` (`df/dx` → `\frac{df}{dx}`).

## Codegraph

This worktree has no `.codegraph/` index of its own (the main checkout has
one). Run `codegraph init` here if you want one.
