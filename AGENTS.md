# MathCompile

Desmos-style multi-cell math expression editor. **Svelte 5 (runes)** +
TypeScript + Vite, cells are MathLive `<math-field>` elements. Rewritten
from React on the `svelte-rewrite` worktree branch; see `challenges.md` for
the rationale.

## Commands

- `npm run dev` — dev server (vite) on **:5373** (strict; chosen so this
  worktree can run alongside the main checkout's :5173 and the Solid
  sibling's :5273)
- `npm run check` — `svelte-check --tsconfig ./tsconfig.app.json`
- `npm run build` — svelte-check + vite build
- `npm run lint` — oxlint
- `npm test` — vitest unit tests (`src/*.test.ts`, `src/mathlive/*.test.ts`,
  node environment; `vitest.config.ts` loads the svelte plugin so
  `.svelte.ts` rune files compile in tests)
- `npm run test:e2e` — Playwright tests (`e2e/`, reuses a running dev
  server on :5373 or starts `npm run dev`)

## Architecture

```
src/
  appState.svelte.ts  $state app store + field registry + focusCell() —
                      the single focus owner
  commands.ts         Command type + command list factory
  mathlive/
    adapter.ts        attachField(mf, cb) -> FieldHandle; the ONLY module
                      that imports mathlive, touches mf._mathfield, or
                      reads the suggestion popover's DOM
    intents.ts        pure reduceKeydown(key, snapshot) -> Intent for
                      arrows / Backspace / Enter / Tab
    limitNavigation.ts  pure caret reducers for \int/\sum limits +
                      nextPlaceholderAction (unit-tested)
  components/
    MathField.svelte    <math-field> bind:this -> attachField; registers
                        its handle in the store on mount
    CommandPalette.svelte  always mounted, .open class toggles visibility
    OutputPanel.svelte    pure render of store state
```

- All private-API contact lives in `src/mathlive/` — a MathLive upgrade
  should break types in one file, not across components.
- Commands reach fields via `fields.get(id)?.method()` — never via prop
  deltas. `focusCell(id, edge)` replaces the old React `focusNonce` prop.
- `{#each cells (c.id)}` keeps row identity — keys must stay stable so
  typing doesn't remount the field and lose the caret.
- `MathField.svelte` self-focuses on mount when `focusedId === id`
  (Svelte batches the DOM insert, so `focusCell` can't reach a field that
  isn't mounted yet — the mount-self-focus pattern covers that window).
- `appState.svelte.ts` uses runes — importing it requires the svelte
  compiler; in vitest that's wired via the svelte plugin in
  `vitest.config.ts`.

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

## MathLive notes

- Multi-line cells use the `\displaylines{...}` ("lines") environment:
  `mf.executeCommand('addRowAfter')` wraps top-level content in it
  automatically and splits the row at the caret. A single-row `lines` env
  serializes without the `\displaylines{}` wrapper, so one-line cells keep
  clean LaTeX.
- `addRowAfter` silently no-ops when the caret is nested inside an atom
  (`\frac{1}{|2}`); the adapter snaps the caret to the row-level ancestor
  first.
- Internal `model.position`/`model.setSelection` writes don't re-render;
  move the caret through `mf.position`/`mf.selection` (see
  `src/mathlive/limitNavigation.ts` `applyCaret`). Reading via
  `model.at`, `model.offsetOf`, etc. is fine.
- `input` is dispatched deferred (`setTimeout`); `selection-change` fires
  synchronously — the lower-placeholder fix lives in `selection-change`
  so it lands before the next keystroke.
- ~60ms after a field is focused, MathLive's `onFocus` re-focuses its
  internal span via a deferred `keyboardDelegate.focus()` — it can steal
  focus from a modal opened right after editing a cell. The palette keeps
  a focusout trap + one 70ms re-assert as defense (this is inside MathLive
  and can't be removed while `<math-field>` is the editing surface).
- At top/bottom row dead ends MathLive emits a cancelable `move-out`
  CustomEvent (`detail.direction`: `upward`/`downward`/`forward`/
  `backward`) on the `<math-field>` host — used for cross-cell navigation.
- `derivative` is an **inline shortcut** (`mf.inlineShortcuts` in the
  adapter), inserting real `\frac{d}{d#?}` atoms — there is no macro atom,
  no bake pass, and no `latex-expanded` canonicalization. The caret lands
  on the denominator placeholder. (The Solid sibling used
  `\frac{d#?}{dx}`; this worktree intentionally differs.) The
  `d/dx means derivative` toggle is a semantic (compiler) option consumed
  by the future IR lowering; it never rewrites cell content.
- `model.at(i)` enumerates atoms in *flat* (model) order — for `\int`/
  `\sum` that visits superscript before subscript, the reverse of reading
  order. `readingRank` in `limitNavigation.ts` swaps the two contiguous
  branch ranges so caret/tab math can stay in reading order.

## Testing notes

- E2e cell-focus changes must use `focus()` + a settle wait (see
  `focusCell` in `e2e/cells.spec.ts`): MathLive's ~60ms deferred internal
  refocus steals focus back when switching cells too fast, so `click()`
  alone is racy.
- The palette stays mounted: assert `.palette` hidden via
  `not.toBeVisible()`, not `toHaveCount(0)`.
- Tab placeholder navigation is owned by the app (`intents.ts` →
  `nextPlaceholderAction`), so the old "Tab can't reach the upper bound"
  bug is fixed — the former expected-fail test in `e2e/limits.spec.ts` now
  runs as a normal test.
- `caretInfo.where` in `e2e/limits.spec.ts` only works for msubsup limits
  (`\int`); `\sum` renders over/under — assert via what typing fills
  instead.
- `\sum`/`\int` templates serialize placeholders as `\placeholder{}`;
  multi-line cells serialize as `\displaylines{a\\ b}` (note the space);
  the `derivative` shortcut serializes as `\frac{d}{d\placeholder{}}`.

## Codegraph

This worktree has no `.codegraph/` index of its own (the main checkout has
one). Run `codegraph init` here if you want one. MathLive can be indexed
as a **separate project** at `node_modules/mathlive/.codegraph` (query it
via `projectPath`) — `mathlive.mjs` exceeds the 1 MB file limit, so only
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
