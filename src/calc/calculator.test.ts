import { describe, expect, it } from 'vitest';
import nerdamer from 'nerdamer/all';
import { compileCellForCalc } from '../compile/codegen';
import { parseCellLatex } from '../compile/ir';
import { toNerdamerInput } from './nerdamer-latex';
import { interimEvaluate } from './calculator.svelte.ts';

const toN = (s: string) => toNerdamerInput(s, nerdamer);
const calc = (latex: string) => compileCellForCalc({ json: parseCellLatex(latex) });

describe('compileCellForCalc (cell latex -> evaluable SymPy program)', () => {
  it('compiles an expression to a prelude + one eval statement', () => {
    const prog = calc('x+1');
    expect(prog.issues).toEqual([]);
    expect(prog.prelude).toEqual([
      'import sympy as sp',
      'x = sp.Symbol("x")',
    ]);
    expect(prog.statements).toEqual([{ code: 'x + 1', display: undefined }]);
  });

  it('emits per-statement rows for multi-line cells', () => {
    const prog = calc('1+1\\\\ 2+3');
    expect(prog.statements).toEqual([
      { code: '1 + 1', display: undefined },
      { code: '2 + 3', display: undefined },
    ]);
  });

  it('gives an assignment a display equation', () => {
    const prog = calc('a = 5');
    // Assignments bind a python name — no Symbol def is emitted.
    expect(prog.prelude).toEqual(['import sympy as sp']);
    expect(prog.statements).toEqual([
      { code: 'a = 5', display: 'sp.Eq(sp.Symbol("a"), 5)' },
    ]);
  });

  it('gives a function def a lambda display expression', () => {
    const prog = calc('f(x) = x^2');
    expect(prog.statements).toEqual([
      {
        code: 'def f(x):\n    return x**2',
        display:
          '(lambda x: sp.Eq(sp.Function("f")(x), x**2))(sp.Symbol("x"))',
      },
    ]);
  });

  it('lowers integrals/sums to sympy calls like the python target', () => {
    const prog = calc('\\int_{0}^{1}x\\,dx');
    expect(prog.statements[0].code).toBe('sp.integrate(x, (x, 0, 1))');
    expect(calc('\\sum_{i=0}^{n}\\binom{i}{n}').statements[0].code).toBe(
      'sp.summation(sp.binomial(i, n), (i, 0, n))',
    );
  });

  it('surfaces normalization errors instead of statements', () => {
    const prog = calc('x +');
    expect(prog.issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('returns no statements for empty input', () => {
    expect(calc('').statements).toEqual([]);
    expect(calc('').prelude).toEqual([]);
  });
});

describe('toNerdamerInput (latex → nerdamer calls)', () => {
  it('passes plain algebra through convertFromLaTeX', () => {
    expect(toN('x+1')).toBe('1+x');
  });

  it('maps a definite integral to defint', () => {
    expect(toN('\\int_{0}^{1}x')).toBe('defint(x, 0, 1, x)');
    expect(toN('\\int_{0}^{1}x dx')).toBe('defint(x, 0, 1, x)');
  });

  it('maps an indefinite integral to integrate', () => {
    expect(toN('\\int x')).toBe('integrate(x, x)');
  });

  it('maps \\sum_{i=lo}^{hi} to sum', () => {
    expect(toN('\\sum_{i=0}^{n}k')).toBe('sum(k, i, 0, n)');
  });

  it('maps \\prod_{i=lo}^{hi} to product', () => {
    expect(toN('\\prod_{i=1}^{n}k')).toBe('product(k, i, 1, n)');
  });

  it('maps \\lim_{x\\to a} to limit', () => {
    expect(toN('\\lim_{x\\to 0}y')).toBe('limit(y, x, 0)');
  });

  it('maps the MathQuill \\derivative form to diff', () => {
    expect(toN('\\frac{d }{d x}x^2')).toBe('diff(x^2, x)');
    expect(toN('\\frac{d^2}{d x^2}x^3')).toBe('diff(x^3, x, 2)');
  });

  it('expands \\binom into factorials', () => {
    expect(toN('\\binom{n}{k}')).toBe(
      'factorial(n)/(factorial(k)*factorial(n-k))',
    );
  });

  it('maps \\sqrt[n]{x} to nthroot', () => {
    expect(toN('\\sqrt[3]{8}')).toBe('nthroot(8, 3)');
  });

  it("keeps an equation's lhs before a translated command", () => {
    expect(toN('2^{n}=\\sum_{i=0}^{n}\\binom{i}{n}')).toBe(
      '2^n=sum(factorial(i)/(factorial(n)*factorial(i-n)), i, 0, n)',
    );
  });
});

describe('interimEvaluate (nerdamer fallback while SymPy boots)', () => {
  it('evaluates arithmetic to its latex form', async () => {
    expect(await interimEvaluate('2+2')).toEqual([{ ok: true, latex: '4' }]);
  });

  it('renders a symbolic expression as tex', async () => {
    const rows = await interimEvaluate('x+\\sqrt{2}');
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(true);
    expect((rows[0] as { latex?: string }).latex).toContain('\\sqrt{2}');
  });

  it('evaluates a definite integral via nerdamer defint', async () => {
    const rows = await interimEvaluate('\\int_{0}^{1}x');
    expect(rows[0].ok).toBe(true);
    expect((rows[0] as { latex?: string }).latex).toBe('\\frac{1}{2}');
  });

  it('evaluates a derivative via nerdamer diff', async () => {
    const rows = await interimEvaluate('\\frac{d }{d x}x^2');
    expect(rows[0].ok).toBe(true);
    expect((rows[0] as { latex?: string }).latex).toBe('2 \\cdot x');
  });

  it('keeps the one-row-per-statement shape of the real engine', async () => {
    const rows = await interimEvaluate('1+1\\\\ 2+3');
    expect(rows).toEqual([
      { ok: true, latex: '2' },
      { ok: true, latex: '5' },
    ]);
  });

  it('returns [] for empty input', async () => {
    expect(await interimEvaluate('')).toEqual([]);
  });
});
