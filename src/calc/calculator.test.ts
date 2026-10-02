import { describe, expect, it } from 'vitest';
import nerdamer from 'nerdamer/all';
import { compileCellForCalc } from '../compile/codegen';
import { parseCellLatex } from '../compile/ir';
import { toNerdamerInput } from './nerdamer-latex';
import { interimEvaluate } from './calculator.svelte.ts';

const toN = (s: string) => toNerdamerInput(s, nerdamer);
const calc = (latex: string) => compileCellForCalc({ json: parseCellLatex(latex) });

describe('compileCellForCalc (cell latex -> evaluable SymPy program)', () => {
  it('compiles an expression to a prelude + one eval statement', () => {
    const prog = calc('x+1');
    expect(prog.issues).toEqual([]);
    expect(prog.prelude).toEqual([
      'import sympy as sp',
      'x = sp.Symbol("x")',
    ]);
    expect(prog.statements).toEqual([{ code: 'x + 1', display: undefined }]);
  });

  it('emits per-statement rows for multi-line cells', () => {
    const prog = calc('1+1\\\\ 2+3');
    expect(prog.statements).toEqual([
      { code: '1 + 1', display: undefined },
      { code: '2 + 3', display: undefined },
    ]);
  });

  it('gives an assignment a display equation', () => {
    const prog = calc('a = 5');
    // Assignments bind a python name — no Symbol def is emitted.
    expect(prog.prelude).toEqual(['import sympy as sp']);
    expect(prog.statements).toEqual([
      { code: 'a = 5', display: 'sp.Eq(sp.Symbol("a"), 5)' },
    ]);
  });

  it('gives a function def a lambda display expression', () => {
    const prog = calc('f(x) = x^2');
    expect(prog.statements).toEqual([
      {
        code: 'def f(x):\n    return x**2',
        display:
          '(lambda x: sp.Eq(sp.Function("f")(x), x**2))(sp.Symbol("x"))',
      },
    ]);
  });

  it('lowers integrals/sums to sympy calls like the python target', () => {
    const prog = calc('\\int_{0}^{1}x\\,dx');
    expect(prog.statements[0].code).toBe('sp.integrate(x, (x, 0, 1))');
    expect(calc('\\sum_{i=0}^{n}\\binom{i}{n}').statements[0].code).toBe(
      'sp.summation(sp.binomial(i, n), (i, 0, n))',
    );
  });

  it('gives an indefinite integral a constant of integration', () => {
    expect(calc('\\int x\\,dx').statements[0].code).toBe(
      'sp.integrate(x, x) + sp.Symbol("C")',
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
      "sp.limit(1 / x, x, 0, dir='+-')",
    );
    expect(calc('\\lim_{x\\to0^{+}}\\frac{1}{x}').statements[0].code).toBe(
      "sp.limit(1 / x, x, 0, dir='+')",
    );
    expect(calc('\\lim_{x\\to0^{-}}\\frac{1}{x}').statements[0].code).toBe(
      "sp.limit(1 / x, x, 0, dir='-')",
    );
  });

  it('lowers eval bars to .subs', () => {
    expect(calc('\\left.x^{2}\\right|_{x=3}').statements[0].code).toBe(
      '(x**2).subs(x, 3)',
    );
    expect(calc('\\left.x^{2}\\right|_{1}^{3}').statements[0].code).toBe(
      '(x**2).subs(x, 3) - (x**2).subs(x, 1)',
    );
  });

  it('calls unknown functions through a Function fallback, not sp.<name>', () => {
    // sp.f would AttributeError — f may not exist on sympy.
    expect(calc('f(3)').prelude).toContain('f = sp.Function("f")');
    expect(calc('f(3)').statements[0].code).toBe('f(3)');
    expect(calc('\\operatorname{foo}(x)').prelude).toContain(
      'foo = sp.Function("foo")',
    );
    expect(calc('\\operatorname{foo}(x)').statements[0].code).toBe('foo(x)');
  });

  it('maps \\sin^{-1} to asin and f^{-1} to an inverse-named function', () => {
    expect(calc('\\sin^{-1}(x)').statements[0].code).toBe('sp.asin(x)');
    expect(calc('f^{-1}(x)').statements[0].code).toBe(
      'sp.Function("f^{-1}")(x)',
    );
  });

  it('declares set-membership assumptions on the symbol def', () => {
    const prog = calc('x\\in\\mathbb{R}');
    expect(prog.statements[0].code).toBe('sp.Contains(x, sp.S.Reals)');
    expect(prog.prelude).toContain('x = sp.Symbol("x", real=True)');
    // \notin asserts non-membership — it must NOT add the assumption.
    const neg = calc('x\\notin\\mathbb{R}');
    expect(neg.statements[0].code).toBe(
      'sp.Not(sp.Contains(x, sp.S.Reals))',
    );
    expect(neg.prelude).toContain('x = sp.Symbol("x")');
    expect(calc('k\\in\\mathbb{N}').statements[0].code).toBe(
      'sp.Contains(k, sp.S.Naturals0)',
    );
  });

  it('lowers set literals, intervals, and congruences', () => {
    expect(calc('\\{1,2,3\\}').statements[0].code).toBe(
      'sp.FiniteSet(1, 2, 3)',
    );
    expect(calc('\\{x:x>0\\}').statements[0].code).toBe(
      'sp.ConditionSet(x, sp.Gt(x, 0))',
    );
    expect(calc('[1,2]\\cap[0,3)').statements[0].code).toBe(
      'sp.Intersection(sp.Interval(1, 2), sp.Interval(0, 3, right_open=True))',
    );
    expect(calc('x\\equiv1\\mod2').statements[0].code).toBe(
      'sp.Eq(sp.Mod(x, 2), 1)',
    );
    // An interval-membership asserts the member's domain in a
    // `with assuming(...)` wrapper — the set itself stays the display.
    const mem = calc('x\\in\\left[0,\\infty\\right)');
    expect(mem.statements[0].code).toContain('with sp.assuming');
    expect(mem.statements[0].display).toBe(
      'sp.Contains(x, sp.Interval(0, sp.oo, right_open=True))',
    );
  });

  it('reads a bare i as the imaginary unit, except bound operator vars', () => {
    expect(calc('e^{i\\pi}').statements[0].code).toBe('sp.E**(sp.I * sp.pi)');
    expect(calc('i^{2}').statements[0].code).toBe('sp.I**2');
    // The index is bound by the operator — it stays a plain symbol.
    expect(calc('\\sum_{i=0}^{n}i').statements[0].code).toBe(
      'sp.summation(i, (i, 0, n))',
    );
  });

  it('keeps int/int division exact as Rational', () => {
    expect(calc('\\frac{10^{6}}{3}').statements[0].code).toBe(
      'sp.Rational(10**6, 3)',
    );
    expect(calc('\\frac{x}{3}').statements[0].code).toBe('x / 3');
  });

  it('strips \\limits so \\sum\\limits parses', () => {
    const prog = calc('\\sum\\limits_{i=1}^{n}i');
    expect(prog.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(prog.statements[0].code).toBe('sp.summation(i, (i, 1, n))');
  });

  it('flags half-empty bounds on sums like integrals', () => {
    const prog = calc('\\sum_{i=0}^{ }i');
    expect(prog.issues.some((i) => i.severity === 'error')).toBe(true);
    expect(prog.statements).toEqual([]);
  });

  it('parses unbracketed/bmatrix environments and ignores marker args', () => {
    expect(calc('\\begin{matrix}a&b\\\\c&d\\end{matrix}').statements[0].code).toBe(
      'sp.Matrix([[a, b], [c, d]])',
    );
    expect(calc('\\begin{bmatrix}1\\\\0\\end{bmatrix}').statements[0].code).toBe(
      'sp.Matrix([[1], [0]])',
    );
  });

  it('drops \\, spacing and unwraps \\text{d} differentials', () => {
    expect(calc('x\\,y').statements[0].code).toBe('x * y');
    expect(calc('\\int x^{2}\\text{d}x').statements[0].code).toBe(
      'sp.integrate(x**2, x) + sp.Symbol("C")',
    );
  });

  it('emits \\min_{x} f as sp.minimum over the variable', () => {
    expect(calc('\\min_{x}x^{2}').statements[0].code).toBe(
      'sp.minimum(x**2, x)',
    );
  });

  it('mangles the sp module alias out of the way', () => {
    // \text{sp} is a single symbol named 'sp' — it can't share the
    // `import sympy as sp` name.
    const prog = calc('\\text{sp}=5');
    expect(prog.statements[0].code).toBe('sp.Eq(sp_, 5)');
    expect(prog.prelude).toContain('sp_ = sp.Symbol("sp")');
    // Bare `sp` is juxtaposed s·p — an equation, never a `def` of the
    // InvisibleOperator head.
    expect(calc('sp=5').statements[0].code).toBe('sp.Eq(s * p, 5)');
  });

  it('lowers \\setminus, \\emptyset, and \\pmod congruences', () => {
    expect(calc('\\emptyset').statements[0].code).toBe('sp.EmptySet');
    expect(calc('\\{1,2\\}\\setminus\\{2\\}').statements[0].code).toBe(
      'sp.Complement(sp.FiniteSet(1, 2), sp.FiniteSet(2))',
    );
    expect(calc('x\\equiv3\\pmod{7}').statements[0].code).toBe(
      'sp.Eq(sp.Mod(x, 7), 3)',
    );
  });

  it('distributes differentials across iterated integrals', () => {
    // CE nests ∫∫ and parks every 'd v' in the innermost body — the last
    // pair binds the outermost sign.
    expect(
      calc('\\int_{0}^{1}\\int_{0}^{x}y\\text{d}y\\text{d}x').statements[0].code,
    ).toBe('sp.integrate(sp.integrate(y, (y, 0, x)), (x, 0, 1))');
  });

  it('folds multiple differentials on one sign into an iterated integral', () => {
    // \iint is a single Integrate node — the `d v` pairs all sit in its
    // body; leftmost is the innermost variable.
    expect(calc('\\iint xy\\text{d}x\\text{d}y').statements[0].code).toBe(
      'sp.integrate(x * y, x, y) + sp.Symbol("C")',
    );
    expect(
      calc('\\iiint x\\text{d}x\\text{d}y\\text{d}z').statements[0].code,
    ).toBe('sp.integrate(x, x, y, z) + sp.Symbol("C")');
  });

  it('declares MatrixSymbol for \\det/\\tr on a bare name', () => {
    const det = calc('\\det A');
    expect(det.prelude).toContain(
      'A = sp.MatrixSymbol("A", sp.Symbol("n", integer=True, positive=True), sp.Symbol("n", integer=True, positive=True))',
    );
    expect(det.statements[0].code).toBe('sp.Determinant(A)');
    expect(calc('\\operatorname{tr}(A)').statements[0].code).toBe(
      'sp.Trace(A)',
    );
  });

  it('lowers \\mapsto to sp.Lambda, not a raw python lambda', () => {
    expect(calc('x\\mapsto x^{2}').statements[0].code).toBe(
      'sp.Lambda(x, x**2)',
    );
  });

  it('binds the `f:` colon form so later references resolve', () => {
    // `f: x ↦ x²` emitted `sp.Lambda(x, x**2)` bare — `f` stayed an
    // unapplied Function and a following `f(2)` showed `f(2)`, not `4`.
    const prog = calc('f: x \\mapsto x^{2}');
    expect(prog.statements[0].code).toBe('f = sp.Lambda(x, x**2)');
    expect(prog.statements[0].display).toBe(
      'sp.Eq(sp.Symbol("f"), sp.Lambda(x, x**2))',
    );
    // Multi-param colon form `f: (x,y) ↦ x+y` lowers the same way.
    expect(calc('f: (x,y) \\mapsto x + y').statements[0].code).toBe(
      'f = sp.Lambda((x, y), x + y)',
    );
  });

  it('emits a ConditionSet for \\{x \\in S : cond\\}', () => {
    expect(
      calc('\\{x\\in\\mathbb{R}:x>0\\}').statements[0].code,
    ).toBe('sp.ConditionSet(x, sp.Gt(x, 0), sp.S.Reals)');
  });

  it('singleton-wraps non-set operands so set ops compute', () => {
    // `x \cup y` emitted a flagged `Union(x, y)` Function stub — the
    // union of two bare names is the two-element set.
    expect(calc('x \\cup y').statements[0].code).toBe(
      'sp.Union(sp.FiniteSet(x), sp.FiniteSet(y))',
    );
    expect(calc('x \\cap y').statements[0].code).toBe(
      'sp.Intersection(sp.FiniteSet(x), sp.FiniteSet(y))',
    );
    expect(calc('x \\setminus y').statements[0].code).toBe(
      'sp.Complement(sp.FiniteSet(x), sp.FiniteSet(y))',
    );
    // Set-ish operands keep the direct emission.
    expect(calc('\\mathbb{R} \\cup \\mathbb{Z}').statements[0].code).toBe(
      'sp.Union(sp.S.Reals, sp.S.Integers)',
    );
  });

  it('lowers signed/starred leaf sets to real SymPy sets', () => {
    // `\mathbb{Z}^+` was a bare `PositiveIntegers` symbol; `S^±` on a
    // non-Real set hit a flagged stub, and `S^*` emitted
    // `conjugate(Integers)` — TypeError on a Set.
    expect(calc('\\mathbb{Z}^{+}').statements[0].code).toBe('sp.S.Naturals');
    expect(calc('\\mathbb{Z}^{-}').statements[0].code).toBe(
      'sp.Intersection(sp.S.Integers, sp.Interval.open(-sp.oo, 0))',
    );
    expect(calc('\\mathbb{Z}^{*}').statements[0].code).toBe(
      'sp.Complement(sp.S.Integers, sp.FiniteSet(0))',
    );
    expect(calc('\\mathbb{R}^{+}').statements[0].code).toBe(
      'sp.Interval.open(0, sp.oo)',
    );
    expect(calc('\\mathbb{Q}^{-}').statements[0].code).toBe(
      'sp.Intersection(sp.S.Rationals, sp.Interval.open(-sp.oo, 0))',
    );
    expect(calc('x \\in \\mathbb{Z}^{+}').statements[0].code).toBe(
      'sp.Contains(x, sp.S.Naturals)',
    );
  });

  it('lowers \\operatorname{arsinh}-family calls to a-prefixed sympy', () => {
    // `arsinh(x)`/`Arsinh(x)` showed an unevaluated Function stub —
    // sympy spells them asinh/acosh/atanh.
    expect(calc('\\operatorname{arsinh}(x)').statements[0].code).toBe(
      'sp.asinh(x)',
    );
    expect(calc('\\operatorname{asinh}(x)').statements[0].code).toBe(
      'sp.asinh(x)',
    );
    expect(calc('\\operatorname{acosh}(x)').statements[0].code).toBe(
      'sp.acosh(x)',
    );
  });

  it('lowers \\Re/\\Im/\\arg/\\operatorname{erf} to real sympy names', () => {
    // These parse to Real/Imaginary/Argument/Erf — `sp.<Head>` doesn't
    // exist, so each row raised 'module sympy has no attribute'.
    expect(calc('\\Re(z)').statements[0].code).toBe('sp.re(z)');
    expect(calc('\\Im(z)').statements[0].code).toBe('sp.im(z)');
    expect(calc('\\arg(z)').statements[0].code).toBe('sp.arg(z)');
    expect(calc('\\operatorname{erf}(x)').statements[0].code).toBe(
      'sp.erf(x)',
    );
  });

  it('lowers `x!!` to sp.factorial2 and `f \\circ g` to composition', () => {
    expect(calc('x!!').statements[0].code).toBe('sp.factorial2(x)');
    const prog = calc('f\\circ g');
    expect(prog.statements[0].code).toBe(
      'sp.Lambda(sp.Symbol("x"), f(g(sp.Symbol("x"))))',
    );
    expect(prog.prelude).toContain('f = sp.Function("f")');
    expect(prog.prelude).toContain('g = sp.Function("g")');
  });

  it('folds \\text{d} quotients into D() instead of dividing by d', () => {
    // \frac{\text{d}}{\text{d}t}t^2 was emitted as `d / (d*t) * t**2`
    // — the `d` factors cancel and the result is `t`, not `2t`.
    expect(calc('\\frac{\\text{d}}{\\text{d}t}t^{2}').statements[0].code).toBe(
      'sp.diff(t**2, t)',
    );
    expect(calc('\\frac{\\text{d}f}{\\text{d}x}').statements[0].code).toBe(
      'sp.diff(f(x), x)',
    );
    expect(
      calc('\\frac{\\text{d}^{2}}{\\text{d}x^{2}}x^{3}').statements[0].code,
    ).toBe('sp.diff(x**3, x, 2)');
  });

  it('lowers A^T to Transpose on a MatrixSymbol, not the crashing .T', () => {
    const prog = calc('A^{T}');
    expect(prog.prelude).toContain(
      'A = sp.MatrixSymbol("A", sp.Symbol("n", integer=True, positive=True), sp.Symbol("n", integer=True, positive=True))',
    );
    expect(prog.statements[0].code).toBe('sp.Transpose(A)');
  });

  it('lowers \\varphi(n) to totient, not the uncallable GoldenRatio', () => {
    expect(calc('\\varphi(n)').statements[0].code).toBe('sp.totient(n)');
  });

  it('collapses nested boundless integrals into one iterated call', () => {
    // \int\int\int nested three Integrate nodes — each appended its own
    // +C, integrating the inner constants into bogus terms.
    expect(
      calc('\\int\\int\\int xyz\\text{d}x\\text{d}y\\text{d}z').statements[0]
        .code,
    ).toBe('sp.integrate(x * y * z, x, y, z) + sp.Symbol("C")');
  });

  it('gives \\mathbb{C} membership a complex=True assumption', () => {
    expect(calc('x\\in\\mathbb{C}').prelude).toContain(
      'x = sp.Symbol("x", complex=True)',
    );
  });

  it('flags a stray differential under \\prod at compile time', () => {
    const prog = calc('\\prod x^{2}\\text{d}x');
    expect(prog.issues.some((i) => i.severity === 'error')).toBe(true);
    expect(prog.statements).toHaveLength(0);
  });

  it('lowers bare `f^{(n)}` to an applied derivative, not Derivative(f, n)', () => {
    // Bare `x^{(2)}` emitted `sp.Derivative(x, 2)` — TypeError ('cannot
    // represent derivative of UndefinedFunction'); and `x^{(2)}` must
    // not self-apply the function (diff(x(x), x, 2) hard-aborts wasm).
    expect(calc('x^{(2)}').statements[0].code).toBe(
      'sp.diff(x(t), t, 2)',
    );
    expect(calc('f^{(3)}').statements[0].code).toBe(
      'sp.diff(f(x), x, 3)',
    );
    expect(calc('t^{(2)}').statements[0].code).toBe(
      'sp.diff(t(x), x, 2)',
    );
  });

  it('routes \\partial_{v} subscript form through D() instead of gluing factors', () => {
    // `\partial_{x}x^{2}` parsed to `x**x * 2` — CE dropped the
    // operator and glued the subscript var onto the next factor.
    expect(calc('\\partial_{x}x^{2}').statements[0].code).toBe(
      'sp.diff(x**2, x)',
    );
    expect(calc('\\partial_{t}y').statements[0].code).toBe(
      'sp.diff(y(t), t)',
    );
  });

  it('singleton-wraps a bare name in \\in/\\notin like the set ops', () => {
    // `x \in S` echoed a `Element(x, S)` call stub; `x \in {S}` is the
    // honest reading and matches `x \cup y` -> `{x, y}`.
    expect(calc('x \\in S').statements[0].code).toBe(
      'sp.Contains(x, sp.FiniteSet(S))',
    );
    expect(calc('x \\notin S').statements[0].code).toBe(
      'sp.Not(sp.Contains(x, sp.FiniteSet(S)))',
    );
    expect(calc('x \\in \\mathbb{R}').statements[0].code).toBe(
      'sp.Contains(x, sp.S.Reals)',
    );
  });

  it('singleton-wraps bare names in subset/superset ops too', () => {
    expect(calc('A \\subseteq B').statements[0].code).toBe(
      '(sp.FiniteSet(A)).is_subset(sp.FiniteSet(B))',
    );
    expect(calc('\\mathbb{Z} \\subseteq \\mathbb{R}').statements[0].code).toBe(
      '(sp.S.Integers).is_subset(sp.S.Reals)',
    );
    expect(calc('A \\not\\subseteq B').statements[0].code).toBe(
      'sp.Not((sp.FiniteSet(A)).is_subset(sp.FiniteSet(B)))',
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
  });

  it('flags a symbolic derivative order instead of emitting 0 or crashing', () => {
    // `f^{(n)}` in sympy is `diff(f, x, n)` (differentiates by n too —
    // → 0) or `diff(f, (x, n))` — which hard-aborts this pyodide's
    // sympy. An honest error row is the only safe answer.
    for (const l of ['f^{(n)}', 'f^{(n)}(x)', 'f^{(n)}(2)']) {
      const prog = calc(l);
      expect(prog.statements).toHaveLength(0);
      expect(
        prog.issues.some(
          (i) => i.severity === 'error' && /derivative order/.test(i.message),
        ),
      ).toBe(true);
    }
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
    expect(p.statements[0]?.code).toBe('x_prime');
    expect(p.prelude).toContain("x_prime = sp.Symbol(\"x'\")");
  });

  it('applies nested calls, not a literal call(f, x)', () => {
    const p = calc('g(f(x))');
    expect(p.statements[0]?.code).toBe('g(f(x))');
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

