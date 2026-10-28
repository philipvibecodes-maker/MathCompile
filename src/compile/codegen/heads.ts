export const STATEMENT_HEADS = new Set([
  'Assign', 'Def', 'Declare', 'Block', 'WhereBlock', 'Which', 'Piecewise',
  'PythonSource', 'Plot', 'Solve', 'DSolve', 'PDESolve',
]);
export const CMP_NESTABLE_HEADS = new Set([
  'Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual',
]);
export const STATEMENT_CALL_HEADS = new Set(['solve', 'Solve', 'piecewise', 'Piecewise']);

// Set-valued operator heads — setish only when every operand is too
// (Subsets/Supersets are predicates, not sets, so they don't appear here).
export const SETISH_OP_HEADS = new Set([
  'Union', 'Intersection', 'SetMinus', 'Complement', 'CircleTimes',
]);

// Heads that emit a Boolean — the only predicates ConditionSet accepts.
export const BOOLISH_HEADS = new Set([
  'Element', 'NotElement', 'Equal', 'NotEqual', 'IdenticallyEqual',
  'Less', 'LessEqual', 'Greater', 'GreaterEqual', 'NotLess',
  'NotLessEqual', 'NotGreater', 'NotGreaterEqual', 'Divides',
  'NotDivides', 'Subset', 'SubsetEqual', 'Superset', 'SupersetEqual',
  'NotSubset', 'NotSubsetNotEqual', 'NotSuperset',
  'NotSupersetNotEqual', 'And', 'Or', 'Not', 'Xor', 'Implies',
  'Equivalent',
]);

// `emit` flags a dropped Error node with this generic message; the
// normalizer already issued the real diagnostic, so the placeholder is
// marker-only — the python overlay renders it as a ! icon (never text)
// and the calculator drops it from statement errors entirely.
export const UNPARSEABLE_MSG = 'unparseable input — statement skipped';
