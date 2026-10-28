import type { Issue, MathJson } from '../ir';
import { CE_DISPLAY_NAMES } from '../notation';
import { Emitter } from './emitter';
import { UNPARSEABLE_MSG } from './heads';
import { headOf, isArr, isHead, isStr } from './nodes';
import { Scope } from './scope';
import { emitStatement } from './statements';
import type { CalcCellProgram, StatementOut } from './types';

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

export function cellStatements(ir: MathJson | undefined, scope: Scope): string[] {
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

const calcEval = (expr: string): string =>
  `clean_and_simplify(${expr})`;

// Compile one cell's normalized IR inside `scope`, which the caller may
// share with earlier cells — the scope's defined/symbols/functions/declared
// state then carries downward, and this cell emits decls only for names
// not already bound above. Also folds the cell's own declared names into
// the scope so later statements (and later cells) see them.
export function compileCellInScope(
  ir: MathJson,
  issues: Issue[],
  scope: Scope,
  cellIndex: number,
): CalcCellProgram {
  scope.beginCell(cellIndex, issues);
  scope.scanDecls(ir);
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
