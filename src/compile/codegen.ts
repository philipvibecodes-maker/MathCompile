import { collectDeclared,collectMatrices } from './codegen/declarations';
import { Emitter } from './codegen/emitter';
import { STATEMENT_CALL_HEADS,STATEMENT_HEADS,UNPARSEABLE_MSG } from './codegen/heads';
import { headOf,isArr,isHead,isStr } from './codegen/nodes';
import { Scope } from './codegen/scope';
import { emitStatement } from './codegen/statements';
import type { StatementOut } from './codegen/types';
// Normalized IR -> target codegen.
//
// The `python` target emits executable SymPy. Cells are compiled
// independently: each cell's output is a standalone script — the import
// line (`from sympy import *` by default, or `import sympy as sp` with
// `sp.` qualifiers when `importAll` is off), `x = Symbol('x')`/
// `f = Function('f')` def lines for every free name the cell uses, then
// its statements. `program` joins all cell bodies under one import for
// the copy-everything button. Any head the mapping table doesn't cover
// falls through to the escape hatch `<head>(args)` so users are never
// blocked by vocabulary gaps.
//
// Statement-level heads (Assign, Def, Block, Solve, Piecewise/Which) are
// Python-only: for the javascript/glsl/c targets the compiler returns an
// error diagnostic instead of code. The expression subset for those
// targets is future work.

import { CALC_RUNTIME_PY } from './calc-runtime';
import type { Issue,MathJson,NormResult } from './ir';
import {
normalizeIR,
type NormalizeOptions
} from './ir';
import { collectPyFns } from './pydefs';
// The name tables below are derived views over the notation registry —
// each name lives once in src/compile/notation.ts.
import {
CE_DISPLAY_NAMES
} from './notation';

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

interface CellBody {
  /** Symbol/Function def lines for names first needed by this cell. */
  defs: string[];
  /** Emitted top-level statements, in order (pre-collapse). `errs`
   * carries the emission errors of a statement that produced no lines —
   * the calculator target turns those into in-place error rows. `emitted`
   * is every issue raised during that statement (line-binding data).
   * `line` is the statement's 0-based input-line index. */
  parts: {
    stmt: MathJson;
    out: StatementOut;
    errs: Issue[];
    emitted: Issue[];
    line: number;
  }[];
  /** Symbol/function names first bound in this cell. */
  newNames: Set<string>;
}

// Emit one normalized cell IR into defs + per-statement lines. Cells are
// independent: the scope's defined/symbols/functions sets are fresh per
// cell, so every free name the cell uses gets its def line at the top of
// the cell (`a = Symbol("a")` / `f = Function("f")`, `sp.`-qualified when
// `import sympy as sp` mode is selected).
function cellBody(ir: MathJson, scope: Scope): CellBody {
  const emitter = new Emitter(scope);
  const sp = scope.qualified ? 'sp.' : '';
  const preDefined = new Set(scope.decls.defined);
  // Reserve the cell's own names (and worksheet Assign/Def targets) so
  // constants of integration start at the first free capital.
  scope.reserveConstNames(ir);
  // A dependent variable's full arg list is the union over every
  // derivative site in the cell — `D(u,t) = D(u,x,x)` and a later bare
  // `u` all emit `u(t,x)`, never u(t) at one site and u(x) at another.
  // Def'd names keep their declared parameter list instead.
  seedDepVarArgs(ir, scope);
  // `\text{where}`-style blocks arrive condition-first: `x² where x>0`
  // parses as WhereBlock(Gt, x²) — a single written statement CE split
  // internally (parseCellLatex tags them). Emit the body row before its
  // conditions — the order the user wrote, not CE's. Real `\\` rows are
  // Block children and stay in written order.
  const RELATION_HEADS = new Set([
    'Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual',
    'NotLess', 'NotGreater', 'NotLessEqual', 'NotGreaterEqual',
    'Element', 'NotElement', 'Subset', 'SubsetEqual', 'Superset',
    'SupersetEqual', 'IdenticallyEqual', 'Congruent',
  ]);
  const isRelation = (n: MathJson): boolean => RELATION_HEADS.has(headOf(n) ?? '');
  const blockNodes = isHead(ir, 'Block') ? ir.slice(1) : [ir];
  // Each node carries the index of the displayline it came from — a
  // WhereBlock expands one input line into several statements, so the
  // nodes index alone is not the line number.
  const nodes = blockNodes.flatMap((n, line) => {
    const tag = (stmt: MathJson) => ({ stmt, line });
    if (!isHead(n, 'WhereBlock')) return [tag(n)];
    const kids = n.slice(1);
    return (
      kids.length > 1 &&
      kids.slice(0, -1).every(isRelation) &&
      !isRelation(kids[kids.length - 1])
        ? [kids[kids.length - 1], ...kids.slice(0, -1)]
        : kids
    ).map(tag);
  });
  const parts = nodes.map(({ stmt, line }) => {
    const issuesAt = scope.issues.length;
    const out = emitStatement(stmt, emitter);
    // Every issue raised while emitting this statement — notes included,
    // so unbound issues can anchor at the line that produced them.
    const emitted = scope.issues.slice(issuesAt);
    // A statement dropped by an emission error keeps its row as an
    // in-place error so multi-statement cells keep written order.
    const errs =
      out.lines.length === 0
        ? emitted.filter((i) => i.severity === 'error')
        : [];
    return { stmt, out, errs, emitted, line };
  });

  // Names first needed in this cell (not already bound in earlier ones).
  const newSyms = [...scope.emit.symbols].filter(([raw]) => !preDefined.has(raw));
  // Function-bound names (Def/`f:`) sit in `functions` for call-fold
  // detection but declare themselves — no `sp.Function` def for them.
  // pyBacked names point at a python-cell def — the real callable, not
  // a minted stub — so they emit no decl either.
  const newFns = [...scope.emit.functions].filter(
    ([raw]) =>
      !preDefined.has(raw) &&
      !scope.decls.declaredFns.has(raw) &&
      !scope.emit.pyBacked.has(raw),
  );
  const newMats = [...scope.emit.matrices].filter(
    ([raw]) => !preDefined.has(raw),
  );
  const newNames = new Set(
    [...newSyms, ...newFns, ...newMats].map(([raw]) => raw),
  );
  scope.markDefinedAll(newNames);

  const defs: string[] = [];
  // `simple` names are already valid identifiers — they go in one grouped
  // `sp.symbols('a b')` call whose string must not contain quotes or
  // punctuation. Anything needing mangling (a_0', {abc}, ? names) gets an
  // individual `sp.Symbol("raw name")` def where JSON quoting is safe.
  const simple = newSyms.filter(
    ([raw, ident]) =>
      raw === ident &&
      !scope.kinds.assumptions.has(raw) &&
      !scope.kinds.matrixDims.has(raw) &&
      CE_DISPLAY_NAMES[raw] === undefined,
  );
  const fancy = newSyms.filter(
    ([raw, ident]) =>
      raw !== ident ||
      scope.kinds.assumptions.has(raw) ||
      scope.kinds.matrixDims.has(raw) ||
      CE_DISPLAY_NAMES[raw] !== undefined,
  );
  if (simple.length === 1)
    defs.push(`${simple[0][1]} = ${sp}Symbol(${JSON.stringify(simple[0][0])})`);
  else if (simple.length > 1)
    defs.push(
      `${simple.map(([, ident]) => ident).join(', ')} = ${sp}symbols('${simple.map(([raw]) => raw).join(' ')}')`,
    );
  for (const [raw, ident] of fancy) {
    const dim = scope.kinds.matrixDims.get(raw);
    const kw = scope.kinds.assumptions.get(raw);
    if (dim)
      defs.push(
        `${ident} = ${sp}MatrixSymbol(${JSON.stringify(raw)}, ${dim[0]}, ${dim[1]})`,
      );
    else
      defs.push(
        `${ident} = ${sp}Symbol(${JSON.stringify(CE_DISPLAY_NAMES[raw] ?? raw)}${kw?.size ? `, ${[...kw].join(', ')}` : ''})`,
      );
  }
  for (const [raw, ident] of newFns)
    defs.push(`${ident} = ${sp}Function(${JSON.stringify(raw)})`);
  for (const [raw, ident] of newMats)
    defs.push(
      `${ident} = ${sp}MatrixSymbol(${JSON.stringify(raw)}, ${sp}Symbol("n", integer=True, positive=True), ${sp}Symbol("n", integer=True, positive=True))`,
    );

  return { defs, parts, newNames };
}

function cellStatements(ir: MathJson | undefined, scope: Scope): string[] {
  if (ir === undefined) return [];
  const { defs, parts, newNames } = cellBody(ir, scope);

  // A bare `a` cell whose symbol is defined here collapses to just the
  // definition line — `a = Symbol("a")` is the cell's output.
  const stmts = parts.flatMap(({ stmt, out }) =>
    isStr(stmt) && newNames.has(stmt) ? [] : out.lines,
  );
  return [...defs, ...stmts];
}

// First pass over a cell's IR: union the variable slots each name is
// differentiated/applied by into `fnArgs`, so every site emits the same
// applied call. Without the union `D(u,t) = D(u,x,x)` records u as a
// function of t at the first site and emits `diff(u(t), x, x)` — a
// silently-zero second derivative — at the second.
function seedDepVarArgs(ir: MathJson, scope: Scope): void {
  const slots = new Map<string, MathJson[]>();
  const add = (name: string, vars: MathJson[]) => {
    if (vars.length === 0) return;
    const prev = slots.get(name) ?? [];
    for (const v of vars)
      if (!prev.some((p) => JSON.stringify(p) === JSON.stringify(v)))
        prev.push(v);
    slots.set(name, prev);
  };
  const walk = (n: MathJson): void => {
    if (!isArr(n)) return;
    const h = headOf(n);
    // A name is never a dependent of its own differentiation
    // variable — `D(x,x)` is `diff(x, x)` = 1, not a function claim.
    const varsOf = (name: MathJson, xs: MathJson[]) =>
      xs.filter((v): v is string => isStr(v) && v !== name);
    if (h === 'D' && isStr(n[1])) add(n[1], varsOf(n[1], n.slice(2)));
    else if (
      h === 'Apply' &&
      isArr(n[1]) &&
      headOf(n[1]) === 'Derivative' &&
      isStr(n[1][1])
    )
      add(n[1][1], varsOf(n[1][1], n.slice(2)));
    // A DepVar spec inside a Solve-family node declares the same list.
    else if (h === 'DepVar' && isStr(n[1]))
      add(n[1], varsOf(n[1], n.slice(2)));
    // `\D f` / `\nabla u` on a bare name claims it a field — of x for the
    // total derivative, of all three coords for the gradient — matching
    // the noteDepVar their codegen makes. A name already bound (symbol,
    // value, matrix) or a coordinate stays itself: `\D x`/`∇x` don't
    // turn x into x(…).
    else if (
      h === 'TotalD' &&
      isStr(n[1]) &&
      n[1] !== 'x' &&
      !scope.decls.defined.has(n[1])
    )
      add(n[1], ['x']);
    else if (
      h === 'Gradient' &&
      isStr(n[1]) &&
      !['x', 'y', 'z'].includes(n[1]) &&
      !scope.decls.defined.has(n[1])
    )
      add(n[1], ['x', 'y', 'z']);
    for (const c of n.slice(1)) walk(c);
  };
  walk(ir);
  for (const [name, vars] of slots) {
    // A def'd name's parameters are its arg list — `f(x) = …` then
    // `D(f,t)` does not turn f into a function of t.
    if (scope.decls.declaredFns.has(name)) continue;
    scope.claimDepVar(name, vars);
  }
}

// Matrix word-ops whose results are structured display data, mapped to
// the clean_and_simplify layout that renders them: basis-vector lists
// (nullspace/columnspace) as span{...} — an empty basis reads as
// \varnothing, not `\left[\right]` — and eigenvects' (value, mult,
// vectors) triples as labeled blocks. Call-name spellings fold to the
// same words (\ker → Kernel).
function findStatementHeads(node: MathJson, found: Set<string>): void {
  if (!isArr(node)) return;
  const h = headOf(node);
  if (h && STATEMENT_HEADS.has(h))
    found.add(h === 'Def' ? 'Function' : h === 'Which' ? 'Piecewise' : h);
  if (h === 'call' && isStr(node[1]) && STATEMENT_CALL_HEADS.has(node[1]))
    found.add(node[1]);
  for (const child of node.slice(1)) findStatementHeads(child, found);
}

export interface CompileOptions extends NormalizeOptions {
  /** Emit `from sympy import *` and unqualified sympy names (default).
   * `false` emits `import sympy as sp` with `sp.` qualifiers. */
  importAll?: boolean;
  /** Calc-only: the full worksheet cells when `cells` is a prefix —
   * python defs below the edit point still resolve (with the
   * call-above-def note) instead of minting `sp.Function` stubs. */
  worksheetCells?: CellInput[];
}

// Compile the whole worksheet. `python` produces a runnable SymPy program;
// other targets return diagnostics (expression lowering lands later).
export function compileWorksheet(
  cells: CellInput[],
  target: string,
  opts: CompileOptions = {},
): CompileResult {
  const qualified = opts.importAll === false;
  const importLine = qualified
    ? 'import sympy as sp'
    : 'from sympy import *';
  // Python-cell defs (`def`/`lambda`, plus `\python{}` blocks in math
  // cells) register their call names so a math cell's `\mathrm{name}(x)`
  // — or a `# @latex`-annotated form — calls the real function.
  const pyRegistry = collectPyFns(cells);
  const pyNames = new Set(pyRegistry.fns.keys());
  const perCell = cells.map((c) =>
    normalizeIR(c.json, undefined, { ...opts, pyFns: pyNames }),
  );
  const issues: Issue[] = perCell.flatMap((r, i) =>
    r.issues.map((iss) => ({
      ...iss,
      message: `cell ${i + 1}: ${iss.message}`,
    })),
  );

  if (target !== 'python') {
    const gated = new Set<string>();
    for (const r of perCell)
      if (r.ir !== undefined) findStatementHeads(r.ir, gated);
    if (gated.size > 0) {
      const names = [...gated].join(', ');
      return {
        ok: false,
        program: '',
        importLine,
        cellLines: cells.map(() => []),
        cellIssues: perCell.map((r) => r.issues),
        normalized: perCell,
        issues: [
          ...issues,
          {
            severity: 'error',
            message: `statement-level construct${gated.size > 1 ? 's' : ''} (${names}) cannot target ${target}`,
          },
        ],
      };
    }
    return {
      ok: false,
      program: '',
      importLine,
      cellLines: cells.map(() => []),
      cellIssues: perCell.map((r) => r.issues),
      normalized: perCell,
      issues: [
        ...issues,
        {
          severity: 'note',
          message: `${target} codegen is not implemented yet — only Python/SymPy is`,
        },
      ],
    };
  }

  const declared = new Set<string>();
  const declaredFns = new Set<string>();
  for (const r of perCell)
    if (r.ir !== undefined) collectDeclared(r.ir, declared, declaredFns);

  // Each cell emits with fresh defined/symbols/functions state — cells
  // are independent, so a name used in a cell is always defined there.
  // matrixNames is likewise cell-scoped: `A` declared a matrix in cell 1
  // is a fresh Symbol in cell 2's program, so `\det(A)` there must flag
  // rather than emit `A.det()` on a Symbol (TypeError at exec).
  const genIssues: Issue[][] = cells.map(() => []);
  // Registry notes (unreachable builtin names, unresolved annotations)
  // belong to the python cell that raised them.
  for (const n of pyRegistry.notes) {
    genIssues[n.cell].push({ severity: n.severity, message: n.message });
    issues.push({
      severity: n.severity,
      message: `cell ${n.cell + 1}: ${n.message}`,
    });
  }
  const cellBodies = perCell.map((r, i) => {
    if (r.ir === undefined) return { lines: [] as string[], pySrc: [] as string[] };
    const matrixNames = new Set<string>();
    collectMatrices(r.ir, matrixNames);
    // `declaredFns` is worksheet-wide, but cells are independent
    // programs — a name def'd in cell 1 still gets its own
    // `f = sp.Function` decl when called in cell 2, and only an
    // Assign-rebind in THIS cell drops a pending Function decl.
    const cellDeclaredFns = new Set<string>();
    collectDeclared(r.ir, new Set(), cellDeclaredFns);
    const scope = new Scope(
      qualified,
      declared,
      cellDeclaredFns,
      matrixNames,
      issues,
      genIssues,
      i + 1,
      'python',
      pyRegistry.fns,
    );
    scope.cellIdx = i;
    const lines = cellStatements(r.ir, scope);
    // The standalone cell script inlines every python def it calls —
    // `relu(x)` emits the real call, so the script needs the source.
    const pySrc = [...scope.py.usedSrcs]
      .map((s) => pyRegistry.sources[s])
      .sort((a, b) => a.cell - b.cell)
      .map((s) => s.code);
    return { lines, pySrc };
  });
  const cellLines = cellBodies.map(({ lines, pySrc }) =>
    lines.length === 0 ? [] : [importLine, ...pySrc, ...lines],
  );

  // The one-script copy is the concatenation of the per-cell outputs
  // with the import emitted once at the top. Python cells' source emits
  // in place — the program stays sequential, so a call must sit below
  // its def (the registry notes flag it otherwise).
  const lines: string[] = [importLine];
  cellBodies.forEach(({ lines: stmts }, i) => {
    if (stmts.length === 0) return;
    lines.push('', `# cell ${i + 1}`, ...stmts);
  });

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    program: lines.join('\n'),
    importLine,
    cellLines,
    cellIssues: perCell.map((r, i) => [...r.issues, ...genIssues[i]]),
    normalized: perCell,
    issues,
  };
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

// Wrap an evaluated expression in the worker's result pipeline so the
// emitted program itself applies doit -> simplify -> degree-order —
// auditing the shown code explains the shown result.
const calcEval = (expr: string): string =>
  `clean_and_simplify(${expr})`;

// Compile one cell's normalized IR inside `scope`, which the caller may
// share with earlier cells — the scope's defined/symbols/functions/declared
// state then carries downward, and this cell emits decls only for names
// not already bound above. Also folds the cell's own declared names into
// the scope so later statements (and later cells) see them.
function compileCellInScope(
  ir: MathJson,
  issues: Issue[],
  scope: Scope,
): CalcCellProgram {
  scope.scanDecls(ir);
  scope.issues = issues;
  scope.errorCount = 0;
  const { defs, parts } = cellBody(ir, scope);
  // Statements dropped by an emission error carry it in place — the
  // error becomes their row so the cell keeps written order. The
  // "statement skipped" placeholder doesn't count as an error here:
  // the normalizer's diagnostic already reports the problem, so a
  // statement left with no code and no real error yields no row.
  let errorLine: number | undefined;
  const statementLines: number[] = [];
  const statements = parts
    .map(({ out, errs, line }) => {
      if (errs.length > 0 && errorLine === undefined) errorLine = line;
      return {
        out,
        line,
        error:
          errs
            .map((e) => e.message)
            .filter((m) => m !== UNPARSEABLE_MSG)
            .join('; ') || undefined,
      };
    })
    .filter(({ out, error, line }) => {
      if (out.lines.length === 0 && error === undefined) return false;
      // The surviving statements' part indices, in order — parallel to
      // `statements`, for placing issue rows between result rows.
      statementLines.push(line);
      return true;
    })
    .map(({ out, error, line }) => ({
      // The worker evals each statement as written, so the result
      // pipeline (doit -> simplify -> decreasing-degree order) is
      // emitted INTO the program — the generating-code block then shows exactly
      // the code that produced the row. The mc_* helpers are the
      // worker runtime in calculator.worker.ts.
      code:
        // Plot statements produce a sampled-data row, not a value —
        // clean_and_simplify would only add noise (and can't simplify
        // the marker dict anyway).
        out.plot
          ? out.lines.join('\n')
          : out.calcLines !== undefined
            ? out.calcLines.join('\n')
            : out.display === undefined && !out.silent && out.lines.length === 1
              ? calcEval(out.lines[0])
              : out.lines.join('\n'),
      display: out.display === undefined ? undefined : calcEval(out.display),
      defines: out.defines,
      silent: out.silent,
      error,
      // Line anchors only matter where an error points back at input.
      ...(error !== undefined ? { line } : {}),
    }));
  // Every issue's input line, from the statement that raised it — lets
  // unbound issues (notes like "no differential") anchor to their own
  // line instead of falling back to the cell top or the first error.
  const issueLine = new Map<Issue, number>();
  parts.forEach(({ emitted, line }) =>
    emitted.forEach((iss) => issueLine.set(iss, line)),
  );
  // Statement-bound errors are reported by their rows — drop them from
  // the program issue list so they aren't also appended at the end.
  const consumed = new Set(parts.flatMap(({ errs }) => errs));
  return {
    defs,
    statements,
    issues: issues
      .filter((i) => !consumed.has(i))
      // Normalize already stamps most issues with their line — only fill
      // in the ones it didn't reach (emit-time notes like differentials).
      .map((i) =>
        i.line === undefined && issueLine.has(i)
          ? { ...i, line: issueLine.get(i) }
          : i,
      ),
    errorLine,
    statementLines,
  };
}

// The calc program's import line — `import sympy as sp` qualified or
// `from sympy import *` under import-*. Exec'd into the worker's
// namespace; a star import is legal inside exec() at top level.
const calcImportLine = (qualified: boolean): string =>
  qualified ? 'import sympy as sp' : 'from sympy import *';

// The runtime helper source for a given import mode. It is written
// `sp.`-qualified; import-* mode strips the `sp.` prefixes so the
// emitted program stays self-contained (a star import binds every
// name the helper references bare).
const calcRuntimePy = (qualified: boolean): string =>
  qualified ? CALC_RUNTIME_PY : CALC_RUNTIME_PY.replace(/\bsp\./g, '');

// Compile every cell for the calculator target as ONE sequential
// program — the same pipeline as compileWorksheet — but the cells
// share a single emission scope: declared names, symbol/function
// defs, and assignment/dep-var tracking accumulate down the worksheet.
// A name bound in an earlier cell is in scope below — a `def g` in
// cell 2 puts `g` in cell 3's namespace instead of emitting a
// shadowing `sp.Function("g")` decl there — while names declared only
// in later cells stay invisible to the cells above them.
//
// `importAll` picks the import style like the python target: the
// worker execs the prelude itself, so `from sympy import *` populates
// the namespace with the bare names the statements then use (`sp`
// stays seeded for the helper and worker internals either way).
export function compileCellsForCalc(
  cells: CellInput[],
  opts: CompileOptions = {},
): CalcWorksheetProgram {
  const qualified = opts.importAll === false;
  // Python-cell defs register worksheet-wide so a call above its def
  // resolves (with the ordering note) instead of minting a stub.
  const pyRegistry = collectPyFns(opts.worksheetCells ?? cells);
  const pyNames = new Set(pyRegistry.fns.keys());
  const scope = new Scope(
    qualified,
    new Set<string>(),
    new Set<string>(),
    new Set<string>(),
    [],
    [],
    0,
    'calc',
    pyRegistry.fns,
  );
  return {
    // The CALC_RUNTIME_PY block defines the mc_* helpers the statements
    // call — it execs as part of the program (self-contained) and shows
    // once in the code block, like the import line. The helper source
    // is written `sp.`-qualified; the import-* mode strips the prefix
    // so the shown program stays self-contained under a star import.
    prelude: [calcImportLine(qualified), calcRuntimePy(qualified)],
    cells: cells.map((cell, i) => {
      scope.cellIdx = i;
      // The shared declaredFns set both seeds this cell's normalize
      // (a `g(4)` below a `\def g` is a call, not juxtaposition) and
      // collects the names this cell declares for the cells below it.
      const { ir, issues } = normalizeIR(cell.json, scope.decls.declaredFns, {
        ...opts,
        pyFns: pyNames,
      });
      // Registry notes on this cell (its own python defs) surface here.
      issues.push(
        ...pyRegistry.notes
          .filter((n) => n.cell === i)
          .map(({ severity, message }) => ({ severity, message }) as Issue),
      );
      if (ir === undefined)
        return { defs: [], statements: [], issues, statementLines: [] };
      return compileCellInScope(ir, issues, scope);
    }),
  };
}

// Compile a single cell for the calculator target — the standalone
// equivalent of compileCellsForCalc([cell]), with the cell's decls
// folded into the prelude (a self-contained program).
export function compileCellForCalc(
  cell: CellInput,
  opts: CompileOptions = {},
): CalcProgram {
  const qualified = opts.importAll === false;
  const pyRegistry = collectPyFns([cell]);
  const { ir, issues } = normalizeIR(cell.json, undefined, {
    ...opts,
    pyFns: new Set(pyRegistry.fns.keys()),
  });
  if (ir === undefined)
    return { prelude: [], statements: [], issues, statementLines: [] };
  const scope = new Scope(
    qualified,
    new Set<string>(),
    new Set<string>(),
    new Set<string>(),
    [],
    [],
    0,
    'calc',
    pyRegistry.fns,
  );
  scope.cellIdx = 0;
  const c = compileCellInScope(ir, issues, scope);
  return {
    prelude: [calcImportLine(qualified), calcRuntimePy(qualified), ...c.defs],
    ...c,
  };
}

// Compatibility exports used by the interim calculator.
export { firstFreeCapital,freeNames } from './codegen/analysis';
export { collectDeclared } from './codegen/declarations';
export { plotComponents,plotDomainBounds,type PlotBound } from './codegen/plotting';
