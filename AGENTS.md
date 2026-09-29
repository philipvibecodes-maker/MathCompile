# MathCompile

Desmos-style multi-cell math expression editor. React + TypeScript + Vite,
cells are MathLive `<math-field>` elements.

## Commands

- `npm run dev` — dev server (vite)
- `npm run build` — `tsc -b` + vite build
- `npm run lint` — oxlint
- `npm test` — vitest unit tests (`src/*.test.ts`, node environment)
- `npm run test:e2e` — Playwright tests (`e2e/`, reuses a running dev
  server on :5173 or starts `npm run dev`)

## Command palette

- Ctrl/Cmd+K (or the header button) opens `src/CommandPalette.tsx`; commands
  are defined in `App.tsx` and fuzzy-matched via `src/fuzzy.ts`. The hotkey
  is registered in capture phase so it works inside `<math-field>`.
- Closing the palette refocuses the active cell by bumping `focus.nonce` →
  `MathFieldInput`'s `focusNonce` prop re-runs its autofocus effect.

### Performance notes (input → paint latency)

- React flushes `useEffect` **synchronously before paint** for discrete
  input events (keydown/click), so mount effects that force layout —
  `focus()`, `scrollIntoView`, geometry reads — delay the palette's first
  paint. Defer them past paint (`setTimeout(0)`) or skip the mount run.
- Cold open is far slower than warm (~50–90ms vs ~10–25ms at 1× CPU):
  first open pays V8/JIT + first style/layout of the overlay subtree. If
  perceived latency still matters, the next steps are: keep the palette
  mounted with `visibility:hidden` (open becomes a style flip), isolate the
  open render so `App`/math-fields don't reconcile, and
  `contain: layout style paint` on `.palette`.
- Measure in-page: `performance.now()` at keydown (capture listener) →
  `IntersectionObserver` on `.palette`. Screen-recording measurement adds
  compositor + frame-quantization overhead (~40–80ms floor). Dev-mode React
  is slower than `vite preview`; measure prod for real numbers.

## MathLive notes

- Multi-line cells use the `\displaylines{...}` ("lines") environment:
  `mf.executeCommand('addRowAfter')` wraps top-level content in it
  automatically and splits the row at the caret. A single-row `lines` env
  serializes without the `\displaylines{}` wrapper, so one-line cells keep
  clean LaTeX.
- `addRowAfter` silently no-ops when the caret is nested inside an atom
  (`\frac{1}{|2}`); `MathFieldInput.insertLineBreak` snaps the caret to the
  row-level ancestor first.
- Internal `model.position`/`model.setSelection` writes don't re-render;
  move the caret through `mf.position`/`mf.selection` (see
  `src/limitNavigation.ts` `applyCaret`). Reading via `model.at`,
  `model.offsetOf`, etc. is fine.
- `input` is dispatched deferred (`setTimeout`); `selection-change` fires
  synchronously — use it for fixes that must land before the next
  keystroke.
- ~60ms after a field is focused, MathLive's `onFocus` re-focuses its
  internal span via a deferred `keyboardDelegate.focus()` — it can steal
  focus from a modal opened right after editing a cell. `CommandPalette`
  works around this with a focus trap (focusout → refocus the input).
- At top/bottom row dead ends MathLive emits a cancelable `move-out`
  CustomEvent (`detail.direction`: `upward`/`downward`/`forward`/`backward`)
  on the `<math-field>` host — used for cross-cell navigation.
- Custom `mf.macros` (e.g. `\derivative`) parse into a `macro` atom that
  serializes verbatim (`\derivative{..}{..}`); edits inside the expansion
  never reach `mf.value`. `MathFieldInput`'s `input` handler detects `macro`
  atoms and bakes them into real atoms via `setValue(getValue('latex-expanded'))`.
  Beware: `latex-expanded` also canonicalizes (`x + 1` -> `x+1`), so only use
  it when a macro is actually present.

## Testing notes

- E2e cell-focus changes must use `focus()` + a settle wait (see
  `focusCell` in `e2e/cells.spec.ts`): MathLive's ~60ms deferred internal
  refocus steals focus back when switching cells too fast, so `click()`
  alone is racy.
- Known bug, pinned as expected-fail in `e2e/limits.spec.ts`: Tab from the
  lower placeholder lands back on it (the lower-placeholder fix re-fires
  after Tab's navigation), so Tab cannot reach the upper bound.
- `caretInfo.where` in `e2e/limits.spec.ts` only works for msubsup limits
  (`\int`); `\sum` renders over/under — assert via what typing fills instead.
- `\sum`/`\int` templates serialize placeholders as `\placeholder{}`;
  multi-line cells serialize as `\displaylines{a\\ b}` (note the space).

## Codegraph
The project has a `.codegraph/` index. MathLive is indexed as a **separate
project** at `node_modules/mathlive/.codegraph` (query it via `projectPath`).
`codegraph.json` `include` cannot revive `node_modules`, and `mathlive.mjs`
exceeds the 1 MB file limit, so only `types/*.d.ts` is indexed — the minified
bundles are excluded via `node_modules/mathlive/codegraph.json`.

To recreate after `npm install` wipes node_modules:

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
Make sure to prioritize the codegraph index for Mathlive over cat, grep, ls, etc when it makes sense to do so.
