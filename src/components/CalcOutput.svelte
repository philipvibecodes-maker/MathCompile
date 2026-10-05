<script lang="ts">
  import {
    calcEngine,
    evaluate,
    interimEvaluate,
    type CalcRow,
  } from '../calc/calculator.svelte.ts';
  import { latexToStatementStrings } from '../compile/ir';
  import { mountStaticMath } from '../editor/static-math';
  import { highlightPython } from '../calc/python-highlight';
  import { appStore, type Cell } from '../state/store.svelte';

  // Per-cell SymPy output for the calculator target. Edits are debounced,
  // then the cell evaluates through the codegen pipeline — one result
  // row per top-level statement; stale responses are dropped via the
  // seq guard. Mounted only while target === 'calculator'.
  let { cell }: { cell: Cell } = $props();

  let rows = $state<CalcRow[]>([]);
  let pending = $state(false);
  // True while the shown rows came from the nerdamer interim engine —
  // they're estimates, so the UI marks them until SymPy rows land.
  let interim = $state(false);
  let failed = $state('');
  // Per-cell opt-in to the `e = ...` display plumbing lines in .calc-code.
  let showPlumbing = $state(false);
  // Folded body of the clean_and_simplify helper block in row-0 code.
  let showHelpers = $state(false);
  const hasPlumbing = $derived(
    appStore.showCode &&
      rows.some((r) => r.ok && r.displayCode && r.displayCode !== r.code),
  );

  // Nothing evaluated yet and nothing pending: the stacked layout drops
  // the output band entirely so an empty cell renders as input-only.
  const empty = $derived(
    failed === '' && rows.length === 0 && !pending,
  );

  const statusLabel = $derived(
    calcEngine.status === 'loading'
      ? 'Loading SymPy engine…'
      : calcEngine.status === 'error'
        ? 'SymPy engine failed to load'
        : '…',
  );

  let seq = 0;
  $effect(() => {
    const latex = cell.latex;
    const mine = ++seq;
    if (latexToStatementStrings(latex).length === 0) {
      rows = [];
      pending = false;
      interim = false;
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
          if (mine === seq && pending && r.length > 0) {
            rows = r;
            interim = true;
          }
        });
      }
      evaluate(cell).then(
        (r) => {
          if (mine !== seq) return;
          rows = r;
          pending = false;
          interim = false;
          failed = '';
        },
        (e) => {
          if (mine !== seq) return;
          pending = false;
          interim = false;
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

<div class="cell-output calc-output" class:empty>
  {#if failed !== ''}
    <span class="calc-error" title={failed}>{failed}</span>
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
            <code class="calc-error" title={row.error}>{row.error}</code>
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
