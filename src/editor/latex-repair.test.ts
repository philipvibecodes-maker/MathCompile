import { describe, expect, it } from 'vitest';
import { repairLatex, textFallback } from './latex-repair';

// Whitelist oracle: only these strings "parse". Tests drive the algorithm
// deterministically; the real MathQuill oracle is covered by e2e.
const ok =
  (good: readonly string[]) =>
  (s: string) =>
    good.includes(s);

describe('repairLatex', () => {
  it('returns null for blank input', () => {
    expect(repairLatex('   ', ok(['x']))).toBeNull();
    expect(repairLatex('', ok(['x']))).toBeNull();
  });

  it('closes unbalanced { groups', () => {
    expect(repairLatex('x_{', ok(['x_{}']))).toBe('x_{}');
    expect(repairLatex('\\frac{1}{', ok(['\\frac{1}{}']))).toBe('\\frac{1}{}');
  });

  it('wraps a raw \\\\ row break in \\displaylines', () => {
    expect(
      repairLatex('x\\\\y', ok(['\\displaylines{x\\\\y}'])),
    ).toBe('\\displaylines{x\\\\y}');
  });

  it('drops a single stray token mid-string', () => {
    expect(repairLatex('x_{a}}y', ok(['x_{a}y']))).toBe('x_{a}y');
    expect(repairLatex('x_{a}}', ok(['x_{a}']))).toBe('x_{a}');
    expect(repairLatex('x_{a}^', ok(['x_{a}']))).toBe('x_{a}');
  });

  it('right-trims multi-token garbage (\\right) is two tokens)', () => {
    expect(repairLatex('x_{a}\\right)y', ok(['x_{a}']))).toBe('x_{a}');
  });

  it('prefers single-token deletion over right-trim to keep trailing content', () => {
    expect(repairLatex('x_{a}^z', ok(['x_{a}z', 'x_{a}']))).toBe('x_{a}z');
  });

  it('right-trims when no single token fixes it', () => {
    expect(repairLatex('x_{a}^{', ok(['x_{a}']))).toBe('x_{a}');
  });

  it('tries candidates least-destructive first (balance before deletion)', () => {
    expect(repairLatex('x_{', ok(['x_{}', 'x']))).toBe('x_{}');
  });

  it('respects maxAttempts', () => {
    // Nothing parses -> bounded work, null.
    expect(repairLatex('x_{a}^', ok([]), 10)).toBeNull();
  });

  it('ignores escaped braces when balancing groups', () => {
    // \\{ counts as a brace bracket, not a group open.
    expect(repairLatex('x\\{', ok(['x']))).toBe('x');
  });
});

describe('textFallback', () => {
  it('strips braces and backslashes into a \\text arg', () => {
    expect(textFallback('x_{a}^')).toBe('\\text{x_ a ^}');
    expect(textFallback('\\frac{1}{')).toBe('\\text{ frac 1  }');
  });
});
