import { describe, expect, it } from 'vitest';
import { parseCellLatex, normalizeIR, latexToStatementStrings } from './ir';
import { compileWorksheet } from './codegen';

// Fixture triples per the IR spec: latex -> normalized IR -> generated
// SymPy. `expectedPython` is the *cell's* def + statement lines in the
// `import sympy as sp` (qualified) mode — the emitted cellLines prepend
// the import line (cells are standalone scripts). The default
// `from sympy import *` mode emits the same lines without `sp.` — see
// the importAll describe block.
const FIXTURES: {
  latex: string;
  expectedIR?: unknown;
  expectedPython: string[];
  issues?: string[]; // expected issue message fragments
}[] = [
  {
    latex: 'x + 1',
    expectedIR: ['Add', 'x', 1],
    expectedPython: ['x = sp.Symbol("x")', 'x + 1'],
  },
  {
    latex: 'a = x + 1',
    expectedIR: ['Assign', 'a', ['Add', 'x', 1]],
    expectedPython: ['x = sp.Symbol("x")', 'a = x + 1'],
  },
  {
    latex: 'x + 1 = 2',
    expectedIR: ['Equal', ['Add', 'x', 1], 2],
    expectedPython: ['x = sp.Symbol("x")', 'sp.Eq(x + 1, 2)'],
  },
  {
    latex: '\\text{def} f(x) = x^2 + 1',
    expectedIR: ['Def', 'f', ['List', 'x'], ['Add', ['Power', 'x', 2], 1]],
    // x is a def parameter (bound), f is bound by the def itself — no defs.
    expectedPython: ['def f(x):', '    return x**2 + 1'],
  },
  {
    // Without the \text{def} marker `f(x)` is f·x — parens multiply
    // everywhere — so this is an ordinary equation.
    latex: 'f(x) = x^2 + 1',
    expectedIR: [
      'Equal',
      ['Multiply', 'f', 'x'],
      ['Add', ['Power', 'x', 2], 1],
    ],
    expectedPython: [
      "f, x = sp.symbols('f x')",
      'sp.Eq(f * x, x**2 + 1)',
    ],
  },
  {
    latex: '\\frac{x+1}{y-2}',
    expectedIR: ['Divide', ['Add', 'x', 1], ['Add', 'y', ['Negate', 2]]],
    expectedPython: ["x, y = sp.symbols('x y')", '(x + 1) / (y - 2)'],
  },
  {
    latex: '-x + 3 - y',
    // Non-canonical Subtract folds into flat Add; input order survives.
    expectedIR: ['Add', ['Negate', 'x'], 3, ['Negate', 'y']],
    expectedPython: ["x, y = sp.symbols('x y')", '-x + 3 - y'],
  },
  {
    latex: '\\int_{a}^{b} x\\,dx',
    expectedIR: ['Integrate', 'x', ['Limits', 'x', 'a', 'b']],
    expectedPython: ["x, a, b = sp.symbols('x a b')", 'sp.integrate(x, (x, a, b))'],
  },
  {
    latex: '\\int x^2 dx',
    // Non-canonical indefinite integrals give a bare variable — folded
    // into Limits with Nothing bounds. Indefinite integrals carry the
    // constant of integration.
    expectedIR: [
      'Integrate',
      ['Power', 'x', 2],
      ['Limits', 'x', 'Nothing', 'Nothing'],
    ],
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.integrate(x**2, x) + sp.Symbol("C")',
    ],
  },
  {
    latex: '\\antid x^2 dx',
    // \antid is the boundless insertion alias for \int — ir.ts maps it
    // before ce.parse, so it compiles to the same Integrate node.
    expectedIR: [
      'Integrate',
      ['Power', 'x', 2],
      ['Limits', 'x', 'Nothing', 'Nothing'],
    ],
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.integrate(x**2, x) + sp.Symbol("C")',
    ],
  },
  {
    latex: '\\iint x^2 dx',
    // CE parses \iint natively to Integrate.
    expectedIR: [
      'Integrate',
      ['Power', 'x', 2],
      ['Limits', 'x', 'Nothing', 'Nothing'],
    ],
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.integrate(x**2, x) + sp.Symbol("C")',
    ],
  },
  {
    latex: '\\iint_{a}^{b} x\\,dx',
    expectedIR: ['Integrate', 'x', ['Limits', 'x', 'a', 'b']],
    expectedPython: ["x, a, b = sp.symbols('x a b')", 'sp.integrate(x, (x, a, b))'],
  },
  {
    // Term order is preserved: Multiply(a, 2), not canonical Multiply(2, a).
    latex: 'a \\cdot 2',
    expectedIR: ['Multiply', 'a', 2],
    expectedPython: ['a = sp.Symbol("a")', 'a * 2'],
  },
  {
    // Implicit multiplication keeps user order too.
    latex: '2 x y',
    expectedIR: ['Multiply', 2, 'x', 'y'],
    expectedPython: ["x, y = sp.symbols('x y')", '2 * x * y'],
  },
  {
    // `e` is Euler's constant (sp.E), never a Symbol.
    latex: 'e^x',
    expectedIR: ['Power', 'ExponentialE', 'x'],
    expectedPython: ['x = sp.Symbol("x")', 'sp.E**x'],
  },
  {
    latex: '\\sum_{i=0}^{n} i^2',
    expectedIR: ['Sum', ['Power', 'i', 2], ['Limits', 'i', 0, 'n']],
    expectedPython: ["i, n = sp.symbols('i n')", 'sp.summation(i**2, (i, 0, n))'],
  },
  {
    latex: '\\prod_{k=1}^{n} k',
    expectedIR: ['Product', 'k', ['Limits', 'k', 1, 'n']],
    expectedPython: ["k, n = sp.symbols('k n')", 'sp.product(k, (k, 1, n))'],
  },
  {
    latex: '\\lim_{x\\to 0} \\frac{\\sin x}{x}',
    // A bare \lim is two-sided — sympy's dir='+' default would silently
    // right-hand it (1/x at 0 gives oo instead of zoo).
    expectedPython: [
      'x = sp.Symbol("x")',
      "sp.limit(sp.sin(x) / x, x, 0, dir='+-')",
    ],
  },
  {
    latex: '\\frac{d}{dx} x^2',
    expectedIR: ['D', ['Power', 'x', 2], 'x'],
    expectedPython: ['x = sp.Symbol("x")', 'sp.diff(x**2, x)'],
  },
  {
    latex: "f'(x)",
    expectedIR: ['Apply', ['Derivative', 'f', 1], 'x'],
    expectedPython: [
      'x = sp.Symbol("x")',
      'f = sp.Function("f")',
      'sp.diff(f(x), x)',
    ],
  },
  {
    // A non-name "callee" is juxtaposed factors, not a call — emitting
    // `sqrt(x)(x + 1)` raised 'Pow' object is not callable in the worker.
    latex: '\\sqrt{x}(x+1)',
    expectedIR: ['Multiply', ['Sqrt', 'x'], ['Add', 'x', 1]],
    expectedPython: ['x = sp.Symbol("x")', 'sp.sqrt(x) * (x + 1)'],
  },
  {
    // `2(x+1)` hit the same bug as 'int' object is not callable.
    latex: '2(x+1)',
    expectedIR: ['Multiply', 2, ['Add', 'x', 1]],
    expectedPython: ['x = sp.Symbol("x")', '2 * (x + 1)'],
  },
  {
    latex: 'x^{2}(y+1)',
    expectedIR: ['Multiply', ['Power', 'x', 2], ['Add', 'y', 1]],
    expectedPython: ["x, y = sp.symbols('x y')", 'x**2 * (y + 1)'],
  },
  {
    // Inside an integrand: \int 1/(\sqrt{x}(x+1)) dx previously emitted
    // integrate(1/(sqrt(x)(x + 1)), x) → 'Pow' object is not callable.
    latex: '\\int \\frac{1}{\\sqrt{x}(x+1)}dx',
    expectedIR: [
      'Integrate',
      ['Divide', 1, ['Multiply', ['Sqrt', 'x'], ['Add', 'x', 1]]],
      ['Limits', 'x', 'Nothing', 'Nothing'],
    ],
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.integrate(1 / (sp.sqrt(x) * (x + 1)), x) + sp.Symbol("C")',
    ],
  },
  {
    latex: '\\operatorname{foo}(x) + 1',
    expectedIR: ['Add', ['call', 'foo', 'x'], 1],
    // Unknown names become worksheet functions — sp.foo(x) would raise
    // AttributeError at eval time.
    expectedPython: [
      'x = sp.Symbol("x")',
      'foo = sp.Function("foo")',
      'foo(x) + 1',
    ],
    issues: ['unknown head "foo"'],
  },
  {
    latex: '\\mathrm{solve}(x^2 = 4, x)',
    expectedIR: ['call', 'solve', ['Equal', ['Power', 'x', 2], 4], 'x'],
    // `solve` is a real SymPy builtin — the call tier emits it sp.-bound.
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.solve(sp.Eq(x**2, 4), x)',
    ],
  },
  {
    latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
    expectedIR: ['Matrix', ['List', ['List', 'a', 'b'], ['List', 'c', 'd']]],
    expectedPython: [
      "a, b, c, d = sp.symbols('a b c d')",
      'sp.Matrix([[a, b], [c, d]])',
    ],
  },
  {
    latex: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}',
    expectedPython: [
      "a, b, c, d = sp.symbols('a b c d')",
      'sp.Matrix([[a, b], [c, d]]).det()',
    ],
  },
  {
    latex:
      '\\begin{cases} x & x > 0 \\\\ -x & x \\le 0 \\end{cases}',
    // Conditions keep their written order (Greater, not flipped Less).
    expectedIR: [
      'Which',
      ['Greater', 'x', 0],
      'x',
      ['LessEqual', 'x', 0],
      ['Negate', 'x'],
    ],
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.Piecewise((x, sp.Gt(x, 0)), (-x, sp.Le(x, 0)))',
    ],
  },
  {
    latex: '\\binom{n}{k}',
    expectedIR: ['Binomial', 'n', 'k'],
    expectedPython: ["n, k = sp.symbols('n k')", 'sp.binomial(n, k)'],
  },
  {
    latex: '\\frac{1}{2}',
    // Non-canonical keeps Divide; codegen lowers int/int to Rational so
    // the division stays exact.
    expectedIR: ['Divide', 1, 2],
    expectedPython: ['sp.Rational(1, 2)'],
  },
  {
    latex: '\\sqrt{x} + \\sin(\\theta)',
    expectedPython: [
      "x, theta = sp.symbols('x theta')",
      'sp.sqrt(x) + sp.sin(theta)',
    ],
  },
  {
    latex: 'x \\ge 2',
    expectedIR: ['GreaterEqual', 'x', 2],
    expectedPython: ['x = sp.Symbol("x")', 'sp.Ge(x, 2)'],
  },
  {
    latex: 'x \\ne 0',
    expectedPython: ['x = sp.Symbol("x")', 'sp.Ne(x, 0)'],
  },
  {
    latex: 'a = b = c',
    expectedPython: [
      "a, b, c = sp.symbols('a b c')",
      'sp.And(sp.Eq(a, b), sp.Eq(b, c))',
    ],
  },
  {
    // Bare `a_{n+1}` collapses to just its definition line.
    latex: 'a_{n+1}',
    expectedIR: 'a_{n+1}',
    expectedPython: ['a__n_1 = sp.Symbol("a_{n+1}")'],
  },
  {
    latex: 'n!',
    expectedIR: ['Factorial', 'n'],
    expectedPython: ['n = sp.Symbol("n")', 'sp.factorial(n)'],
  },
  {
    latex: '|x|',
    expectedPython: ['x = sp.Symbol("x")', 'sp.Abs(x)'],
  },
  {
    latex: '\\ln x',
    expectedPython: ['x = sp.Symbol("x")', 'sp.log(x)'],
  },
  {
    latex: '\\log_{2} x',
    // Non-canonical Lb head folds to Log(x, 2).
    expectedIR: ['Log', 'x', 2],
    expectedPython: ['x = sp.Symbol("x")', 'sp.log(x, 2)'],
  },
  {
    // The example from the spec discussion: a cell containing just `a`
    // emits `a = sp.Symbol('a')` as its output.
    latex: 'a',
    expectedPython: ['a = sp.Symbol("a")'],
  },
  {
    // `f(x)` is f·x — parens after a bare name multiply. Calls need an
    // upright word callee (\mathrm{foo}(x)) or a \text{def}-declared name.
    latex: 'f(x)',
    expectedIR: ['Multiply', 'f', 'x'],
    expectedPython: ["f, x = sp.symbols('f x')", 'f * x'],
  },
  {
    // `a'` is a primed name, not an applied derivative — `sp.prime`
    // doesn't exist; it emits as its own symbol (a_prime ident so it
    // can't silently collide with `a`).
    latex: "a'",
    expectedIR: "a'",
    expectedPython: ['a_prime = sp.Symbol("a\'")'],
  },
  {
    latex: "x''(t)",
    expectedIR: ['Apply', ['Derivative', 'x', 2], 't'],
    expectedPython: [
      't = sp.Symbol("t")',
      'x = sp.Function("x")',
      'sp.diff(x(t), t, 2)',
    ],
  },
  {
    // \cos^{-1}(x): CE wraps the base as InverseFunction; codegen maps
    // to the arc- form. Previously emitted InverseFunction garbage.
    latex: '\\cos^{-1}(x)',
    expectedIR: ['Apply', ['InverseFunction', 'Cos'], 'x'],
    expectedPython: ['x = sp.Symbol("x")', 'sp.acos(x)'],
  },
  {
    // \det on a non-matrix emitted `3.det()` / `A.det()` — a
    // SyntaxError or wrong answer; Determinant(...) displays the form
    // and flags that it can't evaluate.
    latex: '\\det(3)',
    // sp.Determinant(non-matrix) raises TypeError at eval — a Function
    // stub displays the intended form and stays valid python.
    expectedPython: [
      'Determinant = sp.Function("Determinant")',
      'Determinant(3)',
    ],
    issues: ['determinant needs a matrix'],
  },
  {
    latex: 'A^T',
    expectedPython: [
      'A = sp.MatrixSymbol("A", sp.Symbol("n", integer=True, positive=True), sp.Symbol("n", integer=True, positive=True))',
      'sp.Transpose(A)',
    ],
  },
  {
    // \left. f \right|_{lo}^{hi}: folded to EvaluateAt — the
    // substitution difference, not a mangled power.
    latex: '\\left. \\frac{x^2}{2} \\right|_{0}^{1}',
    expectedIR: ['EvaluateAt', ['Divide', ['Power', 'x', 2], 2], 0, 1],
    expectedPython: [
      'x = sp.Symbol("x")',
      '(x**2 / 2).subs(x, 1) - (x**2 / 2).subs(x, 0)',
    ],
  },
  {
    // \; \, spacing commands are layout, not operands — they used to
    // leak a HorizontalSpacing node into codegen.
    latex: 'x\\;y',
    expectedIR: ['Multiply', 'x', 'y'],
    expectedPython: ["x, y = sp.symbols('x y')", 'x * y'],
  },
  {
    // n!! is factorial2 in SymPy, not a `Factorial2` unknown head.
    latex: 'n!!',
    expectedPython: ['n = sp.Symbol("n")', 'sp.factorial2(n)'],
  },
  {
    latex: '\\{1, 2, 3\\}',
    expectedPython: ['sp.FiniteSet(1, 2, 3)'],
  },
  {
    latex: '\\operatorname{sign}(x)',
    expectedIR: ['Sign', 'x'],
    expectedPython: ['x = sp.Symbol("x")', 'sp.sign(x)'],
  },
  {
    // One-sided limits carry a direction arg (±1) — previously the
    // direction landed as the limit point: limit(f, 0, 1).
    latex: '\\lim_{x \\to 0^{+}} \\frac{1}{x}',
    expectedPython: [
      'x = sp.Symbol("x")',
      "sp.limit(1 / x, x, 0, dir='+')",
    ],
  },
  {
    latex: '\\lim_{x \\to 0^{-}} \\frac{1}{x}',
    expectedPython: [
      'x = sp.Symbol("x")',
      "sp.limit(1 / x, x, 0, dir='-')",
    ],
  },
  {
    // Comma-list subscripts keep their name — used to emit 'x_{?}'.
    latex: 'x_{i,j}',
    expectedPython: ['x__i_j = sp.Symbol("x_{i,j}")'],
  },
  {
    // \boxed is presentational — emit the wrapped expression.
    latex: '\\boxed{x^{2}}',
    expectedPython: ['x = sp.Symbol("x")', 'x**2'],
  },
  {
    // Accent marks denote distinct variables: \hat{x} -> x_hat.
    latex: '\\hat{x} + \\vec{v}',
    expectedPython: ["x_hat, v_vec = sp.symbols('x_hat v_vec')", 'x_hat + v_vec'],
  },
  {
    latex: '\\|v\\|',
    expectedPython: ['v = sp.Symbol("v")', 'sp.Abs(v)'],
  },
  {
    // a \mid b: a divides b.
    latex: 'a \\mid b',
    expectedPython: ["b, a = sp.symbols('b a')", 'sp.Eq(sp.Mod(b, a), 0)'],
  },
  {
    // CE can't parse \underset — rewritten to \lim_{x\to0} before parse.
    latex: '\\underset{x\\to0}{\\lim} f',
    expectedPython: ["f, x = sp.symbols('f x')", "sp.limit(f, x, 0, dir='+-')"],
  },
  {
    // The editor serializes \lim with its own empty underscript block —
    // the rewrite fills it rather than stacking a second bound.
    latex: '\\underset{x\\to0}{\\lim_{ }} f',
    expectedPython: ["f, x = sp.symbols('f x')", "sp.limit(f, x, 0, dir='+-')"],
  },
  {
    // \Big( ... \Big) sizes are dropped — the parens stay an implicit
    // product, so `a\Big(b\Big)` is a·b.
    latex: 'a\\Big(b\\Big)',
    expectedPython: ["a, b = sp.symbols('a b')", 'a * b'],
  },
  {
    // \; spacing commands are stripped for codegen (implicit multiply).
    latex: 'x \\; y',
    expectedPython: ["x, y = sp.symbols('x y')", 'x * y'],
  },
  {
    latex: '\\emptyset',
    expectedPython: ['sp.EmptySet'],
  },
  {
    // \bigg|_{x=0} is the textbook "evaluated at" bar — \big* sizes are
    // stripped and the lone | wraps as \left. \right|, and an Equal bound
    // substitutes the point rather than the equation.
    latex: '\\frac{dy}{dx}\\bigg|_{x=0}',
    // dy/dx treats y as a function of x (y = sp.Function('y')) —
    // sp.diff(y(x), x) keeps the intended dy/dx reading.
    expectedPython: [
      'x = sp.Symbol("x")',
      'y = sp.Function("y")',
      '(sp.diff(y(x), x)).subs(x, 0)',
    ],
  },
  {
    latex: 'f\\big|_{a}^{b}',
    expectedPython: [
      "f, b, a = sp.symbols('f b a')",
      '(f).subs(f, b) - (f).subs(f, a)',
    ],
  },
  {
    // \left. \right| with an equation bound — used to emit
    // subs(x, Eq(x, a)) instead of substituting the point.
    latex: '\\left. f \\right|_{x=a}',
    expectedPython: ["f, x, a = sp.symbols('f x a')", '(f).subs(x, a)'],
  },
  {
    // A primed variable is distinct from the unprimed name — the `'` must
    // survive ident mangling (x' -> x_prime), not collapse onto `x`.
    latex: "x' + x",
    expectedPython: [
      'x = sp.Symbol("x")',
      'x_prime = sp.Symbol("x\'")',
      'x_prime + x',
    ],
  },
  {
    // Negated relation heads CE emits directly (\nmid, \nless, \ngtr)
    // emit the faithful Not(<rel>) — SymPy has no \nless builtins.
    latex: 'a \\nmid b',
    expectedPython: [
      "b, a = sp.symbols('b a')",
      'sp.Not(sp.Eq(sp.Mod(b, a), 0))',
    ],
  },
  {
    latex: 'a \\nless b',
    expectedPython: ["a, b = sp.symbols('a b')", 'sp.Not(sp.Lt(a, b))'],
  },
  {
    latex: 'a \\implies b',
    expectedPython: ["a, b = sp.symbols('a b')", 'sp.Implies(a, b)'],
  },
  {
    latex: 'a \\equiv b',
    expectedPython: ["a, b = sp.symbols('a b')", 'sp.Eq(a, b)'],
  },
  {
    // x^{\circ} is degrees — emit the radians conversion, not an
    // unknown-head flag.
    latex: 'x^{\\circ}',
    expectedPython: ['x = sp.Symbol("x")', 'x * sp.pi / 180'],
  },
  {
    // x_{-} is a subscripted name, not an unknown 'Subminus' head.
    latex: 'x_{-}',
    expectedPython: ['x = sp.Symbol("x_{-}")'],
  },
  {
    // \min_{x} f minimizes f over x — used to emit sp.Min(_ * x * f)
    // with a garbage `_` symbol that raised NameError at runtime.
    latex: '\\min_{x} f',
    expectedPython: ["f, x = sp.symbols('f x')", 'sp.minimum(f, x)'],
  },
  {
    latex: '\\max_{x} f',
    expectedPython: ["f, x = sp.symbols('f x')", 'sp.maximum(f, x)'],
  },
  {
    // \min(x,y) keeps the elementwise sp.Min.
    latex: '\\min(x,y)',
    expectedPython: ["x, y = sp.symbols('x y')", 'sp.Min(x, y)'],
  },
  {
    // Half-open intervals map to sp.Interval; Open marks the open end.
    latex: '(a,b]',
    expectedPython: [
      "a, b = sp.symbols('a b')",
      'sp.Interval(a, b, left_open=True)',
    ],
  },
  {
    latex: '[a,b)',
    expectedPython: [
      "a, b = sp.symbols('a b')",
      'sp.Interval(a, b, right_open=True)',
    ],
  },
  {
    // \underbrace{x}_{n}: the label annotates, it isn't a subscript —
    // the statement is x + 1, not a mangled x_{n} symbol.
    latex: '\\underbrace{x+1}_{n}',
    expectedPython: ['x = sp.Symbol("x")', 'x + 1'],
  },
  {
    // \mathbb{...} number sets emit the S.* set objects, not bare
    // symbol names that raise NameError at eval time.
    latex: '\\mathbb{R}',
    expectedPython: ['sp.S.Reals'],
  },
  {
    // \in maps to sp.Contains only when the operand is provably a Set —
    // a bare symbol S keeps the flagged Element(...) stub because
    // sp.Contains raises TypeError on it. A first-referenced member
    // also carries the set's domain on its Symbol constructor.
    latex: 'x \\in \\mathbb{R}',
    expectedPython: [
      'x = sp.Symbol("x", real=True)',
      'sp.Contains(x, sp.S.Reals)',
    ],
  },
  {
    // Each standard number set contributes the fullest Symbol kwargs
    // the constructor allows.
    latex: 'x \\in \\mathbb{Z}',
    expectedPython: [
      'x = sp.Symbol("x", integer=True)',
      'sp.Contains(x, sp.S.Integers)',
    ],
  },
  {
    latex: 'x \\in \\mathbb{N}',
    expectedPython: [
      'x = sp.Symbol("x", integer=True, nonnegative=True)',
      'sp.Contains(x, sp.S.Naturals0)',
    ],
  },
  {
    // Interval membership implies the real domain too — first-referenced
    // symbols get real=True, and the membership emits inside a
    // `with assuming(Q.real(x)):` block since the interval itself
    // can't carry the member's assumption.
    latex: 'x \\in (a,b]',
    expectedPython: [
      "a, b = sp.symbols('a b')",
      'x = sp.Symbol("x", real=True)',
      'with sp.assuming(sp.Q.real(x)):',
      '    sp.Contains(x, sp.Interval(a, b, left_open=True))',
    ],
  },
  {
    // A member already bound (Assign) is not first-referenced — no
    // Symbol kwargs, but the interval membership still assumes real.
    latex: '\\displaylines{ x = 1 \\\\ x \\in (0,2] }',
    expectedPython: [
      'x = 1',
      'with sp.assuming(sp.Q.real(x)):',
      '    sp.Contains(x, sp.Interval(0, 2, left_open=True))',
    ],
  },
  {
    // \notin asserts the opposite domain — no Symbol kwargs and no
    // assuming block, only the negated Contains.
    latex: 'x \\notin \\mathbb{R}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.Not(sp.Contains(x, sp.S.Reals))',
    ],
  },
  {
    // A bare symbol is not provably a set — `x \in S` reads it as a
    // singleton `x \in {S}` rather than a TypeError or a flagged stub,
    // the same convention the set ops use (`x \cup y` -> `{x, y}`).
    latex: 'x \\in S',
    expectedPython: [
      "x, S = sp.symbols('x S')",
      'sp.Contains(x, sp.FiniteSet(S))',
    ],
  },
  {
    latex: '\\emptyset \\cup \\mathbb{Z}',
    expectedPython: ['sp.Union(sp.EmptySet, sp.S.Integers)'],
  },
  {
    latex: 'A^{\\dagger}',
    expectedPython: [
      'A = sp.MatrixSymbol("A", sp.Symbol("n", integer=True, positive=True), sp.Symbol("n", integer=True, positive=True))',
      'sp.Adjoint(A)',
    ],
  },
  {
    // Nested parens flatten to one product — `g(f(x))` is g·f·x.
    latex: 'g(f(x))',
    expectedPython: ["g, f, x = sp.symbols('g f x')", 'g * f * x'],
  },
  {
    // \mathbb{P} — sp.S.Primes doesn't exist; the primes set is a
    // ConditionSet, and x still picks up prime=True.
    latex: 'x \\in \\mathbb{P}',
    expectedPython: [
      'x = sp.Symbol("x", prime=True)',
      'sp.Contains(x, sp.ConditionSet(sp.Symbol("p"), sp.Q.prime(sp.Symbol("p")), sp.S.Naturals))',
    ],
  },
  {
    // \mathbb{Z}^+ — CE names it PositiveIntegers; the naturals.
    latex: 'x \\in \\mathbb{Z}^{+}',
    expectedPython: [
      'x = sp.Symbol("x", integer=True, positive=True)',
      'sp.Contains(x, sp.S.Naturals)',
    ],
  },
  {
    // \mathbb{R}_+ — positive reals are an open interval, not an S.* set.
    latex: 'x \\in \\mathbb{R}_{+}',
    expectedPython: [
      'x = sp.Symbol("x", positive=True)',
      'sp.Contains(x, sp.Interval.open(0, sp.oo))',
    ],
  },
  {
    // (x, y) \in \mathbb{R}^2 — the member is a Tuple (a python list
    // isn't a SymPy arg) and S.Reals**2 is a real ProductSet.
    latex: '(x, y) \\in \\mathbb{R}^{2}',
    expectedPython: [
      "x, y = sp.symbols('x y')",
      'sp.Contains(sp.Tuple(x, y), sp.S.Reals**2)',
    ],
  },
  {
    // A \in \mathbb{R}^{2\times2} — no SymPy matrix space exists; the
    // member becomes a MatrixSymbol and the membership a readable stub.
    latex: 'A \\in \\mathbb{R}^{2\\times2}',
    expectedPython: [
      'A = sp.MatrixSymbol("A", 2, 2)',
      'Element = sp.Function("Element")',
      'MatrixSpace = sp.Function("MatrixSpace")',
      'Element(A, MatrixSpace(sp.S.Reals, 2, 2))',
    ],
    issues: ['matrix space'],
  },
  {
    // Set-builder: {x | p} filters, {x ∈ D | p} a ConditionSet with base
    // set, {f(x) | x ∈ D} an ImageSet.
    latex: '\\{x : x > 0\\}',
    expectedPython: ['x = sp.Symbol("x")', 'sp.ConditionSet(x, sp.Gt(x, 0))'],
  },
  {
    latex: '\\{x \\in \\mathbb{R} : x > 0\\}',
    expectedPython: [
      'x = sp.Symbol("x", real=True)',
      'sp.ConditionSet(x, sp.Gt(x, 0), sp.S.Reals)',
    ],
  },
  {
    latex: '\\{x^{2} : x \\in \\mathbb{Z}\\}',
    expectedPython: [
      'x = sp.Symbol("x", integer=True)',
      'sp.ImageSet(sp.Lambda(x, x**2), sp.S.Integers)',
    ],
  },
  {
    // f'(0)/f'(\pi): sp.diff can't take a literal/constant as its
    // variable — diff at a fresh symbol, then substitute the point.
    latex: "f'(0)",
    expectedPython: [
      'x = sp.Symbol("x")',
      'f = sp.Function("f")',
      'sp.diff(f(x), x).subs(x, 0)',
    ],
  },
  {
    latex: "f'(\\pi)",
    expectedPython: [
      'x = sp.Symbol("x")',
      'f = sp.Function("f")',
      'sp.diff(f(x), x).subs(x, sp.pi)',
    ],
  },
  {
    // Chained relations emit the pairwise And — a right-nested
    // Less(x, Less(y, z)) used to emit Lt(x, Lt(y, z)) and raise
    // TypeError inside SymPy's argsort.
    latex: 'x < y < z',
    expectedPython: [
      "x, y, z = sp.symbols('x y z')",
      'sp.And(sp.Lt(x, y), sp.Lt(y, z))',
    ],
  },
  {
    latex: 'a \\ne b \\ne c',
    expectedPython: [
      "a, b, c = sp.symbols('a b c')",
      'sp.And(sp.Ne(a, b), sp.Ne(b, c))',
    ],
  },
  {
    latex: '1 \\le x < 3',
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.And(sp.Le(1, x), sp.Lt(x, 3))',
    ],
  },
  {
    // \sup_{x} f — no sp.Supremum exists; keep the readable stub.
    latex: '\\sup_{x} f',
    expectedPython: [
      "f, x = sp.symbols('f x')",
      'Supremum = sp.Function("Supremum")',
      'Supremum(f, x)',
    ],
    issues: ['Supremum'],
  },
  {
    // \min_{x \ge 0} x^2 — a relational underscript becomes the
    // optimization domain Interval.
    latex: '\\min_{x \\ge 0} x^{2}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.minimum(x**2, x, sp.Interval(0, sp.oo))',
    ],
  },
  {
    // \min_{x} f(x) — `f(x)` is f·x, so the body is the product f*x.
    latex: '\\min_{x} f(x)',
    expectedPython: [
      "f, x = sp.symbols('f x')",
      'sp.minimum(f * x, x)',
    ],
  },
  {
    // \dot{x} parses as D(x, t) — x is a function of t, so it emits
    // diff(x(t), t) rather than an independence-zero derivative.
    latex: '\\dot{x}',
    expectedPython: [
      't = sp.Symbol("t")',
      'x = sp.Function("x")',
      'sp.diff(x(t), t)',
    ],
  },
  {
    // Nested indefinite integrals take +C per level — an inner
    // constant integrates into a real term (f·x²/2 + C·x + D).
    latex: '\\int\\int f dx dx',
    expectedPython: [
      "f, x = sp.symbols('f x')",
      'sp.integrate(sp.integrate(f, x) + sp.Symbol("C"), x) + sp.Symbol("D")',
    ],
  },
  {
    // \overline{z} maps onto sp.conjugate — not a Conjugate stub.
    latex: '\\overline{z}',
    expectedPython: ['z = sp.Symbol("z")', 'sp.conjugate(z)'],
  },
  {
    // \Re / \Im / \arg operator names hit the sp.re/im/arg builtins.
    latex: '\\Re z',
    expectedPython: ['z = sp.Symbol("z")', 'sp.re(z)'],
  },
  {
    latex: '\\overbrace{a+b}^{c}',
    expectedPython: ["a, b = sp.symbols('a b')", 'a + b'],
  },
  {
    // \tilde{t}: CE calls the accent OverTilde — the suffix map's
    // lowercase 'Overtilde' key never matched and emitted a stub.
    latex: '\\tilde{t}',
    expectedPython: ['t_tilde = sp.Symbol("t_tilde")'],
  },
  {
    latex: 'e^{i\\pi}',
    expectedPython: ['sp.E**(sp.I * sp.pi)'],
  },
  {
    // \min_{i=1}^{n}: the sub+sup underscript folds into
    // Power(Equal(i,1),n) — an integer index range (like \sum bounds),
    // NOT a real interval. Symbolic bounds can't be iterated by sympy,
    // so it degrades to a flagged Minimum stub over sp.Range.
    latex: '\\min_{i=1}^{n} i^{2}',
    expectedPython: [
      "i, n = sp.symbols('i n')",
      'Minimum = sp.Function("Minimum")',
      'Minimum(i**2, i, sp.Range(1, n + 1))',
    ],
    issues: ['symbolic i=lo..hi range'],
  },
  {
    // \min_{i=1}^{10}: concrete integer bounds emit Min over the
    // substituted values — the integer-domain minimum, not the
    // continuous sp.minimum over a real interval.
    latex: '\\min_{i=1}^{10} i^{2}',
    expectedPython: [
      'i = sp.Symbol("i")',
      'sp.Min(*[(i**2).subs(i, _i) for _i in range(1, 11)])',
    ],
  },
  {
    // (x,y) = (1,2): a symbol-tuple target unpacks — previously emitted
    // sp.Eq([x,y],[1,2]) which SympifyError'd on the python lists.
    latex: '(x,y) = (1,2)',
    expectedPython: ['x, y = [1, 2]'],
  },
  {
    // \widehat{AB}: CE reads the decoration as Arc(A,B); previously the
    // two-arg form emitted the bare product A*B with no mark.
    latex: '\\widehat{AB}',
    expectedPython: ['AB_arc = sp.Symbol("AB_arc")'],
  },
  {
    // A matrix integrand's constant is a same-shape MatrixSymbol —
    // `Matrix + Symbol` is a TypeError.
    latex: '\\int \\begin{pmatrix} x & 0 \\\\ 0 & x \\end{pmatrix} dx',
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.integrate(sp.Matrix([[x, 0], [0, x]]), x) + sp.MatrixSymbol("C", 2, 2)',
    ],
  },
  {
    // A \in R^{mxn}-declared name as integrand → MatrixSymbol constant
    // with the declared dims.
    latex:
      '\\displaylines{A \\in \\mathbb{R}^{2\\times2} \\\\ \\int A\\;dx}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'A = sp.MatrixSymbol("A", 2, 2)',
      'Element = sp.Function("Element")',
      'MatrixSpace = sp.Function("MatrixSpace")',
      'Element(A, MatrixSpace(sp.S.Reals, 2, 2))',
      'sp.integrate(A, x) + sp.MatrixSymbol("C", 2, 2)',
    ],
    issues: ['matrix space'],
  },
  {
    // x' = 1 assigns a primed variable — functionDefShape used to match
    // the Prime(x) shape and emit `def Prime(x): return 1`.
    latex: "x' = 1",
    expectedPython: ['x_prime = 1'],
  },
  {
    // S^{-} / S^{*} / S^{\times}: decorated standard sets map to real
    // SymPy — Intersect/Complement — not Adjoint or call stubs.
    latex: 'x \\in \\mathbb{Z}^{-}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.Contains(x, sp.Intersection(sp.S.Integers, sp.Interval.open(-sp.oo, 0)))',
    ],
  },
  {
    latex: 'x \\in \\mathbb{Z}^{*}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.Contains(x, sp.Complement(sp.S.Integers, sp.FiniteSet(0)))',
    ],
  },
  {
    latex: 'x \\in \\mathbb{R}^{\\times}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.Contains(x, sp.Complement(sp.S.Reals, sp.FiniteSet(0)))',
    ],
  },
  {
    // x := y := 5 — a nested Assign isn't a value (sp.Assign doesn't
    // exist); it flattens to sequential statements.
    latex: 'x := y := 5',
    expectedPython: ['y = 5', 'x = y'],
  },
  {
    // \dot{x} = f(x) is an ODE — the D operator must not read as a
    // function name; `f(x)` is f·x, and depvar x emits x(t).
    latex: '\\dot{x} = f(x)',
    expectedPython: [
      "t, f = sp.symbols('t f')",
      'x = sp.Function("x")',
      'sp.Eq(sp.diff(x(t), t), f * x(t))',
    ],
  },
  {
    latex: '\\frac{dy}{dx} = 0',
    expectedPython: [
      'x = sp.Symbol("x")',
      'y = sp.Function("y")',
      'sp.Eq(sp.diff(y(x), x), 0)',
    ],
  },
  {
    // \operatorname{sqrt}/factorial/etc. resolve to real SymPy builtins
    // rather than worksheet-Function stubs.
    latex: '\\operatorname{sqrt}(2)',
    expectedPython: ['sp.sqrt(2)'],
  },
  {
    // `f: x \mapsto x^2` is a named function declaration — bind it like
    // f(x) = x^2 instead of emitting a bare lambda that loses the name.
    latex: 'f: x \\mapsto x^2',
    expectedPython: ['def f(x):', '    return x**2'],
  },
  {
    // `g: (x,y) \mapsto x+y` — the Colon-typed declaration shape.
    latex: 'g: (x,y) \\mapsto x+y',
    expectedPython: ['def g(x, y):', '    return x + y'],
  },
  {
    // `(x \mapsto x^2)(3)` applies the lambda — `(lambda x: x**2)(3)`,
    // not `(lambda ...) * 3` (TypeError).
    latex: '(x \\mapsto x^2)(3)',
    expectedPython: ['x = sp.Symbol("x")', 'sp.Lambda(x, x**2)(3)'],
  },
  {
    // A bare-point eval bound on a multi-free body names the actual
    // fallback var (x) — and an `x=a` bound pins the var explicitly so
    // no infer note fires (\dot{x}|_{t=0} subs t, not "w.r.t. x").
    latex: '\\left. x + y \\right|_{0}',
    expectedPython: ["x, y = sp.symbols('x y')", '(x + y).subs(x, 0)'],
    issues: ['evaluated w.r.t. x'],
  },
  {
    // `f(x) = x^2` is an equation now — `f(3)` is f·3, not a call.
    latex: '\\displaylines{f(x) = x^2 \\\\ f(3)}',
    expectedPython: [
      "f, x = sp.symbols('f x')",
      'sp.Eq(f * x, x**2)',
      'f * 3',
    ],
  },
  {
    // Same for g — both lines are ordinary multiply/equation forms.
    latex: '\\displaylines{g(3) \\\\ g(x) = x+1}',
    expectedPython: [
      "g, x = sp.symbols('g x')",
      'g * 3',
      'sp.Eq(g * x, x + 1)',
    ],
  },
  {
    // sp.gcd takes exactly two terms — a third arg lands in *gens and
    // raises on numbers. The list form folds over all terms.
    latex: '\\gcd(6,9,15)',
    expectedPython: ['sp.gcd([6, 9, 15])'],
  },
  {
    // sp.multinomial doesn't exist — degrade to a worksheet Function
    // stub (flagged) instead of an AttributeError.
    latex: '\\mathrm{multinomial}(2,3,1)',
    expectedPython: [
      'multinomial = sp.Function("multinomial")',
      'multinomial(2, 3, 1)',
    ],
    issues: ['unknown head "multinomial"'],
  },
  {
    // a \equiv b \pmod{m} — SymPy has no congruence relation;
    // Eq(Mod(a, m), b) states it faithfully.
    latex: '5 \\equiv 2 \\pmod{3}',
    expectedPython: ['sp.Eq(sp.Mod(5, 3), 2)'],
  },
  {
    // \mathrm{otherwise} in a cases condition is the default branch —
    // emit True, not a symbolic condition that can never fire.
    latex:
      'f(x) = \\begin{cases} x^2 & x > 0 \\\\ 0 & \\mathrm{otherwise} \\end{cases}',
    expectedPython: [
      "f, x = sp.symbols('f x')",
      'sp.Eq(f * x, sp.Piecewise((x**2, sp.Gt(x, 0)), (0, True)))',
    ],
  },
  {
    // \text{if } inside a cases condition fuses into an InvisibleOperator
    // application — unwrap it so the condition is the plain relation.
    latex:
      '\\begin{cases} x & \\text{if } x > 0 \\\\ -x & \\text{otherwise} \\end{cases}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.Piecewise((x, sp.Gt(x, 0)), (-x, True))',
    ],
  },
  {
    // sp.multinomial doesn't exist — degrade to a worksheet Function
    // stub (flagged) instead of an AttributeError.
    latex: '\\mathrm{multinomial}(2,3,1)',
    expectedPython: [
      'multinomial = sp.Function("multinomial")',
      'multinomial(2, 3, 1)',
    ],
    issues: ['unknown head "multinomial"'],
  },
  {
    // \operatorname{nCk}(n,k) is unambiguous — real SymPy binomial.
    latex: '\\mathrm{nCk}(5,2)',
    expectedPython: ['sp.binomial(5, 2)'],
  },
  {
    // \operatorname{perm}(n,k) / nPr — falling factorial.
    latex: '\\mathrm{perm}(5,2)',
    expectedPython: ['sp.ff(5, 2)'],
  },
  {
    // Real SymPy functions reach through \operatorname: sp.nextprime etc.
    latex: '\\mathrm{nextprime}(5)',
    expectedPython: ['sp.nextprime(5)'],
  },
  {
    // A matrix bound by an earlier statement supports .det()/.norm()/
    // .trace() — Determinant(A) on a scalar would be wrong, but A is a
    // worksheet-declared Matrix.
    latex:
      'A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix} \\\\ \\det(A) \\\\ \\mathrm{trace}(A)',
    expectedPython: [
      'A = sp.Matrix([[1, 2], [3, 4]])',
      'sp.Determinant(A)',
      '(A).trace()',
    ],
  },
  {
    // \mathrm{trace}(A) fused to a matrix literal is a method call, not
    // `trace * Matrix`. A symbol operand is an honest stub — sp.trace
    // raises TypeError on non-matrices.
    latex: '\\mathrm{trace}(\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix})',
    expectedPython: ['(sp.Matrix([[1, 2], [3, 4]])).trace()'],
  },
  {
    latex: '\\mathrm{rank}(\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix})',
    expectedPython: ['(sp.Matrix([[1, 2], [3, 4]])).rank()'],
  },
  {
    // I_<n> with a whole-number subscript is the n×n identity.
    latex: 'I_3',
    expectedPython: ['sp.eye(3)'],
  },
  {
    latex: 'I_{12}',
    expectedPython: ['sp.eye(12)'],
  },
  {
    // Non-integer/bare-I subscripts keep plain symbols; an explicit
    // `I_3 = …` binding wins over the identity reading.
    latex: '\\displaylines{ I_n \\\\ I_3 = 5 \\\\ I_3 + 1 }',
    expectedPython: ['I_n = sp.Symbol("I_n")', 'I_3 = 5', 'I_3 + 1'],
  },
  {
    // The identity name behaves like a matrix literal for the matrix
    // ops: .det()/.T evaluate, tr/rank take the matrix paths.
    latex:
      'I_3 + \\begin{pmatrix}1&0\\\\0&1\\end{pmatrix} \\\\ \\det(I_3) \\\\ I_3^T \\\\ \\mathrm{tr}(I_3) \\\\ \\det(I_2+I_3)',
    expectedPython: [
      'sp.eye(3) + sp.Matrix([[1, 0], [0, 1]])',
      'sp.eye(3).det()',
      'sp.eye(3).T',
      'sp.Trace(sp.eye(3))',
      '(sp.eye(2) + sp.eye(3)).det()',
    ],
  },
  {
    // A matrix-valued expression is still a matrix argument — det on a
    // sum of literals evaluates, not "the argument isn't one".
    latex:
      '\\det\\left(\\begin{pmatrix}0&0\\\\0&0\\end{pmatrix}+\\begin{pmatrix}9&9\\\\9&9\\end{pmatrix}\\right)',
    expectedPython: [
      '(sp.Matrix([[0, 0], [0, 0]]) + sp.Matrix([[9, 9], [9, 9]])).det()',
    ],
  },
  {
    // det/trace/inverse/transpose exist on sympy MatrixExpr, so they
    // emit on symbolic matrix expressions too; rank needs every matrix
    // leaf literal — flag + stub on declared names.
    latex:
      'A = \\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix} \\\\ B = \\begin{pmatrix} 2 & 0 \\\\ 0 & 2 \\end{pmatrix} \\\\ \\det(A+B) \\\\ \\mathrm{tr}(A+B) \\\\ \\mathrm{inverse}(A+B) \\\\ \\mathrm{transpose}(A+B) \\\\ \\mathrm{rank}(A+B)',
    expectedPython: [
      'rank = sp.Function("rank")',
      'A = sp.Matrix([[1, 0], [0, 1]])',
      'B = sp.Matrix([[2, 0], [0, 2]])',
      '(A + B).det()',
      'sp.Trace((A + B))',
      '(A + B).inv()',
      '(A + B).T',
      'rank(A + B)',
    ],
    issues: ['rank needs a concrete matrix'],
  },
  {
    // The \tr alias stores \mathrm{tr} — same lowering as \mathrm{trace}.
    latex: '\\mathrm{tr}(\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix})',
    expectedPython: ['(sp.Matrix([[1, 2], [3, 4]])).trace()'],
  },
  {
    latex: '\\mathrm{trace}(M)',
    expectedPython: [
      'M = sp.Symbol("M")',
      'trace = sp.Function("trace")',
      'trace(M)',
    ],
    issues: ['trace needs a matrix'],
  },
  {
    // M^{\mathrm{T}} reads as transpose — CE wraps the text superscript
    // as a __unit__ node.
    latex: 'M^{\\mathrm{T}}',
    expectedPython: [
      'M = sp.MatrixSymbol("M", sp.Symbol("n", integer=True, positive=True), sp.Symbol("n", integer=True, positive=True))',
      'sp.Transpose(M)',
    ],
  },
  {
    // `A.is_subset(B)` returns None on undecidable operands — a `Not`
    // wrap raised AttributeError on `sp.Not(None)`. Subset relations
    // lower through `Union(A,B) == B` (+ `A != B` when strict), which
    // always yields a Boolean.
    latex: '\\{1\\} \\subseteq \\{1,2\\}',
    expectedPython: [
      'sp.Eq(sp.Union(sp.FiniteSet(1), sp.FiniteSet(1, 2)), sp.FiniteSet(1, 2))',
    ],
  },
  {
    latex: '\\mathbb{Z} \\subset \\mathbb{R}',
    expectedPython: [
      'sp.And(sp.Eq(sp.Union(sp.S.Integers, sp.S.Reals), sp.S.Reals), sp.Ne(sp.S.Integers, sp.S.Reals))',
    ],
  },
  {
    // sympy has no set-typed symbol, so `A ⊆ B` on non-set operands
    // can't name two unknown sets — error rather than emitting the
    // singleton (membership) reading.
    latex: 'A \\nsubseteq B',
    expectedPython: ["A, B = sp.symbols('A B')"],
    issues: ['subset/superset needs concrete set operands'],
  },
  {
    // A D-operator-declared name is a function of the variable — later
    // bare references emit the applied form: `x + t` / `f(x)` on an
    // UndefinedFunction raise TypeError in the worker.
    latex: 'D(x,t) = x + t',
    expectedPython: [
      't = sp.Symbol("t")',
      'x = sp.Function("x")',
      'sp.Eq(sp.diff(x(t), t), x(t) + t)',
    ],
  },
  {
    latex: '\\frac{dy}{dx} = ky',
    expectedPython: [
      "x, k = sp.symbols('x k')",
      'y = sp.Function("y")',
      'sp.Eq(sp.diff(y(x), x), k * y(x))',
    ],
  },
  {
    // A declared function name in call-arg position is the unapplied
    // function — `\mathrm{foo}(f)` emits the eta form
    // `sp.Lambda(x, f(x))` (the bare name can't sympify; `f(x)` would
    // read as the composition arg evaluated at x).
    latex: '\\displaylines{\\text{def} f(x) = x^2 \\\\ \\mathrm{foo}(f)}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'foo = sp.Function("foo")',
      'def f(x):',
      '    return x**2',
      'foo(sp.Lambda(x, f(x)))',
    ],
    issues: ['unknown head "foo"'],
  },
  {
    latex: '\\displaylines{\\text{def} f(x) = x^2 \\\\ \\sin(f)}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'def f(x):',
      '    return x**2',
      'sp.sin(sp.Lambda(x, f(x)))',
    ],
  },
  {
    // Multi-arg signatures eta-expand over the tuple; `f + 1` stays
    // applied (`f(x) + 1`) — arithmetic position is the pointwise
    // reading, not a function value.
    latex: '\\displaylines{\\text{def} f(x,y) = x+y \\\\ \\mathrm{foo}(f)}',
    expectedPython: [
      "x, y = sp.symbols('x y')",
      'foo = sp.Function("foo")',
      'def f(x, y):',
      '    return x + y',
      'foo(sp.Lambda((x, y), f(x, y)))',
    ],
    issues: ['unknown head "foo"'],
  },
  {
    // `x \in S^{+}` — the S ∩ (0,∞) reading only holds when S is ℝ or
    // ℤ; on any other operand `^{+}` is the pseudoinverse, which sympy
    // can't take on an abstract matrix (no sp.pinv, MatrixSymbol has
    // no pinv) — flag and drop.
    latex: 'x \\in \\mathbb{S}^{+}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'S_doublestruck = sp.MatrixSymbol("S_doublestruck", sp.Symbol("n", integer=True, positive=True), sp.Symbol("n", integer=True, positive=True))',
    ],
    issues: ["sympy doesn't support pinv for abstract matrices"],
  },
  {
    // `x \in A^{+}` with a concrete matrix — the pinv is real, so
    // membership emits as the singleton ({A⁺} — x = A⁺).
    latex: '\\displaylines{A = \\begin{pmatrix}1&0\\\\0&1\\end{pmatrix} \\\\ x \\in A^{+}}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'A = sp.Matrix([[1, 0], [0, 1]])',
      'sp.Contains(x, sp.FiniteSet((A).pinv()))',
    ],
  },
  {
    latex: '\\displaylines{A = \\begin{pmatrix}1&0\\\\0&1\\end{pmatrix} \\\\ A^{+}}',
    expectedPython: ['A = sp.Matrix([[1, 0], [0, 1]])', '(A).pinv()'],
  },
  {
    // sympy has no symbolic pinv — a bare `A^{+}` flags rather than
    // emitting a plausible AttributeError (`(A).pinv()` crashes on
    // Symbol AND MatrixSymbol).
    latex: 'A^{+}',
    expectedPython: [
      'A = sp.MatrixSymbol("A", sp.Symbol("n", integer=True, positive=True), sp.Symbol("n", integer=True, positive=True))',
    ],
    issues: ["sympy doesn't support pinv for abstract matrices"],
  },
  {
    // sympy 1.14 has no quantifier objects — the predicate is the
    // emitted form. `∀x, p` (no domain) emits p itself.
    latex: '\\forall x: x>0',
    expectedPython: ['x = sp.Symbol("x")', 'sp.Gt(x, 0)'],
  },
  {
    // `∀x∈S, p` is "False isn't in the predicate's image" (vacuous
    // truth included); `∃x∈S, p` is "True is in the image". The
    // imageset check carries evaluate=False — the eager containment
    // solve raises TypeError on Boolean elements.
    latex: '\\forall x \\in \\mathbb{R}, x > x + 1',
    expectedPython: [
      'x = sp.Symbol("x", real=True)',
      'sp.Not(sp.Contains(sp.false, sp.ImageSet(sp.Lambda(x, sp.Gt(x, x + 1)), sp.S.Reals), evaluate=False))',
    ],
  },
  {
    latex: '\\exists x \\in \\mathbb{R}, x^{2}=2',
    expectedPython: [
      'x = sp.Symbol("x", real=True)',
      'sp.Contains(sp.true, sp.ImageSet(sp.Lambda(x, sp.Eq(x**2, 2)), sp.S.Reals), evaluate=False)',
    ],
  },
  {
    // Finite-set domains iterate so the answer evaluates at exec —
    // `∀x∈A, p` → `And(*(p.subs(x, e) for e in A))`, `∃` → Or. Names
    // bound to a Set literal (A = {1,2,4}) iterate the same way.
    latex: '\\forall x \\in \\{1,2\\}, x>0',
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.And(*[(sp.Gt(x, 0)).subs(x, _e) for _e in sp.FiniteSet(1, 2)])',
    ],
  },
  {
    latex: '\\exists x \\in \\{1,2\\}, x^{2}=4',
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.Or(*[(sp.Eq(x**2, 4)).subs(x, _e) for _e in sp.FiniteSet(1, 2)])',
    ],
  },
  {
    latex: '\\displaylines{A=\\{1, 2, 4\\}\\\\ \\forall x\\in A,\\ x>0}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'A = sp.FiniteSet(1, 2, 4)',
      'sp.And(*[(sp.Gt(x, 0)).subs(x, _e) for _e in A])',
    ],
  },
  {
    // `I = [a,b]` / `I = (a,b)` binds an Interval, not a list — CE
    // only mints Interval in membership context, so a 2-element List
    // (or Delimiter(Sequence)) bind is rewritten at parse, brackets
    // deciding openness. Infinite domain → imageset check, not
    // iteration.
    latex: '\\displaylines{I=[0,1]\\\\ \\forall x\\in I,\\ x>0}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'I = sp.Interval(0, 1)',
      'sp.Not(sp.Contains(sp.false, sp.ImageSet(sp.Lambda(x, sp.Gt(x, 0)), I), evaluate=False))',
    ],
  },
  {
    latex: '\\displaylines{I=(1,2)\\\\ x\\in I}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'I = sp.Interval(1, 2, left_open=True, right_open=True)',
      'sp.Contains(x, I)',
    ],
  },
  {
    latex: '\\displaylines{I=[1,2)\\\\ x\\in I}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'I = sp.Interval(1, 2, right_open=True)',
      'sp.Contains(x, I)',
    ],
  },
  {
    // A 3+-element bracket list stays a python list — finite and
    // iterable for quantifiers; Contains/set ops splat it as
    // `FiniteSet(*B)` (`FiniteSet(B)` on a list raises TypeError).
    latex: '\\displaylines{B=[1,2,3]\\\\ \\forall x\\in B,\\ x>0}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'B = [1, 2, 3]',
      'sp.And(*[(sp.Gt(x, 0)).subs(x, _e) for _e in B])',
    ],
  },
  {
    latex: '\\displaylines{B=[1,2,3]\\\\ x\\in B}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'B = [1, 2, 3]',
      'sp.Contains(x, sp.FiniteSet(*B))',
    ],
  },
  {
    // `expr \text{ for } x \in S` — set-builder notation, rewritten to
    // the Comprehension head at parse (its ForAll IR is identical to
    // `\forall`'s); a relational bound becomes a real domain.
    latex: '2x \\text{ for } x \\in \\{1,2,3\\}',
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.imageset(sp.Lambda(x, 2 * x), sp.FiniteSet(1, 2, 3))',
    ],
  },
  {
    latex: 'x \\text{ for } x>0',
    expectedPython: ['sp.Interval.open(0, sp.oo)'],
  },
  {
    latex: 'f \\circ g',
    expectedPython: [
      'f = sp.Function("f")',
      'g = sp.Function("g")',
      'sp.Lambda(sp.Symbol("x"), f(g(sp.Symbol("x"))))',
    ],
  },
  // --- `...` integer ranges + \text{...}: block statements ------------
  {
    // \{a, b, \ldots, z\} — CE's Range is hi-INCLUSIVE; sp.Range's upper
    // bound is exclusive so the emitted bound shifts +1.
    latex: 'S = \\{1,2,\\ldots,10\\}',
    expectedIR: ['Assign', 'S', ['Range', 1, 10, 1]],
    expectedPython: ['S = sp.Range(1, 11)'],
  },
  {
    // The step comes from the first two elements (2, 4, ... -> step 2).
    latex: 'i \\in \\{2,4,\\ldots,20\\}',
    expectedIR: ['Element', 'i', ['Range', 2, 20, 2]],
    expectedPython: ['sp.Contains(sp.I, sp.Range(2, 21, 2))'],
  },
  {
    // Symbolic bound — the +1 shift emits as an expression.
    latex: '\\{1,\\ldots,n\\}',
    expectedIR: ['Range', 1, 'n'],
    expectedPython: ['n = sp.Symbol("n")', 'sp.Range(1, n + 1)'],
  },
  {
    // A descending range steps down — the exclusive bound shifts -1.
    latex: '\\{10,9,\\ldots,1\\}',
    expectedIR: ['Range', 10, 1, -1],
    expectedPython: ['sp.Range(10, 0, -1)'],
  },
  {
    // \text{def} f(x): + \quad-indented rows — the multi-line def; a
    // bare expression row in the body is the return value.
    latex: '\\displaylines{\\text{def} f(x):\\\\ \\quad x^2}',
    expectedIR: ['Def', 'f', ['List', 'x'], ['Block', ['Power', 'x', 2]]],
    expectedPython: ['def f(x):', '    return x**2'],
  },
  {
    // \text{return} is explicit when it isn't the last row.
    latex: '\\displaylines{\\text{def} f(x):\\\\ \\quad \\text{return} x^2}',
    expectedIR: [
      'Def',
      'f',
      ['List', 'x'],
      ['Block', ['Return', ['Power', 'x', 2]]],
    ],
    expectedPython: ['def f(x):', '    return x**2'],
  },
  {
    // if/elif/else chain inside a def body — \quad\\quad (or \qquad)
    // indents the suite, \quad brings the next header back out.
    latex:
      '\\displaylines{\\text{def} f(x):\\\\ \\quad \\text{if} x > 0:\\\\ \\quad\\quad x\\\\ \\quad \\text{elif} x = 0:\\\\ \\quad\\quad 0\\\\ \\quad \\text{else}:\\\\ \\quad\\quad -x}',
    expectedIR: [
      'Def',
      'f',
      ['List', 'x'],
      [
        'Block',
        [
          'If',
          ['Greater', 'x', 0],
          ['Block', 'x'],
          [
            'Elif',
            ['Equal', 'x', 0],
            ['Block', 0],
            ['Else', ['Block', ['Negate', 'x']]],
          ],
        ],
      ],
    ],
    expectedPython: [
      'def f(x):',
      '    if sp.Gt(x, 0):',
      '        return x',
      '    elif sp.Eq(x, 0):',
      '        return 0',
      '    else:',
      '        return -x',
    ],
  },
  {
    // while + break — the nested \text{if} keeps its own body at
    // the deeper indent.
    latex:
      '\\displaylines{x = 0\\\\ \\text{while} x < 3:\\\\ \\quad x = x + 1\\\\ \\quad \\text{if} x > 2:\\\\ \\quad\\quad \\text{break}}',
    expectedIR: [
      'Block',
      ['Assign', 'x', 0],
      [
        'While',
        ['Less', 'x', 3],
        [
          'Block',
          ['Assign', 'x', ['Add', 'x', 1]],
          ['If', ['Greater', 'x', 2], ['Block', ['Break']]],
        ],
      ],
    ],
    expectedPython: [
      'x = 0',
      'while sp.Lt(x, 3):',
      '    x = x + 1',
      '    if sp.Gt(x, 2):',
      '        break',
    ],
  },
  {
    // for over a `...` range — the loop var binds like Python (no
    // Symbol decl for i) and stays bound after the loop.
    latex:
      '\\displaylines{y = 0\\\\ \\text{for} i \\in \\{1,2,\\ldots,10\\}:\\\\ \\quad y = y + i\\\\ \\quad \\text{if} y > 4:\\\\ \\quad\\quad \\text{break}}',
    expectedIR: [
      'Block',
      ['Assign', 'y', 0],
      [
        'For',
        'i',
        ['Range', 1, 10, 1],
        [
          'Block',
          ['Assign', 'y', ['Add', 'y', 'i']],
          ['If', ['Greater', 'y', 4], ['Block', ['Break']]],
        ],
      ],
    ],
    expectedPython: [
      'y = 0',
      'for i in sp.Range(1, 11):',
      '    y = y + i',
      '    if sp.Gt(y, 4):',
      '        break',
    ],
  },
  {
    // for over an explicit finite set literal.
    latex: '\\displaylines{\\text{for} k \\in \\{a,b,c\\}:\\\\ \\quad k + 1}',
    expectedIR: [
      'For',
      'k',
      ['Set', 'a', 'b', 'c'],
      ['Block', ['Add', 'k', 1]],
    ],
    expectedPython: [
      "a, b, c = sp.symbols('a b c')",
      'for k in sp.FiniteSet(a, b, c):',
      '    k + 1',
    ],
  },
  {
    // \text{continue} — CE parses it natively like \text{break}.
    latex:
      '\\displaylines{\\text{for} i \\in \\{1,2,3\\}:\\\\ \\quad \\text{continue}}',
    expectedPython: [
      'for i in sp.FiniteSet(1, 2, 3):',
      '    continue',
    ],
  },
  {
    // An empty def body — no indented rows — emits `pass`.
    latex: '\\displaylines{\\text{def} g(x):}',
    expectedPython: ['def g(x):', '    pass'],
  },
  {
    latex: '\\displaylines{\\text{while} \\text{true}:\\\\ \\quad \\text{break}}',
    expectedPython: ['while True:', '    break'],
  },
  // --- block syntax errors are flagged, not degraded ----------------
  {
    // `elif`/`else` rows need an `if` above them at the same indent.
    latex: '\\displaylines{\\text{elif} x > 0:\\\\ \\quad x}',
    expectedPython: ['x = sp.Symbol("x")'],
    issues: ['\\text{elif} without a matching \\text{if}'],
  },
];

describe('worksheet matrix tracking', () => {
  const cells = (...latex: string[]) =>
    latex.map((l) => ({ json: parseCellLatex(l) }));

  it('cross-cell matrix methods do not leak — a matrix from another cell is a bare Symbol here', () => {
    const out = compileWorksheet(
      cells(
        'A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}',
        '\\det(A)',
      ),
      'python',
      { importAll: false },
    );
    expect(out.cellLines[0]).toEqual([
      'import sympy as sp',
      'A = sp.Matrix([[1, 2], [3, 4]])',
    ]);
    // Cell 2's standalone program declares A as a MatrixSymbol — a bare
    // name in matrix position reads as an unknown matrix (same as
    // `\det A` on an undeclared name), not `A.det()` on a scalar Symbol.
    expect(out.cellLines[1]).toContain(
      'A = sp.MatrixSymbol("A", sp.Symbol("n", integer=True, positive=True), sp.Symbol("n", integer=True, positive=True))',
    );
    expect(out.cellLines[1]).toContain('sp.Determinant(A)');
  });

  it('word-op calls on a same-cell matrix emit methods', () => {
    const out = compileWorksheet(
      cells(
        '\\displaylines{ B = \\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix} \\\\ \\mathrm{rank}(B) \\\\ \\mathrm{inverse}(B) \\\\ \\mathrm{transpose}(B) \\\\ \\mathrm{eigenvals}(B) }',
      ),
      'python',
      { importAll: false },
    );
    const lines = out.cellLines[0];
    expect(lines).toContain('(B).rank()');
    expect(lines).toContain('(B).inv()');
    expect(lines).toContain('(B).T');
    expect(lines).toContain('(B).eigenvals()');
  });

  it('a name rebound to a non-matrix loses its matrix methods', () => {
    const out = compileWorksheet(
      cells(
        '\\displaylines{ A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix} \\\\ A = 5 \\\\ \\det(A) }',
      ),
      'python',
      { importAll: false },
    );
    expect(out.cellLines[0]).toContain('A = 5');
    // `\det A` on the rebound scalar flags an error and drops the row
    // (Determinant(5) would TypeError in the worker).
    expect(out.cellLines[0].join('\n')).not.toContain('Determinant');
    expect(
      out.cellIssues[0].some(
        (i) => i.severity === 'error' && i.message.includes('needs a matrix'),
      ),
    ).toBe(true);
  });
});

describe('latexToStatementStrings', () => {
  it('splits \\displaylines rows at depth 0', () => {
    expect(latexToStatementStrings('\\displaylines{ a = 1 \\\\ b = a + 2 }')).toEqual([
      'a = 1',
      'b = a + 2',
    ]);
  });

  it('keeps \\\\ inside environments as matrix rows', () => {
    expect(
      latexToStatementStrings('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'),
    ).toEqual(['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}']);
  });

  it('returns [] for empty input', () => {
    expect(latexToStatementStrings('')).toEqual([]);
    expect(latexToStatementStrings('   ')).toEqual([]);
  });
});

describe('normalizeIR', () => {
  it('statement-level = with symbol LHS becomes Assign', () => {
    const { ir } = normalizeIR(parseCellLatex('a = x + 1'));
    expect(Array.isArray(ir) && ir[0]).toBe('Assign');
  });

  it('statement-level = with f(x) LHS stays an equation', () => {
    const { ir } = normalizeIR(parseCellLatex('f(x) = x^2'));
    expect(Array.isArray(ir) && ir[0]).toBe('Equal');
  });

  it('statement-level = with \\text{def} f(x) LHS becomes Def', () => {
    const { ir } = normalizeIR(parseCellLatex('\\text{def} f(x) = x^2'));
    expect(Array.isArray(ir) && ir[0]).toBe('Def');
  });

  it('a bare \\text{def} f(x) declares f as a function', () => {
    const { ir } = normalizeIR(parseCellLatex('\\text{def} f(x)'));
    expect(ir).toEqual(['Declare', 'f', ['List', 'x']]);
  });

  it('nested = stays Equal', () => {
    const { ir } = normalizeIR(parseCellLatex('\\mathrm{solve}(x^2 = 4, x)'));
    expect(JSON.stringify(ir)).toContain('"Equal"');
    expect(JSON.stringify(ir)).not.toContain('"Assign"');
  });

  it('multi-statement cells become Block and each statement disambiguates', () => {
    const { ir } = normalizeIR(parseCellLatex('\\displaylines{ a = 1 \\\\ b = a + 2 }'));
    expect(ir).toEqual([
      'Block',
      ['Assign', 'a', 1],
      ['Assign', 'b', ['Add', 'a', 2]],
    ]);
  });

  it('Subtract normalizes to Add of Negate', () => {
    const { ir } = normalizeIR(['Subtract', 'x', 'y']);
    expect(ir).toEqual(['Add', 'x', ['Negate', 'y']]);
  });

  it('unknown heads become call nodes with a note issue', () => {
    const { ir, issues, ok } = normalizeIR(parseCellLatex('\\operatorname{foo}(x)'));
    expect(ir).toEqual(['call', 'foo', 'x']);
    expect(ok).toBe(true);
    expect(issues.some((i) => i.message.includes('foo'))).toBe(true);
  });

  it('Nothing outside Limits is an error', () => {
    const { ok, issues } = normalizeIR(['Power', 'x', 'Nothing']);
    expect(ok).toBe(false);
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('Nothing inside Limits (indefinite integral) is not an error', () => {
    const { ok, issues } = normalizeIR(parseCellLatex('\\int x^2 dx'));
    expect(ok).toBe(true);
    expect(issues).toHaveLength(0);
  });
});

describe('SymPy codegen fixtures', () => {
  for (const fx of FIXTURES) {
    it(`compiles ${fx.latex}`, () => {
      const json = parseCellLatex(fx.latex);
      const norm = normalizeIR(json);
      if (fx.expectedIR !== undefined) expect(norm.ir).toEqual(fx.expectedIR);
      // Fixture output pins the qualified `import sympy as sp` mode;
      // the default unqualified mode is covered below.
      const out = compileWorksheet([{ json }], 'python', {
        importAll: false,
      });
      expect(out.cellLines[0]).toEqual([
        'import sympy as sp',
        ...fx.expectedPython,
      ]);
      for (const frag of fx.issues ?? [])
        expect(
          out.issues.some((i) => i.message.includes(frag)),
        ).toBe(true);
    });
  }
});

describe('error messages + resilient emission', () => {
  // Compile one cell; return its emitted lines + unprefixed issue strings.
  const compile = (latex: string) => {
    const out = compileWorksheet([{ json: parseCellLatex(latex) }], 'python', {
      importAll: false,
    });
    return {
      lines: out.cellLines[0],
      issues: out.cellIssues[0].map((i) => i.message).join('\n'),
      ok: out.ok,
    };
  };

  it('a block keyword without a trailing : flags rather than degrading to a symbol', () => {
    const { lines, issues } = compile('\\displaylines{\\text{if} x > 0}');
    expect(issues).toContain('\\text{if} needs a trailing : to start a block');
    expect(lines).toEqual([]);
  });

  it('\\text{break}/\\text{continue} outside a loop are errors', () => {
    for (const kw of ['break', 'continue']) {
      const { lines, issues } = compile(`\\displaylines{\\text{${kw}}}`);
      expect(issues).toContain('outside a loop');
      expect(lines).toEqual([]);
    }
  });

  it('\\text{return} outside a \\text{def} block is an error', () => {
    const { lines, issues } = compile('\\displaylines{\\text{return} x}');
    expect(issues).toContain('outside a function');
    expect(lines).toEqual([]);
  });

  it('a bare \\int hints at the missing integrand, not a cryptic code', () => {
    const { lines, issues, ok } = compile('\\int');
    expect(ok).toBe(false);
    expect(issues).toContain('integral sign with no integrand');
    expect(lines).toEqual([]);
  });

  it('\\int_{ }^{ } and \\int_{a}^{b} with no body report the same', () => {
    for (const latex of ['\\int_{ }^{ }', '\\int_{a}^{b}']) {
      const { issues } = compile(latex);
      expect(issues).toContain('integral sign with no integrand');
      // No `unexpected_command`/`LatexString` symbol garbage in the output.
      expect(issues).not.toContain('text literal');
      expect(issues).not.toContain('unknown head');
    }
  });

  it('a trailing operator is a stray operator, not unparseable input', () => {
    const { lines, issues } = compile('x +');
    expect(issues).toContain('stray operator "+"');
    // The broken statement is dropped; the symbol def stays (the cell
    // still runs and names what the user wrote).
    expect(lines).toEqual(['import sympy as sp', 'x = sp.Symbol("x")']);
  });

  it('an empty argument slot says so in plain words', () => {
    for (const latex of ['x =', '\\frac{1}']) {
      const { issues } = compile(latex);
      expect(issues).toContain('empty slot — fill it in or delete it');
    }
  });

  it('an unclosed \\begin names the missing \\end', () => {
    const { issues } = compile('\\begin{pmatrix} a &');
    expect(issues).toContain('unclosed \\begin{...}');
  });

  it('an unmatched paren is a stray delimiter', () => {
    const { issues } = compile('\\sin(');
    expect(issues).toContain('stray (');
  });

  it('\\int x^2 with no dx infers the single free symbol', () => {
    const { lines, issues, ok } = compile('\\int x^2');
    expect(ok).toBe(true);
    expect(lines).toEqual([
      'import sympy as sp',
      'x = sp.Symbol("x")',
      'sp.integrate(x**2, x) + sp.Symbol("C")',
    ]);
    expect(issues).toContain('no differential — integrating w.r.t. x');
  });

  it('constant of integration steps past capitals the cell already uses', () => {
    const { lines } = compile('\\int x\\,dx \\\\ \\int C\\,dx');
    expect(lines).toEqual([
      'import sympy as sp',
      "x, C = sp.symbols('x C')",
      'sp.integrate(x, x) + sp.Symbol("D")',
      'sp.integrate(C, x) + sp.Symbol("E")',
    ]);
  });

  it('\\int_{a}^{b} x with no dx infers the variable too', () => {
    const { lines, issues } = compile('\\int_{a}^{b} x');
    expect(lines).toEqual([
      'import sympy as sp',
      "x, a, b = sp.symbols('x a b')",
      'sp.integrate(x, (x, a, b))',
    ]);
    expect(issues).toContain('no differential — integrating w.r.t. x');
  });

  it('an ambiguous no-dx integral asks for a differential instead of emitting None', () => {
    const { issues, ok } = compile('\\int_{a}^{b} x y');
    expect(ok).toBe(false);
    expect(issues).toContain("can't infer the integration variable");
    expect(issues).toContain('dx');
  });

  it('a half-empty bound pair names the empty side', () => {
    expect(compile('\\int_{a}^{ } x\\,dx').issues).toContain(
      'upper bound is empty — fill it in or delete it',
    );
    expect(compile('\\int^{b} x\\,dx').issues).toContain(
      'lower bound is empty — fill it in or delete it',
    );
  });

  it('broken statements are skipped rather than emitted as sp.Error/None', () => {
    const { lines } = compile('x +');
    expect(lines.join('\n')).not.toContain('Error');
    expect(lines.join('\n')).not.toContain('None');
  });

  it('a \\sum or \\prod with missing bounds names the gap — SymPy has no boundless form', () => {
    expect(compile('\\sum i').issues).toContain(
      'sum needs an index and bounds — write \\sum_{i=1}^{n}',
    );
    expect(compile('\\prod k').issues).toContain(
      'product needs an index and bounds',
    );
    expect(compile('\\sum_{i=1}^{ }i').issues).toContain(
      'upper bound is empty — fill it in or delete it',
    );
    expect(compile('\\sum_{i= }^{n}i').issues).toContain(
      'lower bound is empty — fill it in or delete it',
    );
    // Previously these emitted Sum(i) / Sum(i, i) — every non-tuple
    // shape raises ValueError at eval time.
    expect(compile('\\sum i').lines.join('\n')).not.toContain('summation');
  });

  it('under-arity builtins say how many args they need', () => {
    for (const [latex, frag] of [
      ['\\gcd(10)', 'gcd needs at least 2 arguments'],
      ['\\mathrm{lcm}(4)', 'lcm needs at least 2 arguments'],
    ] as const) {
      expect(compile(latex).issues).toContain(frag);
    }
  });
});

describe('worksheet program', () => {
  it('cells are independent scripts; the program joins their bodies', () => {
    const cells = [
      { json: parseCellLatex('a = x + 1') },
      { json: parseCellLatex('a * y') },
      { json: parseCellLatex('b = 5') },
    ];
    const out = compileWorksheet(cells, 'python', { importAll: false });
    expect(out.program).toBe(
      [
        'import sympy as sp',
        '',
        '# cell 1',
        'x = sp.Symbol("x")',
        'a = x + 1',
        '',
        '# cell 2',
        "a, y = sp.symbols('a y')",
        'a * y',
        '',
        '# cell 3',
        'b = 5',
      ].join('\n'),
    );
    // Cells are independent: cell 2 defines `a` itself even though cell 1
    // assigned it. Per-cell output includes its own import line.
    expect(out.cellLines[1]).toEqual([
      'import sympy as sp',
      "a, y = sp.symbols('a y')",
      'a * y',
    ]);
  });

  it('a cell using a name defines it even when another cell assigns it', () => {
    const cells = [
      { json: parseCellLatex('a + 1') },
      { json: parseCellLatex('a = 2') },
    ];
    const out = compileWorksheet(cells, 'python', { importAll: false });
    expect(out.cellLines[0]).toEqual([
      'import sympy as sp',
      'a = sp.Symbol("a")',
      'a + 1',
    ]);
    expect(out.cellLines[1]).toEqual(['import sympy as sp', 'a = 2']);
  });

  it('non-identifier symbol names get sp.Symbol lines', () => {
    const out = compileWorksheet(
      [{ json: parseCellLatex('a_{n+1}') }],
      'python',
      { importAll: false },
    );
    expect(out.program).toContain(`# cell 1\na__n_1 = sp.Symbol("a_{n+1}")`);
  });

  it("function names (f'(x)) get sp.Function, not sp.Symbol", () => {
    const out = compileWorksheet([{ json: parseCellLatex("f'(x)") }], 'python', {
      importAll: false,
    });
    expect(out.program).toContain('f = sp.Function("f")');
    expect(out.program).not.toMatch(/sp\.Symbol\("f"\)/);
  });

  it('\\text{def} declares a function; f(3) is still f·3 in another cell', () => {
    const cells = [
      { json: parseCellLatex('\\text{def} f(x) = x^2') },
      { json: parseCellLatex('f(3)') },
    ];
    const out = compileWorksheet(cells, 'python', { importAll: false });
    expect(out.cellLines[0]).toEqual([
      'import sympy as sp',
      'def f(x):',
      '    return x**2',
    ]);
    // Each cell compiles on its own — f(3) is f·3 in the second cell.
    expect(out.cellLines[1]).toEqual([
      'import sympy as sp',
      'f = sp.Symbol("f")',
      'f * 3',
    ]);
  });

  it('a defined name applies: g(2) after \\text{def} is a call', () => {
    const out = compileWorksheet(
      [{ json: parseCellLatex('\\displaylines{\\text{def} g(x) = 5x \\\\ g(2)}') }],
      'python',
      { importAll: false },
    );
    expect(out.cellLines[0]).toEqual([
      'import sympy as sp',
      'def g(x):',
      '    return 5 * x',
      'g(2)',
    ]);
    // Without a def the same shape still multiplies.
    const out2 = compileWorksheet(
      [{ json: parseCellLatex('\\displaylines{g(x) = 5x \\\\ g(2)}') }],
      'python',
      { importAll: false },
    );
    expect(out2.cellLines[0]).toEqual([
      'import sympy as sp',
      'g, x = sp.symbols(\'g x\')',
      'sp.Eq(g * x, 5 * x)',
      'g * 2',
    ]);
  });

  it('the seed cell compiles to an equation', () => {
    const out = compileWorksheet(
      [{ json: parseCellLatex('2^n = \\sum_{i=0}^n\\binom{i}{n}') }],
      'python',
      { importAll: false },
    );
    expect(out.ok).toBe(true);
    expect(out.program).toContain('sp.Eq(2**n, sp.summation(sp.binomial(i, n), (i, 0, n)))');
  });
});

describe('from sympy import * (default)', () => {
  it('emits unqualified names and the import-* line', () => {
    const cells = [
      { json: parseCellLatex('a = x + 1') },
      { json: parseCellLatex('\\int_{0}^{1} x\\,dx') },
    ];
    const out = compileWorksheet(cells, 'python');
    expect(out.importLine).toBe('from sympy import *');
    // Each cell is standalone: cell 2 re-defines x even though cell 1
    // used it too.
    expect(out.cellLines[1]).toEqual([
      'from sympy import *',
      'x = Symbol("x")',
      'integrate(x, (x, 0, 1))',
    ]);
    expect(out.program).toBe(
      [
        'from sympy import *',
        '',
        '# cell 1',
        'x = Symbol("x")',
        'a = x + 1',
        '',
        '# cell 2',
        'x = Symbol("x")',
        'integrate(x, (x, 0, 1))',
      ].join('\n'),
    );
  });

  it('symbols/functions/relations all emit bare under import *', () => {
    const out = compileWorksheet(
      [{ json: parseCellLatex("x \\ge 0 \\land f'(x)") }],
      'python',
    );
    expect(out.program).not.toContain('sp.');
    expect(out.program).toContain('Ge(x, 0)');
    expect(out.program).toContain('f = Function("f")');
    expect(out.program).toContain('diff(f(x), x)');
  });

  it('importAll: false restores sp. qualifiers everywhere', () => {
    const out = compileWorksheet(
      [{ json: parseCellLatex('x \\ge 0') }],
      'python',
      { importAll: false },
    );
    expect(out.importLine).toBe('import sympy as sp');
    expect(out.program).toContain('sp.Ge(x, 0)');
    expect(out.program).toContain('x = sp.Symbol("x")');
  });
});

describe('target gating', () => {
  const exprCell = () => [{ json: parseCellLatex('x + 1') }];
  const stmtCell = () => [{ json: parseCellLatex('a = x + 1') }];

  for (const target of ['javascript', 'glsl', 'c']) {
    it(`${target}: statement-level heads produce an error diagnostic`, () => {
      const out = compileWorksheet(stmtCell(), target);
      expect(out.ok).toBe(false);
      expect(out.program).toBe('');
      expect(
        out.issues.some(
          (i) =>
            i.severity === 'error' &&
            i.message.includes('statement-level') &&
            i.message.includes(target),
        ),
      ).toBe(true);
    });

    it(`${target}: expressions-only worksheets report not-implemented`, () => {
      const out = compileWorksheet(exprCell(), target);
      expect(out.ok).toBe(false);
      expect(
        out.issues.some((i) => i.message.includes('not implemented')),
      ).toBe(true);
    });
  }

  it('Piecewise counts as statement-level for gating', () => {
    const out = compileWorksheet(
      [
        {
          json: parseCellLatex(
            '\\begin{cases} x & x > 0 \\\\ -x & x \\le 0 \\end{cases}',
          ),
        },
      ],
      'javascript',
    );
    expect(out.ok).toBe(false);
    expect(out.issues.some((i) => i.message.includes('Piecewise'))).toBe(true);
  });
});
