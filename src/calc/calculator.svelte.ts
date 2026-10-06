import { compileCellForCalc } from '../compile/codegen';
import {
  latexToStatementStrings,
  type Issue,
  type MathJson,
} from '../compile/ir';
import { toNerdamerInput } from './nerdamer-latex';
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

// Evaluates a cell through SymPy: the shared codegen pipeline compiles
// the cell's parsed IR into a standalone program (prelude + one
// statement per \\ row), then the worker runs it. Cells the compiler
// already rejects surface as error rows without a worker round-trip.
// `otherPyLines`: the worksheet's OTHER cells' `\py{...}` sources,
// exec'd in this cell's prelude so their bindings resolve worksheet-
// wide (a cell's own \py statements stay inline).
export function evaluate(
  cell: {
    latex: string;
    json?: MathJson;
  },
  otherPyLines: string[] = [],
  extraCodeNames?: ReadonlySet<string>,
): Promise<CalcResult> {
  let prog: ReturnType<typeof compileCellForCalc>;
  try {
    prog = compileCellForCalc(cell, otherPyLines, extraCodeNames);
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
  // Issues not bound to a statement (errors plus advisory notes, like
  // the python overlay's list) become error rows interleaved by line.
  const issueRows = prog.issues.map(
    (i) =>
      ({
        ok: false as const,
        error: i.message,
        severity: i.severity,
        // Issues anchor at the line that raised them; anything still
        // unbound falls back to the first failed statement's line.
        line: i.line ?? prog.errorLine,
      }) as CalcRowErr,
  );
  if (prog.statements.length === 0)
    // Uncompileable cells show their issues; a cell with none at all
    // (empty, or only notes) shows nothing.
    return Promise.resolve({ rows: issueRows });
  // The emitted program as one block — prelude plus each compilable
  // statement. The plumbing variant swaps expression statements for
  // their `e = ...` capture lines and adds `e = <display>` after
  // assignments/defs, mirroring the worker's exec/eval split.
  const okStmts = prog.statements.filter(
    (s) => s.error === undefined && s.code !== '',
  );
  const code = [
    ...prog.prelude,
    ...okStmts.map((s) => s.code),
  ].join('\n');
  const displayCode = [
    ...prog.prelude,
    ...okStmts.flatMap((s) =>
      s.display === undefined
        ? [`e = ${s.code}`]
        : [s.code, `e = ${s.display}`],
    ),
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
          ...r.map((row, i) => ({ row, line: prog.statementLines[i] })),
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
      program: { prelude: prog.prelude, statements: prog.statements },
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
// evaluates the translated latex in ~ms, so dimmed answers show
// immediately — including calculus (integrate/defint/diff/sum/product/
// limit via the nerdamer-latex translator). One interim row per \\ row,
// matching the real engine's row-per-statement shape. Commands that
// don't translate stay empty until the real engine lands. Dynamically
// imported so its ~440KB never enters the main bundle.
export async function interimEvaluate(latex: string): Promise<CalcRow[]> {
  try {
    const nerdamer = (await (nerdamerP ??= import('nerdamer/all'))).default;
    // latexToStatementStrings tracks environment depth — a plain
    // /\\\\/ split would break every interim row for a cell holding a
    // matrix (its \\ row separators look like statement breaks).
    return latexToStatementStrings(latex)
      .map((p): CalcRow | null => {
        try {
          const input = toNerdamerInput(p, nerdamer);
          if (input === '') return null;
          const tex = arcTrigNames(
            // MathQuill doesn't need \limits — bounds render under/over
            // anyway. nerdamer writes inverse trig as \mathrm{atan},
            // which MathQuill renders "a tan"; arcTrigNames maps to arc-.
            nerdamer(input)
              .toTeX()
              .replace(/\\limits/g, ''),
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
