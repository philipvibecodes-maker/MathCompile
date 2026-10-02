<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import MathField from './components/MathField.svelte';
  import CalcOutput from './components/CalcOutput.svelte';
  import { TARGETS } from './compile/targets';
  import type { TargetId } from './compile/targets';
  import CommandPalette from './components/CommandPalette.svelte';
  import HowToGuide from './components/HowToGuide.svelte';
  import { appStore, THEME_STORAGE_KEY } from './state/store.svelte';
  import { loadPrefs, savePrefs } from './state/persistence';
  import { copyableLatex, displayLatex } from './compile/latex';
  import { calcEngine, prewarm } from './calc/calculator.svelte.ts';
  import { buildCommands } from './commands';
  import { installGlobalKeymap } from './editor/keymap';
  import { compileWorksheet } from './compile/codegen';

  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  let commands = $derived(buildCommands(appStore));

  // Animation knobs (persisted prefs): fadeMs drives code-line
  // mount/unmount fades (also exported as --fade-ms for CSS mount
  // animations). debounceMs delays the issue overlay until the user
  // stops typing (cursor moves don't reset it); fadeInMs/fadeOutMs are
  // the overlay's transition times.
  const animPrefs = loadPrefs();
  let fadeMs = $state(animPrefs.fadeMs ?? 150);
  let debounceMs = $state(animPrefs.debounceMs ?? 600);
  let fadeInMs = $state(animPrefs.fadeInMs ?? 150);
  let fadeOutMs = $state(animPrefs.fadeOutMs ?? 150);
  let settingsOpen = $state(false);

  // Output column width (% of the row's flex width) — shared by every
  // row and the column header; the .col-resize divider drags it.
  let outputPct = $state(34);

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
        })
      : null,
  );

  // Re-arm a cell's issue debounce on every latex change. The overlay
  // only mounts once typing has paused for debounceMs; if the input is
  // error-free when the timer fires the issues>0 check keeps it hidden.
  let issuesVisible = $state<Record<number, boolean>>({});
  const issueTimers: Record<number, ReturnType<typeof setTimeout>> = {};
  const prevLatex: Record<number, string> = {};
  // pre-effect: hides the overlay before the render that a keystroke
  // triggers — a normal $effect runs post-render and the panel would
  // mount for a frame, fade out, then re-fade in after the debounce.
  // Once shown it stays latched until the cell has no issues left.
  $effect.pre(() => {
    appStore.cells.forEach((c, i) => {
      if (prevLatex[c.id] === c.latex) return;
      prevLatex[c.id] = c.latex;
      clearTimeout(issueTimers[c.id]);
      const hasIssues = (compiled?.cellIssues[i]?.length ?? 0) > 0;
      if (hasIssues && !issuesVisible[c.id]) {
        const id = c.id;
        issueTimers[id] = setTimeout(
          () => (issuesVisible[id] = true),
          debounceMs,
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
      onSmartModeToggle: () => (appStore.smartMode = !appStore.smartMode),
      isPaletteOpen: () => appStore.paletteOpen,
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
      showCode: appStore.showCode,
      importAll: appStore.importAll,
      fadeMs,
      debounceMs,
      fadeInMs,
      fadeOutMs,
    }),
  );
</script>

<div class="app" style:--fade-ms="{fadeMs}ms">
  <header class="app-header">
    <span class="logo">Math<em>Compile</em></span>
    <span class="tagline">Write math, get latex + code.</span>
    <span class="stack" title="Built with Svelte + MathQuill">
      <svg
        class="svelte-mark"
        viewBox="0 0 107 128"
        role="img"
        aria-label="Svelte"
        ><path
          fill="#FF3E00"
          d="M94.1566,22.8189c-10.4-14.8851-30.94-19.2971-45.7914-9.8348L22.2825,29.6078A29.9234,29.9234,0,0,0,8.7639,49.6506a31.5136,31.5136,0,0,0,3.1076,20.2318A30.0061,30.0061,0,0,0,7.3953,81.0653a31.8886,31.8886,0,0,0,5.4473,24.1157c10.4022,14.8865,30.9423,19.2966,45.7914,9.8348L84.7167,98.3921A29.9177,29.9177,0,0,0,98.2353,78.3493,31.5263,31.5263,0,0,0,95.13,58.117a30,30,0,0,0,4.4743-11.1824,31.88,31.88,0,0,0-5.4473-24.1157"
        /><path
          fill="#FFF"
          d="M45.8171,106.5815A20.7182,20.7182,0,0,1,23.58,98.3389a19.1739,19.1739,0,0,1-3.2766-14.5025,18.1886,18.1886,0,0,1,.6233-2.4357l.4912-1.4978,1.3363.9815a33.6443,33.6443,0,0,0,10.203,5.0978l.9694.2941-.0893.9675a5.8474,5.8474,0,0,0,1.052,3.8781,6.2389,6.2389,0,0,0,6.6952,2.485,5.7449,5.7449,0,0,0,1.6021-.7041L69.27,76.281a5.4306,5.4306,0,0,0,2.4506-3.631,5.7948,5.7948,0,0,0-.9875-4.3712,6.2436,6.2436,0,0,0-6.6978-2.4864,5.7427,5.7427,0,0,0-1.6.7036l-9.9532,6.3449a19.0329,19.0329,0,0,1-5.2965,2.3259,20.7181,20.7181,0,0,1-22.2368-8.2427,19.1725,19.1725,0,0,1-3.2766-14.5024,17.9885,17.9885,0,0,1,8.13-12.0513L55.8833,23.7472a19.0038,19.0038,0,0,1,5.3-2.3287A20.7182,20.7182,0,0,1,83.42,29.6611a19.1739,19.1739,0,0,1,3.2766,14.5025,18.4,18.4,0,0,1-.6233,2.4357l-.4912,1.4978-1.3356-.98a33.6175,33.6175,0,0,0-10.2037-5.1l-.9694-.2942.0893-.9675a5.8588,5.8588,0,0,0-1.052-3.878,6.2389,6.2389,0,0,0-6.6952-2.485,5.7449,5.7449,0,0,0-1.6021.7041L37.73,51.719a5.4218,5.4218,0,0,0-2.4487,3.63,5.7862,5.7862,0,0,0,.9856,4.3717,6.2437,6.2437,0,0,0,6.6978,2.4864,5.7652,5.7652,0,0,0,1.602-.7041l9.9519-6.3425a18.978,18.978,0,0,1,5.2959-2.3278,20.7181,20.7181,0,0,1,22.2368,8.2427,19.1725,19.1725,0,0,1,3.2766,14.5024,17.9977,17.9977,0,0,1-8.13,12.0532L51.1167,104.2528a19.0038,19.0038,0,0,1-5.3,2.3287"
        /></svg
      ><span class="stack-name">mathquill</span>
    </span>
    <div class="output-options">
      <div class="option">
        <div class="option-label-row">
          <label class="option-checkbox">
            <input
              type="checkbox"
              checked={appStore.smartMode}
              onchange={(e) => (appStore.smartMode = e.currentTarget.checked)}
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
        <span class="option-shortcut">alt+s</span>
      </div>
      {#if appStore.target === 'calculator'}
        <label class="option-checkbox">
          <input
            type="checkbox"
            checked={appStore.showCode}
            onchange={(e) => (appStore.showCode = e.currentTarget.checked)}
          />
          Show code
        </label>
      {/if}
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
    <button class="palette-button" onclick={() => appStore.openPalette()}>
      Commands
      <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
  </header>
  <div class="main">
    <section class="expr-panel" style:--output-w={`${outputPct}%`}>
      <div class="col-headers">
        <span class="col-index"></span>
        <span class="col-field"></span>
        <div class="col-output-head">
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
          {#if appStore.target === 'calculator' && (calcEngine.status === 'loading' || calcEngine.status === 'error')}
            <div
              class="engine-status"
              class:engine-error={calcEngine.status === 'error'}
              role="status"
              transition:fade={{ duration: 300 }}
            >
              {#if calcEngine.status === 'loading'}
                <span class="engine-spinner" aria-hidden="true"></span>
                <span>
                  <strong>Loading SymPy engine…</strong>
                  interim results use a faster, less accurate engine
                </span>
              {:else}
                <span>SymPy engine failed to load — {calcEngine.error}</span>
              {/if}
            </div>
          {/if}
          {#if compiled && appStore.target === 'python'}
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
              class="cell-copy"
              title="Copy the entire output as one script"
              disabled={compiled.program.trim() === ''}
              onclick={copyScript}
              >{copiedScript ? 'Copied' : 'Copy script'}</button
            >
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
                  <label class="fade-slider" title="Code-line fade duration">
                    fade
                    <input
                      type="range"
                      min="0"
                      max="800"
                      step="50"
                      bind:value={fadeMs}
                    />
                    <span class="fade-ms">{fadeMs}ms</span>
                  </label>
                  <label class="fade-slider" title="Debounce before issues appear after typing stops">
                    debounce
                    <input
                      type="range"
                      min="0"
                      max="2000"
                      step="100"
                      bind:value={debounceMs}
                    />
                    <span class="fade-ms">{debounceMs}ms</span>
                  </label>
                  <label class="fade-slider" title="Issue overlay fade in">
                    in
                    <input
                      type="range"
                      min="0"
                      max="800"
                      step="50"
                      bind:value={fadeInMs}
                    />
                    <span class="fade-ms">{fadeInMs}ms</span>
                  </label>
                  <label class="fade-slider" title="Issue overlay fade out">
                    out
                    <input
                      type="range"
                      min="0"
                      max="800"
                      step="50"
                      bind:value={fadeOutMs}
                    />
                    <span class="fade-ms">{fadeOutMs}ms</span>
                  </label>
                </div>
              </div>
            {/if}
          {/if}
        </div>
        <span class="col-delete"></span>
      </div>
      <ol class="expr-list">
        {#each appStore.cells as cell, i (cell.id)}
          <li class="expr-row">
            <span class="expr-index">{i + 1}</span>
            <MathField {cell} />
            <div
              class="col-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize output column"
              onpointerdown={startColDrag}
            ></div>
            {#if appStore.target === 'latex'}
              <div class="cell-output">
                <code class="cell-latex">{displayLatex(cell.latex)}</code>
                <button
                  class="cell-copy"
                  title="Copy LaTeX"
                  disabled={cell.latex.trim() === ''}
                  onclick={() => copyLatex(cell)}
                  >{copiedId === cell.id ? 'Copied' : 'Copy'}</button
                >
              </div>
            {:else if appStore.target === 'calculator'}
              <CalcOutput {cell} />
            {:else if appStore.target === 'python'}
              <div class="cell-output cell-code">
                <div class="cell-code-body">
                  <code class="cell-python"
                    >{compiled?.importLine}{#each shownLines(cell, i).slice(1) as line, k (k)}<span
                        class="cell-line"
                        transition:fade={{ duration: fadeMs }}>{'\n'}{line}</span
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
                    in:fade={{ duration: fadeInMs }}
                    out:fade={{ duration: fadeOutMs }}
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
                        {/if}{iss.message}
                      </li>
                    {/each}
                    {#if hasParseError(i) && shownIssues(i).length === 0}
                      <li class="issue-error">
                        <span
                          class="parse-error-icon"
                          title={UNPARSEABLE_MSG}>!</span
                        >
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
      <button class="add-expr" onclick={() => appStore.addCell()}>
        + Add expression
      </button>
      <HowToGuide />
    </section>
  </div>
  <CommandPalette {commands} />
</div>
