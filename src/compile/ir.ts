// Public MathJSON pipeline API. Parsing and normalization stay independently
// testable; internal modules depend on leaf shapes/types, never this facade.
export { parseCellLatex, latexToStatementStrings, extractPythonBlocks } from './ir/parse';
export { normalizeIR, NORMALIZE_RULES } from './ir/normalize';
export { isDiffMark } from './ir/differentials';
export { unquote } from './ir/shapes';
export type {
  MathJson, RawMathJson, Issue, NormResult, NormalizeOptions, PairTupleMode,
} from './ir/types';
