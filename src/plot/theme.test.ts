import { describe, expect, it } from 'vitest';
import { applyModeAxes, themedFigure } from './theme';
import type { PlotData } from './types';

// A minimal 3-D figure dict as the worker emits it: the named scene
// decor traces (grid, box, arrow axes, ticks), the brick-red surface,
// a hidden 2-D-mode heatmap, and the translucent sheet last.
function plot3d(): PlotData {
  return {
    kind: '2x1',
    vars: ['x', 'y'],
    label: 'f',
    figure: {
      data: [
        {
          type: 'scatter3d',
          mode: 'lines',
          name: 'wallgrid',
          line: { color: 'rgba(0,0,0,0.16)', width: 1 },
        },
        {
          type: 'scatter3d',
          mode: 'lines',
          name: 'box',
          line: { color: '#e3e3e3', width: 1.5 },
        },
        {
          type: 'scatter3d',
          mode: 'lines',
          name: 'axis',
          line: { color: '#9d9d9d', width: 3 },
        },
        {
          type: 'cone',
          name: 'axis',
          colorscale: [
            [0, '#9d9d9d'],
            [1, '#9d9d9d'],
          ],
        },
        {
          type: 'scatter3d',
          mode: 'text',
          name: 'axis',
          text: ['<b>x</b>'],
          textfont: { color: '#9d9d9d', size: 17 },
        },
        {
          type: 'scatter3d',
          mode: 'text',
          name: 'ticks',
          text: ['0'],
          textfont: { color: '#8c8c8c', size: 12 },
        },
        {
          type: 'surface',
          name: 'surf',
          colorscale: [
            [0, '#c74440'],
            [1, '#c74440'],
          ],
          contours: {
            x: { show: true, color: '#7e1f1a', width: 1 },
            y: { show: true, color: '#7e1f1a', width: 1 },
            z: { show: false },
          },
        },
        { type: 'heatmap', name: 'heatmap', visible: false },
        {
          type: 'surface',
          name: 'xysheet',
          colorscale: [
            [0, '#d9d9d9'],
            [1, '#d9d9d9'],
          ],
          opacity: 0.5,
        },
      ],
      layout: {},
    },
  };
}

const themed = (dark = true) => themedFigure(plot3d(), dark);

describe('themedFigure named scene traces', () => {
  it('restyles the decor traces for dark mode', () => {
    const { data } = themed(true);
    expect((data[0].line as Record<string, unknown>).color).toBe(
      'rgba(255,255,255,0.16)',
    );
    expect((data[1].line as Record<string, unknown>).color).toBe(
      '#3c4454',
    );
    expect((data[2].line as Record<string, unknown>).color).toBe(
      '#8b93a1',
    );
    expect(data[3].colorscale).toEqual([
      [0, '#8b93a1'],
      [1, '#8b93a1'],
    ]);
    expect(
      (data[4].textfont as Record<string, unknown>).color,
    ).toBe('#8b93a1');
    expect(
      (data[5].textfont as Record<string, unknown>).color,
    ).toBe('#7d8590');
  });

  it('restyles the surface and sheet for dark mode', () => {
    const { data } = themed(true);
    expect(data[6].colorscale).toEqual([
      [0, '#c74440'],
      [1, '#c74440'],
    ]);
    const contours = data[6].contours as {
      x: { color: string };
      y: { color: string };
    };
    expect(contours.x.color).toBe('#a03428');
    expect(contours.y.color).toBe('#a03428');
    expect(data[8].colorscale).toEqual([
      [0, '#d9d9d9'],
      [1, '#d9d9d9'],
    ]);
    expect(data[8].opacity).toBe(0.45);
  });

  it('keeps the Desmos palette in light mode', () => {
    const { data } = themed(false);
    expect((data[0].line as Record<string, unknown>).color).toBe(
      'rgba(0,0,0,0.16)',
    );
    expect((data[2].line as Record<string, unknown>).color).toBe(
      '#9d9d9d',
    );
    const contours = data[6].contours as {
      x: { color: string };
      y: { color: string };
    };
    expect(contours.x.color).toBe('#7e1f1a');
    expect(data[8].opacity).toBe(0.5);
  });

  it('leaves unnamed data traces untouched', () => {
    const src = plot3d();
    const { data } = themedFigure(src, true);
    expect(data[7]).toBe(src.figure.data[7]);
  });
});

describe('applyModeAxes', () => {
  it('hides the stray cartesian axes while a 3-D mode is active', () => {
    const fig = themed();
    fig.layout.xaxis = { gridcolor: 'x' };
    fig.layout.yaxis = { gridcolor: 'y' };
    applyModeAxes(fig);
    expect(
      (fig.layout.xaxis as Record<string, unknown>).visible,
    ).toBe(false);
    expect(
      (fig.layout.yaxis as Record<string, unknown>).visible,
    ).toBe(false);
  });

  it('shows the cartesian axes when a 2-D trace is active', () => {
    const fig = themed();
    fig.layout.xaxis = { gridcolor: 'x' };
    fig.layout.yaxis = { gridcolor: 'y' };
    // Simulate the heatmap-mode state.
    fig.data[7].visible = true;
    applyModeAxes(fig);
    expect(
      (fig.layout.xaxis as Record<string, unknown>).visible,
    ).toBe(true);
  });

  it('extends each mode-menu button with the axis-visibility relayout', () => {
    const fig = themed();
    fig.layout.xaxis = { gridcolor: 'x' };
    fig.layout.yaxis = { gridcolor: 'y' };
    fig.layout.updatemenus = [
      {
        buttons: [
          // 3-D mode: heatmap (index 7) off, everything else on.
          {
            args: [
              {
                visible: [
                  true, true, true, true, true, true, true, false, true,
                ],
              },
            ],
          },
          // 2-D mode: only the heatmap.
          {
            args: [
              {
                visible: [
                  false, false, false, false, false, false, false, true,
                  false,
                ],
              },
            ],
          },
        ],
      },
    ];
    applyModeAxes(fig);
    const buttons = (
      fig.layout.updatemenus as {
        buttons: { args: Record<string, unknown>[] }[];
      }[]
    )[0].buttons;
    expect(buttons[0].args[1]).toEqual({
      'xaxis.visible': false,
      'yaxis.visible': false,
    });
    expect(buttons[1].args[1]).toEqual({
      'xaxis.visible': true,
      'yaxis.visible': true,
    });
  });

  it('does nothing when no cartesian trace exists', () => {
    const fig = themed();
    fig.data = fig.data.filter((tr) => tr.type !== 'heatmap');
    fig.layout.updatemenus = [
      { buttons: [{ args: [{ visible: [true] }] }] },
    ];
    applyModeAxes(fig);
    expect(
      (fig.layout.xaxis as Record<string, unknown>).visible,
    ).toBeUndefined();
    const buttons = (
      fig.layout.updatemenus as {
        buttons: { args: Record<string, unknown>[] }[];
      }[]
    )[0].buttons;
    expect(buttons[0].args).toHaveLength(1);
  });
});
