// Public compiler API. Implementation modules depend on leaf contracts,
// never on this compatibility entry point.
export { compileWorksheet, compileCellsForCalc, compileCellForCalc } from './codegen/worksheet';
export { collectDeclared } from './codegen/declarations';
export { freeNames, firstFreeCapital } from './codegen/analysis';
export { plotComponents, plotDomainBounds, type PlotBound } from './codegen/plotting';
export type {
  CellInput, CompileResult, CompileOptions,
  CalcStatement, CalcProgram, CalcCellProgram, CalcWorksheetProgram,
} from './codegen/types';
