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
import { plotFigure } from '../plot/figures';
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

describe('plot figures', () => {
  const base: PlotData = {
    kind: '1x1',
    vars: ['x'],
    label: 'x^{2}',
    data: { x: [0, 1], y: [0, 1] },
  };

  it('1x1 is a single 2D line', () => {
    const { traces, layout } = plotFigure(base);
    expect(traces).toHaveLength(1);
    expect(traces[0].type).toBe('scatter');
    expect(layout.showlegend).toBe(false);
  });

  it('1x3 is a single 3D line', () => {
    const { traces } = plotFigure({
      ...base,
      kind: '1x3',
      data: { x: [0], y: [0], z: [0] },
    });
    expect(traces[0].type).toBe('scatter3d');
  });

  it('2x2 offers several modes through one updatemenu', () => {
    const { traces, layout } = plotFigure({
      kind: '2x2',
      vars: ['u', 'v'],
      label: 'f',
      data: {
        u: [0, 1, 2, 3],
        v: [0, 1, 2, 3],
        fx: [
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
        fy: [
          [0, 1, 2, 3],
          [0, 1, 2, 3],
          [0, 1, 2, 3],
          [0, 1, 2, 3],
        ],
      },
    });
    const menu = (
      layout.updatemenus as { buttons: { label: string }[] }[]
    )[0];
    const labels = menu.buttons.map((b) => b.label);
    expect(labels).toEqual([
      'quiver',
      'magnitude heatmap',
      'streamlines',
      'image of grid',
    ]);
    expect(traces.length).toBeGreaterThan(3);
  });

  it('2x3 offers surface/grid/point-cloud modes', () => {
    const g = [
      [0, 1],
      [0, 1],
    ];
    const { layout } = plotFigure({
      kind: '2x3',
      vars: ['u', 'v'],
      label: 'f',
      data: { u: [0, 1], v: [0, 1], fx: g, fy: g, fz: g },
    });
    const menu = (
      layout.updatemenus as { buttons: { label: string }[] }[]
    )[0];
    expect(menu.buttons.map((b) => b.label)).toEqual([
      'surface, colored by |f|',
      'surface, colored by u',
      'grid curves',
      'point cloud',
    ]);
  });
});
