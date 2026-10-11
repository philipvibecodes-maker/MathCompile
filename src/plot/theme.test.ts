import { describe, expect, it } from 'vitest';
import { applySceneOptions, themedFigure } from './theme';
import type { PlotData } from './types';

// A minimal 3-D figure dict as the worker emits it: one data trace plus
// the two mcRole-tagged xy-plane reference traces.
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
          opacity: 0.18,
          colorscale: [
            [0, '#64748b'],
            [1, '#64748b'],
          ],
          meta: { mcRole: 'xyplane' },
        },
        {
          type: 'scatter3d',
          mode: 'lines',
          x: [0, 0, null],
          y: [0, 1, null],
          z: [0, 0, null],
          line: { color: 'rgba(148,163,184,0.55)' },
          meta: { mcRole: 'xyplane' },
        },
      ],
      layout: {},
    },
  };
}

describe('themedFigure xy-plane traces', () => {
  it('restyles the plane slab and gridlines for the theme', () => {
    const { data } = themedFigure(plot3d(), true);
    const plane = data[1];
    const grid = data[2];
    expect(plane.colorscale).toEqual([
      [0, '#94a3b8'],
      [1, '#94a3b8'],
    ]);
    expect((grid.line as Record<string, unknown>).color).toBe(
      'rgba(148,163,184,0.55)',
    );
    // The data trace is left alone.
    expect(data[0]).toEqual(plot3d().figure.data[0]);
  });
});

describe('applySceneOptions', () => {
  const themed = (dark = false) => themedFigure(plot3d(), dark);

  it('planeOrigin toggles only the tagged plane traces', () => {
    const fig = themed();
    applySceneOptions(fig, { planeOrigin: false, planeOnly: false });
    expect(fig.data[0].visible).toBeUndefined();
    expect(fig.data[1].visible).toBe(false);
    expect(fig.data[2].visible).toBe(false);
    applySceneOptions(fig, { planeOrigin: true, planeOnly: false });
    expect(fig.data[1].visible).toBe(true);
  });

  it('planeOnly hides every scene axis', () => {
    const fig = themed();
    applySceneOptions(fig, { planeOrigin: true, planeOnly: true });
    const scene = fig.layout.scene as Record<string, Record<string, unknown>>;
    for (const ax of ['xaxis', 'yaxis', 'zaxis']) {
      expect(scene[ax].visible).toBe(false);
    }
  });

  it('planeOnly=false leaves scene axes as themed', () => {
    const fig = themed();
    applySceneOptions(fig, { planeOrigin: true, planeOnly: false });
    const scene = fig.layout.scene as Record<string, Record<string, unknown>>;
    expect(scene.xaxis.visible).toBeUndefined();
    expect(scene.xaxis.gridcolor).toBeDefined();
  });
});
