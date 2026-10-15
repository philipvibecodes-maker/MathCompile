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

  // Plot height and width, adjustable by dragging the bottom and
  // right-edge grips. Width is capped by the row's available space.
  let height = $state(360);
  let width = $state(780);
  const MIN_H = 160;
  const MAX_H = 1200;
  const MIN_W = 240;

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

  function onSideGripDown(e: PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    // The row is the clamp — the css max-width keeps the box inside it.
    const maxW = el?.parentElement?.parentElement?.clientWidth ?? 1200;
    const move = (ev: PointerEvent) => {
      width = Math.min(maxW, Math.max(MIN_W, startW + ev.clientX - startX));
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

  // Debug aid — live camera-zoom readout for 3-D scenes (tear out when
  // done tuning the camera work). Zoom is eye-distance relative to the
  // worker's initial camera: 1.00× = the shipped framing.
  let zoomText = $state('');
  let baseEye = 0;
  function updateZoom(gd: HTMLDivElement) {
    const lay = (gd as unknown as { layout?: Record<string, unknown> })
      .layout;
    let text = '';
    for (const key of Object.keys(lay ?? {})) {
      if (!/^scene\d*$/.test(key)) continue;
      const eye = (
        lay![key] as { camera?: { eye?: { x: number; y: number; z: number } } }
      )?.camera?.eye;
      if (eye) {
        const d = Math.hypot(eye.x, eye.y, eye.z);
        text = `zoom ${(baseEye ? baseEye / d : 1).toFixed(2)}×`;
        break;
      }
    }
    zoomText = text;
  }

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
    // Baseline eye distance for the zoom readout — reset whenever the
    // payload re-renders.
    const lay = layout as Record<string, unknown>;
    baseEye = 0;
    for (const key of Object.keys(lay)) {
      if (!/^scene\d*$/.test(key)) continue;
      const eye = (
        lay[key] as { camera?: { eye?: { x: number; y: number; z: number } } }
      )?.camera?.eye;
      if (eye) baseEye = Math.hypot(eye.x, eye.y, eye.z);
    }
    updateZoom(target);
    if (wiredEl !== target) {
      (
        target as unknown as { on: (ev: string, cb: () => void) => void }
      ).on('plotly_afterplot', () => {
        unpickSheet(target);
        syncMenuVisibility(target);
        updateZoom(target);
      });
      // gl3d wheel/drag camera moves are camera relayouts — afterplot
      // doesn't always fire for them, so refresh the readout here too.
      (
        target as unknown as { on: (ev: string, cb: () => void) => void }
      ).on('plotly_relayout', () => updateZoom(target));
      wiredEl = target;
    }
  });
</script>

<div class="plot-view" style:width="{width}px">
  {#if failed}
    <div class="plot-fail">couldn't render the plot: {failed}</div>
  {:else}
    <div class="plot-el" bind:this={el} style:height="{height}px"></div>
    <div
      class="plot-grip"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize plot height"
      onpointerdown={onGripDown}
    ></div>
    <div
      class="plot-grip-side"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize plot width"
      onpointerdown={onSideGripDown}
    ></div>
    {#if zoomText}
      <div class="plot-zoom">{zoomText}</div>
    {/if}
  {/if}
</div>

<style>
  .plot-view {
    /* Explicit width — as a column-flex item inside .calc-row, auto
       margins can only center the block when its width is resolved.
       The right-edge grip can grow it up to the row's full width. */
    position: relative;
    max-width: 100%;
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
  .plot-grip-side {
    position: absolute;
    top: 0;
    right: -6px;
    bottom: 12px;
    width: 12px;
    cursor: ew-resize;
    touch-action: none;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .plot-grip-side::before {
    content: '';
    width: 4px;
    height: 36px;
    border-radius: 2px;
    background: var(--faint, #cbd2dc);
    transition: background 0.15s;
  }
  .plot-grip-side:hover::before,
  .plot-grip-side:active::before {
    background: var(--muted, #94a3b8);
  }
  .plot-zoom {
    /* Debug aid — live camera-zoom readout (remove with updateZoom). */
    position: absolute;
    left: 8px;
    bottom: 14px;
    font-family: monospace;
    font-size: 12px;
    color: var(--muted, #94a3b8);
    pointer-events: none;
    user-select: none;
  }
  .plot-fail {
    color: var(--accent-text, #b91c1c);
    font-size: 13px;
  }
</style>
