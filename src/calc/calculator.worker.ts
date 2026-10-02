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
}

interface EvalRequest {
  id: number;
  program: { prelude: string[]; statements: CalcStatementMsg[] };
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
from sympy.printing.python import python as _pycode

def _mc_eval_stmt(stmt, ns):
    # Expression statements eval their code directly; statements carrying
    # a display expression (assignments, function defs) exec the code then
    # eval the display (a = 5 -> Eq(a, 5), def f -> f(x) = body).
    disp = stmt.get('display')
    if disp is None:
        return eval(stmt['code'], ns)
    exec(stmt['code'], ns)
    return eval(disp, ns)

def _mc_deg(term, gens):
    # Bare capital letters are constants of integration — they go last.
    if term.is_Symbol and len(term.name) == 1 and term.name.isupper():
        return -1
    if getattr(term, 'is_number', False):
        return 0
    try:
        return int(sp.Poly(term, *gens).total_degree())
    except Exception:
        return 0

def _mc_order(val):
    # Write sums with terms in decreasing degree (constants last).
    if val.is_Add:
        gens = sorted(val.free_symbols, key=lambda s: s.name)
        terms = sorted(val.args, key=lambda t: -_mc_deg(t, gens))
        return sp.Add(*terms, evaluate=False)
    if val.args:
        # A sum nested inside a product/fraction/function keeps sympy's
        # canonical order (constant first) — rebuild containers around
        # re-ordered args, evaluate=False so the sort survives.
        args = [_mc_order(a) for a in val.args]
        try:
            return val.func(*args, evaluate=False)
        except Exception:
            try:
                return val.func(*args)
            except Exception:
                return val
    return val

def _mc_doit(val):
    # Relations and booleans doit per-side: Eq.doit() collapses the
    # equation to lhs - rhs = 0, losing the displayed form.
    if getattr(val, 'is_Relational', False) or getattr(val, 'is_Boolean', False):
        sides = [_mc_doit(a) for a in val.args]
        # Eq(Symbol, Matrix) collapses to literal False — keep the
        # equation displayed when a side is matrix-valued.
        if any(getattr(a, 'is_Matrix', False) for a in sides):
            return val.func(*sides, evaluate=False)
        return val.func(*sides)
    return val.doit()

def _mc_simplify(val):
    # Relations simplify side-by-side: a blanket sp.simplify(Eq) routes
    # through the solver and rewrites x + 1 = 2 as x = 1.
    if getattr(val, 'is_Relational', False):
        sides = [sp.simplify(a) for a in val.args]
        if any(getattr(a, 'is_Matrix', False) for a in sides):
            return val.func(*sides, evaluate=False)
        return val.func(*sides)
    return sp.simplify(val)

def _mc_row(val):
    try:
        val = _mc_doit(val)
    except Exception:
        pass
    try:
        # Booleans (And/Or of equations) keep their structure — the
        # relational args simplify per-side, never solved.
        if getattr(val, 'is_Boolean', False):
            val = val.func(*[_mc_simplify(a) for a in val.args])
        else:
            val = _mc_simplify(val)
    except Exception:
        pass
    try:
        val = _mc_order(val)
    except Exception:
        pass
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
    try:
        out['code'] = _pycode(val, order='none')
    except Exception:
        try:
            out['code'] = sp.sstr(val, order='none')
        except Exception:
            pass
    return out

def mc_run(prog_json):
    # Each cell is a standalone program: prelude (import + Symbol/Function
    # defs) execs once, then every statement yields one result row.
    prog = json.loads(prog_json)
    ns = {'sp': sp}
    try:
        exec('\\n'.join(prog['prelude']), ns)
    except Exception as e:
        return json.dumps([{'ok': False, 'error': str(e)}])
    out = []
    for stmt in prog['statements']:
        try:
            row = _mc_row(_mc_eval_stmt(stmt, ns))
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
  await py.loadPackage(['sympy']);
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
