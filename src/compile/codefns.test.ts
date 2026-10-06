import { beforeEach, describe, expect, it } from 'vitest';
import {
  codeFnNames,
  codeFnPyLines,
  codeFns,
  defineCodeFn,
  removeCodeFn,
} from './codefns.svelte.ts';

describe('code functions registry', () => {
  beforeEach(() => {
    codeFns.splice(0, codeFns.length);
  });

  it('defineCodeFn adds a def; redefine replaces in place', () => {
    defineCodeFn({ name: 'clen', params: ['n'], body: 'n + 1' });
    defineCodeFn({ name: 'clen', params: ['n', 'k'], body: 'n * k' });
    expect(codeFns.length).toBe(1);
    expect(codeFns[0].params).toEqual(['n', 'k']);
  });

  it('codeFnPyLines emits lambda lines; a 0-param def is a plain assign', () => {
    defineCodeFn({ name: 'clen', params: ['n', 'k'], body: 'n * k' });
    defineCodeFn({ name: 'const5', params: [], body: '5' });
    expect(codeFnPyLines()).toEqual([
      'clen = lambda n, k: n * k',
      'const5 = 5',
    ]);
    expect(codeFnNames()).toEqual(new Set(['clen', 'const5']));
  });

  it('removeCodeFn drops the def', () => {
    defineCodeFn({ name: 'clen', params: ['n'], body: 'n' });
    removeCodeFn('clen');
    expect(codeFns.length).toBe(0);
    expect(codeFnPyLines()).toEqual([]);
  });
});
