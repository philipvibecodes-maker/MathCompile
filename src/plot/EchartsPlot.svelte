<script lang="ts">
  // Interim plot renderer — draws the same PlotData payload through
  // echarts (+ echarts-gl for 3-D) so a plot row is never blank while
  // plotly.js downloads, and during the whole SymPy boot window when
  // the row itself is a CE-sampled interim. `rendered` reports back
  // whether the converter produced something drawable so PlotView can
  // decide between the fail box and the fallback.
  import { onMount } from 'svelte';
  import type { ECharts } from 'echarts/core';
  import { appStore } from '../state/store.svelte';
  import type { PlotData } from './types';
  import { echartsOption, loadECharts } from './echarts';

  let {
    plot,
    height = 360,
    rendered = $bindable(false),
  }: { plot: PlotData; height?: number; rendered?: boolean } = $props();

  let el = $state<HTMLDivElement | undefined>();
  // $state — the render effect below re-runs when the async init lands;
  // a plain let would leave setOption never called.
  let chart = $state<ECharts | undefined>();

  onMount(() => {
    let alive = true;
    loadECharts()
      .then((m) => {
        if (!alive || !el) return;
        chart = m.init(el, null, { renderer: 'canvas' });
      })
      .catch(() => {
        // A failed import leaves `rendered` false — PlotView's own
        // loading path keeps covering the row.
      });
    return () => {
      alive = false;
      chart?.dispose();
      chart = undefined;
      rendered = false;
    };
  });

  $effect(() => {
    // `plot`/`darkMode` are read synchronously so a payload swap or
    // theme flip re-renders in place; `chart` gates until init lands.
    const p = plot;
    const dark = appStore.darkMode;
    const c = chart;
    if (!c) {
      rendered = false;
      return;
    }
    const opt = echartsOption(p, dark);
    if (opt === null) {
      rendered = false;
      return;
    }
    c.setOption(opt, { notMerge: true });
    rendered = true;
  });

  // Height changes (the PlotView grip drags) resize the canvas without
  // waiting for a payload re-render.
  $effect(() => {
    void height;
    chart?.resize();
  });

  export function resize() {
    chart?.resize();
  }
</script>

<div class="ecplot" bind:this={el} style:height="{height}px"></div>

<style>
  .ecplot {
    width: 100%;
  }
</style>
