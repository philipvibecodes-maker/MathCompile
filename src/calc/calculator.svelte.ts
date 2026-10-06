import { ComputeEngine } from '@cortex-js/compute-engine';
import { compileCellsForCalc } from '../compile/codegen';
import {
  parseCellLatex,
  type Issue,
  type MathJson,
} from '../compile/ir';
import { arcTrigNames } from './result-latex';

export interface CalcRowOk {
  ok: true;
  latex?: string;
  text?: string;
  approx?: string;
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
  // with the `e = ...` display-plumbing capture lines inlined.
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
): Promise<CalcResult> {
  let prog: ReturnType<typeof compileCellsForCalc>;
  try {
    prog = compileCellsForCalc(cells);
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
  // The emitted program as one block — prelude, then each cell's decls
  // and statements in worksheet order (# cell markers only when the
  // result ran in real context). The plumbing variant swaps expression
  // statements for their `e = ...` capture lines and adds
  // `e = <display>` after assignments/defs, mirroring the worker's
  // exec/eval split.
  const okStmts = (c: (typeof prog.cells)[number]) =>
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
        s.display === undefined
          ? [`e = ${s.code}`]
          : [s.code, `e = ${s.display}`],
      ),
    ]),
  ].join('\n');
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

// Kicks the engine boot (~4s cold) before an expression is actually
// evaluated — the Output dropdown's pointerdown/focus hooks call this
// so the wasm+wheels download overlaps the user's menu interaction.
// The worker starts booting on spawn, so just creating it is enough.
export function prewarm(): void {
  ensureWorker();
}

let interimCE: ComputeEngine | undefined;

const isArr = (v: MathJson | undefined): v is MathJson[] => Array.isArray(v);
const headOf = (v: MathJson | undefined): string | undefined =>
  isArr(v) && typeof v[0] === 'string' ? v[0] : undefined;

// Heads the interim can't evaluate honestly — boxing them produces
// \mathrm{<head>}(…) junk latex. Per the silent-empty convention they
// stay dimmed until SymPy lands, like unreadable statements did before.
const SKIP_HEADS = new Set(['Error', 'call', 'Declare', 'Def', 'IntegerRange']);
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
    .replaceAll('\\rparen', ')');

// Constant-of-integration naming, mirroring codegen's nextConstName:
// first capital absent from the cell's latex — C, else D, E, …
const constAllocator = (latex: string): (() => string) => {
  const used = new Set(latex.match(/[A-Z]/g) ?? []);
  return () => {
    const letter =
      'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((c) => !used.has(c)) ?? 'C';
    used.add(letter);
    return letter;
  };
};

// Wrap every boundless Integrate in Add(…, letter) so the interim shows
// the same constants codegen emits. Raw shape ['Integrate', body, 'v']
// is indefinite (a Tuple/Limits var slot marks the definite form), and
// nesting handles iterated integrals like codegen's per-level +C
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

// Free symbol names in a subtree — bare string leaves (quoted 'text'
// literals don't count). Bound vars inside nested operator specs get
// collected too, which over-counts and skips the inference — the
// conservative direction for an estimate.
const freeNames = (n: MathJson, into = new Set<string>()): Set<string> => {
  if (typeof n === 'string' && !n.startsWith("'")) into.add(n);
  else if (isArr(n)) n.slice(1).forEach((k) => freeNames(k, into));
  return into;
};

// CE leaves a 'Nothing' in the var slot when no differential was written
// (`\int_0^1 x` → Tuple(Nothing, 0, 1)) — fill it from the body's single
// free name the way codegen's variable inference does. A 'Nothing' or
// missing bound is a real error on the engine, so the interim poisons
// the statement instead of guessing (null propagates up).
const repairBounds = (n: MathJson): MathJson | null => {
  if (!isArr(n)) return n;
  const h = headOf(n);
  if ((h === 'Integrate' || h === 'Sum' || h === 'Product') && n.length === 3) {
    const body = repairBounds(n[1]);
    if (body === null) return null;
    const spec = n[2];
    const inferVar = (): MathJson | null => {
      const free = [...freeNames(n[1])];
      return free.length === 1 ? free[0] : null;
    };
    if (isArr(spec) && (headOf(spec) === 'Tuple' || headOf(spec) === 'Limits')) {
      if (spec.length !== 4 || spec.slice(2).includes('Nothing')) return null;
      const v = spec[1] === 'Nothing' ? inferVar() : spec[1];
      return v === null ? null : [h, body, [spec[0], v, spec[2], spec[3]]];
    }
    if (spec === 'Nothing') {
      const v = inferVar();
      return v === null ? null : [h, body, v];
    }
    return [h, body, spec];
  }
  const kids = n.slice(1).map(repairBounds);
  return kids.includes(null) ? null : [n[0], ...(kids as MathJson[])];
};

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
  // `x² where x>0` parks its condition first — evaluate the body (last).
  const target =
    h === 'WhereBlock' && isArr(repaired)
      ? repaired[repaired.length - 1]
      : repaired;
  // A second evaluate() resolves integrals nested inside an outer one —
  // CE's first pass only evaluates the outermost sign.
  const latex = cleanLatex(
    ce
      .box(addConstants(target, nextConst) as never)
      .evaluate()
      .evaluate().latex,
  );
  return latex === '' || /Nothing|Error/.test(latex)
    ? null
    : { ok: true as const, latex };
};

// Instant best-effort results while the SymPy engine boots: the same
// Compute Engine parse the compiler feeds on, evaluated in a pushed
// scope — one interim row per \\ row, matching the real engine's
// row-per-statement shape. ~ms per cell and no lazy chunk — CE is
// already in the main bundle for the compiler.
export async function interimEvaluate(latex: string): Promise<CalcRow[]> {
  try {
    const json = parseCellLatex(latex);
    if (json === undefined) return [];
    const statements =
      isArr(json) && headOf(json) === 'Block' ? json.slice(1) : [json];
    const engine = (interimCE ??= new ComputeEngine());
    const nextConst = constAllocator(latex);
    // A pushed scope contains each `name = rhs` binding — a row below
    // sees it (a = 5 \\ a+1 → 6), but nothing leaks into other cells
    // or later evals.
    engine.pushScope();
    try {
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
    } finally {
      engine.popScope();
    }
  } catch {
    return [];
  }
}
