import { describe, expect, it } from 'vitest';
import { echartsOption } from './echarts';
import type { PlotData } from './types';

const plot = (data: Record<string, unknown>[]): PlotData => ({
  kind: '1x1',
  vars: ['x'],
  label: 'x',
  figure: { data, layout: {} },
});

const series = (opt: Record<string, unknown>) =>
  opt.series as Record<string, unknown>[];

describe('echartsOption', () => {
  it('converts a 2-D scatter to a line series', () => {
    const opt = echartsOption(
      plot([
        {
          type: 'scatter',
          x: [0, 1, 2],
          y: [0, 1, 4],
          mode: 'lines',
          line: { color: '#ff0000', width: 2 },
        },
      ]),
      false,
    );
    expect(opt).not.toBeNull();
    const s = series(opt!);
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe('line');
    expect(s[0].data).toEqual([
      [0, 0],
      [1, 1],
      [2, 4],
    ]);
    expect((s[0].lineStyle as { color: string }).color).toBe('#ff0000');
  });

  it('maps non-finite y samples to null gaps', () => {
    const opt = echartsOption(
      plot([
        {
          type: 'scatter',
          x: [-1, 0, 1],
          y: [1, NaN, 1],
          mode: 'lines',
        },
      ]),
      false,
    )!;
    const data = series(opt)[0].data as [number, number | null][];
    expect(data[1][1]).toBeNull();
    expect(opt.xAxis).toBeDefined();
  });

  it('converts a scatter3d line trace to line3D on a grid3D', () => {
    const opt = echartsOption(
      plot([
        {
          type: 'scatter3d',
          x: [0, 1],
          y: [1, 0],
          z: [0, 2],
          mode: 'lines',
          name: 'curve',
        },
      ]),
      true,
    )!;
    const s = series(opt);
    expect(s[0].type).toBe('line3D');
    expect(s[0].data).toEqual([
      [0, 1, 0],
      [1, 0, 2],
    ]);
    expect(opt.grid3D).toBeDefined();
    expect(opt.xAxis3D).toBeDefined();
  });

  it('converts a surface + hidden heatmap figure to a gl surface', () => {
    const opt = echartsOption(
      plot([
        {
          type: 'surface',
          x: [0, 1],
          y: [0, 1],
          z: [
            [0, 1],
            [1, 2],
          ],
          name: 'surf',
        },
        {
          type: 'heatmap',
          x: [0, 1],
          y: [0, 1],
          z: [
            [0, 1],
            [1, 2],
          ],
          visible: false,
          name: 'heatmap',
        },
      ]),
      false,
    )!;
    const s = series(opt);
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe('surface');
    expect(s[0].dataShape).toEqual([2, 2]);
    expect(s[0].data).toEqual([
      [0, 0, 0],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 2],
    ]);
  });

  it('falls back to a heatmap when no gl trace exists', () => {
    const opt = echartsOption(
      plot([
        {
          type: 'heatmap',
          x: [-3, 0],
          y: [0, 3],
          z: [
            [0, NaN],
            [2, 1],
          ],
          name: 'heatmap',
        },
      ]),
      false,
    )!;
    const s = series(opt);
    expect(s[0].type).toBe('heatmap');
    // The NaN cell is dropped, indices address the category axes.
    expect(s[0].data).toEqual([
      [0, 0, 0],
      [0, 1, 2],
      [1, 1, 1],
    ]);
    expect(opt.visualMap).toBeDefined();
  });

  it('synthesizes arrow segments for a quiver trace', () => {
    // Two unit +x arrows on a 2-point grid, pitch 1. Each arrow packs
    // as shaft + 2 head barbs — 7 slots per arrow, NaN-separated —
    // into one line series.
    const opt = echartsOption(
      plot([
        {
          type: 'quiver',
          x: [0, 1],
          y: [0, 0],
          u: [1, 1],
          v: [0, 0],
          name: 'field',
          marker: { color: '#3b82f6' },
        },
        // A hidden mode's traces stay hidden — the img traces don't convert.
        { type: 'scatter', x: [0, 1], y: [0, 1], mode: 'lines', visible: false, name: 'image of x = k' },
      ]),
      false,
    );
    expect(opt).not.toBeNull();
    const s = series(opt!);
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe('line');
    const data = s[0].data as [number, number | null][];
    expect(data.length).toBe(14);
    // Nulls break the line between shaft and barbs of each arrow.
    expect(data[2][1]).toBeNull();
    expect(data[6][1]).toBeNull();
    // Arrow length is normalized: the longest vector spans 0.8·pitch
    // (pitch=1 here) centered on its grid point — shafts run ±0.4
    // around each anchor.
    expect(data[0][0]).toBeCloseTo(-0.4, 9);
    expect(data[1][0]).toBeCloseTo(0.4, 9);
    expect(data[7][0]).toBeCloseTo(0.6, 9);
    expect(data[8][0]).toBeCloseTo(1.4, 9);
    expect((s[0].lineStyle as { color: string }).color).toBe('#3b82f6');
  });

  it('skips decor and text traces', () => {
    const opt = echartsOption(
      plot([
        { type: 'scatter3d', x: [0], y: [0], z: [0], mode: 'text', name: 'ticks' },
        { type: 'scatter3d', x: [0], y: [0], z: [0], mode: 'lines', name: 'box' },
      ]),
      false,
    );
    expect(opt).toBeNull();
  });

  it('returns null when nothing converts', () => {
    expect(echartsOption(plot([]), false)).toBeNull();
    expect(echartsOption(plot([{ type: 'pie' }]), false)).toBeNull();
  });

  it('uses the dark palette for axis colors', () => {
    const light = echartsOption(
      plot([{ type: 'scatter', x: [0], y: [0], mode: 'lines' }]),
      false,
    )!;
    const dark = echartsOption(
      plot([{ type: 'scatter', x: [0], y: [0], mode: 'lines' }]),
      true,
    )!;
    const tickColor = (o: Record<string, unknown>) =>
      ((o.xAxis as Record<string, unknown>).axisLabel as { color: string })
        .color;
    expect(tickColor(light)).not.toBe(tickColor(dark));
  });
});
