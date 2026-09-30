// SymPy evaluation engine on Pyodide (WASM CPython), running off the main
// thread so heavy simplifications can't freeze the editor. Spawned lazily
// by calculator.svelte.ts on the first evaluation; one-time startup pulls
// the pyodide runtime, sympy, and the antlr4 runtime parse_latex needs.
//
// Built as a classic (iife) worker — importScripts pulls the pyodide
// loader; package + micropip assets stream from the same pinned CDN base.

declare function importScripts(...urls: string[]): void;
declare function loadPyodide(opts: {
  indexURL: string;
}): Promise<PyodideLike>;

interface PyodideLike {
  loadPackage(pkgs: string | string[]): Promise<void>;
  runPythonAsync(code: string): Promise<unknown>;
  globals: { set(name: string, value: unknown): void };
}

interface EvalRequest {
  id: number;
  rows: string[];
}

type WorkerMessage =
  | { type: 'ready' }
  | { type: 'init-error'; error: string }
  | { id: number; ok: true; rows: unknown }
  | { id: number; ok: false; error: string };

const scope = self as unknown as {
  postMessage(msg: WorkerMessage): void;
  onmessage: ((e: MessageEvent<EvalRequest>) => void) | null;
};

const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/';

const SETUP_PY = `
import json
import sympy as sp
from sympy.parsing.latex import parse_latex
from sympy.printing.python import python as _pycode

def _mc_calc_one(src):
    expr = parse_latex(src)
    try:
        val = expr.doit()
    except Exception:
        val = expr
    try:
        val = sp.simplify(val)
    except Exception:
        pass
    try:
        out = {'latex': sp.latex(val)}
    except Exception:
        out = {'text': sp.sstr(val)}
    try:
        if getattr(val, 'is_number', False) and not val.is_Integer:
            out['approx'] = str(sp.N(val, 12))
    except Exception:
        pass
    try:
        out['code'] = _pycode(val)
    except Exception:
        try:
            out['code'] = sp.sstr(val)
        except Exception:
            pass
    return out

def mc_calc(rows_json):
    out = []
    for src in json.loads(rows_json):
        src = src.strip()
        if not src:
            continue
        try:
            row = _mc_calc_one(src)
            row['ok'] = True
            out.append(row)
        except Exception as e:
            out.append({'ok': False, 'error': str(e)})
    return json.dumps(out)
`;

let boot: Promise<PyodideLike> | undefined;

async function bootEngine(): Promise<PyodideLike> {
  importScripts(`${PYODIDE_BASE}pyodide.js`);
  const py = await loadPyodide({ indexURL: PYODIDE_BASE });
  await py.loadPackage(['sympy', 'micropip']);
  // sympy's ANTLR latex parser is pinned to the 4.11 runtime, which
  // pyodide doesn't ship; micropip pulls the pure-python wheel from PyPI.
  await py.runPythonAsync(
    `import micropip\nawait micropip.install('antlr4-python3-runtime==4.11.1')`,
  );
  await py.runPythonAsync(SETUP_PY);
  return py;
}

function ensureEngine(): Promise<PyodideLike> {
  if (!boot) {
    boot = bootEngine().then((py) => {
      scope.postMessage({ type: 'ready' });
      return py;
    });
    boot.catch(() => {
      // Report once, then allow the next eval to retry a failed boot
      // (e.g. a transient CDN/PyPI fetch error).
      boot = undefined;
      scope.postMessage({
        type: 'init-error',
        error: 'failed to load the SymPy engine',
      });
    });
  }
  return boot;
}

scope.onmessage = (e) => {
  const { id, rows } = e.data;
  void ensureEngine()
    .then(async (py) => {
      py.globals.set('__mc_rows', JSON.stringify(rows));
      const json = await py.runPythonAsync('mc_calc(__mc_rows)');
      scope.postMessage({ id, ok: true, rows: JSON.parse(json as string) });
    })
    .catch((err: unknown) => {
      scope.postMessage({
        id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
};
