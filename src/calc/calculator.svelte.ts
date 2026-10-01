import { outputLatex } from '../compile/latex';
import { compileCellForCalc } from '../compile/codegen';
import type { MathJson } from '../compile/ir';
import { toNerdamerInput } from './nerdamer-latex';

export interface CalcRowOk {
  ok: true;
  latex?: string;
  text?: string;
  approx?: string;
  code?: string;
}
export interface CalcRowErr {
  ok: false;
  error: string;
}
export type CalcRow = CalcRowOk | CalcRowErr;

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

// Engine status is shared UI state (the CalcOutput components read it for
// their loading labels), so it lives in a rune like the app store.
export const calcEngine = $state<{ status: EngineStatus; error: string }>({
  status: 'idle',
  error: '',
});

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
      return;
    }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) {
      // Debug: echo the SymPy python() source produced for each row, or
      // the eval error when a row failed.
      for (const r of m.rows ?? []) {
        if (r.ok && r.code) console.log('[calc]', r.code);
        else if (!r.ok) console.log('[calc] error:', r.error);
      }
      p.resolve(m.rows ?? []);
    } else {
      console.log('[calc] error:', m.error ?? 'evaluation failed');
      p.reject(new Error(m.error ?? 'evaluation failed'));
    }
  };
  w.onerror = (e) => {
    calcEngine.status = 'error';
    calcEngine.error = e.message || 'calculator worker failed';
    failAll(calcEngine.error);
  };
  worker = w;
  return w;
}

// Evaluates a cell through SymPy: the shared codegen pipeline compiles
// the cell's parsed IR into a standalone program (prelude + one
// statement per \\ row), then the worker runs it. Cells the compiler
// already rejects surface as error rows without a worker round-trip.
export function evaluate(cell: {
  latex: string;
  json?: MathJson;
}): Promise<CalcRow[]> {
  const prog = compileCellForCalc(cell);
  const errors = prog.issues.filter((i) => i.severity === 'error');
  if (errors.length > 0)
    return Promise.resolve(
      errors.map((i) => ({ ok: false as const, error: i.message })),
    );
  if (prog.statements.length === 0) return Promise.resolve([]);
  const w = ensureWorker();
  const id = nextId++;
  return new Promise<CalcRow[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
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
  const src = outputLatex(latex).trim();
  if (src === '') return [];
  try {
    const nerdamer = (await (nerdamerP ??= import('nerdamer/all'))).default;
    return src
      .split(/\\\\/)
      .map((s) => s.trim())
      .filter((s) => s !== '')
      // MathQuill doesn't need \limits — bounds render under/over anyway.
      .map((p) => ({
        ok: true as const,
        latex: nerdamer(toNerdamerInput(p, nerdamer))
          .toTeX()
          .replace(/\\limits/g, ''),
      }));
  } catch {
    return [];
  }
}
