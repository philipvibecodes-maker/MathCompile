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

  it('R²→R³ lowers to sp.plot3d_parametric_surface', () => {
    const lines = pyLines(
      '\\text{plot} \\begin{pmatrix} u \\cos v \\\\ u \\sin v \\\\ v \\end{pmatrix}',
    );
    expect(
      lines.some((l) => l.startsWith('sp.plot3d_parametric_surface(')),
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
    expect(data).toBe(base.figure.data);
  });

  it('dark mode applies dark font/grid/zeroline and transparent bg', () => {
    const { layout } = themedFigure(base, true);
    expect(layout.paper_bgcolor).toBe('rgba(0,0,0,0)');
    expect((layout.font as { color: string }).color).toBe('#e6e8ee');
    expect(layout.updatemenus).toBe(base.figure.layout.updatemenus);
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
    // An axis fig.to_json() never serialized is absent — the override
    // still has to land, or plotly paints its default opaque pane.
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
  });
});
