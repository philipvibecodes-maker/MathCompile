import { describe, expect, it } from 'vitest';
import { arcTrigNames } from './result-latex';

// arcTrigNames rewrites the a-prefixed inverse-trig names CAS engines
// emit (\operatorname{atan}, \mathrm{asin}) into arc- forms — MathQuill
// renders "atan" as `a` + upright `tan` ("a tan") because `atan` isn't a
// known operator name, while every arc<name> is.
describe('arcTrigNames', () => {
  it('rewrites a- names inside \\operatorname and \\mathrm wrappers', () => {
    // \mathrm- and \operatorname-wrapped spellings both come through
    // (SymPy's abbreviated style emits \operatorname{asin}).
    expect(arcTrigNames('2 \\mathrm{atan}\\left(\\sqrt{x}\\right)')).toBe(
      '2 \\operatorname{arctan}\\left(\\sqrt{x}\\right)',
    );
    expect(arcTrigNames('\\operatorname{asin}{x}')).toBe(
      '\\operatorname{arcsin}{x}',
    );
    expect(arcTrigNames('\\text{acos}{x}')).toBe('\\operatorname{arccos}{x}');
  });

  it('covers every a- inverse trig name, longest suffix first', () => {
    // `coth`/`csch`/`sech` must win over the `cot`/`csc`/`sec` prefixes.
    for (const [a, arc] of [
      ['atan', 'arctan'],
      ['asin', 'arcsin'],
      ['acos', 'arccos'],
      ['asec', 'arcsec'],
      ['acsc', 'arccsc'],
      ['acot', 'arccot'],
      ['asinh', 'arcsinh'],
      ['acosh', 'arccosh'],
      ['atanh', 'arctanh'],
      ['asech', 'arcsech'],
      ['acsch', 'arccsch'],
      ['acoth', 'arccoth'],
    ] as const) {
      expect(arcTrigNames(`\\mathrm{${a}}`)).toBe(`\\operatorname{${arc}}`);
    }
  });

  it('leaves everything else alone', () => {
    expect(arcTrigNames('\\mathrm{log}\\left(x\\right)')).toBe(
      '\\mathrm{log}\\left(x\\right)',
    );
    expect(arcTrigNames('x^{2} + \\arctan{x}')).toBe('x^{2} + \\arctan{x}');
    // \operatorname{ans} has special meaning to MathQuill — not a trig name.
    expect(arcTrigNames('\\operatorname{ans}')).toBe('\\operatorname{ans}');
    // The arc- forms are already correct.
    expect(arcTrigNames('\\operatorname{arcsec}{x}')).toBe(
      '\\operatorname{arcsec}{x}',
    );
  });
});
