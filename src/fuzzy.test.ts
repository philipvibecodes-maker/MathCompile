import { describe, expect, it } from 'vitest';
import { fuzzyScore } from './fuzzy';

describe('fuzzyScore', () => {
  it('matches an empty query', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
    expect(fuzzyScore('   ', 'x')).toBe(0);
  });

  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyScore('xyz', 'abc')).toBeNull();
    expect(fuzzyScore('delete', 'clear all')).toBeNull();
  });

  it('matches subsequences', () => {
    expect(fuzzyScore('nw', 'new expression')).not.toBeNull();
    expect(fuzzyScore('dlt', 'delete expression')).not.toBeNull();
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('PYTHON', 'Target: python')).not.toBeNull();
  });

  it('prefers matches at word boundaries', () => {
    const boundary = fuzzyScore('sm', 'smart mode')!;
    const midword = fuzzyScore('sm', 'prism')!;
    expect(boundary).toBeGreaterThan(midword);
  });

  it('prefers consecutive matches', () => {
    const consec = fuzzyScore('ab', 'abx')!;
    const scattered = fuzzyScore('ab', 'axb')!;
    expect(consec).toBeGreaterThan(scattered);
  });

  it('breaks ties toward shorter text', () => {
    const short = fuzzyScore('a', 'a')!;
    const long = fuzzyScore('a', 'a very long title')!;
    expect(short).toBeGreaterThan(long);
  });
});
