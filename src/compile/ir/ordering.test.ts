import { describe, expect, it } from 'vitest';
import { normalizeIR, parseCellLatex } from '../ir';

describe('normalization ordering contracts', () => {
  it('flattens a chained equality before deciding whether it assigns', () => {
    expect(normalizeIR(['Equal', 'a', ['Equal', 'b', 1]]).ir)
      .toEqual(['Equal', 'a', 'b', 1]);
    expect(normalizeIR(['Equal', 'a', 1]).ir).toEqual(['Assign', 'a', 1]);
  });

  it('recognizes a plot marker before ordinary juxtaposition', () => {
    expect(normalizeIR(['InvisibleOperator', "'plot'", ['Add', 'x', 1]]).ir)
      .toEqual(['Plot', ['Add', 'x', 1]]);
  });

  it('discovers function declarations in written order', () => {
    const declared = new Set<string>();
    normalizeIR(parseCellLatex('\\text{def} f(x) = x + 1'), declared);
    expect(declared.has('f')).toBe(true);
    const below = normalizeIR(parseCellLatex('f(2)'), declared);
    expect(below.issues).toEqual([]);
    expect(below.ir).toEqual(['Apply', 'f', 2]);
    expect(normalizeIR(parseCellLatex('f(2)')).ir).not.toEqual(below.ir);
  });

  it('keeps error attribution on the original input line', () => {
    const result = normalizeIR(['Block', ['Add', 'x', 1], ['Error', "'missing'"]]);
    expect(result.issues).toEqual([{
      severity: 'error', message: 'empty slot — fill it in or delete it', line: 1,
    }]);
  });
});
