import type { Issue, MathJson, NormResult, NormalizeOptions } from '../ir';

export interface StatementOut {
  lines: string[];
  /** Code lines for the calculator target when they differ from
   * `lines` — solver statements show the bare `sp.solve` call in the
   * python target but eval `clean_and_simplify(call, var)` in the
   * worker so the row displays `x = a1, a2, …`. Emitted verbatim (no
   * calcEval wrap) since the pipeline call is part of the line. */
  calcLines?: string[];
  /** Expression to eval for the statement's displayed value — set only
   * for non-expression statements (Assign/Def), whose `lines` exec first
   * and this evals for the row (e.g. `a = 5` shows `a = 5`). Undefined
   * means the emitted code itself is the display expression. */
  display?: string;
  /** The statement binds a name (Assign/Def/Declare) — its `display`
   * echoes the definition itself, so the shown program drops its
   * `e = …` capture line even in the plumbing view. */
  defines?: boolean;
  /** The statement produces a plot, not a value — the calc path must not
   * wrap its line in clean_and_simplify (the row carries sampled data). */
  plot?: boolean;
  /** Execs for side effects only (a defs-only PythonSource) — the
   * calculator runs it but produces no result row. */
  silent?: boolean;
}


export interface CellInput {
  json?: MathJson;
}

export interface CompileResult {
  ok: boolean;
  /** The whole worksheet as one script — the import line once, then
   * each cell's body (defs + statements) under a `# cell N` comment. */
  program: string;
  /** The program's import statement — `from sympy import *` (default) or
   * `import sympy as sp` when `importAll` is off. */
  importLine: string;
  /** Standalone script lines per cell — the import line, then that
   * cell's def + statement lines (parallel to the input cells). */
  cellLines: string[][];
  /** Normalization + codegen issues per cell (parallel to the inputs). */
  cellIssues: Issue[][];
  /** Normalized IR per cell. */
  normalized: NormResult[];
  issues: Issue[];
}

// ------------------------------------------------------------------
// Python identifiers


export interface CompileOptions extends NormalizeOptions {
  /** Emit `from sympy import *` and unqualified sympy names (default).
   * `false` emits `import sympy as sp` with `sp.` qualifiers. */
  importAll?: boolean;
  /** Calc-only: the full worksheet cells when `cells` is a prefix —
   * python defs below the edit point still resolve (with the
   * call-above-def note) instead of minting `sp.Function` stubs. */
  worksheetCells?: CellInput[];
}


export interface CalcStatement {
  /** Python source for the statement: exec'd (Assign/Def) or eval'd
   * (expression) by the calculator worker. */
  code: string;
  /** When set, `code` execs first, then this evals for the row's value.
   * Absent = `code` evals directly for the row. */
  display?: string;
  /** The statement binds a name (assign/def/declare) — the shown
   * program never inlines its `e = <display>` capture line, even in
   * the plumbing view (the display just echoes the definition). */
  defines?: boolean;
  /** Execs for side effects only (a defs-only python source) — the
   * worker binds the names and returns a marker row the client drops,
   * so no result row shows. */
  silent?: boolean;
  /** Set when the statement itself failed to emit — reported as an
   * error row in place so the cell keeps written order. */
  error?: string;
  /** 0-based input line (displayline index) the statement came from —
   * where a line-anchored issue indicator would pin. */
  line?: number;
}

export interface CalcProgram {
  /** Script prefix — `import sympy as sp` plus the cell's Symbol/Function
   * defs. The worker execs it before the statements. */
  prelude: string[];
  statements: CalcStatement[];
  /** Normalization + codegen issues for the cell. */
  issues: Issue[];
  /** 0-based line of the first statement that failed to emit — where
   * unbound issues (which carry no line of their own) anchor. */
  errorLine?: number;
  /** Input-line index of each `statements` entry — the row ordering
   * key for interleaving issue rows in the output. */
  statementLines: number[];
}

export interface CalcCellProgram {
  /** Decl lines (Symbol/Function/MatrixSymbol) first needed by this
   * cell. The worker execs them right before the cell's statements,
   * after every earlier cell's program — names bound above are already
   * in scope, so no shadowing decl is emitted for them. */
  defs: string[];
  statements: CalcStatement[];
  /** Normalization + codegen issues for the cell. */
  issues: Issue[];
  errorLine?: number;
  statementLines: number[];
}

export interface CalcWorksheetProgram {
  /** Shared script prefix — `import sympy as sp` plus the
   * CALC_RUNTIME_PY helper block. The worker execs it once, ahead of
   * cell 0's defs and statements. */
  prelude: string[];
  cells: CalcCellProgram[];
}
