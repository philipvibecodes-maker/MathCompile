import { ComputeEngine } from '@cortex-js/compute-engine';
import {
  collectDeclared,
  compileCellsForCalc,
  firstFreeCapital,
  freeNames,
  type CalcWorksheetProgram,
  type CompileOptions,
} from '../compile/codegen';
import {
  isDiffMark,
  normalizeIR,
  parseCellLatex,
  type Issue,
  type MathJson,
  type NormalizeOptions,
} from '../compile/ir';
import { arcTrigNames } from './result-latex';
import type { PlotData } from '../plot/types';

export interface CalcRowOk {
  ok: true;
  latex?: string;
  text?: string;
  approx?: string;
  /** A `\text{plot}` statement's sampled payload — the row renders an
   * interactive figure instead of a math result. */
  plot?: PlotData;
}
export interface CalcRowErr {
  ok: false;
  error: string;
  /** 'error' (default) for a failed statement; 'note' for compiler
   * advisories that didn't stop anything — the row's issue panel styles
   * them like the python target's overlay does. */
  severity?: 'error' | 'note';
  /** 0-based input line the error came from — where a line-anchored
   * indicator would pin. Undefined = not line-bound. */
  line?: number;
}
export type CalcRow = CalcRowOk | CalcRowErr;

export interface CalcResult {
  rows: CalcRow[];
  // The emitted program for the whole cell (prelude + statement code)
  // — shown by the per-cell code block. displayCode is the same program
  // with the `e = ...` display-plumbing capture lines inlined for
  // expression statements (a definition's display just echoes the
  // statement, so it never gets a capture line).
  code?: string;
  displayCode?: string;
}

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

// Engine status is shared UI state (the CalcOutput components read it for
// their loading labels), so it lives in a rune like the app store.
export const calcEngine = $state<{
  status: EngineStatus;
  error: string;
}>({
  status: 'idle',
  error: '',
});

// Issues per cell, published by CalcOutput as evaluation lands — the
// input column's CalcIssues renders the messages under the field.
export const cellIssues = $state<
  Record<number, (Issue & { line?: number })[]>
>({});

interface WorkerReply {
  type?: 'ready' | 'init-error';
  id: number;
  ok: boolean;
  rows?: CalcRow[];
  error?: string;
}

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (rows: CalcRow[]) => void; reject: (e: Error) => void }
>();

function failAll(message: string) {
  for (const p of pending.values()) p.reject(new Error(message));
  pending.clear();
}

function ensureWorker(): Worker {
  if (worker) return worker;
  calcEngine.status = 'loading';
  calcEngine.error = '';
  const w = new Worker(new URL('./calculator.worker.ts', import.meta.url), {
    type: 'classic',
  });
  // The worker can't read import.meta.env (classic worker), so the
  // base public assets are served under comes from the page.
  w.postMessage({ type: 'init', snapshotBase: import.meta.env.BASE_URL });
  w.onmessage = (e: MessageEvent<WorkerReply>) => {
    const m = e.data;
    if (m.type === 'ready') {
      calcEngine.status = 'ready';
      return;
    }
    if (m.type === 'init-error') {
      calcEngine.status = 'error';
      calcEngine.error = m.error ?? 'failed to load the SymPy engine';
      failAll(calcEngine.error);
      // The engineless worker is dead weight — drop it so the next eval
      // retries the boot instead of stalling on the 30s watchdog.
      if (worker === w) worker = undefined;
      w.terminate();
      return;
    }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) {
      // Debug: echo the eval error when a row failed.
      for (const r of m.rows ?? []) {
        if (!r.ok) console.log('[calc] error:', r.error);
      }
      // arcTrigNames is a safety net over the worker's inv_trig_style
      // — anything still emitting \operatorname{atan}-style a- names
      // (user-defined functions, sympy paths outside _mc_row) renders
      // as "a tan" in MathQuill without it.
      p.resolve(
        (m.rows ?? []).map((r) =>
          r.ok && r.latex ? { ...r, latex: arcTrigNames(r.latex) } : r,
        ),
      );
    } else {
      console.log('[calc] error:', m.error ?? 'evaluation failed');
      p.reject(new Error(m.error ?? 'evaluation failed'));
    }
  };
  w.onerror = (e) => {
    calcEngine.status = 'error';
    calcEngine.error = e.message || 'calculator worker failed';
    failAll(calcEngine.error);
    if (worker === w) worker = undefined;
    w.terminate();
  };
  worker = w;
  return w;
}

// Evaluates a cell through SymPy in the context of the cells above it:
// `cells` is the worksheet prefix ending at the requesting cell. The
// shared codegen pipeline compiles them into one sequential program
// (names bound earlier stay bound — a `def` in an earlier cell is
// visible below), then the worker runs it. Cells the compiler already
// rejects surface as error rows without a worker round-trip.
export function evaluate(
  cells: { latex: string; json?: MathJson }[],
  opts: CompileOptions = {},
): Promise<CalcResult> {
  let prog: ReturnType<typeof compileCellsForCalc>;
  try {
    prog = compileCellsForCalc(cells, opts);
  } catch (e) {
    // The compiler reports issues instead of throwing — a hard throw
    // must still not leave the cell stuck on '…' forever.
    return Promise.resolve({
      rows: [
        {
          ok: false as const,
          error: `compile failed — ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
    });
  }
  const last = prog.cells[prog.cells.length - 1];
  // Issues not bound to a statement (errors plus advisory notes, like
  // the python overlay's list) become error rows interleaved by line.
  const issueRows = last.issues.map(
    (i) =>
      ({
        ok: false as const,
        error: i.message,
        severity: i.severity,
        // Issues anchor at the line that raised them; anything still
        // unbound falls back to the first failed statement's line.
        line: i.line ?? last.errorLine,
      }) as CalcRowErr,
  );
  if (last.statements.length === 0)
    // Uncompileable cells show their issues; a cell with none at all
    // (empty, or only notes) shows nothing.
    return Promise.resolve({ rows: issueRows });
  const { code, displayCode } = shownPrograms(prog);
  // A multi-statement cell keeps its good rows when a sibling statement
  // is broken — and issue rows interleave at their own input line, not
  // at the bottom of the output.
  const w = ensureWorker();
  const id = nextId++;
  return new Promise<CalcResult>((resolve, reject) => {
    pending.set(id, {
      resolve: (r) => {
        clearTimeout(timer);
        const merged = [
          ...r.map((row, i) => ({ row, line: last.statementLines[i] })),
          ...issueRows.map((row) => ({ row, line: row.line })),
        ]
          .sort(
            (a, b) =>
              (a.line ?? Number.MAX_SAFE_INTEGER) -
              (b.line ?? Number.MAX_SAFE_INTEGER),
          )
          .map(({ row, line }) =>
            row.ok || line === undefined ? row : { ...row, line },
          );
        resolve({ rows: merged, code, displayCode });
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    // A hung SymPy call (pathological simplify/integrate) would block
    // every cell's results forever — the worker is single-threaded.
    // Past the deadline, kill it; the next eval reboots (~4s).
    const armWatchdog = () =>
      setTimeout(() => {
        if (!pending.has(id)) return;
        // A still-booting worker hasn't started this eval — killing it
        // mid-download would just restart the boot on the next eval, so
        // on a slow connection the engine never finishes loading.
        // Re-check instead; the deadline effectively counts from ready.
        if (calcEngine.status === 'loading') {
          timer = armWatchdog();
          return;
        }
        w.terminate();
        worker = undefined;
        calcEngine.status = 'idle';
        failAll('calculation timed out — the SymPy engine is restarting');
      }, 30000);
    let timer = armWatchdog();
    w.postMessage({
      id,
      program: {
        prelude: prog.prelude,
        cells: prog.cells.map((c) => ({
          // Content key for the worker's snapshot chain — the first
          // cell whose program differs is where eval rewinds to.
          key: JSON.stringify({ defs: c.defs, statements: c.statements }),
          defs: c.defs,
          statements: c.statements,
        })),
      },
    });
  });
}

// The emitted program as one block — prelude, then each cell's decls
// and statements in worksheet order (# cell markers only when more
// than one cell contributed). The plumbing variant swaps expression
// statements for their `e = ...` capture lines, mirroring the worker's
// exec/eval split; a definition's display echoes the statement itself,
// so its capture line is dropped even in the plumbing view.
export function shownPrograms(prog: CalcWorksheetProgram): {
  code: string;
  displayCode: string;
} {
  const okStmts = (c: CalcWorksheetProgram['cells'][number]) =>
    c.statements.filter((s) => s.error === undefined && s.code !== '');
  const marker = (i: number) => (prog.cells.length > 1 ? [`# cell ${i + 1}`] : []);
  const code = [
    ...prog.prelude,
    ...prog.cells.flatMap((c, i) => [
      ...marker(i),
      ...c.defs,
      ...okStmts(c).map((s) => s.code),
    ]),
  ].join('\n');
  const displayCode = [
    ...prog.prelude,
    ...prog.cells.flatMap((c, i) => [
      ...marker(i),
      ...c.defs,
      ...okStmts(c).flatMap((s) =>
        s.display === undefined || s.defines
          ? s.display === undefined
            ? [`e = ${s.code}`]
            : [s.code]
          : [s.code, `e = ${s.display}`],
      ),
    ]),
  ].join('\n');
  return { code, displayCode };
}

// Kicks the engine boot (~4s cold) before an expression is actually
// evaluated — the Output dropdown's pointerdown/focus hooks call this
// so the wasm+wheels download overlaps the user's menu interaction.
// The worker starts booting on spawn, so just creating it is enough.
export function prewarm(): void {
  ensureWorker();
}

const isArr = (v: MathJson | undefined): v is MathJson[] => Array.isArray(v);
const headOf = (v: MathJson | undefined): string | undefined =>
  isArr(v) && typeof v[0] === 'string' ? v[0] : undefined;

// Heads the interim can't evaluate honestly — boxing them produces
// \mathrm{<head>}(…) junk latex. Per the silent-empty convention they
// stay dimmed until SymPy lands, like unreadable statements did before.
const SKIP_HEADS = new Set([
  'Error',
  'call',
  'Apply',
  'Declare',
  'Def',
  'IntegerRange',
  // \min_{x}/\max_{x} bound-extrema heads — CE can't evaluate them and
  // would echo a \mathrm{Minimum}(body, var) guess.
  'Minimum',
  'Maximum',
  // \D total derivative / \nabla gradient — no interim beats a wrong
  // one; the SymPy result lands when the worker is ready.
  'TotalD',
  'Gradient',
  // \python{...} cells parse to PythonSource — boxing it echoes
  // PythonSource(...) junk.
  'PythonSource',
  // \text{plot} statements are engine-side sampling, not evaluation —
  // boxing them would echo Plot(...) junk.
  'Plot',
]);
const hasHead = (n: MathJson): boolean =>
  isArr(n) && (SKIP_HEADS.has(headOf(n) ?? '') || n.slice(1).some(hasHead));
// \text{def} markers surface as the quoted 'def' string in the raw IR.
const hasDef = (n: MathJson): boolean =>
  n === "'def'" || (isArr(n) && n.some(hasDef));

// CE's serializer emits names MathQuill doesn't know (they'd render as
// italic letters) — map them to the plain forms.
const cleanLatex = (s: string): string =>
  s
    .replaceAll('\\exponentialE', 'e')
    .replaceAll('\\imaginaryI', 'i')
    .replaceAll('\\lparen', '(')
    .replaceAll('\\rparen', ')')
    .replaceAll('\\lvert', '|')
    .replaceAll('\\rvert', '|')
    .replaceAll('\\vert', '|')
    .replaceAll('\\lVert', '\\|')
    .replaceAll('\\rVert', '\\|')
    .replaceAll('\\Vert', '\\|');

// Constant-of-integration naming, mirroring codegen's nextConstName:
// first capital absent from the used-name set — C, else D, E, … — via
// codegen's shared firstFreeCapital. `used` is seeded by the caller with
// the names bound above the cell plus every name token inside it (the
// same reservation codegen's constNames seeding makes), so a `C = …`
// elsewhere can't collide. The allocation order across cells is still
// cell-local — an estimate edge.
const takeConstFrom = (used: Set<string>): (() => string) =>
  () => firstFreeCapital(used);

// Wrap every boundless Integrate in Add(…, letter) so the interim shows
// the same constants codegen emits. Raw shape ['Integrate', body, 'v']
// is indefinite (a Limits var slot marks the definite form), and nesting
// handles iterated integrals like codegen's per-level +C
// (∬x dxdy → x²y/2 + C·y + D, not … + C).
const addConstants = (n: MathJson, next: () => string): MathJson => {
  if (!isArr(n)) return n;
  const kids = n.slice(1).map((k) => addConstants(k, next));
  if (
    headOf(n) === 'Integrate' &&
    kids.length === 2 &&
    typeof kids[1] === 'string'
  )
    return ['Add', [n[0], ...kids], next()];
  return [n[0], ...kids];
};

// `\int x^2\text{d}x` — CE leaves an upright `\text{d}` differential
// as a `d·x` factor pair inside the integrand instead of marking the
// var slot: flat (`Multiply(x², d, x)`) or nested in the last factor's
// args (`x\sin x\,dx` → `Sin(Multiply(x, d, x))`). Peel pairs wherever
// they sit — the same peel codegen's integral emitter does before
// emitting sp.integrate — and let the names fill the var slot.
const peelDiffs = (node: MathJson): { node: MathJson; names: string[] } => {
  const stripTail = (
    factors: MathJson[],
  ): { factors: MathJson[]; names: string[] } => {
    const out = [...factors];
    const names: string[] = [];
    while (
      out.length >= 2 &&
      isDiffMark(out[out.length - 2]) &&
      typeof out[out.length - 1] === 'string'
    ) {
      names.unshift(out.pop() as string);
      out.pop();
    }
    return { factors: out, names };
  };
  const walk = (n: MathJson): { node: MathJson; names: string[] } => {
    if (isArr(n) && (headOf(n) === 'Multiply' || headOf(n) === 'InvisibleOperator')) {
      const r = stripTail(n.slice(1));
      if (r.names.length > 0)
        return r.factors.length === 1
          ? { node: r.factors[0], names: r.names }
          : r.factors.length > 1
            ? { node: ['Multiply', ...r.factors] as MathJson, names: r.names }
            : { node: n, names: [] };
      const last = r.factors[r.factors.length - 1];
      const inner = walk(last);
      if (inner.names.length > 0) {
        const factors = [...r.factors];
        factors[factors.length - 1] = inner.node;
        return { node: ['Multiply', ...factors] as MathJson, names: inner.names };
      }
      return { node: n, names: [] };
    }
    if (isArr(n) && n.length >= 2)
      for (let i = n.length - 1; i >= 1; i--) {
        const inner = walk(n[i]);
        if (inner.names.length > 0) {
          const out = [...n];
          out[i] = inner.node;
          return { node: out as MathJson, names: inner.names };
        }
      }
    return { node: n, names: [] };
  };
  return walk(node);
};

// Normalized bounds shape: ['Limits', v, lo, hi] with 'Nothing' slots.
// 'Nothing' in the var slot means no differential was written — infer
// the var from the peeled differentials first, then from the body's
// single free name (codegen's freeNames, which skips constants like Pi).
// Both bounds 'Nothing' = indefinite; a lone 'Nothing' bound is a real
// error on the engine, so the interim poisons (null propagates up).
// Extra peeled names are iterated-integral variables — codegen emits
// sp.integrate(body, v, y, …), mirrored here as nested Integrates.
const repairBounds = (n: MathJson): MathJson | null => {
  if (!isArr(n)) return n;
  const h = headOf(n);
  if ((h === 'Integrate' || h === 'Sum' || h === 'Product') && n.length === 3) {
    let body = repairBounds(n[1]);
    if (body === null) return null;
    const spec = n[2];
    const peeled = peelDiffs(body);
    // A `dv` pair under a sum/product is a real-engine error
    // ("did you mean \int") — poison instead of guessing.
    if (h !== 'Integrate' && peeled.names.length > 0) return null;
    body = peeled.node;
    const infer = (): MathJson | null => {
      const free = freeNames(body);
      return free.length === 1 ? free[0] : null;
    };
    // vars in innermost-first order → nested op nodes
    const nest = (vars: MathJson[], slot: (v: MathJson) => MathJson) => {
      let cur: MathJson = [h, body, slot(vars[0])];
      for (const e of vars.slice(1)) cur = [h, cur, slot(e)];
      return cur;
    };
    if (spec === 'Nothing') {
      const names = [...peeled.names];
      const v = names.shift() ?? infer();
      return v === null ? null : nest([v, ...names], (x) => x);
    }
    if (isArr(spec) && (headOf(spec) === 'Limits' || headOf(spec) === 'Tuple')) {
      const [, sv, lo, hi] = spec;
      const loN = lo === 'Nothing';
      const hiN = hi === 'Nothing';
      if (loN !== hiN) return null;
      const names =
        sv === 'Nothing' ? [...peeled.names] : peeled.names.filter((nm) => nm !== sv);
      const v = sv === 'Nothing' ? (names.shift() ?? infer()) : sv;
      if (typeof v !== 'string') return null;
      const slot = (x: MathJson): MathJson => (loN ? x : ['Limits', x, lo, hi]);
      return nest([v, ...names], slot);
    }
    return [h, body, spec];
  }
  const kids = n.slice(1).map(repairBounds);
  return kids.includes(null) ? null : [n[0], ...(kids as MathJson[])];
};

// The relation heads cellBody recognizes inside a `\text{where}` block —
// a condition run followed by the body.
const RELATION_HEADS = new Set([
  'Equal',
  'NotEqual',
  'Less',
  'LessEqual',
  'Greater',
  'GreaterEqual',
  'NotLess',
  'NotGreater',
  'NotLessEqual',
  'NotGreaterEqual',
  'Element',
  'NotElement',
  'Subset',
  'SubsetEqual',
  'Superset',
  'SupersetEqual',
  'IdenticallyEqual',
  'Congruent',
]);
const isRelation = (n: MathJson): boolean => RELATION_HEADS.has(headOf(n) ?? '');

const evalStatement = (
  stmt: MathJson,
  ce: ComputeEngine,
  nextConst: () => string,
): CalcRow | null => {
  if (hasDef(stmt) || hasHead(stmt)) return null;
  const repaired = repairBounds(stmt);
  if (repaired === null) return null;
  const h = headOf(repaired);
  // `name = rhs` binds in this worksheet — evaluate the Assign so the
  // name resolves in the rows below, and show `name = value` like the
  // real engine's Eq display. Non-name lhs (x+1 = 2, (x,y) = …) falls
  // through to plain evaluation.
  if (
    isArr(repaired) &&
    (h === 'Assign' || h === 'Equal') &&
    repaired.length === 3 &&
    typeof repaired[1] === 'string'
  ) {
    const val = ce
      .box(['Assign', repaired[1], addConstants(repaired[2], nextConst)] as never)
      .evaluate()
      .evaluate();
    const latex = cleanLatex(`${repaired[1]}=${val.latex}`);
    return latex === `${repaired[1]}=` ? null : { ok: true as const, latex };
  }
  // A second evaluate() resolves integrals nested inside an outer one —
  // CE's first pass only evaluates the outermost sign.
  const latex = cleanLatex(
    ce
      .box(addConstants(repaired, nextConst) as never)
      .evaluate()
      .evaluate().latex,
  );
  return latex === '' || /Nothing|Error/.test(latex)
    ? null
    : { ok: true as const, latex };
};

// Instant best-effort results while the SymPy engine boots: the same
// parse + normalize the compiler feeds on (`parseCellLatex` →
// `normalizeIR` — chained Equal flattens, `name = rhs` becomes Assign,
// \text{def} becomes a Def head), evaluated in a pushed scope — one
// interim row per statement row the real engine emits, matching its
// row-per-statement shape. ~ms per cell and no lazy chunk — CE is
// already in the main bundle for the compiler.
export async function interimEvaluate(
  latex: string,
  priorLatex: string[] = [],
  opts: NormalizeOptions = {},
): Promise<CalcRow[]> {
  try {
    const ir = normalizeIR(parseCellLatex(latex), undefined, opts).ir;
    if (ir === undefined) return [];
    const block = isArr(ir) && headOf(ir) === 'Block' ? ir.slice(1) : [ir];
    // Expand statement groups the way cellBody does: a `\text{where}`
    // block arrives condition-first — emit the body row before its
    // conditions; a nested Block (chain-assign x := y := 5) lists its
    // statements in order.
    const statements = block.flatMap((n): MathJson[] => {
      if (!isArr(n)) return [n];
      const h = headOf(n);
      if (h === 'Block') return n.slice(1);
      if (h !== 'WhereBlock') return [n];
      const kids = n.slice(1);
      return kids.length > 1 &&
        kids.slice(0, -1).every(isRelation) &&
        !isRelation(kids[kids.length - 1])
        ? [kids[kids.length - 1], ...kids.slice(0, -1)]
        : kids;
    });
    // The real engine shares one namespace down the worksheet, so a
    // `C = …` above reserves the letter for constants of integration —
    // seed from the same declared-name set, plus every name token in
    // this cell (heads included — the reservation allNames makes for
    // codegen) so `+ C` never collides.
    const used = new Set<string>();
    const declaredFns = new Set<string>();
    for (const l of priorLatex) {
      const n = normalizeIR(parseCellLatex(l), undefined, opts);
      if (n.ir !== undefined) collectDeclared(n.ir, used, declaredFns);
    }
    const reserve = (n: MathJson | undefined): void => {
      if (typeof n === 'string') used.add(n);
      else if (isArr(n)) for (const c of n) reserve(c);
    };
    reserve(ir);
    // Fresh engine per call — CE `Assign` bindings survive popScope on
    // a shared engine (verified: pushScope → Assign → popScope still
    // evaluates the name), so a reused singleton would leak `name = rhs`
    // rows into every other cell's interim.
    const engine = new ComputeEngine();
    const nextConst = takeConstFrom(used);
    // `name = rhs` binds inside the per-call engine — a row below sees
    // it (a = 5 \\ a+1 → 6) and nothing leaks into other cells or
    // later evals.
    return statements
      .map((s): CalcRow | null => {
        try {
          return evalStatement(s, engine, nextConst);
        } catch {
          // A statement CE can't read shouldn't sink the other rows.
          return null;
        }
      })
      .filter((r): r is CalcRow => r !== null);
  } catch {
    return [];
  }
}
