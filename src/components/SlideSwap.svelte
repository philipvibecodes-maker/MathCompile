<script lang="ts">
  import { fly } from 'svelte/transition';

  // Ticker-feel swap on the same re-key mechanism: the old message
  // slides up and fades out while the new one rises in from below,
  // stacked in one grid cell. A change mid-fade re-keys again, so a
  // partially-moved message keeps sliding out while the next enters.
  let {
    text,
    inMs = 150,
    outMs = 150,
  }: { text: string; inMs?: number; outMs?: number } = $props();
</script>

<span class="ss">
  {#key text}
    <span
      class="ss-item"
      in:fly={{ y: 8, duration: inMs }}
      out:fly={{ y: -8, duration: outMs }}>{text}</span
    >
  {/key}
</span>

<style>
  .ss {
    display: inline-grid;
    min-width: 0;
  }
  .ss-item {
    grid-area: 1 / 1;
    min-width: 0;
    overflow: hidden;
  }
</style>
