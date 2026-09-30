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
  unpackArchive(
    buffer: ArrayBuffer,
    format: string,
    options?: { extractDir?: string },
  ): void;
  globals: { set(name: string, value: unknown): void };
}

interface EvalRequest {
  id: number;
  rows: string[];
  baseUrl?: string;
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
const ANTLR_WHL = 'antlr4_python3_runtime-4.11.1-py3-none-any.whl';
const ANTLR_DIR = '/deps/antlr4';

// App base path, sent by the main thread so the wheel URL resolves
// under the deployed subpath (e.g. /MathCompile/ on Pages).
let baseUrl = '/';

const SETUP_PY = `
import json
import sys
sys.path.insert(0, '${ANTLR_DIR}')
import sympy as sp
from sympy.parsing.latex import parse_latex
from sympy.printing.python import python as _pycode

def _mc_parse(src):
    try:
        return parse_latex(src)
    except Exception:
        # Multi-line (\\displaylines) cells aren't a single latex
        # expression — \\ doesn't parse — so consolidate their rows
        # into one Tuple instead of evaluating each independently.
        parts = [p.strip() for p in src.split(r'\\\\') if p.strip()]
        if not parts:
            raise
        exprs = [parse_latex(p) for p in parts]
        return exprs[0] if len(exprs) == 1 else sp.Tuple(*exprs)

def _mc_calc_one(src):
    expr = _mc_parse(src)
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

async function installAntlr(py: PyodideLike): Promise<void> {
  // Vendored same-origin wheel: a fetch + zip unpack replaces the old
  // micropip/PyPI install (which also had to pull micropip + packaging).
  const buf = await (await fetch(`${baseUrl}${ANTLR_WHL}`)).arrayBuffer();
  py.unpackArchive(buf, 'zip', { extractDir: ANTLR_DIR });
}

async function bootEngine(): Promise<PyodideLike> {
  importScripts(`${PYODIDE_BASE}pyodide.js`);
  const py = await loadPyodide({ indexURL: PYODIDE_BASE });
  // sympy ships in pyodide's own index; antlr4 (pinned by sympy's latex
  // parser, not shipped by pyodide) installs alongside it in parallel.
  await Promise.all([py.loadPackage(['sympy']), installAntlr(py)]);
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
  const { id, rows, baseUrl: b } = e.data;
  if (b) baseUrl = b;
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
