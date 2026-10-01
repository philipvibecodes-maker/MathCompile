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
    latex: 'f(x) = x^2 + 1',
    expectedIR: ['Def', 'f', ['List', 'x'], ['Add', ['Power', 'x', 2], 1]],
    // x is a def parameter (bound), f is bound by the def itself — no defs.
    expectedPython: ['def f(x):', '    return x**2 + 1'],
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
    expectedPython: ['x = sp.Symbol("x")', 'sp.limit(sp.sin(x) / x, x, 0)'],
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
    expectedIR: ['Apply', ['Sqrt', 'x'], ['Add', 'x', 1]],
    expectedPython: ['x = sp.Symbol("x")', 'sp.sqrt(x) * (x + 1)'],
  },
  {
    // `2(x+1)` hit the same bug as 'int' object is not callable.
    latex: '2(x+1)',
    expectedIR: ['Apply', 2, ['Add', 'x', 1]],
    expectedPython: ['x = sp.Symbol("x")', '2 * (x + 1)'],
  },
  {
    latex: 'x^{2}(y+1)',
    expectedIR: ['Apply', ['Power', 'x', 2], ['Add', 'y', 1]],
    expectedPython: ["x, y = sp.symbols('x y')", 'x**2 * (y + 1)'],
  },
  {
    // Inside an integrand: \int 1/(\sqrt{x}(x+1)) dx previously emitted
    // integrate(1/(sqrt(x)(x + 1)), x) → 'Pow' object is not callable.
    latex: '\\int \\frac{1}{\\sqrt{x}(x+1)}dx',
    expectedIR: [
      'Integrate',
      ['Divide', 1, ['Apply', ['Sqrt', 'x'], ['Add', 'x', 1]]],
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
    expectedPython: ['x = sp.Symbol("x")', 'sp.solve(sp.Eq(x**2, 4), x)'],
    issues: ['unknown head "solve"'],
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
    // A bare `f(x)` used to emit `sp.f(x)` — AttributeError in the
    // worker. Unknown applied names become worksheet Function defs.
    latex: 'f(x)',
    expectedIR: ['call', 'f', 'x'],
    expectedPython: [
      'x = sp.Symbol("x")',
      'f = sp.Function("f")',
      'f(x)',
    ],
    issues: ['unknown head "f"'],
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
    expectedPython: ['sp.Determinant(3)'],
    issues: ['determinant needs a matrix'],
  },
  {
    latex: 'A^T',
    expectedPython: ['A = sp.Symbol("A")', 'sp.Transpose(A)'],
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
    issues: ['unknown head "Factorial2"'],
  },
  {
    latex: '\\{1, 2, 3\\}',
    expectedPython: ['sp.FiniteSet(1, 2, 3)'],
    issues: ['unknown head "Set"'],
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
    expectedPython: ["f, x = sp.symbols('f x')", 'sp.limit(f, x, 0)'],
  },
  {
    // \underbrace{expr}_{label} labels the expression — it collapses to
    // the expr, and the sibling sub makes it a named symbol.
    latex: '\\underbrace{x+1}_{n}',
    expectedPython: ['x_1__n = sp.Symbol("x+1_{n}")'],
  },
  {
    // \Big( ... \Big) sizes are dropped — the parens stay an implicit
    // application, so `a` resolves as an undefined worksheet function.
    latex: 'a\\Big(b\\Big)',
    expectedPython: ['b = sp.Symbol("b")', 'a = sp.Function("a")', 'a(b)'],
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
    expectedPython: [
      "y, x = sp.symbols('y x')",
      '(sp.diff(y, x)).subs(x, 0)',
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
];

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

  it('statement-level = with f(x) LHS becomes Def', () => {
    const { ir } = normalizeIR(parseCellLatex('f(x) = x^2'));
    expect(Array.isArray(ir) && ir[0]).toBe('Def');
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

  it('declared function names call directly, not via sp.', () => {
    const cells = [
      { json: parseCellLatex('f(x) = x^2') },
      { json: parseCellLatex('f(3)') },
    ];
    const out = compileWorksheet(cells, 'python', { importAll: false });
    // Standalone cell 2 declares f with an sp.Function def, then calls it.
    expect(out.cellLines[1]).toEqual([
      'import sympy as sp',
      'f = sp.Function("f")',
      'f(3)',
    ]);
    expect(out.program).toContain('f(3)');
    expect(out.program).not.toContain('sp.f(3)');
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
