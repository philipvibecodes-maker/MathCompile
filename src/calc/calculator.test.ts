import { describe, expect, it } from 'vitest';
import nerdamer from 'nerdamer/all';
import { compileCellForCalc } from '../compile/codegen';
import { parseCellLatex } from '../compile/ir';
import { toNerdamerInput } from './nerdamer-latex';
import { interimEvaluate } from './calculator.svelte.ts';

const toN = (s: string) => toNerdamerInput(s, nerdamer);
const calc = (latex: string) => compileCellForCalc({ json: parseCellLatex(latex) });
// The calc pipeline wraps every evaluated expression — expectations
// spell the inner emitted expression; F() applies the worker's
// clean_and_simplify wrap.
const F = (e: string) => `clean_and_simplify(${e})`;

describe('compileCellForCalc (cell latex -> evaluable SymPy program)', () => {
  it('compiles an expression to a prelude + one eval statement', () => {
    const prog = calc('x+1');
    expect(prog.issues).toEqual([]);
    expect(prog.prelude).toEqual([
      'import sympy as sp',
      // The emitted program defines its own pipeline helper so the
      // shown code runs standalone.
      expect.stringContaining('def clean_and_simplify'),
      'x = sp.Symbol("x")',
    ]);
    expect(prog.statements).toEqual([{ code: F('x + 1'), display: undefined }]);
  });

  it('emits per-statement rows for multi-line cells', () => {
    const prog = calc('1+1\\\\ 2+3');
    expect(prog.statements).toEqual([
      { code: F('1 + 1'), display: undefined },
      { code: F('2 + 3'), display: undefined },
    ]);
  });

  it('gives an assignment a display equation', () => {
    const prog = calc('a = 5');
    // Assignments bind a python name — no Symbol def is emitted.
    expect(prog.prelude).toEqual([
      'import sympy as sp',
      expect.stringContaining('def clean_and_simplify'),
    ]);
    expect(prog.statements).toEqual([
      { code: 'a = 5', display: F('sp.Eq(sp.Symbol("a"), 5)') },
    ]);
  });

  it('gives a function def a lambda display expression', () => {
    const prog = calc('f(x) = x^2');
    expect(prog.statements).toEqual([
      {
        code: 'def f(x):\n    return x**2',
        display: F('(lambda x: sp.Eq(sp.Function("f")(x), x**2))(sp.Symbol("x"))'),
      },
    ]);
  });

  it('lowers integrals/sums to sympy calls like the python target', () => {
    const prog = calc('\\int_{0}^{1}x\\,dx');
    expect(prog.statements[0].code).toBe(F('sp.integrate(x, (x, 0, 1))'));
    expect(calc('\\sum_{i=0}^{n}\\binom{i}{n}').statements[0].code).toBe(
      F('sp.summation(sp.binomial(i, n), (i, 0, n))'),
    );
  });

  it('gives an indefinite integral a constant of integration', () => {
    expect(calc('\\int x\\,dx').statements[0].code).toBe(
      F('sp.integrate(x, x) + sp.Symbol("C")'),
    );
  });

  it('surfaces normalization errors instead of statements', () => {
    const prog = calc('x +');
    expect(prog.issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('returns no statements for empty input', () => {
    expect(calc('').statements).toEqual([]);
    expect(calc('').prelude).toEqual([]);
  });

  it('emits two-sided limits (dir +-), keeping variable and direction', () => {
    // sp.limit's default dir='+' would silently right-hand a bare \lim.
    expect(calc('\\lim_{x\\to0}\\frac{1}{x}').statements[0].code).toBe(
      F("sp.limit(1 / x, x, 0, dir='+-')"),
    );
    expect(calc('\\lim_{x\\to0^{+}}\\frac{1}{x}').statements[0].code).toBe(
      F("sp.limit(1 / x, x, 0, dir='+')"),
    );
    expect(calc('\\lim_{x\\to0^{-}}\\frac{1}{x}').statements[0].code).toBe(
      F("sp.limit(1 / x, x, 0, dir='-')"),
    );
  });

  it('lowers eval bars to .subs', () => {
    expect(calc('\\left.x^{2}\\right|_{x=3}').statements[0].code).toBe(
      F('(x**2).subs(x, 3)'),
    );
    expect(calc('\\left.x^{2}\\right|_{1}^{3}').statements[0].code).toBe(
      F('(x**2).subs(x, 3) - (x**2).subs(x, 1)'),
    );
  });

  it('calls unknown functions through a Function fallback, not sp.<name>', () => {
    // sp.f would AttributeError — f may not exist on sympy.
    expect(calc('f(3)').prelude).toContain('f = sp.Function("f")');
    expect(calc('f(3)').statements[0].code).toBe(F('f(3)'));
    expect(calc('\\operatorname{foo}(x)').prelude).toContain(
      'foo = sp.Function("foo")',
    );
    expect(calc('\\operatorname{foo}(x)').statements[0].code).toBe(F('foo(x)'));
  });

  it('maps \\sin^{-1} to asin and f^{-1} to an inverse-named function', () => {
    expect(calc('\\sin^{-1}(x)').statements[0].code).toBe(F('sp.asin(x)'));
    expect(calc('f^{-1}(x)').statements[0].code).toBe(
      F('sp.Function("f^{-1}")(x)'),
    );
  });

  it('declares set-membership assumptions on the symbol def', () => {
    const prog = calc('x\\in\\mathbb{R}');
    expect(prog.statements[0].code).toBe(F('sp.Contains(x, sp.S.Reals)'));
    expect(prog.prelude).toContain('x = sp.Symbol("x", real=True)');
    // \notin asserts non-membership — it must NOT add the assumption.
    const neg = calc('x\\notin\\mathbb{R}');
    expect(neg.statements[0].code).toBe(
      F('sp.Not(sp.Contains(x, sp.S.Reals))'),
    );
    expect(neg.prelude).toContain('x = sp.Symbol("x")');
    expect(calc('k\\in\\mathbb{N}').statements[0].code).toBe(
      F('sp.Contains(k, sp.S.Naturals0)'),
    );
  });

  it('lowers set literals, intervals, and congruences', () => {
    expect(calc('\\{1,2,3\\}').statements[0].code).toBe(
      F('sp.FiniteSet(1, 2, 3)'),
    );
    expect(calc('\\{x:x>0\\}').statements[0].code).toBe(
      F('sp.ConditionSet(x, sp.Gt(x, 0))'),
    );
    expect(calc('[1,2]\\cap[0,3)').statements[0].code).toBe(
      F('sp.Intersection(sp.Interval(1, 2), sp.Interval(0, 3, right_open=True))'),
    );
    expect(calc('x\\equiv1\\mod2').statements[0].code).toBe(
      F('sp.Eq(sp.Mod(x, 2), 1)'),
    );
    // An interval-membership asserts the member's domain in a
    // `with assuming(...)` wrapper — the set itself stays the display.
    const mem = calc('x\\in\\left[0,\\infty\\right)');
    expect(mem.statements[0].code).toContain('with sp.assuming');
    expect(mem.statements[0].display).toBe(
      F('sp.Contains(x, sp.Interval(0, sp.oo, right_open=True))'),
    );
  });

  it('reads a bare i as the imaginary unit, except bound operator vars', () => {
    expect(calc('e^{i\\pi}').statements[0].code).toBe(F('sp.E**(sp.I * sp.pi)'));
    expect(calc('i^{2}').statements[0].code).toBe(F('sp.I**2'));
    // The index is bound by the operator — it stays a plain symbol.
    expect(calc('\\sum_{i=0}^{n}i').statements[0].code).toBe(
      F('sp.summation(i, (i, 0, n))'),
    );
  });

  it('keeps int/int division exact as Rational', () => {
    expect(calc('\\frac{10^{6}}{3}').statements[0].code).toBe(
      F('sp.Rational(10**6, 3)'),
    );
    expect(calc('\\frac{x}{3}').statements[0].code).toBe(F('x / 3'));
  });

  it('strips \\limits so \\sum\\limits parses', () => {
    const prog = calc('\\sum\\limits_{i=1}^{n}i');
    expect(prog.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(prog.statements[0].code).toBe(F('sp.summation(i, (i, 1, n))'));
  });

  it('flags half-empty bounds on sums like integrals', () => {
    const prog = calc('\\sum_{i=0}^{ }i');
    expect(prog.statements).toEqual([
      { code: '', display: undefined, error: expect.any(String), line: expect.any(Number) },
    ]);
  });

  it('parses unbracketed/bmatrix environments and ignores marker args', () => {
    expect(calc('\\begin{matrix}a&b\\\\c&d\\end{matrix}').statements[0].code).toBe(
      F('sp.Matrix([[a, b], [c, d]])'),
    );
    expect(calc('\\begin{bmatrix}1\\\\0\\end{bmatrix}').statements[0].code).toBe(
      F('sp.Matrix([[1], [0]])'),
    );
  });

  it('drops \\, spacing and unwraps \\text{d} differentials', () => {
    expect(calc('x\\,y').statements[0].code).toBe(F('x * y'));
    expect(calc('\\int x^{2}\\text{d}x').statements[0].code).toBe(
      F('sp.integrate(x**2, x) + sp.Symbol("C")'),
    );
  });

  it('emits \\min_{x} f as sp.minimum over the variable', () => {
    expect(calc('\\min_{x}x^{2}').statements[0].code).toBe(
      F('sp.minimum(x**2, x)'),
    );
  });

  it('mangles the sp module alias out of the way', () => {
    // \text{sp} is a single symbol named 'sp' — it can't share the
    // `import sympy as sp` name.
    const prog = calc('\\text{sp}=5');
    expect(prog.statements[0].code).toBe(F('sp.Eq(sp_, 5)'));
    expect(prog.prelude).toContain('sp_ = sp.Symbol("sp")');
    // Bare `sp` is juxtaposed s·p — an equation, never a `def` of the
    // InvisibleOperator head.
    expect(calc('sp=5').statements[0].code).toBe(F('sp.Eq(s * p, 5)'));
  });

  it('mangles user names colliding with the mc_* pipeline helpers', () => {
    // A symbol named like a pipeline helper would shadow it in the eval
    // namespace — every wrapped expression then calls a Symbol instead.
    const prog = calc('\\text{mc_order}+1');
    expect(prog.prelude).toContain('mc_order_ = sp.Symbol("mc_order")');
    expect(prog.statements[0].code).toBe(F('mc_order_ + 1'));
    // Equations and call names take the same mangle.
    expect(calc('\\text{mc_simplify}=2').statements[0].code).toBe(
      F('sp.Eq(mc_simplify_, 2)'),
    );
    expect(calc('\\text{mc_doit}(x)=x^{2}').statements[0].code).toBe(
      F('sp.Eq(mc_doit_(x), x**2)'),
    );
    // The composed helper name is reserved too.
    expect(calc('\\text{clean_and_simplify}+1').statements[0].code).toBe(
      F('clean_and_simplify_ + 1'),
    );
  });

  it('lowers \\setminus, \\emptyset, and \\pmod congruences', () => {
    expect(calc('\\emptyset').statements[0].code).toBe(F('sp.EmptySet'));
    expect(calc('\\{1,2\\}\\setminus\\{2\\}').statements[0].code).toBe(
      F('sp.Complement(sp.FiniteSet(1, 2), sp.FiniteSet(2))'),
    );
    expect(calc('x\\equiv3\\pmod{7}').statements[0].code).toBe(
      F('sp.Eq(sp.Mod(x, 7), 3)'),
    );
  });

  it('distributes differentials across iterated integrals', () => {
    // CE nests ∫∫ and parks every 'd v' in the innermost body — the last
    // pair binds the outermost sign.
    expect(
      calc('\\int_{0}^{1}\\int_{0}^{x}y\\text{d}y\\text{d}x').statements[0].code,
    ).toBe(F('sp.integrate(sp.integrate(y, (y, 0, x)), (x, 0, 1))'));
  });

  it('folds multiple differentials on one sign into an iterated integral', () => {
    // \iint is a single Integrate node — the `d v` pairs all sit in its
    // body; leftmost is the innermost variable.
    expect(calc('\\iint xy\\text{d}x\\text{d}y').statements[0].code).toBe(
      F('sp.integrate(x * y, x, y) + sp.Symbol("C")'),
    );
    expect(
      calc('\\iiint x\\text{d}x\\text{d}y\\text{d}z').statements[0].code,
    ).toBe(F('sp.integrate(x, x, y, z) + sp.Symbol("C")'));
  });

  it('declares MatrixSymbol for \\det/\\tr on a bare name', () => {
    const det = calc('\\det A');
    expect(det.prelude).toContain(
      'A = sp.MatrixSymbol("A", sp.Symbol("n", integer=True, positive=True), sp.Symbol("n", integer=True, positive=True))',
    );
    expect(det.statements[0].code).toBe(F('sp.Determinant(A)'));
    expect(calc('\\operatorname{tr}(A)').statements[0].code).toBe(
      F('sp.Trace(A)'),
    );
  });

  it('lowers \\mapsto to sp.Lambda, not a raw python lambda', () => {
    expect(calc('x\\mapsto x^{2}').statements[0].code).toBe(
      F('sp.Lambda(x, x**2)'),
    );
  });

  it('binds the `f:` colon form so later references resolve', () => {
    // `f: x ↦ x²` emitted `sp.Lambda(x, x**2)` bare — `f` stayed an
    // unapplied Function and a following `f(2)` showed `f(2)`, not `4`.
    const prog = calc('f: x \\mapsto x^{2}');
    expect(prog.statements[0].code).toBe('def f(x):\n    return x**2');
    expect(prog.statements[0].display).toBe(
      F('(lambda x: sp.Eq(sp.Function("f")(x), x**2))(sp.Symbol("x"))'),
    );
    // Multi-param colon form `f: (x,y) ↦ x+y` lowers the same way.
    expect(calc('f: (x,y) \\mapsto x + y').statements[0].code).toBe(
      'def f(x, y):\n    return x + y',
    );
  });

  it('emits a ConditionSet for \\{x \\in S : cond\\}', () => {
    expect(
      calc('\\{x\\in\\mathbb{R}:x>0\\}').statements[0].code,
    ).toBe(F('sp.ConditionSet(x, sp.Gt(x, 0), sp.S.Reals)'));
  });

  it('lowers `expr \\text{ for } x \\in S` to sp.imageset', () => {
    expect(
      calc('2x \\text{ for } x \\in \\{1,2,3\\}').statements[0].code,
    ).toBe(F('sp.imageset(sp.Lambda(x, 2 * x), sp.FiniteSet(1, 2, 3))'));
    // `x for x \\in S` / `x for x>0` is just the domain itself.
    expect(calc('x \\text{ for } x \\in \\{1,2\\}').statements[0].code).toBe(
      F('sp.FiniteSet(1, 2)'),
    );
    expect(calc('x \\text{ for } x>0').statements[0].code).toBe(
      F('sp.Interval.open(0, sp.oo)'),
    );
    // Relational conditions become real domains so imageset evaluates.
    expect(calc('x+1 \\text{ for } x>0').statements[0].code).toBe(
      F('sp.imageset(sp.Lambda(x, x + 1), sp.Interval.open(0, sp.oo))'),
    );
    expect(calc('2x \\text{ for } x>0').statements[0].code).toBe(
      F('sp.imageset(sp.Lambda(x, 2 * x), sp.Interval.open(0, sp.oo))'),
    );
    expect(calc('x^{2} \\text{ for } 0<x').statements[0].code).toBe(
      F('sp.imageset(sp.Lambda(x, x**2), sp.Interval.open(0, sp.oo))'),
    );
    expect(calc('x+1 \\text{ for } x=2').statements[0].code).toBe(
      F('sp.imageset(sp.Lambda(x, x + 1), sp.FiniteSet(2))'),
    );
    // `\forall` is a different input — a predicate, not a set-builder:
    // `∀x∈S, p` → Implies(Contains(x, S), p), `∃x∈S, p` → And.
    expect(
      calc('\\forall x \\in \\mathbb{R}, x > x + 1').statements[0].code,
    ).toBe(F('sp.Implies(sp.Contains(x, sp.S.Reals), sp.Gt(x, x + 1))'));
    expect(
      calc('\\exists x \\in \\mathbb{R}, x^{2}=2').statements[0].code,
    ).toBe(F('sp.And(sp.Contains(x, sp.S.Reals), sp.Eq(x**2, 2))'));
    // Finite-set domains iterate so the answer evaluates at exec —
    // names bound to a Set literal (A = {1,2,4}) iterate the same way.
    expect(calc('\\forall x \\in \\{1,2\\}, x>0').statements[0].code).toBe(
      F('sp.And(*[(sp.Gt(x, 0)).subs(x, _e) for _e in sp.FiniteSet(1, 2)])'),
    );
  });

  it('singleton-wraps non-set operands so set ops compute', () => {
    // `x \cup y` emitted a flagged `Union(x, y)` Function stub — the
    // union of two bare names is the two-element set.
    expect(calc('x \\cup y').statements[0].code).toBe(
      F('sp.Union(sp.FiniteSet(x), sp.FiniteSet(y))'),
    );
    expect(calc('x \\cap y').statements[0].code).toBe(
      F('sp.Intersection(sp.FiniteSet(x), sp.FiniteSet(y))'),
    );
    expect(calc('x \\setminus y').statements[0].code).toBe(
      F('sp.Complement(sp.FiniteSet(x), sp.FiniteSet(y))'),
    );
    // Set-ish operands keep the direct emission.
    expect(calc('\\mathbb{R} \\cup \\mathbb{Z}').statements[0].code).toBe(
      F('sp.Union(sp.S.Reals, sp.S.Integers)'),
    );
  });

  it('lowers signed/starred leaf sets to real SymPy sets', () => {
    // `\mathbb{Z}^+` was a bare `PositiveIntegers` symbol; `S^±` on a
    // non-Real set hit a flagged stub, and `S^*` emitted
    // `conjugate(Integers)` — TypeError on a Set.
    expect(calc('\\mathbb{Z}^{+}').statements[0].code).toBe(F('sp.S.Naturals'));
    expect(calc('\\mathbb{Z}^{-}').statements[0].code).toBe(
      F('sp.Intersection(sp.S.Integers, sp.Interval.open(-sp.oo, 0))'),
    );
    expect(calc('\\mathbb{Z}^{*}').statements[0].code).toBe(
      F('sp.Complement(sp.S.Integers, sp.FiniteSet(0))'),
    );
    expect(calc('\\mathbb{R}^{+}').statements[0].code).toBe(
      F('sp.Interval.open(0, sp.oo)'),
    );
    expect(calc('\\mathbb{Q}^{-}').statements[0].code).toBe(
      F('sp.Intersection(sp.S.Rationals, sp.Interval.open(-sp.oo, 0))'),
    );
    expect(calc('x \\in \\mathbb{Z}^{+}').statements[0].code).toBe(
      F('sp.Contains(x, sp.S.Naturals)'),
    );
  });

  it('lowers \\operatorname{arsinh}-family calls to a-prefixed sympy', () => {
    // `arsinh(x)`/`Arsinh(x)` showed an unevaluated Function stub —
    // sympy spells them asinh/acosh/atanh.
    expect(calc('\\operatorname{arsinh}(x)').statements[0].code).toBe(
      F('sp.asinh(x)'),
    );
    expect(calc('\\operatorname{asinh}(x)').statements[0].code).toBe(
      F('sp.asinh(x)'),
    );
    expect(calc('\\operatorname{acosh}(x)').statements[0].code).toBe(
      F('sp.acosh(x)'),
    );
  });

  it('lowers \\Re/\\Im/\\arg/\\operatorname{erf} to real sympy names', () => {
    // These parse to Real/Imaginary/Argument/Erf — `sp.<Head>` doesn't
    // exist, so each row raised 'module sympy has no attribute'.
    expect(calc('\\Re(z)').statements[0].code).toBe(F('sp.re(z)'));
    expect(calc('\\Im(z)').statements[0].code).toBe(F('sp.im(z)'));
    expect(calc('\\arg(z)').statements[0].code).toBe(F('sp.arg(z)'));
    expect(calc('\\operatorname{erf}(x)').statements[0].code).toBe(
      F('sp.erf(x)'),
    );
  });

  it('lowers `x!!` to sp.factorial2 and `f \\circ g` to composition', () => {
    expect(calc('x!!').statements[0].code).toBe(F('sp.factorial2(x)'));
    const prog = calc('f\\circ g');
    expect(prog.statements[0].code).toBe(
      F('sp.Lambda(sp.Symbol("x"), f(g(sp.Symbol("x"))))'),
    );
    expect(prog.prelude).toContain('f = sp.Function("f")');
    expect(prog.prelude).toContain('g = sp.Function("g")');
  });

  it('folds \\text{d} quotients into D() instead of dividing by d', () => {
    // \frac{\text{d}}{\text{d}t}t^2 was emitted as `d / (d*t) * t**2`
    // — the `d` factors cancel and the result is `t`, not `2t`.
    expect(calc('\\frac{\\text{d}}{\\text{d}t}t^{2}').statements[0].code).toBe(
      F('sp.diff(t**2, t)'),
    );
    expect(calc('\\frac{\\text{d}f}{\\text{d}x}').statements[0].code).toBe(
      F('sp.diff(f(x), x)'),
    );
    expect(
      calc('\\frac{\\text{d}^{2}}{\\text{d}x^{2}}x^{3}').statements[0].code,
    ).toBe(F('sp.diff(x**3, x, 2)'));
  });

  it('lowers A^T to Transpose on a MatrixSymbol, not the crashing .T', () => {
    const prog = calc('A^{T}');
    expect(prog.prelude).toContain(
      'A = sp.MatrixSymbol("A", sp.Symbol("n", integer=True, positive=True), sp.Symbol("n", integer=True, positive=True))',
    );
    expect(prog.statements[0].code).toBe(F('sp.Transpose(A)'));
  });

  it('lowers \\varphi(n) to totient, not the uncallable GoldenRatio', () => {
    expect(calc('\\varphi(n)').statements[0].code).toBe(F('sp.totient(n)'));
  });

  it('collapses nested boundless integrals into one iterated call', () => {
    // \int\int\int nested three Integrate nodes — each appended its own
    // +C, integrating the inner constants into bogus terms.
    expect(
      calc('\\int\\int\\int xyz\\text{d}x\\text{d}y\\text{d}z').statements[0]
        .code,
    ).toBe(F('sp.integrate(x * y * z, x, y, z) + sp.Symbol("C")'));
  });

  it('gives \\mathbb{C} membership a complex=True assumption', () => {
    expect(calc('x\\in\\mathbb{C}').prelude).toContain(
      'x = sp.Symbol("x", complex=True)',
    );
  });

  it('flags a stray differential under \\prod at compile time', () => {
    const prog = calc('\\prod x^{2}\\text{d}x');
    expect(prog.statements).toEqual([
      { code: '', display: undefined, error: expect.any(String), line: expect.any(Number) },
    ]);
  });

  it('reads bare `^{(n)}` as a derivative only on a function base', () => {
    // A paren exponent means the nth derivative only when the base is a
    // function: `x^{(2)}`/`5^{(2)}` are ordinary powers. `f^{(3)}` after
    // a def still diffs; `f^{(3)}(x)` diffs because the call itself
    // makes f a function.
    expect(calc('x^{(2)}').statements[0].code).toBe(F('x**2'));
    expect(calc('5^{(2)}').statements[0].code).toBe(F('5**2'));
    expect(calc('(x+1)^{(2)}').statements[0].code).toBe(F('(x + 1)**2'));
    expect(calc('f^{(3)}').statements[0].code).toBe(F('f**3'));
    expect(calc('x^{(n)}').statements[0].code).toBe(F('x**n'));
    expect(calc('f^{(3)}(x)').statements[0].code).toBe(
      F('sp.diff(f(x), x, 3)'),
    );
    expect(calc('g: x \\mapsto x^{2} \\\\ g^{(2)}').statements[1].code).toBe(
      F('sp.diff(g(x), x, 2)'),
    );
  });

  it('routes \\partial_{v} subscript form through D() instead of gluing factors', () => {
    // `\partial_{x}x^{2}` parsed to `x**x * 2` — CE dropped the
    // operator and glued the subscript var onto the next factor.
    expect(calc('\\partial_{x}x^{2}').statements[0].code).toBe(
      F('sp.diff(x**2, x)'),
    );
    expect(calc('\\partial_{t}y').statements[0].code).toBe(
      F('sp.diff(y(t), t)'),
    );
  });

  it('singleton-wraps a bare name in \\in/\\notin like the set ops', () => {
    // `x \in S` echoed a `Element(x, S)` call stub; `x \in {S}` is the
    // honest reading and matches `x \cup y` -> `{x, y}`.
    expect(calc('x \\in S').statements[0].code).toBe(
      F('sp.Contains(x, sp.FiniteSet(S))'),
    );
    expect(calc('x \\notin S').statements[0].code).toBe(
      F('sp.Not(sp.Contains(x, sp.FiniteSet(S)))'),
    );
    expect(calc('x \\in \\mathbb{R}').statements[0].code).toBe(
      F('sp.Contains(x, sp.S.Reals)'),
    );
  });

  it('subset ops emit Union/Eq on set operands, error on abstract ones', () => {
    // Subset relations lower through Union/Eq — `.is_subset` returns
    // None on undecidable operands and `sp.Not(None)` raises
    // AttributeError in the worker. Non-set operands flag an error:
    // sympy has no set-typed symbol, and FiniteSet(A) would read as
    // the singleton (membership), not subset.
    expect(calc('A \\subseteq B').statements[0].error).toBe(
      'subset/superset needs concrete set operands — sympy has no set-typed symbols',
    );
    expect(calc('\\mathbb{Z} \\subseteq \\mathbb{R}').statements[0].code).toBe(
      F('sp.Eq(sp.Union(sp.S.Integers, sp.S.Reals), sp.S.Reals)'),
    );
    expect(calc('A \\not\\subseteq B').statements[0].error).toBe(
      'subset/superset needs concrete set operands — sympy has no set-typed symbols',
    );
  });

  it('names greek-variant symbols after their glyph, not the CE id', () => {
    // `\varepsilon` emitted `Symbol("epsilonSymbol")` — the row showed
    // the word "epsilonSymbol".
    expect(calc('\\varepsilon').prelude).toContain(
      'epsilonSymbol = sp.Symbol("\\\\varepsilon")',
    );
    expect(calc('\\varsigma').prelude).toContain(
      'finalSigma = sp.Symbol("\\\\varsigma")',
    );
    // `hbar` not `\hbar` — sympy prints the name `hbar` as `\hbar`,
    // but accent-splits a literal `\hbar` symbol name to `\bar{\h}`.
    expect(calc('\\hbar').prelude).toContain('hBar = sp.Symbol("hbar")');
  });

  it('flags a symbolic derivative order on a function base', () => {
    // `f^{(n)}` on a function has no sympy form (`diff(f, x, n)`
    // differentiates by n too — → 0, and `diff(f, (x, n))` hard-aborts
    // this pyodide's sympy). An honest error row is the only safe
    // answer. On a non-function base it is just a power (`x^{(n)}`).
    for (const l of ['f^{(n)}(x)', 'f^{(n)}(2)']) {
      const prog = calc(l);
      expect(prog.statements).toHaveLength(1);
      expect(prog.statements[0].error).toMatch(/derivative order/);
    }
    expect(
      calc('f: x \\mapsto x^{2} \\\\ f^{(n)}').statements[1].error,
    ).toMatch(/derivative order/);
  });

  it('chains comparisons pairwise — sympy relationals take two operands', () => {
    // `Lt(x,y,z)` is a TypeError in sympy; the honest form is And(pairs).
    expect(calc('x < y < z').statements[0].code).toBe(
      F('sp.And(sp.Lt(x, y), sp.Lt(y, z))'),
    );
    expect(calc('a < b < c < d').statements[0].code).toBe(
      F('sp.And(sp.Lt(a, b), sp.Lt(b, c), sp.Lt(c, d))'),
    );
    // Mixed chains normalize as relation-inside-relation — pairwise And.
    expect(calc('1 < x \\le 2').statements[0].code).toBe(
      F('sp.And(sp.Lt(1, x), sp.Le(x, 2))'),
    );
    expect(calc('x > y > z').statements[0].code).toBe(
      F('sp.And(sp.Gt(x, y), sp.Gt(y, z))'),
    );
    expect(calc('2 \\ge x > 0').statements[0].code).toBe(
      F('sp.And(sp.Ge(2, x), sp.Gt(x, 0))'),
    );
    expect(calc('x \\ne 0 \\ne 1').statements[0].code).toBe(
      F('sp.And(sp.Ne(x, 0), sp.Ne(0, 1))'),
    );
    expect(calc('x < y = z').statements[0].code).toBe(
      F('sp.And(sp.Lt(x, y), sp.Eq(y, z))'),
    );
  });

  it('fuses bare sgn into sign(next) inside products', () => {
    // `\operatorname{sgn}x` flattens to Multiply(Sign, x) — `Sign` is a
    // name, not signum, so `a sgn b` must emit a * sign(b), not a*S·b.
    expect(calc('\\operatorname{sgn}x').statements[0].code).toBe(F('sp.sign(x)'));
    expect(calc('a \\operatorname{sgn} b').statements[0].code).toBe(
      F('a * sp.sign(b)'),
    );
    expect(calc('x \\operatorname{sgn} y').statements[0].code).toBe(
      F('x * sp.sign(y)'),
    );
    expect(calc('2 \\operatorname{sgn}(x+1)').statements[0].code).toBe(
      F('2 * sp.sign(x + 1)'),
    );
    // \gcd/\lcm are binary infix — they take the factor on BOTH sides.
    expect(calc('a \\gcd b').statements[0].code).toBe(F('sp.gcd(a, b)'));
    expect(calc('a \\operatorname{lcm} b').statements[0].code).toBe(
      F('sp.lcm(a, b)'),
    );
    expect(calc('x \\gcd y \\cdot z').statements[0].code).toBe(
      F('sp.gcd(x, y) * z'),
    );
  });

  it('lowers mathbb{S}^±/^*/_0 variants to set operations', () => {
    // `x ∈ Z^-` emitted Contains(x, FiniteSet(Intersection(...))) —
    // membership of a singleton-holding-a-set, always False.
    expect(calc('x \\in \\mathbb{Z}^{-}').statements[0].code).toBe(
      F('sp.Contains(x, sp.Intersection(sp.S.Integers, sp.Interval.open(-sp.oo, 0)))'),
    );
    expect(calc('x \\in \\mathbb{Z}_{0}^{+}').statements[0].code).toBe(
      F('sp.Contains(x, sp.Intersection(sp.S.Integers, sp.Interval(0, sp.oo)))'),
    );
    expect(calc('x \\in \\mathbb{R}_{0}^{-}').statements[0].code).toBe(
      F('sp.Contains(x, sp.Intersection(sp.S.Reals, sp.Interval(-sp.oo, 0)))'),
    );
    expect(calc('x \\in \\mathbb{Z}^{*}').statements[0].code).toBe(
      F('sp.Contains(x, sp.Complement(sp.S.Integers, sp.FiniteSet(0)))'),
    );
    // `A^{+}` — Moore–Penrose pseudoinverse (a MatrixBase method in
    // sympy 1.14 — no sp.pinv, and MatrixSymbol has no pinv either, so
    // only a concrete matrix operand can exec; a bare `A^{+}` flags).
    const pinv = calc('A^{+}');
    expect(pinv.statements[0].error).toContain(
      "sympy doesn't support pinv for abstract matrices",
    );
  });

  it('emits .pinv() for concrete-matrix pseudoinverse operands', () => {
    // `A` bound to a pmatrix in the same cell → `(A).pinv()` execs.
    const out = calc(
      'A = \\begin{pmatrix}1&0\\\\0&1\\end{pmatrix} \\\\ A^{+}',
    );
    expect(out.statements.at(-1)!.code).toBe(F('(A).pinv()'));
    // A matrix literal operand likewise.
    expect(
      calc('\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}^{+}').statements[0]
        .code,
    ).toBe(F('(sp.Matrix([[1, 0], [0, 1]])).pinv()'));
  });

  it('shows matrix assignments unevaluated — Eq(Symbol, Matrix) is literal False', () => {
    // `A = [[1,0],[0,1]]` displayed `False` — Eq collapses against a
    // Matrix; evaluate=False keeps the row reading `A = …`.
    const m = calc('A = \\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}');
    expect(m.statements[0].display).toContain('evaluate=False');
    // A name assigned to another matrix (`B = A`) counts as matrix-valued.
    const b = calc(
      'A = \\begin{pmatrix}1&0\\\\0&1\\end{pmatrix} \\ \\\\ \\ B = A',
    );
    expect(b.statements[1].display).toContain('evaluate=False');
    // Scalar assigns keep the evaluated Eq display.
    expect(calc('a = 5').statements[0].display).not.toContain(
      'evaluate=False',
    );
  });

  it('peels a differential nested inside the integrand argument', () => {
    // `\int \sin\theta\text{d}\theta` — CE binds the dθ inside the
    // trig arg: Sin(θ·d·θ). The pair peels from the last argument.
    expect(calc('\\int \\sin\\theta\\text{d}\\theta').statements[0].code).toBe(
      F('sp.integrate(sp.sin(theta), theta) + sp.Symbol("C")'),
    );
    expect(calc('\\int \\ln u\\text{d}u').statements[0].code).toBe(
      F('sp.integrate(sp.log(u), u) + sp.Symbol("C")'),
    );
    // `x\sin x\,dx` — the pair is inside the Sin arg, itself a factor.
    expect(calc('\\int x\\sin x\\text{d}x').statements[0].code).toBe(
      F('sp.integrate(x * sp.sin(x), x) + sp.Symbol("C")'),
    );
    // `\sin^{2}x\,dx` — inside Sin's arg, inside Power's base.
    expect(calc('\\int \\sin^{2}x\\text{d}x').statements[0].code).toBe(
      F('sp.integrate(sp.sin(x)**2, x) + sp.Symbol("C")'),
    );
    expect(calc('\\int \\sec^{2}x\\text{d}x').statements[0].code).toBe(
      F('sp.integrate(sp.sec(x)**2, x) + sp.Symbol("C")'),
    );
    // `\int x³+x²+x+1 dx` — CE files the integral as an Add's first
    // term and spills the integrand into siblings; it folds back.
    expect(
      calc('\\int x^{3} + x^{2} + x + 1\\text{d}x').statements[0].code,
    ).toBe(F('sp.integrate(x**3 + x**2 + x + 1, x) + sp.Symbol("C")'));
    expect(calc('\\int 2x + \\sin x\\text{d}x').statements[0].code).toBe(
      F('sp.integrate(2 * x + sp.sin(x), x) + sp.Symbol("C")'),
    );
  });

  it('strips thin-space commands instead of emitting InvisibleOperator', () => {
    for (const l of ['\\int x\\,dx', '\\int x\\;dx', '\\int x\\!dx', '\\int x\\ dx'])
      expect(calc(l).statements[0].code).toBe(
        F('sp.integrate(x, x) + sp.Symbol("C")'),
      );
    // `\\ ` after a statement break stays a statement break.
    expect(calc('a = 2 \\\\ b = a + 1').statements).toHaveLength(2);
  });

  it('restores f(x) calls inside integrals for defined functions', () => {
    // CE flattens `f(x)` inside `\int` to `f·x` factors — a defined
    // `f` must fold back into a call or `∫f(x)dx` integrates `f·x`.
    expect(
      calc('\\displaylines{f: x \\mapsto x^{2} \\\\ \\int f(x)\\text{d}x}')
        .statements[1].code,
    ).toBe(F('sp.integrate(f(x), x) + sp.Symbol("C")'));
    expect(
      calc('\\displaylines{f(x) = x^{2} \\\\ \\int f(x)\\text{d}x}')
        .statements[1].code,
    ).toBe(F('sp.integrate(f(x), x) + sp.Symbol("C")'));
    // A scalar binding is not a call — `a x` stays `a*x`.
    expect(
      calc('\\displaylines{a = 5 \\\\ \\int a x\\text{d}x}').statements[1].code,
    ).toBe(F('sp.integrate(a * x, x) + sp.Symbol("C")'));
    // An undefined `f` reads as `f·x` (Desmos convention).
    expect(calc('\\int f(x)\\text{d}x').statements[0].code).toBe(
      F('sp.integrate(f * x, x) + sp.Symbol("C")'),
    );
  });

  it('keeps plain \\ rows in written order; \\text{where} still flips', () => {
    // `x>0 \\ x+1` is two written statements — the where-block reorder
    // must not flip it to [x+1, x>0].
    expect(calc('x>0\\\\ x+1').statements.map((s) => s.code)).toEqual([
      F('sp.Gt(x, 0)'),
      F('x + 1'),
    ]);
    // `x^2 \text{ where } x>0` is one statement CE splits — body first.
    expect(
      calc('x^{2}\\ \\text{where}\\ x>0').statements.map((s) => s.code),
    ).toEqual([F('x**2'), F('sp.Gt(x, 0)')]);
  });

  it('binds lambda params as symbols, not constants (i \\mapsto i^2)', () => {
    // `i \mapsto i^2` emitted Lambda(sp.I, sp.I**2) — Lambda can't take
    // the imaginary constant as its bound variable.
    const prog = calc('i \\mapsto i^{2}');
    expect(prog.statements[0].code).toBe(F('sp.Lambda(i, i**2)'));
    expect(prog.prelude).toContain('i = sp.Symbol("i")');
  });

  it('takes an assigned set name as a set operand, not FiniteSet(A)', () => {
    // `A = {1,2}` then `A \cup {3}` emitted Union(FiniteSet(A), {3}) —
    // a nested singleton { {1,2}, 3 } instead of {1,2,3}.
    expect(
      calc('\\displaylines{A=\\left\\{1,2\\right\\}\\\\ A\\cup\\left\\{3\\right\\}}')
        .statements[1].code,
    ).toBe(F('sp.Union(A, sp.FiniteSet(3))'));
    // Scalar assigns still wrap — `A = 5` then `A ∪ {3}` is {5,3}.
    expect(
      calc('\\displaylines{A=5\\\\ A\\cup\\left\\{3\\right\\}}')
        .statements[1].code,
    ).toBe(F('sp.Union(sp.FiniteSet(A), sp.FiniteSet(3))'));
    // The assign row needs evaluate=False — Eq(Symbol, FiniteSet)
    // collapses to literal False like Eq(Symbol, Matrix) did.
    expect(
      calc('A=\\left\\{1,2\\right\\}').statements[0].display,
    ).toContain('evaluate=False');
  });

  it('emits negative-integer powers as sp.Pow so Rational stays exact', () => {
    // `Rational(3**-1, 2)` fed sympy a float 0.333… — a giant binary
    // fraction instead of 1/6.
    expect(calc('\\frac{3^{-1}}{2}').statements[0].code).toBe(
      F('sp.Rational(sp.Pow(3, -1), 2)'),
    );
    expect(calc('2^{-1}').statements[0].code).toBe(F('sp.Pow(2, -1)'));
  });

  it('reports an unparseable statement via the issue list, not a row', () => {
    // `emit` flags a dropped Error node with a "statement skipped"
    // placeholder — redundant with the normalizer's real diagnostic,
    // which rides the issue list (the python overlay also never shows
    // the placeholder as text, only as a ! icon).
    const prog = calc(
      '\\displaylines{\\foo\\left(1\\right)\\\\ x+1}',
    );
    expect(prog.statements).toEqual([
      { code: F('x + 1'), display: undefined, error: undefined },
    ]);
    expect(prog.issues).toEqual([
      {
        severity: 'error',
        message: 'incomplete or unsupported command "\\foo"',
        line: 0,
      },
    ]);
  });
});

describe('toNerdamerInput (latex → nerdamer calls)', () => {
  it('passes plain algebra through convertFromLaTeX', () => {
    expect(toN('x+1')).toBe('1+x');
  });

  it('maps a definite integral to defint', () => {
    expect(toN('\\int_{0}^{1}x')).toBe('defint(x, 0, 1, x)');
    expect(toN('\\int_{0}^{1}x dx')).toBe('defint(x, 0, 1, x)');
  });

  it('maps an indefinite integral to integrate + constant', () => {
    expect(toN('\\int x')).toBe('(integrate(x, x)+C)');
    expect(toN('\\int C dx')).toBe('(integrate(C, x)+D)');
  });

  it('maps \\sum_{i=lo}^{hi} to sum', () => {
    expect(toN('\\sum_{i=0}^{n}k')).toBe('sum(k, i, 0, n)');
  });

  it('maps \\prod_{i=lo}^{hi} to product', () => {
    expect(toN('\\prod_{i=1}^{n}k')).toBe('product(k, i, 1, n)');
  });

  it('maps \\lim_{x\\to a} to limit', () => {
    expect(toN('\\lim_{x\\to 0}y')).toBe('limit(y, x, 0)');
  });

  it('maps the MathQuill \\derivative form to diff', () => {
    expect(toN('\\frac{d }{d x}x^2')).toBe('diff(x^2, x)');
    expect(toN('\\frac{d^2}{d x^2}x^3')).toBe('diff(x^3, x, 2)');
  });

  it('expands \\binom into factorials', () => {
    expect(toN('\\binom{n}{k}')).toBe(
      'factorial(n)/(factorial(k)*factorial(n-k))',
    );
  });

  it('maps \\sqrt[n]{x} to nthroot', () => {
    expect(toN('\\sqrt[3]{8}')).toBe('nthroot(8, 3)');
  });

  it("keeps an equation's lhs before a translated command", () => {
    expect(toN('2^{n}=\\sum_{i=0}^{n}\\binom{i}{n}')).toBe(
      '2^n=sum(factorial(i)/(factorial(n)*factorial(i-n)), i, 0, n)',
    );
  });
  it('reads a bare prime as a primed variable name', () => {
    const p = calc("x'");
    expect(p.statements[0]?.code).toBe(F('x_prime'));
    expect(p.prelude).toContain("x_prime = sp.Symbol(\"x'\")");
  });

  it('applies nested calls, not a literal call(f, x)', () => {
    const p = calc('g(f(x))');
    expect(p.statements[0]?.code).toBe(F('g(f(x))'));
    expect(p.prelude).toContain('f = sp.Function("f")');
    expect(p.prelude).toContain('g = sp.Function("g")');
  });

  it('keeps a comma subscript in the symbol name', () => {
    const p = calc('P_{5,2}');
    expect(p.prelude.join()).toContain('Symbol("P_{5,2}")');
    expect(p.statements[0]?.code).not.toBe('P');
  });

  it('reads z^{*} as adjoint/conjugate', () => {
    const p = calc('z^{*}');
    expect(p.statements[0]?.code).toContain('conjugate');
  });

  it('keeps i a symbol inside a Kronecker delta', () => {
    const p = calc('\\delta_{ij}');
    expect(p.statements[0]?.code).toContain('KroneckerDelta(i, j)');
    expect(p.statements[0]?.code).not.toContain('sp.I');
  });
  it("evaluates f'(0) at 0 instead of differentiating a constant", () => {
    const p = calc("f'(0)");
    expect(p.statements[0]?.code).toContain('.subs(x, 0)');
    expect(p.statements[0]?.code).not.toContain('diff(f(0), 0)');
  });

  it('treats the typed `f\\prime` form identically to `f\'`', () => {
    // `f\prime(2)` (typed \prime) and `f^{\prime}(2)` parse to the same
    // Apply(Derivative(f, 1), 2) as `f'(2)` — the derivative evaluated
    // at the point, not diff(f(2), 2).
    for (const l of ['f\\prime(2)', 'f^{\\prime}(2)']) {
      const p = calc(l);
      expect(p.statements[0]?.code).toContain('diff(f(x), x)');
      expect(p.statements[0]?.code).toContain('.subs(x, 2)');
    }
    expect(calc('f\\prime\\prime(2)').statements[0]?.code).toBe(
      F('sp.diff(f(x), x, 2).subs(x, 2)'),
    );
  });

  it("keeps f'(x) as the derivative in x", () => {
    const p = calc("f'(x)");
    expect(p.statements[0]?.code).toContain('diff(f(x), x)');
  });
});

describe('interimEvaluate (nerdamer fallback while SymPy boots)', () => {
  it('evaluates arithmetic to its latex form', async () => {
    expect(await interimEvaluate('2+2')).toEqual([{ ok: true, latex: '4' }]);
  });

  it('renders a symbolic expression as tex', async () => {
    const rows = await interimEvaluate('x+\\sqrt{2}');
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(true);
    expect((rows[0] as { latex?: string }).latex).toContain('\\sqrt{2}');
  });

  it('evaluates a definite integral via nerdamer defint', async () => {
    const rows = await interimEvaluate('\\int_{0}^{1}x');
    expect(rows[0].ok).toBe(true);
    expect((rows[0] as { latex?: string }).latex).toBe('\\frac{1}{2}');
  });

  it('shows + C on an indefinite integral interim too', async () => {
    const rows = await interimEvaluate('\\int x dx');
    expect(rows[0].ok).toBe(true);
    const latex = (rows[0] as { latex?: string }).latex ?? '';
    expect(latex).toContain('x^{2}');
    expect(latex).toContain('C');
  });

  it('evaluates a derivative via nerdamer diff', async () => {
    const rows = await interimEvaluate('\\frac{d }{d x}x^2');
    expect(rows[0].ok).toBe(true);
    expect((rows[0] as { latex?: string }).latex).toBe('2 \\cdot x');
  });

  it('keeps the one-row-per-statement shape of the real engine', async () => {
    const rows = await interimEvaluate('1+1\\\\ 2+3');
    expect(rows).toEqual([
      { ok: true, latex: '2' },
      { ok: true, latex: '5' },
    ]);
  });

  it('shows no interim result for half-empty operator bounds', async () => {
    // A definite-integral lower bound alone is an error on the real
    // engine — the interim must not guess an indefinite one either.
    expect(await interimEvaluate('\\int_{0}^{ }x')).toEqual([]);
    expect(await interimEvaluate('\\sum_{i=0}^{ }i')).toEqual([]);
  });

  it('does not let one bad row sink the others', async () => {
    // A matrix row can't be nerdamer-evaluated — the plain rows around
    // it must still get interim results.
    const rows = await interimEvaluate('1+1\\\\ x+1');
    expect(rows).toEqual([
      { ok: true, latex: '2' },
      { ok: true, latex: 'x+1' },
    ]);
  });

  it('splits multi-statement cells through environment-aware rows', async () => {
    // A naive split on \\\\ breaks matrix rows into bogus statements.
    const rows = await interimEvaluate('2+2\\\\ 3+3');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.ok)).toBe(true);
  });

  it('returns [] for empty input', async () => {
    expect(await interimEvaluate('')).toEqual([]);
  });
});

