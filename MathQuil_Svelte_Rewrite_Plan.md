# MathCompile rewrite plan: Svelte 5 + vendored Desmos MathQuill (with matrix port)

Replace React + MathLive with **Svelte 5** + **MathQuill (desmosinc fork)**,
vendored in-repo and extended with a ported `\begin{matrix}` environment.
The editor surface is wrapped in a framework-free `<math-field>` custom
element, preserving the e2e DOM contract and creating the hard adapter
boundary `challenges.md` §2 calls for.

(A sibling plan covers the same rewrite in SolidJS — see the session plan
file / `REWRITE-PLAN.solid.md` if present. The MathQuill foundation —
Phases 0–2 — is identical in both; only the app shell differs.)

## Workspace setup (do first)

- **Worktree**: `git worktree add ../MathCompile-svelte-mathquill -b rewrite/svelte-mathquill`
  — all work happens in `../MathCompile-svelte-mathquill`, never the main
  checkout. The SolidJS rewrite lives in `../MathCompile-solid-mathquill`.
- **Port**: the app hardcodes dev-server port 5173 (`playwright.config.ts` +
  vite default), and up to three checkouts may serve at once (main, Solid,
  this one). Probe before choosing: `ss -tln | grep -E ':(5173|5273|5573)'`.
  This plan reserves **5573** (Solid plan reserves 5273; main keeps 5173) —
  verify it's actually free, then set `server: { port: 5573, strictPort: true }`
  in `vite.config.ts` and matching `baseURL`/`webServer.url` in
  `playwright.config.ts`. `strictPort` keeps a collision loud.

## Research findings (verified during planning)

- **No active MathQuill fork ships matrices.** `desmosinc/mathquill` is the
  only modern, maintained fork: TypeScript source, **jQuery-free v3 API**
  (`getInterface(3)`, see `src/mathquill.d.ts`), published nightly as
  `@desmos-community/mathquill` (ESM + `index.d.ts` + `style.css` + fonts).
  Upstream `mathquill/mathquill` master is now the same code (desmos merge
  landed) — also no matrices.
- **Matrix implementations exist only on the ~2017 jQuery base**:
  `Learnosity/mathquill` `matrix` branch (upstream PR mathquill#762,
  +586 LoC: `\begin{matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix}`,
  Shift-Space/Shift-Enter row/col editing), and descendants `tmilev`,
  `seandonn`, `@pie-framework/mathquill`, `@digabi/mathquill`.
- **Desmos fork API covers every hook needed**: `latex()` get/set, `write()`,
  `cmd()`, `keystroke()`, `typedText()`, `selection(latex-range)`,
  `moveToLeftEnd`/`moveToRightEnd`, runtime `config()`, and handlers
  `moveOutOf(dir)`, `upOutOf`, `downOutOf`, `deleteOutOf`, `selectOutOf`,
  `enter`, `edit`/`edited`. `enter` is a pure handler hook — the app fully
  owns Enter semantics (`src/services/textarea.ts:190` upstream).
- **SupSub traverses sub→sup in written order** (`src/commands/math.ts`
  SupSub: `sub` = `getEnd(L)`), so `\int_{a}^{b}` already navigates
  lower-then-upper — the entire `src/limitNavigation.ts` patch layer likely
  evaporates. Verify in spike (Phase 0).
- MQ has **no placeholder nodes** (empty `MathBlock`s render as `mq-empty`
  boxes; serialization writes `^{ }` for empty sup — round-trips), **no
  autocomplete popover** (`autoCommands` converts `sqrt`/`int`/… on word
  completion — simpler than MathLive's popover), **no latex mode**, **no
  virtual keyboard**, and a **hidden-textarea focus model** (no deferred
  refocus steal like MathLive's ~60ms one — verify in spike).
- MQ renders into a plain `<span>`; it is not a custom element — the adapter
  below wraps it in one.
- Unit tests: `src/fuzzy.test.ts`/`src/targets.test.ts` port as-is;
  `src/limitNavigation.test.ts` (412 lines against a mocked MathLive model)
  is deleted once the spike confirms MQ's native order.
- Build: desmos fork builds via `Makefile` → `build/mathquill.{js,css}` +
  fonts.

## Architecture

```
vendor/mathquill/          vendored desmosinc/mathquill @ pinned commit + our patch
src/editor/mathquill.ts    shim: import vendored build, export getInterface(3) API
src/editor/math-field.ts   <math-field> custom element = the adapter boundary
src/editor/keymap.ts       capture-phase keymap for Enter/Shift+Enter inside fields
src/store.svelte.ts        Svelte-5 runes state module ($state in a .svelte.ts file)
src/registry.ts            Map<cellId, math-field el> + focusCell(id, edge) — no prop commands
src/commands.ts            command list builder (same shape as today)
src/fuzzy.ts, src/targets.ts   ported verbatim
src/App.svelte, Cell.svelte, CommandPalette.svelte, OutputPanel.svelte
```

## Implementation steps

### Phase 0 — Workspace + spike (prove the foundation before rewriting)
1. Create the worktree and claim port 5573 (see Workspace setup).
2. Vendor `desmosinc/mathquill` into `vendor/mathquill/` (record pinned
   commit in `vendor/README.md`), `make js css font`.
2. `src/editor/mathquill.ts` shim: `import '../../vendor/mathquill/build/mathquill.js'`
   then `window.MathQuill.getInterface(3)`; import `mathquill.css` + wire fonts.
3. Bare spike page verifying: `autoCommands` (`int`/`sum`/`sqrt`), `enter`/
   `upOutOf`/`downOutOf`/`moveOutOf` handlers, `.write('\\int_{ }^{ }')`
   empty-block persistence + caret placement into the sub block via
   `keystroke`/`selection()`, `document.activeElement` = hidden textarea
   inside the field (e2e `focusedIndex` must use `.contains()`), no
   deferred-focus steal, Shift state visible via a capture keydown before
   MQ's textarea handles it.

### Phase 1 — Vendor patch: matrices + custom commands
4. Port Learnosity `matrix` branch (`src/commands/math/commands.js`
   Matrix/Environment blocks) to the desmos TS base as
   `vendor/mathquill/src/commands/math/environments.ts`: `MathCommand`
   subclass with per-cell `MathBlock`s, `&`/`\\` separators, `Parser`
   integration for `\begin{…}`, DOM rendering via `h()`/`domFragment`
   helpers (no jQuery).
5. Register `displaylines` as an environment alias serializing
   `\displaylines{a\\ b}` — keeps the existing e2e serialization contract
   for multi-line cells for free.
6. Interaction mapping: Enter inside a matrix env → add row; Enter outside →
   split into `displaylines`/1-col env; Shift+Enter → app new-cell (app-level
   capture keydown sees `evt.shiftKey` before MQ's `enter` handler fires);
   add-column: Shift+Space (Learnosity default).
7. Vendor additions: `LatexCmds.derivative` → inserts real `\frac{d}{d}`/`D()`
   atoms (kills the macro-bake subsystem; toggle becomes insertion-time
   only), and template insertion for `int`/`sum`/`prod` writing `_{ }^{ }`
   with the caret in the lower block (replaces `lowerPlaceholderSelection`).

### Phase 2 — `<math-field>` adapter (framework-free)
8. `src/editor/math-field.ts`: custom element wrapping `MQ.MathField(span, config)`:
   - API: `getValue()/setValue()`, `focus(edge?: 'start'|'end')` (`mq.focus()`
     + `moveToLeftEnd/RightEnd`), `smartMode` property →
     `mq.config({autoCommands, autoOperatorNames})`.
   - Events (CustomEvents on the element): `cell-input` (from `edit`),
     `cell-move-out` `{direction}` (from `upOutOf`/`downOutOf`),
     `cell-enter` `{shift}` (capture keymap + `enter` handler).
   - Keeps the `math-field` tag name → e2e selectors and most of
     `index.css` survive unchanged.

### Phase 3 — Svelte 5 app
9. Deps: `npm rm react react-dom @types/react @types/react-dom @vitejs/plugin-react`;
   `npm i svelte`; `npm i -D @sveltejs/vite-plugin-svelte`; update
   `vite.config.ts` (plugin + `server.port: 5573`/`strictPort`),
   `playwright.config.ts` (`baseURL`, `webServer.url`), `tsconfig*.json`
   (`moduleResolution: bundler`, types for `.svelte` imports — use
   `svelte-check` for typecheck or keep `tsc -b` with the svelte tsconfig
   plugin conventions from create-vite's svelte-ts template).
10. `src/store.svelte.ts`: runes in a module — `export const cells = $state<Expr[]>(...)`
    plus functions `addExpr/removeExpr/updateExpr/clearAll` and
    `target`/`dIsDerivative`/`smartMode`/`paletteOpen` as exported `$state`
    objects wrapped in getters/setters (Svelte 5 doesn't allow reassigning
    exported `$state` — use a `state` object or setter functions).
11. `src/registry.ts`: cell element registry + `focusCell(id, edge)` —
    direct element calls, no prop-encoded commands (deletes `focusNonce`).
12. `Cell.svelte`: `use:` action is the idiomatic Svelte wrap of an
    imperative widget — `use:mathfield={{ smartMode }}` where the action
    creates the `<math-field>` element/MQ instance and returns
    `{update, destroy}`; CustomEvents → store via `oninput`-style props or
    direct store calls. `$effect` pushes `.setValue()` only when store latex
    differs.
13. `App.svelte`: `{#each exprs as e (e.id)}` keyed list, same
    header/list/buttons markup; `<svelte:window onkeydowncapture={...}>`
    for Ctrl+K / Alt+S.
14. `CommandPalette.svelte`: `let query = $state('')`, `let index = $state(0)`,
    `const matches = $derived(...)`; single `input.focus()` on open —
    `onMount` or `$effect` + `tick()` (no focus trap: MQ doesn't steal —
    verify in spike); permanently mounted + `visibility` toggle and
    `contain: layout style paint` (challenges §8).
15. `OutputPanel.svelte`: `$derived` stub text over the store — same output.

### Phase 4 — Tests & cleanup
16. Unit: port `fuzzy.test.ts`, `targets.test.ts`; delete
    `limitNavigation.test.ts`; add vitest specs for store actions + keymap
    reducer where pure.
17. E2e updates (contract preserved, mechanisms updated): `focusedIndex`
    uses `el.contains(document.activeElement)`; drop suggestion-popover
    rows (autoCommands convert inline — typing `sqrt` completes to `\sqrt`
    directly); update serialization expectations that pinned MathLive
    quirks (`\placeholder{}` → `^{ }`); drop the virtual-keyboard row;
    replace the `mode='latex'` escape row with "during `\`-command input";
    remove 60ms settle waits / `focusCell` pre-wait; the expected-fail Tab
    test should now genuinely pass — unpin it.
18. Update `AGENTS.md` (MathLive notes → MathQuill notes; vendor rebuild
    instructions) and `challenges.md` status.

## Files

- New: `vendor/mathquill/**`, `src/editor/{mathquill,math-field,keymap}.ts`,
  `src/{store.svelte,registry,commands}.ts`
- Rewritten: `src/main.ts` (`mount(App, { target })`), `src/App.svelte`,
  `src/{CommandPalette,OutputPanel}.svelte`, new `Cell.svelte` replacing
  `MathFieldInput.tsx`, `index.html` root id
- Deleted: `src/MathFieldInput.tsx`, `src/limitNavigation.ts`,
  `src/limitNavigation.test.ts`, all `src/*.tsx`
- Updated: `package.json`, `vite.config.ts`, `tsconfig*.json`,
  `src/index.css` (`mq-*` hooks), all `e2e/*.spec.ts`, `AGENTS.md`,
  `challenges.md`

## Verification

- [x] Worktree `../MathCompile-svelte-mathquill` on branch
      `rewrite/svelte-mathquill`; port 5573 verified free via `ss -tln` and
      honored by `strictPort`
- [x] Spike gates every later phase: all Phase-0 checks pass first
      (`e2e/spike.spec.ts`, 15 checks incl. adapter contract)
- [x] `npm test` (vitest) green (40 tests); `svelte-check` clean
- [x] `npm run lint`, `npm run build` clean
- [x] `npm run test:e2e` green (96 tests) — the formerly expected-fail Tab
      test now runs unpinned in `e2e/limits.spec.ts`; the multi-line/limits
      suites run against MQ serialization (`^{ }`, `\displaylines`)
- [x] In-page input→paint latency for palette open measured ~7–26ms
      (class flip + 2 rAFs), at or below the old warm baseline

## Risks / decisions

- **Matrix port is the big unknown** (~600 LoC JS → desmos TS internals:
  `Parser`, `domFragment`, `MathBlock` ends). Bounded vendored module;
  upstream PR #762 + Learnosity branch as references; vendor's mocha suite
  can cover it.
- **`\int`/`sum` template insertion** and empty-block caret placement may
  need cursor APIs beyond `.write()` — vendor patch is the fallback.
- **Serialization changes** ripple through e2e (`\placeholder{}` → `^{ }`;
  `\displaylines` kept via env alias) — update specs deliberately.
- **Deltas accepted**: no latex mode, no virtual keyboard, no autocomplete
  popover (autoCommands instead), `dIsDerivative` stops mutating cells
  (insertion-time expansion only; semantics move to future IR lowering per
  challenges.md §6).
- `focusCell` registry mutates DOM outside the reactive graph — intentional
  (§7); document the boundary in `registry.ts`.
- Svelte-specific: `$state` in `.svelte.ts` modules can't be exported as a
  bare reassignable `let` — use an exported state object or setter
  functions; `$effect` runs post-update, so focus asserts go through
  `onMount`/`tick()`/`$effect.pre` deliberately.
