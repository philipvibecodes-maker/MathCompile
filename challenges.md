# Challenges

Every non-obvious problem hit while building MathCompile, the workaround that
shipped, and how a ground-up rewrite would make the workaround unnecessary.
Roughly ordered by how much pain each caused.

The short version: most of the hard problems came from **patching MathLive's
default caret/focus/event behavior one event at a time** instead of owning a
document and caret model. The codebase is a working proof that you can get
Desmos-like behavior out of `<math-field>` — and also a catalog of the
suppression flags, private APIs, and timing races it costs.

---

## 1. MathLive traverses limits in model order, not reading order

**Challenge.** `\int_{a}^{b}` is written lower-limit-then-upper-limit, but
MathLive's flat atom model visits the *superscript* branch before the
*subscript* branch. Consequences:

- Inserting `\int_{#?}^{#?}` selects the **upper** placeholder first — typing
  fills `b` before `a`.
- ArrowRight from the left of `\int` descends into the upper bound.
- ArrowRight at the end of the lower bound jumps *out* instead of up.
- Backspace right of `\int_{a}^{b}` descends into the lower bound first.

**Workaround.** A parallel caret-routing layer
(`src/limitNavigation.ts`): capture-phase keydown handlers intercept
ArrowLeft/ArrowRight/Backspace, compute the reading-order-correct target as a
pure `CaretAction`, `preventDefault`, and apply it via the element API. A
`selection-change` listener (`lowerPlaceholderSelection`) re-selects the
lower placeholder after template insertion.

Because the placeholder fix must *not* override deliberate caret moves, every
deliberate move (arrows, Tab, pointerdown) sets a `suppressSelectionFix`
flag, cleared on `setTimeout(0)` (`src/MathFieldInput.tsx`).

**Known leftover bug.** Tab can't reach the upper placeholder — the fix
re-fires after Tab's own navigation and yanks the selection back to the lower
bound. Pinned as expected-fail in `e2e/limits.spec.ts`. The race is inherent:
two agents (MathLive's keybindings, our `selection-change` fix) order the
same selection.

**Ground-up.** The `CaretAction` design is already the right shape — make it
*the* caret model, not a patch. Store each cell as an explicit AST with a
caret/selection value, implement navigation as one pure
`reduce(model, key) → action` (the `limitNavigation` functions generalize
directly), and treat the math renderer as view-only. One agent orders
navigation, so the suppression-flag dance and the Tab bug can't exist.

## 2. Everything interesting requires private MathLive internals

**Challenge.** The public `<math-field>` API can't express any of the above.
The code reaches into:

- `mf._mathfield.model` (cast through `unknown`) for caret position, atom
  lookup, and `offsetOf`
- hand-declared `InternalAtom`/`InternalModel` types with undocumented atom
  type strings (`'first'`, `'placeholder'`, `'genfrac'`, `'mclose'`,
  `'extensible-symbol'`) and `parentBranch` semantics — including
  `Array.isArray(parentBranch)` as the test for "this atom lives on a row"
- shadow-DOM classnames (`.ML__caret`, `.ML__msubsup`, `.ML__op-group`,
  `.ML__vlist*`) to read *where the caret renders* in e2e
- the suggestion popover's DOM id (`mathlive-suggestion-popover`) and its
  `is-visible` class to know whether Enter should accept a completion

Any MathLive upgrade can silently break all of it — the typings won't catch
it because the types are ours.

**Workaround.** Concentrate the leaks: all internal-model types live in one
file (`src/limitNavigation.ts`), and unit tests exercise them against the
real model shape.

**Ground-up.** Put a hard adapter boundary around the editor: one module that
owns every private-API touch and exposes a small typed surface
(`getCaret()`, `setCaret()`, `insertBreak()`, `isCompletionOpen()`). Or pick
an editing surface that exposes a real document API in the first place.
Either way, an upstream upgrade fails in one file with one type signature,
not across six event handlers and three test files.

## 3. Two event clocks: `input` is deferred, `selection-change` is sync

**Challenge.** MathLive dispatches `input` via `setTimeout` — after the user
may already have typed the next character. `selection-change` fires
synchronously. Any fix that must land *before the next keystroke* (the
lower-placeholder selection) can't live in `input`.

**Workaround.** Split-brain handling: placeholder repair lives in
`selection-change`, macro baking and `onChange` live in `input`, focus
tracking in `focusin`, edge detection in `move-out`. Each fix had to be
matched to the clock that can support it, and the
`fast typing: inta with zero delay` e2e test exists solely to prove the sync
fix beats the next keystroke.

**Ground-up.** One event pipeline with defined ordering: every mutation goes
through the same `intent → model → render` path synchronously. "Is there a
macro atom?" becomes a check in the reducer, not a tree walk on a deferred
event.

## 4. MathLive steals focus back ~60ms after you give it

**Challenge.** ~60ms after a math-field is focused, MathLive's `onFocus`
re-focuses its internal span through a deferred `keyboardDelegate.focus()`.
A modal opened right after editing a cell gets its focus stolen.

**Workaround.** Three layers of defense in `src/CommandPalette.tsx`:

- deferred focus of the palette input at `setTimeout(0)` *and* `setTimeout(70)`
  (past the steal window)
- a `focusout` trap that re-asserts input focus while the palette is open
- a capture-phase window keydown that, if focus hasn't landed yet, takes it,
  swallows the event, and replays printable characters into the query

The same timer makes e2e racy: `click()` alone can't transfer focus between
cells, so `focusCell` does a 120ms pre-wait, `focus()`, and a
`waitForFunction` (`e2e/cells.spec.ts`).

**Ground-up.** A single focus owner. If the editor doesn't do hidden deferred
refocus (own surface, or an editor configured/wrapped so it can't), the
palette needs exactly one `focus()` and tests need zero settle waits. The
`focusNonce` prop — where "please refocus" is a *number that changes* so an
effect re-runs — also disappears: closing a modal calls `focusCell(id)`
directly.

## 5. Enter means three different things

**Challenge.** Enter must: accept an open autocomplete suggestion, do nothing
special in LaTeX mode, insert a line break in a multi-line cell, and (with
Shift) create a new cell. MathLive owns the first two opinions; the app owns
the last two. And `addRowAfter` **silently no-ops** when the caret is nested
inside an atom (`\frac{1}{|2}`).

**Workaround.** Capture-phase keydown runs before MathLive's binding; the
handler bails if `mf.mode === 'latex'` or the popover's `is-visible` class is
set (private DOM, see §2). `insertLineBreak` walks the caret's ancestor chain
up to a row-level atom — using `Array.isArray(atom.parentBranch)` as the row
test — snaps `mf.position` there, *then* calls `addRowAfter`.

**Ground-up.** A declarative keymap with explicit precedence
(`completion > mode > app`) instead of capture-phase interception plus
bail-out conditions. And in an app-owned model, "split the row" is always
representable — there's no `addRowAfter` that can refuse.

## 6. Macro atoms are write-only, so `\derivative` has to be un-baked

**Challenge.** `mf.macros.derivative` expands at parse time into a `macro`
atom that serializes verbatim (`\derivative{..}{..}`). The rendered fraction
*looks* editable, but edits inside it never reach `mf.value` — the expansion
is a rendering of the atom, not content.

**Workaround.** On every (deferred) `input`, walk the atom tree for `macro`
atoms; if found, `mf.setValue(mf.getValue('latex-expanded'))` to bake the
expansion into real atoms — but only then, because `latex-expanded` also
canonicalizes untouched content (`x + 1` → `x+1`). Then re-derive the caret:
`expansionCaret` hunts the nearest `genfrac` (or `mclose`, for the `D(#1)`
variant) to the old position, so the caret lands in the denominator. The atom
types searched are hard-coded to those two specific macro definitions.

Bonus wrinkle: toggling the option must re-parse existing content, but
`setValue` no-ops on identical input — so it clears first, then restores
(`setValue(''); setValue(v)`).

**Ground-up.** Don't use parse-time macros for editable constructs — insert
real atoms directly via a custom shortcut, so there's nothing to un-bake and
no caret to reconstruct. Better still: this app is a *compiler*. Whether
`d/dx` means derivative is a **semantic** decision that belongs in the IR
lowering, not a *display* option that rewrites the user's keystrokes. Keeping
`d/dx` literal in the document deletes the macro, `hasMacroAtom`,
`expansionCaret`, the bake pass, and the re-parse hack — and the toggle
stops mutating cells that were typed under the other setting.

## 7. A controlled React component over an imperative custom element

**Challenge.** `<math-field>` is not a React input; it's an imperative
web component with its own state, shadow DOM, and event clocks. Expressing
that in props produced the usual friction:

- JSX typing needs a `declare module 'react'` `IntrinsicElements` shim
- two-way value sync is a manual echo: `onChange(mf.value)` sets React state;
  a separate effect calls `mf.setValue(value)` when they differ — correct
  only because string equality happens to break the loop
- imperative actions are smuggled through props: `focusEdge` plus a `nonce`
  that exists only to re-trigger an autofocus effect
- callbacks go through a `latest` ref because the mount-once effect would
  otherwise capture stale closures
- six listeners wired in one mount effect, sharing two suppression refs —
  ordering between handlers is implicit and fragile

**Workaround.** Exactly the above — it works, but `MathFieldInput.tsx` is
322 lines of which maybe 40 are about math.

**Ground-up.** Give the wrapper an explicit command interface
(`focus(edge)`, `insertBreak()`, `getModel()`) called from a store/effect
layer, instead of encoding commands as prop deltas. Or question whether
React earns its seat here at all — the last commit
(`Expand unit and e2e coverage ahead of a framework rewrite`) already plans
a migration, and the e2e suite deliberately pins only DOM-visible behavior
(`e2e/cells.spec.ts` header) so the framework can be swapped. Fine-grained
reactivity (or a small store + direct element calls) fits an app whose core
is imperative custom elements.

## 8. Palette cold-open latency (input → paint)

**Challenge.** React flushes mount effects **synchronously before paint** for
discrete input events, so anything in a mount effect that forces layout —
`focus()`, `scrollIntoView`, geometry reads — delays the palette's first
paint. Measured: cold open ~50–90ms vs ~10–25ms warm (V8/JIT + first
style/layout of the overlay subtree is the rest of the gap).

**Workaround.** Defer focus to `setTimeout(0)`; skip the mount run of the
`scrollIntoView` effect (`didMount` ref); swallow-and-replay keys that arrive
before focus lands. Also learned: dev-mode React overstates the problem and
screen-recording measurement has a ~40–80ms floor — measure in-page with
`performance.now()` → `IntersectionObserver` on `.palette`, against a
production build.

**Ground-up.** Keep the palette permanently mounted and toggle
`visibility` — open becomes a style flip, not a mount. Isolate its render so
`App` and the math-fields don't reconcile, and add
`contain: layout style paint`. These were identified as next steps; a rewrite
just designs the overlay for cold-open from day one.

## 9. Serialization is presentation-influenced

**Challenge.** `mf.value` is not a stable document format:

- multi-line cells serialize as `\displaylines{a\\ b}` — but a single-row
  `lines` env drops the wrapper entirely
- templates serialize placeholders as `\placeholder{}`
- `latex-expanded` canonicalizes spacing/ordering it was never asked about
- macro atoms serialize verbatim (§6)

**Workaround.** Tests pin the quirks (`'\\displaylines{x\\\\ y}'`), and the
output panel treats `mf.value` as raw LaTeX to be reparsed downstream.

**Ground-up.** Store a canonical AST per cell; serialize to LaTeX only for
display and export. The output pipeline (`LaTeX -> AST -> IR`, currently a
stub in `OutputPanel.tsx`) then consumes a tree it already owns instead of
re-parsing MathLive's string and re-encountering every quirk.

## 10. E2e tests probe rendering internals

**Challenge.** Asserting "caret is in the upper limit" requires geometry: read
`.ML__caret`'s rect relative to `.ML__msubsup` vlist boxes in the shadow DOM
(`caretInfo` in `e2e/limits.spec.ts`). `\sum` renders limits over/under — not
msubsup — so the same assertion can't even run there; tests instead type a
character and check what it filled. Add the §4 focus races and every test
pays a `settle(80ms)` tax.

**Workaround.** Exactly those probes, plus `focus()` + settle rituals, plus
one expected-fail.

**Ground-up.** If caret/document state is app-owned (§1, §9), navigation is
fully covered by vitest unit tests — which already exist for
`limitNavigation.ts` and `targets.ts`. E2e shrinks to a thin contract layer:
"these keys produce this `mf.value`", with no shadow-DOM archaeology and no
timing windows.

## 11. Minor: smart mode and indexing a minified dependency

- MathLive `smartMode` (typed `sqrt` auto-becoming `\sqrt`) fights raw input;
  the app defaults it off and exposes a toggle (`Alt+S`). In a rewrite it's a
  per-intent feature of the input layer, not a global mode.
- Codegraph can't index `mathlive.mjs` (>1 MB minified); a
  `node_modules/mathlive/codegraph.json` excludes bundles so `types/*.d.ts`
  is indexed — but `npm install` wipes it. Recreation steps are in
  `AGENTS.md`. A rewrite that keeps editor internals behind an adapter (§2)
  also makes the dependency's internals less worth indexing at all.

---

## What a ground-up rewrite looks like

The individual "Ground-up" notes converge on one design:

1. **Own the document model.** Each cell is an AST with an explicit
   caret/selection value — not a string that MathLive serializes
   presentation-influenced LaTeX into. This deletes §1, §3, §5, §6, §9 and
   most of §10 in one move.
2. **One pure reducer for editing intent.** `reduce(model, key) → action`,
   exhaustively unit-tested. `limitNavigation.ts` is already this shape —
   promote it from patch layer to the whole editing engine.
3. **The math editor is a view.** Render via MathLive (or KaTeX/MathJax/a
   custom surface) and route keys *to* the reducer rather than patching the
   editor's decisions afterward. Editor internals live behind one typed
   adapter (§2).
4. **One focus owner.** The app decides what is focused; no deferred refocus
   timers in any component. Removes §4's traps and the `focusNonce` channel.
5. **Semantics in the compiler, not the editor.** `d/dx means derivative`
   (and future options) apply at IR lowering; the document stays what the
   user typed (§6).
6. **Overlays designed for cold-open.** Permanently mounted palette,
   `visibility` flips, `contain`, isolated renders (§8).
7. **Thin framework shell.** Fine-grained updates or a minimal store; props
   stop being a command channel (§7). The e2e suite already only pins DOM
   behavior, so it survives this by design.
8. **Test pyramid inverted.** Almost everything as unit tests over the
   model; e2e only verifies the DOM contract (§10).

The e2e suite was explicitly built to be the fixed contract across this
rewrite — cells, limits, palette, and Escape behavior are all specified at
the DOM level, so a rewrite can be checked against the current behavior
without inheriting its mechanisms.
