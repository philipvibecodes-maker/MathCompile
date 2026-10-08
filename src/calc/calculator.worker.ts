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
  /** Exec-only statements (defs-only python source) — the code execs
   * for its bindings and the row is a marker the client drops, so
   * nothing displays. */
  silent?: boolean;
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
  // A lazy package download started/finished — the eval watchdog on the
  // main thread tolerates these like it tolerates the engine boot.
  | { type: 'pkg-loading' }
  | { type: 'pkg-loaded' }
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


def _mc_plot_ranges(dom):
    # The marker's {name: (lo, hi)} dict from the statement's for-clause —
    # coerce ends to floats, keep None (the signature default fills it
    # later), drop pairs that can't be read at all.
    out = {}
    if isinstance(dom, dict):
        for name, pair in dom.items():
            try:
                lo, hi = pair
                lo = None if lo is None else float(lo)
                hi = None if hi is None else float(hi)
            except Exception:
                continue
            out[str(name)] = (lo, hi)
    return out


def _mc_rng(ranges, name, dflt):
    # One variable's effective (lo, hi): the domain's ends override the
    # signature default; a reversed or non-finite pair falls back
    # wholesale.
    import math as _mc_math
    lo, hi = ranges.get(name, (None, None))
    lo = dflt[0] if lo is None else lo
    hi = dflt[1] if hi is None else hi
    if not (lo < hi and _mc_math.isfinite(lo) and _mc_math.isfinite(hi)):
        return dflt
    return (lo, hi)


_MC_PLOT_ACC = '#3b82f6'
_MC_PLOT_MARGIN = dict(l=40, r=10, t=30, b=40)


def _mc_plot_menu(fig, labels, vis_lists, relayouts=None):
    # One updatemenu driving trace visibility — the several views of the
    # same signature (surface vs heatmap, field vs grid-image). When a
    # view carries a matching relayout dict it rides along as the
    # button's second 'update' arg, so switching modes can reframe the
    # axes (the grid image usually outruns the domain window). Appends:
    # the scene's aspect dropdown is already a menu on the same row.
    if relayouts is None:
        relayouts = [None] * len(labels)
    menus = list(fig.layout.updatemenus or ())
    menus.append(dict(
        buttons=[
            dict(label=lab, method='update',
                 args=[{'visible': vis}] + ([rel] if rel else []))
            for lab, vis, rel in zip(labels, vis_lists, relayouts)
        ],
        direction='down',
        x=0.075, xanchor='left',
        y=1.12,
    ))
    fig.update_layout(updatemenus=menus)
    fig.add_annotation(
        xref='paper', yref='paper', x=0.068, y=1.125,
        xanchor='right', yanchor='top', showarrow=False,
        text='mode', font=dict(size=11))


# The Desmos-3D scene helpers are exec'd from a source string so the
# generating-code block can show the same text that ran (the helper
# source gets appended to the shown program).
_MC_DESMOS_SRC = '''def _mc_pad(lo, hi):
    # Headroom so the axis letters past each arrow tip aren't clipped.
    s = hi - lo
    return lo - 0.04 * s, hi + 0.16 * s


def _mc_grid_step(span):
    # The xy-plane gridline pitch — an integer step for ordinary spans,
    # a 1/2/5-times-power-of-ten step for big ones.
    import math as _mc_math
    if span <= 0 or not _mc_math.isfinite(span):
        return 1.0
    raw = span / 10.0
    mag = 10.0 ** _mc_math.floor(_mc_math.log10(raw))
    for m in (1.0, 2.0, 5.0, 10.0):
        if raw <= m * mag:
            return m * mag
    return 10.0 * mag


def _mc_fmt(v):
    iv = int(round(v))
    return str(iv) if abs(v - iv) < 1e-9 else '%g' % v


def _mc_extent(a):
    # (min, max) of the finite samples, or a sane fallback when the
    # whole array blew up (poles, division by zero everywhere).
    import numpy as _mc_np
    if _mc_np.isfinite(a).any():
        return float(_mc_np.nanmin(a)), float(_mc_np.nanmax(a))
    return -1.0, 1.0


def _mc_desmos_bounds(*extents):
    # ((x0,x1),(y0,y1),(z0,z1)) from per-axis (lo,hi) extents — a
    # degenerate axis opens to half of the widest span so proportional
    # aspectmodes keep a sane box.
    span = max(hi - lo for lo, hi in extents)
    if span <= 0:
        span = 2.0
    out = []
    for lo, hi in extents:
        if hi - lo <= 0:
            mid = (hi + lo) / 2.0
            lo, hi = mid - span / 2.0, mid + span / 2.0
        out.append((lo, hi))
    return tuple(out)


def _mc_desmos_grid(fig, bounds, step):
    # Integer gridlines on z=0 — one NaN-separated Scatter3d for all of
    # them, plus a thicker copy at the axis-label positions (0 and
    # +-half-extent) making the labeled lines heavier. Drawn before the
    # translucent sheet, which composites over them.
    import math as _mc_math
    (x0, x1), (y0, y1), _ = bounds
    xs, ys, zs = [], [], []
    gx = _mc_math.ceil(x0 / step) * step
    while gx <= x1 + step * 1e-6:
        xs += [gx, gx, None]
        ys += [y0, y1, None]
        zs += [0.0, 0.0, None]
        gx += step
    gy = _mc_math.ceil(y0 / step) * step
    while gy <= y1 + step * 1e-6:
        xs += [x0, x1, None]
        ys += [gy, gy, None]
        zs += [0.0, 0.0, None]
        gy += step
    fig.add_scatter3d(
        x=xs, y=ys, z=zs, mode='lines',
        line=dict(color='rgba(0,0,0,0.16)', width=1),
        hoverinfo='skip', name='wallgrid')
    tx, ty, tz = [], [], []
    for p in (0.0, -(x1 - x0) / 2.0, (x1 - x0) / 2.0):
        if x0 <= p <= x1:
            tx += [p, p, None]
            ty += [y0, y1, None]
            tz += [0.0, 0.0, None]
    for p in (0.0, -(y1 - y0) / 2.0, (y1 - y0) / 2.0):
        if y0 <= p <= y1:
            tx += [x0, x1, None]
            ty += [p, p, None]
            tz += [0.0, 0.0, None]
    fig.add_scatter3d(
        x=tx, y=ty, z=tz, mode='lines',
        line=dict(color='rgba(0,0,0,0.16)', width=3),
        hoverinfo='skip', name='wallgrid')


def _mc_desmos_box(fig, bounds):
    # The 12 wireframe edges of the scene cube.
    (x0, x1), (y0, y1), (z0, z1) = bounds
    xs, ys, zs = [], [], []
    for y in (y0, y1):
        for z in (z0, z1):
            xs += [x0, x1, None]
            ys += [y, y, None]
            zs += [z, z, None]
    for x in (x0, x1):
        for z in (z0, z1):
            xs += [x, x, None]
            ys += [y0, y1, None]
            zs += [z, z, None]
    for x in (x0, x1):
        for y in (y0, y1):
            xs += [x, x, None]
            ys += [y, y, None]
            zs += [z0, z1, None]
    fig.add_scatter3d(
        x=xs, y=ys, z=zs, mode='lines',
        line=dict(color='#e3e3e3', width=1.5),
        hoverinfo='skip', name='box')


def _mc_desmos_axes(fig, bounds):
    # Per axis: a line lo->hi through the origin, a cone arrowhead at
    # the positive end, the axis letter ~9% past the tip, and tick
    # labels at 0 and +-half-extent (rounded to the grid step so the
    # labels read 1, 9, ... rather than the raw sampled extents).
    import math as _mc_math
    # Arrowheads scale with the xy-plane span — the grid they sit over —
    # not the widest axis: a tall z range (z = (xy)^2 tops 80 on a
    # +-3 plane) would otherwise blow the cones up to match it.
    sizeref = 0.022 * max(bounds[0][1] - bounds[0][0],
                          bounds[1][1] - bounds[1][0])
    for i, letter in enumerate(('x', 'y', 'z')):
        lo, hi = bounds[i]
        half = (hi - lo) / 2.0
        step = _mc_grid_step(hi - lo)
        decimals = max(0, -int(_mc_math.floor(_mc_math.log10(step))))
        # Two-element coords on every axis — a 1-element constant next
        # to the 2-element stem is a mismatched trace plotly drops
        # silently (the stems never drew; the plane's heavy gridlines
        # at 0 passed for them).
        line = [[0.0, 0.0], [0.0, 0.0], [0.0, 0.0]]
        line[i] = [lo, hi]
        fig.add_scatter3d(
            x=line[0], y=line[1], z=line[2], mode='lines',
            line=dict(color='#9d9d9d', width=3),
            hoverinfo='skip', name='axis')
        tip = [[0.0], [0.0], [0.0]]
        tip[i] = [hi]
        uvw = [[0.0], [0.0], [0.0]]
        uvw[i] = [1.0]
        fig.add_cone(
            x=tip[0], y=tip[1], z=tip[2],
            u=uvw[0], v=uvw[1], w=uvw[2],
            colorscale=[[0.0, '#9d9d9d'], [1.0, '#9d9d9d']],
            showscale=False, sizemode='absolute', sizeref=sizeref,
            # Tail-anchored: the head starts where the stem and grid
            # end instead of overlapping the axis's last stretch.
            anchor='tail', hoverinfo='skip', name='axis')
        lp = [[0.0], [0.0], [0.0]]
        lp[i] = [hi + 0.09 * (hi - lo)]
        fig.add_scatter3d(
            x=lp[0], y=lp[1], z=lp[2], mode='text',
            text=['<b>%s</b>' % letter],
            textfont=dict(color='#9d9d9d', size=17),
            hoverinfo='skip', name='axis')
        tp = [[], [], []]
        labels = []
        for p in (-half, 0.0, half):
            if lo <= p <= hi:
                tp[i].append(p)
                tp[(i + 1) % 3].append(0.0)
                tp[(i + 2) % 3].append(0.0)
                labels.append(_mc_fmt(round(p, decimals)))
        fig.add_scatter3d(
            x=tp[0], y=tp[1], z=tp[2], mode='text',
            text=labels, textfont=dict(color='#8c8c8c', size=12),
            # x/y sit flat in the plane where 'top center' reads right;
            # the z stem is near-vertical on screen, so its labels need
            # a sideways anchor or they straddle the line.
            textposition='middle left' if i == 2 else 'top center',
            hoverinfo='skip', name='ticks')


def _mc_desmos_surf(fig, X, Y, Z):
    # The graph itself: flat brick red, integer contour gridlines on
    # the surface (solid hex only — an rgba() contour color silently
    # falls back to white), and lighting tuned for curvature
    # readability.
    import numpy as _mc_np
    fig.add_surface(
        x=X, y=Y, z=Z,
        colorscale=[[0.0, '#c74440'], [1.0, '#c74440']],
        showscale=False,
        lighting=dict(ambient=0.25, diffuse=0.75, specular=0.325,
                      roughness=0.45, fresnel=0.0),
        lightposition=dict(x=-1400, y=-800, z=3200),
        contours=dict(
            x=dict(show=True, start=float(_mc_np.nanmin(X)),
                   end=float(_mc_np.nanmax(X)),
                   # Half the decor-grid pitch — twice the gridline
                   # density reads better at the shorter default height.
                   size=_mc_grid_step(
                       float(_mc_np.nanmax(X) - _mc_np.nanmin(X))) / 2,
                   color='#7e1f1a', width=1, highlight=False),
            y=dict(show=True, start=float(_mc_np.nanmin(Y)),
                   end=float(_mc_np.nanmax(Y)),
                   size=_mc_grid_step(
                       float(_mc_np.nanmax(Y) - _mc_np.nanmin(Y))) / 2,
                   color='#7e1f1a', width=1, highlight=False),
            z=dict(show=False, highlight=False),
        ),
        hovertemplate='x: %{x:.2f}<br>y: %{y:.2f}<br>'
                      'z: %{z:.2f}<extra></extra>',
        name='surf')


def _mc_desmos_sheet(fig, bounds):
    # The translucent z=0 sheet — added LAST so it composites over the
    # surface and mutes the below-plane region. The page removes its
    # pick slot so hovers reach the surface through it.
    (x0, x1), (y0, y1), _ = bounds
    fig.add_surface(
        x=[[x0, x1], [x0, x1]],
        y=[[y0, y0], [y1, y1]],
        z=[[0.0, 0.0], [0.0, 0.0]],
        colorscale=[[0.0, '#d9d9d9'], [1.0, '#d9d9d9']],
        showscale=False, opacity=0.5,
        lighting=dict(ambient=1.0, diffuse=0.0, specular=0.0,
                      roughness=1.0, fresnel=0.0),
        contours=dict(
            x=dict(show=False, highlight=False),
            y=dict(show=False, highlight=False),
            z=dict(show=False, highlight=False)),
        hoverinfo='none', name='xysheet')


def _mc_desmos_decor(fig, bounds):
    # Everything but the data traces and the sheet — plane grid, box,
    # axes — in the guide's order so the sheet lands last.
    _mc_desmos_grid(fig, bounds, _mc_grid_step(
        max(bounds[0][1] - bounds[0][0], bounds[1][1] - bounds[1][0])))
    _mc_desmos_box(fig, bounds)
    _mc_desmos_axes(fig, bounds)


def _mc_aspect_menu(fig, bounds):
    # Aspect dropdown, just right of the mode menu at the left end of
    # the menu row — the right end is where the plotly modebar floats.
    # All four scene aspectmodes: 'cube' (equal box), 'data' (true
    # 1:1:1 units), 'manual' (data proportions clamped at 4:1 so
    # extreme ranges stay readable), 'auto' (plotly's self-limiting
    # fit — the default). A relayout touches only the mode/ratio —
    # uirevision keeps the camera.
    spans = [b[1] - b[0] for b in bounds]
    small = min((s for s in spans if s > 0), default=1.0)
    clamped = {ax: min(s, 4 * small) for ax, s in zip('xyz', spans)}
    buttons = [
        dict(label='cube', method='relayout',
             args=[{'scene.aspectmode': 'cube'}]),
        dict(label='data', method='relayout',
             args=[{'scene.aspectmode': 'data'}]),
        dict(label='manual', method='relayout',
             args=[{'scene.aspectmode': 'manual',
                    'scene.aspectratio': clamped}]),
        dict(label='auto', method='relayout',
             args=[{'scene.aspectmode': 'auto'}]),
    ]
    menus = list(fig.layout.updatemenus or ())
    menus.append(dict(
        buttons=buttons, direction='down',
        active=3,  # 'auto' — the built scene's aspectmode
        x=0.29, xanchor='left', y=1.12,
    ))
    fig.update_layout(updatemenus=menus)
    fig.add_annotation(
        xref='paper', yref='paper', x=0.283, y=1.125,
        xanchor='right', yanchor='top', showarrow=False,
        text='aspect', font=dict(size=11))


def _mc_desmos_scene(fig, bounds):
    # Hide all stock scene chrome — everything visible is custom — and
    # take the Desmos camera. The ranges get pad() headroom so the axis
    # letters past each arrow tip aren't clipped. aspectmode 'auto' is
    # data-proportional but self-limiting — at extreme ratios 'data'
    # (literal 1:1:1) needle-thins the scene and gl3d starts dropping
    # text labels; it's still reachable from the aspect menu.
    fig.update_layout(scene=dict(
        xaxis=dict(visible=False, range=list(_mc_pad(*bounds[0]))),
        yaxis=dict(visible=False, range=list(_mc_pad(*bounds[1]))),
        zaxis=dict(visible=False, range=list(_mc_pad(*bounds[2]))),
        aspectmode='auto',
        camera=dict(
            eye=dict(x=0.35, y=-1.6, z=0.78),
            up=dict(x=0, y=0, z=1)),
    ))
    _mc_aspect_menu(fig, bounds)


'''

# Mode-menu helpers shared by every multi-view figure. Kept out of
# _MC_DESMOS_SRC so the shown program for a 2-D multi-mode figure can
# include just this block instead of the whole scene-helper source.
_MC_VIEWS_SRC = '''_MC_SCENE_NAMES = ('wallgrid', 'box', 'axis', 'ticks', 'xysheet')


def _mc_mode_vis(fig, data_names, scene=True):
    # A mode-menu button's visible list: the mode's own data traces,
    # plus the scene decor unless the mode is a 2-D view (the heatmap
    # button) — the slab and box can't float over the flat subplot.
    shown = set(data_names)
    return [
        t.name in shown or (scene and t.name in _MC_SCENE_NAMES)
        for t in fig.data
    ]


def _mc_range_rel(box):
    # A mode button's relayout arg: the axis ranges that frame that
    # view's content. box is (x0, x1, y0, y1) — a view builder's
    # returned extent, or None when it drew nothing (no relayout then).
    if box is None:
        return None
    return {'xaxis.range': [box[0], box[1]],
            'yaxis.range': [box[2], box[3]]}


'''

# ————————————————————————————————————————————————————————————————————
# ℝ²→ℝ² views. A 2-in/2-out signature draws one figure with both views
# behind the mode menu: the quiver field (arrows at domain grid points)
# and the image of the domain grid under the map. Each builder appends
# its own named traces; the *_NAMES tuples are the menu's visibility
# keys — every trace a view adds must be named there.
#
# Helper defaults mirror the module constants so the shown program —
# which includes these source strings verbatim — runs standalone.
# _mc_plot_figure still passes the module constants explicitly.

_MC_PLOT_NF = 9           # arrows per axis on the field view
_MC_PLOT_GLINES = 10      # horizontal grid lines on the image view
_MC_PLOT_NGPTS = 160      # samples along each image-view grid line
_MC_PLOT_FIELD = '#3b82f6'
_MC_PLOT_FSCALE = 1.5     # quiver lengthfactor — arrow length vs cell
_MC_PLOT_IMG = '#3b82f6'
_MC_PLOT_SRC = '#8c8c8c'

_MC_FIELD_SRC = '''_MC_FIELD_NAMES = ('field',)


def _mc_field_view(fig, fnum, rng=((-3.0, 3.0), (-3.0, 3.0)), n=9,
                   color='#3b82f6', scale=1.5):
    # Quiver view of the vector field: the native go.Quiver trace —
    # one arrow per point of an n x n uniform grid over rng (a per-axis
    # ((x0,x1),(y0,y1)) pair, so a for-domain reshapes the grid), anchored at its center on the grid point and scaled by
    # plotly's 'scaled' lengthmode (the longest arrow is normalized
    # against the point density, so 'scale' multiplies the cell-pitch
    # length without us measuring magnitudes). Grid points where the
    # field isn't finite are dropped — a missing arrow is the honest
    # draw for a pole. The hover reports the vector itself. Returns
    # (x0, x1, y0, y1) framing the drawn arrows — the rng box padded
    # by half a cell. Plain lists (not numpy) so the figure JSON keeps
    # readable arrays ECharts can segment for the bridge window.
    import numpy as _mc_np
    rx, ry = rng
    us = _mc_np.linspace(rx[0], rx[1], n)
    vs = _mc_np.linspace(ry[0], ry[1], n)
    U, V = _mc_np.meshgrid(us, vs)
    w = _mc_np.asarray(fnum(U, V), dtype=float)
    if w.ndim == 1:
        # A constant field lambdifies to a flat (2,) — reshape so the
        # broadcast below stretches it over the grid.
        w = w.reshape(-1, 1, 1)
    elif w.ndim == 2:
        w = w.reshape(1, w.shape[0], w.shape[1])
    elif w.ndim > 3:
        # Matrix components lambdify with a singleton axis — (2,1,n,n);
        # the grid axes are always the last two.
        w = w.reshape(w.shape[0], w.shape[-2], w.shape[-1])
    w = _mc_np.broadcast_to(w, (2,) + U.shape)
    FU, FV = w[0].astype(float), w[1].astype(float)
    pitchx = (rx[1] - rx[0]) / (n - 1)
    pitchy = (ry[1] - ry[0]) / (n - 1)
    ok = _mc_np.isfinite(_mc_np.hypot(FU, FV))
    fig.add_quiver(
        x=U[ok].tolist(), y=V[ok].tolist(),
        u=FU[ok].tolist(), v=FV[ok].tolist(),
        name='field', anchor='center', lengthfactor=scale,
        marker=dict(color=color),
        hovertemplate='x: %{x:.2f} y: %{y:.2f}<br>'
                      'F = (%{u:.2f}, %{v:.2f})<extra></extra>')
    return (rx[0] - 0.5 * pitchx, rx[1] + 0.5 * pitchx,
            ry[0] - 0.5 * pitchy, ry[1] + 0.5 * pitchy)
'''

_MC_GRIDIMG_SRC = '''_MC_GRIDIMG_NAMES = ('image of square', 'image of y = k')


def _mc_gridimg_view(fig, fnum, rng=((-3.0, 3.0), (-3.0, 3.0)),
                     nlines=10, npts=160, color='#3b82f6',
                     src='#8c8c8c'):
    # Image-of-grid view: the input is the whole rng box (a per-axis
    # ((x0,x1),(y0,y1)) pair — a for-domain reshapes it from the
    # square default) — a filled patch ('input square') the view's
    # 'input square' checkbox toggles via meta.inputToggle, so it
    # stays out of _MC_GRIDIMG_NAMES and the mode menu never touches
    # it. Under the map: 'image of square' fills the mapped boundary
    # and 'image of y = k' draws the images of the horizontal grid
    # lines y = k. Traces start hidden. Returns ((x0, x1, y0, y1),
    # desc) — the finite image extent padded ~6% per side, plus a
    # description of the input for the mode's annotation label; box
    # is None when nothing finite sampled.
    import math as _mc_math
    import numpy as _mc_np

    rx, ry = rng
    x0, x1 = rx
    y0, y1 = ry
    nan = float('nan')
    # Always 'nlines' horizontal grid lines, evenly spaced across the
    # window — the count is fixed so a for-domain resizes the spacing,
    # not the line count.
    ks = [float(k) for k in _mc_np.linspace(y0, y1, nlines)]
    desc = (f'input: [{x0:g},{x1:g}]×[{y0:g},{y1:g}] — line images at '
            f'y = {ks[0]:g}, {ks[1]:g}, …, {ks[-1]:g}'
            if len(ks) > 1 else
            f'input: [{x0:g},{x1:g}]×[{y0:g},{y1:g}] — line at '
            f'y = {ks[0]:g}')
    ts = _mc_np.linspace(x0, x1, npts)
    ty = _mc_np.linspace(y0, y1, npts)

    def comps_at(xin, yin):
        # The two image components along one sampled curve — lambdify
        # can return a tuple, a nested list (Matrix), or broadcast a
        # constant component to a scalar; normalize each to a length-n
        # array. Non-finite coords become NaN so the polyline gaps at
        # poles instead of streaking across the plot.
        n = xin.shape[0]
        out = fnum(xin, yin)
        parts = []
        for i in range(2):
            a = _mc_np.asarray(out[i], dtype=float).reshape(-1)
            if a.size == 1:
                a = _mc_np.full(n, float(a[0]))
            parts.append(
                _mc_np.where(_mc_np.isfinite(a), a, nan))
        return parts[0], parts[1]

    # The input box: a filled patch — checkbox-owned (meta
    # .inputToggle), so neither mode button's vis list touches it.
    fig.add_scatter(
        x=[x0, x1, x1, x0, x0], y=[y0, y0, y1, y1, y0],
        mode='lines', name='input square', fill='toself',
        fillcolor='rgba(140,140,140,0.12)',
        line=dict(color=src, width=1.5),
        visible=False, showlegend=True, legendrank=2000,
        hoverinfo='skip', meta=dict(inputToggle=True))

    # The input's horizontal grid lines y = k inside the square —
    # also checkbox-owned, and legend-ordered below the square.
    gx, gy = [], []
    for k in ks:
        gx += [x0, x1, nan]
        gy += [k, k, nan]
    fig.add_scatter(
        x=gx, y=gy, mode='lines', name='input y = k',
        line=dict(color=src, width=1),
        visible=False, showlegend=True, legendrank=2001,
        hoverinfo='skip', meta=dict(inputToggle=True))

    fx, fy = [], []   # finite image samples, for the framing box

    # The box's boundary, mapped: (t, y0) → (x1, t) → (t, y1) →
    # (x0, t) walks one closed loop, so its fill is the image region.
    bx_in = _mc_np.concatenate(
        [ts, _mc_np.full_like(ty, x1), ts[::-1],
         _mc_np.full_like(ty, x0)])
    by_in = _mc_np.concatenate(
        [_mc_np.full_like(ts, y0), ty, _mc_np.full_like(ts, y1),
         ty[::-1]])
    bx, by = comps_at(bx_in, by_in)
    fin = _mc_np.isfinite(bx) & _mc_np.isfinite(by)
    fx.append(bx[fin])
    fy.append(by[fin])
    fig.add_scatter(
        x=list(bx), y=list(by), mode='lines', name='image of square',
        fill='toself', fillcolor='rgba(59,130,246,0.10)',
        line=dict(color=color, width=2),
        visible=False, showlegend=True, hoverinfo='skip')

    # The images of the horizontal lines y = k — one NaN-separated
    # polyline; the verticals' images are omitted.
    xs, ys = [], []
    for k in ks:
        cx, cy = comps_at(ts, _mc_np.full_like(ts, k))
        fin = _mc_np.isfinite(cx) & _mc_np.isfinite(cy)
        fx.append(cx[fin])
        fy.append(cy[fin])
        xs += list(cx) + [nan]
        ys += list(cy) + [nan]
    fig.add_scatter(
        x=xs, y=ys, mode='lines', name='image of y = k',
        line=dict(color=color, width=1.5),
        visible=False, showlegend=True, hoverinfo='skip')

    ax = _mc_np.concatenate(fx)
    ay = _mc_np.concatenate(fy)
    if ax.size == 0:
        return None, desc
    x0, x1 = float(ax.min()), float(ax.max())
    y0, y1 = float(ay.min()), float(ay.max())
    # ~6% padding per side — with a floor so a degenerate image (a
    # constant map, a point) still frames to a viewable window.
    px = max(0.06 * (x1 - x0), 0.5)
    py = max(0.06 * (y1 - y0), 0.5)
    return (x0 - px, x1 + px, y0 - py, y1 + py), desc
'''

exec(_MC_VIEWS_SRC)
exec(_MC_DESMOS_SRC)
exec(_MC_FIELD_SRC)
exec(_MC_GRIDIMG_SRC)

# Shared with the shown generating-code block: lambdify hands back a
# list of per-component values and a constant component stays a
# scalar, so broadcast every row onto the grid shape or np.asarray
# dies on the inhomogeneous list.
_MC_ROWS_SRC = '''
def _mc_rows(raw, shape):
    import numpy as _np

    if isinstance(raw, _np.ndarray) and raw.dtype != object:
        raw = [raw]
    return _np.stack(
        [_np.broadcast_to(_np.asarray(v, dtype=float), shape)
         for v in raw])
'''

exec(_MC_ROWS_SRC)


def _mc_plot_figure(d, c, vars_, comps, ranges):
    # Sample the components and build the plotly figure for the
    # signature. Non-finite samples stay NaN — plotly gaps on them,
    # which is what makes poles/asymptotes break cleanly. 'ranges'
    # carries any for-clause domain bounds the user wrote.
    import numpy as _mc_np
    import plotly.graph_objects as go

    fnum = sp.lambdify(vars_, comps, 'numpy')
    acc = _MC_PLOT_ACC
    if d == 1:
        r1 = _mc_rng(ranges, vars_[0].name, _MC_PLOT_R1)
        ts = _mc_np.linspace(r1[0], r1[1], _MC_PLOT_N1)
        vals = _mc_rows(fnum(ts), ts.shape)
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
            # R3 curve inside the Desmos scene: plane grid, box, arrow
            # axes first, the curve, the translucent sheet last.
            fig = go.Figure()
            bounds = _mc_desmos_bounds(
                _mc_extent(vals[0]), _mc_extent(vals[1]),
                _mc_extent(vals[2]))
            _mc_desmos_decor(fig, bounds)
            fig.add_scatter3d(
                x=vals[0], y=vals[1], z=vals[2], mode='lines',
                line=dict(color=acc, width=4), name='curve',
                hovertemplate='x: %{x:.2f}<br>y: %{y:.2f}<br>'
                              'z: %{z:.2f}<extra></extra>')
            _mc_desmos_sheet(fig, bounds)
            _mc_desmos_scene(fig, bounds)
            fig.update_layout(margin=_MC_PLOT_MARGIN, showlegend=False)
            return fig, bounds
        fig.update_layout(margin=_MC_PLOT_MARGIN, showlegend=False)
        return fig, None

    ru = _mc_rng(ranges, vars_[0].name, _MC_PLOT_R2)
    rv = _mc_rng(ranges, vars_[1].name, _MC_PLOT_R2)
    us = _mc_np.linspace(ru[0], ru[1], _MC_PLOT_N2)
    vs = _mc_np.linspace(rv[0], rv[1], _MC_PLOT_N2)
    U, V = _mc_np.meshgrid(us, vs)
    fig = go.Figure()
    if c == 2:
        # ℝ²→ℝ² — the quiver field and the image of the domain grid
        # live in one figure behind the mode menu ('field' default,
        # 'image' hidden). Each view samples its own grid through fnum
        # and reports the box framing it — the default mode's box sets
        # the initial ranges, the menu buttons' relayout args reframe
        # on a switch (the image usually outruns the domain window).
        # Equal aspect so arrows and mapped lines don't distort.
        fbox = _mc_field_view(
            fig, fnum, (ru, rv), _MC_PLOT_NF, _MC_PLOT_FIELD,
            _MC_PLOT_FSCALE)
        ibox, idesc = _mc_gridimg_view(
            fig, fnum, (ru, rv), _MC_PLOT_GLINES, _MC_PLOT_NGPTS,
            _MC_PLOT_IMG, _MC_PLOT_SRC)
        box = fbox if fbox is not None else (
            ru[0], ru[1], rv[0], rv[1])
        fig.update_xaxes(zeroline=True, range=[box[0], box[1]])
        fig.update_yaxes(
            zeroline=True, scaleanchor='x', scaleratio=1,
            range=[box[2], box[3]])
        # The image mode annotates which input grid was mapped and
        # turns the legend on; the field button's relayout clears both
        # on a switch back.
        frel = _mc_range_rel(fbox) or {}
        frel['annotations'] = []
        frel['showlegend'] = False
        irel = _mc_range_rel(ibox) or {}
        irel['annotations'] = [dict(
            text=idesc, xref='paper', yref='paper',
            x=0.02, y=0.98, xanchor='left', yanchor='top',
            showarrow=False, font=dict(size=12))]
        irel['showlegend'] = True
        _mc_plot_menu(
            fig, ['field', 'image'],
            [_mc_mode_vis(fig, _MC_FIELD_NAMES, scene=False),
             _mc_mode_vis(fig, _MC_GRIDIMG_NAMES, scene=False)],
            [frel, irel])
        fig.update_layout(margin=_MC_PLOT_MARGIN, showlegend=False)
        return fig, None
    vals = _mc_rows(fnum(U, V), U.shape)
    if c == 3:
        # Parametric surface: x/y/z are the component grids — the image
        # of the domain, not axis vectors plus a heightfield.
        bounds = _mc_desmos_bounds(
            _mc_extent(vals[0]), _mc_extent(vals[1]),
            _mc_extent(vals[2]))
        _mc_desmos_decor(fig, bounds)
        _mc_desmos_surf(fig, vals[0], vals[1], vals[2])
        _mc_desmos_sheet(fig, bounds)
        _mc_desmos_scene(fig, bounds)
        fig.update_layout(margin=_MC_PLOT_MARGIN, showlegend=False)
        return fig, bounds
    bounds = _mc_desmos_bounds(
        (float(us[0]), float(us[-1])),
        (float(vs[0]), float(vs[-1])),
        _mc_extent(vals[0]))
    _mc_desmos_decor(fig, bounds)
    _mc_desmos_surf(fig, us, vs, vals[0])
    fig.add_heatmap(
        x=us, y=vs, z=vals[0], colorscale='Viridis', showscale=False,
        visible=False, name='heatmap',
    )
    _mc_desmos_sheet(fig, bounds)
    _mc_desmos_scene(fig, bounds)
    _mc_plot_menu(
        fig, ['surface', 'heatmap'],
        [_mc_mode_vis(fig, ('surf',)),
         _mc_mode_vis(fig, ('heatmap',), scene=False)])
    fig.update_layout(margin=_MC_PLOT_MARGIN, showlegend=False)
    return fig, bounds


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


def _mc_plot_code(d, c, vars_, comps, bounds, ranges):
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
    helpers = [_MC_ROWS_SRC]
    if bounds is not None:
        helpers.append(_MC_DESMOS_SRC)
        helpers.append(_MC_VIEWS_SRC)
    if d == 2 and c == 2:
        helpers.append(_MC_VIEWS_SRC)
        helpers.append(_MC_FIELD_SRC)
        helpers.append(_MC_GRIDIMG_SRC)
    for src in helpers:
        L += [src.rstrip(), '']
    L.append(f"fnum = sp.lambdify({params}, {body}, 'numpy')")

    def menu(labels, vis_exprs, rel_exprs=None):
        # rel_exprs: parallel list of relayout code strings (or None) —
        # a button's second 'update' arg, matching _mc_plot_menu's
        # runtime signature.
        if rel_exprs is None:
            rel_exprs = [None] * len(labels)
        L.append('fig.update_layout(updatemenus=[dict(')
        L.append('    buttons=[')
        for lab, vis, rel in zip(labels, vis_exprs, rel_exprs):
            extra = f', {rel}' if rel is not None else ''
            L.append(
                f"        dict(label='{lab}', method='update',"
            )
            L.append(
                f'             args=[{{"visible": {vis}}}{extra}]),'
            )
        L.append('    ],')
        L.append("    direction='down', x=0.075, xanchor='left', y=1.12,")
        L.append(')])')
        L.append('fig.add_annotation(')
        L.append("    xref='paper', yref='paper', x=0.068, y=1.125,")
        L.append("    xanchor='right', yanchor='top', showarrow=False,")
        L.append("    text='mode', font=dict(size=11))")

    if d == 1:
        r1 = _mc_rng(ranges, vars_[0].name, _MC_PLOT_R1)
        L += [
            f'ts = _mc_np.linspace({r1[0]}, {r1[1]},'
            f' {_MC_PLOT_N1})',
            'vals = _mc_rows(fnum(ts), ts.shape)',
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
                'fig = go.Figure()',
                'bounds = _mc_desmos_bounds(',
                '    _mc_extent(vals[0]), _mc_extent(vals[1]),',
                '    _mc_extent(vals[2]))',
                '_mc_desmos_decor(fig, bounds)',
                'fig.add_scatter3d(',
                "    x=vals[0], y=vals[1], z=vals[2], mode='lines',",
                f"    line=dict(color='{acc}', width=4), name='curve',",
                "    hovertemplate='x: %{x:.2f}<br>y: %{y:.2f}<br>'",
                "                  'z: %{z:.2f}<extra></extra>')",
                '_mc_desmos_sheet(fig, bounds)',
                '_mc_desmos_scene(fig, bounds)',
            ]
        L.append(f'fig.update_layout(margin={margin}, showlegend=False)')
    else:
        ru = _mc_rng(ranges, vars_[0].name, _MC_PLOT_R2)
        rv = _mc_rng(ranges, vars_[1].name, _MC_PLOT_R2)
        L.append('fig = go.Figure()')
        if c == 2:
            L += [
                f'fbox = _mc_field_view(fig, fnum, ({ru}, {rv}),'
                f' {_MC_PLOT_NF}, {_MC_PLOT_FIELD!r},'
                f' {_MC_PLOT_FSCALE})',
                f'ibox, idesc = _mc_gridimg_view(fig, fnum,'
                f' ({ru}, {rv}), {_MC_PLOT_GLINES}, {_MC_PLOT_NGPTS},'
                f' {_MC_PLOT_IMG!r}, {_MC_PLOT_SRC!r})',
                'box = fbox if fbox is not None else '
                f'({ru[0]}, {ru[1]}, {rv[0]}, {rv[1]})',
                'fig.update_xaxes('
                'zeroline=True, range=[box[0], box[1]])',
                "fig.update_yaxes(zeroline=True, scaleanchor='x',"
                ' scaleratio=1, range=[box[2], box[3]])',
                'frel = _mc_range_rel(fbox) or {}',
                "frel['annotations'] = []",
                "frel['showlegend'] = False",
                'irel = _mc_range_rel(ibox) or {}',
                "irel['annotations'] = [dict(",
                "    text=idesc, xref='paper', yref='paper',",
                "    x=0.02, y=0.98, xanchor='left', yanchor='top',",
                '    showarrow=False, font=dict(size=12))]',
                "irel['showlegend'] = True",
            ]
            menu(
                ['field', 'image'],
                ["_mc_mode_vis(fig, _MC_FIELD_NAMES, scene=False)",
                 "_mc_mode_vis(fig, _MC_GRIDIMG_NAMES, scene=False)"],
                ['frel', 'irel'],
            )
        else:
            L += [
                f'us = _mc_np.linspace({ru[0]}, {ru[1]},'
                f' {_MC_PLOT_N2})',
                f'vs = _mc_np.linspace({rv[0]}, {rv[1]},'
                f' {_MC_PLOT_N2})',
                'U, V = _mc_np.meshgrid(us, vs)',
                'vals = _mc_rows(fnum(U, V), U.shape)',
            ]
        if c == 3:
            L += [
                'bounds = _mc_desmos_bounds(',
                '    _mc_extent(vals[0]), _mc_extent(vals[1]),',
                '    _mc_extent(vals[2]))',
                '_mc_desmos_decor(fig, bounds)',
                '_mc_desmos_surf(fig, vals[0], vals[1], vals[2])',
                '_mc_desmos_sheet(fig, bounds)',
                '_mc_desmos_scene(fig, bounds)',
            ]
        elif c != 2:
            L += [
                'bounds = _mc_desmos_bounds(',
                '    (float(us[0]), float(us[-1])),',
                '    (float(vs[0]), float(vs[-1])),',
                '    _mc_extent(vals[0]))',
                '_mc_desmos_decor(fig, bounds)',
                '_mc_desmos_surf(fig, us, vs, vals[0])',
                'fig.add_heatmap(',
                '    x=us, y=vs, z=vals[0],'
                " colorscale='Viridis',",
                '    showscale=False, visible=False,',
                "    name='heatmap',",
                ')',
                '_mc_desmos_sheet(fig, bounds)',
                '_mc_desmos_scene(fig, bounds)',
            ]
            menu(
                ['surface', 'heatmap'],
                ["_mc_mode_vis(fig, ('surf',))",
                 "_mc_mode_vis(fig, ('heatmap',), scene=False)"],
            )
        L.append(f'fig.update_layout(margin={margin}, showlegend=False)')
    L += [
        '# the figure dict the frontend hands to plotly.js',
        'fig.to_json()',
    ]
    return '\\n'.join(L)


def _mc_plot_payload(v):
    vars_, comps, label = _mc_plot_signature(v['expr'])
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
    ranges = _mc_plot_ranges(v.get('domain'))
    fig, bounds = _mc_plot_figure(d, c, vars_, comps, ranges)
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
        'code': _mc_plot_code(d, c, vars_, comps, bounds, ranges),
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
            if stmt.get('silent'):
                # Definition-only source — exec binds the names; the
                # marker row keeps out[] aligned with the client's
                # statementLines, and the client drops it.
                exec(stmt['code'], ns)
                out.append({'ok': True, 'silent': True})
                continue
            val = _mc_eval_stmt(stmt, ns)
            # A _mc_plot marker isn't a value row — sample the
            # expression and hand the frontend plot data instead.
            if isinstance(val, dict) and val.get('__mcplot__') is True:
                res = _mc_plot_payload(val)
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
    # The prelude defines clean_and_simplify plus any lazy stats imports
    # (scipy/numpy) the statements need. It execs every run, not just the
    # first — a stats cell below an already-evaluated one must still get
    # its imports, since the rewind only skips cells, never bindings.
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
// scipy/numpy aren't part of the base payload (scipy adds ~17 MB of
// wheels) — programs whose prelude carries the imports trigger this
// lazy one-time-per-package load; everything else never pays for it.
const extra = new Map<string, Promise<void>>();

async function ensurePkg(py: PyodideLike, pkg: string): Promise<void> {
  let p = extra.get(pkg);
  if (p === undefined) {
    p = py.loadPackage([pkg]);
    extra.set(pkg, p);
  }
  try {
    await p;
  } catch (e) {
    // A failed fetch retries on the next eval.
    extra.delete(pkg);
    throw e;
  }
}

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
      // A stats cell's prelude carries the scipy/numpy imports — pull
      // the wheels on first use (scipy pulls numpy+openblas itself).
      // The load signals keep the caller's watchdog from firing on a
      // slow download.
      const loadPkg = async (name: string) => {
        scope.postMessage({ type: 'pkg-loading' });
        try {
          await ensurePkg(py, name).catch(() => {
            throw new Error(`failed to load ${name}`);
          });
        } finally {
          scope.postMessage({ type: 'pkg-loaded' });
        }
      };
      // Package hints live in the prelude (stats builtins) or inline in
      // emitted code — a `\python{import scipy.stats}` block puts its
      // import in a statement, not the prelude.
      const programSrc =
        program.prelude.join('\n') +
        program.cells
          .flatMap((c) => [...c.defs, ...c.statements.map((s) => s.code)])
          .join('\n');
      if (programSrc.includes('scipy')) await loadPkg('scipy');
      if (programSrc.includes('numpy')) await loadPkg('numpy');
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
