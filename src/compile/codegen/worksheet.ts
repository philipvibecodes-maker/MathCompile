import { cellStatements, compileCellInScope } from './cells';
import { collectDeclared } from './declarations';
import { STATEMENT_CALL_HEADS, STATEMENT_HEADS } from './heads';
import { headOf, isArr, isStr } from './nodes';
import { Scope } from './scope';
import type {
  CalcProgram,
  CalcWorksheetProgram,
  CellInput,
  CompileOptions,
  CompileResult,
} from './types';
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

import { CALC_RUNTIME_PY } from '../calc-runtime';
import type { Issue, MathJson } from '../ir';
import { normalizeIR } from '../ir';
import { collectPyFns } from '../pydefs';
// The name tables below are derived views over the notation registry —
// each name lives once in src/compile/notation.ts.

function findStatementHeads(node: MathJson, found: Set<string>): void {
  if (!isArr(node)) return;
  const h = headOf(node);
  if (h && STATEMENT_HEADS.has(h))
    found.add(h === 'Def' ? 'Function' : h === 'Which' ? 'Piecewise' : h);
  if (h === 'call' && isStr(node[1]) && STATEMENT_CALL_HEADS.has(node[1]))
    found.add(node[1]);
  for (const child of node.slice(1)) findStatementHeads(child, found);
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
  // Advisory definition history spans the worksheet, while each exported
  // cell still gets independent execution/type/name-allocation state.
  const definitions = new Set<string>();
  const cellBodies = perCell.map((r, i) => {
    if (r.ir === undefined) return { lines: [] as string[], pySrc: [] as string[] };
    const matrixNames = new Set<string>();
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
      definitions,
    );
    scope.beginCell(i, issues);
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

// Wrap an evaluated expression in the worker's result pipeline so the
// emitted program itself applies doit -> simplify -> degree-order —
// auditing the shown code explains the shown result.
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
      return compileCellInScope(ir, issues, scope, i);
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
  const c = compileCellInScope(ir, issues, scope, 0);
  return {
    prelude: [calcImportLine(qualified), calcRuntimePy(qualified), ...c.defs],
    ...c,
  };
}
