# Reproduce and review reported bugs

The reports were found on **`codex/extended-bug-hunt`**, commit
`8e12e56b595992996e1dc7943c5bab0e709971b2`. The five Markdown files in this
directory originate from that commit; CG-15's title was later corrected to
describe its incompatible matrix-plus-symbol failure. They contain
127 finding groups: 34 UI, 39 compiler/calculator, 36 rendering, and 18 plotting.
The active workflow excludes CG-02, CG-16, and CG-21, which were fixed by
PR #114, leaving 124 unresolved findings (36 compiler/calculator).

## Start

From the repository root:

```sh
npm ci       # only needed on a fresh checkout
npm run bugs
```

Open **http://localhost:5574/** (it redirects to `/tools/bug-review/`).
The embedded worksheet is served at `/app`. To start at a particular
finding, append its ID: http://localhost:5574/tools/bug-review/#CG-06.
`BUG_REVIEW_PORT=5576 npm run bugs` chooses a different port.

The embedded worksheet starts in LaTeX output mode so opening the review page
does not boot the Pyodide/SymPy calculator worker. Loading a prepared setup
switches to that setup's selected output target; calculator cases therefore
start the worker only after **Load setup in app** is clicked.

This command runs the current checkout with Vite and adds the local review
API. It does not switch branches or merge the older product code from the
reports branch. Its separate port gives the reproduction app separate browser
storage from the usual app on :5573. Use the same hostname and port on later
visits to retain reproduction worksheets. Review annotations are saved to disk.

## Review a finding

1. Search by ID, title, exact input, or source text. Filter by area or review
   status. Use **Next unreviewed** to work through the current filtered list.
2. Read the **Original finding** section, including its expected/actual results
   and validation limits. The reports describe historical baselines, not a
   fresh verdict on this checkout. Old absolute evidence paths refer to the
   investigation workspace; those raw artifacts are not included in this clone.
3. Inspect **Reproduction setup**. There are 65 prepared worksheet setups,
   including mixed Python/math cells and preserved one-cell versus separate-cell
   grouping. Edit or add inputs as needed; choose an output target and import
   mode, then click **Load setup in app**. Every load creates a new worksheet,
   preserving earlier attempts. The editor may canonicalize loaded LaTeX; inspect
   the resulting source when the finding concerns serialization.
4. Follow the report's remaining keyboard, editing, export, or layout actions in
   the interactive pane. Calculator output can show an interim result before
   SymPy is ready; wait for the final result when required. For an unobstructed
   viewport, load the setup, then use **Open app in a tab**. That tab reads the
   saved worksheet when opened; it does not live-sync with the embedded app.
5. Set the review **Priority**, record **Observed behavior**, and select a
   reproduction status. Priority starts at the report's original severity but
   is independently editable. Describe your desired behavior and acceptance
   criteria, or select **Not applicable**.
   The historical report's proposed behavior remains visible separately and is
   never substituted for your decision.
6. **Capture observation** stores the embedded app's actual worksheet, output
   target, import/tuple settings, viewport, visible text, timestamp, branch and
   commit. It does not mark the bug reproduced. Capture is a textual snapshot,
   not a screenshot or assertion of mathematical correctness. When working in
   a separate tab, capture there using your own evidence or reload that worksheet
   in the embedded app before using the capture button.

For example, open CG-06, select Python output and load its prepared setup.
The reported failure is input `1-(2+2)` generating `1 - 2 + 2`; the desired
arithmetic result is `-3`. Record what your checkout actually produces.

Prepared setups load starting conditions. They do not replay typing or establish
a pass/fail result. Findings without a setup retain their complete manual
instructions and offer report snippets that can be added as editable math or
Python cells. Snippets include fragments and generated-code examples: verify
which are actual inputs before loading them.

CG-07 is a direct worker snapshot diagnostic rather than a frontend worksheet
reproduction; the report explains its execution conditions. CG-27 requires an
import-mode change *after* evaluation. PLOT-17 needs deliberate dependency-failure
injection. PLOT-02 includes nonadvancing grid loops and retains its bounded
manual diagnostic instructions. These cases have explicit setup notes rather
than misleading automatic verdicts.

Use **Restart app / worker** when a clean engine is required or the app has
failed. It reloads the current review worksheet and clears worker caches. Do not
restart between steps of bugs whose trigger depends on retained engine state.
Restart `npm run bugs` after switching commits or branches so the app and recorded
revision agree. Existing original-baseline and reassessment SHAs are recorded in
`tools/bug-review/catalog.mjs`.

## Keep and share decisions

Edits autosave to **`reports/bug-hunt/annotations.json`**. The status indicator
shows whether the write completed. Each record is keyed by the original bug ID
and retains your status, desired-behavior choice, observed/desired text,
acceptance notes, edited setup and captured evidence. The file can be reviewed
in Git and committed with subsequent fixes. No historical findings are marked
reviewed initially.

**Export reviews** downloads a portable JSON copy; **Import reviews** validates
and merges one, asking before replacing matching IDs. Other records are kept.
An unfinished save also has a browser draft with recovery offered on the next
visit. A failed disk save remains visible; export a copy before leaving.
Use one review window at a time because each window saves the full document.
For a separate review session, set `BUG_REVIEW_FILE=/absolute/path/reviews.json`.

The review server listens on the workspace network so the shared cloud browser
can reach it. For use only on the execution machine, set
`BUG_REVIEW_HOST=127.0.0.1`. The review API is installed only by `npm run bugs`.
It is not part of the production build or normal `npm run dev` server.

## Verify the workflow

```sh
npm run test:bugs
```

Uses Playwright Chromium. On this cloud workspace, use the installed browser:

```sh
BUG_REVIEW_CHROMIUM=/usr/bin/chromium npm run test:bugs
```

The checks cover the exact 124-finding unresolved catalog, recipe IDs and cell grouping,
annotation validation, browser input loading, observation capture without an
automatic verdict, saved decisions surviving reload, mixed Python/math setups,
and invalid imports. Browser checks use a temporary annotation file on :5575;
`BUG_REVIEW_TEST_PORT` overrides that test port. They verify the review workflow,
not whether all 124 remaining bugs are still present, and do not need the SymPy
CDN to complete.
