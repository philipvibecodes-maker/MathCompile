// Shared by the calculator worker and standalone Python exports.
export const SET_PLOT_PY = `
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
                    showscale=False, name='set')
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
    fig = go.Figure(trace)
    fig.update_layout(margin=dict(l=40, r=10, t=30, b=40), showlegend=False)
    if dim == 2:
        fig.update_layout(dragmode='pan', xaxis_title=names[0], yaxis_title=names[1],
                          yaxis=dict(scaleanchor='x', scaleratio=1))
    else:
        fig.update_layout(scene=dict(xaxis_title=names[0], yaxis_title=names[1],
            zaxis_title=names[2], aspectmode='data', dragmode='turntable'))
    return fig, names
`;
