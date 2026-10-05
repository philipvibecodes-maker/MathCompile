<script lang="ts">
  import { fade } from 'svelte/transition';

  // Framework-native crossfade: re-keying swaps the span, so Svelte
  // plays the old one's outro and the new one's intro at the same time.
  // Both spans stack in the same grid cell so they overlap instead of
  // wrapping. A new message mid-fade re-keys again — the previous
  // element simply keeps fading out from wherever it was, so a
  // partially-faded message hands off directly to the next one.
  let {
    text,
    inMs = 150,
    outMs = 150,
  }: { text: string; inMs?: number; outMs?: number } = $props();
</script>

<span class="ks">
  {#key text}
    <span
      class="ks-item"
      in:fade={{ duration: inMs }}
      out:fade={{ duration: outMs }}>{text}</span
    >
  {/key}
</span>

<style>
  .ks {
    display: inline-grid;
    min-width: 0;
  }
  .ks-item {
    grid-area: 1 / 1;
    min-width: 0;
    overflow: hidden;
  }
</style>
