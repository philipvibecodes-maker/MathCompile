import { collectDeclared, compileCellsForCalc } from '../compile/codegen';
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

// Desktop shell (desktop/main.py): pywebview exposes its js_api as
// window.pywebview.api — prewarm/engine_status/calc_eval mirror the
// worker's spawn/status/postMessage contract, with calc_eval taking the
// whole {prelude, cells} program as a JSON string and resolving to the
// rows the worker would have posted (same mc_run on the backend). The
// global is injected only inside the webview; in a plain browser it's
// absent and the Pyodide worker stays the engine.
interface DesktopCalcApi {
  prewarm(): Promise<unknown>;
  engine_status(): Promise<{ status: EngineStatus; error: string }>;
  calc_eval(programJson: string): Promise<CalcRow[]>;
}

let desktopApiP: Promise<DesktopCalcApi | undefined> | undefined;

function desktopApi(): Promise<DesktopCalcApi | undefined> {
  const w = globalThis as { pywebview?: { api?: DesktopCalcApi } };
  if (!w.pywebview) return Promise.resolve(undefined);
  if (w.pywebview.api) return Promise.resolve(w.pywebview.api);
  // js_api binds on 'pywebviewready' — an eval that somehow beats it
  // waits for the bind rather than falling back to the wasm engine.
  return (desktopApiP ??= new Promise((resolve) => {
    const done = () => resolve(w.pywebview?.api);
    if (typeof document !== 'undefined') {
      document.addEventListener('pywebviewready', done, { once: true });
    }
    // Give up waiting for the bind: resolve, but don't cache it — the
    // api may still land later and a cached undefined would strand the
    // desktop shell on the wasm worker forever.
    setTimeout(() => {
      desktopApiP = undefined;
      done();
    }, 5000);
  }));
}

// Mirrors the worker's ready/init-error messages off the backend's
// engine_status, driving the same calcEngine rune the UI reads.
let statusPoll: ReturnType<typeof setTimeout> | undefined;

function trackDesktopStatus(api: DesktopCalcApi) {
  if (statusPoll !== undefined) return;
  const tick = () => {
    void api
      .engine_status()
      .then((s) => {
        calcEngine.status = s.status;
        calcEngine.error = s.error ?? '';
        if (s.status === 'error') {
          failAll(s.error || 'the SymPy engine failed to start');
          statusPoll = undefined;
          return;
        }
        // Keep polling while the sandbox boots (first boot builds the
        // docker image — minutes) or an eval is still in flight.
        statusPoll =
          s.status === 'loading' || pending.size > 0
            ? setTimeout(tick, 500)
            : undefined;
      })
      .catch(() => {
        // A dropped status call shouldn't kill the poll.
        statusPoll = setTimeout(tick, 1000);
      });
  };
  tick();
}

// Both transports post-process rows the same way — the backend runs the
// identical mc_runtime.py, so the arcTrigNames safety net applies too.
const fixTrig = (rows: CalcRow[]) =>
  rows.map((r) => (r.ok && r.latex ? { ...r, latex: arcTrigNames(r.latex) } : r));

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
      p.resolve(fixTrig(m.rows ?? []));
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
  const id = nextId++;
  // Same {prelude, cells} payload either way — the worker reads it off
  // postMessage, the desktop api off a JSON argument.
  const program = {
    prelude: prog.prelude,
    cells: prog.cells.map((c) => ({
      // Content key for the worker's snapshot chain — the first
      // cell whose program differs is where eval rewinds to.
      key: JSON.stringify({ defs: c.defs, statements: c.statements }),
      defs: c.defs,
      statements: c.statements,
    })),
  };
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
    // Past the deadline, kill it; the next eval reboots (~4s). On the
    // desktop path there's no worker to kill — the nsjail time_limit
    // bounds the sandboxed run instead.
    const armWatchdog = () =>
      setTimeout(() => {
        if (!pending.has(id)) return;
        // A still-booting engine hasn't started this eval — killing it
        // mid-download would just restart the boot on the next eval, so
        // on a slow connection the engine never finishes loading.
        // Re-check instead; the deadline effectively counts from ready.
        if (calcEngine.status === 'loading') {
          timer = armWatchdog();
          return;
        }
        worker?.terminate();
        worker = undefined;
        calcEngine.status = 'idle';
        failAll('calculation timed out — the SymPy engine is restarting');
      }, 30000);
    let timer = armWatchdog();
    void desktopApi().then((api) => {
      if (api) {
        // Desktop: the backend evals the program in its nsjail sandbox.
        // The promise still goes through `pending` so failAll/watchdog
        // treat both transports uniformly.
        trackDesktopStatus(api);
        api.calc_eval(JSON.stringify(program)).then(
          (rows) => settle(id, fixTrig(rows)),
          (e: unknown) =>
            settle(id, e instanceof Error ? e : new Error(String(e))),
        );
      } else {
        ensureWorker().postMessage({ id, program });
      }
    });
  });
}

// Resolves an engine request through `pending` — the desktop transport's
// equivalent of the worker's onmessage branch.
function settle(id: number, result: CalcRow[] | Error) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  if (result instanceof Error) {
    console.log('[calc] error:', result.message);
    p.reject(result);
  } else {
    for (const r of result) {
      if (!r.ok) console.log('[calc] error:', r.error);
    }
    p.resolve(result);
  }
}

// Kicks the engine boot (~4s cold) before an expression is actually
// evaluated — the Output dropdown's pointerdown/focus hooks call this
// so the wasm+wheels download overlaps the user's menu interaction.
// The worker starts booting on spawn, so just creating it is enough.
export function prewarm(): void {
  void desktopApi().then((api) => {
    if (api) {
      // Await the call so the backend's status is already 'loading'
      // when the poll starts ticking.
      void api.prewarm().then(() => trackDesktopStatus(api));
      trackDesktopStatus(api);
    } else {
      ensureWorker();
    }
  });
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
export async function interimEvaluate(
  latex: string,
  priorLatex: string[] = [],
): Promise<CalcRow[]> {
  try {
    const nerdamer = (await (nerdamerP ??= import('nerdamer/all'))).default;
    // latexToStatementStrings tracks environment depth — a plain
    // /\\\\/ split would break every interim row for a cell holding a
    // matrix (its \\ row separators look like statement breaks).
    const stmts = latexToStatementStrings(latex);
    const norm = normalizeIR(parseCellLatex(latex));
    // The real engine shares one namespace down the worksheet, so a
    // `C = …` above reserves the letter for constants of integration —
    // interim picks letters off the same declared-name set.
    const reserved = new Set<string>();
    const scratch = new Set<string>();
    for (const l of priorLatex) {
      const n = normalizeIR(parseCellLatex(l));
      if (n.ir !== undefined) collectDeclared(n.ir, reserved, scratch);
    }
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
    const takeConst = interimConstNames(norm.ir, reserved);
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
