<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cellIssues } from '../calc/calculator.svelte.ts';
  import { loadPrefs } from '../state/persistence';
  import { appStore, type Cell } from '../state/store.svelte';

  // This cell's issue messages, in a dedicated margin rail beside the
  // field: markers show instantly, then each message mounts aligned
  // horizontally with its own input line. The rail is real layout — it
  // shrinks the field's width instead of floating over it, so no input
  // line is ever painted over. CalcOutput publishes the issues into
  // cellIssues as evals land.
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
    // the rail waits on.
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

  // Per-line anchors in field coordinates, re-measured whenever the
  // field's content or its issue set changes (issues land long after
  // MathQuill finishes rendering the keystroke, so the DOM is settled).
  interface Anchor {
    top: number;
    height: number;
    right: number;
  }
  let anchors = $state<Anchor[]>([]);
  $effect(() => {
    issues;
    cell.latex;
    anchors = appStore.fields.get(cell.id)?.lineAnchors() ?? [];
  });
  const anchorFor = (line: number | undefined): Anchor | undefined =>
    anchors[Math.min(line ?? 0, anchors.length - 1)];
</script>

{#if issues.length > 0}
  <div class="calc-issue-rail">
    {#if issuesVisible}
      {#each issues as iss, j (j)}
        {@const a = anchorFor(iss.line)}
        <div
          class="rail-note issue-{iss.severity}"
          class:rail-static={a === undefined}
          style={a ? `top: ${a.top + a.height / 2}px` : ''}
          title={iss.message}
          in:fade={{ duration: fadeInMs }}
          out:fade={{ duration: fadeOutMs }}
        >
          {#if iss.severity === 'error'}<span class="parse-error-icon"
              >!</span
            >{/if}<span class="chip-text">{iss.message}</span>
        </div>
      {/each}
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
  </div>
{/if}
