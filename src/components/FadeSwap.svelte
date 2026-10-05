<script lang="ts">
  import { tick } from 'svelte';

  // Sequential fade swap driven by the Web Animations API: at rest the
  // text fades out, swaps at opacity 0, and fades back in. A new message
  // arriving mid-animation does NOT restart it — the current opacity is
  // read off the element, the text swaps immediately, and the fade
  // retargets from that partial value up to 1.
  let {
    text,
    inMs = 150,
    outMs = 150,
  }: { text: string; inMs?: number; outMs?: number } = $props();

  let host = $state<HTMLSpanElement>();
  // svelte-ignore state_referenced_locally
  let shown = $state(text);
  let anim: Animation | undefined;
  let seq = 0;

  $effect(() => {
    if (!host || text === shown) return;
    const el = host;
    const mySeq = ++seq;
    const cur = parseFloat(getComputedStyle(el).opacity) || 0;
    const running =
      anim !== undefined &&
      anim.playState !== 'finished' &&
      anim.playState !== 'idle';
    // A finished fade-out keeps compositing opacity:0 via fill:forwards
    // until cancelled — a stale one must never survive under newer fades.
    const clearAnims = () => el.getAnimations().forEach((a) => a.cancel());
    if (running) {
      // Interrupted mid-flight: swap now and retarget the fade from the
      // interrupted opacity. The span persists across text swaps, so the
      // retarget animation starts in the same task — no flash, no style
      // hold that could go stale if this swap is superseded again.
      clearAnims();
      shown = text;
      anim = el.animate([{ opacity: cur }, { opacity: 1 }], {
        duration: Math.max(inMs * (1 - cur), 40),
        easing: 'ease-out',
      });
      return;
    }
    clearAnims();
    const fadeOut = el.animate([{ opacity: cur }, { opacity: 0 }], {
      duration: outMs * cur,
      easing: 'ease-in',
      fill: 'forwards',
    });
    anim = fadeOut;
    fadeOut.finished
      .then(async () => {
        if (seq !== mySeq) return;
        shown = text;
        await tick();
        if (seq !== mySeq) return;
        clearAnims();
        anim = el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: inMs,
          easing: 'ease-out',
        });
      })
      .catch(() => {});
  });
</script>

<span bind:this={host} class="fs">{shown}</span>
