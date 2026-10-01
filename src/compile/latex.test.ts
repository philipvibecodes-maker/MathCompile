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

  it('shows boundless \\antid and \\iint as \\int', () => {
    // The boundless signs are insertion aliases — the output view shows
    // the canonical \int (a copied \antid is meaningless outside MQ).
    expect(outputLatex('\\antid x^{2}dx')).toBe('\\int x^{2}dx');
    expect(outputLatex('\\iint xdxdy')).toBe('\\int xdxdy');
    expect(outputLatex('\\iint_{a}^{b} x\\,dx')).toBe('\\int_{a}^{b} x\\,dx');
    expect(outputLatex('\\displaylines{\\antid x\\\\ \\iint y}')).toBe(
      '\\int x\\\\ \\int y',
    );
    // Bounds grow as a sibling SupSub — the alias still maps.
    expect(outputLatex('\\antid_{1} xdx')).toBe('\\int_{1} xdx');
  });
});

describe('displayLatex', () => {
  it('keeps \\ separators and puts each row on its own line', () => {
    expect(displayLatex('\\displaylines{x\\\\ y}')).toBe('x\\\\\ny');
    expect(displayLatex('\\pmatrix{a&b\\\\c&d}')).toBe(
      '\\pmatrix{a&b\\\\\nc&d}',
    );
  });

  it('returns single-line latex unchanged', () => {
    expect(displayLatex('x+1')).toBe('x+1');
  });

  it('shows \\antid and \\iint as \\int too', () => {
    expect(displayLatex('\\antid xdx')).toBe('\\int xdx');
    expect(displayLatex('\\displaylines{\\iint x\\\\ \\antid y}')).toBe(
      '\\int x\\\\\n\\int y',
    );
  });
});
