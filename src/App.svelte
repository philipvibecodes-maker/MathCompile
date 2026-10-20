<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import MathField from './components/MathField.svelte';
  import PythonField from './components/PythonField.svelte';
  import CalcOutput from './components/CalcOutput.svelte';
  import CalcIssues from './components/CalcIssues.svelte';
  import CopyButton from './components/CopyButton.svelte';
  import { TARGETS } from './compile/targets';
  import type { TargetId } from './compile/targets';
  import CommandPalette from './components/CommandPalette.svelte';
  import HelpSearch from './components/HelpSearch.svelte';
  import HowToGuide from './components/HowToGuide.svelte';
  import WorksheetMenu from './components/WorksheetMenu.svelte';
  import { appStore, THEME_STORAGE_KEY } from './state/store.svelte';
  import { savePrefs } from './state/persistence';
  import { copyableLatex, displayLatex } from './compile/latex';
  import { calcEngine, prewarm } from './calc/calculator.svelte.ts';
  import { buildCommands } from './commands';
  import { installGlobalKeymap } from './editor/keymap';
  import { compileWorksheet } from './compile/codegen';
  import { highlightPython } from './calc/python-highlight';

  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  const userGuidePdf = `${import.meta.env.BASE_URL}user-guide.pdf`;
  let commands = $derived(buildCommands(appStore));

  // Animation knobs live on the store (persisted prefs) so the settings
  // menu applies to every output target; fadeMs is also exported as
  // --fade-ms for CSS mount animations.
  let settingsOpen = $state(false);

  // Output column width (% of the row's flex width) — only the python
  // target's two-column layout uses it; its .col-resize divider drags it.
  let outputPct = $state(50);

  function startColDrag(e: PointerEvent) {
    const handle = e.currentTarget as HTMLElement;
    const row = handle.parentElement;
    const output = row?.querySelector<HTMLElement>('.cell-output');
    if (!row || !output) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = output.getBoundingClientRect().width;
    const rowW = row.clientWidth;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    const move = (ev: PointerEvent) => {
      const pct = ((startW + startX - ev.clientX) / rowW) * 100;
      outputPct = Math.min(60, Math.max(15, pct));
    };
    const done = () => {
      handle.classList.remove('dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', done);
      handle.removeEventListener('pointercancel', done);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', done);
    handle.addEventListener('pointercancel', done);
  }

  // The latex target bypasses the compile pipeline (per-cell displayLatex);
  // every codegen target compiles the whole worksheet.
  let compiled = $derived(
    appStore.target === 'python'
      ? compileWorksheet(appStore.cells, appStore.target, {
          importAll: appStore.importAll,
          pairTuple: appStore.pairTuple,
        })
      : null,
  );

  // Re-arm a cell's issue debounce on every latex change. The overlay
  // only mounts once typing has paused for debounceMs; if the input is
  // error-free when the timer fires the issues>0 check keeps it hidden.
  let issuesVisible = $state<Record<number, boolean>>({});
  const issueTimers: Record<number, ReturnType<typeof setTimeout>> = {};
  const prevLatex: Record<number, string> = {};
  // prevIssues tracks issue presence, not count — the debounce only
  // needs re-arming on a keystroke or a cross-cell appear/disappear.
  const prevIssues: Record<number, boolean> = {};
  // pre-effect: hides the overlay before the render that a keystroke
  // triggers — a normal $effect runs post-render and the panel would
  // mount for a frame, fade out, then re-fade in after the debounce.
  // Once shown it stays latched until the cell has no issues left.
  $effect.pre(() => {
    appStore.cells.forEach((c, i) => {
      const hasIssues = (compiled?.cellIssues[i]?.length ?? 0) > 0;
      // A latex change re-arms the debounce; so does an issue flipping
      // without one — cross-cell notes (a python cell below flagging a
      // caller's ordering) produce issues with no keystroke here.
      if (prevLatex[c.id] === c.latex && prevIssues[c.id] === hasIssues)
        return;
      prevLatex[c.id] = c.latex;
      prevIssues[c.id] = hasIssues;
      clearTimeout(issueTimers[c.id]);
      if (hasIssues && !issuesVisible[c.id]) {
        const id = c.id;
        issueTimers[id] = setTimeout(
          () => (issuesVisible[id] = true),
          appStore.debounceMs,
        );
      } else if (!hasIssues) {
        issuesVisible[c.id] = false;
      }
    });
  });

  // Freeze a cell's code lines while it has issues — the overlay
  // explains the error, so churning (invalid) code underneath is just
  // noise. The cache refreshes whenever the cell compiles clean.
  let frozenLines = $state<Record<number, string[]>>({});
  $effect.pre(() => {
    appStore.cells.forEach((c, i) => {
      if ((compiled?.cellIssues[i]?.length ?? 0) === 0) {
        frozenLines[c.id] = compiled?.cellLines[i] ?? [];
      }
    });
  });
  const shownLines = (cell: { id: number }, i: number) => {
    if ((compiled?.cellIssues[i]?.length ?? 0) === 0)
      return compiled?.cellLines[i] ?? [];
    return frozenLines[cell.id] ?? compiled?.cellLines[i] ?? [];
  };

  // codegen flags a whole dropped statement with this message; it
  // renders as an error icon leading the first overlay line instead of
  // its own text entry.
  const UNPARSEABLE_MSG = 'unparseable input — statement skipped';
  const shownIssues = (i: number) =>
    (compiled?.cellIssues[i] ?? []).filter(
      (iss) => iss.message !== UNPARSEABLE_MSG,
    );
  const hasParseError = (i: number) =>
    (compiled?.cellIssues[i] ?? []).some(
      (iss) => iss.message === UNPARSEABLE_MSG,
    );

  let copiedId = $state<number | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  // clipboard.writeText rejects when permission is denied — swallow so
  // a denied copy doesn't surface an unhandled rejection.
  const copyText = (text: string) =>
    navigator.clipboard.writeText(text).catch(() => {});
  function copyLatex(cell: { id: number; latex: string }) {
    copyText(copyableLatex(cell.latex));
    copiedId = cell.id;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copiedId = null), 1200);
  }

  function copyCode(cell: { id: number }, i: number) {
    copyText(shownLines(cell, i).join('\n'));
    copiedId = cell.id;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copiedId = null), 1200);
  }

  let copiedScript = $state(false);
  function copyScript() {
    copyText(compiled?.program ?? '');
    copiedScript = true;
    setTimeout(() => (copiedScript = false), 1200);
  }

  // Capture phase so Ctrl+K is seen even inside a <math-field>, which may
  // swallow keydown events at the target.
  onMount(() => {
    // Cache-first SW for the pyodide CDN assets — warms repeat visits.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}pyodide-sw.js`)
        .catch(() => {});
    }
    return installGlobalKeymap({
      onPaletteToggle: () => appStore.togglePalette(),
      onHelpSearch: () => appStore.toggleHelpSearch(),
      onInsertPython: () => appStore.addPythonCell(appStore.focusedId),
      onToggleCellKind: () => {
        const c = appStore.cells.find(
          (cell) => cell.id === appStore.focusedId,
        );
        if (c)
          appStore.setCellKind(
            c.id,
            c.kind === 'python' ? 'math' : 'python',
          );
      },
    });
  });

  // data-theme drives the CSS var swap; the inline script in index.html
  // sets it pre-paint, this keeps it synced with the store afterward.
  $effect(() => {
    const theme = appStore.darkMode ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  });

  $effect(() =>
    savePrefs({
      smartMode: appStore.smartMode,
      target: appStore.target,
      guideOpen: appStore.guideOpen,
      pinnedHelp: appStore.pinnedHelp,
      hiddenHelp: appStore.hiddenHelp,
      showPlumbing: appStore.showPlumbing,
      importAll: appStore.importAll,
      pairTuple: appStore.pairTuple,
      fadeMs: appStore.fadeMs,
      debounceMs: appStore.debounceMs,
      fadeInMs: appStore.fadeInMs,
      fadeOutMs: appStore.fadeOutMs,
    }),
  );
</script>

<div class="app" style:--fade-ms="{appStore.fadeMs}ms">
  <header class="app-header">
    <span class="logo">Math<em>Compile</em></span>
    <span class="tagline">Write math, get latex + code.</span>
    {#if __APP_BRANCH__}
      <span class="branch-badge" title="Dev build — branch under test"
        >{__APP_BRANCH__}</span
      >
    {/if}
    <WorksheetMenu />
    <div class="output-options">
      <button
        class="theme-toggle"
        title={appStore.darkMode
          ? 'Switch to light mode'
          : 'Switch to dark mode'}
        aria-label="Toggle dark mode"
        aria-pressed={appStore.darkMode}
        onclick={() => (appStore.darkMode = !appStore.darkMode)}
      >
        {#if appStore.darkMode}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            />
          </svg>
        {:else}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        {/if}
      </button>
    </div>
    <a
      class="guide-link"
      href={userGuidePdf}
      target="_blank"
      rel="noreferrer">User guide</a
    >
    <button
      class="help-search-btn"
      title="Search help (Ctrl+/)"
      aria-label="Search help"
      onclick={() => appStore.openHelpSearch()}>?</button
    >
    <button class="palette-button" onclick={() => appStore.openPalette()}>
      Commands
      <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
  </header>
  <div class="main">
    <section
      class="expr-panel"
      class:two-col={appStore.target !== 'calculator'}
      style:--output-w={`${outputPct}%`}
    >
      <div class="col-headers">
        <span class="col-index"></span>
        <div class="col-field">
          <div class="option-label-row">
            <label class="option-checkbox">
              <input
                type="checkbox"
                checked={appStore.smartMode}
                onchange={(e) =>
                  (appStore.smartMode = e.currentTarget.checked)}
              />
              Smart mode
            </label>
            <button
              type="button"
              class="info-icon"
              aria-label="Smart mode auto-converts typed text like 'sqrt' or 'int' into math symbols, and a digit after a letter (x2) into a subscript."
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="11" x2="12" y2="16.5" />
                <circle cx="12" cy="7.5" r="0.75" fill="currentColor" />
              </svg>
              <span class="info-tip" role="tooltip" aria-hidden="true">
                Auto-converts typed text like "sqrt" or "int" into math
                symbols, and a digit after a letter (x2) into a subscript.
              </span>
            </button>
          </div>
        </div>
        <div class="col-output-head">
          {#if appStore.target === 'calculator'}
            <!-- Persistent inline chip — swaps its label instead of
                 unmounting, so the header row never changes size. -->
            <span
              class="engine-chip"
              class:engine-error={calcEngine.status === 'error'}
              role="status"
            >
              {#if calcEngine.status === 'loading'}
                <span class="engine-spinner" aria-hidden="true"></span>
                <span class="engine-chip-text">SymPy loading</span>
              {:else if calcEngine.status === 'error'}
                <span class="engine-chip-text">SymPy failed to load</span>
              {:else}
                <span class="engine-chip-text">SymPy ready</span>
              {/if}
              <button
                type="button"
                class="info-icon"
                aria-label="Why interim results use a different engine"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <line x1="12" y1="11" x2="12" y2="16.5" />
                  <circle cx="12" cy="7.5" r="0.75" fill="currentColor" />
                </svg>
                <span class="info-tip" role="tooltip" aria-hidden="true">
                  {#if calcEngine.status === 'error'}
                    {calcEngine.error}
                  {:else}
                    Answers come from SymPy, a full computer-algebra
                    system running as WebAssembly (Pyodide), which takes
                    a while to download and boot. Until it's ready,
                    results come from Compute Engine — the same
                    JavaScript math engine that parses LaTeX for the
                    compiler — and are marked "estimate".
                  {/if}
                </span>
              </button>
            </span>
          {/if}
          {#if compiled && appStore.target === 'python'}
            <button
              class="cell-copy"
              title="Copy the entire output as one script"
              disabled={compiled.program.trim() === ''}
              onclick={copyScript}
              >{copiedScript ? 'Copied' : 'Copy script'}</button
            >
          {/if}
          {#if appStore.target === 'python' || appStore.target === 'calculator'}
            <button
              class="settings-btn"
              title="Settings"
              onclick={() => (settingsOpen = !settingsOpen)}
              >Settings</button
            >
            {#if settingsOpen}
              <button
                class="settings-backdrop"
                aria-label="Close settings"
                onclick={() => (settingsOpen = false)}
              ></button>
              <div class="settings-menu">
                <div class="settings-tabs">
                  <span class="settings-tab active">animations</span>
                </div>
                <div class="settings-body">
                  <div class="settings-row">
                    <label class="option-checkbox output-import-all">
                      <input
                        type="checkbox"
                        checked={appStore.importAll}
                        onchange={(e) =>
                          (appStore.importAll = e.currentTarget.checked)}
                      />
                      import *
                    </label>
                    <button
                      type="button"
                      class="info-icon"
                      aria-label="About the import setting"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <line x1="12" y1="11" x2="12" y2="16.5" />
                        <circle
                          cx="12"
                          cy="7.5"
                          r="0.75"
                          fill="currentColor"
                        />
                      </svg>
                      <span
                        class="info-tip"
                        role="tooltip"
                        aria-hidden="true"
                      >
                        Generated Python imports: `from sympy import *`
                        (bare names) or `import sympy as sp`
                        (sp.-qualified).
                      </span>
                    </button>
                  </div>
                  {#if appStore.target === 'calculator'}
                    <div class="settings-row">
                      <label class="option-checkbox">
                        <input
                          type="checkbox"
                          checked={appStore.showPlumbing}
                          onchange={(e) =>
                            (appStore.showPlumbing =
                              e.currentTarget.checked)}
                        />
                        display plumbing
                      </label>
                      <button
                        type="button"
                        class="info-icon"
                        aria-label="About plumbing"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="9" />
                          <line x1="12" y1="11" x2="12" y2="16.5" />
                          <circle
                            cx="12"
                            cy="7.5"
                            r="0.75"
                            fill="currentColor"
                          />
                        </svg>
                        <span
                          class="info-tip"
                          role="tooltip"
                          aria-hidden="true"
                        >
                          Extra code MathCompile adds to capture each
                          expression's value for rendering (the "e = …"
                          lines). Not part of the calculation — hidden
                          by default.
                        </span>
                      </button>
                    </div>
                  {/if}
                  <div class="settings-row">
                    <label class="target-select">
                      (a,b)
                      <select
                        value={appStore.pairTuple}
                        onchange={(e) =>
                          (appStore.pairTuple = e.currentTarget
                            .value as 'interval' | 'matrix')}
                      >
                        <option value="interval">open interval</option>
                        <option value="matrix">1×2 matrix</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      class="info-icon"
                      aria-label="About the (a,b) setting"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <line x1="12" y1="11" x2="12" y2="16.5" />
                        <circle cx="12" cy="7.5" r="0.75" fill="currentColor" />
                      </svg>
                      <span
                        class="info-tip"
                        role="tooltip"
                        aria-hidden="true"
                      >
                        What a two-element tuple in parentheses compiles
                        to: an open interval or a 1×2 row matrix. Three
                        or more elements always make a 1×n matrix.
                      </span>
                    </button>
                  </div>
                  <label class="fade-slider" title="Code-line fade duration">
                    fade
                    <input
                      type="range"
                      min="0"
                      max="800"
                      step="50"
                      bind:value={appStore.fadeMs}
                    />
                    <span class="fade-ms">{appStore.fadeMs}ms</span>
                  </label>
                  <label class="fade-slider" title="Debounce before issues appear after typing stops">
                    debounce
                    <input
                      type="range"
                      min="0"
                      max="2000"
                      step="100"
                      bind:value={appStore.debounceMs}
                    />
                    <span class="fade-ms">{appStore.debounceMs}ms</span>
                  </label>
                  <label class="fade-slider" title="Issue overlay fade in">
                    in
                    <input
                      type="range"
                      min="0"
                      max="800"
                      step="50"
                      bind:value={appStore.fadeInMs}
                    />
                    <span class="fade-ms">{appStore.fadeInMs}ms</span>
                  </label>
                  <label class="fade-slider" title="Issue overlay fade out">
                    out
                    <input
                      type="range"
                      min="0"
                      max="800"
                      step="50"
                      bind:value={appStore.fadeOutMs}
                    />
                    <span class="fade-ms">{appStore.fadeOutMs}ms</span>
                  </label>
                </div>
              </div>
            {/if}
          {/if}
          <label class="target-select">
            Output
            <select
              value={appStore.target}
              onchange={(e) =>
                (appStore.target = e.currentTarget.value as TargetId)}
              onpointerdown={prewarm}
              onfocus={prewarm}
            >
              {#each TARGETS as t (t.id)}
                <option value={t.id} disabled={!t.enabled}>
                  {t.label}
                </option>
              {/each}
            </select>
          </label>
        </div>
        <span class="col-delete"></span>
      </div>
      <ol class="expr-list">
        {#each appStore.cells as cell, i (cell.id)}
          <li class="expr-row">
            <span
              class="expr-index"
              onpointerdown={(e) => {
                e.preventDefault();
                appStore.focusCell(cell.id);
              }}
              >{i + 1}</span
            >
            <div
              class="cell-stack"
              class:flat={appStore.target !== 'calculator'}
            >
              <div
                class="cell-input"
                onpointerdown={(e) => {
                  // The issue chips and the python textarea need native
                  // pointer behavior: preventDefault here would kill
                  // text selection and the copy button's click.
                  if (
                    !(e.target as HTMLElement).closest(
                      'math-field, .calc-issues, .py-field',
                    )
                  ) {
                    e.preventDefault();
                    appStore.focusCell(cell.id);
                  }
                }}
              >
                {#if cell.kind === 'python'}
                  <PythonField {cell} />
                {:else}
                  <MathField {cell} />
                {/if}
                {#if appStore.target === 'calculator'}
                  <CalcIssues {cell} />
                {/if}
              </div>
              {#if appStore.target === 'calculator'}
                <CalcOutput {cell} index={i} />
              {/if}
            </div>
            {#if appStore.target !== 'calculator'}
              <div
                class="col-resize"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize output column"
                onpointerdown={startColDrag}
              ></div>
            {/if}
            {#if appStore.target === 'latex'}
              <div class="cell-output">
                {#if cell.kind === 'python'}
                  <div class="cell-code-body">
                    <code class="cell-python"
                      >{#each highlightPython(cell.latex) as tok, j (j)}<span
                          class={tok.cls ? `tok-${tok.cls}` : undefined}
                          >{tok.text}</span
                        >{/each}</code
                    >
                  </div>
                {:else}
                  <code class="cell-latex">{displayLatex(cell.latex)}</code>
                  <button
                    class="cell-copy"
                    title="Copy LaTeX"
                    disabled={cell.latex.trim() === ''}
                    onclick={() => copyLatex(cell)}
                    >{copiedId === cell.id ? 'Copied' : 'Copy'}</button
                  >
                {/if}
              </div>
            {:else if appStore.target === 'python'}
              <div class="cell-output cell-code">
                <div class="cell-code-body">
                  <code class="cell-python"
                    >{#each highlightPython(compiled?.importLine ?? '') as tok, j (j)}<span
                        class={tok.cls ? `tok-${tok.cls}` : undefined}
                        >{tok.text}</span
                      >{/each}{#each shownLines(cell, i).slice(1) as line, k (k)}<span
                        class="cell-line"
                        transition:fade={{ duration: appStore.fadeMs }}
                        >{'\n'}{#each highlightPython(line) as tok, j (j)}<span
                            class={tok.cls ? `tok-${tok.cls}` : undefined}
                            >{tok.text}</span
                          >{/each}</span
                      >{/each}</code
                  >
                  <button
                    class="cell-copy"
                    title="Copy code"
                    disabled={!compiled?.cellLines[i]?.length}
                    onclick={() => copyCode(cell, i)}
                    >{copiedId === cell.id ? 'Copied' : 'Copy'}</button
                  >
                </div>
                {#if (shownIssues(i).length > 0 || hasParseError(i)) && issuesVisible[cell.id]}
                  <ul
                    class="cell-issues"
                    in:fade={{ duration: appStore.fadeInMs }}
                    out:fade={{ duration: appStore.fadeOutMs }}
                  >
                    {#each shownIssues(i) as iss, j (j)}
                      <li class="issue-{iss.severity}">
                        {#if iss.severity === 'error' || (j === 0 && hasParseError(i))}
                          <span
                            class="parse-error-icon"
                            title={j === 0 && hasParseError(i)
                              ? UNPARSEABLE_MSG
                              : iss.message}>!</span
                          >
                        {/if}<code class="issue-text">{iss.message}</code
                        ><CopyButton text={iss.message} />
                      </li>
                    {/each}
                    {#if hasParseError(i) && shownIssues(i).length === 0}
                      <li class="issue-error">
                        <span
                          class="parse-error-icon"
                          title={UNPARSEABLE_MSG}>!</span
                        ><code class="issue-text">{UNPARSEABLE_MSG}</code
                        ><CopyButton text={UNPARSEABLE_MSG} />
                      </li>
                    {/if}
                  </ul>
                {/if}
              </div>
            {/if}
            <button
              class="expr-delete"
              title="Delete expression"
              aria-label="Delete expression"
              onclick={() => appStore.removeCell(cell.id)}>×</button
            >
          </li>
        {/each}
      </ol>
      <div class="add-row">
        <button class="add-expr" onclick={() => appStore.addCell()}>
          + Add expression
        </button>
        <button
          class="add-python"
          title={'Python source cell (Alt+Enter) — def f(x): … defines a function math cells can call as \\mathrm{f}(x); annotate a def with # @latex <latex> to name its call form'}
          onclick={() => appStore.addPythonCell()}
        >
          + Python cell
        </button>
      </div>
      <HowToGuide />
    </section>
  </div>
  <CommandPalette {commands} />
  <HelpSearch />
</div>
