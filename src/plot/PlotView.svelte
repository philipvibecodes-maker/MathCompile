<script lang="ts">
  // Renders one `\text{plot}` row's sampled payload. plotly.js (~1MB
  // min) is dynamically imported on first mount so worksheets without
  // plots never pay for it; `Plotly.react` re-diffs on every payload
  // change so edits re-render the figure in place.
  import { onMount } from 'svelte';
  import type PlotlyT from 'plotly.js-dist-min';
  import { appStore } from '../state/store.svelte';
  import type { PlotData } from './types';
  import { applySceneOptions, themedFigure } from './theme';

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

  // GeoGebra-style 'xy plane' options for 3-D figures — both default
  // on. The figure opts in by carrying the worker's meta-tagged plane
  // traces (R3 kinds only); 2-D plots never see the checkboxes.
  let planeOrigin = $state(true);
  let planeOnly = $state(true);
  const hasPlane = $derived(
    plot.figure.data.some(
      (tr) =>
        typeof tr.meta === 'object' &&
        tr.meta !== null &&
        (tr.meta as Record<string, unknown>).mcRole === 'xyplane',
    ),
  );

  const CONFIG = {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ['toImage'],
    scrollZoom: true,
    // gl3d has no MSAA — supersample the GL canvas (default 2) so slab
    // edges and gridlines don't stair-step.
    plotGlPixelRatio: 4,
  };

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
    // Reading the checkbox states here makes a toggle re-render the
    // figure in place (Plotly.react diffs).
    const origin = planeOrigin;
    const only = planeOnly;
    const showOpts = hasPlane;
    if (!target || !P) return;
    const { data, layout } = themedFigure(p, dark);
    if (showOpts) applySceneOptions({ data, layout }, {
      planeOrigin: origin,
      planeOnly: only,
    });
    P.react(target, data, { ...layout, autosize: true }, CONFIG).catch(
      (e) => {
        failed = e instanceof Error ? e.message : String(e);
      },
    );
  });
</script>

<div class="plot-view">
  {#if failed}
    <div class="plot-fail">couldn't render the plot: {failed}</div>
  {:else}
    <div class="plot-el" bind:this={el} style:height="{height}px"></div>
    {#if hasPlane}
      <div class="plot-opts">
        <label>
          <input type="checkbox" bind:checked={planeOrigin} />
          xy plane through origin
        </label>
        <label>
          <input type="checkbox" bind:checked={planeOnly} />
          xy plane only
        </label>
      </div>
    {/if}
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
  .plot-opts {
    display: flex;
    gap: 16px;
    padding: 2px 2px 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .plot-opts label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }
</style>
