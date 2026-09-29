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

  it('empty query matches empty text', () => {
    expect(fuzzyScore('', '')).toBe(0);
  });

  it('trims the query before matching', () => {
    expect(fuzzyScore('  del  ', 'delete expression')).not.toBeNull();
    expect(fuzzyScore('  del  ', 'delete expression')).toBe(
      fuzzyScore('del', 'delete expression'),
    );
  });

  it('does not trim the text', () => {
    // A leading space in the text is a real character to match against, but
    // the char after it is still at a word boundary.
    expect(fuzzyScore('x', '  x')).not.toBeNull();
  });

  it('requires query chars in order', () => {
    expect(fuzzyScore('ba', 'ab')).toBeNull();
    expect(fuzzyScore('ab', 'ab')).not.toBeNull();
  });

  it('matches a query longer than the text only as a subsequence', () => {
    expect(fuzzyScore('abc', 'ac')).toBeNull();
  });

  it.each([' ', '/', ':', '-', '_', '('])(
    'treats %s as a word-boundary character',
    (sep) => {
      const boundary = fuzzyScore('x', `a${sep}x`)!;
      const midword = fuzzyScore('x', 'axx')!;
      expect(boundary).toBeGreaterThan(midword);
    },
  );

  it('start-of-string counts as a boundary', () => {
    const atStart = fuzzyScore('x', 'xyz')!;
    const mid = fuzzyScore('x', 'yxz')!;
    expect(atStart).toBeGreaterThan(mid);
  });

  it('is case-insensitive in both query and text', () => {
    expect(fuzzyScore('smart', 'SMART MODE')).not.toBeNull();
    expect(fuzzyScore('SMART', 'smart mode')).not.toBeNull();
    expect(fuzzyScore('Smart', 'SmArT')).not.toBeNull();
  });

  it('"tpy" matches "Target: Python" and not "Duplicate expression"', () => {
    // Ranking example from fuzzy.ts — 'tpy' isn't a subsequence of
    // 'duplicate expression' at all (it has no 'y').
    expect(fuzzyScore('tpy', 'Target: Python')).not.toBeNull();
    expect(fuzzyScore('tpy', 'Duplicate expression')).toBeNull();
  });

  it('each matched char earns its own boundary bonus', () => {
    // Both 'c's sit at word starts in 'clear commands'; in 'accept' they are
    // a mid-word run — the boundary bonuses outweigh the shorter text.
    const boundary = fuzzyScore('cc', 'clear commands')!;
    const midword = fuzzyScore('cc', 'accept')!;
    expect(boundary).toBeGreaterThan(midword);
  });

  it('score is a finite number for every match', () => {
    for (const [q, t] of [
      ['x', 'x'],
      ['abc', 'a1b2c3'],
      ['', 'anything'],
    ] as const) {
      const s = fuzzyScore(q, t);
      expect(s).not.toBeNull();
      expect(Number.isFinite(s!)).toBe(true);
    }
  });
});
