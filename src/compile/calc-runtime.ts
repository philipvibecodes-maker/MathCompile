// The calculator's result pipeline as Python source. compileCellForCalc
// emits this block into every cell's prelude so the emitted program is
// self-contained — the shown code runs standalone (given sympy) and the
// audit trail has no hidden post-processing. Statements evaluate through
// clean_and_simplify(...). Each stage degrades to its input on failure.
//
// The signature is the first line of the code display after the import;
// the code view folds the body behind a caret by default.
//
// `clean_and_simplify` is a reserved identifier — pyIdent mangles a user
// symbol of the same name to `clean_and_simplify_` so a cell can't
// shadow it.
export const CALC_RUNTIME_PY = `def clean_and_simplify(val, ans_var=None, layout=None):  # display cleanup
    """Post-process a computed result for display.

    Three best-effort passes — each keeps the value and returns its
    input unchanged if it fails:
      mc_doit      finish pending operations (integrals, sums, limits)
      mc_simplify  reduce the expression (sp.simplify)
      mc_order     write sums in decreasing degree, constants last

    With ans_var (a Symbol or Tuple of them) a solver result displays
    as 'x = a1, a2, ...' instead of a bare list/set. With layout the
    result is structured display data: 'span' renders a basis as
    span{...} and 'eigenvects' renders eigen-triples as labeled blocks.
    """
    def mc_deg(term, gens):
        # Bare capital letters are constants of integration — they go last.
        if term.is_Symbol and len(term.name) == 1 and term.name.isupper():
            return -1
        if getattr(term, 'is_number', False):
            return 0
        try:
            return int(sp.Poly(term, *gens).total_degree())
        except Exception:
            return 0

    def mc_order(val):
        # Write sums with terms in decreasing degree (constants last).
        try:
            if val.is_Add:
                gens = sorted(val.free_symbols, key=lambda s: s.name)
                terms = sorted(val.args, key=lambda t: -mc_deg(t, gens))
                return sp.Add(*terms, evaluate=False)
            if val.args:
                # A sum nested inside a product/fraction/function keeps
                # sympy's canonical order (constant first) — rebuild
                # containers around re-ordered args, evaluate=False so the
                # sort survives.
                args = [mc_order(a) for a in val.args]
                try:
                    return val.func(*args, evaluate=False)
                except Exception:
                    try:
                        return val.func(*args)
                    except Exception:
                        return val
            return val
        except Exception:
            return val

    def mc_doit(val):
        # Relations and booleans doit per-side: Eq.doit() collapses the
        # equation to lhs - rhs = 0, losing the displayed form.
        try:
            if getattr(val, 'is_Relational', False) or getattr(val, 'is_Boolean', False):
                sides = [mc_doit(a) for a in val.args]
                # Eq(Symbol, Matrix|Set) collapses to literal False — keep
                # the equation displayed when a side is matrix- or
                # set-valued.
                if any(getattr(a, 'is_Matrix', False) or isinstance(a, sp.Set)
                       for a in sides):
                    return val.func(*sides, evaluate=False)
                return val.func(*sides)
            return val.doit()
        except Exception:
            return val

    def mc_simplify(val):
        # Relations and booleans simplify side-by-side: a blanket
        # sp.simplify(Eq) routes through the solver and rewrites x + 1 = 2
        # as x = 1.
        try:
            if getattr(val, 'is_Boolean', False):
                return val.func(*[mc_simplify(a) for a in val.args])
            if getattr(val, 'is_Relational', False):
                sides = [sp.simplify(a) for a in val.args]
                if any(getattr(a, 'is_Matrix', False) or isinstance(a, sp.Set)
                       for a in sides):
                    return val.func(*sides, evaluate=False)
                return val.func(*sides)
            return sp.simplify(val)
        except Exception:
            return val

    def mc_tex(v):
        return sp.latex(v, order='none', inv_trig_style='full')

    class McTex:
        # A row value carrying ready-made latex — sp.latex() prints it
        # verbatim through the _latex hook.
        def __init__(self, tex):
            self.tex = tex

        def _latex(self, printer):
            return self.tex

    def mc_answers(var, sol):
        """Render a solver result as 'x = a1, a2, ...' — var is the
        solved-for Symbol (or Tuple of symbols for a system). Dicts are
        simultaneous solutions; a non-finite Set means 'var in S' —
        solve's bare relational output already reads as a statement."""
        def eq_tex(k, v):
            return mc_tex(k) + ' = ' + mc_tex(v)
        if getattr(sol, 'is_Relational', False) or getattr(sol, 'is_Boolean', False):
            return McTex(mc_tex(sol))
        if isinstance(sol, (dict, sp.Dict)):
            return McTex(',\\ '.join(eq_tex(k, v) for k, v in sol.items()))
        if isinstance(sol, sp.Set):
            if isinstance(sol, sp.FiniteSet):
                sol = list(sol.args)
            else:
                return McTex(mc_tex(sol) if var is None else mc_tex(var) + ' \\in ' + mc_tex(sol))
        if not isinstance(sol, (list, tuple)):
            return McTex(mc_tex(sol) if var is None else eq_tex(var, sol))
        if len(sol) == 0:
            return McTex(r'\\varnothing' if var is None else mc_tex(var) + r' \\in \\varnothing')
        if all(isinstance(s, (dict, sp.Dict)) for s in sol):
            return McTex(';\\ '.join(',\\ '.join(eq_tex(k, v) for k, v in s.items()) for s in sol))
        vars_ = list(var.args) if isinstance(var, sp.Tuple) else ([var] if var is not None else [])
        if len(vars_) == 1 and all(
                not (getattr(s, 'is_Relational', False) or getattr(s, 'is_Boolean', False)
                     or isinstance(s, (list, tuple)))
                for s in sol):
            return McTex(mc_tex(vars_[0]) + ' = ' + ',\\ '.join(mc_tex(s) for s in sol))

        def one(s):
            if getattr(s, 'is_Relational', False) or getattr(s, 'is_Boolean', False):
                return mc_tex(s)
            if len(vars_) > 1 and isinstance(s, (list, tuple)) and len(s) == len(vars_):
                return ',\\ '.join(eq_tex(v_, s_) for v_, s_ in zip(vars_, s))
            return eq_tex(vars_[0], s) if len(vars_) == 1 else mc_tex(s)

        return McTex(';\\ '.join(one(s) for s in sol))

    def mc_span(vecs):
        """A basis result (nullspace/columnspace) displays as the span
        it generates — an empty basis is the trivial space \\varnothing.
        Non-list results pass through (they weren't a basis)."""
        if not isinstance(vecs, (list, tuple)):
            return vecs
        if len(vecs) == 0:
            return McTex(r'\\varnothing')
        inner = ',\\ '.join(mc_tex(v) for v in vecs)
        return McTex(r'\\mathrm{span}\\left\\{ ' + inner + r' \\right\\}')

    def mc_eigenvects(triples):
        """eigenvects() yields (eigenvalue, multiplicity, [vectors])
        triples — sympy's latex nests them as a list of
        (value, mult, [matrix]) tuples. Display each triple as one
        labeled row instead."""
        if not isinstance(triples, list):
            return triples
        def one(t):
            ev, mult, vecs = t
            span = (r'\\mathrm{span}\\left\\{ '
                    + ',\\ '.join(mc_tex(v) for v in vecs)
                    + r' \\right\\}')
            return (r'\\text{Eigenvalue: }' + mc_tex(ev)
                    + r',\\ \\text{multiplicity: }' + mc_tex(mult)
                    + r',\\ \\text{eigenspace: }' + span)
        return McTex(r'\\displaylines{ ' + r' \\\\ '.join(one(t) for t in triples) + r' }')

    out = mc_order(mc_simplify(mc_doit(val)))
    if layout == 'span':
        return mc_span(out)
    if layout == 'eigenvects':
        return mc_eigenvects(out)
    if ans_var is not None:
        out = mc_answers(ans_var, out)
    return out`;
