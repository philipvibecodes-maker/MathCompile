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

// First message the main thread sends — the page knows BASE_URL (the
// base public assets are served under); a classic worker can't read
// import.meta.env itself.
interface InitRequest {
  type: 'init';
  snapshotBase: string;
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


_MC_PLOT_ACC = '#3b82f6'
_MC_PLOT_MARGIN = dict(l=40, r=10, t=30, b=40)


def _mc_plot_menu(fig, labels, vis_lists):
    # One updatemenu driving trace visibility — the several views of the
    # same signature (heatmap vs streamlines vs quiver, ...).
    fig.update_layout(updatemenus=[dict(
        buttons=[
            dict(label=lab, method='update', args=[{'visible': vis}])
            for lab, vis in zip(labels, vis_lists)
        ],
        direction='down',
        x=0,
        y=1.12,
    )])


def _mc_plot_streamlines(us, vs, fx, fy):
    # RK4 streamlines of the sampled field, seeded every few grid nodes.
    # fx/fy are 2-D numpy arrays over (vs, us); out-of-range and
    # non-finite lookups read as zero so a streamline dies at the edge.
    nu, nv = len(us), len(vs)
    du = (us[-1] - us[0]) / (nu - 1 or 1)
    dv = (vs[-1] - vs[0]) / (nv - 1 or 1)

    def field(x, y):
        iu = (x - us[0]) / du
        iv = (y - vs[0]) / dv
        j0 = int(_mc_np.floor(iu))
        i0 = int(_mc_np.floor(iv))
        if j0 < 0 or i0 < 0 or j0 + 1 >= nu or i0 + 1 >= nv:
            return 0.0, 0.0
        a, b = iu - j0, iv - i0

        def at(g):
            return (
                g[i0][j0] * (1 - a) * (1 - b)
                + g[i0][j0 + 1] * a * (1 - b)
                + g[i0 + 1][j0] * (1 - a) * b
                + g[i0 + 1][j0 + 1] * a * b
            )

        return at(fx), at(fy)

    step = min(du, dv) * 0.5
    xs, ys = [], []
    for i in range(0, nv, 3):
        for j in range(0, nu, 3):
            x, y = us[j], vs[i]
            xs.append(x)
            ys.append(y)
            for _ in range(120):
                k1x, k1y = field(x, y)
                k2x, k2y = field(x + k1x * step * 0.5, y + k1y * step * 0.5)
                k3x, k3y = field(x + k2x * step * 0.5, y + k2y * step * 0.5)
                k4x, k4y = field(x + k3x * step, y + k3y * step)
                x += (step / 6) * (k1x + 2 * k2x + 2 * k3x + k4x)
                y += (step / 6) * (k1y + 2 * k2y + 2 * k3y + k4y)
                if not (_mc_np.isfinite(x) and _mc_np.isfinite(y)):
                    break
                if k1x * k1x + k1y * k1y < 1e-8:
                    break
                xs.append(x)
                ys.append(y)
            xs.append(None)
            ys.append(None)
    return xs, ys


def _mc_plot_gridlines(us, vs, fx, fy, fz=None):
    # Coordinate-line curves through f: fixed-v rows and fixed-u
    # columns, concatenated with None breaks — how f warps the grid.
    xs, ys, zs = [], [], []
    for i in range(0, len(vs), 2):
        xs += list(fx[i]) + [None]
        ys += list(fy[i]) + [None]
        if fz is not None:
            zs += list(fz[i]) + [None]
    for j in range(0, len(us), 2):
        xs += list(fx[:, j]) + [None]
        ys += list(fy[:, j]) + [None]
        if fz is not None:
            zs += list(fz[:, j]) + [None]
    return xs, ys, zs


def _mc_plot_figure(d, c, vars_, comps):
    # Sample the components and build the plotly figure for the
    # signature. Non-finite samples stay NaN — plotly gaps on them,
    # which is what makes poles/asymptotes break cleanly.
    import plotly.graph_objects as go

    fnum = sp.lambdify(vars_, comps, 'numpy')
    acc = _MC_PLOT_ACC
    if d == 1:
        ts = _mc_np.linspace(_MC_PLOT_R1[0], _MC_PLOT_R1[1], _MC_PLOT_N1)
        vals = _mc_np.asarray(fnum(ts), dtype=float)
        if vals.ndim == 1:
            vals = vals.reshape(1, -1)
        if c == 1:
            fig = go.Figure(go.Scatter(
                x=ts, y=vals[0], mode='lines',
                line=dict(color=acc, width=2),
            ))
            fig.update_xaxes(zeroline=True)
            fig.update_yaxes(zeroline=True)
        elif c == 2:
            fig = go.Figure(go.Scatter(
                x=vals[0], y=vals[1], mode='lines',
                line=dict(color=acc, width=2),
            ))
            fig.update_xaxes(zeroline=True)
            fig.update_yaxes(zeroline=True, scaleanchor='x', scaleratio=1)
        else:
            fig = go.Figure(go.Scatter3d(
                x=vals[0], y=vals[1], z=vals[2], mode='lines',
                line=dict(color=acc, width=4),
            ))
        fig.update_layout(margin=_MC_PLOT_MARGIN, showlegend=False)
        return fig

    us = _mc_np.linspace(_MC_PLOT_R2[0], _MC_PLOT_R2[1], _MC_PLOT_N2)
    vs = _mc_np.linspace(_MC_PLOT_R2[0], _MC_PLOT_R2[1], _MC_PLOT_N2)
    U, V = _mc_np.meshgrid(us, vs)
    vals = _mc_np.asarray(fnum(U, V), dtype=float)
    if vals.ndim == 2:
        vals = vals.reshape(1, vals.shape[0], vals.shape[1])
    mag = _mc_np.sqrt(sum(v * v for v in vals))
    fig = go.Figure()
    if c == 1:
        fig.add_surface(
            x=us, y=vs, z=vals[0], colorscale='Viridis', showscale=False,
            contours=dict(
                z=dict(show=True, usecolormap=True, project=dict(z=True)),
            ),
        )
        fig.add_heatmap(
            x=us, y=vs, z=vals[0], colorscale='Viridis', showscale=False,
            visible=False,
        )
        _mc_plot_menu(fig, ['surface', 'heatmap'], [[True, False], [False, True]])
    elif c == 2:
        fx, fy = vals[0], vals[1]
        # Quiver: one scatter of tail→tip segments plus a cone per tip.
        stride = 5
        sx, sy, cx, cy, vx, vy = [], [], [], [], [], []
        for i in range(0, len(vs), stride):
            for j in range(0, len(us), stride):
                fxx = fx[i][j]
                fyy = fy[i][j]
                if not (_mc_np.isfinite(fxx) and _mc_np.isfinite(fyy)):
                    continue
                sx += [us[j], us[j] + fxx, None]
                sy += [vs[i], vs[i] + fyy, None]
                cx.append(us[j] + fxx)
                cy.append(vs[i] + fyy)
                vx.append(fxx)
                vy.append(fyy)
        span = _mc_np.hypot(us[-1] - us[0], vs[-1] - vs[0])
        fig.add_scatter(
            x=sx, y=sy, mode='lines', line=dict(color=acc, width=1),
            hoverinfo='skip',
        )
        fig.add_cone(
            x=cx, y=cy, z=[0] * len(cx), u=vx, v=vy, w=[0] * len(vx),
            colorscale='Viridis', sizemode='absolute',
            sizeref=float(span) * 0.4, anchor='tail', showscale=False,
            scene='scene2',
        )
        fig.update_layout(scene2=dict(
            domain=dict(x=[0, 1], y=[0, 1]),
            camera=dict(eye=dict(x=0, y=0, z=1.6)),
            xaxis=dict(visible=False),
            yaxis=dict(visible=False),
            zaxis=dict(range=[-0.5, 0.5], visible=False),
        ))
        fig.add_heatmap(
            x=us, y=vs, z=mag, colorscale='Viridis', showscale=False,
            visible=False,
        )
        str_x, str_y = _mc_plot_streamlines(us, vs, fx, fy)
        fig.add_scatter(
            x=str_x, y=str_y, mode='lines', line=dict(color=acc, width=1),
            hoverinfo='skip', visible=False,
        )
        gx, gy, _ = _mc_plot_gridlines(us, vs, fx, fy)
        fig.add_scatter(
            x=gx, y=gy, mode='lines',
            line=dict(color='rgba(59,130,246,0.55)', width=1),
            hoverinfo='skip', visible=False,
        )
        _mc_plot_menu(
            fig,
            ['quiver', 'magnitude heatmap', 'streamlines', 'image of grid'],
            [
                [True, True, False, False, False],
                [False, False, True, False, False],
                [False, False, False, True, False],
                [False, False, False, False, True],
            ],
        )
        fig.update_xaxes(zeroline=True)
        fig.update_yaxes(zeroline=True, scaleanchor='x', scaleratio=1)
    else:
        fx, fy, fz = vals[0], vals[1], vals[2]
        fig.add_surface(
            x=fx, y=fy, z=fz, surfacecolor=mag, colorscale='Viridis',
            showscale=False,
        )
        fig.add_surface(
            x=fx, y=fy, z=fz, surfacecolor=U, colorscale='Plasma',
            showscale=False, visible=False,
        )
        gx, gy, gz = _mc_plot_gridlines(us, vs, fx, fy, fz)
        fig.add_scatter3d(
            x=gx, y=gy, z=gz, mode='lines',
            line=dict(color='rgba(59,130,246,0.7)', width=2),
            hoverinfo='skip', visible=False,
        )
        fig.add_scatter3d(
            x=fx.ravel(), y=fy.ravel(), z=fz.ravel(), mode='markers',
            marker=dict(size=2, color=acc), visible=False,
        )
        _mc_plot_menu(
            fig,
            [
                'surface, colored by |f|',
                'surface, colored by u',
                'grid curves',
                'point cloud',
            ],
            [
                [True, False, False, False],
                [False, True, False, False],
                [False, False, True, False],
                [False, False, False, True],
            ],
        )
    fig.update_layout(margin=_MC_PLOT_MARGIN, showlegend=False)
    return fig


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
    fig = _mc_plot_figure(d, c, vars_, comps)
    return {
        'kind': f'{d}x{c}',
        'vars': [s.name for s in vars_],
        'label': label,
        # The figure dict the plotly python library emits — the frontend
        # applies theme overrides and hands it to plotly.js as-is.
        'figure': json.loads(fig.to_json()),
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

// engine.snapshot(.gz) in public/ is a frozen post-import memory image
// (scripts/make-pyodide-snapshot.cjs) with sympy, numpy and plotly
// already loaded — restoring it skips both the multi-second imports
// and the micropip PyPI install entirely.
// The base public assets are served under — set by the 'init' message.
// Undefined means no init arrived (shouldn't happen: the main thread
// posts init right after construction) — the snapshot fetch is skipped
// and boot falls back to the cold path rather than guessing a URL.
let snapshotBase: string | undefined;

async function fetchSnapshot(): Promise<ArrayBuffer | undefined> {
  if (snapshotBase === undefined) return undefined;
  for (const file of ['engine.snapshot.gz', 'engine.snapshot']) {
    const resp = await fetch(`${snapshotBase}${file}`).catch(
      () => undefined,
    );
    if (!resp?.ok || !resp.body) continue;
    let buf: ArrayBuffer;
    if (file.endsWith('.gz')) {
      if (typeof DecompressionStream === 'undefined') continue;
      try {
        buf = await new Response(
          resp.body.pipeThrough(new DecompressionStream('gzip')),
        ).arrayBuffer();
      } catch {
        continue;
      }
    } else {
      buf = await resp.arrayBuffer();
    }
    // Check the snapshot magic before handing bytes to _loadSnapshot:
    // servers that fall back to index.html answer 200 with HTML, and
    // feeding that to _loadSnapshot hangs the boot instead of throwing.
    const SNAPSHOT_MAGIC = 1886286592;
    if (
      buf.byteLength > 48 &&
      new Uint32Array(buf, 0, 4)[0] === SNAPSHOT_MAGIC
    )
      return buf;
  }
  return undefined;
}

async function bootEngine(): Promise<PyodideLike> {
  importScripts(`${PYODIDE_BASE}pyodide.js`);
  const snap = await fetchSnapshot();
  if (snap) {
    try {
      const py = await loadPyodide({
        indexURL: PYODIDE_BASE,
        _loadSnapshot: snap,
      });
      // Package files never survive a snapshot — the EMFS tree lives
      // outside the wasm heap — so the built-ins must be repopulated
      // for lazy imports. plotly is not a built-in; the modules the
      // plot code touches are warmed into the image itself.
      await py.loadPackage(['sympy', 'numpy', 'narwhals', 'packaging']);
      await py.runPythonAsync(SETUP_PY);
      return py;
    } catch (err) {
      console.warn('[calc] snapshot restore failed, cold-booting:', err);
    }
  }
  const py = await loadPyodide({ indexURL: PYODIDE_BASE });
  // plotly is a pure-Python PyPI package, not a Pyodide built-in, so it
  // has to come in through micropip rather than loadPackage.
  await py.loadPackage(['sympy', 'numpy', 'micropip']);
  await py.runPythonAsync(
    'import micropip\nawait micropip.install("plotly")',
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
  const msg = e.data as InitRequest | EvalRequest;
  if (msg.type === 'init') {
    snapshotBase = msg.snapshotBase;
    // The main thread posts init right after construction, so boot
    // still overlaps the wasm download with the user's menu
    // interaction the same way an unconditional boot on spawn did.
    void ensureEngine();
    return;
  }
  const { id, program } = msg;
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
