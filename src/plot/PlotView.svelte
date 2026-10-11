<script lang="ts">
  // Renders one `\text{plot}` row's sampled payload. plotly.js (~1MB
  // min) is dynamically imported on first mount so worksheets without
  // plots never pay for it; `Plotly.react` re-diffs on every payload
  // change so edits re-render the figure in place.
  import { onMount } from 'svelte';
  import type PlotlyT from 'plotly.js-dist-min';
  import { appStore } from '../state/store.svelte';
  import type { PlotData } from './types';
  import { applyModeAxes, GL3D_TYPES, themedFigure } from './theme';

  let { plot }: { plot: PlotData } = $props();

  let el = $state<HTMLDivElement | undefined>();
  let Plotly = $state<typeof PlotlyT | undefined>();
  let failed = $state('');

  // Plot height, adjustable by dragging the bottom grip.
  let height = $state(360);
  const MIN_H = 160;
  const MAX_H = 1200;

  function onGripDown(e: PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const move = (ev: PointerEvent) => {
      height = Math.min(MAX_H, Math.max(MIN_H, startH + ev.clientY - startY));
      // Live-resize without waiting for a themed re-render —
      // Plotly.react picks the size up on the next render anyway.
      if (el && Plotly) Plotly.Plots.resize(el);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  const CONFIG = {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ['toImage'],
    scrollZoom: true,
    doubleClick: 'reset',
    // gl3d has no MSAA — supersample the GL canvas (default 2) so
    // scene edges and gridlines don't stair-step.
    plotGlPixelRatio: 4,
  };

  // The translucent z=0 sheet occludes gl3d picking — the pick
  // framebuffer resolves the front-most fragment regardless of
  // hoverinfo — so hovering the surface below the plane gave no
  // tooltip. Zeroing the sheet's pick slots keeps it rendered but
  // invisible to the pick pass; plotly recreates GL objects on every
  // redraw, so it must re-run on plotly_afterplot.
  interface GlScene {
    traces?: Record<string, { data?: { name?: string }; surface?: GlSurface }>;
    glplot?: { remove: (s: GlSurface) => void; add: (s: GlSurface) => void };
  }
  interface GlSurface {
    pickSlots: number;
    __noPick?: boolean;
  }
  function unpickSheet(gd: HTMLDivElement) {
    const layout = (
      gd as unknown as { _fullLayout?: { scene?: { _scene?: GlScene } } }
    )._fullLayout;
    const scene = layout?.scene?._scene;
    if (!scene?.traces || !scene.glplot) return;
    for (const t of Object.values(scene.traces)) {
      if (t.data?.name === 'xysheet' && t.surface && !t.surface.__noPick) {
        t.surface.pickSlots = 0;
        scene.glplot.remove(t.surface); // re-add forces slot reallocation
        scene.glplot.add(t.surface); // stays last → still draws on top
        t.surface.__noPick = true;
      }
    }
  }
  // updatemenus hide/show traces via a per-trace `visible` array —
  // which gl3d traces ignore (scalar restyle+indices is the only form
  // that reaches them; cartesian traces honor the array fine). After
  // a menu click, `_fullLayout.updatemenus[].active` holds the chosen
  // button — re-apply its vis list to gl3d traces in the working form.
  // Runs on afterplot and is a no-op once state matches, so it can't
  // loop on its own restyles.
  function syncMenuVisibility(gd: HTMLDivElement) {
    if (!Plotly) return;
    const gd2 = gd as unknown as {
      _fullLayout?: {
        updatemenus?: { active?: number; buttons?: { args?: unknown[] }[] }[];
      };
      data?: { type?: string; visible?: unknown }[];
    };
    const data = gd2.data;
    if (!gd2._fullLayout?.updatemenus || !data) return;
    for (const m of gd2._fullLayout.updatemenus) {
      const vis = (
        typeof m.active === 'number' && m.active >= 0
          ? m.buttons?.[m.active]?.args
          : undefined
      )?.find(
        (a): a is { visible: unknown[] } =>
          !!a && Array.isArray((a as { visible?: unknown }).visible),
      )?.visible;
      if (!vis) continue;
      const off: number[] = [];
      const on: number[] = [];
      data.forEach((t, i) => {
        if (i >= vis.length || !t.type || !GL3D_TYPES.has(t.type)) return;
        const want = vis[i];
        const cur = t.visible === undefined ? true : t.visible;
        if (cur !== want) {
          (want === false || want === 'legendonly' ? off : on).push(i);
        }
      });
      if (off.length) void Plotly.restyle(gd, 'visible', false, off);
      if (on.length) void Plotly.restyle(gd, 'visible', true, on);
    }
  }

  // The afterplot listener is bound once per graph element — a remount
  // (the fail branch swapping in/out) gets a fresh element and a fresh
  // binding.
  let wiredEl: HTMLDivElement | undefined;

  onMount(() => {
    let alive = true;
    import('plotly.js-dist-min')
      .then((m) => {
        if (alive) Plotly = m.default;
      })
      .catch((e) => {
        if (alive) failed = e instanceof Error ? e.message : String(e);
      });
    return () => {
      alive = false;
      if (el && Plotly) Plotly.purge(el);
    };
  });

  $effect(() => {
    // `plot` is read synchronously so every payload swap re-renders —
    // rows are keyed by index, so without this the figure would keep
    // showing whatever was evaluated when the row first mounted.
    // `appStore.darkMode` re-renders on theme flips.
    const p = plot;
    const target = el;
    const P = Plotly;
    const dark = appStore.darkMode;
    if (!target || !P) return;
    const { data, layout } = themedFigure(p, dark);
    applyModeAxes({ data, layout });
    P.react(target, data, { ...layout, autosize: true }, CONFIG).catch(
      (e) => {
        failed = e instanceof Error ? e.message : String(e);
      },
    );
    if (wiredEl !== target) {
      (
        target as unknown as { on: (ev: string, cb: () => void) => void }
      ).on('plotly_afterplot', () => {
        unpickSheet(target);
        syncMenuVisibility(target);
      });
      wiredEl = target;
    }
  });
</script>

<div class="plot-view">
  {#if failed}
    <div class="plot-fail">couldn't render the plot: {failed}</div>
  {:else}
    <div class="plot-el" bind:this={el} style:height="{height}px"></div>
    <div
      class="plot-grip"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize plot"
      onpointerdown={onGripDown}
    ></div>
  {/if}
</div>

<style>
  .plot-view {
    /* Explicit width — as a column-flex item inside .calc-row, auto
       margins can only center the block when its width is resolved. */
    width: min(640px, 100%);
    margin: 4px auto;
  }
  .plot-el {
    width: 100%;
  }
  .plot-grip {
    height: 12px;
    cursor: ns-resize;
    touch-action: none;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .plot-grip::before {
    content: '';
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--faint, #cbd2dc);
    transition: background 0.15s;
  }
  .plot-grip:hover::before,
  .plot-grip:active::before {
    background: var(--muted, #94a3b8);
  }
  .plot-fail {
    color: var(--accent-text, #b91c1c);
    font-size: 13px;
  }
</style>
