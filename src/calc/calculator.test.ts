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
    expect(calc('f(3)').statements[0].code).toBe(
      'getattr(sp, "f", sp.Function("f"))(3)',
    );
    expect(calc('\\operatorname{foo}(x)').statements[0].code).toBe(
      'getattr(sp, "foo", sp.Function("foo"))(x)',
    );
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
      'sp.Intersection(sp.Interval(1, 2), sp.Interval.Ropen(0, 3))',
    );
    expect(calc('x\\equiv1\\mod2').statements[0].code).toBe(
      'sp.Eq(sp.Mod(x, 2), 1)',
    );
    expect(calc('x\\in\\left[0,\\infty\\right)').statements[0].code).toBe(
      'sp.Contains(x, sp.Interval.Ropen(0, sp.oo))',
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

  it('emits \\min_{x} f as the body alone (sympy has no bounded Min)', () => {
    expect(calc('\\min_{x}x^{2}').statements[0].code).toBe('sp.Min(x**2)');
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
    expect(calc('\\emptyset').statements[0].code).toBe('sp.S.EmptySet');
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
      'sp.integrate(x * y, x, y)',
    );
    expect(
      calc('\\iiint x\\text{d}x\\text{d}y\\text{d}z').statements[0].code,
    ).toBe('sp.integrate(x, x, y, z)');
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

  it('emits a ConditionSet for \\{x \\in S : cond\\}', () => {
    expect(
      calc('\\{x\\in\\mathbb{R}:x>0\\}').statements[0].code,
    ).toBe('sp.ConditionSet(x, sp.Gt(x, 0), sp.S.Reals)');
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

  it('flags a stray differential under \\prod at compile time', () => {
    const prog = calc('\\prod x^{2}\\text{d}x');
    expect(prog.issues.some((i) => i.severity === 'error')).toBe(true);
    expect(prog.statements).toHaveLength(0);
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
