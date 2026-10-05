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
    if (running) {
      // Interrupted mid-flight: keep the interrupted opacity pinned
      // across the swap so nothing snaps back to full brightness.
      anim!.cancel();
      el.style.opacity = String(cur);
      shown = text;
      void tick().then(() => {
        if (seq !== mySeq) return;
        anim = el.animate([{ opacity: cur }, { opacity: 1 }], {
          duration: Math.max(inMs * (1 - cur), 40),
          easing: 'ease-out',
        });
        anim.finished
          .then(() => {
            el.style.opacity = '';
          })
          .catch(() => {});
      });
      return;
    }
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
        anim = el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: inMs,
          easing: 'ease-out',
        });
      })
      .catch(() => {});
  });
</script>

<span bind:this={host} class="fs">{shown}</span>
