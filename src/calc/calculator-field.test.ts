import { describe, expect, it } from 'vitest';
import { interimEvaluate, type CalcRow } from './calculator.svelte.ts';

// ℝ²→ℝ² `\text{plot}` interim coverage: the 'field' quiver trace that
// ECharts draws while SymPy boots — same trace shape the worker's
// _mc_field_view emits (x/y/u/v arrays, anchor 'center') so the
// handoff swaps the figure wholesale without a trace-shape
// translation.
const plotRow = (rows: CalcRow[]) =>
  rows[0]?.ok === true && rows[0].plot !== undefined ? rows[0].plot : undefined;

interface QuiverTrace {
  type: string;
  name: string;
  anchor: string;
  x: number[];
  y: number[];
  u: number[];
  v: number[];
}

const fieldTrace = (rows: CalcRow[]): QuiverTrace | undefined => {
  const plot = plotRow(rows);
  return plot?.figure.data.find(
    (t) => (t as { name?: string }).name === 'field',
  ) as QuiverTrace | undefined;
};

describe('ℝ²→ℝ² plot interim (quiver field view)', () => {
  it('samples a column-vector field into a 2x2 quiver trace', async () => {
    const rows = await interimEvaluate(
      '\\text{plot} \\begin{pmatrix} -y \\\\ x \\end{pmatrix}',
    );
    const plot = plotRow(rows);
    expect(plot?.kind).toBe('2x2');
    expect(plot?.vars).toEqual(['x', 'y']);
    const tr = fieldTrace(rows);
    expect(tr?.type).toBe('quiver');
    expect(tr?.anchor).toBe('center');
    // 21×21 grid, every point finite — 441 arrows.
    expect(tr!.x.length).toBe(441);
    for (const a of [tr!.x, tr!.y, tr!.u, tr!.v]) {
      expect(a.length).toBe(441);
      expect(a.every(Number.isFinite)).toBe(true);
    }
  });

  it('carries the vector values in u/v at each grid point', async () => {
    const tr = fieldTrace(
      await interimEvaluate(
        '\\text{plot} \\begin{pmatrix} -y \\\\ x \\end{pmatrix}',
      ),
    )!;
    // Grid points sit on the 21×21 uniform grid over [-3,3]²; the
    // rotation map's u is the negated y, v is x.
    for (let i = 0; i < tr.x.length; i++) {
      expect(tr.u[i]).toBeCloseTo(-tr.y[i], 9);
      expect(tr.v[i]).toBeCloseTo(tr.x[i], 9);
    }
  });

  it('draws a field with a constant component uniformly in that axis', async () => {
    // F(x,y)=(x+y, 1) — the second component never varies.
    const tr = fieldTrace(
      await interimEvaluate(
        '\\text{plot} \\begin{pmatrix} x+y \\\\ 1 \\end{pmatrix}',
      ),
    );
    expect(tr).toBeDefined();
    expect(tr!.v.every((dv) => dv === 1)).toBe(true);
  });

  it('drops grid points where the field is not finite', async () => {
    // 1/x is non-finite on the x=0 grid column — those 21 points drop
    // out instead of carrying NaN vectors the renderer can't take.
    const tr = fieldTrace(
      await interimEvaluate(
        '\\text{plot} \\begin{pmatrix} 1/x \\\\ y \\end{pmatrix}',
      ),
    );
    expect(tr).toBeDefined();
    expect(tr!.x.length).toBe(441 - 21);
    expect(tr!.x.every((px) => px !== 0)).toBe(true);
  });

  it('stays empty when the field cannot be honestly sampled', async () => {
    // 1/0 is never finite — every magnitude is a gap, so the row keeps
    // the all-gaps convention instead of drawing a wrong field.
    const rows = await interimEvaluate(
      '\\text{plot} \\begin{pmatrix} \\frac{1}{0} \\\\ x \\end{pmatrix}',
    );
    expect(fieldTrace(rows)).toBeUndefined();
  });
});
