<script lang="ts">
  // Worksheet-level compile output: the generated program, any issues the
  // pipeline raised, and a collapsible debug view of each cell's normalized
  // IR (MathJSON) plus its raw LaTeX.
  import type { Cell } from '../appState.svelte.ts';
  import type { CompileResult } from '../codegen.ts';
  import { outputLatex } from '../latex.ts';

  let {
    result,
    cells,
    label,
  }: {
    result: CompileResult;
    cells: Cell[];
    label: string;
  } = $props();

  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  function copyProgram() {
    navigator.clipboard.writeText(result.program);
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 1200);
  }
</script>

<section class="output-panel" aria-label="Compiled output">
  <div class="output-panel-head">
    <h2>{label}</h2>
    <button
      class="cell-copy"
      title="Copy program"
      disabled={result.program.trim() === ''}
      onclick={copyProgram}>{copied ? 'Copied' : 'Copy'}</button
    >
  </div>

  {#if result.program.trim() !== ''}
    <pre class="output-code"><code>{result.program}</code></pre>
  {/if}

  {#if result.issues.length > 0}
    <ul class="output-issues">
      {#each result.issues as iss, i (i)}
        <li class="issue-{iss.severity}">{iss.message}</li>
      {/each}
    </ul>
  {/if}

  <details class="output-debug">
    <summary>Normalized IR + raw LaTeX</summary>
    <ol class="debug-list">
      {#each cells as cell, i (cell.id)}
        <li class="debug-cell">
          <div class="debug-cell-head">
            <span class="debug-index">{i + 1}</span>
            <code class="debug-latex">{outputLatex(cell.latex)}</code>
          </div>
          <pre class="debug-ir">{JSON.stringify(
              result.normalized[i]?.ir ?? null,
              null,
              2,
            )}</pre>
        </li>
      {/each}
    </ol>
  </details>
</section>
