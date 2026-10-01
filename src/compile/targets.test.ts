import { describe, expect, it } from 'vitest';
import { COMMENT_PREFIX, TARGETS, type TargetId } from './targets';

describe('targets', () => {
  it('every target has a unique id and a non-empty label', () => {
    const ids = TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TARGETS) expect(t.label.trim()).not.toBe('');
  });

  it('every target has a comment prefix', () => {
    for (const t of TARGETS)
      expect(COMMENT_PREFIX[t.id as TargetId].trim()).not.toBe('');
  });

  it('COMMENT_PREFIX has no entries for unknown targets', () => {
    const ids = new Set<string>(TARGETS.map((t) => t.id));
    for (const key of Object.keys(COMMENT_PREFIX)) expect(ids.has(key)).toBe(true);
  });

  it('pins the current target list', () => {
    // Characterization test: a rewrite should offer the same codegen targets.
    expect(TARGETS.map((t) => t.id)).toEqual([
      'latex',
      'calculator',
      'python',
      'javascript',
      'glsl',
      'c',
    ]);
  });
});
