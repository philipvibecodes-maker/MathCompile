<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cellIssues } from '../calc/calculator.svelte.ts';
  import { appStore, type Cell } from '../state/store.svelte';
  import VtSwap from './VtSwap.svelte';

  // This cell's issue messages in the input column: once typing has
  // paused for debounceMs, each message mounts as a chip pinned
  // horizontally next to its own input line (inline tail — the chip
  // starts where the line's math ends, and same-line issues stack
  // downward). Lines without issues keep nothing painted over them.
  // CalcOutput publishes the issues into cellIssues as evals land.
  let { cell }: { cell: Cell } = $props();

  // Animation knobs live on the store so the settings sliders apply
  // without a remount.
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
    }, appStore.debounceMs);
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
  let overlayEl = $state<HTMLElement | undefined>(undefined);
  let overlayW = $state(0);
  $effect(() => {
    // Re-measure whenever the field's content or its issue set changes
    // (issues land long after MathQuill finishes rendering a keystroke).
    anchors =
      cell.latex !== '' || issues.length > 0
        ? (appStore.fields.get(cell.id)?.lineAnchors() ?? [])
        : [];
    // The layer spans .cell-input — each chip's max width is the space
    // left of it to the cell edge, so a message is only truncated when
    // the cell itself runs out of room.
    overlayW = overlayEl?.clientWidth ?? 0;
  });
  // The anchor row a line-bound issue pins to (clamp to the rendered
  // lines; unbound issues pin to line 0).
  const anchorRow = (line: number | undefined): number =>
    Math.min(line ?? 0, anchors.length - 1);

  // One chip per input line — issues on the same line stack inside it,
  // so a second issue can't drift down onto the next line's anchor.
  const chips = $derived(
    anchors.length === 0
      ? []
      : (() => {
          const byLine = new Map<number, typeof issues>();
          for (const iss of issues) {
            const row = anchorRow(iss.line);
            byLine.set(row, [...(byLine.get(row) ?? []), iss]);
          }
          return [...byLine.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([row, list]) => ({ row, a: anchors[row], list }));
        })(),
  );
</script>

{#if issues.length > 0}
  {#if issuesVisible}
    {#if anchors.length > 0}
      <ul
        class="calc-issues calc-issues-inline"
        bind:this={overlayEl}
        in:fade={{ duration: appStore.fadeInMs }}
        out:fade={{ duration: appStore.fadeOutMs }}
      >
        {#each chips as chip (chip.row)}
          {@const a = chip.a}
          <li
            class="issue-{chip.list.some((i) => i.severity === 'error')
              ? 'error'
              : 'note'}"
            style="top: {a.top + a.height / 2}px; left: {a.right +
              6}px; max-width: {Math.max(overlayW - a.right - 12, 120)}px"
          >
            <div class="chip-msgs">
              {#each chip.list as iss, k (k)}
                <span class="chip-msg" title={iss.message}
                  >{#if iss.severity === 'error'}<span
                      class="parse-error-icon">!</span
                    >{/if}<span class="chip-text"
                      ><VtSwap
                        text={iss.message}
                        inMs={appStore.fadeInMs}
                        outMs={appStore.fadeOutMs}
                      /></span
                    ></span
                >
              {/each}
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <ul
        class="calc-issues"
        in:fade={{ duration: appStore.fadeInMs }}
        out:fade={{ duration: appStore.fadeOutMs }}
      >
        {#each issues as iss, j (j)}
          <li class="issue-{iss.severity}">
            {#if iss.severity === 'error'}<span
                class="parse-error-icon"
                title={iss.message}>!</span
              >{/if}<VtSwap
                text={iss.message}
                inMs={appStore.fadeInMs}
                outMs={appStore.fadeOutMs}
              />
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
{/if}
