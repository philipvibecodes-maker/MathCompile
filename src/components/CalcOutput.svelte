<script lang="ts">
  import { fade } from 'svelte/transition';
  import {
    calcEngine,
    evaluate,
    interimEvaluate,
    type CalcRow,
  } from '../calc/calculator.svelte.ts';
  import { latexToStatementStrings, type Issue } from '../compile/ir';
  import { mountStaticMath } from '../editor/static-math';
  import { highlightPython } from '../calc/python-highlight';
  import { appStore, type Cell } from '../state/store.svelte';
  import { loadPrefs } from '../state/persistence';

  // Per-cell SymPy output for the calculator target. Edits are debounced,
  // then the cell evaluates through the codegen pipeline — one result
  // row per top-level statement; stale responses are dropped via the
  // seq guard. Mounted only while target === 'calculator'.
  let { cell }: { cell: Cell } = $props();

  let rows = $state<CalcRow[]>([]);
  let pending = $state(false);
  let failed = $state('');
  // Per-cell opt-in to the `e = ...` display plumbing lines in .calc-code.
  let showPlumbing = $state(false);
  // Folded body of the clean_and_simplify helper block in row-0 code.
  let showHelpers = $state(false);
  const hasPlumbing = $derived(
    appStore.showCode &&
      rows.some((r) => r.ok && r.displayCode && r.displayCode !== r.code),
  );

  // Issue reporting mirrors the python target's overlay dynamics: a
  // marker shows on the failing row instantly, the message panel mounts
  // once typing has paused for debounceMs, then stays latched while any
  // issue remains. Same persisted knobs App.svelte's overlay reads.
  const animPrefs = loadPrefs();
  const debounceMs = animPrefs.debounceMs ?? 600;
  const fadeInMs = animPrefs.fadeInMs ?? 150;
  const fadeOutMs = animPrefs.fadeOutMs ?? 150;
  let issuesVisible = $state(false);
  let issueTimer: ReturnType<typeof setTimeout> | undefined;
  $effect.pre(() => {
    // Subscribing to cell.latex + rows + failed re-runs this on every
    // keystroke and every fresh eval result — either restarts the
    // pause countdown the panel waits on.
    const armed = cell.latex;
    const hasIssues = failed !== '' || rows.some((r) => !r.ok);
    if (!hasIssues) {
      clearTimeout(issueTimer);
      issuesVisible = false;
      return;
    }
    if (issuesVisible) return;
    clearTimeout(issueTimer);
    issueTimer = setTimeout(() => {
      issuesVisible = cell.latex === armed;
    }, debounceMs);
  });

  const statusLabel = $derived(
    calcEngine.status === 'loading'
      ? 'Loading SymPy…'
      : calcEngine.status === 'error'
        ? 'SymPy failed to load'
        : '…',
  );

  let seq = 0;
  $effect(() => {
    const latex = cell.latex;
    const mine = ++seq;
    if (latexToStatementStrings(latex).length === 0) {
      rows = [];
      pending = false;
      failed = '';
      return;
    }
    pending = true;
    // A stale error belongs to the old latex — drop it up front.
    failed = '';
    const timer = setTimeout(() => {
      if (mine !== seq) return;
      // While the engine boots, show nerdamer's instant best-effort
      // result — rendered dimmed since the real eval is still pending.
      // The `pending` guard keeps a late interim from overwriting real
      // rows that already landed.
      if (calcEngine.status !== 'ready') {
        interimEvaluate(latex).then((r) => {
          if (mine === seq && pending && r.length > 0) rows = r;
        });
      }
      evaluate(cell).then(
        (r) => {
          if (mine !== seq) return;
          rows = r;
          pending = false;
          failed = '';
        },
        (e) => {
          if (mine !== seq) return;
          pending = false;
          failed = e instanceof Error ? e.message : String(e);
        },
      );
    }, 200);
    return () => clearTimeout(timer);
  });

  // Split shown code around the emitted `def clean_and_simplify`
  // block: head is everything before the signature line, sig is the
  // `def` line itself, body is its indented suite, rest is the
  // remainder of the program.
  // Only row-0 code contains the block.
  function splitHelperBlock(
    code: string,
  ): { head: string; sig: string; body: string; rest: string } | null {
    const lines = code.split('\n');
    const i = lines.findIndex((l) =>
      l.startsWith('def clean_and_simplify('),
    );
    if (i < 0) return null;
    let j = i + 1;
    while (j < lines.length && (lines[j] === '' || /^\s/.test(lines[j])))
      j++;
    return {
      head: lines.slice(0, i).join('\n'),
      sig: lines[i],
      body: lines.slice(i + 1, j).join('\n'),
      rest: lines.slice(j).join('\n'),
    };
  }

  function staticMath(el: HTMLElement, latex: string) {
    const sm = mountStaticMath(el);
    sm.set(latex);
    return { update: (next: string) => sm.set(next) };
  }
</script>

<div class="cell-output calc-output">
  {#if failed !== ''}
    {@render issue('error', failed)}
  {:else if rows.length > 0}
    <div class="calc-rows" class:pending>
      {#each rows as row, i (i)}
        <div class="calc-row">
          {#if row.ok}
            <div class="calc-result">
              {#if row.latex !== undefined && row.latex !== ''}
                <span class="calc-math" use:staticMath={row.latex ?? ''}></span>
              {:else}
                <code class="calc-text">{row.text ?? ''}</code>
              {/if}
              {#if row.approx !== undefined}
                <span class="calc-approx">≈ {row.approx}</span>
              {/if}
            </div>
            {#if appStore.showCode && row.code}
              {@const shown =
                showPlumbing && row.displayCode ? row.displayCode : row.code}
              {@const split = splitHelperBlock(shown)}
              {#if split}
                <pre class="calc-code"><code
                    >{#each highlightPython(split.head) as tok, j (j)}<span
                        class={tok.cls ? `tok-${tok.cls}` : undefined}
                        >{tok.text}</span
                      >{/each}{split.head === '' ? '' : '\n'}<button
                      type="button"
                      class="code-fold"
                      title="Toggle the clean_and_simplify helper definitions"
                      aria-expanded={showHelpers}
                      onclick={() => (showHelpers = !showHelpers)}
                      >{showHelpers ? '▾' : '▸'}</button
                    >{#each highlightPython(split.sig) as tok, j (j)}<span
                        class={tok.cls ? `tok-${tok.cls}` : undefined}
                        >{tok.text}</span
                      >{/each}{#if !showHelpers}<span
                        class="code-elide"> ⋯</span>{/if}{'\n'}{#if showHelpers}{#each highlightPython(
                          split.body + '\n',
                        ) as tok, j (j)}<span
                          class={tok.cls ? `tok-${tok.cls}` : undefined}
                          >{tok.text}</span
                        >{/each}{/if}{#each highlightPython(
                        split.rest,
                      ) as tok, j (j)}<span
                        class={tok.cls ? `tok-${tok.cls}` : undefined}
                        >{tok.text}</span
                      >{/each}</code
                  ></pre>
              {:else}
                <pre class="calc-code"><code
                    >{#each highlightPython(shown) as tok, j (j)}<span
                        class={tok.cls ? `tok-${tok.cls}` : undefined}
                        >{tok.text}</span
                      >{/each}</code
                  ></pre>
              {/if}
            {/if}
          {:else}
            {@render issue(row.severity ?? 'error', row.error)}
          {/if}
        </div>
      {/each}
    </div>
  {:else if pending}
    <!-- Empty cells and complete-but-empty results render nothing — a
         bare '…' reads as "still evaluating" forever. -->
    <span class="calc-status">{statusLabel}</span>
  {/if}
  {#if hasPlumbing}
    <div class="calc-plumbing">
      <label
        ><input type="checkbox" bind:checked={showPlumbing} /> display
        plumbing</label
      >
      <button
        type="button"
        class="info-icon"
        aria-label="Display plumbing is the 'e = …' code MathCompile inserts to capture each statement's value for rendering — hidden by default since it isn't part of the calculation."
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
          Extra code MathCompile adds to capture each statement's value for
          rendering (the "e = …" lines). Not part of the calculation —
          hidden by default.
        </span>
      </button>
    </div>
  {/if}
</div>

<!-- A failing row's issue display: the severity marker mounts instantly
     (like the python overlay's leading icon), then the message panel
     fades in once issuesVisible — in flow inside the row, so it can
     never paint over the cell's other result rows. -->
{#snippet issue(severity: Issue['severity'], message: string)}
  {#if issuesVisible}
    <ul
      class="calc-issues"
      in:fade={{ duration: fadeInMs }}
      out:fade={{ duration: fadeOutMs }}
    >
      <li class="issue-{severity}">
        {#if severity === 'error'}
          <span class="parse-error-icon" title={message}>!</span>
        {/if}{message}
      </li>
    </ul>
  {:else if severity === 'error'}
    <span class="parse-error-icon" title={message}>!</span>
  {:else}
    <span class="note-icon" title={message}>i</span>
  {/if}
{/snippet}
