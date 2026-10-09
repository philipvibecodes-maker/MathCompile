// SymPy evaluation engine on Pyodide (WASM CPython), running off the main
// thread so heavy simplifications can't freeze the editor. Spawned lazily
// by calculator.svelte.ts on the first evaluation; one-time startup pulls
// the pyodide runtime + sympy wheels from the pinned CDN.
//
// The LaTeX -> SymPy translation happens on the main thread by
// compileCellForCalc (the shared codegen pipeline), so the worker only
// exec/evals emitted Python — no latex parser (parse_latex/antlr) needed.
//
// Built as a classic (iife) worker — importScripts pulls the pyodide
// loader; package assets stream from the same pinned CDN base.

declare function importScripts(...urls: string[]): void;
declare function loadPyodide(opts: {
  indexURL: string;
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
  // The worksheet prefix ending at the requesting cell: shared prelude
  // plus every cell's program in order. The reply's `rows` are the last
  // cell's results.
  program: { prelude: string[]; cells: EvalCellMsg[] };
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

# ————————————————————————————————————————————————————————————————————
# Plot sampling — a _mc_plot(<expr>) statement's marker dict lands here
# via the interception in _mc_run_cell. The value's signature is
# classified (free symbols × output components) and sampled on a default
# grid with lambdify; non-finite points come back as nulls so the
# frontend breaks lines at poles/asymptotes.

_MC_PLOT_R1 = (-10.0, 10.0)
_MC_PLOT_R2 = (-3.0, 3.0)
_MC_PLOT_N1 = 600
_MC_PLOT_N2 = 80

import inspect as _mc_inspect
import numpy as _mc_np


def _mc_plot_components(expr):
    # A Matrix with one row or column, a Tuple, and a plain list all read
    # as a multi-component output; anything else is scalar.
    if isinstance(expr, sp.MatrixBase):
        if expr.rows == 1 or expr.cols == 1:
            return list(expr)
        raise ValueError(
            'a matrix that is not a row or column vector cannot be plotted'
        )
    if isinstance(expr, (sp.Tuple, tuple, list)):
        return list(expr)
    if isinstance(expr, sp.Set):
        raise ValueError(
            'a set or interval cannot be plotted — write components as a column vector'
        )
    return [expr]


def _mc_plot_signature(v):
    # Resolve a plot-marked value to (vars, components, label): a Lambda
    # carries its params, a python function (a def'd name) is called
    # on fresh symbols named after its parameters, and an expression's
    # free symbols are the variables.
    if isinstance(v, sp.Lambda):
        vars_ = list(v.signature)
        comps = _mc_plot_components(v.expr)
        return vars_, comps, sp.latex(v.expr)
    if callable(v) and not isinstance(v, sp.Basic):
        try:
            names = [
                n for n in _mc_inspect.signature(v).parameters
                if not n.startswith('*')
            ]
        except Exception:
            names = []
        if len(names) == 0:
            raise ValueError(
                'cannot determine the plotted function’s parameters'
            )
        vars_ = [sp.Symbol(n) for n in names]
        comps = _mc_plot_components(v(*vars_))
        label = getattr(v, '__name__', 'f')
        return vars_, comps, f'{label}({", ".join(names)})'
    free = sorted(getattr(v, 'free_symbols', set()), key=lambda s: s.name)
    comps = _mc_plot_components(v)
    try:
        label = sp.latex(v)
    except Exception:
        label = str(v)
    return free, comps, label


def _mc_plot_clean(a, shape):
    a = _mc_np.asarray(a, dtype=float)
    a = _mc_np.broadcast_to(a, shape)
    out = []
    for x in a.ravel():
        out.append(None if not _mc_np.isfinite(x) else float(x))
    if len(shape) == 2:
        return [out[i * shape[1]:(i + 1) * shape[1]] for i in range(shape[0])]
    return out


def _mc_plot_payload(v):
    vars_, comps, label = _mc_plot_signature(v)
    d = len(vars_)
    c = len(comps)
    if d not in (1, 2):
        raise ValueError(
            f'cannot plot a function of {d} variables (needs 1 or 2)'
        )
    if c not in (1, 2, 3):
        raise ValueError(
            f'cannot plot {c} output components (needs 1, 2, or 3)'
        )
    fnum = sp.lambdify(vars_, comps, 'numpy')
    vnames = [s.name for s in vars_]
    if d == 1:
        ts = _mc_np.linspace(_MC_PLOT_R1[0], _MC_PLOT_R1[1], _MC_PLOT_N1)
        vals = _mc_np.asarray(fnum(ts))
        if vals.ndim == 1:
            vals = vals.reshape(1, -1)
        shape = (len(ts),)
        data = {'t': _mc_plot_clean(ts, shape)}
        names = ['y'] if c == 1 else ['x', 'y', 'z'][:c]
        for i in range(c):
            data[names[i]] = _mc_plot_clean(vals[i], shape)
        if c == 1:
            data['x'], data['y'] = data.pop('t'), data['y']
    else:
        us = _mc_np.linspace(_MC_PLOT_R2[0], _MC_PLOT_R2[1], _MC_PLOT_N2)
        vs = _mc_np.linspace(_MC_PLOT_R2[0], _MC_PLOT_R2[1], _MC_PLOT_N2)
        U, V = _mc_np.meshgrid(us, vs)
        vals = _mc_np.asarray(fnum(U, V))
        if vals.ndim == 2:
            vals = vals.reshape(1, vals.shape[0], vals.shape[1])
        shape = U.shape
        data = {
            'u': _mc_plot_clean(us, (len(us),)),
            'v': _mc_plot_clean(vs, (len(vs),)),
        }
        names = ['z'] if c == 1 else ['fx', 'fy', 'fz'][:c]
        for i in range(c):
            data[names[i]] = _mc_plot_clean(vals[i], shape)
        if c == 1:
            data['x'], data['y'] = data.pop('u'), data.pop('v')
    return {
        'kind': f'{d}x{c}',
        'vars': vnames,
        'label': label,
        'data': data,
    }


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
            val = _mc_eval_stmt(stmt, ns)
            # A _mc_plot marker isn't a value row — sample the
            # expression and hand the frontend plot data instead.
            if isinstance(val, dict) and val.get('__mcplot__') is True:
                out.append({'ok': True, 'plot': _mc_plot_payload(val['expr'])})
                continue
            row = _mc_row(val)
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
  importScripts(`${PYODIDE_BASE}pyodide.js`);
  const py = await loadPyodide({ indexURL: PYODIDE_BASE });
  await py.loadPackage(['sympy', 'numpy']);
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

// Boot on spawn so prewarm() — which only creates the worker — already
// overlaps the wasm download with the user's menu interaction.
void ensureEngine();

scope.onmessage = (e) => {
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
