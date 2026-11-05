// Shared by the calculator worker and standalone Python exports.
export const SET_PLOT_PY = `
# The calculator worker already installs MathCompile's full custom 3-D
# scene helpers.  Keep a compact copy here for standalone Python exports,
# where this source is the entire plotting runtime.
if '_mc_desmos_bounds' not in globals():
    def _mc_desmos_bounds(*extents):
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

    def _mc_set_grid_step(span):
        import math as _mc_math
        raw = max(span, 1e-12) / 10.0
        mag = 10.0 ** _mc_math.floor(_mc_math.log10(raw))
        return next(m * mag for m in (1.0, 2.0, 5.0, 10.0)
                    if raw <= m * mag)

    def _mc_desmos_decor(fig, bounds):
        import math as _mc_math
        (x0, x1), (y0, y1), (z0, z1) = bounds
        step = _mc_set_grid_step(max(x1 - x0, y1 - y0))
        xs, ys, zs = [], [], []
        gx = _mc_math.ceil(x0 / step) * step
        while gx <= x1 + step * 1e-6:
            xs += [gx, gx, None]; ys += [y0, y1, None]; zs += [0, 0, None]
            gx += step
        gy = _mc_math.ceil(y0 / step) * step
        while gy <= y1 + step * 1e-6:
            xs += [x0, x1, None]; ys += [gy, gy, None]; zs += [0, 0, None]
            gy += step
        fig.add_scatter3d(x=xs, y=ys, z=zs, mode='lines', name='wallgrid',
            line=dict(color='rgba(0,0,0,0.16)', width=1), hoverinfo='skip')

        xs, ys, zs = [], [], []
        for y in (y0, y1):
            for z in (z0, z1):
                xs += [x0, x1, None]; ys += [y, y, None]; zs += [z, z, None]
        for x in (x0, x1):
            for z in (z0, z1):
                xs += [x, x, None]; ys += [y0, y1, None]; zs += [z, z, None]
        for x in (x0, x1):
            for y in (y0, y1):
                xs += [x, x, None]; ys += [y, y, None]; zs += [z0, z1, None]
        fig.add_scatter3d(x=xs, y=ys, z=zs, mode='lines', name='box',
            line=dict(color='#e3e3e3', width=1.5), hoverinfo='skip')

        sizeref = 0.022 * max(x1 - x0, y1 - y0)
        for i, (letter, (lo, hi)) in enumerate(zip(('x', 'y', 'z'), bounds)):
            line = [[0.0, 0.0], [0.0, 0.0], [0.0, 0.0]]
            line[i] = [lo, hi]
            fig.add_scatter3d(x=line[0], y=line[1], z=line[2], mode='lines',
                name='axis', line=dict(color='#9d9d9d', width=3), hoverinfo='skip')
            tip = [[0.0], [0.0], [0.0]]; tip[i] = [hi]
            vec = [[0.0], [0.0], [0.0]]; vec[i] = [1.0]
            fig.add_cone(x=tip[0], y=tip[1], z=tip[2],
                u=vec[0], v=vec[1], w=vec[2], name='axis',
                colorscale=[[0, '#9d9d9d'], [1, '#9d9d9d']], showscale=False,
                sizemode='absolute', sizeref=sizeref, anchor='tail', hoverinfo='skip')
            label = [[0.0], [0.0], [0.0]]
            label[i] = [hi + 0.09 * (hi - lo)]
            fig.add_scatter3d(x=label[0], y=label[1], z=label[2], mode='text',
                text=['<b>%s</b>' % letter], name='axis', hoverinfo='skip',
                textfont=dict(color='#9d9d9d', size=17))

    def _mc_desmos_sheet(fig, bounds):
        (x0, x1), (y0, y1), _ = bounds
        fig.add_surface(x=[[x0, x1], [x0, x1]], y=[[y0, y0], [y1, y1]],
            z=[[0, 0], [0, 0]], name='xysheet', showscale=False, opacity=0.5,
            colorscale=[[0, '#d9d9d9'], [1, '#d9d9d9']], hoverinfo='none')

    def _mc_desmos_scene(fig, bounds):
        def pad(pair):
            lo, hi = pair; span = hi - lo
            return [lo - 0.04 * span, hi + 0.16 * span]
        fig.update_layout(scene=dict(
            xaxis=dict(visible=False, range=pad(bounds[0])),
            yaxis=dict(visible=False, range=pad(bounds[1])),
            zaxis=dict(visible=False, range=pad(bounds[2])),
            aspectmode='auto',
            camera=dict(eye=dict(x=0.35, y=-1.6, z=0.78),
                        up=dict(x=0, y=0, z=1))))
        buttons = [dict(label=mode, method='relayout',
                        args=[{'scene.aspectmode': mode}])
                   for mode in ('cube', 'data', 'auto')]
        fig.update_layout(updatemenus=[dict(buttons=buttons, direction='down',
            active=2, x=0.29, xanchor='left', y=1.12)])

def _mc_set_figure(value, domain=None):
    import numpy as np
    import plotly.graph_objects as go
    import math

    def point(p):
        if isinstance(p, sp.Interval) and p.left_open and p.right_open:
            return [p.start, p.end]
        if isinstance(p, sp.MatrixBase) and (p.rows == 1 or p.cols == 1):
            return list(p)
        if isinstance(p, (sp.Tuple, tuple, list)):
            return list(p)
        raise ValueError('set plots need points with 2 or 3 coordinates')

    if isinstance(value, sp.FiniteSet) or value == sp.S.EmptySet:
        points = [point(p) for p in sorted(value, key=sp.default_sort_key)]
        dim = len(points[0]) if points else 2
        if dim not in (2, 3) or any(len(p) != dim for p in points):
            raise ValueError('set plots need points with consistently 2 or 3 coordinates')
        try:
            coords = [[float(v) for v in p] for p in points]
            if any(not math.isfinite(v) for p in coords for v in p):
                raise ValueError()
        except (TypeError, ValueError, OverflowError):
            raise ValueError('set coordinates must be finite real numbers')
        axes = [[p[i] for p in coords] for i in range(dim)]
        names = ['x', 'y', 'z'][:dim]
        kwargs = dict(zip(names, axes))
        trace = (go.Scatter if dim == 2 else go.Scatter3d)(
            **kwargs, mode='markers', name='set', marker=dict(size=6, color='#3b82f6'))
    elif isinstance(value, sp.ConditionSet):
        vars_ = point(value.sym)
        dim = len(vars_)
        if dim not in (2, 3) or not all(isinstance(s, sp.Symbol) for s in vars_):
            raise ValueError('set regions need 2 or 3 coordinate variables')
        names = [s.name for s in vars_]
        predicate = value.condition
        if predicate.free_symbols - set(vars_):
            raise ValueError('set condition contains unbound parameters')
        # Include the base set's membership restrictions when supplied.
        if value.base_set != sp.S.UniversalSet:
            predicate = sp.And(predicate, value.base_set.contains(sp.Tuple(*vars_)))
        def bounds(name):
            lo, hi = (domain or {}).get(name, (None, None))
            lo, hi = (-3 if lo is None else float(lo)), (3 if hi is None else float(hi))
            if not (math.isfinite(lo) and math.isfinite(hi) and lo < hi):
                raise ValueError('set plot bounds must be finite and increasing')
            return lo, hi
        # Bounded grids keep even 3-D region sampling responsive.
        n = 161 if dim == 2 else 35
        axes = [np.linspace(*bounds(name), n) for name in names]
        grids = np.meshgrid(*axes, indexing='ij')
        def sample(expr):
            with np.errstate(all='ignore'):
                result = sp.lambdify(vars_, expr, 'numpy')(*grids)
            return np.broadcast_to(np.asarray(result), grids[0].shape)
        if isinstance(predicate, sp.Equality):
            values = sample(predicate.lhs - predicate.rhs).astype(float)
            values[~np.isfinite(values)] = np.nan
            if dim == 2:
                trace = go.Contour(x=axes[0].tolist(), y=axes[1].tolist(),
                    z=values.T.tolist(), name='set', showscale=False,
                    contours=dict(start=0, end=0, size=1, coloring='lines'),
                    line=dict(color='#3b82f6', width=2))
            else:
                trace = go.Isosurface(x=grids[0].ravel().tolist(),
                    y=grids[1].ravel().tolist(), z=grids[2].ravel().tolist(),
                    value=values.ravel().tolist(), isomin=0, isomax=0,
                    surface_count=1, caps=dict(x_show=False, y_show=False, z_show=False),
                    colorscale=[[0, '#c74440'], [1, '#c74440']],
                    lighting=dict(ambient=0.25, diffuse=0.75, specular=0.325,
                                  roughness=0.45, fresnel=0.0),
                    lightposition=dict(x=-1400, y=-800, z=3200),
                    showscale=False, name='surf')
        else:
            mask = sample(predicate)
            if mask.dtype.kind != 'b':
                raise ValueError('set condition could not be evaluated as a real Boolean predicate')
            kwargs = dict(zip(['x', 'y', 'z'][:dim], [g[mask].tolist() for g in grids]))
            trace = (go.Scatter if dim == 2 else go.Scatter3d)(
                **kwargs, mode='markers', name='set (sampled)',
                marker=dict(size=3 if dim == 2 else 2, color='#3b82f6', opacity=0.45))
    else:
        raise ValueError('supported set plots are finite point sets and 2-D or 3-D condition sets')
    if dim == 3:
        extents = [(float(min(a)), float(max(a))) for a in axes]
        bounds3 = _mc_desmos_bounds(*extents)
        fig = go.Figure()
        _mc_desmos_decor(fig, bounds3)
        fig.add_trace(trace)
        _mc_desmos_sheet(fig, bounds3)
        _mc_desmos_scene(fig, bounds3)
    else:
        fig = go.Figure(trace)
    fig.update_layout(margin=dict(l=40, r=10, t=30, b=40), showlegend=False)
    if dim == 2:
        fig.update_layout(dragmode='pan', xaxis_title=names[0], yaxis_title=names[1],
                          yaxis=dict(scaleanchor='x', scaleratio=1))
    return fig, names
`;
