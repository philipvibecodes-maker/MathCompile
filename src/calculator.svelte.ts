import { outputLatex } from './latex';

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

// A cell's rows (one per \\ inside \displaylines) — used only to tell
// whether a cell has content; the evaluator consolidates them into a
// single expression rather than evaluating each line independently.
export function splitRows(latex: string): string[] {
  return outputLatex(latex)
    .split(/\\\\/)
    .map((r) => r.trim())
    .filter((r) => r !== '');
}

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
      // the parse/eval error when a row failed.
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

// Evaluates a cell's latex through SymPy as a single expression — the
// whole cell goes in one request; the worker folds multi-line
// (\displaylines) content into a Tuple when \ doesn't parse alone.
export function evaluate(latex: string): Promise<CalcRow[]> {
  const src = outputLatex(latex);
  if (src.trim() === '') return Promise.resolve([]);
  const w = ensureWorker();
  const id = nextId++;
  return new Promise<CalcRow[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, rows: [src], baseUrl: import.meta.env.BASE_URL });
  });
}

// Kicks the engine boot (~5s cold) before an expression is actually
// evaluated — the Output dropdown's pointerdown/focus hooks call this
// so the wasm+wheels download overlaps the user's menu interaction.
// Rows are empty, so the reply (id 0, unmatched in pending) is dropped.
export function prewarm(): void {
  ensureWorker().postMessage({
    id: 0,
    rows: [],
    baseUrl: import.meta.env.BASE_URL,
  });
}
