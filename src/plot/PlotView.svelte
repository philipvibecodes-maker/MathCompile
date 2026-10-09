<script lang="ts">
  // Renders one `\text{plot}` row's sampled payload. plotly.js (~1MB
  // min) is dynamically imported on first mount so worksheets without
  // plots never pay for it.
  import { onMount } from 'svelte';
  import type { PlotData } from './types';
  import { plotFigure } from './figures';

  let { plot }: { plot: PlotData } = $props();

  let el = $state<HTMLDivElement | undefined>();
  let failed = $state('');

  onMount(() => {
    let alive = true;
    const render = async () => {
      try {
        const { default: Plotly } = await import('plotly.js-dist-min');
        if (!alive || !el) return;
        const { traces, layout } = plotFigure(plot);
        await Plotly.newPlot(
          el,
          traces,
          { ...layout, autosize: true },
          {
            displaylogo: false,
            responsive: true,
            modeBarButtonsToRemove: ['toImage'],
            scrollZoom: true,
          },
        );
      } catch (e) {
        if (alive) failed = e instanceof Error ? e.message : String(e);
      }
    };
    render();
    return () => {
      alive = false;
      if (el) import('plotly.js-dist-min').then((m) => m.default.purge(el!));
    };
  });
</script>

<div class="plot-view">
  {#if failed}
    <div class="plot-fail">couldn't render the plot: {failed}</div>
  {:else}
    <div class="plot-el" bind:this={el}></div>
  {/if}
</div>

<style>
  .plot-view {
    margin: 4px 0;
    max-width: 640px;
  }
  .plot-el {
    width: 100%;
    height: 360px;
  }
  .plot-fail {
    color: var(--accent-text, #b91c1c);
    font-size: 13px;
  }
</style>
