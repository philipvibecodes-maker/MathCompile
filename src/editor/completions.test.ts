// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { matchCompletions } from './completions';
import {
  loadCompletionUsage,
  recordCompletionUse,
  USAGE_STORAGE_KEY,
} from '../state/persistence';

const names = (prefix: string, usage: Record<string, number> = {}) =>
  matchCompletions(prefix, 8, usage).map((c) => c.name);

describe('matchCompletions', () => {
  it('an exact name always wins the top slot', () => {
    // '\in' is a real catalog item — it must outrank the longer 'int'
    // family so typing \in accepts ∈, not an integral.
    expect(names('in')[0]).toBe('in');
    expect(names('in', { int: 10 })[0]).toBe('in');
  });

  it('prefix hits keep catalog order inside the tier', () => {
    expect(names('sqrt')[0]).toBe('sqrt');
    expect(names('s')[0]).toBe('sqrt'); // catalog order, not shortest name
    expect(names('in')).toContain('int');
    expect(names('in')).toContain('infty');
  });

  it('declared synonyms surface the command', () => {
    expect(names('integral')[0]).toBe('int');
    expect(names('piecewise')[0]).toBe('cases');
  });

  it('hint text matches when the name does not', () => {
    expect(names('determinant')).toContain('det');
    expect(names('summation')).toContain('sum');
  });

  it('fuzzy subsequences still find the name', () => {
    expect(names('nthrt')).toContain('nthroot');
    expect(names('vmtx')).toContain('vmatrix');
  });

  it('usage floats a command within its tier, never across tiers', () => {
    expect(names('p')[0]).toBe('prod'); // no usage: catalog order
    expect(names('p', { pmatrix: 5 })[0]).toBe('pmatrix');
    // A substring-tier hit can't outrank a prefix hit even at max boost.
    const hits = names('x', { approx: 10 });
    expect(hits.indexOf('xi')).toBeLessThan(hits.indexOf('approx'));
    // And the boost pulls an otherwise-unlisted item into the top 8.
    expect(names('x')).not.toContain('approx');
    expect(hits[1]).toBe('approx');
  });

  it('empty prefix returns the catalog head', () => {
    expect(matchCompletions('')[0].name).toBe('frac');
  });
});

describe('completion usage persistence', () => {
  it('recordCompletionUse accumulates and loads back', () => {
    localStorage.removeItem(USAGE_STORAGE_KEY);
    recordCompletionUse('vmatrix');
    recordCompletionUse('vmatrix');
    recordCompletionUse('int');
    expect(loadCompletionUsage()).toEqual({ vmatrix: 2, int: 1 });
  });
});
