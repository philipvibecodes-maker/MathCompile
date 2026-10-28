import { describe, expect, expectTypeOf, it } from 'vitest';
import type { MathJson } from './types';
import {
  addNode,
  assignNode,
  callNode,
  defNode,
  listNode,
  multiplyNode,
  negateNode,
  powerNode,
  pythonSourceNode,
  isAddNode,
  isAssignNode,
  isCallNode,
  isDefNode,
  isListNode,
  isMultiplyNode,
  isNegateNode,
  isPowerNode,
  isPythonSourceNode,
  type PowerNode,
  type DefNode,
} from './normalized';

describe('checked normalized shapes', () => {
  it('constructors preserve tuple arity and parameter types', () => {
    expectTypeOf(powerNode('x', 2)).toEqualTypeOf<PowerNode>();
    expectTypeOf(defNode('f', ['x'], 'x')).toEqualTypeOf<DefNode>();
    // Checked by svelte-check; never executed.
    const invalid = () => {
      // @ts-expect-error a Power requires an exponent
      powerNode('x');
      // @ts-expect-error definition parameters must be symbol names
      defNode('f', [1], 'x');
      // @ts-expect-error Add requires at least one operand
      addNode();
    };
    expect(invalid).toBeTypeOf('function');
  });

  it('recognizes the supported shapes without canonicalizing operands', () => {
    const probes = [
      [isPowerNode, powerNode({ num: '2' }, ['call', 'unknown', 'x'])],
      [isNegateNode, negateNode('x')], [isAddNode, addNode('x')],
      [isMultiplyNode, multiplyNode('x', 2)], [isListNode, listNode()],
      [isCallNode, callNode('unknown', 'x')], [isAssignNode, assignNode('a', 1)],
      [isDefNode, defNode('f', [], 'x')], [isPythonSourceNode, pythonSourceNode('x = 1')],
    ] as const;
    for (const [guard, value] of probes) expect(guard(value)).toBe(true);
  });

  it('rejects missing, extra, mistyped and sparse local slots', () => {
    const sparse: MathJson[] = ['Power'];
    sparse.length = 3;
    sparse[2] = 2;
    const bad: (MathJson | undefined)[] = [undefined, [], ['Power', 'x'],
      ['Power', 'x', 2, 3], sparse, ['Add'], ['Multiply']];
    for (const value of bad) {
      expect(isPowerNode(value)).toBe(false);
      expect(isAddNode(value)).toBe(false);
      expect(isMultiplyNode(value)).toBe(false);
    }
    expect(isCallNode(['call', 3, 'x'])).toBe(false);
    expect(isDefNode(['Def', 'f', ['List', 2], 'x'])).toBe(false);
    expect(isPythonSourceNode(['PythonSource', 1])).toBe(false);
    expect(isAssignNode(['Assign', ['List', 'x', 'y'], ['List', 1, 2]])).toBe(false);
    expect(isNegateNode(['Negate', 'x', 'y'])).toBe(false);
  });
});
