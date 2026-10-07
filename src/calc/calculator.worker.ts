// SymPy evaluation engine on Pyodide (WASM CPython), running off the main
// thread so heavy simplifications can't freeze the editor. Spawned lazily
// by calculator.svelte.ts on the first evaluation; one-time startup loads
// the pyodide runtime + sympy wheels vendored under public/pyodide/ (see
// scripts/fetch-pyodide.mjs) — no runtime network.
//
// The LaTeX -> SymPy translation happens on the main thread by
// compileCellForCalc (the shared codegen pipeline), so the worker only
// exec/evals emitted Python — no latex parser (parse_latex/antlr) needed.
//
// Built as a classic (iife) worker — importScripts pulls the pyodide
// loader; package assets stream from the same vendored indexURL.

declare function importScripts(...urls: string[]): void;
declare function loadPyodide(opts: {
  indexURL: string;
  _loadSnapshot?: ArrayBuffer;
}): Promise<PyodideLike>;

interface PyodideLike {
  loadPackage(pkgs: string | string[]): Promise<void>;
  runPythonAsync(code: string): Promise<unknown>;
}

interface CalcStatementMsg {
  code: string;
  display?: string;
  /** Statements that failed to emit keep their error — the row reports
   * it in place instead of vanishing. */
  error?: string;
}

interface EvalCellMsg {
  /** Stable content hash of {defs, statements} — the snapshot chain
   * rewinds to the first cell whose key changed. */
  key: string;
  /** Symbol/Function decl lines exec'd before this cell's statements. */
  defs: string[];
  statements: CalcStatementMsg[];
}

interface EvalRequest {
  id: number;
  type?: never;
  // The worksheet prefix ending at the requesting cell: shared prelude
  // plus every cell's program in order. The reply's `rows` are the last
  // cell's results.
  program: { prelude: string[]; cells: EvalCellMsg[] };
}

// First message the main thread sends — the vendored pyodide directory
// URL to boot from (it knows BASE_URL; the worker's own location doesn't).
interface InitRequest {
  type: 'init';
  pyodideBase: string;
}

type WorkerMessage =
  | { type: 'ready' }
  | { type: 'init-error'; error: string }
  | { id: number; ok: true; rows: unknown }
  | { id: number; ok: false; error: string };

const scope = self as unknown as {
  postMessage(msg: WorkerMessage): void;
  onmessage:
    | ((e: MessageEvent<InitRequest | EvalRequest>) => void)
    | null;
};

// Set by the 'init' message (the main thread knows the app's BASE_URL —
// the worker's own location doesn't tell it, dev vs prod differ). Empty
// means boot hasn't been configured yet; ensureEngine only runs after.
let pyodideBase = '';

const SETUP_PY = `
import json
import sympy as sp

def _mc_eval_stmt(stmt, ns):
    # Expression statements eval their code directly; statements carrying
    # a display expression (assignments, function defs) exec the code then
    # eval the display (a = 5 -> Eq(a, 5), def f -> f(x) = body).
    disp = stmt.get('display')
    if disp is None:
        return eval(stmt['code'], ns)
    exec(stmt['code'], ns)
    return eval(disp, ns)

def _mc_row(val):
    try:
        # inv_trig_style='full' prints inverse trig with their arc- names
        # (arctan, operatorname{arcsec}) instead of the default a- forms
        # (operatorname{atan}), which MathQuill renders as "a tan".
        out = {'latex': sp.latex(val, order='none', inv_trig_style='full')}
    except Exception:
        out = {'text': sp.sstr(val, order='none')}
    try:
        # is_number alone also admits oo/zoo/nan and unevaluated
        # Sum/Product/Integral/Limit trees — an approx on those renders
        # meaningless garbage (approx zoo, approx 9e-1067).
        if (
            getattr(val, 'is_number', False)
            and val.is_finite
            and not val.is_Integer
        ):
            out['approx'] = str(sp.N(val, 12))
    except Exception:
        pass
    return out

# The worksheet namespace plus one snapshot per cell boundary: _snaps[i]
# is the namespace + result rows captured after cell i last ran. A cell
# sees every name bound by the cells above it (a def g in cell 2 is
# visible below), and a request that only changed cell k rewinds to
# _snaps[k-1] and re-runs just the tail — earlier cells aren't re-evaled.
_ns = {'sp': sp}
_snaps = []

def _mc_run_cell(cell, ns):
    # The cell's decl lines exec first (a no-op when the names were bound
    # above — compileCellsForCalc only emits decls for new names), then
    # every statement yields one result row.
    for d in cell['defs']:
        exec(d, ns)
    out = []
    for stmt in cell['statements']:
        try:
            # A statement that failed to compile keeps its row as an
            # in-place error instead of vanishing (rows keep order).
            err = stmt.get('error')
            if err is not None:
                out.append({'ok': False, 'error': err})
                continue
            row = _mc_row(_mc_eval_stmt(stmt, ns))
            row['ok'] = True
            out.append(row)
        except Exception as e:
            out.append({'ok': False, 'error': str(e)})
    return out

def mc_run(prog_json):
    prog = json.loads(prog_json)
    cells = prog['cells']
    # First cell whose program changed since its last run — its snapshot
    # is stale, so state rewinds to the boundary just before it.
    div = 0
    while (
        div < len(_snaps)
        and div < len(cells)
        and _snaps[div]['key'] == cells[div]['key']
    ):
        div += 1
    if div < len(_snaps):
        del _snaps[div:]
    _ns.clear()
    if _snaps:
        _ns.update(_snaps[-1]['ns'])
    else:
        _ns['sp'] = sp
        # The prelude defines clean_and_simplify, the pipeline helper
        # the statements call — exec brings it into the namespace.
        try:
            exec('\\n'.join(prog['prelude']), _ns)
        except Exception as e:
            return json.dumps([{'ok': False, 'error': str(e)}])
    for cell in cells[div:]:
        try:
            rows = _mc_run_cell(cell, _ns)
        except Exception as e:
            # A decl line failing is a pipeline bug — surface it like a
            # prelude failure (one error row, no snapshot taken).
            return json.dumps([{'ok': False, 'error': str(e)}])
        _snaps.append({'key': cell['key'], 'ns': dict(_ns), 'rows': rows})
    last = len(cells) - 1
    if last < 0 or last >= len(_snaps):
        return json.dumps([])
    return json.dumps(_snaps[last]['rows'])
`;

let boot: Promise<PyodideLike> | undefined;

async function bootEngine(): Promise<PyodideLike> {
  importScripts(`${pyodideBase}pyodide.js`);
  // Fast path: engine.snapshot is a frozen post-`import sympy` memory
  // image (scripts/make-pyodide-snapshot.cjs, desktop builds only).
  // Missing file, a stale BUILD_ID, or any restore error all fall back
  // to the normal boot, so dev/Pages builds cold-boot as before.
  let py: PyodideLike | undefined;
  const resp = await fetch(`${pyodideBase}engine.snapshot`).catch(
    () => undefined,
  );
  if (resp?.ok) {
    try {
      py = await loadPyodide({
        indexURL: pyodideBase,
        _loadSnapshot: await resp.arrayBuffer(),
      });
    } catch (err) {
      console.warn('[calc] snapshot restore failed, cold-booting:', err);
    }
  }
  if (!py) {
    py = await loadPyodide({ indexURL: pyodideBase });
    await py.loadPackage(['sympy']);
  }
  await py.runPythonAsync(SETUP_PY);
  return py;
}

function ensureEngine(): Promise<PyodideLike> {
  if (!boot) {
    boot = bootEngine().then((py) => {
      scope.postMessage({ type: 'ready' });
      return py;
    });
    boot.catch((err) => {
      console.error('[calc] boot failed:', err);
      // Report once, then allow the next eval to retry a failed boot
      // (e.g. a transient CDN fetch error).
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
  if (e.data.type === 'init') {
    pyodideBase = e.data.pyodideBase;
    // Boot on spawn so prewarm() — which only creates the worker —
    // already overlaps the wasm load with the user's menu interaction.
    void ensureEngine();
    return;
  }
  const { id, program } = e.data;
  void ensureEngine()
    .then(async (py) => {
      // The program travels inside the python source as a quoted literal —
      // a shared globals slot would race when evals overlap.
      const call = `mc_run(${JSON.stringify(JSON.stringify(program))})`;
      const json = await py.runPythonAsync(call);
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
