// The calculator's result pipeline as Python source. compileCellForCalc
// emits this block into every cell's prelude so the emitted program is
// self-contained — the shown code runs standalone (given sympy) and the
// audit trail has no hidden post-processing. Statements evaluate through
// mc_simplify_organize(...). Each stage degrades to its input on failure.
//
// The signature is the first line of the code display after the import;
// the code view folds the body behind a caret by default.
//
// `mc_simplify_organize` is a reserved identifier — pyIdent mangles a
// user symbol of the same name to `mc_simplify_organize_` so a cell
// can't shadow it.
export const CALC_RUNTIME_PY = `def mc_simplify_organize(val):
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

    return mc_order(mc_simplify(mc_doit(val)))`;
