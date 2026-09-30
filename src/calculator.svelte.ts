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

// A cell's latex maps to independently-evaluated rows: \displaylines{}
// is an editing artifact (unwrapped by outputLatex), and each \\ row
// gets its own result.
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
    if (m.ok) p.resolve(m.rows ?? []);
    else p.reject(new Error(m.error ?? 'evaluation failed'));
  };
  w.onerror = (e) => {
    calcEngine.status = 'error';
    calcEngine.error = e.message || 'calculator worker failed';
    failAll(calcEngine.error);
  };
  worker = w;
  return w;
}

// Evaluates a cell's latex through SymPy. Rows resolve in input order;
// an individual row may still carry ok:false with a parse/eval error.
export function evaluate(latex: string): Promise<CalcRow[]> {
  const rows = splitRows(latex);
  if (rows.length === 0) return Promise.resolve([]);
  const w = ensureWorker();
  const id = nextId++;
  return new Promise<CalcRow[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, rows });
  });
}
