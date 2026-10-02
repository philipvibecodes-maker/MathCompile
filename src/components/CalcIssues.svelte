<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cellIssues } from '../calc/calculator.svelte.ts';
  import { loadPrefs } from '../state/persistence';
  import { appStore, type Cell } from '../state/store.svelte';

  // This cell's issue messages in the input column: markers show
  // instantly under the field, then each message mounts as a chip pinned
  // horizontally next to its own input line (inline tail — the chip
  // starts where the line's math ends). Lines without issues keep
  // nothing painted over them. CalcOutput publishes the issues into
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
    // the chips wait on.
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
  {#if issuesVisible}
    {#if anchors.length > 0}
      <ul
        class="calc-issues calc-issues-inline"
        in:fade={{ duration: fadeInMs }}
        out:fade={{ duration: fadeOutMs }}
      >
        {#each issues as iss, j (j)}
          {@const a = anchorFor(iss.line)}
          {#if a}
            <li
              class="issue-{iss.severity}"
              style="top: {a.top + a.height / 2}px; left: {a.right + 6}px"
              title={iss.message}
            >
              {#if iss.severity === 'error'}<span class="parse-error-icon"
                  >!</span
                >{/if}<span class="chip-text">{iss.message}</span>
            </li>
          {/if}
        {/each}
      </ul>
    {:else}
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
    {/if}
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
