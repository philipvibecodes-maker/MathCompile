# MathCompile

Desmos-style multi-cell math expression editor. **SolidJS** + TypeScript +
Vite, cells are MathLive `<math-field>` elements. Rewritten from React on the
`solid-rewrite` worktree branch; see `challenges.md` for the rationale.

## Commands

- `npm run dev` — dev server (vite) on **:5273** (strict; chosen so this
  worktree can run alongside the main checkout's :5173)
- `npm run build` — `tsc -b` + vite build
- `npm run lint` — oxlint
- `npm test` — vitest unit tests (`src/*.test.ts`, `src/mathlive/*.test.ts`,
  node environment)
- `npm run test:e2e` — Playwright tests (`e2e/`, reuses a running dev
  server on :5273 or starts `npm run dev`)

## Architecture

```
src/
  store.ts            app state (createStore for exprs) + field registry +
                      focusCell() — the single focus owner
  commands.ts         Command type + createCommands() memo
  mathlive/
    adapter.ts        attachField(mf, cb) -> FieldHandle; the ONLY module that
                      imports mathlive, touches mf._mathfield, or reads the
                      suggestion popover's DOM
    limitNavigation.ts  pure caret reducer for \int/\sum limits (unit-tested)
  components/
    MathFieldInput.tsx  <math-field> ref -> attachField; ~50 lines
    CommandPalette.tsx  always mounted, .open class toggles visibility
    OutputPanel.tsx     pure render of store signals
```

- All private-API contact lives in `src/mathlive/` — a MathLive upgrade
  should break types in one file, not across components.
- Commands reach fields via `store.fields.get(id)?.method()` — never via
  prop deltas. `focusCell(id, edge)` replaces the old `focusNonce` prop.
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
- Any deferred focus call must re-check `paletteOpen()` inside the timeout:
  with the palette mounted, a stale `focus()` after close would steal focus
  back from a cell (the `focusout` trap and the 70ms re-assert both do this).
- Closing the palette refocuses the active cell via an `App` effect →
  `focusCell(focusedId())`.

## MathLive notes

- Multi-line cells use the `\displaylines{...}` ("lines") environment:
  `mf.executeCommand('addRowAfter')` wraps top-level content in it
  automatically and splits the row at the caret. A single-row `lines` env
  serializes without the `\displaylines{}` wrapper, so one-line cells keep
  clean LaTeX.
- `addRowAfter` silently no-ops when the caret is nested inside an atom
  (`\frac{1}{|2}`); the adapter's `insertLineBreak` snaps the caret to the
  row-level ancestor first.
- Internal `model.position`/`model.setSelection` writes don't re-render;
  move the caret through `mf.position`/`mf.selection` (see
  `src/mathlive/limitNavigation.ts` `applyCaret`). Reading via `model.at`,
  `model.offsetOf`, etc. is fine.
- `input` is dispatched deferred (`setTimeout`); `selection-change` fires
  synchronously — the lower-placeholder fix lives in `selection-change` so
  it lands before the next keystroke.
- ~60ms after a field is focused, MathLive's `onFocus` re-focuses its
  internal span via a deferred `keyboardDelegate.focus()` — it can steal
  focus from a modal opened right after editing a cell. The palette keeps a
  focusout trap + one 70ms re-assert as defense (this is inside MathLive and
  can't be removed while `<math-field>` is the editing surface).
- At top/bottom row dead ends MathLive emits a cancelable `move-out`
  CustomEvent (`detail.direction`: `upward`/`downward`/`forward`/`backward`)
  on the `<math-field>` host — used for cross-cell navigation.
- `derivative` is an **inline shortcut** (`mf.inlineShortcuts` in the
  adapter), inserting real `\frac{d#?}{dx}` atoms — there is no macro atom,
  no bake pass, and no `latex-expanded` canonicalization. The
  `d/dx means derivative` toggle is a semantic (compiler) option consumed
  by the future IR lowering; it never rewrites cell content.
- Built-in shorthand worth remembering: typing `dx` expands to
  `\differentialD x` (MathLive's default inline shortcut).

## Testing notes

- E2e cell-focus changes must use `focus()` + a settle wait (see
  `focusCell` in `e2e/cells.spec.ts`): MathLive's ~60ms deferred internal
  refocus steals focus back when switching cells too fast, so `click()`
  alone is racy.
- The palette stays mounted: assert `.palette` hidden via
  `not.toBeVisible()`, not `toHaveCount(0)`.
- Known bug, pinned as expected-fail in `e2e/limits.spec.ts`: Tab from the
  lower placeholder lands back on it (the lower-placeholder fix re-fires
  after Tab's navigation), so Tab cannot reach the upper bound.
- `caretInfo.where` in `e2e/limits.spec.ts` only works for msubsup limits
  (`\int`); `\sum` renders over/under — assert via what typing fills instead.
- `\sum`/`\int` templates serialize placeholders as `\placeholder{}`;
  multi-line cells serialize as `\displaylines{a\\ b}` (note the space);
  the `derivative` shortcut serializes as `\frac{d\placeholder{}}{dx}`.

## Codegraph

This worktree has no `.codegraph/` index of its own (the main checkout has
one). Run `codegraph init` here if you want one. MathLive can be indexed as
a **separate project** at `node_modules/mathlive/.codegraph` (query it via
`projectPath`) — `mathlive.mjs` exceeds the 1 MB file limit, so only
`types/*.d.ts` is indexed via `node_modules/mathlive/codegraph.json`
excludes. `npm install` wipes it; recreate with:

```
cat > node_modules/mathlive/codegraph.json <<'EOF'
{
  "exclude": ["mathlive.mjs", "mathlive.js", "mathlive.min.mjs",
              "mathlive.min.js", "mathlive-ssr.min.mjs", "vue-mathlive.mjs",
              "fonts/", "sounds/"]
}
EOF
codegraph init node_modules/mathlive
```
