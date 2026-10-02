<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cellIssues } from '../calc/calculator.svelte.ts';
  import { loadPrefs } from '../state/persistence';
  import type { Cell } from '../state/store.svelte';

  // This cell's issue messages in the input column: markers show
  // instantly under the field, then the panel mounts once typing has
  // paused for debounceMs — the python overlay's dynamics, but in flow
  // here so a multi-line field's other input lines are never covered.
  // CalcOutput publishes the issues into cellIssues as evals land.
  let { cell }: { cell: Cell } = $props();

  const animPrefs = loadPrefs();
  const debounceMs = animPrefs.debounceMs ?? 600;
  const fadeInMs = animPrefs.fadeInMs ?? 150;
  const fadeOutMs = animPrefs.fadeOutMs ?? 150;
  const issues = $derived(cellIssues[cell.id] ?? []);
  let issuesVisible = $state(false);
  let issueTimer: ReturnType<typeof setTimeout> | undefined;
  $effect.pre(() => {
    // Subscribing to cell.latex + issues re-runs this on every keystroke
    // and every fresh eval result — either restarts the pause countdown
    // the panel waits on.
    const armed = cell.latex;
    if (issues.length === 0) {
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
</script>

{#if issues.length > 0}
  {#if issuesVisible}
    <ul
      class="calc-issues"
      in:fade={{ duration: fadeInMs }}
      out:fade={{ duration: fadeOutMs }}
    >
      {#each issues as iss, j (j)}
        <li class="issue-{iss.severity}">
          {#if iss.severity === 'error'}<span
              class="parse-error-icon"
              title={iss.message}>!</span
            >{/if}{iss.message}
        </li>
      {/each}
    </ul>
  {:else}
    <div class="calc-issue-markers">
      {#each issues as iss, j (j)}
        {#if iss.severity === 'error'}
          <span class="parse-error-icon" title={iss.message}>!</span>
        {:else}
          <span class="note-icon" title={iss.message}>i</span>
        {/if}
      {/each}
    </div>
  {/if}
{/if}
