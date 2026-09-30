import { describe, expect, it } from 'vitest';
import { splitRows } from './calculator.svelte.ts';

describe('splitRows', () => {
  it('splits a plain expression into one row', () => {
    expect(splitRows('x+1')).toEqual(['x+1']);
  });

  it('unwraps \\displaylines and splits each row', () => {
    expect(splitRows('\\displaylines{x\\\\ y}')).toEqual(['x', 'y']);
  });

  it('splits bare \\\\ rows without the wrapper', () => {
    expect(splitRows('a=1\\\\ b=2')).toEqual(['a=1', 'b=2']);
  });

  it('drops empty and whitespace-only rows', () => {
    expect(splitRows('')).toEqual([]);
    expect(splitRows('   ')).toEqual([]);
    expect(splitRows('x\\\\ \\\\ y')).toEqual(['x', 'y']);
  });
});
