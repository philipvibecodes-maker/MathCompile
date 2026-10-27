import type { Issue, MathJson } from '../ir';
import type { StatementOut } from './types';
import { isArr, isStr, isHead, headOf } from './nodes';
import { freeNames } from './analysis';
import { pyIdent } from './identifiers';

// Plot generation needs recursive expression emission and a small view of
// name/signature state. It does not own scope or statement compilation.
interface PlotEmitter {
  emit(node: MathJson | undefined, minPrec?: number): string;
  scope: {
    qualified: boolean;
    decls: { declaredFns: ReadonlySet<string> };
    emit: { fnArgs: ReadonlyMap<string, MathJson[]> };
    flag(severity: Issue['severity'], message: string): void;
  };
}

// The plottable-component list of a normalized expression: a Matrix
// literal with a single row or column flattens to its elements (a
// column vector is how multi-component functions are written), a
// List/Tuple flattens likewise, anything else is a scalar.
export function plotComponents(expr: MathJson): MathJson[] | undefined {
  if (!isArr(expr)) return [expr];
  const h = headOf(expr);
  if (h === 'Matrix' && expr.length === 2 && isHead(expr[1], 'List')) {
    const rows = expr[1].slice(1);
    if (
      rows.length > 0 &&
      rows.every((r) => isHead(r, 'List')) &&
      (rows.length === 1 || rows.every((r) => r.length === 2))
    )
      return rows.flatMap((r) => r.slice(1));
    return undefined;
  }
  if (h === 'List' || h === 'Tuple' || h === 'Sequence')
    return expr.slice(1);
  return [expr];
}

// A `\text{plot} … \text{for} cond` domain as per-variable bounds:
// `x ∈ (a,b)` (Element+Interval — open/closed marks are sampling-
// irrelevant and stripped), `a ≤ x ≤ b` two-sided chains, one-sided
// `x > a` (a missing end keeps the signature's default), `And`- or
// List-combined conditions, and `(u,v) ∈ I₁×I₂` product membership —
// the paren tuple parses as an open Interval of names and zips onto a
// same-length CircledAst of Intervals. Anything else (finite sets,
// equalities, non-interval membership) is skipped — the caller flags
// a note when the condition yields no bounds at all.
export interface PlotBound {
  v: string;
  lo?: MathJson;
  hi?: MathJson;
}

export function plotDomainBounds(cond: MathJson | undefined): PlotBound[] {
  const out: PlotBound[] = [];
  // `0 ≤ x ≤ 5` normalizes to And(0 ≤ x, x ≤ 5) — one variable's ends
  // arrive as separate items; merge them into a single entry.
  const push = (b: PlotBound): void => {
    const ex = out.find((e) => e.v === b.v);
    if (ex === undefined) out.push(b);
    else {
      if (b.lo !== undefined) ex.lo = b.lo;
      if (b.hi !== undefined) ex.hi = b.hi;
    }
  };
  const stripOpen = (e: MathJson): MathJson =>
    isHead(e, 'Open') ? (e as MathJson[])[1] : e;
  // pair-matrix mode lowers a `(a,b)` paren pair to a 1×2 row Matrix
  // — `Matrix(List(List(a,b)))` — on both sides of ∈.
  const rowMatrix = (n: MathJson): MathJson[] | undefined => {
    if (!isArr(n) || headOf(n) !== 'Matrix') return undefined;
    const rows = isArr(n[1]) ? n[1].slice(1) : [];
    if (rows.length !== 1) return undefined;
    const r = rows[0];
    return isArr(r) && headOf(r) === 'List' ? r.slice(1) : undefined;
  };
  // A Matrix RHS is finite-set membership under pair-matrix semantics
  // (`x ∈ (0,5)` → Contains(x, {0,5})), not a range — only a real
  // Interval gives bounds.
  const intervalOf = (
    n: MathJson,
  ): { lo: MathJson; hi: MathJson } | undefined =>
    isArr(n) && headOf(n) === 'Interval' && n.length === 3
      ? { lo: stripOpen(n[1]), hi: stripOpen(n[2]) }
      : undefined;
  const item = (n: MathJson): void => {
    if (!isArr(n)) return;
    const h = headOf(n);
    if (h === 'And' || h === 'List' || h === 'Tuple' || h === 'Sequence') {
      for (const c of n.slice(1)) item(c);
      return;
    }
    if (h === 'Element') {
      const [lhs, rhs] = [n[1], n[2]];
      if (isStr(lhs)) {
        const iv = intervalOf(rhs);
        if (iv) push({ v: lhs, ...iv });
        return;
      }
      // Product domain `(u,v) ∈ I₁×I₂` — the lhs arrives as
      // Delimiter(Sequence(u,v)) (plain parens), Interval/Tuple/List,
      // or a 1×n row Matrix in pair-matrix mode; the rhs is a
      // CircledAst of the factor intervals.
      let vars: MathJson | undefined = lhs;
      if (isArr(vars) && headOf(vars) === 'Delimiter')
        vars = vars[1];
      let names = (rowMatrix(vars) ?? []).map(stripOpen);
      if (names.length === 0 && isArr(vars) && headOf(vars) === 'Matrix') {
        // A multi-row tuple matrix — every row is a variable name.
        const rows = isArr(vars[1]) ? vars[1].slice(1) : [];
        names = rows.flatMap((r) =>
          isArr(r) && headOf(r) === 'List'
            ? r.slice(1).map(stripOpen)
            : [],
        );
      } else if (names.length === 0 &&
        isArr(vars) &&
        ['Interval', 'Tuple', 'List', 'Sequence'].includes(
          headOf(vars) ?? '',
        )
      ) {
        names = vars.slice(1).map(stripOpen);
      }
      if (isArr(rhs) && headOf(rhs) === 'CircledAst') {
        const ivs = rhs.slice(1);
        if (names.length === ivs.length)
          names.forEach((v, i) => {
            const iv = intervalOf(ivs[i]);
            if (iv && isStr(v)) push({ v, ...iv });
          });
      }
      return;
    }
    if (
      h === 'Less' ||
      h === 'LessEqual' ||
      h === 'Greater' ||
      h === 'GreaterEqual'
    ) {
      const less = h === 'Less' || h === 'LessEqual';
      if (n.length === 4 && isStr(n[2])) {
        // `a < x < b` arrives flat; Greater flips the ends.
        push(
          less
            ? { v: n[2], lo: n[1], hi: n[3] }
            : { v: n[2], lo: n[3], hi: n[1] },
        );
        return;
      }
      if (n.length === 3) {
        const [a, b] = [n[1], n[2]];
        if (isStr(a) && !isStr(b))
          push(less ? { v: a, hi: b } : { v: a, lo: b });
        else if (isStr(b) && !isStr(a))
          push(less ? { v: b, lo: a } : { v: b, hi: a });
      }
    }
  };
  if (cond !== undefined) item(cond);
  return out;
}

// The python-target lowering of a `Plot` statement: the matching
// `sp.plot*` call when the signature is statically known (free names ×
// component count), otherwise an informative comment plus a note — the
// calculator's worker classifies shapes codegen can't see (a def'd
// name's return shape).
export function emitPlotPython(
  expr: MathJson,
  emitted: string,
  emitter: PlotEmitter,
  domain?: Map<string, { lo?: string; hi?: string }>,
): StatementOut {
  const sp = emitter.scope.qualified ? 'sp.' : '';
  const vars = [...new Set(freeNames(expr))].sort();
  const applied =
    isStr(expr) && emitter.scope.decls.declaredFns.has(expr)
      ? emitter.scope.emit.fnArgs.get(expr)?.filter(isStr)
      : undefined;
  // `\text{plot} f` after a def: f's recorded params make the applied
  // signature (an unknown-arity Function decl can't be sampled).
  const comps =
    applied !== undefined && applied.length > 0
      ? [expr]
      : (plotComponents(expr) ?? []);
  const callVars = applied !== undefined && applied.length > 0 ? applied : vars;
  const emitComp = emitPlotComp(emitter, callVars);
  // A `\text{for}` domain bound overrides that end of the variable's
  // range; a bound naming a variable outside the signature is dead.
  if (domain)
    for (const k of domain.keys())
      if (!callVars.includes(k))
        emitter.scope.flag(
          'note',
          `plot: '${k}' isn't a variable of the plotted expression — its bound is ignored`,
        );
  const rng = (v: string, lo: number, hi: number) => {
    const r = domain?.get(v);
    return `(${pyIdent(v)}, ${r?.lo ?? lo}, ${r?.hi ?? hi})`;
  };
  const R1 = (v: string) => rng(v, -10, 10);
  const R2 = (v: string) => rng(v, -3, 3);
  const d = callVars.length;
  const c = comps.length;
  const unplottable = (why: string): StatementOut => {
    emitter.scope.flag(
      'note',
      `plot: ${why} — emitted as a comment; the calculator target classifies and renders it`,
    );
    return { lines: [`# plot(${emitted}) — ${why}`] };
  };
  if (isHead(expr, 'Interval'))
    return unplottable(
      'an interval is a set, not a curve — write components as a column vector (e.g. \\begin{pmatrix})',
    );
  if (d === 0 || c === 0)
    return unplottable('nothing varies — the expression is constant');
  if (d > 2)
    return unplottable(`a function of ${d} variables can't be plotted`);
  if (c > 3)
    return unplottable(`${c} output components is too many to plot`);
  const [e0, e1, e2] = comps.map(emitComp);
  const [w0, w1] = callVars;
  if (d === 1 && c === 1)
    return { lines: [`${sp}plot(${e0}, ${R1(w0)})`], plot: true };
  if (d === 2 && c === 1)
    return {
      lines: [`${sp}plot3d(${e0}, ${R2(w0)}, ${R2(w1)})`],
      plot: true,
    };
  if (d === 1 && c === 2)
    return {
      lines: [`${sp}plot_parametric(${e0}, ${e1}, ${R1(w0)})`],
      plot: true,
    };
  if (d === 1 && c === 3)
    return {
      lines: [`${sp}plot3d_parametric_line(${e0}, ${e1}, ${e2}, ${R1(w0)})`],
      plot: true,
    };
  if (d === 2 && c === 3)
    return {
      lines: [
        `${sp}plot3d_parametric_surface(${e0}, ${e1}, ${e2}, ${R2(w0)}, ${R2(w1)})`,
      ],
      plot: true,
    };
  // d === 2 && c === 2 — ℝ²→ℝ². The field view lowers to a real
  // plotting call; the image-of-grid view has no SymPy equivalent, so
  // its program rides along as comments under it (the calculator
  // target renders both interactively behind the figure's mode menu).
  const field = emitPlotFieldPython(expr, comps, callVars, emitter, [
    R2(w0),
    R2(w1),
  ]);
  const image = emitPlotImagePython(expr, comps, callVars, emitter, [
    domain?.get(w0)?.lo ?? '-3',
    domain?.get(w0)?.hi ?? '3',
    domain?.get(w1)?.lo ?? '-3',
    domain?.get(w1)?.hi ?? '3',
  ]);
  return {
    lines: [
      ...field.lines,
      ...image.lines.map((l) => (l === '' ? '#' : `# ${l}`)),
    ],
    plot: field.plot === true || image.plot === true,
  };
}

// A bare-string component is an applied call only when it's a declared
// fn name — `\text{plot} f` applies f's recorded params and a vector of
// def'd names like pmatrix{f \\ g} applies each; a free-variable
// component like `x` emits as a symbol, not `x(t)`.
const emitPlotComp =
  (emitter: PlotEmitter, callVars: string[]) =>
  (n: MathJson | string): string =>
    isStr(n) && emitter.scope.decls.declaredFns.has(n)
      ? `${n}(${callVars.map(pyIdent).join(', ')})`
      : emitter.emit(n);

// The field (quiver) view of an ℝ²→ℝ² plot, python target:
// `plot_vector_field` (sympy.plotting, ≥1.9 — shipped by the pinned
// pyodide). It isn't re-exported at sympy's top level on every version,
// so the import line rides ahead of the call rather than relying on a
// `sp.` prefix; in import-* mode the bare name is already the right one.
function emitPlotFieldPython(
  _expr: MathJson,
  comps: MathJson[],
  callVars: string[],
  emitter: PlotEmitter,
  rngs: [string, string],
): StatementOut {
  const emitComp = emitPlotComp(emitter, callVars);
  const [e0, e1] = comps.map(emitComp);
  return {
    lines: [
      'from sympy.plotting import plot_vector_field',
      `plot_vector_field((${e0}, ${e1}), ${rngs[0]}, ${rngs[1]})`,
    ],
    plot: true,
  };
}

// The image-of-grid view of an ℝ²→ℝ² plot, python target. SymPy has
// no equivalent plotting call, so this emits a standalone
// numpy+matplotlib program as lines — the caller '# '-prefixes them so
// they ride under the field view's real code as a commented program
// documenting the second view the calculator's mode menu offers. Not
// executed by our pipeline, so `plot` stays unset.
function emitPlotImagePython(
  _expr: MathJson,
  comps: MathJson[],
  callVars: string[],
  emitter: PlotEmitter,
  dom: [string, string, string, string] = ['-3', '3', '-3', '3'],
): StatementOut {
  const sp = emitter.scope.qualified ? 'sp.' : '';
  const [v0, v1] = callVars.map(pyIdent);
  const [e0, e1] = comps.map(emitPlotComp(emitter, callVars));
  const [x0, x1, y0, y1] = dom;
  return {
    lines: [
      'image-of-grid view of the same map',
      `fnum = ${sp}lambdify((${v0}, ${v1}), (${e0}, ${e1}), 'numpy')`,
      'import numpy as np',
      'import matplotlib.pyplot as plt',
      `ts = np.linspace(${x0}, ${x1}, 160)`,
      `ty = np.linspace(${y0}, ${y1}, 160)`,
      `ks = np.linspace(${y0}, ${y1}, 10)`,
      'fig, ax = plt.subplots()',
      `ax.fill([${x0}, ${x1}, ${x1}, ${x0}, ${x0}],`,
      `        [${y0}, ${y0}, ${y1}, ${y1}, ${y0}],`,
      "        color='#8c8c8c', alpha=0.12)",
      'for k in ks:',
      `    ax.plot([${x0}, ${x1}], [k, k], color='#8c8c8c', lw=1)`,
      `bx = np.concatenate([ts, np.full_like(ty, ${x1}), ts[::-1],`,
      `                     np.full_like(ty, ${x0})])`,
      `by = np.concatenate([np.full_like(ts, ${y0}), ty,`,
      `                     np.full_like(ts, ${y1}), ty[::-1]])`,
      "ax.fill(*fnum(bx, by), color='#3b82f6', alpha=0.10)",
      'for k in ks:',
      "    ax.plot(*fnum(ts, np.full_like(ts, k)), color='#3b82f6',",
      "            lw=1.5)",
      "ax.set_aspect('equal')",
      `ax.set_title('image of [${x0},${x1}]x[${y0},${y1}]; y=k lines')`,
      "ax.legend([plt.Patch(color='#3b82f6', alpha=0.3),",
      "           plt.Line2D([0], [0], color='#3b82f6'),",
      "           plt.Line2D([0], [0], color='#8c8c8c'),",
      "           plt.Line2D([0], [0], color='#8c8c8c', lw=1)],",
      "          ['image of square', 'image of y = k', 'input square',",
      "           'input y = k'])",
      'plt.show()',
    ],
  };
}
