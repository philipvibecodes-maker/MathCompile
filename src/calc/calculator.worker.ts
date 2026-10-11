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
  FS: { writeFile(path: string, data: Uint8Array): void };
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
// The vendored wheel the snapshot boot repopulates plotly's files
// from — pinned to the same version scripts/fetch-pyodide-deps.mjs
// stages into public/wheels/.
const PLOTLY_WHEEL = 'plotly-7.1.0-py3-none-any.whl';

const SETUP_PY = `
import json
import sympy as sp
from sympy.printing.str import StrPrinter as _MCStrPrinter

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

# numpy and inspect are imported lazily inside _mc_plot_figure /
# _mc_plot_signature so their ~1s import only runs when a plot cell
# actually evaluates — and so a snapshot-restored interpreter never
# holds a pre-snapshot numpy module.


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
        import inspect as _mc_inspect
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


# The streamlines/gridlines helpers are exec'd from source strings:
# _mc_plot_code hands the generating-code block the same text it shows
# as "the code that ran", so the shown source can't drift from the
# executed one.
_MC_PLOT_STREAMLINES_SRC = '''def _mc_plot_streamlines(us, vs, fx, fy):
    # RK4 streamlines of the sampled field, seeded every few grid nodes.
    # fx/fy are 2-D numpy arrays over (vs, us); out-of-range and
    # non-finite lookups read as zero so a streamline dies at the edge.
    import numpy as _mc_np
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
    return xs, ys'''

exec(_MC_PLOT_STREAMLINES_SRC)

_MC_PLOT_GRIDLINES_SRC = '''def _mc_plot_gridlines(us, vs, fx, fy, fz=None):
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
    return xs, ys, zs'''

exec(_MC_PLOT_GRIDLINES_SRC)

_MC_PLOT_XYPLANE_SRC = '''def _mc_nice_step(span):
    # A 1/2/2.5/5-times-power-of-ten step of roughly span/6 — the
    # xy-plane gridline pitch.
    import numpy as _mc_np
    if span <= 0 or not _mc_np.isfinite(span):
        return 1.0
    raw = span / 6.0
    mag = 10.0 ** _mc_np.floor(_mc_np.log10(raw))
    for m in (1.0, 2.0, 2.5, 5.0, 10.0):
        if raw <= m * mag:
            return m * mag
    return 10.0 * mag


def _mc_plot_xyplane(fig, x0, x1, y0, y1):
    # The z=0 reference plane (the 'xy plane through origin' option): a
    # translucent slab plus gridlines, meta-tagged so the frontend
    # toggles the whole plane as one unit. Colors are placeholders —
    # src/plot/theme.ts restyles mcRole traces per theme.
    # Ambient-only lighting: the gl3d surface pipeline
    # specular-sparkles on a perfectly flat translucent surface.
    import numpy as _mc_np
    fig.add_surface(
        x=[[x0, x1], [x0, x1]],
        y=[[y0, y0], [y1, y1]],
        z=[[0.0, 0.0], [0.0, 0.0]],
        opacity=0.25,
        lighting=dict(ambient=1.0, diffuse=0.0, specular=0.0,
                      roughness=1.0, fresnel=0.0),
        showscale=False, hoverinfo='skip',
        surfacecolor=[[0.0, 0.0], [0.0, 0.0]],
        colorscale=[[0.0, '#64748b'], [1.0, '#64748b']],
        meta={'mcRole': 'xyplane'},
    )
    xs_, ys_, zs_ = [], [], []
    for gx in _mc_np.arange(
            _mc_np.ceil(x0 / _mc_nice_step(x1 - x0))
            * _mc_nice_step(x1 - x0),
            x1 + _mc_nice_step(x1 - x0) * 1e-6,
            _mc_nice_step(x1 - x0)):
        xs_ += [float(gx), float(gx), None]
        ys_ += [y0, y1, None]
        zs_ += [0.0, 0.0, None]
    for gy in _mc_np.arange(
            _mc_np.ceil(y0 / _mc_nice_step(y1 - y0))
            * _mc_nice_step(y1 - y0),
            y1 + _mc_nice_step(y1 - y0) * 1e-6,
            _mc_nice_step(y1 - y0)):
        xs_ += [x0, x1, None]
        ys_ += [float(gy), float(gy), None]
        zs_ += [0.0, 0.0, None]
    fig.add_scatter3d(
        x=xs_, y=ys_, z=zs_, mode='lines',
        line=dict(color='rgba(148,163,184,0.55)', width=1),
        hoverinfo='skip',
        meta={'mcRole': 'xyplane'},
    )


def _mc_plot_zaxis(fig, z0, z1, tick):
    # A z-axis stub through the origin — meta-tagged 'zaxis' so the
    # frontend shows it while 'xy plane only' hides the axis boxes.
    # tick is the tick mark length in data units.
    import numpy as _mc_np
    step = _mc_nice_step(z1 - z0)
    xs_, ys_, zs_ = [0.0, 0.0, None], [0.0, 0.0, None], [z0, z1, None]
    for gz in _mc_np.arange(
            _mc_np.ceil(z0 / step) * step, z1 + step * 1e-6, step):
        xs_ += [-tick, tick, None]
        ys_ += [0.0, 0.0, None]
        zs_ += [float(gz), float(gz), None]
    fig.add_scatter3d(
        x=xs_, y=ys_, z=zs_, mode='lines',
        line=dict(color='rgba(148,163,184,0.8)', width=2),
        hoverinfo='skip',
        meta={'mcRole': 'zaxis'},
    )
    fig.add_scatter3d(
        x=[0.0], y=[0.0], z=[z1], mode='text',
        text=['z'], textposition='top center',
        textfont=dict(color='rgba(148,163,184,0.8)', size=13),
        hoverinfo='skip',
        meta={'mcRole': 'zaxis'},
    )'''

exec(_MC_PLOT_XYPLANE_SRC)


def _mc_plot_figure(d, c, vars_, comps):
    # Sample the components and build the plotly figure for the
    # signature. Non-finite samples stay NaN — plotly gaps on them,
    # which is what makes poles/asymptotes break cleanly.
    import numpy as _mc_np
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
        # The z=0 reference plane spans the curve's xy extent and a
        # z-axis stub spans its z extent — the 'xy plane' options
        # toggle them; skipped when the samples are all non-finite.
        plane = None
        zext = None
        if c == 3:
            if (_mc_np.isfinite(vals[0]).any()
                    and _mc_np.isfinite(vals[1]).any()):
                plane = (
                    float(_mc_np.nanmin(vals[0])),
                    float(_mc_np.nanmax(vals[0])),
                    float(_mc_np.nanmin(vals[1])),
                    float(_mc_np.nanmax(vals[1])),
                )
            if _mc_np.isfinite(vals[2]).any():
                z0 = float(_mc_np.nanmin(vals[2]))
                z1 = float(_mc_np.nanmax(vals[2]))
                if z0 == z1:
                    z0, z1 = z0 - 1.0, z1 + 1.0
                xspan = plane[1] - plane[0] if plane else 1.0
                yspan = plane[3] - plane[2] if plane else 1.0
                zext = (z0, z1, 0.02 * max(xspan, yspan))
            if plane is not None:
                _mc_plot_xyplane(fig, *plane)
            if zext is not None:
                _mc_plot_zaxis(fig, *zext)
        fig.update_layout(margin=_MC_PLOT_MARGIN, showlegend=False)
        return fig, plane, zext

    us = _mc_np.linspace(_MC_PLOT_R2[0], _MC_PLOT_R2[1], _MC_PLOT_N2)
    vs = _mc_np.linspace(_MC_PLOT_R2[0], _MC_PLOT_R2[1], _MC_PLOT_N2)
    U, V = _mc_np.meshgrid(us, vs)
    vals = _mc_np.asarray(fnum(U, V), dtype=float)
    if vals.ndim == 2:
        vals = vals.reshape(1, vals.shape[0], vals.shape[1])
    mag = _mc_np.sqrt(sum(v * v for v in vals))
    fig = go.Figure()
    # The z=0 reference plane's xy extent and the z-axis stub's z
    # extent for the 3-D kinds — stay None for the 2-D quiver family
    # and all-nonfinite samples.
    plane = None
    zext = None
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
        # The xy-plane reference spans the sampled domain, the z-axis
        # stub the sampled z range.
        plane = (float(us[0]), float(us[-1]), float(vs[0]), float(vs[-1]))
        if _mc_np.isfinite(vals[0]).any():
            z0 = float(_mc_np.nanmin(vals[0]))
            z1 = float(_mc_np.nanmax(vals[0]))
            if z0 == z1:
                z0, z1 = z0 - 1.0, z1 + 1.0
            zext = (z0, z1, 0.02 * float(us[-1] - us[0]))
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
        # The xy-plane reference spans the parametric surface's xy
        # footprint, the z-axis stub its z range — each skipped when
        # the samples are all non-finite.
        if _mc_np.isfinite(fx).any() and _mc_np.isfinite(fy).any():
            plane = (
                float(_mc_np.nanmin(fx)),
                float(_mc_np.nanmax(fx)),
                float(_mc_np.nanmin(fy)),
                float(_mc_np.nanmax(fy)),
            )
        if _mc_np.isfinite(fz).any():
            z0 = float(_mc_np.nanmin(fz))
            z1 = float(_mc_np.nanmax(fz))
            if z0 == z1:
                z0, z1 = z0 - 1.0, z1 + 1.0
            xspan = plane[1] - plane[0] if plane else 1.0
            yspan = plane[3] - plane[2] if plane else 1.0
            zext = (z0, z1, 0.02 * max(xspan, yspan))
    if plane is not None:
        _mc_plot_xyplane(fig, *plane)
    if zext is not None:
        _mc_plot_zaxis(fig, *zext)
    fig.update_layout(margin=_MC_PLOT_MARGIN, showlegend=False)
    return fig, plane, zext


class _MCCodePrinter(_MCStrPrinter):
    # sstr with sp. prefixes on sympy names, matching the codegen style
    # of the displayed program — user-defined functions stay bare. Only
    # used to print the expression inside the shown plotting code; the
    # executed path never sees this text.
    def _print_Function(self, expr):
        fn = expr.func
        if isinstance(fn, sp.core.function.UndefinedFunction):
            return _MCStrPrinter._print_Function(self, expr)
        if (getattr(fn, '__module__', None) or '').startswith('sympy'):
            name = getattr(fn, '__name__', None) or str(fn)
            return 'sp.%s(%s)' % (
                name, ', '.join(self._print(a) for a in expr.args))
        return _MCStrPrinter._print_Function(self, expr)
    def _print_Pow(self, expr):
        if expr.exp == sp.Rational(1, 2):
            return 'sp.sqrt(' + self._print(expr.base) + ')'
        return _MCStrPrinter._print_Pow(self, expr)
    def _sp_call(self, expr):
        return 'sp.%s(%s)' % (
            type(expr).__name__,
            ', '.join(self._print(a) for a in expr.args))
    _print_Derivative = _sp_call
    _print_Integral = _sp_call
    _print_Limit = _sp_call
    _print_Sum = _sp_call
    _print_Product = _sp_call
    def _print_MatrixBase(self, expr):
        return 'sp.' + _MCStrPrinter._print_MatrixBase(self, expr)
    def _print_Pi(self, expr): return 'sp.pi'
    def _print_Exp1(self, expr): return 'sp.E'
    def _print_ImaginaryUnit(self, expr): return 'sp.I'
    def _print_Infinity(self, expr): return 'sp.oo'
    def _print_NegativeInfinity(self, expr): return '-sp.oo'
    def _print_ComplexInfinity(self, expr): return 'sp.zoo'
    def _print_NaN(self, expr): return 'sp.nan'


def _mc_plot_code(d, c, vars_, comps, plane, zext):
    # The literal program _mc_plot_figure ran for this signature — the
    # generating-code block shows it in place of the opaque _mc_plot
    # marker. Mirrors the figure fn's branches; constants interpolate
    # from the real _MC_PLOT_* values and the helper sources are the
    # same strings exec'd above, so the shown text can't drift.
    v0 = vars_[0].name
    params = (
        f'({v0},)' if d == 1 else f'({vars_[0].name}, {vars_[1].name})'
    )
    body = '[' + ', '.join(
        _MCCodePrinter().doprint(e) for e in comps) + ']'
    acc = _MC_PLOT_ACC
    m = _MC_PLOT_MARGIN
    margin = f"dict(l={m['l']}, r={m['r']}, t={m['t']}, b={m['b']})"
    L = [
        # The shown prelude is from sympy import * under the default
        # emission, so the block must bind sp itself — and it is true
        # either way: SETUP_PY ran import sympy as sp.
        'import sympy as sp',
        'import numpy as _mc_np',
        'import plotly.graph_objects as go',
        '',
    ]
    # The shown code references the variables and any free names in the
    # expression by name — declare them so the block runs standalone
    # (in the real namespace a name may hold a bound value).
    names = sorted(
        {s.name for s in vars_}
        | {s.name for e in comps for s in e.free_symbols}
    )
    if names:
        L.append(
            f"{', '.join(names)} = sp.symbols('{' '.join(names)}')"
        )
        L.append('')
    helpers = []
    if d == 2 and c == 2:
        helpers = [_MC_PLOT_STREAMLINES_SRC, _MC_PLOT_GRIDLINES_SRC]
    elif d == 2 and c == 3:
        helpers = [_MC_PLOT_GRIDLINES_SRC]
    if plane is not None or zext is not None:
        helpers.append(_MC_PLOT_XYPLANE_SRC)
    for src in helpers:
        L += [src.rstrip(), '']
    L.append(f"fnum = sp.lambdify({params}, {body}, 'numpy')")

    def menu(labels, vis_lists):
        L.append('fig.update_layout(updatemenus=[dict(')
        L.append('    buttons=[')
        for lab, vis in zip(labels, vis_lists):
            L.append(
                f"        dict(label='{lab}', method='update',"
            )
            L.append(
                f'             args=[{{"visible": {vis}}}]),'
            )
        L.append('    ],')
        L.append("    direction='down', x=0, y=1.12,")
        L.append(')])')

    if d == 1:
        L += [
            f'ts = _mc_np.linspace({_MC_PLOT_R1[0]}, {_MC_PLOT_R1[1]},'
            f' {_MC_PLOT_N1})',
            'vals = _mc_np.asarray(fnum(ts), dtype=float)',
            'if vals.ndim == 1:',
            '    vals = vals.reshape(1, -1)',
        ]
        if c == 1:
            L += [
                'fig = go.Figure(go.Scatter(',
                "    x=ts, y=vals[0], mode='lines',",
                f"    line=dict(color='{acc}', width=2),",
                '))',
                'fig.update_xaxes(zeroline=True)',
                'fig.update_yaxes(zeroline=True)',
            ]
        elif c == 2:
            L += [
                'fig = go.Figure(go.Scatter(',
                "    x=vals[0], y=vals[1], mode='lines',",
                f"    line=dict(color='{acc}', width=2),",
                '))',
                'fig.update_xaxes(zeroline=True)',
                "fig.update_yaxes(zeroline=True, scaleanchor='x',"
                ' scaleratio=1)',
            ]
        else:
            L += [
                'fig = go.Figure(go.Scatter3d(',
                '    x=vals[0], y=vals[1], z=vals[2],',
                f"    mode='lines', line=dict(color='{acc}', width=4),",
                '))',
            ]
        if plane is not None:
            L.append(
                f'_mc_plot_xyplane(fig, {plane[0]!r}, {plane[1]!r},'
                f' {plane[2]!r}, {plane[3]!r})'
            )
        if zext is not None:
            L.append(
                f'_mc_plot_zaxis(fig, {zext[0]!r}, {zext[1]!r},'
                f' {zext[2]!r})'
            )
        L.append(f'fig.update_layout(margin={margin}, showlegend=False)')
    else:
        L += [
            f'us = _mc_np.linspace({_MC_PLOT_R2[0]}, {_MC_PLOT_R2[1]},'
            f' {_MC_PLOT_N2})',
            f'vs = _mc_np.linspace({_MC_PLOT_R2[0]}, {_MC_PLOT_R2[1]},'
            f' {_MC_PLOT_N2})',
            'U, V = _mc_np.meshgrid(us, vs)',
            'vals = _mc_np.asarray(fnum(U, V), dtype=float)',
            'if vals.ndim == 2:',
            '    vals = vals.reshape('
            '1, vals.shape[0], vals.shape[1])',
            'mag = _mc_np.sqrt(sum(v * v for v in vals))',
            'fig = go.Figure()',
        ]
        if c == 1:
            L += [
                'fig.add_surface(',
                "    x=us, y=vs, z=vals[0], colorscale='Viridis',",
                '    showscale=False,',
                '    contours=dict(z=dict(',
                '        show=True, usecolormap=True,',
                '        project=dict(z=True))),',
                ')',
                'fig.add_heatmap(',
                '    x=us, y=vs, z=vals[0],'
                " colorscale='Viridis',",
                '    showscale=False, visible=False,',
                ')',
            ]
            menu(
                ['surface', 'heatmap'],
                [[True, False], [False, True]],
            )
        elif c == 2:
            L += [
                'fx, fy = vals[0], vals[1]',
                '# quiver: one scatter of tail→tip segments plus a cone',
                '# per tip',
                'stride = 5',
                'sx, sy, cx, cy, vx, vy = [], [], [], [], [], []',
                'for i in range(0, len(vs), stride):',
                '    for j in range(0, len(us), stride):',
                '        fxx = fx[i][j]',
                '        fyy = fy[i][j]',
                '        if not (_mc_np.isfinite(fxx)'
                ' and _mc_np.isfinite(fyy)):',
                '            continue',
                '        sx += [us[j], us[j] + fxx, None]',
                '        sy += [vs[i], vs[i] + fyy, None]',
                '        cx.append(us[j] + fxx)',
                '        cy.append(vs[i] + fyy)',
                '        vx.append(fxx)',
                '        vy.append(fyy)',
                'span = _mc_np.hypot(us[-1] - us[0], vs[-1] - vs[0])',
                'fig.add_scatter(',
                "    x=sx, y=sy, mode='lines',",
                f"    line=dict(color='{acc}', width=1),",
                "    hoverinfo='skip',",
                ')',
                'fig.add_cone(',
                '    x=cx, y=cy, z=[0] * len(cx), u=vx, v=vy,',
                '    w=[0] * len(vx),',
                "    colorscale='Viridis', sizemode='absolute',",
                '    sizeref=float(span) * 0.4,',
                "    anchor='tail', showscale=False,",
                "    scene='scene2',",
                ')',
                'fig.update_layout(scene2=dict(',
                '    domain=dict(x=[0, 1], y=[0, 1]),',
                '    camera=dict(eye=dict(x=0, y=0, z=1.6)),',
                '    xaxis=dict(visible=False),',
                '    yaxis=dict(visible=False),',
                '    zaxis=dict(range=[-0.5, 0.5], visible=False),',
                '))',
                'fig.add_heatmap(',
                '    x=us, y=vs, z=mag,'
                " colorscale='Viridis',",
                '    showscale=False, visible=False,',
                ')',
                'str_x, str_y = _mc_plot_streamlines(us, vs, fx, fy)',
                'fig.add_scatter(',
                '    x=str_x, y=str_y,'
                " mode='lines',",
                f"    line=dict(color='{acc}', width=1),",
                "    hoverinfo='skip', visible=False,",
                ')',
                'gx, gy, _ = _mc_plot_gridlines(us, vs, fx, fy)',
                'fig.add_scatter(',
                "    x=gx, y=gy, mode='lines',",
                "    line=dict(color='rgba(59,130,246,0.55)',"
                ' width=1),',
                "    hoverinfo='skip', visible=False,",
                ')',
            ]
            menu(
                [
                    'quiver',
                    'magnitude heatmap',
                    'streamlines',
                    'image of grid',
                ],
                [
                    [True, True, False, False, False],
                    [False, False, True, False, False],
                    [False, False, False, True, False],
                    [False, False, False, False, True],
                ],
            )
            L += [
                'fig.update_xaxes(zeroline=True)',
                "fig.update_yaxes(zeroline=True, scaleanchor='x',"
                ' scaleratio=1)',
            ]
        else:
            L += [
                'fx, fy, fz = vals[0], vals[1], vals[2]',
                'fig.add_surface(',
                '    x=fx, y=fy, z=fz, surfacecolor=mag,',
                "    colorscale='Viridis', showscale=False,",
                ')',
                'fig.add_surface(',
                '    x=fx, y=fy, z=fz, surfacecolor=U,',
                "    colorscale='Plasma', showscale=False,",
                '    visible=False,',
                ')',
                'gx, gy, gz = _mc_plot_gridlines(us, vs, fx, fy, fz)',
                'fig.add_scatter3d(',
                "    x=gx, y=gy, z=gz, mode='lines',",
                "    line=dict(color='rgba(59,130,246,0.7)', width=2),",
                "    hoverinfo='skip', visible=False,",
                ')',
                'fig.add_scatter3d(',
                '    x=fx.ravel(), y=fy.ravel(), z=fz.ravel(),',
                "    mode='markers',",
                f'    marker=dict(size=2, color={acc!r}),'
                ' visible=False,',
                ')',
            ]
            menu(
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
        if plane is not None:
            L.append(
                f'_mc_plot_xyplane(fig, {plane[0]!r}, {plane[1]!r},'
                f' {plane[2]!r}, {plane[3]!r})'
            )
        if zext is not None:
            L.append(
                f'_mc_plot_zaxis(fig, {zext[0]!r}, {zext[1]!r},'
                f' {zext[2]!r})'
            )
        L.append(f'fig.update_layout(margin={margin}, showlegend=False)')
    L += [
        '# the figure dict the frontend hands to plotly.js',
        'fig.to_json()',
    ]
    return '\\n'.join(L)


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
    fig, plane, zext = _mc_plot_figure(d, c, vars_, comps)
    return {
        'plot': {
            'kind': f'{d}x{c}',
            'vars': [s.name for s in vars_],
            'label': label,
            # The figure dict the plotly python library emits — the
            # frontend applies theme overrides and hands it to
            # plotly.js as-is.
            'figure': json.loads(fig.to_json()),
        },
        # The literal program that built the figure, for the cell's
        # generating-code block.
        'code': _mc_plot_code(d, c, vars_, comps, plane, zext),
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
                res = _mc_plot_payload(val['expr'])
                out.append({'ok': True, 'plot': res['plot'], 'code': res['code']})
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
// (scripts/make-pyodide-snapshot.cjs) with sympy already loaded —
// restoring it skips the multi-second imports; numpy and plotly are
// repopulated on top of it at boot (numpy via loadPackage, plotly by
// unzipping the vendored wheel), so no micropip/PyPI install runs.
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
    if (!resp?.ok) continue;
    let buf: ArrayBuffer;
    try {
      buf = await resp.arrayBuffer();
      // Some dev servers tag .gz assets with Content-Encoding: gzip and
      // fetch has then already decoded for us; sniff the bytes instead
      // of trusting the filename or headers — gzip starts 1f 8b, a
      // snapshot starts with its own magic.
      if (
        buf.byteLength > 2 &&
        new DataView(buf).getUint16(0, true) === 0x8b1f &&
        typeof DecompressionStream !== 'undefined'
      )
        buf = await new Response(
          new Blob([buf])
            .stream()
            .pipeThrough(new DecompressionStream('gzip')),
        ).arrayBuffer();
    } catch (err) {
      console.warn(`[calc] snapshot ${file} unusable:`, err);
      continue;
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
      // for lazy imports. plotly is not a built-in, so its files are
      // repopulated by unzipping the vendored wheel the same way
      // loadPackage would (numpy stays out of the image on purpose —
      // its .so modules would be dead pointers after the restore).
      await py.loadPackage(['sympy', 'numpy', 'narwhals', 'packaging']);
      const wheelResp = await fetch(
        `${snapshotBase}wheels/${PLOTLY_WHEEL}`,
      );
      if (wheelResp.ok) {
        py.FS.writeFile(
          `/tmp/${PLOTLY_WHEEL}`,
          new Uint8Array(await wheelResp.arrayBuffer()),
        );
        await py.runPythonAsync(
          `import sysconfig, zipfile\nzipfile.ZipFile('/tmp/${PLOTLY_WHEEL}').extractall(sysconfig.get_paths()['purelib'])`,
        );
      }
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
