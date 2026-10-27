import type { MathJson } from './types';

// Checked views of common normalized shapes, not a claim that the entire
// Compute Engine vocabulary is canonical. Operands remain raw-compatible:
// Error nodes, wrappers, and unknown notation still use existing handling.
export type PowerNode = ['Power', MathJson, MathJson];
export type NegateNode = ['Negate', MathJson];
export type AddNode = ['Add', MathJson, ...MathJson[]];
export type MultiplyNode = ['Multiply', MathJson, ...MathJson[]];
export type ListNode = ['List', ...MathJson[]];
export type CallNode = ['call', string, ...MathJson[]];
export type AssignNode = ['Assign', string, MathJson];
export type ParameterList = ['List', ...string[]];
export type DefNode = ['Def', string, ParameterList, MathJson];
export type PythonSourceNode = ['PythonSource', string];

export const powerNode = (base: MathJson, exponent: MathJson): PowerNode =>
  ['Power', base, exponent];
export const negateNode = (operand: MathJson): NegateNode => ['Negate', operand];
export const addNode = (first: MathJson, ...rest: MathJson[]): AddNode =>
  ['Add', first, ...rest];
export const multiplyNode = (first: MathJson, ...rest: MathJson[]): MultiplyNode =>
  ['Multiply', first, ...rest];
export const listNode = (...items: MathJson[]): ListNode => ['List', ...items];
export const callNode = (name: string, ...args: MathJson[]): CallNode =>
  ['call', name, ...args];
export const assignNode = (name: string, value: MathJson): AssignNode =>
  ['Assign', name, value];
export const defNode = (name: string, params: string[], body: MathJson): DefNode =>
  ['Def', name, ['List', ...params], body];
export const pythonSourceNode = (source: string): PythonSourceNode =>
  ['PythonSource', source];

// The input is already at the MathJSON boundary. Check the local shape
// only, without an extra recursive validation/normalization pass. Explicit
// index reads also reject sparse arrays and undefined operand slots.
const hasOperands = (node: MathJson | undefined, head: string, min: number, max = min): node is MathJson[] => {
  if (!Array.isArray(node) || node[0] !== head || node.length < min || node.length > max)
    return false;
  for (let i = 1; i < node.length; i++)
    if (node[i] === undefined || node[i] === null) return false;
  return true;
};

export const isPowerNode = (node: MathJson | undefined): node is PowerNode =>
  hasOperands(node, 'Power', 3);
export const isNegateNode = (node: MathJson | undefined): node is NegateNode =>
  hasOperands(node, 'Negate', 2);
export const isAddNode = (node: MathJson | undefined): node is AddNode =>
  hasOperands(node, 'Add', 2, Infinity);
export const isMultiplyNode = (node: MathJson | undefined): node is MultiplyNode =>
  hasOperands(node, 'Multiply', 2, Infinity);
export const isListNode = (node: MathJson | undefined): node is ListNode =>
  hasOperands(node, 'List', 1, Infinity);
export const isCallNode = (node: MathJson | undefined): node is CallNode =>
  hasOperands(node, 'call', 2, Infinity) && typeof node[1] === 'string';
// This intentionally covers only scalar-name assignments. Tuple unpacking
// is a separate existing shape and remains on the permissive path.
export const isAssignNode = (node: MathJson | undefined): node is AssignNode =>
  hasOperands(node, 'Assign', 3) && typeof node[1] === 'string';
export const isDefNode = (node: MathJson | undefined): node is DefNode =>
  hasOperands(node, 'Def', 4) && typeof node[1] === 'string' &&
  isListNode(node[2]) && node[2].slice(1).every((param) => typeof param === 'string');
export const isPythonSourceNode = (node: MathJson | undefined): node is PythonSourceNode =>
  hasOperands(node, 'PythonSource', 2) && typeof node[1] === 'string';
