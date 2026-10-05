<script lang="ts" module>
  let nextVtId = 0;
</script>

<script lang="ts">
  import { tick } from 'svelte';

  // Browser-native swap via the View Transitions API: each text change
  // is wrapped in startViewTransition, which snapshots the span before
  // and after and crossfades the two images. Caveat for interruption:
  // starting a new transition while one is running SKIPS the running
  // one (it jumps to its end state), so a mid-fade message snaps rather
  // than continuing from its partial opacity — unlike the hand-rolled
  // variants. Chromium-only.
  let {
    text,
    inMs = 150,
    outMs = 150,
  }: { text: string; inMs?: number; outMs?: number } = $props();

  // svelte-ignore state_referenced_locally
  let shown = $state(text);
  const name = `vts-${nextVtId++}`;

  $effect(() => {
    if (text === shown) return;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void | Promise<void>) => unknown;
    };
    if (!doc.startViewTransition) {
      shown = text;
      return;
    }
    document.documentElement.style.setProperty(
      '--vt-swap-ms',
      `${Math.max(inMs, outMs)}ms`,
    );
    doc.startViewTransition(async () => {
      shown = text;
      await tick();
    });
  });
</script>

<span class="vts" style:view-transition-name={name}>{shown}</span>

<style>
  .vts {
    display: inline-block;
    min-width: 0;
  }
  :global(::view-transition-old(*)),
  :global(::view-transition-new(*)) {
    animation-duration: var(--vt-swap-ms, 250ms);
    animation-timing-function: ease;
  }
</style>
