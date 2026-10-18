// `\text{plot}` statement coverage: the IR marker fold, the calc
// target's `_mc_plot` emission (unwrapped by clean_and_simplify), the
// python target's `sp.plot*` lowering, and the figure builders'
// trace/mode structure.

import { describe, expect, it } from 'vitest';
import { parseCellLatex, normalizeIR } from './ir';
import {
  compileWorksheet,
  compileCellsForCalc,
  compileCellForCalc,
} from './codegen';
import { themedFigure } from '../plot/theme';
import type { PlotData } from '../plot/types';
import type { MathJson } from './ir';

const node = (ir: MathJson | undefined): MathJson[] => {
  if (!Array.isArray(ir)) throw new Error('expected an IR node');
  return ir;
};

const calcCode = (latex: string): string =>
  compileCellsForCalc([{ json: parseCellLatex(latex) }])
    .cells[0].statements.map((s) => s.code)
    .join('\n');

const pyLines = (latex: string): string[] =>
  compileWorksheet([{ json: parseCellLatex(latex) }], 'python', {
    importAll: false,
  }).cellLines[0];

describe('plot statement IR', () => {
  it('\\text{plot} x^2 folds to a Plot node at statement position', () => {
    const { ir } = normalizeIR(parseCellLatex('\\text{plot} x^2'));
    expect(ir).toEqual(['Plot', ['Power', 'x', 2]]);
  });

  it('the marker binds the whole statement, not the first factor', () => {
    const { ir } = normalizeIR(parseCellLatex('\\text{plot} x^2 + y^2'));
    const n = node(ir);
    expect(n[0]).toBe('Plot');
    expect(node(n[1])[0]).toBe('Add');
  });

  it('a multi-item tail is one plot expression, not separate items', () => {
    const { ir } = normalizeIR(
      parseCellLatex('\\text{plot} (\\cos t, \\sin t)'),
    );
    expect(node(ir)[0]).toBe('Plot');
  });

  it('mid-expression plot stays an ordinary marker product', () => {
    const { ir } = normalizeIR(parseCellLatex('y = \\text{plot} x^2'));
    expect(node(ir)[0]).toBe('Assign');
    expect(JSON.stringify(ir)).not.toContain('"Plot"');
  });

  it('\\text{plot} … \\text{for} keeps the condition as the domain', () => {
    const { ir } = normalizeIR(
      parseCellLatex('\\text{plot} x^2 \\text{ for } x \\in (0, 5)'),
    );
    const n = node(ir);
    expect(n[0]).toBe('Plot');
    expect(node(n[1])[0]).toBe('Power');
    // The for-condition rides on the Plot node — Element(x, Interval).
    expect(node(n[2])[0]).toBe('Element');
  });
});

describe('plot statement calc codegen', () => {
  it('emits _mc_plot without a clean_and_simplify wrap', () => {
    const code = calcCode('\\text{plot} x^2');
    expect(code).toContain('_mc_plot(x**2)');
    expect(code).not.toContain('clean_and_simplify(_mc_plot');
  });

  it('marks the statement plot so it is not display-captured', () => {
    const prog = compileCellForCalc({
      json: parseCellLatex('\\text{plot} x^2'),
    });
    expect(prog.statements[0].code).toBe('_mc_plot(x**2)');
  });

  it('\\text{plot} g(x) applies the declared g — it is not g·x', () => {
    const prog = compileCellsForCalc([
      { json: parseCellLatex('\\text{def} g(x) = x^2') },
      { json: parseCellLatex('\\text{plot} g(x)') },
    ]);
    expect(prog.cells[1].statements[0].code).toBe('_mc_plot(g(x))');
  });

  it('a \\text{for} domain emits a {var: (lo, hi)} dict argument', () => {
    expect(
      calcCode('\\text{plot} x^2 \\text{ for } x \\in (0, 5)'),
    ).toBe('_mc_plot(x**2, {"x": (0, 5)})');
    // Two-sided chains merge; one-sided bounds keep a None end.
    expect(
      calcCode('\\text{plot} x^2 \\text{ for } 0 \\le x \\le 5'),
    ).toBe('_mc_plot(x**2, {"x": (0, 5)})');
    expect(
      calcCode('\\text{plot} \\sqrt{x} \\text{ for } x > 0'),
    ).toBe('_mc_plot(sqrt(x), {"x": (0, None)})');
    // And-joined conditions cover several variables.
    expect(
      calcCode(
        '\\text{plot} \\begin{pmatrix} u \\\\ v \\\\ u+v \\end{pmatrix} ' +
          '\\text{ for } u \\in (0,1) \\land v \\in (0, 2\\pi)',
      ),
    ).toBe(
      '_mc_plot(Matrix([[u], [v], [u + v]]), ' +
        '{"u": (0, 1), "v": (0, 2 * pi)})',
    );
  });

  it('an unreadable \\text{for} condition flags a note, defaults stand', () => {
    expect(
      calcCode('\\text{plot} x^2 \\text{ for } x \\in \\{1,2,3\\}'),
    ).toBe('_mc_plot(x**2)');
    const out = compileWorksheet(
      [
        {
          json: parseCellLatex(
            '\\text{plot} x^2 \\text{ for } x \\in \\{1,2,3\\}',
          ),
        },
      ],
      'python',
      { importAll: false },
    );
    expect(
      out.issues.some((i) => i.message.includes('no usable')),
    ).toBe(true);
  });
});

describe('plot statement python codegen', () => {
  it('R→R lowers to sp.plot', () => {
    expect(pyLines('\\text{plot} x^2')).toContain(
      'sp.plot(x**2, (x, -10, 10))',
    );
  });

  it('R²→R lowers to sp.plot3d', () => {
    expect(pyLines('\\text{plot} x^2 + y^2')).toContain(
      'sp.plot3d(x**2 + y**2, (x, -3, 3), (y, -3, 3))',
    );
  });

  it('a 2-vector lowers to sp.plot_parametric', () => {
    const lines = pyLines(
      '\\text{plot} \\begin{pmatrix} \\cos t \\\\ \\sin t \\end{pmatrix}',
    );
    expect(lines.some((l) => l.startsWith('sp.plot_parametric('))).toBe(
      true,
    );
  });

  it('a 3-vector lowers to sp.plot3d_parametric_line', () => {
    const lines = pyLines(
      '\\text{plot} \\begin{pmatrix} \\cos t \\\\ \\sin t \\\\ t \\end{pmatrix}',
    );
    expect(
      lines.some((l) => l.startsWith('sp.plot3d_parametric_line(')),
    ).toBe(true);
  });

  it('R²→R³ lowers to sp.plot3d_parametric_surface on the 3-D window', () => {
    const lines = pyLines(
      '\\text{plot} \\begin{pmatrix} u \\cos v \\\\ u \\sin v \\\\ v \\end{pmatrix}',
    );
    expect(lines).toContain(
      'sp.plot3d_parametric_surface(u * sp.cos(v), u * sp.sin(v), v, (u, -3, 3), (v, -3, 3))',
    );
  });

  it('a \\text{for} domain overrides the default ranges', () => {
    expect(
      pyLines('\\text{plot} x^2 \\text{ for } x \\in (0, 5)'),
    ).toContain('sp.plot(x**2, (x, 0, 5))');
    // A one-sided bound keeps the signature's default other end.
    expect(
      pyLines('\\text{plot} \\sqrt{x} \\text{ for } x > 0'),
    ).toContain('sp.plot(sp.sqrt(x), (x, 0, 10))');
    expect(
      pyLines(
        '\\text{plot} \\begin{pmatrix} u \\cos v \\\\ u \\sin v \\\\ v \\end{pmatrix}' +
          ' \\text{ for } u \\in (0,1) \\land v \\in (0, 2\\pi)',
      ),
    ).toContain(
      'sp.plot3d_parametric_surface(u * sp.cos(v), u * sp.sin(v), v, (u, 0, 1), (v, 0, 2 * sp.pi))',
    );
  });

  it('a (u,v) ∈ I₁×I₂ product domain bounds each variable', () => {
    expect(
      pyLines(
        '\\text{plot} \\begin{pmatrix} u \\\\ v \\\\ 1 \\end{pmatrix}' +
          ' \\text{ for } \\left(u,v\\right) \\in \\left[0,1\\right]' +
          ' \\times \\left[0,2\\pi\\right]',
      ),
    ).toContain(
      'sp.plot3d_parametric_surface(u, v, 1, (u, 0, 1), (v, 0, 2 * sp.pi))',
    );
  });

  it('a bound on a non-variable flags a note', () => {
    const out = compileWorksheet(
      [
        {
          json: parseCellLatex(
            '\\text{plot} x^2 \\text{ for } y \\in (0, 5)',
          ),
        },
      ],
      'python',
      { importAll: false },
    );
    expect(out.cellLines[0]).toContain('sp.plot(x**2, (x, -10, 10))');
    expect(
      out.issues.some(
        (i) => i.message.includes("'y' isn't a variable"),
      ),
    ).toBe(true);
  });

  it('R²→R² comments out with a note — SymPy has no vector-field call', () => {
    const out = compileWorksheet(
      [
        {
          json: parseCellLatex(
            '\\text{plot} \\begin{pmatrix} -y \\\\ x \\end{pmatrix}',
          ),
        },
      ],
      'python',
      { importAll: false },
    );
    expect(out.cellLines[0].some((l) => l.startsWith('# plot('))).toBe(
      true,
    );
    expect(
      out.issues.some((i) => i.message.includes('vector field')),
    ).toBe(true);
  });
});

describe('plot theming', () => {
  // The worker emits the plotly python figure dict; themedFigure only
  // touches presentation, never the trace data.
  const base: PlotData = {
    kind: '1x1',
    vars: ['x'],
    label: 'x^{2}',
    figure: {
      data: [{ type: 'scatter', x: [0, 1], y: [0, 1] }],
      layout: { margin: { l: 40 }, updatemenus: [{ buttons: [] }] },
    },
  };

  it('passes the worker figure data through unchanged', () => {
    const { data } = themedFigure(base, true);
    // Traces are deep-copied — equal content but never the same
    // objects: plotly writes back into what it's handed (menu
    // `active`, trace bookkeeping), and the payload lives in the
    // reactive row store, where a mutation re-fires the render.
    expect(data).toEqual(base.figure.data);
    for (let i = 0; i < data.length; i++) {
      expect(data[i]).not.toBe(base.figure.data[i]);
    }
  });

  it('dark mode applies dark font/grid/zeroline and transparent bg', () => {
    const { layout } = themedFigure(base, true);
    expect(layout.paper_bgcolor).toBe('rgba(0,0,0,0)');
    expect((layout.font as { color: string }).color).toBe('#e6e8ee');
    // Menus follow the theme — plotly's active-item fill is a
    // hardcoded light color, handled by PlotView's dark-mode CSS.
    expect(layout.updatemenus).toEqual([
      {
        buttons: [],
        bgcolor: '#23262d',
        bordercolor: '#3b4048',
        font: { color: '#e6e8ee' },
      },
    ]);
    expect(layout.updatemenus).not.toBe(base.figure.layout.updatemenus);
  });

  it('light mode applies light font and keeps figure layout keys', () => {
    const { layout } = themedFigure(base, false);
    expect((layout.font as { color: string }).color).toBe('#333333');
    expect(layout.margin).toEqual({ l: 40 });
  });

  it('colors 2D axes the figure defined', () => {
    const withAxes: PlotData = {
      ...base,
      figure: {
        ...base.figure,
        layout: { xaxis: { zeroline: true }, yaxis: {} },
      },
    };
    const { layout } = themedFigure(withAxes, true);
    const x = layout.xaxis as Record<string, unknown>;
    expect(x.zeroline).toBe(true);
    expect(x.zerolinecolor).toBe('#9aa2ae');
  });

  it('makes scene and axis panels transparent', () => {
    // The opaque panels a 3D scene paints are scene.bgcolor plus each
    // axis's backgroundcolor — fig.to_json() emits them explicitly, so
    // the theme's transparent must override the figure's white.
    const withScene: PlotData = {
      ...base,
      figure: {
        ...base.figure,
        layout: {
          scene: {
            bgcolor: 'rgb(255,255,255)',
            xaxis: {},
            yaxis: {},
            zaxis: { title: 'z', backgroundcolor: 'rgb(230,236,245)' },
          },
        },
      },
    };
    const { layout } = themedFigure(withScene, true);
    const scene = layout.scene as Record<string, unknown>;
    expect(scene.bgcolor).toBe('rgba(0,0,0,0)');
    const z = scene.zaxis as Record<string, unknown>;
    expect(z.backgroundcolor).toBe('rgba(0,0,0,0)');
    expect(z.gridcolor).toBe('rgba(154,162,174,0.22)');
    expect(z.title).toBe('z');
    // An axis — or the whole scene — fig.to_json() never serialized is
    // absent; the override still has to land, or plotly paints its
    // default opaque pane.
    const bare: PlotData = {
      ...base,
      figure: { ...base.figure, layout: { scene: {} } },
    };
    const bareScene = themedFigure(bare, true).layout.scene as Record<
      string,
      unknown
    >;
    expect(
      (bareScene.xaxis as Record<string, unknown>).backgroundcolor,
    ).toBe('rgba(0,0,0,0)');
    const noScene: PlotData = {
      ...base,
      figure: {
        data: [{ type: 'scatter3d', x: [0], y: [0], z: [0] }],
        layout: {},
      },
    };
    const createdScene = themedFigure(noScene, true).layout
      .scene as Record<string, unknown>;
    expect(createdScene.bgcolor).toBe('rgba(0,0,0,0)');
    expect(
      (createdScene.xaxis as Record<string, unknown>).backgroundcolor,
    ).toBe('rgba(0,0,0,0)');
  });

  it('drags turntable a scene, pan cartesian plots', () => {
    // layout.dragmode 'pan' inherits into a scene whose own dragmode
    // is unset — the theme pins 'turntable' so 3-D drags rotate.
    const withScene: PlotData = {
      ...base,
      figure: { ...base.figure, layout: { scene: {} } },
    };
    const { layout } = themedFigure(withScene, true);
    expect((layout.scene as Record<string, unknown>).dragmode).toBe(
      'turntable',
    );
    expect(layout.dragmode).toBe('pan');
    const noScene: PlotData = {
      ...base,
      figure: { ...base.figure, layout: {} },
    };
    const created = themedFigure(noScene, true).layout;
    // No scene in the figure → none is created just for dragmode; the
    // scatter's own dragmode is the layout's.
    expect(created.scene).toBeUndefined();
    expect(created.dragmode).toBe('pan');
  });
});
