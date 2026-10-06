import { compileCellsForCalc } from '../compile/codegen';
import {
  latexToStatementStrings,
  normalizeIR,
  parseCellLatex,
  type Issue,
  type MathJson,
} from '../compile/ir';
import {
  interimConstNames,
  irToNerdamer,
  leaf,
} from './nerdamer-emit';
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

let nerdamerP: Promise<typeof import('nerdamer/all')> | undefined;

// Instant best-effort results while the SymPy engine boots: nerdamer
// evaluates the translated expression in ~ms, so dimmed answers show
// immediately — including calculus (integrate/defint/diff/sum/product/
// limit emitted by nerdamer-emit off the same normalized IR the real
// engine reads). One interim row per \\ row, matching the real engine's
// row-per-statement shape. Statements the IR emitter doesn't cover fall
// back to nerdamer's own latex reader (`leaf`); a statement that can't
// produce a real value produces no row. Dynamically imported so
// nerdamer's ~440KB never enters the main bundle.
export async function interimEvaluate(latex: string): Promise<CalcRow[]> {
  try {
    const nerdamer = (await (nerdamerP ??= import('nerdamer/all'))).default;
    // latexToStatementStrings tracks environment depth — a plain
    // /\\\\/ split would break every interim row for a cell holding a
    // matrix (its \\ row separators look like statement breaks).
    const stmts = latexToStatementStrings(latex);
    const norm = normalizeIR(parseCellLatex(latex));
    const nodes =
      norm.ir === undefined
        ? []
        : Array.isArray(norm.ir) && norm.ir[0] === 'Block'
          ? norm.ir.slice(1)
          : [norm.ir];
    // An error the normalizer already flagged poisons that row — the
    // real engine drops the statement, so a guessed interim would
    // mislead.
    const poisoned = new Set(
      norm.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.line ?? 0),
    );
    const takeConst = interimConstNames(norm.ir);
    return nodes
      .map((node, i): CalcRow | null => {
        if (poisoned.has(i)) return null;
        try {
          const input = irToNerdamer(node, takeConst) ?? leaf(stmts[i] ?? '', nerdamer);
          if (input === '') return null;
          const tex = arcTrigNames(
            // MathQuill doesn't need \limits — bounds render under/over
            // anyway. nerdamer writes inverse trig as \mathrm{atan},
            // which MathQuill renders "a tan"; arcTrigNames maps to arc-.
            nerdamer(input)
              .toTeX()
              .replaceAll('\\limits', ''),
          );
          return tex === '' ? null : ({ ok: true as const, latex: tex });
        } catch {
          // A statement nerdamer can't read (an environment, a CE-only
          // command) shouldn't sink the other rows' interim results.
          return null;
        }
      })
      .filter((r): r is CalcRow => r !== null);
  } catch {
    return [];
  }
}
