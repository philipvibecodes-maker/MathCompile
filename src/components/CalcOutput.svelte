<script lang="ts">
  import {
    calcEngine,
    cellIssues,
    evaluate,
    interimEvaluate,
    type CalcRow,
    type CalcRowErr,
  } from '../calc/calculator.svelte.ts';
  import { latexToStatementStrings, type Issue } from '../compile/ir';
  import { mountStaticMath } from '../editor/static-math';
  import { highlightPython } from '../calc/python-highlight';
  import { appStore, type Cell } from '../state/store.svelte';

  // Per-cell SymPy output for the calculator target. Edits are debounced,
  // then the cell evaluates through the codegen pipeline in the context
  // of every cell above it — one result row per top-level statement;
  // stale responses are dropped via the seq guard. Mounted only while
  // target === 'calculator'.
  let { cell, index }: { cell: Cell; index: number } = $props();

  let rows = $state<CalcRow[]>([]);
  let pending = $state(false);
  // True while the shown rows came from the nerdamer interim engine —
  // they're estimates, so the UI marks them until SymPy rows land.
  let interim = $state(false);
  let failed = $state('');
  // Per-cell opt-in to the generated-code block at the end of the cell.
  let showCode = $state(false);
  // The emitted program for this cell; displayCode is the same program
  // with the `e = ...` display-plumbing capture lines inlined for
  // expression statements (the settings menu's plumbing toggle picks
  // between them).
  let cellCode = $state('');
  let cellDisplayCode = $state('');
  // Folded body of the clean_and_simplify helper block in the code block.
  let showHelpers = $state(false);
  // For the Copied flash on the code block's copy button.
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  function copyGeneratingCode(code: string) {
    // A denied copy rejects the promise — swallow it.
    navigator.clipboard.writeText(code).catch(() => {});
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 1200);
  }

  // Issue reporting is split like the python overlay's marker/panel:
  // the failing row keeps just its ! / i severity marker here, while
  // the messages go to cellIssues — the input column's CalcIssues
  // mounts the panel under the field once typing has paused.
  $effect(() => {
    const issues: Issue[] =
      failed !== ''
        ? [{ severity: 'error', message: failed }]
        : rows
            .filter((r): r is CalcRowErr => !r.ok)
            .map((r) => ({
              severity: r.severity ?? 'error',
              message: r.error,
              line: r.line,
            }));
    cellIssues[cell.id] = issues;
    return () => {
      delete cellIssues[cell.id];
    };
  });

  const statusLabel = $derived(
    calcEngine.status === 'loading'
      ? 'Loading SymPy engine…'
      : calcEngine.status === 'error'
        ? 'SymPy engine failed to load'
        : '…',
  );

  let seq = 0;
  $effect(() => {
    // This cell evaluates in the context of every cell above it — an
    // edit anywhere in the prefix re-triggers this cell's eval, so the
    // subscription covers the whole prefix's latex, not just ours.
    const prefixLatex = appStore.cells
      .slice(0, index + 1)
      .map((c) => c.latex);
    const latex = prefixLatex[prefixLatex.length - 1] ?? '';
    const mine = ++seq;
    if (latexToStatementStrings(latex).length === 0) {
      rows = [];
      pending = false;
      interim = false;
      failed = '';
      cellCode = '';
      cellDisplayCode = '';
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
        interimEvaluate(latex, prefixLatex.slice(0, -1)).then((r) => {
          if (mine === seq && pending && r.length > 0) {
            rows = r;
            interim = true;
          }
        });
      }
      evaluate(appStore.cells.slice(0, index + 1)).then(
        (r) => {
          if (mine !== seq) return;
          rows = r.rows;
          cellCode = r.code ?? '';
          cellDisplayCode = r.displayCode ?? '';
          pending = false;
          interim = false;
          failed = '';
        },
        (e) => {
          if (mine !== seq) return;
          pending = false;
          interim = false;
          cellCode = '';
          cellDisplayCode = '';
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
  function splitHelperBlock(
    code: string,
  ): { head: string; sig: string; body: string; rest: string } | null {
    const lines = code.split('\n');
    const i = lines.findIndex((l) =>
      l.startsWith('def clean_and_simplify('),
    );
    if (i < 0) return null;
    let j = i + 1;
    while (j < lines.length && (lines[j] === '' || lines[j].startsWith(' ')))
      j++;
    return {
      head: lines.slice(0, i).join('\n'),
      sig: lines[i],
      body: lines.slice(i + 1, j).join('\n'),
      rest: lines.slice(j).join('\n'),
    };
  }

  // Split the post-helper program on its `# cell N` markers — one
  // section per cell. A single-cell program has no markers: the whole
  // rest is this cell's code (one section with an empty marker).
  function splitCellSections(
    code: string,
  ): { marker: string; body: string }[] {
    const sections: { marker: string; lines: string[] }[] = [];
    const lead: string[] = [];
    for (const l of code.split('\n')) {
      if (/^# cell \d+$/.test(l)) sections.push({ marker: l, lines: [] });
      else if (sections.length > 0)
        sections[sections.length - 1].lines.push(l);
      else lead.push(l);
    }
    if (sections.length === 0) return [{ marker: '', body: code }];
    sections[sections.length - 1].lines.unshift(...lead);
    return sections.map(({ marker, lines }) => ({
      marker,
      body: lines.join('\n'),
    }));
  }

  // The shown program and its folded regions: the helper block and
  // every prior cell's section start collapsed; this cell's section
  // always stays expanded.
  const shownCode = $derived(
    appStore.showPlumbing && cellDisplayCode !== ''
      ? cellDisplayCode
      : cellCode,
  );
  const codeSplit = $derived(splitHelperBlock(shownCode));
  const codeSections = $derived(
    codeSplit === null ? [] : splitCellSections(codeSplit.rest),
  );
  // Index-keyed fold state for prior-cell sections — a fold stays open
  // across edits; stale indices just settle closed on next render.
  let openCells = $state<boolean[]>([]);

  function staticMath(el: HTMLElement, latex: string) {
    const sm = mountStaticMath(el);
    sm.set(latex);
    return { update: (next: string) => sm.set(next) };
  }
</script>

<div
  class="cell-output calc-output"
  class:empty={rows.length === 0 &&
    !pending &&
    failed === '' &&
    cellCode === ''}
>
  {#if cellCode !== ''}
    <div class="calc-code-toggle">
      <label>
        <input type="checkbox" bind:checked={showCode} />
        Show generating code
      </label>
      <button
        type="button"
        class="info-icon"
        aria-label="About the generating code"
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
          The Python program MathCompile generated and ran through SymPy
          to produce this cell's results.
        </span>
      </button>
    </div>
  {/if}
  {#if failed !== ''}
    <span class="parse-error-icon" title={failed}>!</span>
  {:else if rows.length > 0}
    <div class="calc-rows" class:pending={pending}>
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
          {:else if (row.severity ?? 'error') === 'error'}
            <span class="parse-error-icon" title={row.error}>!</span>
          {:else}
            <span class="note-icon" title={row.error}>i</span>
          {/if}
        </div>
      {/each}
      {#if interim}
        <span
          class="calc-interim"
          title="Estimate from the interim engine (nerdamer) — replaced by the SymPy result once the engine finishes loading."
          >estimate · SymPy still loading</span
        >
      {/if}
      {#if showCode && cellCode !== ''}
        {#if codeSplit}
          <pre class="calc-code has-fold"><button
              type="button"
              class="code-copy"
              title="Copy the code that generates this cell's results"
              onclick={() => copyGeneratingCode(shownCode)}
              >{copied ? 'Copied' : 'Copy generating code'}</button
            ><code
              >{#each highlightPython(codeSplit.head) as tok, j (j)}<span
                  class={tok.cls ? `tok-${tok.cls}` : undefined}
                  >{tok.text}</span
                >{/each}{codeSplit.head === '' ? '' : '\n'}<button
                type="button"
                class="code-fold"
                title="Toggle the clean_and_simplify helper definitions"
                aria-expanded={showHelpers}
                onclick={() => (showHelpers = !showHelpers)}
                >{showHelpers ? '▾' : '▸'}</button
              ><span class="code-helper">{#each highlightPython(
                  codeSplit.sig,
                ) as tok, j (j)}<span
                    class={tok.cls ? `tok-${tok.cls}` : undefined}
                    >{tok.text}</span
                  >{/each}</span
              >{#if !showHelpers}<span
                  class="code-elide"> ⋯</span>{/if}{'\n'}{#if showHelpers}{#each highlightPython(
                    codeSplit.body + '\n',
                  ) as tok, j (j)}<span
                    class={tok.cls ? `tok-${tok.cls}` : undefined}
                    >{tok.text}</span
                  >{/each}{/if}{#each codeSections as sec, s (s)}{#if s <
                    codeSections.length - 1 && sec.body.trim() !== ''}<button
                    type="button"
                    class="code-fold"
                    title="Toggle this cell's code"
                    aria-expanded={!!openCells[s]}
                    onclick={() => (openCells[s] = !openCells[s])}
                    >{openCells[s] ? '▾' : '▸'}</button
                  >{/if}{#each highlightPython(
                    sec.marker,
                  ) as tok, j (j)}<span
                    class={tok.cls ? `tok-${tok.cls}` : undefined}
                    >{tok.text}</span
                  >{/each}{#if s === codeSections.length - 1 || openCells[s]}{#if sec.marker !==
                      '' && sec.body !== ''}{'\n'}{/if}{#each highlightPython(
                      sec.body,
                    ) as tok, j (j)}<span
                      class={tok.cls ? `tok-${tok.cls}` : undefined}
                      >{tok.text}</span
                    >{/each}{:else if sec.body !== ''}<span
                    class="code-elide"> ⋯</span>{/if}{#if s <
                  codeSections.length - 1}{'\n'}{/if}{/each}</code
            ></pre>
        {:else}
          <pre class="calc-code"><button
              type="button"
              class="code-copy"
              title="Copy the code that generates this cell's results"
              onclick={() => copyGeneratingCode(shownCode)}
              >{copied ? 'Copied' : 'Copy generating code'}</button
            ><code
              >{#each highlightPython(shownCode) as tok, j (j)}<span
                  class={tok.cls ? `tok-${tok.cls}` : undefined}
                  >{tok.text}</span
                >{/each}</code
            ></pre>
        {/if}
      {/if}
    </div>
  {:else if pending}
    <!-- Empty cells and complete-but-empty results render nothing — a
         bare '…' reads as "still evaluating" forever. -->
    <span class="calc-status">{statusLabel}</span>
  {/if}
</div>
