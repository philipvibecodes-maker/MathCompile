import { describe, expect, it } from 'vitest';
import { interimEvaluate, splitRows } from './calculator.svelte.ts';

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

  it('consolidates multi-line cells into a parenthesized list', async () => {
    const rows = await interimEvaluate('1+1\\\\ 2+3');
    expect(rows).toEqual([{ ok: true, latex: '\\left(2,\\ 5\\right)' }]);
  });

  it('returns [] for unsupported commands or empty input', async () => {
    expect(await interimEvaluate('')).toEqual([]);
    expect(await interimEvaluate('\\int_0^1 x')).toEqual([]);
  });
});
