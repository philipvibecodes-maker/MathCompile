import { describe, expect, it } from 'vitest';
import { parseCellLatex } from './ir';
import { compileCellsForCalc, compileWorksheet } from './codegen';

const code = (latex: string) => compileCellsForCalc([{ json: parseCellLatex(latex) }])
  .cells[0].statements[0].code;

describe('set plots', () => {
  it('treats pairs inside a plotted finite set as points', () => {
    expect(code(String.raw`\text{plot} \{(1,2),(3,4)\}`))
      .toBe('_mc_plot(FiniteSet((1, 2), (3, 4)))');
  });
  it('handles editor-sized braces in either pair mode', () => {
    for (const pairTuple of ['interval', 'matrix'] as const) {
      const out = compileCellsForCalc([{ json: parseCellLatex(String.raw`\text{plot} \left\{\left(x,y\right):x^2+y^2<1\right\}`) }], { pairTuple });
      expect(out.cells[0].statements[0].code).toBe('_mc_plot(ConditionSet((x, y), Lt(x**2 + y**2, 1)))');
    }
  });
  it('supports triples and vector points', () => {
    expect(code(String.raw`\text{plot} \{(1,2,3),(4,5,6)\}`))
      .toBe('_mc_plot(FiniteSet((1, 2, 3), (4, 5, 6)))');
  });
  it('emits coordinate condition sets and bounds', () => {
    expect(code(String.raw`\text{plot} \{(x,y) : x^2+y^2 < 1\} \text{ for } -2 < x < 2`))
      .toBe('_mc_plot(ConditionSet((x, y), Lt(x**2 + y**2, 1)), {"x": (-2, 2)})');
    expect(code(String.raw`\text{plot} \{(x,y,z) : x^2+y^2+z^2 = 1\}`))
      .toBe('_mc_plot(ConditionSet((x, y, z), Eq(x**2 + y**2 + z**2, 1)))');
  });
  it('accepts implicit equations and inequalities', () => {
    expect(code(String.raw`\text{plot} x^2+y^2 = 1`))
      .toBe('_mc_plot(Eq(x**2 + y**2, 1))');
    expect(code(String.raw`\text{plot} x^2+y^2+z^2 < 1`))
      .toBe('_mc_plot(Lt(x**2 + y**2 + z**2, 1))');
    const out = compileWorksheet([{ json: parseCellLatex(String.raw`\text{plot} x^2+y^2=1`) }], 'python', { importAll: false });
    expect(out.cellLines[0]).toContain('fig, _ = _mc_set_figure(sp.ConditionSet((x, y), sp.Eq(x**2 + y**2, 1)), {})');
  });
  it('exports executable set plotting code', () => {
    const out = compileWorksheet([{ json: parseCellLatex(String.raw`\text{plot} \{(1,2),(3,4)\}`) }], 'python', { importAll: false });
    expect(out.cellLines[0]).toContain('fig, _ = _mc_set_figure(sp.FiniteSet((1, 2), (3, 4)), {})');
    expect(out.cellLines[0]).toContain('fig.show()');
    expect(out.issues.filter(i => i.severity === 'error')).toEqual([]);
  });
});
