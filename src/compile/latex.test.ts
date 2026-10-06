import { describe, expect, it } from 'vitest';
import { copyableLatex, displayLatex, outputLatex } from './latex';

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

  it('unwraps a blank displaylines cell to whitespace', () => {
    // attach-field's blank-cell check is outputLatex(latex).trim() === ''.
    expect(outputLatex('')).toBe('');
    expect(outputLatex('\\displaylines{ }').trim()).toBe('');
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

  it('only maps the alias when its \\ is not half of a \\\\ separator', () => {
    // `x\\antid y` lexes as `\\` + the literal letters antid — not an
    // alias — while `\\\antid` is `\\` + a real \antid command.
    expect(outputLatex('x\\\\antid y')).toBe('x\\\\antid y');
    expect(outputLatex('x\\\\iint y')).toBe('x\\\\iint y');
    expect(outputLatex('x\\\\\\antid y')).toBe('x\\\\\\int y');
    expect(outputLatex('x\\\\\\iint y')).toBe('x\\\\\\int y');
  });
});

describe('copyableLatex', () => {
  it('keeps the displaylines wrapper so a pasted multi-line cell parses', () => {
    // The unwrapped display form 'x\\ y' is not valid field input —
    // MathQuill blanks on a top-level \\ — so the clipboard gets the
    // stored (wrapped) serialization instead.
    expect(copyableLatex('\\displaylines{x\\\\ y}')).toBe(
      '\\displaylines{x\\\\ y}',
    );
  });

  it('still canonicalizes \\antid/\\iint to \\int', () => {
    expect(copyableLatex('\\antid xdx')).toBe('\\int xdx');
  });

  it('returns single-line latex unchanged', () => {
    expect(copyableLatex('x+1')).toBe('x+1');
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
