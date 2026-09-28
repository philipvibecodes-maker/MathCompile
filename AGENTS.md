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
- At top/bottom row dead ends MathLive emits a cancelable `move-out`
  CustomEvent (`detail.direction`: `upward`/`downward`/`forward`/`backward`)
  on the `<math-field>` host — used for cross-cell navigation.

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
