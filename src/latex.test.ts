import { describe, expect, it } from 'vitest';
import { displayLatex, outputLatex } from './latex';

describe('outputLatex', () => {
  it('returns single-line latex unchanged', () => {
    expect(outputLatex('x+1')).toBe('x+1');
    expect(outputLatex('2^{n}=\\sum_{i=0}^{n}\\binom{i}{n}')).toBe(
      '2^{n}=\\sum_{i=0}^{n}\\binom{i}{n}',
    );
  });

  it('unwraps a displaylines-wrapped multi-line cell', () => {
    expect(outputLatex('\\displaylines{x\\\\ y}')).toBe('x\\\\ y');
  });

  it('keeps braces inside the unwrapped rows', () => {
    expect(outputLatex('\\displaylines{\\frac{1}{2}\\\\ y^{2}}')).toBe(
      '\\frac{1}{2}\\\\ y^{2}',
    );
  });

  it('leaves a non-wrapping displaylines prefix alone', () => {
    expect(outputLatex('\\displaylines{x} + y')).toBe('\\displaylines{x} + y');
  });
});

describe('displayLatex', () => {
  it('keeps \\ separators and puts each row on its own line', () => {
    expect(displayLatex('\\displaylines{x\\\\ y}')).toBe('x\\\\\n y');
    expect(displayLatex('\\pmatrix{a&b\\\\c&d}')).toBe(
      '\\pmatrix{a&b\\\\\nc&d}',
    );
  });

  it('returns single-line latex unchanged', () => {
    expect(displayLatex('x+1')).toBe('x+1');
  });
});
