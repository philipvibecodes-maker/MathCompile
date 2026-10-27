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

