import { describe, expect, it } from 'vitest';
import { interimEvaluate, type CalcRow } from './calculator.svelte.ts';

// ℝ²→ℝ² `\text{plot}` interim coverage: the quiver 'field' trace that
// ECharts draws while SymPy boots — same scatter/lines + NaN-gap shape
// the worker's _mc_field_view emits so the handoff swaps the figure
// wholesale without a trace-shape translation.
const plotRow = (rows: CalcRow[]) =>
  rows[0]?.ok === true && rows[0].plot !== undefined ? rows[0].plot : undefined;

interface FieldTrace {
  type: string;
  mode: string;
  name: string;
  x: number[];
  y: number[];
}

const fieldTrace = (rows: CalcRow[]): FieldTrace | undefined => {
  const plot = plotRow(rows);
  return plot?.figure.data.find(
    (t) => (t as { name?: string }).name === 'field',
  ) as FieldTrace | undefined;
};

describe('ℝ²→ℝ² plot interim (quiver field view)', () => {
  it('samples a column-vector field into a 2x2 field trace', async () => {
    const rows = await interimEvaluate(
      '\\text{plot} \\begin{pmatrix} -y \\\\ x \\end{pmatrix}',
    );
    const plot = plotRow(rows);
    expect(plot?.kind).toBe('2x2');
    expect(plot?.vars).toEqual(['x', 'y']);
    const tr = fieldTrace(rows);
    expect(tr?.type).toBe('scatter');
    expect(tr?.mode).toBe('lines');
    expect(tr?.x.length).toBe(tr?.y.length);
    expect(tr!.x.length).toBeGreaterThan(0);
  });

  it('packs each arrow as three NaN-separated segments', async () => {
    const tr = fieldTrace(
      await interimEvaluate(
        '\\text{plot} \\begin{pmatrix} -y \\\\ x \\end{pmatrix}',
      ),
    )!;
    // Every arrow is shaft + two head barbs: 9 slots, NaN at 2/5/8.
    expect(tr.x.length % 9).toBe(0);
    for (let i = 0; i < tr.x.length; i++) {
      const slot = i % 9;
      if (slot === 2 || slot === 5 || slot === 8) {
        expect(Number.isNaN(tr.x[i])).toBe(true);
        expect(Number.isNaN(tr.y[i])).toBe(true);
      } else {
        expect(Number.isFinite(tr.x[i])).toBe(true);
        expect(Number.isFinite(tr.y[i])).toBe(true);
      }
    }
    // Shaft and barbs share the tip: slot 1, 3 and 6 are the same point.
    for (let i = 0; i < tr.x.length; i += 9) {
      expect(tr.x[i + 1]).toBe(tr.x[i + 3]);
      expect(tr.y[i + 1]).toBe(tr.y[i + 3]);
      expect(tr.x[i + 1]).toBe(tr.x[i + 6]);
      expect(tr.y[i + 1]).toBe(tr.y[i + 6]);
      // A barb is a real short segment, not a zero-length stub.
      const barb = Math.hypot(tr.x[i + 4] - tr.x[i + 3], tr.y[i + 4] - tr.y[i + 3]);
      expect(barb).toBeGreaterThan(0);
      expect(barb).toBeLessThan(0.22 * 0.3 + 1e-9); // ≤ 0.22·pitch
    }
  });

  it('centers each arrow on its grid point and scales the longest to 0.8 of a cell', async () => {
    const tr = fieldTrace(
      await interimEvaluate(
        '\\text{plot} \\begin{pmatrix} -y \\\\ x \\end{pmatrix}',
      ),
    )!;
    let longest = 0;
    for (let i = 0; i < tr.x.length; i += 9) {
      const cx = (tr.x[i] + tr.x[i + 1]) / 2;
      const cy = (tr.y[i] + tr.y[i + 1]) / 2;
      // Grid points sit on the 21×21 uniform grid over [-3,3]².
      expect(Math.abs(cx / 0.3 - Math.round(cx / 0.3))).toBeLessThan(1e-9);
      expect(Math.abs(cy / 0.3 - Math.round(cy / 0.3))).toBeLessThan(1e-9);
      longest = Math.max(
        longest,
        Math.hypot(tr.x[i + 1] - tr.x[i], tr.y[i + 1] - tr.y[i]),
      );
    }
    // F(x,y)=(-y,x) at the corner (±3,±3) is the longest: 0.8·pitch.
    expect(longest).toBeCloseTo(0.8 * 0.3, 9);
  });

  it('draws a field with a constant component uniformly in that axis', async () => {
    // F(x,y)=(x+y, 1) — the second component never varies, so every
    // arrow tilts +y by the same fixed amount.
    const tr = fieldTrace(
      await interimEvaluate(
        '\\text{plot} \\begin{pmatrix} x+y \\\\ 1 \\end{pmatrix}',
      ),
    );
    expect(tr).toBeDefined();
    expect(tr!.x.length % 9).toBe(0);
    const dys = new Set<number>();
    for (let i = 0; i < tr!.x.length; i += 9) {
      dys.add(Number((tr!.y[i + 1] - tr!.y[i]).toFixed(9)));
    }
    expect(dys.size).toBe(1);
    expect([...dys][0]).toBeGreaterThan(0);
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
