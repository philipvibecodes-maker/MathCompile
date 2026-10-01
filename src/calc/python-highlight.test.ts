import { describe, expect, it } from 'vitest';
import { highlightPython } from './python-highlight';

// Pairs of [text, cls] for readable token assertions.
const spans = (code: string) =>
  highlightPython(code).map((t) => [t.text, t.cls] as const);

const clsFor = (code: string, text: string) =>
  highlightPython(code).find((t) => t.text === text)?.cls;

describe('highlightPython', () => {
  it('reproduces the input verbatim (lossless)', () => {
    const code =
      "n = Symbol('n')\ne = Eq(2**n, (n*binomial(0, n) + binomial(n, n))/(n + 1))";
    expect(highlightPython(code).map((t) => t.text).join('')).toBe(code);
  });

  it('classifies sympy python() output', () => {
    const toks = spans("x = Symbol('x')\ne = sin(x)**2 + 1");
    expect(toks).toContainEqual(['Symbol', 'call']);
    expect(toks).toContainEqual(["'x'", 'str']);
    expect(toks).toContainEqual(['sin', 'call']);
    expect(toks).toContainEqual(['2', 'num']);
    expect(toks).toContainEqual(['1', 'num']);
    expect(clsFor('e = True', 'True')).toBe('kw');
  });

  it('classifies keywords and comments', () => {
    const toks = spans('def f(n):\n    return n  # back');
    expect(toks).toContainEqual(['def', 'kw']);
    expect(toks).toContainEqual(['f', 'call']);
    expect(toks).toContainEqual(['return', 'kw']);
    expect(toks).toContainEqual(['# back', 'comment']);
  });

  it('does not treat keyword prefixes inside identifiers as keywords', () => {
    expect(clsFor('imported = 1', 'imported')).toBeUndefined();
    expect(clsFor('in_x = 2', 'in_x')).toBeUndefined();
  });
});
