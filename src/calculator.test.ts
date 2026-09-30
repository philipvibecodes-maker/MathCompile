import { describe, expect, it } from 'vitest';
import nerdamer from 'nerdamer/all';
import { toNerdamerInput } from './nerdamer-latex';
import { interimEvaluate, splitRows } from './calculator.svelte.ts';

const toN = (s: string) => toNerdamerInput(s, nerdamer);

describe('splitRows', () => {
  it('splits a plain expression into one row', () => {
    expect(splitRows('x+1')).toEqual(['x+1']);
  });

  it('unwraps \\displaylines and splits each row', () => {
    expect(splitRows('\\displaylines{x\\\\ y}')).toEqual(['x', 'y']);
  });

  it('splits bare \\\\ rows without the wrapper', () => {
    expect(splitRows('a=1\\\\ b=2')).toEqual(['a=1', 'b=2']);
  });

  it('drops empty and whitespace-only rows', () => {
    expect(splitRows('')).toEqual([]);
    expect(splitRows('   ')).toEqual([]);
    expect(splitRows('x\\\\ \\\\ y')).toEqual(['x', 'y']);
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

  it('maps \sum_{i=lo}^{hi} to sum', () => {
    expect(toN('\\sum_{i=0}^{n}k')).toBe('sum(k, i, 0, n)');
  });

  it('maps \prod_{i=lo}^{hi} to product', () => {
    expect(toN('\\prod_{i=1}^{n}k')).toBe('product(k, i, 1, n)');
  });

  it('maps \lim_{x\\to a} to limit', () => {
    expect(toN('\\lim_{x\\to 0}y')).toBe('limit(y, x, 0)');
  });

  it('maps the MathQuill \derivative form to diff', () => {
    expect(toN('\\frac{d }{d x}x^2')).toBe('diff(x^2, x)');
    expect(toN('\\frac{d^2}{d x^2}x^3')).toBe('diff(x^3, x, 2)');
  });

  it('expands \binom into factorials', () => {
    expect(toN('\\binom{n}{k}')).toBe(
      'factorial(n)/(factorial(k)*factorial(n-k))',
    );
  });

  it('maps \sqrt[n]{x} to nthroot', () => {
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

  it('consolidates multi-line cells into a parenthesized list', async () => {
    const rows = await interimEvaluate('1+1\\\\ 2+3');
    expect(rows).toEqual([{ ok: true, latex: '\\left(2,\\ 5\\right)' }]);
  });

  it('returns [] for empty input', async () => {
    expect(await interimEvaluate('')).toEqual([]);
  });
});
