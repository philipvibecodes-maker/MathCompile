import { describe, expect, it } from 'vitest';
import { applySceneOptions, themedFigure } from './theme';
import type { PlotData } from './types';

// A minimal 3-D figure dict as the worker emits it: one data trace
// plus the meta-tagged xy-plane and z-axis reference traces.
function plot3d(): PlotData {
  return {
    kind: '1x3',
    vars: ['t'],
    label: 'f',
    figure: {
      data: [
        { type: 'scatter3d', x: [0], y: [0], z: [0] },
        {
          type: 'surface',
          x: [[0, 1], [0, 1]],
          y: [[0, 0], [1, 1]],
          z: [[0, 0], [0, 0]],
          opacity: 0.25,
          colorscale: [
            [0, '#64748b'],
            [1, '#64748b'],
          ],
          contours: {
            x: {
              show: true,
              color: 'rgba(148,163,184,0.55)',
              width: 1,
              start: 0,
              end: 1,
              size: 1,
            },
            y: {
              show: true,
              color: 'rgba(148,163,184,0.55)',
              width: 1,
              start: 0,
              end: 1,
              size: 1,
            },
          },
          meta: { mcRole: 'xyplane' },
        },
        {
          type: 'scatter3d',
          mode: 'lines',
          x: [0, 0, null],
          y: [0, 0, null],
          z: [0, 10, null],
          line: { color: 'rgba(148,163,184,0.8)', width: 2 },
          meta: { mcRole: 'zaxis' },
        },
        {
          type: 'scatter3d',
          mode: 'text',
          x: [0],
          y: [0],
          z: [10],
          text: ['z'],
          textfont: { color: 'rgba(148,163,184,0.8)' },
          meta: { mcRole: 'zaxis' },
        },
      ],
      layout: {},
    },
  };
}

const themed = (dark = true) => themedFigure(plot3d(), dark);

describe('themedFigure tagged reference traces', () => {
  it('restyles the plane slab and grid contours for the theme', () => {
    const { data } = themed(true);
    expect(data[1].colorscale).toEqual([
      [0, '#94a3b8'],
      [1, '#94a3b8'],
    ]);
    expect(data[1].opacity).toBe(0.25);
    const contours = data[1].contours as {
      x: { color: string };
      y: { color: string };
    };
    expect(contours.x.color).toBe('rgba(148,163,184,0.55)');
    expect(contours.y.color).toBe('rgba(148,163,184,0.55)');
  });

  it('uses the light palette in light mode', () => {
    const { data } = themed(false);
    expect(data[1].colorscale).toEqual([
      [0, '#64748b'],
      [1, '#64748b'],
    ]);
    expect(data[1].opacity).toBe(0.32);
    const contours = data[1].contours as {
      x: { color: string };
      y: { color: string };
    };
    expect(contours.x.color).toBe('rgba(51,65,85,0.55)');
    expect(contours.y.color).toBe('rgba(51,65,85,0.55)');
    expect((data[2].line as Record<string, unknown>).color).toBe(
      '#4b5563',
    );
    expect(
      (data[3].textfont as Record<string, unknown>).color,
    ).toBe('#4b5563');
  });

  it('leaves untagged data traces untouched', () => {
    const src = plot3d();
    const { data } = themedFigure(src, true);
    expect(data[0]).toBe(src.figure.data[0]);
  });
});

describe('applySceneOptions', () => {
  it('planeOrigin toggles only the xyplane traces', () => {
    const fig = themed();
    applySceneOptions(fig, { planeOrigin: false, planeOnly: false });
    expect(fig.data[0].visible).toBeUndefined();
    expect(fig.data[1].visible).toBe(false);
    // zaxis is tied to planeOnly, not planeOrigin.
    expect(fig.data[2].visible).toBe(false);
    expect(fig.data[3].visible).toBe(false);
    applySceneOptions(fig, { planeOrigin: true, planeOnly: true });
    expect(fig.data[1].visible).toBe(true);
    expect(fig.data[2].visible).toBe(true);
    expect(fig.data[3].visible).toBe(true);
  });

  it('zaxis shows only when planeOnly hides the axis boxes', () => {
    const fig = themed();
    applySceneOptions(fig, { planeOrigin: true, planeOnly: false });
    expect(fig.data[2].visible).toBe(false);
    applySceneOptions(fig, { planeOrigin: false, planeOnly: true });
    expect(fig.data[2].visible).toBe(true);
  });

  it('planeOnly hides every scene axis', () => {
    const fig = themed();
    applySceneOptions(fig, { planeOrigin: true, planeOnly: true });
    const scene = fig.layout.scene as Record<string, Record<string, unknown>>;
    for (const ax of ['xaxis', 'yaxis', 'zaxis']) {
      expect(scene[ax].visible).toBe(false);
    }
  });

  it('suppresses tagged traces while a 2-D mode is showing', () => {
    const fig = themed();
    // Simulate the heatmap-mode state: the gl3d data trace hidden.
    fig.data[0].visible = false;
    applySceneOptions(fig, { planeOrigin: true, planeOnly: true });
    for (const tr of fig.data.slice(1)) {
      expect(tr.visible).toBe(false);
    }
  });

  it('extends updatemenus visible args to the tagged traces', () => {
    const fig = themed();
    fig.layout.updatemenus = [
      {
        buttons: [
          { args: [{ visible: [true, false] }] }, // 3-D mode
          { args: [{ visible: [false, true] }] }, // 2-D mode
        ],
      },
    ];
    // A hidden untagged 2-D trace to stand in for the 2x1 figure's
    // heatmap — the second button activates it and no gl3d trace.
    fig.data.splice(1, 0, {
      type: 'heatmap',
      x: [0],
      y: [0],
      z: [0],
      visible: false,
    });
    applySceneOptions(fig, { planeOrigin: true, planeOnly: true });
    const buttons = (
      fig.layout.updatemenus as {
        buttons: { args: Record<string, unknown>[] }[];
      }[]
    )[0].buttons;
    // 3-D mode button: tagged traces get option-driven visibility.
    expect(buttons[0].args[0].visible).toEqual([
      true,
      false,
      true,
      true,
      true,
    ]);
    // 2-D mode button activates no gl3d trace, so it hides the
    // tagged traces outright — the slab can't float over the 2-D
    // view.
    expect(buttons[1].args[0].visible).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);
    // Each button also gets a relayout arg toggling the cartesian
    // axes for the mode it activates.
    expect(buttons[0].args[1]).toEqual({
      'xaxis.visible': false,
      'yaxis.visible': false,
    });
    expect(buttons[1].args[1]).toEqual({
      'xaxis.visible': true,
      'yaxis.visible': true,
    });
    // Initially the 3-D mode is active, so the stray cartesian axes
    // the hidden heatmap instantiates stay hidden.
    expect(
      (fig.layout.xaxis as Record<string, unknown>).visible,
    ).toBe(false);
    expect(
      (fig.layout.yaxis as Record<string, unknown>).visible,
    ).toBe(false);
  });
});
