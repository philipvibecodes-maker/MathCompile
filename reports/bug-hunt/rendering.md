# Rendering bug-hunt report

Original investigation baseline: `eb8cdc2318f219d2f6d97cfe1dcc67c5d2ba268f` (2026-10-27).

Reviewed refactor baseline: `8e69e4d92e18b534d51a98f369c66a6778ea6637` (merged PR #113); reassessed 2026-10-29.

Search is complete: **36 findings — 4 high (P1), 28 medium (P2), 4 low (P3)**. No product implementation was changed by the investigation and no fixes were applied. Subsequent report-only commits and pushes publish documentation. The user's later instruction prohibiting fixes superseded the original proposed fix phase. Recommendations below are analysis, not an active implementation plan.

## Refactor reassessment — PR #113

[PR #113](https://github.com/philipvibecodes-maker/MathCompile/pull/113) split the compiler and IR implementation behind their existing public APIs. **All 36 rendering findings are retained; none is marked fixed by this refactor.** This is a bounded reassessment of the reported causes, not another five-hour search or a fresh browser certification.

The rendering/editor implementation, vendored renderer and shipped assets, calculator/frontend/worker, output helpers, styles, notation registry and store implementation have no diff between the two pinned revisions. A byte comparison additionally checked all **25 unchanged files explicitly referenced by this report** (excluding the two replaced compiler/IR facades). Thus the earlier browser observations remain historical evidence against unchanged implementations; they are not relabeled as newly reproduced browser results. Compiler references are updated below rather than pointing into the now-small facade files.

On the reviewed refactor checkout, small pure-helper checks reproduced the exact reported transformations for **RENDER-22, RENDER-32, RENDER-33 and RENDER-35**. Local source/CSS assertions rechecked **RENDER-34 and RENDER-36**. No browser, DOM, worker, generated Python, external request, deep-input or capacity workload was run for this reassessment. In particular, the RENDER-31 depth threshold is carried forward from the original bounded evidence without a new crash/threshold claim.

Status key: **S** = carried forward by unchanged-source review (30 findings); **H** = reported pure-helper defect reproduced on the refactor (4); **M** = source/CSS metadata contradiction rechecked on the refactor (2). All statuses retain the original severity and evidence limits. Neither passing baseline tests nor unchanged source alone is a fresh runtime reproduction.

| Finding | Refactor status | Current source anchor / responsibility |
| --- | --- | --- |
| RENDER-01 | S | `vendor/mathquill/src/commands/math/commands.ts:1903` — `LatexCmds.left.parser`; `src/editor/static-math.ts:10` |
| RENDER-02 | S | `src/compile/calc-runtime.ts:79` — `clean_and_simplify` |
| RENDER-03 | S | `vendor/mathquill/src/commands/text.ts:55` — text parser / serializer |
| RENDER-04 | S | `vendor/mathquill/src/commands/text.ts:63` — bounded text-group regex |
| RENDER-05 | S | `vendor/mathquill/src/commands/math/environments.ts:173` — `CellGrid`; `vendor/mathquill/src/commands/math.ts:341` — `mathspeak` |
| RENDER-06 | S | `vendor/mathquill/src/css/math.less:608` — tall-atom / cursor script selectors |
| RENDER-07 | S | `src/calc/result-latex.ts:15` — inverse-name replacement; `src/calc/calculator.svelte.ts:134` |
| RENDER-08 | S | `vendor/mathquill/src/commands/math/commands.ts:259` and `vendor/mathquill/src/commands/math/extraCommands.ts:117` — color argument → CSS |
| RENDER-09 | S | `src/index.css:66` — header; `:220` — two-column layout; `:377` — empty hint |
| RENDER-10 | S | `vendor/mathquill/src/css/math.less:627` — paired tall-script width |
| RENDER-11 | S | `vendor/mathquill/src/commands/math/extraCommands.ts:52`; `vendor/mathquill/src/css/math.less:307` — Fraktur family |
| RENDER-12 | S | `vendor/mathquill/src/commands/math/advancedSymbols.ts:244` — `LatexCmds[c]` dispatch before glyph fallback |
| RENDER-13 | S | `src/components/CalcOutput.svelte:235` — checkbox versus result-row rendering branches |
| RENDER-14 | S; compiler anchor moved | `src/compile/codegen/statements.ts:21` — `CALC_LAYOUT_WORDS` / `calcDisplayLayout`; `src/compile/calc-runtime.ts:146` — empty-span output |
| RENDER-15 | S | `src/components/CalcIssues.svelte:48` — measurement effect; `src/components/PythonField.svelte:107` — line anchors |
| RENDER-16 | S | `vendor/mathquill/src/services/latex.ts:21` — group flattening; `vendor/mathquill/src/commands/math/commands.ts:463` — `SupSub` merging |
| RENDER-17 | S | `src/components/CalcOutput.svelte:193` — `# cell` regex section splitting |
| RENDER-18 | S | `vendor/mathquill/src/css/math.less:9` — root clipping; `src/index.css:1189` — outer result scroller |
| RENDER-19 | S | `vendor/mathquill/src/commands/math/environments.ts:1283` — `ArrayEnv` / retained spec |
| RENDER-20 | S | `vendor/mathquill/src/commands/math/environments.ts:1572` — `TabularEnv` |
| RENDER-21 | S | `vendor/mathquill/src/commands/math/environments.ts:1224` — `Gathered` inherits left alignment |
| RENDER-22 | H | `src/compile/latex.ts:51` — `rewriteOverUnder` |
| RENDER-23 | S; parser anchor moved | `src/compile/latex.ts:453` — `displayLatex`; `src/compile/ir/parse.ts:29` — `extractPythonBlocks` |
| RENDER-24 | S | `vendor/mathquill/src/commands/math/extraCommands.ts:64` — bold wrappers; `vendor/mathquill/src/css/math.less:193` — working bold control |
| RENDER-25 | S | `vendor/mathquill/src/commands/math/extraCommands.ts:695` — cancel-to wrapper |
| RENDER-26 | S | `src/editor/math-field.ts:196` — focus / edge-move order; `src/state/store.svelte.ts:357` — cell-hop caller |
| RENDER-27 | S | `src/calc/calculator.worker.ts:1224` — exception serialization; `src/calc/calculator.svelte.ts:218` — IR-line assignment |
| RENDER-28 | S | `src/editor/attach-field.ts:163` — descendant line-anchor query |
| RENDER-29 | S | `vendor/mathquill/src/commands/math/advancedSymbols.ts:1426` — `RAW_GROUP` |
| RENDER-30 | S | `vendor/mathquill/src/commands/math/advancedSymbols.ts` — glyph registry; `vendor/mathquill/src/commands/math/extraCommands.ts:664` — labeled right harpoons |
| RENDER-31 | S; bounded stress case not rerun | `vendor/mathquill/src/services/latex.ts:154` — edit before parse; `vendor/mathquill/src/services/keystroke.ts:266` — selection deletion |
| RENDER-32 | H | `src/compile/latex.ts:77` — `rewriteEvalBar` |
| RENDER-33 | H | `src/compile/latex.ts:73` — `BIG_DELIM`; `:51` — annotation rewrite parity |
| RENDER-34 | M | `vendor/mathquill/src/commands/math/environments.ts:1255` — `Aligned.cellTextAlign`; `vendor/mathquill/src/css/math.less:394` — odd-column rule |
| RENDER-35 | H | `src/compile/latex.ts:73` — `stripBigDelims`; `vendor/mathquill/src/commands/math/extraCommands.ts:930` — null delimiter mapping |
| RENDER-36 | M | `vendor/mathquill/src/commands/math/extraCommands.ts:876` — `SizedDelimiter`; `vendor/mathquill/src/css/math.less:386` — shared suffix size |

Current-review evidence: `/workspace/bug-hunt-evidence/rendering/refactor-113/review.mjs` and `review.json`. The latter pins both full commits, file hashes, exact helper inputs/outputs and metadata assertions. Run `node /workspace/bug-hunt-evidence/rendering/refactor-113/review.mjs` from the reviewed checkout to repeat these bounded checks; the script reads product code and writes evidence only. Source identity is checked with Git as well as per-file byte comparisons. All other named screenshots, runtime results, campaign counters and investigation timings below belong to the original baseline unless explicitly called out here. References into the old monolithic compiler/IR are historical only; the current anchors above and the updated RENDER-14/23 paragraphs are authoritative for PR #113.

## Timing and stop reason

**Conservatively credited active investigation: 5h00m30s.** Search stopped 2026-10-29 at06:28:29 UTC after reaching the five-hour requirement; the one-hour stall exception was not used. Final report/index cleanup occurred afterward and is not credited. Quota/reset downtime and the uncertain review transition are excluded. Times below are shown to whole seconds; the retained ledger preserves the underlying records.

| Session | Supported UTC window | Scope / exclusions |
| --- | --- | --- |
|1|2026-10-27 06:26:47–08:08:22|Initial source/browser/corpus hunt; endpoint is last retained progress.|
|2|2026-10-27 17:06:47–17:18:11|Resumed hunt; interruption downtime excluded.|
|3|2026-10-28 04:28:56–05:27:04|Source/browser reductions through last durable finding; later uncertain minutes uncredited.|
|4|2026-10-28 08:12:11–08:52:27|Minus86s infrastructure exclusion08:20:00–08:21:26.|
|5a|2026-10-28 16:19:01–16:47:28|Source/diagnostic work through retained RENDER-31 proof.|
|5b|2026-10-28 16:53:25–16:54:48|Safe local source inspection after method restriction; the entire16:47:28–16:53:25 transition is uncredited.|
|6|2026-10-28 17:17:47–17:25:49|Safe ordinary-helper/source-only checks; next reset/quota gap excluded.|
|7|2026-10-29 05:35:51–06:28:29|Safe local source/pure ordinary-helper, glyph and style-metadata closure.|

Timing ledger: `/workspace/bug-hunt-evidence/rendering/timing.json`. The conservative retained credit before the final window was approximately 4h07m52s; the last window added 52m38s.

## Finding index

“Prior runtime” identifies evidence collected before the safe-only method transition. Later metadata checks are labeled separately within findings. Pure-unit/source-only findings do not claim new browser or calculator verification.

| ID | Severity | Finding | Evidence method |
| --- | --- | --- | --- |
| RENDER-01 | P1 | Symbolic floor/ceiling results disappear completely | Prior runtime + source |
| RENDER-02 | P1 | Display cleanup changes Python string values into mathematics | Prior runtime + source |
| RENDER-03 | P2 | Text-mode escapes display literally and grow across serialization | Prior runtime + source |
| RENDER-04 | P2 | Valid literal braces can blank an entire result | Prior runtime + source |
| RENDER-05 | P2 | Matrix and multiline accessible names contain “undefined” and omit structure | Prior runtime + source |
| RENDER-06 | P2 | Moving the caret makes exponents/subscripts jump to the middle of tall brackets | Prior runtime + source |
| RENDER-07 | P2 | Inverse-trig text replacement changes an ordinary string's contents | Prior runtime + source |
| RENDER-08 | P2 | Accepted LaTeX color models are ignored when constructing CSS | Prior runtime + source |
| RENDER-09 | P2 | Narrow viewports overlap input controls and place header actions off screen | Prior runtime + source |
| RENDER-10 | P2 | Paired scripts reserve only the subscript's width, so long exponents collide | Prior runtime + source |
| RENDER-11 | P2 | Fraktur falls back to ordinary Roman glyphs on a clean browser | Prior runtime + source |
| RENDER-12 | P1 | Blackboard capitals dispatch unrelated commands and corrupt stored mathematics | Prior runtime + source |
| RENDER-13 | P2 | “Show generating code” does nothing for a definition-only Python cell | Prior runtime + source |
| RENDER-14 | P1 | Empty-basis formatting reports the zero subspace as the empty set | Prior runtime + source |
| RENDER-15 | P2 | Resizing leaves input error chips anchored outside the viewport | Prior runtime + source |
| RENDER-16 | P2 | Tensor index-slot order is lost in calculator output | Prior runtime + source |
| RENDER-17 | P2 | Python string contents are mistaken for generated-code cell boundaries | Prior runtime + source |
| RENDER-18 | P2 | Wide exact results are silently clipped before the output scroller sees them | Prior runtime + source |
| RENDER-19 | P2 | Documented array column specifications do not affect rendering | Prior runtime + source |
| RENDER-20 | P2 | Documented text tables are parsed as math and lose word spaces | Prior runtime + source |
| RENDER-21 | P3 | The documented centered gathered environment is left aligned | Prior runtime + source |
| RENDER-22 | P2 | Annotation-to-script lowering loses compound-body grouping | Prior runtime + source |
| RENDER-23 | P3 | LaTeX source view inserts line breaks inside inline Python strings | Prior runtime + source |
| RENDER-24 | P2 | Bold-symbol commands have no bold typography | Prior runtime + source |
| RENDER-25 | P2 | Cancel-to notation renders as ordinary concatenated operands | Prior runtime + source |
| RENDER-26 | P2 | A vertical cell hop can focus a caret thousands of pixels outside the visible field | Prior runtime + source |
| RENDER-27 | P2 | Multiline Python errors are pinned to the first source line | Prior runtime + source |
| RENDER-28 | P2 | Nested equation grids displace annotations onto the wrong outer line | Prior runtime + source |
| RENDER-29 | P2 | Verbatim macro fallback drops a nested macro body's braces | Prior runtime + source |
| RENDER-30 | P2 | Several symbol commands use the wrong glyph, including reversed logical operators | Prior runtime + later metadata |
| RENDER-31 | P2 | A parser-depth failure clears selected source before reporting any rejection | Prior bounded stress case |
| RENDER-32 | P2 | Evaluation-bar rewriting creates delimiters across mathematical groups | Safe pure-unit/source only |
| RENDER-33 | P2 | Canonical command cleanup consumes matrix row separators and literal letters | Safe pure-unit/source only |
| RENDER-34 | P3 | Aligned's right/left cell-style declaration is defeated by inline left alignment | Safe pure-unit/source only |
| RENDER-35 | P2 | Null sized delimiters become visible periods in the output source | Safe pure-unit/source only |
| RENDER-36 | P3 | Sized delimiter suffix variants collapse all4 size levels | Safe pure-unit/source only |

## Scope and method

Investigated rendered mathematics in editable MathQuill fields, calculator StaticMath output, LaTeX output formatting, style/layout, and accessibility announcements. Read `AGENTS.md`; used the assigned isolated worktree `/workspace/hunt-rendering`, baseline sources/builds, Chromium through Playwright, native Python/SymPy 1.14.0 as an independent renderer oracle, and actual Pyodide/SymPy calculator output. CodeGraph was attempted but its CLI reports the isolated worktree has no index; navigated source directly afterward. Unique dev server `:5583` uses diagnostic-only `vite.hunt.config.ts` and an isolated optimizer cache because shared dependency optimizer files initially collided with other hunters.

Evidence directory: `/workspace/bug-hunt-evidence/rendering/`. Diagnostic sources live under `/workspace/hunt-rendering/hunt/`. Screenshots show the actual app, except the explicitly named static corpus contact sheet. Tests do not patch product code.

## RENDER-01 — Symbolic floor/ceiling results disappear completely

**Severity: high (P1). Confirmed in the actual calculator and raw StaticMath.**

### Reproduce

1. Select Calculator output.
2. Enter `\lfloor x\rfloor` (or use the floor symbols offered by autocomplete).
3. Wait for the SymPy ready indicator and completion of the calculation.
4. Repeat with `\lceil x\rceil` or `a=\lfloor x\rfloor`.

Actual: the input displays normally; calculation succeeds and “Show generating code” appears, but the entire answer is empty. An enclosing assignment/equation disappears too, so the failure is not limited to one missing glyph. There is no rendering error or text fallback. Expected: visible floor/ceiling notation with the symbolic argument, including the surrounding assignment.

### Root cause

SymPy's normal printer emits `\left\lfloor{x}\right\rfloor` and `\left\lceil{x}\right\rceil`. `LatexCmds.left.parser()` in `vendor/mathquill/src/commands/math/commands.ts:1903-1907` and its closing-delimiter regex at `:1924-1929` only accept a limited delimiter whitelist, excluding floor and ceiling. Although standalone commands exist and are compiler-supported (`src/compile/notation.ts:113-125`), their scalable `\left`/`\right` forms are rejected. MQ's failed full parse blanks the field. `src/editor/static-math.ts:10-12` passes calculator output straight into this parser without detecting the failure.

### Evidence

- `app-floor.png`, `app-ceiling.png`, `app-floor-equation.png`.
- `app-results.json`: completed rows contain a `.calc-math` whose `.mq-root-block` is empty, with engine `SymPy ready`.
- `sympy-corpus-results.json`: floor and ceiling have nonempty valid input LaTeX and `output: ""`, `text: ""`.
- Independent native SymPy prints the same forms.

### Suggested fix and validation

Extend paired-delimiter support consistently (parser, glyphs/SVG, serialization, editing) or explicitly normalize these standard scalable forms before the MQ renderer. Add a non-silent fallback whenever a nonempty successful calculator answer fails to render. Regression tests should use actual symbolic floor/ceiling values, an enclosing equality, nested brackets/matrices containing them, and a floor/ceiling LaTeX paste into an editable field. Check copied/reloaded serialization as well.

## RENDER-02 — Display cleanup changes Python string values into mathematics

**Severity: high (P1). Confirmed in app and exact native execution of the runtime helper.**

### Reproduce

Add a Python cell, use Calculator output, and enter one of:

```python
"2+2"
"hello_world"
"hello\nworld"
```

Actual: strings are converted into mathematical values/expressions: `"2+2"` becomes the integer `4`; `"hello_world"` is rendered as italic `hello` with `world` as subscript; the newline in `"hello\nworld"` is discarded and the result is the single symbol `helloworld`. A dictionary such as `{"k": "2+2"}` is transformed to a SymPy dictionary with symbol key and numeric value. Expected: show the actual string/container returned by the Python expression and preserve its characters and type, rather than reinterpret its contents as another expression.

### Root cause

`src/compile/calc-runtime.ts:79-94`, especially `:92`, calls `sp.simplify(val)` for arbitrary returned Python values. SymPy sympifies strings and dictionary contents. The helper is described as display cleanup, but this step changes the user's value before `_mc_row()` sees it. Error fallback does not help when conversion succeeds.

### Evidence

- `app-python-string.png`, `app-python-lines.png`, and `app-results.json`.
- Diagnostic `hunt/calc-runtime.py` is the evaluated TypeScript template from the baseline, not a reimplementation.
- Native exact-helper results: `'2+2' -> 4 (Integer)`, `'hello_world' -> hello_world (Symbol)`, `'hello\nworld' -> helloworld (Symbol)`, `{'k':'2+2'} -> {k:4} (Dict)`.

### Suggested fix and validation

Apply symbolic cleanup only to supported symbolic values, preserving Python strings and containers' string members as strings. Keep numeric Python values working as intended. Tests should check actual values/types before printing and browser rendering for numeric-looking text, underscores, spaces/newlines, nested containers, and ordinary symbolic expressions. Ownership is the result-runtime helper rather than paired delimiters.

## RENDER-03 — Text-mode escapes display literally and grow across serialization

**Severity: medium (P2). Confirmed in the actual Python-cell result and static corpus.**

### Reproduce

In a Python cell with Calculator output, evaluate:

```python
"$x^2$ costs 20% & more"
```

Actual: the answer shows literal TeX escape sequences, including `\$`, `\textasciicircum`, `\%`, and `\&`. Expected: the plain string `$x^2$ costs 20% & more`, with its characters intact. Separately, `\text{a\{x\}}` displays the backslashes as text; exporting/reloading repeatedly prefixes existing backslashes with the literal word `backslash`.

### Root cause

`vendor/mathquill/src/commands/text.ts:55-76` treats text arguments as raw strings rather than decoding supported text-mode escapes; `:116-119` renders that raw text. `:93` then rewrites every stored backslash to `\backslash ` while the same parser does not decode that spelling on the next import. Standard SymPy string LaTeX `\mathtt{\text{...}}` therefore prints markup visibly. The parser and serializer disagree on the representation of literal escapes.

### Evidence

- `app-python-escapes.png`, `app-results.json`.
- `sympy-corpus-results.json` entries `escaped-string`, `string-depth-1`, `string-depth-2`, `string-depth-3`; input `\text{a\{x\}}` becomes `\text{a\backslash{x\backslash}}` after a parse/export, while the displayed text remains `a\{x\}`.

### Suggested fix and validation

Define reversible text-mode escaping/decoding (escaped braces, slash, dollar, percent, underscore, caret, ampersand and printer-generated `\textbackslash`/`\textasciicircum` spellings). Alternatively, preserve Python strings as a separate text result and render them directly, while still fixing editable text round trips. Pin parse/export/parse idempotence and the actual text contents after multiple reloads.

## RENDER-04 — Valid literal braces can blank an entire result

**Severity: medium (P2). Confirmed in calculator and static corpus.**

### Reproduce

Python cell, Calculator target:

```python
"a{{{{x}}}}"
```

Actual: successful calculation, generating-code control appears, but the answer is completely blank. Expected: the text string `a{{{{x}}}}`. Three nested brace pairs show text (with the separate escaping defect above), whereas four trigger full disappearance. A later minimal reduction found that even a **single literal unmatched brace** (Python strings `"{"`, `"}"`, `"a{b"`, or `"a}b"`) produces valid escaped printer LaTeX that the shared renderer blanks; no deep nesting is needed.

### Root cause

The text parser's regular expression at `vendor/mathquill/src/commands/text.ts:63-70` permits only three nested pairs and counts even escaped braces as grouping. SymPy legitimately escapes each literal brace in its string output. Exceeding the fixed nesting budget causes a full MathQuill parse failure, and StaticMath has no fallback. This is independently reproducible by pasting an ordinary deeply nested `\text{...}` group; valid cell content can be blanked on hydration.

### Evidence

- `app-python-braces.png`, `app-results.json`.
- `sympy-corpus-results.json` entries `string-depth-3` vs `string-depth-4`/`string-depth-5`.
- `literal-braces.json`: native printer output for `{`, `}`, `a{b`, `a}b` is nonempty valid escaped text, but browser StaticMath returns empty output/text for each. Also covers backslash, percent and underscore escape controls for RENDER-03.

### Suggested fix and validation

Use an escape-aware balanced argument scanner instead of a depth-three regular expression. Verify depths 0–10, escaped unmatched literal braces, nested text groups, suffix content after the string, and preservation of an entire worksheet cell around the string. A general static-rendering fallback remains useful but should not hide editor data loss.

## RENDER-05 — Matrix and multiline accessible names contain “undefined” and omit structure

**Severity: medium (P2). Confirmed by browser DOM/MathQuill public API.**

### Reproduce

Enter/paste `\begin{pmatrix}1&2\\3&4\end{pmatrix}`, focus the field, and inspect the textarea's `aria-labelledby` target or the public `mq.mathspeak()` result.

Actual accessible name:

```text
Math Input: Startundefined 1 undefined 2 undefined 3 undefined 4 undefined
```

The visual grid is marked `aria-hidden="true"`, and the hidden textarea points at this string, so assistive technology receives no matrix name, dimensions, row/column boundaries, or usable cell context. The same shared `CellGrid` base is used for displaylines and cases; their output also contains `Startundefined`/`undefined`.

Expected: meaningful matrix/row/column or multiline structure, with no JavaScript placeholder values in accessible text.

### Root cause

`CellGrid` in `vendor/mathquill/src/commands/math/environments.ts:173` sets neither a `ctrlSeq` nor a structured mathspeak implementation. It inherits `MathCommand.mathspeak()` (`vendor/mathquill/src/commands/math.ts:341-359`), whose fallback concatenates undefined command/template entries. The cells are laid out visually in a table, but that table is hidden from accessibility and the speech path has no grid semantics. The shared fallback also evaluates `undefined + " "` as a truthy string before its `||` fallback, so missing closing-template entries print literal `undefined` even for commands with a known ctrlSeq; the corpus zoo/tilde case speaks `Start\tilde infinity undefined`. Fix the shared fallback as well as grid-specific structure, and include a simple hat/tilde regression.

### Suggested fix and validation

Give grid subclasses appropriate accessible names and implement row/column-aware speech and navigation alerts. Unit-test `mathspeak()` and a browser test should follow the actual textarea `aria-labelledby` reference and navigation live-region announcements. Include nested matrices, multiline cells, cases and empty cells.


Additional safe source-only style-metadata check: mathsf is registered with speech label “Serif Font” despite its mq-sans-serif CSS family (`vendor/mathquill/src/commands/math/commands.ts:154-160`). Style builds its mathspeak templates from that label (`:120-125`), while textsf correctly says “Sans serif font.” The committed bundle contains the same mismatch. `style-label-consistency.json` records this metadata contradiction; no new DOM/assistive-technology probe was used in the restricted phase. This is a smaller accessibility-label error within the same accessible-math finding.

## Excluded observations and coverage limits

- The initial static grammar sweep completed611,200 retained cases; its geometry flags are not counted as bugs without visual confirmation. Later caret/selection sweeps were stopped when their candidates saturated the known RENDER-06 class. Counter increments from those saturated cases do not reset the one-hour progress clock.
- Some diagnostic programmatic cell-kind switches logged Svelte `state_unsafe_mutation`. Not tied to a natural user workflow; excluded from confirmed findings.

## Investigation log

- 06:26:47: start; repository instructions, rendering components, vendor parser/CSS and existing coverage reviewed.
- 06:28–06:30: generated 60+ native SymPy output forms and drove browser StaticMath corpus; discovered floor/ceiling blanks and text-mode incompatibilities.
- 06:30–06:33: actual calculator/Pyodide reproductions, screenshots, raw DOM captured; confirmed floor/ceiling, string formatting, deep text nesting.
- 06:33–06:36: exact runtime-helper execution isolated string coercion; accessible-name check confirmed matrix speech placeholders.
- 06:34 onward: seeded structured randomized parser/serialization/geometry search; progress in `fuzz-progress.jsonl`, candidates in `fuzz-candidates.jsonl`. Cache and fresh-browser handling adjusted to isolate dependency optimization and bound memory.

- 17:06:47: resumed after workspace interruption; no downtime credited. Reviewed all 2,333 retained candidate records (all geometry flags; the 14,597 counter includes deduplicated geometry signatures after logging cap). Session 1 reached 611,200 randomized structured-expression cases, with no blank/throw/serialization-instability/entity candidates in that grammar. Prioritize manual visual reduction and broader printer/viewport/text coverage rather than repeating the same random grammar.

## RENDER-06 — Moving the caret makes exponents/subscripts jump to the middle of tall brackets

**Severity: medium (P2). Confirmed in the normal app with unchanged LaTeX.**

### Reproduce

1. In a LaTeX-target cell paste `\left(\begin{matrix}1&2\\3&4\\5&6\end{matrix}\right)^{2}`.
2. Move to the end of the field (Ctrl+End).
3. Press Left three times: traverse the superscript and then land immediately between the closing bracket and the script.

Actual: the exponent jumps from the top-right edge to the matrix's vertical middle. It jumps back when the cursor moves away. The displayed expression's geometry changes despite an identical stored/compiled expression. `\displaylines{x\\y}^{2}` shows the same failure. A direct `\begin{pmatrix}...\end{pmatrix}^{2}` is stable for this unmodified-caret movement, narrowing the selector defect. A later reduction found **selection** breaks that direct-matrix control too: Ctrl+Home then Shift+Right selects only the matrix and drops the exponent40.31px (492.375→532.6875 in the24px probe), with unchanged LaTeX. The `.mq-selection` wrapper also breaks adjacency.

Expected: cursor movement should not change the position of the exponent/subscript relative to its base.

### Root cause

`vendor/mathquill/src/css/math.less:608-611` makes scripts beside tall atoms use `display: contents` and edge-relative positioning. It includes both `.mq-matrix + .mq-supsub` and `.mq-matrix + .mq-cursor + .mq-supsub`, but the equivalent cursor-bearing variants are missing for `.mq-displaylines` and `.mq-bracket-container`. MathQuill inserts a real `.mq-cursor` sibling in that gap, so the intended style stops matching and the generic script styling returns.

### Evidence

- `script-app-before.png` / `script-app-after.png`: actual app input at default size, same LaTeX.
- `script-app-before.json`: script display `contents`, exponent top `101.5625`.
- `script-app-after.json`: script display `inline-block`, exponent top `137.390625` (35.83px lower), cursor directly before `.mq-supsub`.
- `script-position.json`: controlled comparisons for bracket-wrapped matrix, direct pmatrix (does not fail for the ordinary caret), and displaylines.
- `script-selection.json`: direct pmatrix exponent switches `contents`→`inline-block` when only the matrix is selected; includes exact selection indices, unchanged source, geometry, and DOM wrapper.

### Suggested fix and validation

Make tall-script classification robust to both cursor nodes and selection wrappers, for every affected base and superscript-only, subscript-only and paired scripts. Merely adding the two missing cursor variants leaves the selection failure. Preserve root clip headroom under selection as well. Add a browser geometry regression that moves the caret through each gap, verifies stable script rects, and checks nested tall brackets/displaylines. Rebuild the committed vendor CSS when fixing its Less source.

- 17:08–17:10 resumed investigation: visually triaged accent-range geometry candidates (most are not proof of clipping); reduced a separate deterministic tall-script cursor instability and confirmed actual app geometry/screenshot reproduction (RENDER-06).

## RENDER-07 — Inverse-trig text replacement changes an ordinary string's contents

**Severity: medium (P2). Confirmed through the real worker and actual app.**

### Reproduce

Python cell, Calculator output:

```python
"asin"
```

Actual: displays `arcsin`, not the returned string `asin`. Likewise `"atan"` becomes `arctan` and `"acos"` becomes `arccos`. These particular strings survive `clean_and_simplify` as strings, so this defect is independent of RENDER-02's sympification.

### Root cause

`src/calc/result-latex.ts:15-23` globally rewrites the `a`-prefixed inverse-trig spelling in any `\operatorname`, `\mathrm` **or `\text`** group. A string's valid printer output `\mathtt{\text{asin}}` therefore becomes `\mathtt{\operatorname{arcsin}}`. `src/calc/calculator.svelte.ts:134-141` applies this rewrite to every successful worker result, without information about whether the text represented a mathematical inverse-trig function or literal content.

### Evidence

- `extra-result-probes.json`: real `evaluate()` worker results for PythonSource expressions: `"asin" -> \mathtt{\operatorname{arcsin}}`, similarly atan/acos.
- `app-string-asin.png` / `app-string-asin.json`: actual app shows `arcsin` for input `"asin"`.
- Exact native helper execution preserves `'asin'` as a string; `sp.latex` initially emits `\mathtt{\text{asin}}`.

### Suggested fix and validation

Preserve literal text and user-defined names. Prefer the semantic printer's existing `inv_trig_style='full'` over unconditional textual replacement; if normalization remains necessary, restrict it to confirmed mathematical operators and respect text regions. Pin literal strings for all twelve `a`-prefixed spellings alongside true inverse-trig function results and undefined/user-defined functions.

- 17:13–17:15: confirmed inverse-name corruption through the real worker, captured app screenshot. Started a new seeded caret/layout sweep (20,736 unique planned combinations of bases, surrounding constructs, script forms, themes, font sizes and viewport widths), with settled animation frames between 24 caret steps per case; captures only unchanged-LaTeX geometry failures. This tests an interaction dimension absent from the first static grammar sweep.

- Session 2 retained evidence ends 2026-10-27 17:18:11.914 UTC. Credited duration 11m24.914s from 17:06:47; no later downtime credited. Session 3 resumed **2026-10-28 04:28:56 UTC**, cumulative credited search 1h53m00.289s, remaining **3h06m59.711s**, projected five-hour endpoint **07:35:55.711 UTC**. Restarting the new caret/layout coverage at its last retained case offset rather than replaying the first grammar sweep.

## RENDER-08 — Accepted LaTeX color models are ignored when constructing CSS

**Severity: medium (P2). Confirmed in browser computed styles and the shared editor/static renderer.**

Paste `\textcolor[rgb]{1,0,0}{x}`, `\textcolor[RGB]{255,0,0}{x}`, or `\textcolor[HTML]{FF0000}{x}`. Each valid standard form should render red; each instead inherits the surrounding text color (black in the captured comparison). `\textcolor[gray]{0.5}{x}` likewise ignores the model. `\colorbox[rgb]{1,1,0}{x}` and `\fcolorbox[rgb]{1,0,0}{1,1,0}{x}` lose the expected yellow fill/red frame. The equivalent named CSS color `\textcolor{red}{x}` works.

The parser accepts and preserves the optional model, but `vendor/mathquill/src/commands/math/commands.ts:259-265,295-302` interpolates its raw numeric/hex argument into `color:`. `vendor/mathquill/src/commands/math/extraCommands.ts:117-128,171-190` does the same for backgrounds/borders. For example `color:1,0,0` and `background-color:1,1,0` are invalid CSS; `FF0000` lacks the CSS `#` prefix. The model is only used for round-trip serialization.

Evidence: `color-probes.json` contains accepted/round-tripped source, generated DOM, and computed colors; `color-probes.png` shows named red next to black model-based equivalents. The fills compute to transparent. This finding concerns the explicitly accepted model forms; it does not assume full support for every xcolor syntax or named-color combination.

Suggested fix: translate a documented set of accepted models to CSS (validate range and channel count), and handle unsupported models explicitly. Preserve original LaTeX for copying. Test named colors plus rgb/RGB/HTML/gray with text, background, and frame output, in light/dark themes, and verify actual computed colors rather than serialization alone.

## RENDER-09 — Narrow viewports overlap input controls and place header actions off screen

**Severity: medium (P2). Confirmed at a 360×740 browser viewport.**

Open the app at 360px width, choose LaTeX output, and clear the input. The header remains 44px high while its tagline wraps to 102px: its top is -29.5px and bottom 72.5px, so text is cut off above the page and spills into the editor toolbar. The Commands button begins at x=507.8px and ends at626.1px, outside the initial 360px viewport (the body grows to626px and requires horizontal scrolling). The two-column editor leaves the input only94px wide; its absolute empty-input hint wraps past the field's bottom and visibly overlaps “Add expression”, “Python cell” and their shortcut labels. The Smart mode info icon/Output label also collide.

Evidence: `responsive-360.png` captures the complete overflowing document; `responsive-360.json` records the actual 360px viewport,626px document width, header/toolbar/input rectangles and overflow. The development branch badge contributes some header width, but the fixed-height/wrapping and94px input defect are independent; production should also be verified when fixing.

Roots: `src/index.css:66-73` fixes the nonwrapping flex header's height without a compact layout; `:220-299` keeps input/output side by side at every width; `:377` positions the long empty-field hint absolutely without constraining it to the available box. There are no responsive breakpoints. Suggested fix: a compact/reflowing header, a stacked input/output layout below an appropriate threshold, and a bounded empty hint. Validate360/390/640px plus desktop widths, both themes, LaTeX/Python/calculator targets, and the production header with the badge absent. Preserve easy access to header actions without requiring horizontal page scrolling.

- 2026-10-28 04:30–04:32: triaged retained color-model evidence (RENDER-08), restarted caret sweep from prior case200, and confirmed actual narrow-viewport control/text overlap (RENDER-09). New session timing excludes both prior interruptions.

## RENDER-10 — Paired scripts reserve only the subscript's width, so long exponents collide

**Severity: medium (P2). Confirmed by normal app screenshot, controlled static comparison and element geometry.**

Paste this into a math cell with LaTeX output:

```latex
\begin{pmatrix}1\\2\end{pmatrix}_{i}^{123456789}\begin{pmatrix}1\\2\end{pmatrix}_{j}^{2}
```

The first exponent overlaps the second matrix's exponent, merging their digits. Removing both subscripts fixes spacing immediately, without shortening either exponent. The same collision occurs with tall bracket-wrapped bases. Expected: reserve enough horizontal space for the wider of a base's superscript and subscript, so adjacent mathematical expressions remain distinct.

Root: `vendor/mathquill/src/css/math.less:627-629` sets paired tall-atom superscripts to `width:0` while their parent uses `display:contents`. The line therefore allocates only the subscript's width. In the28px control case the first superscript's element width is0, its subscript is7px, but its digit ink occupies x135.875–256.375. The second exponent occupies x216.531–229.531 at the exact same y414.922: those digits overlap. Without subscripts the first exponent reserves120.938px and the second begins at x330.469, so no collision occurs.

Evidence: `paired-scripts.json` / `paired-scripts.png` show paired vs superscript-only controls; `paired-script-app.json` / `paired-script-app.png` show normal input rendering at the app's default font size. This is distinct from RENDER-06: it occurs while the caret is stationary and the intended tall-script rule is active.

Suggested fix: retain vertical edge placement while reserving `max(supWidth, subWidth)` horizontally and aligning both scripts at one origin. Regression-test adjacent tall matrices/brackets with a much wider superscript, a wider subscript, and scripts of equal width, in both editable and static views; also test a tall following factor and a following factor with its own exponent. Rebuild vendor CSS.

- 2026-10-28 04:42: reduced RENDER-04 beyond deep nesting: a single escaped literal unmatched brace already blanks valid string output. Shared static renderer checked against native SymPy printing; added minimal regression inputs.

- 2026-10-28T04:46:13.434634+00:00: ordinary caret sweep stopped after at least800 new session3 cases (plus200 retained session2 cases); all retained candidates still share the confirmed tall-script adjacency class. Switched to a distinct Shift-selection layout sweep to examine editor selection chrome and root clipping across the same structural/theming/viewport dimensions.

- 2026-10-28T04:55:45.155968+00:00: root-level Shift-selection segment retained at least500 cases, all candidates reduced to RENDER-06. Progressively changed the start position0–3 caret descents into surrounding constructs before Shift-selection, to test partial inner selections rather than only selecting whole outer wrappers. New segment logs under `deep-selection-sweep-*`; no product changes.

## RENDER-11 — Fraktur falls back to ordinary Roman glyphs on a clean browser

**Severity: medium (P2). Confirmed with Chromium/Linux rendering and actual font-use telemetry.**

Paste `\mathfrak{ABC}` or `\mathfrak{abcdefghijklmnopqrstuvwxyz}` into a math field. The command is accepted and round-trips, but the displayed letters are ordinary Roman glyphs rather than Fraktur. This loses the font distinction used for mathematical objects such as Lie algebras. The adjacent `\mathcal{...}` control correctly renders a script alphabet.

Root: `vendor/mathquill/src/commands/math/extraCommands.ts:52-59` creates the Fraktur style, and `vendor/mathquill/src/css/math.less:307-310` relies on `Old English Text MT`, `UnifrakturMaguntia`, `fantasy`, then Symbola/serif. No Fraktur face is bundled or registered. The registered webfonts in `vendor/mathquill/src/css/font.less` cover Symbola and KaTeX_Caligraphic only. On this clean browser the requested Fraktur family falls through to Symbola's ordinary Latin glyphs. A locally installed decorative font could conceal the problem on a developer's machine; users should not need one to render a supported math alphabet.

Evidence: `font-probe.png` / `font-probe.json` show Roman, calligraphic and Fraktur controls. CDP `CSS.getPlatformFontsForNode` on the actual letter nodes reports `Liberation Serif` for the Roman control, bundled `KaTeX_Caligraphic` for calligraphic, and `Symbola` for uppercase/lowercase Fraktur (`font-platform-roman.json`, `font-platform-caligraphic.json`, `font-platform-fraktur.json`, `font-platform-fraktur-lowercase.json`). The Fraktur screenshot is visibly ordinary Latin, not merely an unusual Fraktur face.

Suggested fix analysis: provide a reliable licensed Fraktur webfont, or map supported mathematical alphabet characters to appropriate glyphs while preserving source and accessibility. Validate uppercase/lowercase alphabets, representative `\mathfrak{g}`/`\mathfrak{sl}`, nested scripts, both themes and a browser with no system Fraktur fonts. Match the existing mathcal webfont reliability rather than relying on a developer's installed fonts.

### Bounded font compatibility observation (not counted as a separate confirmed finding)

The same alphabet sweep found `\mathbb{AB}`/longer groups blank in the current renderer. Its parser explicitly restricts the argument to one capital or digit (`advancedSymbols.ts:238-244`), so this is recorded as a limitation of that existing contract, not treated as a second alphabet-rendering defect. Graceful preservation of unsupported valid input is still relevant to the general non-silent fallback analysis.

- 2026-10-28T05:15:19.032666+00:00: stopped saturated interaction sweep (≥900 deep-selection cases) and investigated alphabet/font loading directly. Confirmed RENDER-11 using screenshot controls and browser-reported actual font use. This is the latest substantive progress; later duplicate-case counters will not reset the one-hour stall clock. User subsequently cancelled all fixes; this report remains findings/suggested-analysis only, with no product source changes.


Safe local font metadata later found that the supplied Symbola TTF/WOFF repertoires agree and do not contain the probed Fraktur A/g code points. A Unicode-mapping alternative therefore also needs verified supporting fonts; merely selecting a different code point is not guaranteed by these bundled formats. `font-glyph-metadata.json` and `font-format-consistency.json` record this source-data check. Optional WOFF2 metadata decoding was unavailable because the local Brotli dependency is absent; no dependency installation or external request was attempted. Earlier browser font observations stand independently.

## RENDER-12 — Blackboard capitals dispatch unrelated commands and corrupt stored mathematics

**Severity: high (P1). Confirmed with real keyboard typing and the app store/persisted source path.**

Type `\mathbb{O}` in a fresh math cell. Instead of blackboard-bold O (𝕆), it becomes the empty-set symbol ∅, and the cell's stored LaTeX becomes `\varnothing`. This is a semantic/source change, not just a missing decorative font. Other documented valid individual capitals are wrong too:

| Typed | Actual rendered text | Actual stored LaTeX |
| --- | --- | --- |
| `\mathbb{D}` | upright D | `\text{D}` (total-derivative marker) |
| `\mathbb{L}` | Ł | `\L` |
| `\mathbb{O}` | ∅ | `\varnothing` |
| `\mathbb{S}` | § | `\S` |

Expected: the appropriate blackboard-bold capital, with that mathematical letter preserved in serialization and subsequent compilation. The single-capital input contract is fully respected in these reproductions.

Root: `vendor/mathquill/src/commands/math/advancedSymbols.ts:244-251` checks the entire `LatexCmds[c]` registry before using `MATHBB_GLYPHS[c]`. That dispatch was intended to reuse the special blackboard number-set classes, but also invokes unrelated one-letter commands: total derivative D, stroked L, empty-set O and section S. A glyph-table entry exists for these capitals but is bypassed. The normal edit callback then commits the unrelated command serialization to the store.

Evidence: `mathbb-alphabet.json` / `mathbb-alphabet.png` test every individually valid A–Z argument; `mathbb-app.json` uses Playwright keyboard typing through the real app and records field value, store source, shown LaTeX and actual text. `mathbb-O-app.png` shows the real empty-set result. All four typed sources canonicalize to the wrong command in the store.

Suggested fix analysis: restrict special-number-set reuse to its intended explicit cases, or render every supported capital through a complete blackboard glyph mapping. Verify the entire single-letter alphabet and digits through both paste and real typing, source round trips, store/persistence and subsequent compiler interpretation. In particular, assert O never becomes EmptySet and D never becomes a derivative marker.

- 2026-10-28T05:17:47.264155+00:00: confirmed RENDER-12 with real keyboard typing: blackboard O commits `\varnothing` to the store, with D/L/S collisions too. Latest substantive progress/stall clock updated; suggested fix analysis only, no implementation.

## RENDER-13 — “Show generating code” does nothing for a definition-only Python cell

**Severity: medium (P2). Confirmed through real Add Python, keyboard entry and checkbox click.**

Create a Python cell containing only:

```python
def f(x):
    return x + 1
```

Choose Calculator output and wait for SymPy ready. The cell correctly produces no mathematical result, but an enabled “Show generating code” checkbox appears. Click it: it becomes checked and no code is displayed. Expected: the visible, enabled control should reveal the generated program for this cell, including its function definition, even when the cell is intentionally silent.

Root: `src/components/CalcOutput.svelte:235` renders the code control whenever `cellCode !== ''`; the actual code block is nested inside the separate `{:else if rows.length > 0}` branch (`:279` onward). Definition-only Python source deliberately produces silent marker rows which `evaluate()` filters out, leaving an empty result array but a nonempty generated program. The checkbox and code renderer therefore use incompatible visibility conditions.

Evidence: `defs-code-before.json` records the real typed source, ready status, zero result rows and available control; `defs-code-after.json` records `checked:true`, `codeCount:0`, `rows:0`, and no error, with the output DOM; `defs-code-after.png` shows the enabled checked control and missing program. Diagnostic `hunt/defs-code-toggle.mjs` reproduces the actual user interactions.

Suggested fix analysis: make generated-code rendering independent of whether mathematical result rows exist, while preserving the intentional silence of definition-only cells. Check definition-only source, multiple definitions, imports/definitions, ordinary expressions, failed expressions and mixed multi-cell prefixes. Verify both checking/unchecking the visible control and keyboard access. No implementation was made.

- 2026-10-28T05:22:39.552094+00:00: investigated generated-code visibility independently of the saturated style sweep, ruled out an apparent plumbing-toggle inversion by inspecting its actual program variants/e2e contract, then confirmed RENDER-13 for intentionally silent Python definitions using real UI interactions. Latest substantive progress updated.

## RENDER-14 — Empty-basis formatting reports the zero subspace as the empty set

**Severity: high (P1). Confirmed through the actual calculator, with a nonempty-span control.**

Enter `\ker I_2` in Calculator mode. The answer is ∅. But the kernel of the identity matrix is the zero subspace, containing the zero vector; it is not empty. Likewise `\mathrm{columnspace}\begin{pmatrix}0&0\\0&0\end{pmatrix}` shows ∅ although that column space contains zero. As a control, the kernel of the zero2×2 matrix displays `span{(1,0), (0,1)}`, making clear that the formatter is presenting a space, not consistently presenting an unlabelled list of basis vectors.

Root: SymPy correctly returns an empty **basis list** for these zero-dimensional spaces. The original `src/compile/codegen.ts:4054-4058` requested the `span` layout for Kernel/nullspace/columnspace; after PR #113 this is `CALC_LAYOUT_WORDS` / `calcDisplayLayout` in `src/compile/codegen/statements.ts:21-34`, with layout application at `:50-56`. `src/compile/calc-runtime.ts:146-155` renders a nonempty basis as its span but special-cases an empty list to `\varnothing`, conflating an empty basis with the space it spans. Its comment explicitly calls ∅ the trivial space; that mathematical assertion is incorrect.

Evidence: `empty-span.json` captures source, ready status and actual rendered mathematics for identity-kernel, zero-kernel and zero-columnspace cases. Screenshots `kernel-identity.png`, `kernel-zero.png`, `columnspace-zero.png` show the real app. Native SymPy confirms `eye(2).nullspace()==[]`, `zeros(2).columnspace()==[]`, while `eye(2)*zeros(2,1)` is the zero vector, which belongs to the kernel. The compiler's raw matrix methods are correct; the display transformation introduces the wrong mathematical meaning.

Suggested fix analysis: distinguish the empty generating family from the zero subspace. Show an unambiguous zero-space/zero-vector-set notation or the span of the empty family consistently with other span results. If the product instead intends to display basis lists, label and format that contract consistently rather than showing unqualified ∅ as the value of an explicit kernel. Test invertible/non-invertible matrices and zero/nonzero column spaces, including the zero-dimensional case. No implementation was made.

- 2026-10-28T05:27:04.342305+00:00: investigated the code-generation hunter's empty-span display hypothesis and confirmed RENDER-14 through actual calculator kernel/column-space outputs and a nonempty-span control. Latest substantive progress updated.

## RENDER-15 — Resizing leaves input error chips anchored outside the viewport

**Severity: medium (P2). Confirmed with real Python input and a browser viewport resize.**

At a 1400px viewport, add a Python cell containing `raise ValueError("` followed by `long` repeated 50 times and `")`. Select Calculator and wait for its error. Resize the viewport to 800px without changing the source. The inline input-error chip remains at x=1322px, completely outside the new viewport and clipped by its input container. The actual Python textarea shrinks from1302px to702px. A fresh call to the field's own `lineAnchors()` returns right668 rather than the cached1268, yet the chip still has `left:1274px`. Moving the caret to the start (which changes horizontal scroll431→12) also does not refresh it. The output-column error remains available, so this is a lost/misplaced inline annotation rather than lost error data.

Expected: the input annotation should follow the current field geometry when the window or column size changes, and remain discoverable beside the corresponding input line.

Root: `src/components/CalcIssues.svelte:48-62` measures `anchors` and `overlayW` in an effect subscribed to source/issues/overlay mounting only. Neither a resize observation nor field-scroll signal invalidates that measurement. The chip's absolute position (`:111-114`) therefore uses stale coordinates. `src/components/PythonField.svelte:107-125` correctly computes a different current width clamp when called; the owner never remeasures it. This reactive geometry defect is distinct from RENDER-09's narrow initial layout and header wrapping.

Evidence: `issue-long-results.json` records before/after viewport widths, textarea rectangles, scroll positions, stale chip rectangles/styles and fresh line anchors. `issue-long-resize.png` and `issue-long-home.png` show the actual app with the inline annotation absent. Diagnostic `hunt/issue-long.mjs` uses Add Python, real keyboard entry and browser resize; it does not patch product code.

Analysis recommendation: observe geometry changes and invalidate annotation measurements after the field settles; ensure a usable chip placement when insufficient inline-tail space remains. Regression coverage should resize both directions with existing errors, scroll long lines, and exercise math/Python and multiline fields. No implementation was made.

- 2026-10-28T08:15:05.455765+00:00: new session resumed08:12:11 UTC; investigated inline annotation geometry and confirmed RENDER-15. Downtime is excluded. No product fixes.

## RENDER-16 — Tensor index-slot order is lost in calculator output

**Severity: medium (P2). Confirmed with distinct SymPy tensors in the actual calculator.**

Create a Python cell with:

```python
from sympy.tensor.tensor import TensorIndexType, tensor_indices, TensorHead
L = TensorIndexType('L')
i, j = tensor_indices('i j', L)
T = TensorHead('T', [L,L])
(T(i,-j), T(-j,i))
```

Actual: both tuple entries display identically, with aligned i superscript and j subscript. The objects are distinct: the first has contravariant i in its first slot and covariant j in its second; the second has the reverse slot order. SymPy deliberately preserves that order using `T{}^{i}{}_{j}` versus `T{}_{j}{}^{i}`. The actual worker returns both different forms correctly, but querying the mounted result's serialized LaTeX returns `\left(T_{j}^{i},\ T_{j}^{i}\right)`. Expected: retain the ordered, staggered index positions, or use an explicit representation that preserves tensor slots.

Root: `vendor/mathquill/src/services/latex.ts:21-29` flattens brace groups to their children, so explicit empty bases disappear. Adjacent SupSub nodes are then merged by `vendor/mathquill/src/commands/math/commands.ts:463-510`, including concatenation of same-level script contents. That editing normalization is safe for ordinary same-base sub/sup pairing but loses meaningful separation when the printer uses empty bases for ordered tensor indices. `src/editor/static-math.ts:10-12` passes the output through this normalization.

Evidence: `extended-printers.json` records the initial72-form corpus, including ordered tensor output; none of those forms blanked or threw. `tensor-worker.json` records successful raw engine output with both distinct forms. `tensor-results.json` records the actual Python source and mounted result DOM/serialized LaTeX, and `tensor-results.png` shows the indistinguishable pair. Independent SymPy confirms `T(i,-j) != T(-j,i)`. The browser diagnostic initially supplied source without the store's PythonSource JSON and returned no rows; that invalid probe is superseded by `tensor-worker.json`, which evaluates the actual stored cells with their JSON.

Analysis recommendation: preserve explicit script-base separation or provide a tensor-aware output representation. Cover mixed upper/lower rank2 and rank4 tensors with permuted slots, contraction and simple ordinary same-base paired scripts as controls. No implementation was made.

- 2026-10-28T08:21:19.025815+00:00: extended the native/browser printer corpus by72 quantum/vector/tensor/matrix/Boolean/special-function/symbol forms; reduced tensor slot collapse and confirmed RENDER-16 through actual Python-cell and raw worker output.

## RENDER-17 — Python string contents are mistaken for generated-code cell boundaries

**Severity: medium (P2). Confirmed with real Python input and the generating-code checkbox.**

Add a Python cell and enter:

```python
s = """first line
# cell 999
last line"""
s
```

Choose Calculator, wait for its successful string result, and check Show generating code. Actual: the display introduces a fake `# cell 999` section, folds away the opening `s = """first line` as though it belonged to an earlier cell, and leaves the current expanded body starting with `last line"""` followed by `s`. This visible fragment resembles invalid Python and hides part of the current cell by default. The worksheet has only2 cells, not999. Expected: the triple-quoted string should remain one correctly highlighted source region within the current cell; literal string/comment contents must not become structural fold markers.

Root: `src/components/CalcOutput.svelte:193-208` splits the complete post-helper program on every line matching `/^# cell \d+$/`, without retaining actual generated cell boundaries or Python lexical context. `:358-386` renders/folds those inferred sections and treats the final apparent section as the current cell. This also affects an ordinary matching user comment. The generating-code copy action still copies the complete `shownCode`, so this issue corrupts the displayed structure rather than the runnable clipboard program or execution.

Evidence: `fold-marker.json` contains the typed source, actual displayed code, DOM and fold controls; `fold-marker.png` shows the fake999 section and dangling closing quote. Diagnostic `hunt/fold-marker.mjs` resets the worksheet, uses Add Python and real keyboard entry, and clicks the checkbox. The initial script attempt after an environment restart had no restored Python field and timed out; the retained evidence comes from the corrected fresh-state run.

Analysis recommendation: retain known generated section boundaries as metadata rather than infer them from arbitrary user-controlled source lines, or perform lexical-context-aware separation. Check triple/single strings, matching user comments, real multi-cell prefixes, and expanding/collapsing current/prior sections. No implementation was made.

- 2026-10-28T08:25:18.379215+00:00: investigated generated-code structure independently of UI workflows; confirmed RENDER-17 with a literal triple-string cell marker, while explicitly ruling out clipboard-program corruption.

## RENDER-18 — Wide exact results are silently clipped before the output scroller sees them

**Severity: medium (P2). Confirmed in the actual calculator at a desktop1400px viewport.**

Enter `2^{1000}` and wait for Calculator completion. Its exact302-digit integer extends to x2868px but the result root ends at x1346px, hiding over half the number without an ellipsis or horizontal scrollbar. The surrounding page has no horizontal overflow either. Expected: offer an ordinary visible horizontal scroll area or another clear way to inspect the complete exact answer.

Root: the shared `.mq-root-block` rule in `vendor/mathquill/src/css/math.less:9-18` sets `width:100%` and `overflow:hidden`. `src/index.css:1189-1196` provides `overflow-x:auto` on `.calc-rows`, but the flex result/math wrappers (`:1287-1297`) shrink around the inner clipping box. Thus the inner root has client1292/scroll2816 while the outer rows container has scrollWidth==clientWidth==1292. The inner hidden overflow never reaches the intended outer scroll surface. The absolutely positioned generating-code control (`:1474-1486`) also paints over answer ink near the row's right end instead of reserving its own space; see the screenshot.

Evidence: `large-result.json` contains source, full exact text, clipping/ancestor rectangles, overflow styles and page widths; `large-result-extra.json` records the outer scroller dimensions. `large-result.png` shows the abruptly cut-off integer and overlaid code control. `large-result-interactions.json` records real horizontal wheel, drag selection and End interactions: wheel leaves root scroll0; dragging to the viewport edge moves it43px; End leaves it43px with the final digit still atx2816, outside the clipped right edge1346. **Limitation:** MathQuill selection-drag can move its hidden scroll position; this report does not claim that no elaborate sequence of drags could eventually reach the suffix. There is no ordinary scrollbar/wheel path to the full value in the tested state, and the default presentation gives no indication of omitted digits.

Analysis recommendation: make the complete math layout contribute to the calculator's intended scroll area and reserve space for row controls. Cover wide integers, sums, matrices and fractions at desktop/narrow widths, plus wheel/keyboard access and a short-result control. Preserve complete exact values when choosing an abbreviated presentation. No implementation was made.

- 2026-10-28T08:31:23.343328+00:00: investigated wide exact-result accessibility, confirmed RENDER-18, and bounded its claim after real wheel/drag/End checks revealed limited drag-based hidden scrolling.

## RENDER-19 — Documented array column specifications do not affect rendering

**Severity: medium (P2). Confirmed against the explicit user-guide contract.**

Load `\left[\begin{array}{l|r}12345&1\\1&12345\end{array}\right]` into a LaTeX-target cell. The exact `l|r` specification remains in its stored/shown LaTeX, but all4 cells render centered and there is no vertical separator. Expected: the first column is left aligned, the second right aligned, and the requested rule is visible. This is a documented feature: `USER-GUIDE.md:225-232` explicitly gives `cc`, `l|r`, and `\array{lr}` as usable column specs. The missing separator also affects standard augmented-matrix presentation.

Root: `vendor/mathquill/src/commands/math/environments.ts:1283-1320` accepts and stores `ArrayEnv.spec`, but uses it only in serialized `latexOpen()`; it never translates alignment/rule information into the DOM. The class inherits `CellGrid.cellTextAlign='center'` (`:192`) for every column. Its original comment promises verbatim round-trip, but the user guide also presents these as applied column specs, not unsupported retained metadata. The test named “typed array{spec} applies the column spec” (`src/editor/mq-matrix.test.ts:37-47`) only checks the retained LaTeX, so it misses the visual failure.

Evidence: `array-style.json` records identical stored/shown source, every cell's computed `text-align:center`, zero left/right border widths, rectangles and DOM. `array-style.png` shows the real app with centered entries and no rule. Diagnostic `hunt/array-style.mjs` uses the normal field/store set-value path, matching worksheet hydration or a LaTeX load; it does not modify rendering code.

Analysis recommendation: apply per-column alignment and supported rule markers when constructing/rendering arrays, including after grid structural edits. Test different-width entries in l/c/r columns, the documented l|r form, and copied/reloaded source. Keep unsupported spec syntax explicit rather than silently claiming a visual application. No implementation was made.

- 2026-10-28T08:35:07.316889+00:00: inspected custom-grid contracts, confirmed RENDER-19 against the explicit documented l|r/lr support, and distinguished visual application from existing serialization-only test coverage.

## RENDER-20 — Documented text tables are parsed as math and lose word spaces

**Severity: medium (P2). Confirmed by native clipboard paste and by the ordinary set-value/hydration path.**

Paste the following into an empty LaTeX-target math field:

```latex
\begin{tabular}{ll}hello world&good day\\text with spaces&x y\end{tabular}
```

Actual: the4 entries appear as italic math `helloworld`, `goodday`, `textwithspaces`, and `xy`. Both the shown field and stored worksheet source have those spaces removed. Expected: ordinary tabular text retains word boundaries and upright text rendering. `USER-GUIDE.md:232` explicitly calls tabular a “Spec'd grid for text” and says it is for text content, while `vendor/mathquill/src/commands/math/environments.ts:1570` calls it the text-mode twin of array.

Root: `TabularEnv` (`environments.ts:1572-1586`) only overrides array's serialized open/close labels. It inherits the same math-cell parser/renderer rather than implementing text-mode cell contents. Math parser whitespace elimination and letter rendering therefore apply before `attach-field.ts:139-144` pushes the canonicalized source back to the store. This differs from RENDER-19's ignored column alignment/rules; the text content itself changes here.

Evidence: `tabular-text.json` records original input, changed store/source, each cell's displayed text, computed italic letter styles and DOM; `tabular-text.png` shows the app. `tabular-native-paste.json` independently confirms identical loss using actual browser clipboard permission, clipboard write, a field click and native Ctrl+V. Diagnostics `hunt/tabular-text.mjs` and `hunt/tabular-native-paste.mjs` make no product changes.

Analysis recommendation: render/edit tabular cell bodies with the documented text semantics while preserving explicit embedded-math regions, or accurately constrain the supported contract. Check spaces, punctuation, text plus math, escaping and a reload/clipboard round-trip, with ordinary math arrays as a control. No implementation was made.

- 2026-10-28T08:37:26.430321+00:00: followed custom-grid contracts into tabular text parsing, verified source/cell rendering loss through both hydration and native clipboard input, and confirmed RENDER-20 after UI ownership coordination.

## RENDER-21 — The documented centered gathered environment is left aligned

**Severity: low (P3). Confirmed with a centered-stack control.**

Load `\begin{gathered}123456789\\x\end{gathered}`. Actual: both rows start at the same left edge (first glyph x64.17 and x64 respectively), and both cells have computed `text-align:left`. Expected: the short x row should center beneath the longer first row. `USER-GUIDE.md:213` explicitly labels gathered “Centered stack of equations.”

Root: `vendor/mathquill/src/commands/math/environments.ts:1224-1231` derives Gathered from DisplayLines and overrides only serialized open/close names. It therefore retains `DisplayLines.cellTextAlign='left'` (`:1200`). This is separate from RENDER-19's ignored per-column array spec: gathered has a fixed, documented alignment that is never selected.

Evidence: `gathered-align.json` records actual field source, row/glyph rectangles, computed alignment and DOM. `gathered-align.png` shows the app with gathered followed by a `\substack{123456789\\x}` control. Substack correctly sets center alignment; its long row startsx66.14 and short rowx104.08. Diagnostic `hunt/gathered-align.mjs` loads both through normal field/store paths. The equation contents remain intact; the impact is incorrect layout.

Analysis recommendation: apply the centered alignment contract to gathered and its documented centered aliases while retaining left-aligned worksheet displaylines. Check different-width rows, nested blocks and copied/reloaded environments. No implementation was made.

- 2026-10-28T08:38:51.652077+00:00: reviewed remaining documented custom-grid layout contracts, confirmed the small gathered-centering defect RENDER-21 using substack as a working center-aligned control.

## RENDER-22 — Annotation-to-script lowering loses compound-body grouping

**Severity: medium (P2). Confirmed within the project's explicitly chosen annotation lowering.**

Load `\overset{2}{1+1}`. The input retains the annotation over its complete `1+1` body, but the LaTeX output column shows `1+1^{2}`, and Calculator returns2. Under the registry's chosen overset→power interpretation, the power should apply to the complete body, giving4; `\left(1+1\right)^2` is a working4 control. Likewise `\overset{2}{1+2}` becomes `1+2^{2}` and returns5 instead of the whole-body power control9.

**Contract boundary:** `LATEX_RULES` explicitly pins `\overset{a}{b} -> b^{a}` (`src/compile/latex.ts:107-119`). This report does not assert that its generic annotation-to-power decision is accidental. The defect is loss of the compound operand's scope inside that chosen transformation. The Copy button also correctly retains the original overset command through `copyableLatex`; it is the displayed/lowered LaTeX and calculation that change scope.

Root: `rewriteOverUnder()` (`src/compile/latex.ts:51-68`) reads complete brace-delimited annotation/body operands, then concatenates raw body text with a script suffix without preserving an atomic base. Thus the suffix binds to the final term rather than the operand that was passed as the complete body. The same concatenation branch handles underset; preserving scope is necessary there too.

Evidence: `overset-grouping.json` records all4 real stored field sources, output/copy strings, output-column text and actual worker rows, including the4/9 controls. `overset-grouping.png` shows the annotated input and returned2. Diagnostic `hunt/overset-grouping.mjs` evaluates the actual stored cells with their parsed JSON, preserving the normal compiler/runtime path. The code-generation hunter explicitly confirmed this issue was not duplicated in its report.

Analysis recommendation: preserve complete operand scope when lowering compound bodies, without disturbing the deliberate limit-empty-bound special case. Cover additive/multiplicative/nested bodies, under/over variants and existing limit rewrites; verify displayed source and calculation agree with the chosen lowering contract. No implementation was made.

- 2026-10-28T08:40:58.429853+00:00: reduced the previously bounded compound-annotation hypothesis, coordinated compiler ownership, and confirmed RENDER-22 with actual worker results and grouped-power controls; preserved the distinction between a deliberate lowering decision and its scope defect.


Additional safe pure-helper check: a two-level ordinary annotation `\overset{2}{\overset{3}{x}}` becomes `\overset{3}{x}^{2}` after one outputLatex pass, leaving the inner command unlowered; a second diagnostic pass yields `x^{3}^{2}`. `rewriteOverUnder` moves complete argument text into out without recursively processing it. `ordinary-display-helpers.json` records this normal-input coverage. No new calculation/runtime claim is made for these nested examples; the arithmetic and Copy observations in the primary reproduction remain separately established.

## RENDER-23 — LaTeX source view inserts line breaks inside inline Python strings

**Severity: low (P3). Display-only defect; stored source, Copy and evaluation are preserved.**

Load `\python{r"C:\\Users\\me"}` into a LaTeX-target cell. The inline Python field correctly contains the raw string `r"C:\Users\me"`. The output column, however, inserts actual newline characters immediately after each escaped backslash pair, splitting the quoted string into3 lines. Expected: format actual mathematical row separators as lines while preserving embedded Python source literally. The displayed source fragment now describes a different, invalid single-line Python string if selected and reused verbatim.

Root: `src/compile/latex.ts:447-449` applies `displayLatex()`'s global backslash-pair replacement to the whole serialized cell. It has no embedded-Python/text lexical context, so it mistakes escaped literal backslashes for grid/worksheet row separators. The parse/evaluation path protects Python snippets by extracting them first (originally `src/compile/ir.ts:401`, now `extractPythonBlocks` in `src/compile/ir/parse.ts:29` and its use before normalization at `:215`); the source-display path does not.

Evidence: `python-latex-display.json` records input, unchanged stored source, correct editable Python text, output-column text with inserted newlines, direct `displayLatex` return, and unchanged `copyableLatex` result. `python-latex-display.png` shows the mismatch. Diagnostic `hunt/python-latex-display.mjs` uses normal field/store paths. This is deliberately not classified as actual clipboard-button or runtime-source corruption.

Analysis recommendation: apply source-view row formatting only to real row-separator tokens outside literal/source blocks. Check Windows paths, Python escape sequences, quoted strings and genuine matrix/displaylines separators, including Copy and reload controls. No implementation was made.

- 2026-10-28T08:42:14.060852+00:00: investigated context-sensitive LaTeX source formatting, confirmed RENDER-23, and ruled out actual runtime/Copy corruption by checking the protected extraction/copy paths.

## RENDER-24 — Bold-symbol commands have no bold typography

**Severity: medium (P2). Confirmed with plain and working-bold controls in the actual app.**

Load `\boldsymbol{x+\Gamma}`, `\bm{x+\Gamma}`, `\pmb{x+\Gamma}`, or `\mathbfit{x+\Gamma}`. All are accepted and retain their command names, but render at font-weight400, identical to plain `x+\Gamma`. Gamma remains upright as well; the bold-italic forms never select italic typography for that glyph. A `\mathbf{x+\Gamma}` control correctly uses weight700, so this is not a missing browser bold-face capability. Expected: the explicitly bold forms visibly distinguish bold symbols, and the italic variants apply their intended style. Such distinctions commonly encode vector/tensor meaning.

Root: `vendor/mathquill/src/commands/math/extraCommands.ts:64-82` registers these wrappers with CSS classes `mq-bf` and, for italic variants, `mq-it`. Neither class has a typography definition in any source/build stylesheet. They are only mentioned by empty-slot/caret highlighting selectors. In contrast, ordinary mathbf uses a b.mq-font element and an implemented `font-weight:bolder` rule (`vendor/mathquill/src/css/math.less:193-195`). This differs from RENDER-11's unavailable Fraktur font family: the requested bold styles are never applied at all.

Evidence: `bold-fonts.json` records the6 actual field sources, leaf-glyph computed font weights/styles/families and DOM. Plain, boldsymbol, bm, pmb and mathbfit all have weight400 for x, plus and Gamma; mathbf has700 for all3. `bold-fonts.png` shows these inputs and their source labels together. Diagnostic `hunt/bold-fonts.mjs` uses the normal store/field paths.

Analysis recommendation: implement and scope the bold/italic wrapper typography consistently, including descendants, while retaining the intended distinction between upright mathbf and bold-italic forms. Check Latin, Greek and operator glyphs, nested wrappers, dark mode and a plain-symbol control. No implementation was made.

- 2026-10-28T08:46:26.076225+00:00: audited remaining font-wrapper classes, found missing mq-bf/mq-it typography definitions, and confirmed RENDER-24 against ordinary and working-mathbf controls.

## RENDER-25 — Cancel-to notation renders as ordinary concatenated operands

**Severity: medium (P2). Confirmed with a working cancellation control.**

Load `\cancelto{0}{x}+\cancel{x}`. Actual: the first term looks like ordinary `0x`: a full-size0 followed by an unstruck x, with no arrow or raised target. The second term correctly has a diagonal cancellation stroke. Expected: cancel-to shows the original expression cancelled toward its target, rather than presenting target and expression as a product/concatenation.

Root: `vendor/mathquill/src/commands/math/extraCommands.ts:695-705` creates a `mq-cancelto` wrapper and `mq-cancelto-arrow` result block, but neither has corresponding stylesheet rules or an SVG arrow. The wrapper also lacks the `mq-cancel-forward` class that produces the ordinary cancellation stroke. Thus both arguments simply remain inline in DOM order at the same font size. Source explicitly describes this command as an expression struck through with an arrow pointing at the result.

Evidence: `cancelto.json` records source, visible `0x+x`, DOM, block rectangles, computed static/inline positioning, equal20.7px font sizes and absent background/pseudo-content for cancel-to. The ordinary cancel control has its diagonal `linear-gradient` background. `cancelto.png` shows the actual app. `class-style-audit.json` records the bounded stylesheet-class audit that led to this reduction; missing CSS classes are not independently counted as bugs without actual visual confirmation. Diagnostic `hunt/cancelto.mjs` uses normal field/store paths.

Analysis recommendation: implement the result/arrow placement and cancellation stroke consistently with the command's two-operand contract. Cover zero/symbolic targets, long/tall expressions, nested scripts, dark mode and ordinary cancellation controls. No implementation was made.

- 2026-10-28T08:49:33.643638+00:00: audited command/style correspondence, confirmed RENDER-25 visually and through computed style, and excluded verbatim-command name fallbacks after identifying their intentional preservation contract. Deep nesting probes10–200 passed; depth300 hit JavaScript stack limits in several forms; later native clipboard testing established the bounded user-workflow impact recorded as RENDER-31.

## RENDER-26 — A vertical cell hop can focus a caret thousands of pixels outside the visible field

**Severity: medium (P2). Confirmed through actual clicks/keyboard navigation after animation settles.**

Create2 math cells: a short `a` followed by a long single-line expression (`1+` repeated160 times, then `x`). Focus the second field, press Ctrl+End, and wait for its horizontal scroll to settle. Click the first cell and press ArrowDown to enter the second cell at its start. Actual: the destination is focused and its caret correctly moves to the start logically, but the field keeps its previous far-right scroll position. The caret disappears far beyond the clipped left edge instead of being visible at the requested insertion point.

Measured after600ms settling: before the hop, the destination scroll is5122px and the caret is visible atx645 within rootx62–648. After the hop, the same root keeps scroll5122px and its caret sits atx−5059. This is not an in-progress scroll animation. Pressing ArrowRight then returns scroll0 and displays the caret atx74.34, confirming that an additional keystroke repairs the geometry; source remains unchanged throughout.

Root: `src/editor/math-field.ts:196-202` calls `mq.focus()` before `moveToLeftEnd()`/`moveToRightEnd()`. MQ focus computes scroll for the old caret position; the following programmatic edge move does not repeat that calculation. `src/state/store.svelte.ts:357-364` uses this path for ordinary vertical cell hops, selecting start on downward navigation and end on upward navigation.

Evidence: `focus-scroll.json` records both fields' source/focus state, root rectangles, scroll widths/positions and caret rectangles before and after the real hop. `focus-scroll.png` shows the focused destination with no visible caret at its requested start. `focus-scroll-control.json` records the ArrowRight recovery. Diagnostics `hunt/focus-scroll.mjs` and `hunt/focus-scroll-control.mjs` use actual clicks/keyboard interactions after preparing source through normal field/store paths.

Ownership note: the UI hunter independently identified the source-ordering hypothesis. This rendering agent chose and ran the geometry probe before receiving the UI hunter's later request not to run browser work on its behalf; the UI agent performed no browser probe. The rendering report owns the confirmed geometry evidence to avoid duplicate confirmed findings.

Analysis recommendation: make focusing at a requested edge reveal that edge after moving the caret. Cover both start/end hops, previously scrolled destinations, vertical keyboard navigation and narrow/wide fields; wait for animation settling in checks. No implementation was made.

- 2026-10-28T08:52:27.608208+00:00: independently reduced the UI hunter's source-only focus-ordering lead into a rendering geometry reproduction, confirmed RENDER-26 after scroll animation settling, and verified single-key recovery without source changes.

## RENDER-27 — Multiline Python errors are pinned to the first source line

**Severity: medium (P2). Confirmed with syntax and runtime errors on line3.**

Create a Python cell containing:

```python
a = 1
b = 2
if :
```

Choose Calculator and wait for evaluation. The error correctly says `invalid syntax (<string>, line 3)`, but its inline input chip is painted beside `a = 1`, the first source line. Replacing the final line with `raise ValueError("third_line_marker")` produces the same first-line placement for a runtime error. Expected: a line-specific annotation should identify the actual failing line; if only a cell-wide location is known, it should not imply the first unrelated assignment failed.

Root: the worker catches exceptions and returns only their string (`src/calc/calculator.worker.ts:1224-1225`), discarding structured syntax-error line information and runtime traceback locations. The frontend assigns each returned row its outer IR statement line (`src/calc/calculator.svelte.ts:218-229`); an entire PythonSource block is one IR statement at line0. CalcIssues consequently chooses the first of PythonField's correctly measured per-line anchors. The detailed syntax-error string and the visual annotation contradict each other.

Evidence: `python-issue-lines.json` records both typed programs, actual worker/frontend error rows (`line:0`), field/chip rectangles, source line heights, all3 measured anchors and chip style. The first anchor top10px and the true third anchor top47.7px differ by37.7px; both chips remain at viewporty181.125. `python-issue-runtime-third.png` and `python-issue-syntax-third.png` show the app. Diagnostic `hunt/python-issue-lines.mjs` uses Add Python, real keyboard entry and the actual evaluation path. The compiler hunter confirmed no duplicate source-location finding.

Analysis recommendation: retain source-relative exception locations across the worker boundary and map them to Python source lines rather than the single outer IR statement. Distinguish cell-wide errors when precise locations are unavailable. Check syntax/runtime errors on first/middle/last lines, definitions called from later cells and ordinary multiline math errors. No implementation was made.

- 2026-10-28T16:21:31.245198+00:00: session5 resumed16:19:01 UTC after quota downtime. Closed the retained Python error-anchor uncertainty by confirming RENDER-27 with syntax/runtime line3 controls. All downtime excluded; no product fixes.

## RENDER-28 — Nested equation grids displace annotations onto the wrong outer line

**Severity: medium (P2). Confirmed with valid nested gathered input and a working plain-line control.**

Load this3-line cell and choose Calculator:

```latex
\displaylines{a=1\\\begin{gathered}x\\y\end{gathered}\\\begin{pmatrix}1&2\end{pmatrix}+\begin{pmatrix}1\\2\end{pmatrix}}
```

The first line assigns a=1; the middle line contains a2-row gathered expression; the last adds incompatible1×2 and2×1 matrices. Actual: the matrix-size error's chip appears beside x inside the middle gathered block, rather than beside the final matrix sum. The calculator correctly returns row.line2 for the matrix-size failure, and successfully evaluates the middle gathered expression to [x,y], so this is not an unsupported-middle-expression side effect. Replacing the middle gathered block with plain x+y places the error correctly.

Root: `src/editor/attach-field.ts:163-175` queries every descendant matching `.mq-displaylines > table > tr`. It does not restrict anchors to the field's outer logical lines. A nested gathered grid shares the displaylines DOM class, so its2 inner rows are inserted into the3-row outer line-anchor list. Correct error line index2 then resolves to the first nested row. This differs from RENDER-27, where the error's source-line metadata itself is lost.

Evidence: `nested-issue-anchors.json` records the3 test programs, actual calculator rows, all anchors, outer-row rectangles and chip positions. The valid gathered case has5 anchors for3 outer rows; its chip top140.203 lies on the inner x row, while the actual failing matrix-sum row spansy202.1875–269.671875. `nested-issues-gathered.png` shows the misplaced chip. `nested-issues-plain.png` shows the correctly anchored plain-middle control. An additional explicit nested-displaylines variant produces separate expected unsupported-expression errors and is **not needed** to establish the valid gathered reproduction. Diagnostic `hunt/nested-issue-anchors.mjs` uses normal field/store input and the actual compiler/engine.

Analysis recommendation: derive anchors from outer logical source rows rather than all matching descendants, while treating a single-line field containing a nested grid as one source statement. Cover nested gathered/cases/matrices within outer multiline cells, first/middle/last failures and a nonnested control. No implementation was made.

- 2026-10-28T16:26:05.989135+00:00: closed the retained nested-grid anchor hypothesis and confirmed RENDER-28 with correctly mapped row metadata and a valid nested gathered expression; separated unsupported explicit nested-displaylines behavior and verified the plain-middle control.

## RENDER-29 — Verbatim macro fallback drops a nested macro body's braces

**Severity: medium (P2). Confirmed through native clipboard paste with simpler controls.**

Paste `\newcommand{\foo}{\frac{1}{\frac{1}{2}}}` into an empty LaTeX-target field. Actual: both field and stored worksheet source become `\newcommand{\foo}\frac{1}{\frac{1}{2}}`, losing the braces that delimit the macro body. A parameterized example `\newcommand{\foo}[1]{\frac{1}{1+\frac{1}{#1}}}` similarly loses its body braces. Simple x+1 and single-fraction body controls preserve their original source exactly.

Expected: preserve the macro definition verbatim under the fallback's explicit contract. **Scope:** this does not request TeX macro execution or full macro typesetting. `vendor/mathquill/src/commands/math/advancedSymbols.ts:1397-1404` explicitly says these visible literal-name leaves keep pasted definitions and serialize them verbatim instead of wiping source.

Root: `RAW_GROUP` (`advancedSymbols.ts:1426-1427`) is a regex bounded to one nested brace level. The newcommand parser (`:1428-1436`) makes the body group optional. A valid deeper body therefore fails that optional match while the macro name/argument count are accepted; the remaining body is parsed as ordinary mathematical grouping, whose outer braces disappear on serialization. `RawArgCommand` then retains only the accepted prefix, violating the advertised verbatim fallback guarantee.

Evidence: `rawarg-preservation.json` records all4 original inputs and actual stored/shown sources after real clipboard writes, field clicks and native Ctrl+V. The2 simple controls preserve; the2 nested bodies lose their braces. `rawarg-preservation.png` shows the parameterized definition's body rendered outside its literal command marker. Diagnostic `hunt/rawarg-preservation.mjs` does not patch product code.

Analysis recommendation: use balanced raw-argument scanning for preservation fallbacks and avoid silently treating an unconsumed valid body as ordinary math. Cover nested bodies, parameter counts/defaults, escaped braces, malformed definitions and clipboard/reload round-trips. No implementation was made.

- 2026-10-28T16:27:42.168259+00:00: closed the retained literal-fallback compatibility boundary by testing its advertised preservation property rather than requiring unsupported typesetting; confirmed RENDER-29 with native paste and nested/simple controls.

## RENDER-30 — Several symbol commands use the wrong glyph, including reversed logical operators

**Severity: medium (P2). Confirmed as one grouped registry-data finding with13 concrete command cases.**

Load any command below into a LaTeX-target field. The source command is retained, but its visible symbol is wrong. This includes reversal of curly logical and/or and all4 vertical harpoon barb directions, not merely a font/style preference.

| Command | Expected glyph | Actual glyph | advancedSymbols.ts line |
| --- | --- | --- | --- |
| `\rightsquigarrow` | ↝ rightwards wave arrow | ↙ southwest arrow |1685|
| `\upharpoonleft` | ↿ | ↾ |1695|
| `\upharpoonright` | ↾ | ↿ |1696|
| `\downharpoonleft` | ⇃ | ⇂ |1697|
| `\downharpoonright` | ⇂ | ⇃ |1698|
| `\lesseqqgtr` | ⪋ | ⋜ |1713|
| `\gtreqqless` | ⪌ | ⋝ |1714|
| `\boxbar` | ◫ bisected square | ┻ box-drawing junction |1755|
| `\curlyvee` | ⋎ curly logical or | ⋏ curly logical and |1764|
| `\curlywedge` | ⋏ curly logical and | ⋎ curly logical or |1763|
| `\bumpeq` | ≏ difference-between/bumpy equals | ≍ equivalent-to |1296-1300|
| `\lll` / alias `\llless` | ⋘ triple less-than | ≪ double less-than |1554-1558|
| `\ggg` / alias `\gggtr` | ⋙ triple greater-than | ≫ double greater-than |1559-1563|

Root: the literal numeric/entity glyph values in `vendor/mathquill/src/commands/math/advancedSymbols.ts` disagree with their registered command names. For bumpeq the same binding even has literal input key≏ but emits≍, independently exposing the inconsistent code point. These are data-table mistakes; the renderer faithfully paints the wrong character it receives.

Evidence: `glyph-oracle.json` records a bounded differential audit of624 alphabetic TeX command names against Matplotlib3.10.8's mathtext `tex2uni` map. `glyph-oracle-mismatch.json` contains69 single-glyph candidates, **not69 confirmed bugs**. Manual triage excludes intentional MathCompile aliases, font/size variants, and uncertain alternatives; only the13 cases above are confirmed here using the source entries, Unicode character names, command meaning and actual app rendering. For example hbar's oracle difference is a conventional code-point/style choice and is not reported. `wrong-glyphs.json` records all13 loaded app sources and actual text/DOM; `wrong-glyphs.png` shows them with their source labels. A second independent check uses the public KaTeX0.16.22 symbol table (retained under diagnostic hunt/oracles/); `glyph-oracle-crosscheck.json` records the comparison. This confirms the triple-chevron cases and helps exclude hbar/Join/backepsilon/models oracle variants. Wave-arrow conventions differ between the oracles (↝ versus⇝), but both are rightward wavy arrows rather than the actual southwest arrow. Diagnostics `hunt/glyph-oracle.mjs` and `hunt/wrong-glyphs.mjs` make no product changes.

Analysis recommendation: correct the verified registry entries and validate command/glyph identity with independently reviewed mappings, while retaining documented aliases and deliberate style choices. Cover both named commands and any registered direct Unicode inputs, plus canonical source round-trips. No implementation was made.

- 2026-10-28T16:32:45.466000+00:00: closed remaining symbol-style correctness with a bounded624-command independent glyph audit, manually triaged69 candidates, and confirmed only11 clear registry mistakes as grouped RENDER-30; excluded aliases/size/font variants rather than treating code-point inequality as proof.


Additional safe source-only arrow-label metadata: xrightharpoondown is bound to ⇀ (rightward harpoon with an **upward** barb), while xrightharpoonup is bound to ⇁ (downward barb), at `vendor/mathquill/src/commands/math/extraCommands.ts:664-665`. The adjacent leftward up/down variants are correct controls. `arrow-label-metadata.json` records20 inspected bindings and4 direction controls, using local source parsing and Unicode literals only. bindArrowLabelCmd passes the arrow string into its text node (`:630-631`). These2 metadata-proven cases extend the same wrong-glyph family; they were **not newly browser-probed**, and the13 earlier app reproductions remain separately identified above.


Further safe metadata closure: the correct expected arrow/relation glyphs probed here have outlines in the supplied Symbola TTF, and the WOFF repertoire agrees (`font-glyph-metadata.json`, `font-format-consistency.json`). This supports the registry-data diagnosis rather than absence from every supplied format; WOFF2 metadata was not decoded. The shipped JavaScript also contains the same swapped right-labeled-harpoon constants as the TypeScript source. No new rendering probe was used.

## RENDER-31 — A parser-depth failure clears selected source before reporting any rejection

**Severity: medium (P2). Confirmed bounded stress case, not an ordinary shallow-expression failure.**

Create the valid continued fraction by starting with x and wrapping it300 times as `\frac{1}{1+BODY}`. The resulting balanced LaTeX has3601 characters. In a fresh app, type x+1 normally, select it with Ctrl+A, and paste the generated fraction via the real clipboard. Actual: both stored worksheet source and visible field become empty, and the browser logs `Maximum call stack size exceeded`. There is no visible input-too-complex/parser rejection, and the previous selected content is not left intact. Expected: preserve the prior source and give an explicit bounded-input/parse failure when an expression cannot be accepted.

Root: `Controller.writeLatex()` (`vendor/mathquill/src/services/latex.ts:154-156`) first notifies edit; that notification deletes the current selection (`vendor/mathquill/src/services/keystroke.ts:266-267`). The recursive parser is only entered afterward (`vendor/mathquill/src/commands/math.ts:710-717`). Its depth overflow escapes without restoring the removed selection or converting the exception into a visible rejection. There is no documented maximum nesting limit or guard before this destructive step.

Evidence: `deep-parse.json` records raw StaticMath nesting10–300 probes: forms through200 complete parse/serialization in that isolated corpus, while several forms at300 throw a stack overflow. No general safe painting/layout depth was established by that parser-only corpus. `deep-native-fresh.json` records a fresh-page reproduction using **only real keyboard input for the x+1 prefix**, clipboard paste, unchanged preconditions, empty after-state and the browser error. Its setupErrors is empty. Undo in that run moves to the older seeded equation and Redo restores x+1; therefore the prior value is recoverable through history, and this report does **not** claim permanent data loss. `deep-native-paste.json` is an earlier set-value-prepared reproduction; its separate setup-only state_unsafe_mutation is excluded, not attributed to native paste. Diagnostics `hunt/deep-native-fresh.mjs` and `hunt/deep-native-paste.mjs` make no product changes.

Capacity limits: a separate sequential native threshold attempt passed depths50/100 but the renderer crashed during the150 case before final JSON was written. That crash's resource/root cause and exact boundary were not isolated, so it is not an additional confirmed finding or evidence that every150-depth input crashes. The reproducible300-depth selection-clearing/stack-overflow case above stands independently.

Analysis recommendation: validate/guard parser capacity before replacing selected content, and preserve/restore it if parsing throws. Check valid accepted deep input, explicit over-limit rejection, ordinary malformed input and Undo/Redo consistency. No implementation was made.

- 2026-10-28T16:47:28.550560+00:00: closed the retained depth300 parser-limit observation using a fresh native keyboard/clipboard workflow, isolated setup-only diagnostics, confirmed RENDER-31 selection clearing, and bounded recovery/crash claims through history and resource observations.

## RENDER-32 — Evaluation-bar rewriting creates delimiters across mathematical groups

**Severity: medium (P2). Confirmed by safe pure-string helper checks and source inspection; no browser/calculation claim.**

Call `outputLatex()` or `displayLatex()` with the ordinary valid input `\frac{x\big|_{x=1}}{2}`. Actual output is `\left.\frac{x\right|_{x=1}}{2}`. The introduced left delimiter is outside the fraction, while its right delimiter is inside the numerator brace group. Such a pair crosses TeX group scopes and does not describe a valid paired-delimiter expression. Expected: localize the evaluation-bar form inside the numerator, for example `\frac{\left.x\right|_{x=1}}{2}`. The plain-bar form and `\sqrt{x|_{x=1}}` have the same crossing-scope defect.

Root: `rewriteEvalBar()` (`src/compile/latex.ts:77-92`) finds a qualifying pipe anywhere in the input, then prefixes `\left.` to the **entire cell string** and inserts `\right|` at that pipe. It does not locate the containing mathematical group/operand. The canonical pipeline strips the big sizing command before running this rewrite, so the standard sized-bar example reaches the same branch. A multiline case `\displaylines{x\\y+1\big|_{y=1}}` likewise introduces a delimiter spanning the logical row separator after unwrapping.

Evidence: `ordinary-display-helpers.json` records the actual exported helper outputs, repeated output pass, display and unchanged Copy forms for ordinary bounded expressions. `evalbar-scope-check.json` records a local brace-scope inspection with Node assertions: the top-level x-bar control pairs at one scope;3 nested rewrites pair at different brace depths; a manually numerator-local control pairs correctly. Diagnostics `hunt/ordinary-display-helpers.mjs` and `hunt/evalbar-scope-check.mjs` import only the local pure helper and use normal mathematical strings. No DOM, browser, native input, external request, embedded code payload or execution of generated source was used. The compiler hunter confirmed no duplicate evaluation-bar rewrite finding.

Analysis recommendation: rewrite the local operand/group containing the evaluation bar rather than wrapping arbitrary string prefixes. Cover numerator/root/matrix-cell and multiline positions, existing paired delimiters, escaped pipes and the top-level control. No implementation was made.

- 2026-10-28T17:23:58.167884+00:00: resumed safe-only local source/pure-helper checks17:17:47 UTC after reset downtime; confirmed RENDER-32 using ordinary bounded LaTeX strings and brace-scope assertions. No browser/native/clipboard/external/embedded-code work was resumed.


Additional safe pure-helper recognition check: `\alpha\big|_{\alpha=1}` and the theta equivalent lose only the sizing word and retain a bare evaluation pipe, while the matching x and fraction controls receive the intended paired-delimiter form. The filter in rewriteEvalBar rejects **any** preceding command name (`:84`), rather than only commands taking a delimiter argument. `evalbar-atoms.json` records these bounded normal-input results. This is a second context/recognition limitation of the same evaluation-bar helper, with no new runtime claim.

## RENDER-33 — Canonical command cleanup consumes matrix row separators and literal letters

**Severity: medium (P2). Confirmed by safe pure-string checks; no browser/calculation claim.**

Call `outputLatex()` with `\begin{pmatrix}a\\big\left(x\right)\end{pmatrix}`. This is a2-row matrix whose second row begins with the ordinary letters b,i,g followed by a parenthesized x; there is no actual big sizing command token. Actual: the result is `\begin{pmatrix}a\\left(x\right)\end{pmatrix}`. The literal big letters disappear, and the opening bracket command's backslash has merged with the remaining row-separator slash. TeX then reads a row separator followed by literal left, rather than the original paired bracket command. The Big variant has the same failure. Expected: preserve these matrix rows, applying sizing cleanup only to actual command tokens.

Root: `BIG_DELIM` (`src/compile/latex.ts:73-74`) recognizes a backslash immediately before big/Big/bigg/Bigg without checking its parity within a backslash run. It matches the **second** backslash of the matrix row separator as though it started a sizing command. By contrast, the int-alias rule in the same module explicitly protects even-length runs; a matching row beginning with ordinary antid letters remains unchanged.

Evidence: `delimiter-command-parity.json` records2 affected ordinary matrix strings, the preserved antid-row control and a real sizing-command control. Both `outputLatex` and the isolated big-delim rule produce the same corruption; local Node assertions verify these results. Diagnostic `hunt/delimiter-command-parity.mjs` imports only local pure helpers and uses small ordinary mathematical strings. No DOM, browser, native input, external request, code payload or execution of generated source was used. The compiler hunter confirmed no duplicate row/parity rewrite finding. Copy uses a different helper and is not claimed to suffer this sizing-rule defect.

Analysis recommendation: recognize actual TeX control-sequence boundaries, retaining row-separator backslash runs and literal following letters. Cover matrices and multiline rows with/without separator whitespace, all sizing spellings, real commands and the existing protected alias controls. No implementation was made.

- 2026-10-29T05:36:39.485987+00:00: safe-only source/pure-unit session resumed05:35:51 UTC on29October. Retained the prior17:25:49.544 helper evidence and compiler deduplication as RENDER-33. All intervening downtime is excluded.

- 2026-10-29T05:52:02.719218+00:00: safe source/pure-unit closure inspected140 literal Unicode assignments (135 effective keys), accounted for later overrides and HTML numeric-reference behavior, and excluded apparent subset/ dagger false candidates. Only the already reported bumpeq remained. Inspected20 arrow-label bindings and confirmed the2 right-harpoon metadata errors; also retained the mathsf speech-label contradiction and normal evaluation-bar/annotation helper coverage. The existing Node-only LaTeX helper suite passed84/84; no product source changed.


Additional safe pure-helper parity coverage: a raw valid matrix row beginning with the ordinary letters overset or underset followed by grouped operands is also mistaken for a command. `\begin{pmatrix}x\\overset{a}{b}\end{pmatrix}` becomes `\begin{pmatrix}x\b^{a}\end{pmatrix}`; the underset variant similarly produces a b subscript. OVERUNDER lacks the same backslash-run guard. `ordinary-helper-whitespace-parity.json` records these string-only cases and a preserved antid-row control. These are helper-level raw-LaTeX checks, with no new application/canonical-field reachability claim.

## RENDER-34 — Aligned's right/left cell-style declaration is defeated by inline left alignment

**Severity: low (P3). Source-confirmed CSS cascade defect; no new browser/layout probe.**

For a normal equation grid such as `\begin{aligned}x&=1\\a+b+c&=2\end{aligned}`, the source explicitly intends alternating right/left alignment: odd columns containing left-hand sides should be right aligned, placing the short x beside its equals sign. The generated cells instead all receive inline text-align:left. The odd-column stylesheet rule cannot override that ordinary inline declaration. The result is left/left cell alignment, contrary to the documented source contract. **Scope:** the equals-sign column itself can still line up; this finding concerns the first-column alignment/spacing, not lost equation data or a claim that every equals sign is misaligned.

Root: `Aligned.cellTextAlign='left'` (`vendor/mathquill/src/commands/math/environments.ts:1255-1257`) is used by CellGrid's inline td style (`:241`, also `:470` for added cells). The intended odd-column text-align:right rule (`vendor/mathquill/src/css/math.less:394-396`, shipped CSS423-425) is a normal author stylesheet declaration with no important flag. Inline author alignment therefore wins by the CSS cascade. Aligned does not override the per-cell inline generation. This is separate from gathered's inherited left alignment (RENDER-21) and array's unused column-spec metadata (RENDER-19).

Evidence: `aligned-style-consistency.json` records the relevant generated inline value, stylesheet value/priority, source comment's expected alternation, shipped stylesheet agreement and the normal example. Diagnostic `hunt/aligned-style-consistency.mjs` reads local source/styles and checks these constants with Node assertions only. No DOM, browser, native input, external request or code payload was used. The visual magnitude/spacing was not newly measured under the safe-only restriction.

Analysis recommendation: make the intended per-column alignment effective under the cascade while preserving defaults for other grid types. Cover odd/even columns with different-width contents, added rows/columns, nested aligned grids and non-aligned controls. No implementation was made.

- 2026-10-29T06:17:29.596881+00:00: safe source closure confirmed RENDER-34 from an explicit grid-alignment contract and CSS cascade, verified known symbol glyph availability in local TTF/WOFF metadata, and checked12 inverse-function names plus7 negative-name controls and a mixed-expression control without new issues. Ordinary whitespace/parity checks extended RENDER-32/33; all work remained source/pure-unit only, with no product fixes.

## RENDER-35 — Null sized delimiters become visible periods in the output source

**Severity: medium (P2). Confirmed by safe pure-string checks and the registered null-delimiter contract.**

Call outputLatex with `\big.x`, `\Big.x`, `\bigg.x`, or `\Bigg.x`. Each becomes `.x`. The registered delimiter is explicitly invisible: BIG_DELIM_CHARS maps the period marker to an empty string and BigDelim creates a zero-width span, while retaining the null marker in its serialized command. Expected: a normalization described as removing pure sizing must preserve that invisibility, rather than introduce a literal period. A normal evaluation form `\big.x\big|_{x=1}` becomes `\left..x\right|_{x=1}`; the second period is now literal content after the invisible left delimiter.

Root: stripBigDelims (`src/compile/latex.ts:73-74`) removes only the sizing word and leaves its following token unchanged. That is suitable for visible delimiters but not the null period marker. The editor's explicit null mapping and zero-width branch are in `vendor/mathquill/src/commands/math/extraCommands.ts:930-971`. This differs from RENDER-33: these inputs contain real sizing commands, so recognizing command boundaries alone does not fix this semantic change.

Evidence: `null-sized-delimiters.json` records4 size variants, the evaluation-bar interaction and a normal parenthesis control. Copy retains the original commands; no Copy corruption is claimed. Diagnostic `hunt/null-sized-delimiters.mjs` runs only local pure helpers on small ordinary mathematical strings. No browser, DOM, native input, external request, code payload or execution of generated source was used. No new calculator/rendered-output outcome is claimed beyond the source transformation and registered null semantics.

Analysis recommendation: preserve null-delimiter meaning when removing sizing hints, including interactions with evaluation-bar rewriting. Cover all4 sizes, standalone/pair contexts, ordinary visible delimiters and Copy controls. No implementation was made.

## RENDER-36 — Sized delimiter suffix variants collapse all4 size levels

**Severity: low (P3). Source-confirmed style inconsistency; no new browser/layout probe.**

The ordinary delimiter forms big, Big, bigg and Bigg declare distinct scales1.2,1.6,2.1 and2.6. Their optional l/r/m variants are registered through SizedDelimiter, which supplies the same mq-sized-delim class and glyph for every size. Its shared CSS fixes the scale at1.5em, and no size-dependent value is placed into that renderer. Consequently bigl/Bigl/biggl/Biggl (and right/middle counterparts) do not retain the4 levels advertised by their base family. The suffix classifies delimiter position; it should not erase the family's size distinction.

Root: `vendor/mathquill/src/commands/math/extraCommands.ts:876-915` registers the12 suffixed variants through one class whose prefix is used for serialization. The later bare-command registrations (`:918-979`) use BIG_DELIM_SCALES and inline scale styles instead. The suffixed class never reads that size table; `vendor/mathquill/src/css/math.less:386-389` applies one shared1.5em rule. The shipped JavaScript/CSS contain the same split.

Evidence: `sized-delimiter-metadata.json` records all12 suffix bindings, their shared declared scale, corresponding bare scales and source-only scope. Diagnostic `hunt/sized-delimiter-metadata.mjs` parses local source and checks the metadata with Node assertions; it does not instantiate renderer classes or DOM. Actual pixel sizes were not newly measured under the safe-only restriction.

Analysis recommendation: retain the size level independently of l/r/m classification and apply it consistently across the family. Cover matching bare/suffixed delimiter pairs, all4 sizes, nested fonts and copied/reloaded source. No implementation was made.

## Final coverage and limits

- Browser evidence used Chromium/Linux and the checked-out baseline, including actual MathQuill fields and Pyodide/SymPy output where specified. It is not a cross-browser or assistive-technology certification. Accessible strings/DOM were inspected; no claim of a full screen-reader session is made.
- The initial structured parser/serialization/geometry search retained611,200 cases. Its14,597 geometry-signature counter is not a bug count; the logging cap retained2,333 candidate records. Geometry alone was not accepted as proof of clipped ink. Later caret/selection segments covered at least2,400 field cases and were stopped when their candidates saturated the known RENDER-06 class. Planned larger totals were not claimed as completed coverage, and duplicate counters did not reset the substantive-progress clock.
- The initial and extended SymPy printer corpora, the624-command glyph comparison and manual reductions are retained in the evidence directory. The extended printer corpus had72 forms. The glyph oracle's69 candidates were manually separated from confirmed mappings; conventional aliases, sizing/font variants and uncertain differences were not blindly reported.
- After the review restriction, work stayed within local source and pure unit checks of normal LaTeX/result strings, Unicode metadata and style consistency. No browser/DOM/native input, clipboard, deep/capacity stress, embedded-code execution, external request or security probe was resumed. Capacity-profile/layout-isolation follow-ups are excluded from findings and from the conservative credited transition window.
- RENDER-32 through36 are source/pure-unit findings. Later supplementary observations in RENDER-05/11/22/30 are explicitly metadata/string checks, separate from earlier runtime evidence. CSS-source conclusions have not been newly measured in a browser.
- Safe validation included the existing Node-only LaTeX helper suite (84/84 passing), ordinary helper boundary/whitespace controls,20 arrow-label source/bundle bindings,140 literal Unicode assignments (135 effective keys after overrides),19 mathbb capital constants plus10 digit mappings, and local font metadata. WOFF2 metadata decoding was unavailable without the absent Brotli dependency; no installation/request was attempted. TTF/WOFF checks and earlier browser font evidence remain separately identified.
- Earlier apparent Unicode subset-key errors were superseded by later registrations, and C1 dagger entity values use HTML reference remapping; neither was counted as a new bug. Setup-only state_unsafe_mutation logs were not tied to a natural workflow and were excluded. A separate incomplete renderer-crash threshold attempt was not isolated and is not another confirmed finding.
- Empty-annotation placeholder substitution beyond the pinned limit example remains an unspecified compatibility behavior, recorded in annotation-placeholder-scope.json without an extra issue ID. No unresolved candidate is presented as confirmed merely to increase the count.

The assigned worktree has no tracked product changes. Retained untracked hunt scripts/configuration/cache and report/evidence files are diagnostic artifacts only. No fix agents or implementation phase were started after the user prohibited fixes.
