// `\text{plot}` of an ℝ²→ℝ² expression emits two python-target
// programs: the field view's real lines, then the image-of-grid view
// riding underneath as a commented standalone numpy+matplotlib
// program — there is no SymPy call for it, so the comment block is
// the documentation of what the calculator's 'image' mode shows.

import { describe, expect, it } from 'vitest';
import { parseCellLatex } from './ir';
import { compileWorksheet } from './codegen';

const lines = (latex: string): string[] =>
  compileWorksheet([{ json: parseCellLatex(latex) }], 'python', {
    importAll: false,
  }).cellLines[0];

describe('plot ℝ²→ℝ² image-of-grid python codegen', () => {
  const ROT = '\\text{plot} \\begin{pmatrix} -y \\\\ x \\end{pmatrix}';

  it('emits the image program as comments under the field lines', () => {
    const L = lines(ROT);
    const start = L.findIndex((l) => l.startsWith('# image-of-grid'));
    expect(start).toBeGreaterThanOrEqual(0);
    // Every line from the caption down is a comment — the whole view
    // is documentation, never executed code.
    for (const l of L.slice(start)) {
      expect(l.startsWith('#')).toBe(true);
    }
  });

  it('the commented program lambdifies the map and loops the grid', () => {
    const L = lines(ROT);
    expect(L).toContain("# fnum = sp.lambdify((x, y), (-y, x), 'numpy')");
    expect(L).toContain('# ts = np.linspace(-3, 3, 160)');
    expect(L).toContain('# ks = np.arange(-3, 3.5, 0.5)');
    expect(L).toContain('# for k in ks:');
    expect(
      L.some((l) => l.startsWith('#     ax.plot(*fnum(')),
    ).toBe(true);
    // The input's horizontal grid lines are drawn in the source color.
    expect(
      L.some((l) => l.includes("ax.plot([-3, 3], [k, k]")),
    ).toBe(true);
    // The legend names match the app's image-mode legend entries.
    expect(L.some((l) => l.includes("'image of y = k'"))).toBe(true);
    expect(L.some((l) => l.includes("'input y = k'"))).toBe(true);
    expect(L).toContain("# ax.set_aspect('equal')");
  });

  it('keeps the map components and variables in the lambdify call', () => {
    const L = lines(
      '\\text{plot} \\begin{pmatrix} x^{2} - y^{2} \\\\ 2 x y \\end{pmatrix}',
    );
    expect(
      L.some(
        (l) =>
          l.startsWith('# fnum = ') &&
          l.includes('x**2 - y**2') &&
          l.includes('2 * x * y'),
      ),
    ).toBe(true);
  });
});
