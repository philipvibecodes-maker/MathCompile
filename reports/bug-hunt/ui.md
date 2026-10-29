# UI bug hunt report

**Status: completed after 5h00m24.613s of credited active investigation.** There are 34 ordered findings: 30 supported by browser evidence and four source/unit or conditional findings (UI-22, UI-24, UI-25, UI-26). UI-26 proves handler behavior but leaves actual keyboard-layout compatibility unverified. UI-21/UI-22/UI-24/UI-25/UI-26 also have pure-unit evidence. Accessibility findings establish browser accessibility metadata/keyboard behavior, not physical screen-reader testing. User instruction: hunt/report only; no product fixes, commits, or pushes. Suggested corrections are analysis only.

Repository: `philipvibecodes-maker/MathCompile`. Baseline: `eb8cdc2318f219d2f6d97cfe1dcc67c5d2ba268f`. Worktree: `/workspace/hunt-ui`. Evidence root: `/workspace/bug-hunt-evidence/ui/`.

## Findings index

| ID | Severity | Finding |
| --- | --- | --- |
| UI-01 | high (data loss) | Switching a Python cell to math irreversibly rewrites its source |
| UI-02 | medium (broken subsequent commands) | Deleting the focused row with × leaves an invalid focusedId |
| UI-03 | medium (incorrect editing result) | Fuzzy autocomplete inserts a different command from the selected suggestion |
| UI-04 | medium (picker navigation fails) | Scrolling within the symbol picker dismisses it |
| UI-05 | medium (editing position is lost) | Closing an overlay moves the Python caret to end of source |
| UI-06 | medium (conflicting keyboard handlers) | Alt+Shift+Enter in Python inserts two cells |
| UI-07 | high (conditional data loss) | Workbook write failures discard edits within the same session |
| UI-08 | medium (conditional blank screen) | Disabled localStorage prevents the entire app from mounting |
| UI-09 | medium (core help insertion fails for 11 topics) | Compound help insertions appear as literal LaTeX rather than editable math |
| UI-10 | medium (matrix insertion does nothing) | Selecting a matrix from the symbol picker immediately cancels its dimensions menu |
| UI-11 | medium (intermittent documented Escape/Vimium contract failure) | Delayed palette refocus can defeat blur-to-nowhere dismissal |
| UI-12 | medium | Keyboard copy/cut and paste collapses multiline editing structure |
| UI-13 | high (conditional data loss) | Converting a cell while matrix dimensions are open discards its pending selection |
| UI-14 | medium | Enter during IME composition executes the selected palette command |
| UI-15 | medium (keyboard/menu interaction) | Worksheet menu lacks Escape dismissal and loses focus when reselecting the active sheet |
| UI-16 | medium (unhandled runtime error; no additional data loss attributed) | Converting a focused math field raises an unhandled Svelte mutation exception |
| UI-17 | medium (keyboard autocomplete becomes invisible) | Autocomplete arrow navigation selects rows outside the visible dropdown |
| UI-18 | medium (selected-command semantics lost) | Math search overlays drop the selection before settled insertion |
| UI-19 | high (source corruption) | Help/picker insertion inside raw text blocks throws and can corrupt source |
| UI-20 | low (false success feedback) | Failed clipboard writes still display success |
| UI-21 | high (cross-sheet history corruption); browser/unit confirmed | Cell IDs collide after reload and another worksheet inherits undo/redo history |
| UI-22 | high; source/unit-confirmed | Legacy migration deletes its saved copy even when replacement writing fails |
| UI-23 | low; browser-confirmed lower boundary | Matrix dimension arrows display values outside the range used for insertion |
| UI-24 | low; source/unit-confirmed | Worksheet filename import removes a .json suffix belonging to its basename |
| UI-25 | low; source/unit-confirmed | Help search ranking tiers overlap contrary to their documented ordering |
| UI-26 | low; conditional source/unit compatibility finding | Character-labelled global shortcuts require physical codes |
| UI-27 | high (editor/output/persistence disagree); browser confirmed | Numeric native undo changes the field but leaves output and saved source unchanged |
| UI-28 | medium (next input lands at wrong location); browser confirmed | Undo restores a stale caret position from before the last caret move |
| UI-29 | medium (accessible help unavailable); browser metadata confirmed | Settings tooltips remain hidden from the accessibility representation |
| UI-30 | medium (accessible completion state unavailable); browser metadata confirmed | Math completion keyboard selection changes only CSS state |
| UI-31 | low (incorrect accessible prompt state); browser metadata confirmed | Palette prompt mode references a listbox and option that no longer exist |
| UI-32 | low (incorrect contextual instructions); browser confirmed | Matrix hint says Enter adds a row while an open command consumes it |
| UI-33 | medium (keyboard functionality unavailable); browser/source confirmed | Output-column resizing is pointer-only |
| UI-34 | medium (keyboard activation fails); browser confirmed | Debounced help navigation can retain a negative selection after results appear |

## Timing and stop rule

Searches are cumulative across interrupted sessions. Downtime is excluded. Active work includes source investigation, actual browser probes, reducing failures, and automated searches for new structural/workflow coverage; saturated failure counters alone do not count as substantive progress.

| Session | UTC start | Last retained active diagnostic | Active duration |
| --- | --- | --- | --- |
|1 |2026-10-27 06:26:19 |2026-10-27 08:08:26.781 |1h42m07.781s |
|2 |2026-10-27 17:06:20 |2026-10-27 17:17:46 |11m26s |
|3 |2026-10-28 04:28:37 |2026-10-28 05:35:31 |1h06m54s |
|4 |2026-10-28 08:09:41 |Credited through 08:20:00 |10m19s conservatively credited |
|5 |2026-10-28 08:32:52 |2026-10-28 08:53:29 |20m37s |
|6 |2026-10-28 16:20:21 |2026-10-28 16:28:35 |8m14s |
|7 |2026-10-28 16:30:01 |2026-10-28 16:39:33 |9m32s (pure Node unit investigation) |
|8 |2026-10-28 16:42:03 |2026-10-28 16:49:46 |7m43s (registry/search/preferences source and pure units) |
|9 |2026-10-28 16:51:54 |2026-10-28 16:54:20.684 |2m26.684s (ordinary local browser) |
|10 |2026-10-28 17:17:24 |2026-10-28 17:26:08.148 |8m44.148s (ordinary local browser/source) |
|11 |2026-10-29 05:37:54 |2026-10-29 05:49:03 |11m09s (ordinary native-undo/navigation/source review) |
|12 |2026-10-29 05:50:53 |2026-10-29 06:32:05 |41m12s (benign math menus/settings/accessibility/search) |

**Total: 5h00m24.613s. Stop reason: the five-hour active-search requirement was reached. The one-hour-without-progress exception was not invoked.** Search ended at 2026-10-29 06:32:05 UTC while closing the final help-navigation source/control trace. No new area was opened after the threshold. Final report cleanup, evidence checks and process cleanup add no search credit.

All quota/environment pauses and waiting are excluded. Session4 is conservatively credited only through 08:20:00, before the reported transport interruption, although a diagnostic result was saved at 08:20:09.776. Later mixed report/source review through 08:25:38 receives no extra credit. Initial consolidation on 2026-10-29 05:35:31–05:37:54 is also excluded. Session3's endpoint is rounded down from diagnostic mtime 05:35:31.656901. Subsecond totals describe conservative retained accounting, not exact millisecond knowledge of every human work boundary.

Methods changed under explicit task instructions: sessions5–6 used existing local source/evidence only; sessions7–8 added pure Node/Vitest transformations with in-memory mocks; sessions9–12 added progressively bounded ordinary local-browser checks. Later browser contexts were disposable, began in LaTeX output, blocked service workers and aborted non-local requests before connection. Code-preview checks used only generated text; no Python was executed. Earlier-phase clipboard/composition/storage/code-context evidence is retained but those workflows were not reused under the later restrictions. No fixes, commits or pushes occurred.

## Detailed findings

### UI-01 — Switching a Python cell to math irreversibly rewrites its source

Severity: **high (data loss)**.

Source: `src/state/store.svelte.ts:295`–303; `src/components/MathField.svelte:42`–43 and value effect; `src/editor/attach-field.ts:133`–149.

Reproduce:

1. Create a Python cell and enter `def f(x):` followed by a newline and four spaces then `return x + 1`.
2. With that cell focused, press Alt+M to convert it to math.
3. Press Alt+M again to return to Python.

Expected: preserve the original source when returning to Python. This matches the explicit store comment that conversion keeps source and silently destroys nothing.

Actual: source becomes `deff(x):returnx+1`. Whitespace and newlines are removed, and the Python program is invalid. The rewritten source is persisted. The newly mounted editor has a fresh undo history, so native undo does not recover the original program.

Root cause: `setCellKind` keeps one shared `latex` string, but mounting MathQuill runs that Python text through its LaTeX parser. `attachField.setValue` reports MathQuill's normalized value back to the store, overwriting the original source. Invalid LaTeX can be erased entirely by the same path.

Suggested fix: retain separate source snapshots per editor kind or use a reversible explicit conversion that cannot overwrite an unsupported source. Keep MathQuill canonicalization feedback for genuine math input without applying it destructively to retained Python text.

Regression validation: nonempty multiline Python including indentation, braces, strings, and backslashes must survive Python → math → Python, worksheet switch, and reload; assert saved source as well as DOM text.

Evidence: `initial-diagnostics.json`, keys `conversionBefore`, `conversionMath`, `conversionBack`.

### UI-02 — Deleting the focused row with × leaves an invalid focusedId

Severity: **medium (broken subsequent commands)**.

Source: `src/App.svelte` row delete button (`onclick={() => appStore.removeCell(cell.id)}`) invokes `removeCell`; `src/state/store.svelte.ts:325`–345.

Reproduce: enter `a` in cell 1, Shift+Enter, enter `b` in cell 2, then click cell 2's ×. Open the command palette and try Duplicate current expression, or press Alt+Enter.

Expected: focus transfers to the surviving neighbor, and cell commands target that neighbor.

Actual: `focusedId` remains cell 2's removed ID, `document.activeElement` is body, Duplicate/Convert/Delete current commands have no valid target, closing a palette cannot refocus an existing field, and Alt+Enter inserts a Python cell at the *top* because an unknown `afterId` becomes insertion index zero.

Root cause: `removeCell` removes the cell without repairing focus. The palette/blank-delete path uses `deleteFocused`, which repairs it, but the row button bypasses that path.

Suggested fix: make removal preserve a valid focused cell in the store regardless of entry point, without stealing focus when an unrelated row is deleted. Reuse the neighboring-cell selection logic.

Regression validation: delete focused first/middle/last math or Python cells via × and check active DOM focus and commands immediately afterward; deleting a nonfocused row must keep the existing focus owner valid.

Evidence: `initial-diagnostics.json`, keys `deleteBefore`, `deleteAfter`, `deleteThenInsertPython`; repeatedly detected by the stateful campaign's `focusedId-does-not-exist` invariant.

### UI-03 — Fuzzy autocomplete inserts a different command from the selected suggestion

Severity: **medium (incorrect editing result)**.

Source: `src/editor/caret-context.ts:60`–68; `src/editor/completions.ts:280` onward.

Reproduce on a blank math cell:

- Type `\nthrt`; autocomplete offers `nthroot`; press Enter.
- Type `\vmtx`; autocomplete offers `vmatrix`; press Enter.
- Type `\root`; the first suggestion is `nthroot`; press Enter.

Expected: insert the selected root/matrix command, with the usual editable slots or dimensions menu.

Actual: the values are respectively `\text{nthrtot}`, `\text{vmtxrix}`, and `\text{rootoot}`. Correct prefix matching such as `\sq` → `sqrt` works.

Root cause: completion matching supports substring, synonym, fuzzy subsequence, and hint hits, while `acceptCommandCompletion` assumes that the typed text is a literal prefix and only appends `item.name.slice(prefix.length)`. It never replaces the incorrect prefix. Alias `\integral` happens to work because MathQuill already recognizes that command; it is not evidence that nonprefix completion is generally correct.

Suggested fix: replace the command-input contents with the selected item's exact command name (including case) before committing, preserving any selected expression that command input owns. Do not restrict the matcher and silently remove documented fuzzy/synonym functionality.

Regression validation: both keyboard and mouse acceptance for literal prefixes, substrings, subsequences, synonyms/hints, and uppercase/lowercase commands; assert resulting editor structure, not only ranking.

Evidence: `initial-diagnostics.json`, `autocomplete` entries.

Source-only related boundary: completion matching lowercases both the prefix and catalog name, while acceptance preserves the already typed prefix. Choosing capital `Omega` after typing lowercase `\ome` therefore follows the source path to `\omega`, and an uppercase typed prefix can leave an unrecognized mixed-case command. This is the same UI-03 assumption that matching implies an exact, case-sensitive prefix. These case variants were not separately browser-reproduced and do not add a finding.

### UI-04 — Scrolling within the symbol picker dismisses it

Severity: **medium (picker navigation fails)**.

Source: `src/editor/ac-picker.ts:117`–122 and 164–172.

Reproduce: focus a blank cell, press Ctrl+Space to open the 207-command symbol picker, then press ArrowDown repeatedly. At viewport 1280×900, the picker closed on the second ArrowDown in the initial probe. Scrolling the picker grid itself also triggers the same handler.

Expected: keyboard selection scrolls within the grid while the picker stays open.

Actual: the menu disappears as soon as its own content scrolls. The selected symbol cannot be accepted; focus can fall back to the math field.

Root cause: the window scroll listener runs in capture phase and receives descendant scroll events. `move` calls `scrollIntoView`, and `onWindowChange` closes the menu for every scroll event, including the picker's own grid. This is distinct from intentionally dismissing an anchored popup when its outer page is scrolled.

Suggested fix: ignore scroll events whose target is inside the popup, and consider whether outer-layout scroll should reposition or dismiss. Apply corresponding regression checks to other field overlays using the same capture-scroll pattern.

Regression validation: open picker at top and near bottom of a long worksheet, navigate beyond the first visible grid rows, scroll with mouse/wheel, and accept the chosen item. External page scrolling should still follow the desired policy.

Evidence: `initial-diagnostics.json`, `pickerBefore`, `pickerClosedAt: 2`, `pickerAfter`.

Additional reproduction: entering 30 in the matrix dimensions Rows input itself emitted a native scroll event from `.mc-mat-dim` and cancelled the menu before Columns could be edited. Its capture-scroll listener has the same descendant-event bug as the symbol picker. Confirmed in `final-targets/results.json`, matrixAfterRows.scrollEvents. A large-preview-specific scroll variant is not separately claimed.

### UI-05 — Closing an overlay moves the Python caret to end of source

Severity: **medium (editing position is lost)**.

Source: `src/components/PythonField.svelte:117`–122; palette/help close paths call `focusCell` without an edge.

Reproduce: put `x = 1\ny = 2` in a Python cell, place the caret at offset 2, press Ctrl+K then Escape, then type `Q`.

Expected: `Q` inserts at the original caret location. Ordinary focus restoration should preserve the editor's selection, as the math-field handle does.

Actual: selection changes from `(2,2)` to `(11,11)`, producing `x = 1\ny = 2Q`. A noncollapsed selection is likewise collapsed to end.

Root cause: Python `focus(edge)` always calls `setSelectionRange`; an undefined edge is treated as `end`. Math `focus()` only moves the caret when an explicit edge was requested.

Suggested fix: preserve selection when `edge` is undefined; only move for explicit `start` or `end` navigation.

Regression validation: palette close, help close, command execution, and theme/settings toggles with both a mid-source caret and a noncollapsed Python selection. Explicit cross-cell start/end navigation should continue to work.

Evidence: `more-diagnostics.json`, `caretBefore`, `caretAfter`, `caretType`.

### UI-06 — Alt+Shift+Enter in Python inserts two cells

Severity: **medium (conflicting keyboard handlers)**.

Source: `src/editor/keymap.ts:25` Alt+Enter capture handler; `src/components/PythonField.svelte:57`–62 Shift+Enter handler.

Reproduce: focus a Python cell containing `x`, then press Alt+Shift+Enter.

Expected: one clearly specified shortcut action, or no action for an unsupported modifier combination. A single keypress should not trigger two independent insertions.

Actual: cell list becomes Python `x`, blank math cell, blank Python cell. Global Alt+Enter adds Python and the local Shift+Enter handler also adds math.

Root cause: neither handler constrains the other modifier or honors prior handling. The math-field Shift+Enter guard already rejects Ctrl/Meta/Alt modifiers; Python's equivalent does not.

Suggested fix: define exact modifier combinations consistently and/or stop already handled events from reaching a second action. Preserve intentional Ctrl+Enter behavior in matrix editors.

Regression validation: modifier matrix for Enter in math fields, Python cells, command palette, and field popup inputs; exactly one intended action per shortcut.

Evidence: `more-diagnostics.json`, `modifiedEnter`.

Source-only related variant reviewed in session6: while math autocomplete is visible, the custom element's earlier capture-phase Shift+Enter handler dispatches `new-cell` and only prevents default. The later autocomplete capture handler accepts any Enter, ignores `shiftKey`/`defaultPrevented`, and can still accept a suggestion in the original field before the newly added field mounts. Thus the source path predicts a cell insertion plus unintended completion for one Shift+Enter. This modifier-arbitration consequence was not browser-reproduced; manual validation should use a partial command such as `\sq` and compare the original source before/after Shift+Enter. It shares UI-06's conflicting-handler root rather than adding a separate finding. Source: `math-field.ts` Shift+Enter listener; `ac-menu.ts::onKeydown`; `attach-field.ts::handleNewCell`; `store.svelte.ts::addCell/registerField`.

### UI-07 — Workbook write failures discard edits within the same session

Severity: **high (conditional data loss)**.

Source: `src/state/persistence.ts` `writeWorkbook` catch and `mutateWorkbook`; `src/state/store.svelte.ts:179`–197, 244–254.

Reproduce: after boot, make `Storage.prototype.setItem` throw `QuotaExceededError` only for `mathcompile-worksheets` (this simulates a full origin quota while other UI storage remains available). Enter `a` in Worksheet 1, create Worksheet 2, and switch back to Worksheet 1.

Expected: edits remain available in this running app even when disk persistence fails; the persistence catch explicitly claims it will keep running in memory. Ideally the user can export their work.

Actual: Worksheet 1 is blank again. Source analysis predicts that imports during failed writes can also become blank, because import writes the file only into storage and then reloads it through `switchWorksheet`; that additional import scenario was not independently browser-tested.

Root cause: inactive worksheets have no memory backing. `switchWorksheet` discards the live cell array and exclusively reads localStorage. Swallowed persistence failures are indistinguishable from success, so switching rehydrates stale/absent data.

Suggested fix: retain the workbook's live worksheet contents in memory and make localStorage a persistence mirror; alternatively keep a memory fallback on failed writes. Make snapshots/export use retained data as well.

Regression validation: throw on workbook writes, then edit/switch/create/import/export several sheets and confirm source survives throughout the current session. Reload durability cannot be promised when storage is unavailable, but in-session loss must not occur.

Evidence: `more-diagnostics.json`, `quotaBefore` contains `a`, `quotaAfter` contains an empty source. Failure injection does not modify product code.

### UI-08 — Disabled localStorage prevents the entire app from mounting

Severity: **medium (conditional blank screen)**.

Source: `src/state/store.svelte.ts:99`–103 and `src/App.svelte:195`–198; compare guarded access in `src/state/persistence.ts`.

Reproduce: in a fresh browser page before app code runs, define the localStorage getter to throw a `SecurityError` (equivalent to a browser denying origin storage), then load the app.

Expected: usable in-memory worksheet, with persistence unavailable.

Actual: empty body, zero `math-field` elements, unhandled `SecurityError: Storage denied`.

Root cause: `initDarkMode` accesses localStorage directly even though the persistence module already guards the same unavailable-storage case. Theme writes also bypass the guarded write path and can throw when the origin quota is full.

Suggested fix: centralize theme storage reads/writes through guarded helpers and fall back to prefers-color-scheme / in-memory state on storage errors.

Regression validation: denied getter, throwing getItem, throwing setItem, and ordinary storage; all should mount and remain editable, while ordinary persistence still works.

Evidence: `more-diagnostics.json`, `blockedErrors` and `blockedStorage`.

### UI-09 — Compound help insertions appear as literal LaTeX rather than editable math

Severity: **medium (core help insertion fails for 11 topics)**.

Source: `src/editor/attach-field.ts` `insertLatex`; `src/help/topics.ts` matrix and matrix-word-operation entries; `vendor/mathquill/src/publicapi.ts:441`–461.

Reproduce: on a blank math cell, open Search help, search for Matrix, and activate its row. Alternatively activate Rank, Inverse, Transpose, RREF, Eigenvalues, Eigenvectors, Characteristic polynomial, Column space, Diagonalize, or Adjugate.

Expected: an editable matrix/grid or upright operator, consistent with typing/pasting the corresponding mathematical input.

Actual: a single ordinary span contains the literal source, for example `\pmatrix{a&b\\c&d}` or `\mathrm{rank}`. The field's LaTeX string can look valid while its rendered/editor structure is wrong. Backspace removes the whole literal atom, and no matrix cells exist to edit. The sweep independently tested all 95 help topics carrying insertions; the 11 compound-source entries exhibit this behavior.

Root cause: `insertLatex` always calls `mq.cmd(latex)`. MathQuill's `cmd` recognizes only a bare backslash command name; all other strings fall through to `cursor.parent.write` and become a single VanillaSymbol. It does not parse arbitrary LaTeX source.

Suggested fix: use the appropriate adapter operation for bare insertion commands versus compound LaTeX. Retain command insertion where it provides placeholder/caret behavior, and parse full LaTeX with the write API where needed. Matrix insertion should also preserve the dimensions-menu focus handoff.

Regression validation: activate every compound help insertion and assert DOM/editor structure (matrix cell count, operatorname/upright block), then type/backspace inside it. Checking only the serialized source misses this defect.

Evidence: `/workspace/bug-hunt-evidence/ui/help-sweep/results.json`, `help-sweep/matrix-insert.png`; diagnostic script `e2e/hunt-ui-help-sweep.mjs`.

### UI-10 — Selecting a matrix from the symbol picker immediately cancels its dimensions menu

Severity: **medium (matrix insertion does nothing)**.

Source: `src/editor/ac-picker.ts:107`–114, especially unconditional `close()` after `mq.cmd`; `src/editor/matrix-menu.ts` focusout cancellation.

Reproduce: in a blank math cell press Ctrl+Space, filter to `pmatrix`, and click its card (or press Enter with it selected). Repeat with `matrix`, `bmatrix`, or `Vmatrix`.

Expected: dimensions menu remains open, with its rows input focused, allowing the matrix to be inserted.

Actual: dimensions input briefly receives focus and immediately loses it; both popups close and the source remains empty. All four matrix-family commands reproduced this. The `array` command instead opens its pending column-spec input, so it is a useful negative/control case.

Root cause: `mq.cmd` synchronously requests the matrix menu and focuses its input. The picker's subsequent `close()` defaults to refocusing MathQuill, which causes matrix-menu `focusout` to cancel the pending insertion. Closing one popup must not override a focus transfer initiated by the selected command.

Suggested fix: close the picker before dispatching the insertion, or suppress its final refocus when the selected command has already established another valid focus owner. Preserve selection and Escape/click-away behavior.

Regression validation: mouse and keyboard acceptance for every matrix family, commit and cancel dimensions, plus a normal symbol and a pending-spec environment. Assert the menu stays open and the inserted matrix has the chosen dimensions.

Evidence: `/workspace/bug-hunt-evidence/ui/resumed-focus/results.json`, `pickerCases`; focus traces show `mc-mat-dim` focus immediately followed by blur to MathQuill.

### UI-11 — Delayed palette refocus can defeat blur-to-nowhere dismissal

Severity: **medium (intermittent documented Escape/Vimium contract failure)**.

Source: `src/components/CommandPalette.svelte` open effect's 70ms focus reassert and `onFocusOut`'s deferred activeElement-based close check. HelpSearch uses the same pattern and should receive a corresponding regression check.

Reproduce: open the palette from a math cell and programmatically blur its focused input shortly after opening, as Vimium does while suppressing Escape keydown. The existing `e2e/escape.spec.ts` test `a blur-to-nowhere closes the palette` independently fails **2 of 15** focused repeats. A separate 112-case timing/recent-pointer matrix reproduced one failure near the refocus deadline.

Expected: a blur to body dismisses the palette, as specified by the existing smoke test and component comment.

Actual: the palette remains visible and its input is focused again. In the captured failure, initial palette focus was at performance time 29954.1ms; blur request at 30026.9ms; focusout at 30027.6ms; the input refocused at 30029.2ms with `paletteOpen` still true.

Root cause: the 70ms open-time refocus can already be queued when the user blurs. It executes before the 0ms focusout dismissal callback, so that callback sees a real active input instead of body and never closes. This is a genuine timing race; the 300ms pointer suppression in the field adapter is not the direct cause.

Suggested fix: invalidate/cancel the deferred open-time focus reassert when a dismiss-signature blur occurs, or make dismissal use the focus event's intent rather than being undone by a later programmatic focus. Keep deliberate transfers to real controls distinct from dismissal.

Regression validation: controlled blur immediately before/at/after the refocus deadline, with recent and stale pointer timestamps, both palette and help overlay; run focused repeats as well as the original smoke test.

Evidence: `/workspace/bug-hunt-evidence/ui/escape-focused.log` (2 failed/13 passed), `resumed-focus/results.json` (`blurCases`), and diagnostic script `e2e/hunt-ui-focus-resumed.mjs`.

### UI-12 — Keyboard copy/cut and paste collapses multiline editing structure

Severity: **medium**. Source: `vendor/mathquill/src/services/saneKeyboardEvents.util.ts` `unwrapDisplaylines`/`updateClipboardData`, compared with `src/compile/latex.ts` `copyableLatex`.

Reproduce: type `a`, Enter, `b` in one math cell; select all and Ctrl+C (or Ctrl+X); create another cell and Ctrl+V. The original source is `\\displaylines{a\\\\ b}`. The keyboard clipboard contains `a\\\\` + newline + `b`, and the pasted source becomes `a\\\\b` without the displaylines grid. The output-column Copy button instead retains the wrapper and round-trips correctly. Keyboard and button copying therefore disagree on a core editing operation.

Expected: preserve the two editable rows when pasting back into MathCompile. Actual: row structure is lost; with Cut, the original is already empty. Do not describe this as wholesale source erasure: the captured paste retains the two expressions but changes their editor structure.

Suggested fix: align keyboard clipboard/paste handling with the round-trip-safe representation, or explicitly recognize the unwrapped clipboard form on paste and reconstruct its rows without splitting nested matrix/Python content. Validate copy and cut, nested matrices, fractions, text, and Python blocks; check DOM row structure as well as serialized source. Evidence: `clipboard-ime/results.json`, `copy`/`cut`/`button` controls; expanded session3 campaign adds structural assertions.

### UI-13 — Converting a cell while matrix dimensions are open discards its pending selection

Severity: **high (conditional data loss)**. Source: `src/editor/matrix-menu.ts` cleanup and pending `cancel` callback, interacting with `setCellKind` and field disposal.

Reproduce: type `x+1`, select all, type `\\pmatrix`, press Enter to open dimensions, then press Alt+M twice. The pending matrix owns the replaced expression, and cancelling normally restores it. Conversion unmounts the menu without calling its pending cancel callback; both resulting cell kinds are blank, and `x+1` is lost. This is distinct from UI-01's Python text normalization: the original source is held by an in-progress editor operation before conversion even starts.

Suggested fix: resolve/cancel pending insertion transactions before destroying or converting an editor, preserving selected source where the action does not explicitly delete the cell. Regression: Escape control must restore selection, and kind conversion during the same menu must not erase it; verify subsequent worksheet persistence/export. Evidence: `clipboard-ime/results.json`, `pendingBefore`, `pendingMenu`, `pendingAfter`, `pendingBack`.

### UI-14 — Enter during IME composition executes the selected palette command

Severity: **medium**, validated with simulated standard events and subsequently CDP-driven browser composition state; a physical OS IME was not installed. Source: `src/components/CommandPalette.svelte` Enter handling; HelpSearch has the same missing composition guard.

Reproduce: open the palette, enter preedit `a`, dispatch compositionstart/update, then Enter keydown with `isComposing: true` and keyCode229. Expected: commit/continue the IME composition while leaving the palette open. Actual: the first selected command runs (Insert expression below), a second cell appears, and the palette closes. Guard command activation while composition is active; retain the separately documented Escape-to-close behavior. Regression should include a real IME/browser integration check when available. Evidence: `clipboard-ime/results.json`, `imeBefore`/`imeAfter`.

Stronger browser integration evidence: CDP Input.imeSetComposition starts preedit `a`; real Playwright Enter then emits `isComposing=true`, keyCode13, yet executes Insert expression below. See `final-targets/results.json`, nativeIme. A physical OS IME was not installed.

### UI-15 — Worksheet menu lacks Escape dismissal and loses focus when reselecting the active sheet

Severity: **medium (keyboard/menu interaction)**. Source: `src/components/WorksheetMenu.svelte` menu close/switchTo paths and `src/state/store.svelte.ts` switchWorksheet early return.

Reproduce: open the Worksheets header dropdown and press Escape; it stays open. Then choose its already-active worksheet; the menu closes but activeElement is body and typing no longer reaches an editor. Choosing a different worksheet does transfer editing focus, making the active-sheet path inconsistent.

Expected: a control advertising aria-haspopup=menu follows Escape dismissal, and explicitly choosing a worksheet returns focus to its editor. The report distinguishes this deliberate worksheet selection from clicking unrelated page space. Validation should check keyboard dismissal and same/different-sheet selections with math and Python editors. Evidence: `more-diagnostics.json` and `final-targets/results.json`, worksheetEscape/worksheetSame. These are confirmed observations promoted from the earlier unnumbered list.

### UI-16 — Converting a focused math field raises an unhandled Svelte mutation exception

Severity: **medium (unhandled runtime error; no additional data loss attributed)**. Source: `src/components/MathField.svelte` onCaretContext callback assigning help/helpShown, called by `src/editor/attach-field.ts` handleFocusOut during component reconciliation.

Reproduce: enter x+1 in a focused math field and press Alt+M. The editor converts to Python, but window.pageerror reports state_unsafe_mutation. The captured stack goes through onCaretContext, handleFocusOut, remove_effect_dom, destroy_effect, and keyed component reconciliation. One error was captured for this isolated real-keyboard action in final-targets. Large diagnostic campaigns reproduce it hundreds of times when focused fields are removed/replaced.

Expected: normal editor conversion does not throw an unhandled framework exception. State writes caused synchronously by teardown focus events must respect Svelte's reconciliation rules and component lifetime. No separate visible loss is claimed solely because this error occurred. Validate actual Alt+M conversion, focused row removal and clear/switch operations while observing pageerror. Evidence: `final-targets/results.json`, altM.errors, plus original diagnostic stacks. This promotes the earlier exception observation into an explicit confirmed issue.

### UI-17 — Autocomplete arrow navigation selects rows outside the visible dropdown

Severity: **medium (keyboard autocomplete becomes invisible)**. Source: `src/editor/ac-menu.ts` onKeydown toggles sel classes without scrolling the selected option into view; `.mc-ac` CSS caps its height.

Reproduce: focus a blank cell, type a bare backslash to show the eight default suggestions, then press ArrowDown seven times. The Sum option is selected but completely below the scroll viewport. At 1280×900, the menu ends at 333.7 px while the selected row spans 484.75–556.53px; scrollTop remains 0 (scrollHeight 420, clientHeight 193).

Expected: the keyboard-selected suggestion stays visible as navigation proceeds. Add selection-aware scrolling without letting descendant scroll handling dismiss/rebuild the menu unexpectedly. Validate tall previews, Up/Down wrapping, and both themes. Evidence: `final-targets/results.json`, autocomplete geometry.

### UI-18 — Math search overlays drop the selection before settled insertion

Severity: **medium (selected-command semantics lost); browser-confirmed**.

Source: `src/editor/ac-picker.ts` input focus/accept dispatch; `src/components/HelpSearch.svelte` input focus and activation; vendored `services/focusBlur.ts::handleTextareaBlurEditable` clears the editor selection in its deferred intentional-blur path.

Reproduce: enter `1+2`, select all, open Ctrl+Space, type `frac`, and select Fraction. Instead of wrapping the selected expression as `\frac{1+2}{ }`, the picker inserts an empty fraction before the unchanged expression (`\frac{ }{ }1+2`). The selection transaction is lost, not the expression itself.

The same settled boundary occurs through math-only help: select `1+2`, open Ctrl+/, type `fraction` at an ordinary 40 ms per character and activate the result. DOM evidence shows one selection before opening and zero before acceptance; the result is again an empty fraction plus1+2. A native focused `/` control wraps the selected expression correctly. An immediate fill+Enter help control can activate before deferred blur and preserve the selection, so help behavior has a timing boundary; this report does not claim every fast activation fails.

The earlier settled sweep covers207 commands × four smart/theme combinations:824 of828 selected-expression cases differ from focused-command controls. Empty/nested differences primarily reduce to the separate matrix-menu handoff. Preserve/restore selection across popup focus before commands that consume selected content; validate both fast and settled help/picker acceptance, fraction/root wrappers, replacement operators and matrix first-cell previews.

Evidence: `selected-help.json`, `math-settings.json`, picker-contexts issue files and `final-targets/results.json` selectedPicker. The later controls use only ordinary mathematical input; no code-context workflow was repeated.

### UI-19 — Help/picker insertion inside raw text blocks throws and can corrupt source

Severity: **high (source corruption)**. Sources: `src/editor/attach-field.ts:146`–149 (`insertLatex`), `src/editor/ac-picker.ts:107`–114, and `vendor/mathquill/src/commands/math/pythonBlock.ts:199` onward / TextBlock blur/fusion.

Reproduce in a fresh worksheet: enter `\python{x = 1}`, put the caret inside its code, open Search help, choose Fraction, and press Enter. Alternatively open Ctrl+Space from inside the block and choose Fraction. The same unsupported insertion occurs inside ordinary `\text{abc}`.

Expected: source stays intact; a command that cannot be inserted into plain code/text should be declined or inserted as literal text. Actual: an unhandled `prayer failed: Fragment has a single node` exception occurs. The help path changes source to `\python{undefinedx = 1}`; the picker also throws and leaves an invalid editing operation. The error stack reaches TextBlockFuseChildren / PythonBlock.blur from MathCommand.createLeftOf.

Root cause: the UI identifies only the cell kind, not the caret's raw-text context. `mq.cmd` constructs math-command nodes directly inside a TextBlock/PythonBlock whose children must be text pieces. Subsequent fusion/serialization cannot handle those nodes. This is distinct from UI-09: compound strings take the literal character-write path, while bare math commands construct incompatible nodes.

Boundary validation: all 95 help insertions were tested in five contexts (475 cases ). 76/95 throw in both inline Python and ordinary text; 45 Python and 35 text cases serialize `undefined`. Roman/fraction/matrix control contexts have zero runtime/source-corruption failures in that sweep. API-reference exceptions found earlier were excluded until these actual UI paths reproduced the problem.

Suggested analysis: make insertion context-aware and preserve raw source when math structures are unsupported. Validate actual help/picker actions at the beginning/middle/end of text/code, both rejected and literal paths, and reload/export after insertion. No change was implemented.

Evidence: `session4/results.json`, picker/help errors and source; `help-contexts/status.json` and issue files; diagnostic scripts `e2e/hunt-ui-session4.mjs` and `e2e/hunt-ui-help-contexts.mjs`.

### UI-20 — Failed clipboard writes still display success

Severity: **low (false success feedback)**. Sources: `src/App.svelte` copyText/copyLatex/copyCode/copyScript, with similar unconditional copied-state patterns in CopyButton/AgentPromptButton.

Reproduce: use CDP Browser.setPermission with descriptor `name: clipboard-write` and setting `denied` for the test origin, enter `x+1`, and click its LaTeX Copy button. Transparent diagnostic wrapping of the real API recorded the actual `writeText('x+1')` promise rejecting with NotAllowedError, while the button showed Copied.

Expected: success is displayed only after a successful write; rejected writes leave an accurate status. Actual: the rejection is swallowed and copied-state is set unconditionally. This report does not claim the permission query itself returned denied (Chrome reported prompt); the actual native API rejection under the real click is the evidence.

Validate rejected and fulfilled clipboard promises for each copy affordance. The directly reproduced control is LaTeX Copy; other controls share the same code pattern but were not all independently permission-tested. No change was implemented.

Evidence: `session4/results.json`, deniedClipboard.label/outcomes; wrapper calls the real API synchronously and records its original result without changing success/failure behavior.


### UI-21 — Cell ID collisions make another worksheet inherit undo/redo history

Severity: **high (cross-sheet source corruption); browser- and pure-unit-confirmed**.

Source: `src/state/store.svelte.ts:52`–92 (`nextId`, `hydrateCells`, `initWorkbook`), `src/App.svelte` keyed cell each-block, `src/components/MathField.svelte` external-value effect, and vendored `services/latex.ts:591`–605 / `services/undo.ts:96`–100.

Ordinary reproduction, using only menu actions and arithmetic:

1. Worksheet A has cell1 containing1. Create Worksheet B, whose cell2 contains3.
2. Return to A and reload. Add a second A cell; it is assigned2, colliding with inactive B's cell2.
3. In A's new cell type `1+2`, press ArrowLeft to break the undo burst, then type3. The cell now contains `1+32`; its previous history entry is `1+2`.
4. Switch to B, which correctly displays3. Press native Ctrl+Z.
5. B changes to A's `1+2`, and reloading preserves the corrupted B source `1+2`.

Expected: B cannot undo into A's editor history. Actual: the numeric allocator is advanced only from active A on reload, contrary to the promised workbook-wide uniqueness. The keyed each-block retains the colliding id2 MathField across sheets. Setting B's value rebases lastEdit but retains undoStack/redoStack, so B inherits A history. Both append and import-remapping collisions have additional pure-unit evidence.

Controls reduce the consequence precisely: a non-colliding-ID sequence keeps B3 unchanged. A digit-only A history21→1 also leaks into B, and a redo history leaks21, but UI-27 prevents those efficient numeric restorations from notifying the store: reload without another edit restores saved B3. Ordinary subsequent typing 4 after the leaked1 writes14 and reload preserves14. The prefix-changing `1+2` restoration above takes the reconstruction path, notifies immediately, and persists cross-sheet corruption without another edit. No runtime exception occurred in these isolated cases. Id-keyed frozen-code/issue cache consequences remain unverified and share this root.

Suggested correction: establish global ID uniqueness from every stored sheet at boot and keep editor-local history scoped to worksheet identity. Regression validation must use a real module/page reload with the low-ID sheet active, then test native undo/redo, visible output, stored source and another reload across both numeric and prefix-changing histories. Do not rely on multiple AppStore instances sharing one module allocator.

Evidence: `final-local-ui21-undo-prefix.json`, `final-local-ui21-undo.json`, `final-local-ui21-redo.json`, `final-local-ui21-control.json`, `final-local-ui21-undo-edit.json`; untracked diagnostic `e2e/hunt-ui-final-local.mjs`. Unit evidence: `pure-unit-session7-final.log` and `src/state/hunt-ui-pure.test.ts`. All browser records use disposable local data and ordinary UI actions; no product implementation changed.

### UI-22 — Legacy migration deletes its saved copy even when replacement writing fails

Severity: **high; source-derived**. Confidence: the write/catch/remove control flow is established from source and later confirmed in a permitted Node-only test with in-memory Storage. No browser failure injection was performed in these narrowed phases. Source: `src/state/persistence.ts` writeWorkbook and readWorkbook legacy migration branch; `src/components/MathField.svelte` / attach-field setValue canonicalization feedback.

Preconditions: a valid prior-version mathcompile-cells record exists, no valid new workbook exists, and writing its replacement throws (for example quota cannot accommodate both copies). writeWorkbook catches the error and returns void. readWorkbook then unconditionally removes mathcompile-cells and returns the migrated sheet in memory. The only saved source can therefore be removed although the replacement was never persisted.

Expected: failed migration preserves the last valid stored copy. Source-derived actual state: the legacy key is removed and the replacement is absent. With canonical unchanged source such as x+1, MathField does not report a normalization change, so boot need not schedule another cell write. Closing/reloading can then lose the worksheet. This is distinct from UI-07's in-session switching loss: an in-memory fallback alone would not protect the saved legacy copy across page close.

Browser validation, not executed: seed a valid legacy record and make only replacement-workbook writing fail while reads/removal remain permitted. Boot with canonical source, inspect both storage keys, then reload without editing. No fault-injection harness was created during this source-only phase.

Evidence: `/workspace/bug-hunt-evidence/ui/source-review.md`, migration control-flow trace. A later permitted Node-only unit test with in-memory Storage confirms the failed replacement removes both saved copies and a second load returns null; see `pure-unit-session7.log` and diagnostic `src/state/hunt-ui-pure.test.ts`. No browser consequence was newly tested.

### UI-23 — Matrix dimensions display values different from the inserted size

Severity: **low (incorrect input feedback); browser-confirmed lower boundary, source-derived upper boundary**.

Source: `src/editor/matrix-menu.ts::clampDim`, `refresh`, `commit` and `onInputKeydown` (particularly140–146).

Ordinary small-value reproduction: type a matrix command to open dimensions, set rows to 1 and press ArrowDown. The input visibly becomes0, while the preview still has one row. Enter commits a one-row matrix. Actual evidence records rows="0", columns="2", previewRows=1, then source `1+2\begin{pmatrix}&\end{pmatrix}`. No page error occurred.

Root cause: stepping assigns `clampDim(oldValue) + delta` directly to the input, while preview and commit separately clamp the displayed result into 1–50. Source analysis likewise predicts ArrowUp from 50 displays 51 but inserts 50; that larger boundary was not browser-tested in the later small-value task. Directly typed out-of-range values share silent-clamping feedback, not an out-of-range allocation.

Expected: show the size that will be inserted or explicitly mark invalid input. Suggested correction: constrain the step result and align direct-entry validation with committed dimensions. Regression validation should cover both dimensions at both boundaries, including displayed value, preview and inserted size. Large-preview own-scroll dismissal remains UI-04, not another finding.

Evidence: `matrix-boundary.json`, `matrix-zero-boundary.png`; untracked `e2e/hunt-ui-matrix-boundary.mjs`. Earlier source trace remains in `source-review.md`.

### UI-24 — Worksheet filename import removes a .json suffix belonging to its basename

Severity: **low (worksheet name is changed); source-derived and pure-unit confirmed, not browser-reproduced**.

Source: `src/state/worksheet-file.ts:60`–64, called by `readWorksheetFile`; export filename construction at lines67–74.

Reproduction path: name a worksheet `draft.json`, save it to file, and open the unchanged exported `draft.json.mathcompile.json`. Export construction preserves the valid original basename and appends `.mathcompile.json`. Import first removes that suffix and then also removes the remaining `.json`. The imported name becomes `draft` (or its duplicate-name suffix), instead of preserving basename `draft.json`. The embedded original name does not repair this because the shortened stem is nonempty. Uppercase `.JSON` and repeated `.mathcompile.json` basenames share the issue. Cell source content is unaffected.

Expected: strip one recognized export/file suffix, preserving the rest of the basename. This follows the function's explicit “.mathcompile.json (or bare .json)” contract. Actual pure-unit evidence: `worksheetFileName('draft.json') === 'draft.json.mathcompile.json'`, then `worksheetNameFromFile(exported, 'draft.json') === 'draft'`.

Suggested correction: choose the longest matching suffix once. Regression validation: round-trip legal names ending in `.json`, `.JSON`, `.mathcompile.json`, and ordinary dotted names; keep embedded-name fallback when stripping the single suffix leaves no usable stem. No implementation or browser probe was performed.

Evidence: `pure-unit-session7.log`; diagnostic `src/state/hunt-ui-pure.test.ts`, filename normalization boundary group. Tests explicitly assert observed defect states, so their passing result is evidence of reproduction, not a product fix.

### UI-25 — Help search ranking tiers overlap contrary to their documented ordering

Severity: **low (search ranking); source-derived and pure-unit confirmed, not browser-reproduced**.

Source: `src/fuzzy.ts:49`–83; applied to topic fields by `src/components/HelpSearch.svelte::scoreTopic`.

The matcher explicitly documents `contiguous substring > every char at a word start > loose subsequence`. Its position penalties overlap those categories: a late mid-word substring can score1, a word-start subsequence can score up to59, and a long-span word-start subsequence can itself fall below a loose match. Thus the intended preference for visible contiguous matches is not maintained within this helper.

Pure-unit reproduction using current catalog fields: query `re`; Greek keywords contain the actual substring at the end of `... omega greek` and score1, while Solve keywords `roots equation find x solveset system` match separate word starts and score54. Both results also reproduce with `loose:false`. A bounded sweep of367 existing fields and556 catalog word queries finds seven queries with a lower documented tier above a contiguous match. No artificial long input is required.

Expected: the documented tier order holds, with position/span used within a tier. Actual: penalty magnitudes can reverse the tiers. The final displayed topic order also depends on field weights and pin boosts; no particular selected browser row or aggregate ranking was newly tested. Suggested correction: use non-overlapping tier bases with bounded within-tier penalties, or explicitly revise the intended ranking contract. Regression validation should include late substrings and wide word-start subsequences from the real catalog.

Evidence: `registry-unit-session8.log`; diagnostic `src/hunt-ui-registry.test.ts`, named UI-25 reproduction and bounded ranking sweep. Tests assert the observed inverted scores, not a fix.

### UI-26 — Character-labelled global shortcuts require physical codes

Severity: **low (conditional keyboard compatibility); source-derived callback behavior confirmed, layout-specific UI consequence unverified**.

Source: `src/editor/keymap.ts:15`–25. Advertised character contracts: `USER-GUIDE.md:26` and keyboard reference at578–584, `AGENTS.md` command-palette section, `src/commands.ts` shortcut hints, and the header's Ctrl+/ help title. Reviewed documentation/comments do not state an intentional physical-key convention.

Proven local behavior: the handler compares `e.code` with `KeyK`, `Slash`, `KeyM`, and `Enter`, ignoring `e.key`. Plain in-memory callback records show that `{key:'/', code:'Digit7', ctrlKey:true, shiftKey:true}` does not open help and `{key:'k', code:'KeyV', ctrlKey:true}` does not open the palette. Conversely, different actual characters with physical codes `Slash`/`KeyK` activate those actions. Likewise `{key:'Enter',code:'NumpadEnter',altKey:true}` does not insert Python, while the otherwise identical `code:'Enter'` record does.

Expected under the displayed character-labelled shortcuts: character-equivalent key events trigger the advertised action. The conditional concern is that keyboards producing a different physical code for the advertised character will require a different shortcut, and numeric-keypad Enter is treated differently. These records establish handler decisions only: **no real international layout, OS mapping, browser keyboard event, or physical input was tested**. If physical-code semantics are intentional, this should instead be documented and labelled as a compatibility limitation.

Suggested correction: explicitly choose and consistently document character versus physical-key semantics, then make displayed shortcuts and handling agree. Regression validation should cover character/code divergence and main versus numeric Enter without claiming a locale is supported from callback records alone.

Evidence: `registry-unit-session8.log`; diagnostic `src/editor/hunt-ui-keymap.test.ts`. It uses a plain window callback-registration stub and event-shaped records, with no DOM dispatch or operating-system probe.

### UI-27 — Numeric native undo changes the field but leaves output and saved source unchanged

Severity: **high (editor/output/persistence disagreement); browser-confirmed**.

Source: `vendor/mathquill/src/services/latex.ts::updateLatexMathEfficiently` (roughly397–559), `renderLatexMath` (591–605), `services/undo.ts::restoreHistoryEntry`, `services/keystroke.ts:162`–170; app edit synchronization is the `edit` handler in `src/editor/math-field.ts` and `attach-field.ts::handleInput`.

Reproduce in an ordinary LaTeX-target math cell:

1. Clear the seed, type1, press ArrowLeft, then type2. Both input and output show21.
2. Press native Ctrl+Z. The input becomes1, but visible LaTeX output remains21.
3. Reload. The input and output both become21; the undo was never saved.

Additional literal controls: `1+23` undoes visually to `1+3` while output/reload retain `1+23`; `1.32` undoes to `1.2` while output/reload retain `1.32`. A prefix-changing control `2+1`→1 updates output and persists1 correctly. No page errors occurred.

Expected: native undo updates the app source, output and persistence to the same restored expression. Actual root cause: restoration uses programmatic renderLatexMath. Its efficient trailing-number path updates digit nodes and returns without the edit/reflow notification that reconstruction emits; restoreHistoryEntry does not independently notify the app. MathQuill's field value changes, but the store and outputs retain the pre-undo source. Later unrelated real typing can synchronize the new editor value; reload before that loses the apparent undo. The app's copy paths use the store, so source inspection predicts stale copied output, but no clipboard operation was tested here.

Suggested correction: ensure undo/redo restorations notify the app exactly once regardless of rendering path, while retaining programmatic hydration/history semantics. Regression validation must compare field, store/output and persisted source after native undo/redo of trailing numbers, decimals/signs and changed prefixes. Tests that assert only MathQuill latex miss this failure.

Evidence: `literal-undo.json`; untracked diagnostic `e2e/hunt-ui-literal-undo.mjs`. The earlier2,592 structural-undo cases correctly passed the reconstruction path; they did not rule out this separate efficient numeric path. No product fix was implemented.

### UI-28 — Undo restores a stale caret position from before the last caret move

Severity: **medium (subsequent input lands at the wrong location); browser-confirmed**.

Source: `vendor/mathquill/src/services/undo.ts::noteEdited`, `breakUndoBurst`, `undo`, `restoreHistoryEntry`, and the move/select notification hook. `lastEdit` stores the caret after the previous text edit. Moving the caret ends the burst but does not refresh that baseline caret before the next edit is recorded.

Ordinary native-key reproduction:

1. Enter `1+2`, press Home, then type `3+`. The input becomes `3+1+2`; the edit began at the start.
2. Press Ctrl+Z. Source and visible output correctly return to `1+2`, but the caret is after the final2, rather than at the undone insertion point before1.
3. Type4. The result is `1+24`, rather than `41+2` at the restored insertion point.

A numeric control12, Home, type3 likewise restores12 with the caret at its end, so subsequent 4 produces124 instead of412. A cross-block control is stronger: enter1/2, ArrowUp to the numerator, type3, then Undo. The fraction restores but the caret jumps to the denominator; subsequent 4 produces `\frac{1}{24}` instead of `\frac{14}{2}`. For1^2, ArrowDown to baseline, type+3 and Undo, the caret returns inside the exponent, so4 produces `1^{24}` instead of a baseline insertion. The prefix-changing `1+2` case has synchronized source/output and therefore separates this caret defect from UI-27. An End-position insertion/undo control returns to the expected end position. No page errors occurred.

Expected: undo restores the caret associated with the edit being undone, including a caret move made before that edit. Actual: the stack's source snapshot is correct but its caret comes from the earlier text mutation, before the move. Existing structural tests check caret validity; that does not establish the correct block/offset.

Suggested correction: capture the current pre-edit caret when starting a new undo entry after movement, rather than reusing the previous edit's caret. Regression validation must check exact insertion position and subsequent typing after Home/End, mouse/cross-block movement and undo/redo, while separately checking source/output/persistence. No fix was implemented.

Evidence: `undo-caret.json` and `undo-caret-blocks.json`; untracked diagnostics `e2e/hunt-ui-undo-caret.mjs` and `e2e/hunt-ui-undo-caret-blocks.mjs`. All actions use native typing/navigation/undo on small literal arithmetic in disposable local contexts.

### UI-29 — Settings tooltips remain hidden from the accessibility representation

Severity: **medium (explanatory help unavailable through accessible metadata); browser/source-confirmed**.

Source: `src/App.svelte:420`–445 and513–540; `.info-tip` focus/hover styling in `src/index.css`.

Reproduce in read-only Python code preview with ordinary `1+2`: open Settings and focus “About the import setting” or “About the (a,b) setting”. CSS makes each explanation visible (recorded opacity0.706/0.939 during its fade), but its `role="tooltip"` element remains `aria-hidden="true"`. The trigger has only a generic “About…” name and no `aria-describedby`. Browser accessibility snapshots contain that button name and omit the explanatory text; accessible tooltip count is zero.

Expected: the information shown on focus is also exposed as the trigger's accessible description or equivalent text. Actual root: visual CSS disclosure never changes hardcoded accessibility hiding or supplies an equivalent description. Smart mode's full explanatory accessible label is a source-level positive contrast; a generic “About…” label does not provide the settings explanation.

Suggested correction: associate accessible help text with each trigger and expose it consistently with the visual disclosure. Regression validation should inspect accessible descriptions for keyboard focus and hover, with representative help content. No physical screen reader or OS accessibility tool was tested.

Evidence: `settings-tooltips.json`; untracked `e2e/hunt-ui-settings-tooltips.mjs`. Code was generated as read-only text, not executed; blocked-external and error arrays are empty.

### UI-30 — Math completion keyboard selection changes only CSS state

Severity: **medium (current completion unavailable through accessible state); browser/source-confirmed**.

Source: `src/editor/ac-picker.ts:30`–68, move/onInputKeydown; `src/editor/ac-menu.ts:105`–120. Both handlers change `.sel` classes without option selection metadata, an active-descendant relationship or a selection announcement.

Reproduce: open the symbol picker on ordinary math, search `root`, and press ArrowRight. The visible selection changes nthroot→sqrt. Inline autocomplete similarly changes sqrt→sum on ArrowDown after typing a normal backslash prefix. In both cases, popup accessibility snapshots remain identical. The focused input/textarea has no active-descendant/expanded/controls relationships for this popup, and selected cards have no option role, ID or `aria-selected` state. Native textbox semantics alone do not identify the selected candidate.

Expected: accessible selection/announcement tracks the choice that Enter will insert. Actual: keyboard focus stays in the text input while only visual classes move; the implementation supplies no equivalent current-choice update. Help search is a positive control: its active-descendant and selected-option representation change on navigation. This is independent of UI-17's off-screen visual selection.

Suggested correction: provide a coherent accessible completion/list selection pattern or an equivalent live announcement for both math completion surfaces. Validate before/after accessible state, focus and insertion, using small visible candidate sets. No physical screen-reader behavior is inferred beyond the missing browser representation.

Evidence: `completion-aria.json`, positive control in `prompt-aria.json`; untracked `e2e/hunt-ui-completion-aria.mjs`.

### UI-31 — Palette prompt mode references a listbox and option that no longer exist

Severity: **low (incorrect accessible widget state); browser/source-confirmed**.

Source: `src/components/CommandPalette.svelte::pick`, prompt/list conditional rendering, and input attributes165–169.

Reproduce: open Commands and choose Rename worksheet. The listbox is removed for the text prompt, but the input remains `role="combobox"`, `aria-expanded="true"`, `aria-controls="palette-list"` and, for the default worksheet name, `aria-activedescendant="palette-opt-0"`. Both referenced elements are absent; the prompt contains zero listboxes. The accessibility snapshot reports an expanded combobox even though this mode is an ordinary text-confirmation prompt.

Expected: accessible state describes the current mode and references existing elements. Actual root: list-mode attributes are unconditional although the list renders only when not prompting. Escape restores the list and valid references, confirming the conditional mismatch; arithmetic source is unchanged.

Suggested correction: make role/state/relationships conditional on prompt versus list mode. Regression validation should cover Rename and numeric settings prompts, existing references, focus, and Escape/submit transitions. No physical assistive-technology interaction was tested.

Evidence: `prompt-aria.json`; untracked `e2e/hunt-ui-prompt-aria.mjs`. Before/after control existence and accessibility snapshots are recorded.

### UI-32 — Matrix context advertises row insertion while an open command consumes Enter

Severity: **low (incorrect contextual instructions); browser-confirmed**.

Source: `src/editor/context-help.ts::readHelpContext` checks `.mq-matrix` before `.mq-latex-command-input`; `HELP_ENTRIES['inside-matrix']` says Enter adds a row below. Open command input has its own acceptance context, consistent with the documented Enter exception.

Reproduce: create a normal 1×1 matrix and type `\sqrt` without accepting it. One command input is open, but the visible caret-help strip says “Enter add row below”. Press Enter: sqrt is accepted inside the existing cell, the command input closes, and the matrix remains one row. The instruction describes an action that this keypress cannot perform in the current state.

Expected: command-acceptance context takes precedence while a command input owns Enter. Actual root: matrix ancestry wins before the more specific command-input test. Suggested correction: align hint precedence with actual key ownership. Validate command input inside a matrix, ordinary matrix editing, and the hint after acceptance. No product behavior needs to be inferred from a screenshot alone: before/after row and command-input counts are recorded.

Evidence: `matrix-command-hint.json`, `matrix-command-hint.png`; untracked `e2e/hunt-ui-matrix-command-hint.mjs`. No page errors or non-local requests occurred.

### UI-33 — Output-column resizing is pointer-only

Severity: **medium (keyboard functionality unavailable); browser/source-confirmed**.

Source: `src/App.svelte::startColDrag` (35–61), separator markup652–658 and output-width binding288; `.two-col .col-resize` styling. `outputPct` has no keyboard/alternative UI mutation path.

Reproduce in ordinary LaTeX output with `1+2`: navigate to the end of the math field and press Tab. Focus skips the resize separator and goes directly to Copy (no copy action was invoked). The interactive handle is a DIV with tabIndex−1, no tabindex attribute, no keyboard handler and no current/min/max value metadata. A normal 50 px pointer drag changes output width624→674px and the shared width to54.0064%, proving the resize function is available by pointer.

Expected: the same one-dimensional resize function is available through keyboard focus and controls. Actual root: only pointerdown/move/up implement resizing; the labelled separator cannot receive ordinary sequential keyboard focus and has no keyboard equivalent. This is a functionality gap, not merely an optional styling preference.

Suggested correction: provide a focusable keyboard-operable resize control with appropriate value/range information, preserving the shared per-row width behavior. Validate keyboard and pointer changes, bounds and focus, without invoking clipboard actions.

Evidence: `column-keyboard.json`; untracked `e2e/hunt-ui-column-keyboard.mjs`. Arithmetic source remains `1+2` and no page error or external request occurred.

### UI-34 — Debounced help navigation can retain a negative selection after results appear

Severity: **medium (keyboard activation stops working); browser-confirmed**.

Source: `src/components/HelpSearch.svelte` query debounce14–26, selection88, keydown198–214 and input reset260. ArrowDown clamps against the rendered rows, while Enter uses live-query results.

Reproduce:

1. Search help for `zzzz` and let the no-result state appear (zero options).
2. Replace it with `root`, using ordinary 40 ms-per-character typing, then immediately press ArrowDown before the 120 ms debounce applies the new results.
3. Let the 13 matching rows appear. None is selected and the input has no active descendant. Enter does nothing: help remains open and math remains `1+2`.
4. Another ArrowDown creates a valid selection; Enter then closes help and inserts the square root normally.

Expected: once nonempty results appear, navigation/activation has a valid selection. Actual root: after the query's input reset sets index0, ArrowDown still sees old rows.length0 and stores `Math.min(1,-1) === -1`. Neither the selected-row derivation nor live Enter lookup lower-clamps it, and arrival of the new results does not normalize it. This is a post-reset debounced-navigation path, not the earlier ruled-out hypothesis that input fails to reset the index.

A normal command-palette no-result→new-query+Down control has four live options and one valid selection, reducing the persistent failure to help's debounced row transition. Suggested correction: keep navigation and activation indices valid as result sets change, including empty states. Validate no-result→valid query with immediate Up/Down, settled selection, Enter, query clearing and normal live-query activation.

Evidence: `help-empty-navigation.json`, `help-navigation-control.json`; untracked `e2e/hunt-ui-help-empty-navigation.mjs` and `e2e/hunt-ui-help-navigation-control.mjs`. No page error, code execution or non-local request occurred.

## Coverage and validation

- Read AGENTS.md, indexed/navigated with CodeGraph, traced editor/store/persistence/menu boundaries, and reproduced findings in real headless Chromium using isolated Vite caches during the earlier authorized execution phases. Sessions5–6 used local source/evidence only. A later narrowed task permitted pure Node unit tests; UI-22/UI-24/UI-25/UI-26 are source/unit or conditional findings; UI-21 and UI-23 were subsequently browser-confirmed in the narrowed ordinary task. Pure-unit evidence complements the indicated findings without implying browser coverage.
- UI/state baseline unit subset:86/86 pass across store, persistence, completions, and fuzzy tests. Parent owns repository-wide baseline checks.
- Separately authorized pure Node diagnostics:24 checks pass across `src/state/hunt-ui-pure.test.ts` and `src/state/hunt-ui-model.test.ts`; final log `pure-unit-session7-final.log`. They use in-memory Storage only, without DOM/browser/network/OS probes. UI-21/UI-22/UI-24 defect tests explicitly assert observed bad states; passing means reproduction, not a product fix.
- The new pure-state model checks1,200 deterministic mixed-operation sequences,64 steps each (76,800 operations),12 action families, and up to8 sheets. Independent source/kind/name/persisted-sheet identity expectations, explicit pending timer advances, stored-sheet existence/count checks, and removal/rename/import sequencing found no additional mismatch. This does not repeat the reload allocator path: the module allocator remains live, and reload is separately covered by UI-21's targeted unit.
- Eight raw Python source fixtures—including CRLF, tabs, Unicode/astral/combining characters, escapes, whitespace, NUL and line separators—retain exact strings through file serialization/import, switching, and in-memory persistence. No textarea/DOM encoding inference is made.
- Expanded registry/command/preferences diagnostics:12 checks across `src/hunt-ui-registry.test.ts`, `src/state/hunt-ui-help-commands.test.ts`, and `src/editor/hunt-ui-keymap.test.ts`; all pass. Negative results cover registry ID uniqueness/default references, visible ASCII goal matching/highlighting, pin/hide/restore and custom-pin preservation, deliberate empty/unknown-ID preferences, enabled target/current-command agreement, all settings toggle/pair modes, four numeric prompt ranges, false/zero preference round-trips, and exact ordinary command-title ranking. UI-25/UI-26 tests explicitly assert observed problematic states. No clipboard/open-window/download command was invoked.
- Cross-mode help indexing, the terse New line help wording, generic Unicode highlight boundaries, and permissive numeric prompt parsing were inspected. Their intended contracts/current user-visible consequences are insufficiently established for additional findings; no arbitrary malformed preferences, fabricated registry entries, OS layout mappings, or DOM behavior are claimed as tested.
- Original stateful workflow campaign:21,893 actions/739 scenarios;323 action pairs/5,460 triples, covering source editing, mixed cell insertion/deletion/duplication, worksheet creation/switch/rename/import/export, palettes/help, target changes, and reload. No worksheet/source-model mismatches after the corrected import wait. Invalid-focusedId failures reproduce UI-02.
- Session2 stateful follow-up:829 logged actions before a manual probe.
- Help insertion sweep:95 insertions;11 compound inputs demonstrate UI-09.
- Escape focused repeats:2/15 fail; separate112-case timing/pointer matrix reduces the UI-11 refocus race.
- Expanded clipboard search:3,222 cases (3,155 clipboard cases,67 successful picker controls). Whole-cell multiline keyboard copies fail across nested fractions/matrices/text/Python; Copy-button, single-line, matrix-only, and prefixed-multiline controls pass.
- Settled command/context sweep:3,319 retained cases; selected-expression parity checks establish UI-18. Incompatible inline-Python API-reference controls were excluded until actual UI paths independently reproduced UI-19.
- Structural undo/redo:2,592 cases across six row/column sizes, first/middle/last caret cells, six row/column operations, and bare/prefixed/fraction/multiline nesting. Zero undo-source, redo-source, caret-validity, or store/DOM mismatches. These structural cases cover reconstruction; UI-27 later confirms a separate unnotified efficient numeric restoration path.
- Raw-text boundary sweep:475 actual help actions,95 per caret context (inline Python, ordinary text, roman, fraction, matrix). UI-19 occurs only in the two raw-text contexts.
- Additional earlier-phase controls: native composition state, real clipboard rejection, same/different worksheet selections, modal Tab trapping (passes), disabled storage, workbook quota failure, and Python overlay caret restoration. These earlier capabilities were not reused in the later narrowed task.
- Later explicitly authorized ordinary local-browser controls: native numeric undo/persistence, cross-sheet undo/redo and ID-collision controls; worksheet rename autofocus works, Escape cancels without renaming, Enter commits, and Tab recovers to the worksheet row. Native menu ArrowDown/Escape gaps and post-rename focus loss share UI-15. Palette↔help transitions, Search help command activation and overlay dismissal restore focus and preserve arithmetic source, with no page errors. Evidence `normal-menus.json` and `focus-transitions.json`.
- Session11 bounded native-edit coverage:81 scenarios across nine literal arithmetic forms, Home/End/ArrowLeft and digit/Backspace/Delete edits.57 edits changed source;24 no-ops were excluded from undo assertions. Undo/redo source restoration, cursor existence and subsequent typing all pass.23 output mismatches reduce to UI-27; no additional failure class or page error occurred. Exact caret position is separately covered by UI-28. Evidence `native-undo-boundaries.json`; no saturated parameter count resets the progress timer.
- Session12 normal math/menu controls: selected pending matrix transactions cancel and restore1+2 before duplicate, theme change, text-code preview, worksheet switch, rename and delete. Expected source/focus outcomes pass; code preview is generated text only. Evidence `math-menu-transitions.json`.
- Smart-mode off/on affects future sqrt typing without rewriting existing text; the off preference persists on reload. Import style, pair-tuple matrix mode,50ms fade setting, dark theme and unchanged tuple source round-trip correctly in read-only code preview. No external request or execution occurs. Evidence `math-settings.json`.
- New browser/metadata findings UI-29–34 have bounded evidence and positive controls, not parameter-only counter inflation. UI-23's lower boundary was upgraded with normal small dimensions. Help's settled selection-loss boundary extends UI-18 without adding an ID. Accessibility snapshots establish browser semantics only; physical screen readers and OS layouts were not exercised.
- An initial normal-menu diagnostic attempted to click the header toggle under the open backdrop; Playwright correctly rejected the covered target. Actual backdrop dismissal was then used. This is a harness targeting issue, not a new product defect.

## Limits, exclusions, and artifact notes

- Chromium was tested; cross-browser/mobile and physical OS IME behavior are not inferred. CDP-driven browser composition did reproduce UI-14.
- Initial import assertions sampled asynchronous file reads too early; the calibration run is explicitly a harness false positive. Corrected stateful runs wait for worksheet activation.
-140 picker-open observations in the early expanded campaign followed pending fixture scroll events; they are excluded as harness timing observations. Settled context probes were used afterward.
- Routine state_unsafe_mutation errors are recorded separately from model failures; UI-16 has its own isolated physical-keyboard reproduction. No unrelated data loss is attributed to that exception.
- Ctrl+ArrowUp leaving a Python first line is an unresolved usability-contract observation, not a confirmed defect or required change.
- Source-only remaining hypotheses: a pure focus-handle stub test confirms an explicit focusEdge survives successful focus and noteFocus of another cell until that cell registers, but the intended conversion-caret contract and visible consequences remain unspecified/unverified; disconnected MathQuill cleanup consequences need runtime evidence; geometry-dependent help selection visibility is unverified. The separate debounced post-reset navigation failure was later reproduced as UI-34. None is claimed as another finding. Rendering owns the independently investigated focus-before-edge scroll geometry issue as R26.
- Bounded source conclusions: worksheet deletion correctly flushes before removal and switches away from an active deletion; normal import remaps IDs. Palette/help transitions clear the other overlay flag, and deferred focus paths recheck their own openness. Conversion remounts the editor and therefore creates a new undo history; collision-driven component reuse is specifically UI-21. Existing store tests instantiate multiple stores in one module and do not reset nextId as a real reload would, while worksheet browser reload coverage restores the newer/high-ID sheet; neither rules out UI-21.
- The palette Tab-trap hypothesis was ruled out: the palette remains open and refocuses its input.
- Diagnostic source fixtures and permission/storage fault injection change only test pages. All generated scripts/configurations/tests are untracked diagnostics; product files remain unchanged. The owned final Vite server and all diagnostic browser contexts were closed after search. The initial Vite process-selection mistake was reported immediately to the parent; subsequent process cleanup verified ownership.
- Final editorial audit: `final-audit.json` verifies all34 unique ordered IDs/index entries, all62 named asset references, evidence classification and the12-session sum. Owned browser/server processes were closed; no audit time is credited.
- Detailed JSON, logs, screenshots, and diagnostic scripts referenced above remain in the shared workspace. Reproduction steps and exact expected/actual results are included here so the report remains reviewable without those files.
