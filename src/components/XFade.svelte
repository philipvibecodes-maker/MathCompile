<script lang="ts">
  // Crossfade text swap: the previous message lingers as a ghost layer
  // fading out on top of the new message fading in. A swap during a fade
  // just adds another ghost — every layer fades independently, so a
  // partially-faded message hands off directly to the next one.
  let {
    text,
    inMs = 150,
    outMs = 150,
  }: { text: string; inMs?: number; outMs?: number } = $props();

  // svelte-ignore state_referenced_locally
  let shown = $state(text);
  let ghosts: { id: number; text: string }[] = $state([]);
  let uid = 0;

  $effect(() => {
    if (text === shown) return;
    const g = { id: ++uid, text: shown };
    ghosts = [...ghosts, g];
    shown = text;
    setTimeout(
      () => (ghosts = ghosts.filter((x) => x.id !== g.id)),
      outMs + 30,
    );
  });
</script>

<span class="xf" style:--xf-in="{inMs}ms" style:--xf-out="{outMs}ms">
  {#each ghosts as g (g.id)}
    <span class="xf-ghost" aria-hidden="true">{g.text}</span>
  {/each}
  {#key shown}
    <span class="xf-live">{shown}</span>
  {/key}
</span>

<style>
  .xf {
    position: relative;
    display: inline-block;
    min-width: 0;
  }
  .xf-live {
    animation: xf-in var(--xf-in, 150ms) ease-out;
  }
  .xf-ghost {
    position: absolute;
    inset: 0;
    overflow: hidden;
    white-space: nowrap;
    pointer-events: none;
    animation: xf-out var(--xf-out, 150ms) ease-out forwards;
  }
  @keyframes xf-in {
    from {
      opacity: 0;
    }
  }
  @keyframes xf-out {
    to {
      opacity: 0;
    }
  }
</style>
