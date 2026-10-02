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

def mc_run(prog_json):
    # Each cell is a standalone program: prelude (import + Symbol/Function
    # defs) execs once, then every statement yields one result row.
    prog = json.loads(prog_json)
    # The prelude defines mc_simplify_organize, the pipeline helper the
    # statements call (emitted per cell so the program is
    # self-contained) — exec brings it into the namespace.
    ns = {'sp': sp}
    try:
        exec('\\n'.join(prog['prelude']), ns)
    except Exception as e:
        return json.dumps([{'ok': False, 'error': str(e)}])
    prelude = list(prog['prelude'])
    # Boilerplate — import lines and the mc_simplify_organize runtime
    # block — shows only in the first row's code block; later rows keep
    # the Symbol/Function defs.
    tail = [l for l in prelude
            if not l.startswith(('import ', 'from ', '# ',
                                 'def mc_simplify_organize'))]
    out = []
    for i, stmt in enumerate(prog['statements']):
        try:
            # A statement that failed to compile keeps its row as an
            # in-place error instead of vanishing (rows keep order).
            err = stmt.get('error')
            if err is not None:
                out.append({'ok': False, 'error': err})
                continue
            row = _mc_row(_mc_eval_stmt(stmt, ns))
            row['ok'] = True
            # Show code = the emitted program for this row (prelude
            # defs + statement source, which itself applies the
            # mc_simplify_organize pipeline), not the result's
            # python() repr. The 'e = ...' capture lines exist only to
            # drive row rendering — display plumbing, split out so the
            # UI can hide it by default.
            pre = prelude if i == 0 else tail
            disp = stmt.get('display')
            row['code'] = '\\n'.join(pre + [stmt['code']])
            plumb = list(pre)
            if disp is None:
                plumb.append('e = ' + stmt['code'])
            else:
                plumb.append(stmt['code'])
                plumb.append('e = ' + disp)
            row['displayCode'] = '\\n'.join(plumb)
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
