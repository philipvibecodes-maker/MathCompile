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
  let failed = $state('');

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
    const timer = setTimeout(() => {
      if (mine !== seq) return;
      // While the engine boots, show nerdamer's instant best-effort
      // result — rendered dimmed since the real eval is still pending.
      if (calcEngine.status !== 'ready') {
        interimEvaluate(latex).then((r) => {
          if (mine === seq && r.length > 0) rows = r;
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

  function staticMath(el: HTMLElement, latex: string) {
    const sm = mountStaticMath(el);
    sm.set(latex);
    return { update: (next: string) => sm.set(next) };
  }
</script>

<div class="cell-output calc-output">
  {#if failed !== ''}
    <span class="calc-error" title={failed}>{failed}</span>
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
              {@const toks = highlightPython(row.code)}
              <pre class="calc-code"><code
                  >{#each toks as tok, j (j)}<span
                      class={tok.cls ? `tok-${tok.cls}` : undefined}
                      >{tok.text}</span
                    >{/each}</code
                ></pre>
            {/if}
          {:else}
            <code class="calc-error" title={row.error}>{row.error}</code>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <span class="calc-status">{statusLabel}</span>
  {/if}
</div>
