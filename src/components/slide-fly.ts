import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

// fly() writes `transform`, which clobbers a stylesheet transform on the
// element (e.g. .calc-issues-inline li's translateY(-50%) centering).
// This variant tweens the standalone `translate` property instead, so an
// element's own transform composes with the slide.
export function slideFly(
  _node: Element,
  { y = 8, duration = 150 }: { y?: number; duration?: number } = {},
): TransitionConfig {
  return {
    duration,
    easing: cubicOut,
    css: (t, u) => `translate: 0 ${u * y}px; opacity: ${t}`,
  };
}
