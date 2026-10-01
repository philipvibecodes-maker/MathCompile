import { describe, expect, it } from 'vitest';
import { parseCellLatex, normalizeIR, latexToStatementStrings } from './ir';
import { compileWorksheet } from './codegen';

// Fixture triples per the IR spec: latex -> normalized IR -> generated
// SymPy. `expectedPython` is the *cell's* full statement lines, including
// the `= sp.Symbol`/`sp.Function` definitions for names first needed in
// that cell — a symbol is defined in the cell that defines it.
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
    expectedIR: ['Divide', ['Add', 'x', 1], ['Add', 'y', -2]],
    expectedPython: ["x, y = sp.symbols('x y')", '(x + 1) / (y - 2)'],
  },
  {
    latex: '-x + 3 - y',
    expectedIR: ['Add', ['Negate', 'x'], ['Negate', 'y'], 3],
    expectedPython: ["x, y = sp.symbols('x y')", '-x - y + 3'],
  },
  {
    latex: '\\int_{a}^{b} x\\,dx',
    expectedIR: ['Integrate', 'x', ['Limits', 'x', 'a', 'b']],
    expectedPython: ["x, a, b = sp.symbols('x a b')", 'sp.integrate(x, (x, a, b))'],
  },
  {
    latex: '\\int x^2 dx',
    expectedIR: [
      'Integrate',
      ['Function', ['Power', 'x', 2], 'x'],
      ['Limits', 'x', 'Nothing', 'Nothing'],
    ],
    expectedPython: ['x = sp.Symbol("x")', 'sp.integrate(x**2, x)'],
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
    latex: '\\operatorname{foo}(x) + 1',
    expectedIR: ['Add', ['call', 'foo', 'x'], 1],
    expectedPython: ['x = sp.Symbol("x")', 'sp.foo(x) + 1'],
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
    expectedIR: [
      'Which',
      ['Less', 0, 'x'],
      'x',
      ['LessEqual', 'x', 0],
      ['Negate', 'x'],
    ],
    expectedPython: [
      'x = sp.Symbol("x")',
      'sp.Piecewise((x, sp.Lt(0, x)), (-x, sp.Le(x, 0)))',
    ],
  },
  {
    latex: '\\binom{n}{k}',
    expectedIR: ['Binomial', 'n', 'k'],
    expectedPython: ["n, k = sp.symbols('n k')", 'sp.binomial(n, k)'],
  },
  {
    latex: '\\frac{1}{2}',
    expectedIR: ['Rational', 1, 2],
    expectedPython: ['sp.Rational(1, 2)'],
  },
  {
    latex: '\\sqrt{x} + \\sin(\\theta)',
    expectedPython: [
      "theta, x = sp.symbols('theta x')",
      'sp.sin(theta) + sp.sqrt(x)',
    ],
  },
  {
    latex: 'x \\ge 2',
    expectedIR: ['LessEqual', 2, 'x'],
    expectedPython: ['x = sp.Symbol("x")', 'sp.Le(2, x)'],
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
    expectedPython: ['x = sp.Symbol("x")', 'sp.log(x, 2)'],
  },
  {
    // The example from the spec discussion: a cell containing just `a`
    // emits `a = sp.Symbol('a')` as its output.
    latex: 'a',
    expectedPython: ['a = sp.Symbol("a")'],
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
      const out = compileWorksheet([{ json }], 'python');
      expect(out.cellLines[0]).toEqual(fx.expectedPython);
      for (const frag of fx.issues ?? [])
        expect(
          out.issues.some((i) => i.message.includes(frag)),
        ).toBe(true);
    });
  }
});

describe('worksheet program', () => {
  it('emits import + per-cell definitions + one statement per cell', () => {
    const cells = [
      { json: parseCellLatex('a = x + 1') },
      { json: parseCellLatex('a * y') },
      { json: parseCellLatex('b = 5') },
    ];
    const out = compileWorksheet(cells, 'python');
    expect(out.program).toBe(
      [
        'import sympy as sp',
        '',
        '# cell 1',
        'x = sp.Symbol("x")',
        'a = x + 1',
        '',
        '# cell 2',
        'y = sp.Symbol("y")',
        'a * y',
        '',
        '# cell 3',
        'b = 5',
      ].join('\n'),
    );
    // `a` is bound by the cell-1 Assign before cell 2 uses it — so it never
    // gets a Symbol def, and `b` is only ever an Assign target.
    expect(out.program).not.toContain('a = sp.Symbol');
    expect(out.program).not.toContain('b = sp.Symbol');
  });

  it('a name used before its Assign gets a Symbol def in the using cell', () => {
    const cells = [
      { json: parseCellLatex('a + 1') },
      { json: parseCellLatex('a = 2') },
    ];
    const out = compileWorksheet(cells, 'python');
    expect(out.cellLines[0]).toEqual(['a = sp.Symbol("a")', 'a + 1']);
    expect(out.cellLines[1]).toEqual(['a = 2']);
  });

  it('non-identifier symbol names get sp.Symbol lines', () => {
    const out = compileWorksheet([{ json: parseCellLatex('a_{n+1}') }], 'python');
    expect(out.program).toContain(`# cell 1\na__n_1 = sp.Symbol("a_{n+1}")`);
  });

  it("function names (f'(x)) get sp.Function, not sp.Symbol", () => {
    const out = compileWorksheet([{ json: parseCellLatex("f'(x)") }], 'python');
    expect(out.program).toContain('f = sp.Function("f")');
    expect(out.program).not.toMatch(/sp\.Symbol\("f"\)/);
  });

  it('declared function names call directly, not via sp.', () => {
    const cells = [
      { json: parseCellLatex('f(x) = x^2') },
      { json: parseCellLatex('f(3)') },
    ];
    const out = compileWorksheet(cells, 'python');
    // f is bound by the def in cell 1 — the cell-2 call needs no defs.
    expect(out.cellLines[1]).toEqual(['f(3)']);
    expect(out.program).toContain('f(3)');
    expect(out.program).not.toContain('sp.f(3)');
    expect(out.program).not.toContain('sp.Function');
  });

  it('a call before its Def gets an sp.Function def in the calling cell', () => {
    const cells = [
      { json: parseCellLatex('f(3)') },
      { json: parseCellLatex('f(x) = x^2') },
    ];
    const out = compileWorksheet(cells, 'python');
    expect(out.cellLines[0]).toEqual(['f = sp.Function("f")', 'f(3)']);
    expect(out.cellLines[1]).toEqual(['def f(x):', '    return x**2']);
  });

  it('the seed cell compiles to an equation', () => {
    const out = compileWorksheet(
      [{ json: parseCellLatex('2^n = \\sum_{i=0}^n\\binom{i}{n}') }],
      'python',
    );
    expect(out.ok).toBe(true);
    expect(out.program).toContain('sp.Eq(2**n, sp.summation(sp.binomial(i, n), (i, 0, n)))');
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
