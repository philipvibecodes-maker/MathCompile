import { describe, expect, it } from 'vitest';
import { compileCellsForCalc, compileWorksheet } from './codegen';
import { parseCellLatex, type MathJson } from './ir';
import { Scope } from './codegen/scope';
import { pyIdent, pythonName } from './codegen/identifiers';

const inputs = (sources: string[]) => sources.map((latex) => ({ json: parseCellLatex(latex) }));
const scope = () => new Scope(false, new Set(), new Set(), new Set(), [], [], 0);

describe('redefinition warnings', () => {
  const warning = 'Warning: "a" is redefined — the previous definition is replaced.';
  for (const importAll of [true, false]) {
    it(`warns at the replacing line without dropping code (importAll=${importAll})`, () => {
      const cells = inputs(['\\displaylines{a=2\\\\ a=3\\\\ a}']);
      const calc = compileCellsForCalc(cells, { importAll });
      expect(calc.cells[0].issues).toEqual([{ severity: 'note', message: warning, line: 1 }]);
      expect(calc.cells[0].statements[1].code).toBe('a = 3');
      const python = compileWorksheet(cells, 'python', { importAll });
      expect(python.ok).toBe(true);
      expect(python.cellIssues[0]).toEqual([{ severity: 'note', message: warning }]);
      expect(python.cellLines[0]).toContain('a = 3');
    });

    it(`warns across cells in both targets (importAll=${importAll})`, () => {
      const cells = inputs(['a=2', 'a=2', 'a+1']);
      const calc = compileCellsForCalc(cells, { importAll });
      expect(calc.cells[0].issues).toEqual([]);
      expect(calc.cells[1].issues).toEqual([{ severity: 'note', message: warning, line: 0 }]);
      const python = compileWorksheet(cells, 'python', { importAll });
      expect(python.cellIssues[1]).toEqual([{ severity: 'note', message: warning }]);
      // Diagnostic history does not leak execution state into standalone exports.
      expect(python.cellLines[2].join('\n')).toContain(`a = ${importAll ? '' : 'sp.'}Symbol("a")`);
      expect(compileCellsForCalc(cells, { importAll })).toEqual(calc);
    });

    it(`warns when a free symbol becomes a matrix (importAll=${importAll})`, () => {
      const statements = ['A+1', 'A=\\begin{pmatrix}2&1\\\\1&2\\end{pmatrix}', '\\det A'];
      for (const sources of [statements, [`\\displaylines{${statements.join('\\\\ ')}}`]]) {
        const calc = compileCellsForCalc(inputs(sources), { importAll });
        const replacing = calc.cells[sources.length === 1 ? 0 : 1];
        expect(replacing.issues).toContainEqual({
          severity: 'note', message: warning.replace('"a"', '"A"'),
          line: sources.length === 1 ? 1 : 0,
        });
        expect(calc.cells.at(-1)!.statements.at(-1)!.code).toContain('Determinant(A)');
        const python = compileWorksheet(inputs(sources), 'python', { importAll });
        expect(python.ok).toBe(true);
        expect(python.cellIssues[sources.length === 1 ? 0 : 1]).toContainEqual({
          severity: 'note', message: warning.replace('"a"', '"A"'),
        });
      }
    });
  }

  it('does not warn for first assignments or function parameters', () => {
    const calc = compileCellsForCalc(inputs(['a=a+1', '\\text{def} f(a)=a+1']));
    expect(calc.cells.flatMap((c) => c.issues)).toEqual([]);
  });

  it('warns for replaced tuple targets and callable definitions', () => {
    const calc = compileCellsForCalc([
      { json: ['Assign', ['List', 'a', 'b'], ['List', 1, 2]] },
      { json: ['Assign', ['List', 'b', 'c'], ['List', 3, 4]] },
      ...inputs(['\\text{def} f(x)=x', '\\text{def} f(x)=x+1']),
    ]);
    expect(calc.cells[1].issues).toEqual([{
      severity: 'note', message: warning.replace('"a"', '"b"'), line: 0,
    }]);
    expect(calc.cells[3].issues).toEqual([{
      severity: 'note', message: warning.replace('"a"', '"f"'), line: 0,
    }]);
  });

  it('does not count failed assignments as successful definitions', () => {
    const calc = compileCellsForCalc([
      { json: ['Assign', 'a', ['Error', "'invalid'"]] },
      ...inputs(['a=2']),
    ]);
    expect(calc.cells[1].issues).toEqual([]);
  });

  it('does not count references from failed statements or bound parameters', () => {
    const calc = compileCellsForCalc([
      { json: ['Add', 'a', ['Error', "'invalid'"]] },
      ...inputs(['a=2', '\\text{def} f(b)=b+1', 'b=3']),
    ]);
    expect(calc.cells.slice(1).flatMap((c) => c.issues)).toEqual([]);
  });

  it('drops warnings when the replacing definition is removed or renamed', () => {
    for (const sources of [['a=2', 'b=3'], ['a=2']]) {
      expect(compileCellsForCalc(inputs(sources)).cells.flatMap((c) => c.issues)).toEqual([]);
      expect(compileWorksheet(inputs(sources), 'python').issues).toEqual([]);
    }
  });
});

describe('readable Python identifiers', () => {
  it.each([
    ['x_{-}', 'x_minus_'], ['x_{+}', 'x_plus_'],
    ['a_{n+1}', 'a_n_plus_1_'], ['a_{n-1}', 'a_n_minus_1_'],
    ['x_{i,j}', 'x_i_comma_j_'], ['x_{a/b}', 'x_a_over_b_'],
    ['x_{a*b}', 'x_a_times_b_'], ['x_{a^2}', 'x_a_pow_2_'],
    ['x_{−}', 'x_minus_'], ['x_{±}', 'x_plusminus_'],
    ['x_{?}', 'x_question_'], ['x_{🙂}', 'x_u1f642_'],
    ["x'", 'x_prime_'], ["x''", 'x_prime_prime_'],
    ['2x', '_2x_'], ['class', 'class_'], ['x_1', 'x_1'],
    ['x_bold', 'mathbf_x_'], ['x_plus', 'x_plus'], ['x_plus_', 'x_plus_'],
  ])('spells %s as %s', (raw, expected) => {
    expect(pyIdent(raw)).toBe(expected);
    expect(expected).toMatch(/^[A-Za-z_]\w*$/);
  });

  it('still disambiguates a literal name and a spelled-out symbol', () => {
    const s = scope();
    expect(s.ident('x_plus_')).toBe('x_plus_');
    expect(s.ident('x_{+}')).toBe('x_plus_2_');
    expect(s.ident('x_{+}')).toBe('x_plus_2_');
    expect(s.ident('x_plus_2_')).toBe('x_plus_2_2_');
  });
});

describe('CG-02 protected generated names', () => {
  it('reserves user names without changing builtin target spellings', () => {
    for (const name of ['S', 'Q', 'I', 'E', 'N', 'Symbol', 'Function', 'sqrt',
      'clean_and_simplify', '_mc_plot', 'isinstance', 'list', 'Tuple']) {
      expect(pyIdent(name)).toBe(`${name}_`);
      expect(pythonName(name)).toBe(name);
    }
  });

  it('disambiguates reserved-name mangling and existing suffixes', () => {
    const s = scope();
    expect(s.ident('S')).toBe('S_');
    expect(s.ident('S_')).toBe('S_2_');
    expect(s.ident('S_2_')).toBe('S_2_2_');
    expect(s.ident('S')).toBe('S_');
  });

  it('keeps underscore-containing helper names separate from runtime calls', () => {
    // Raw IR isolates identifier policy from editor underscore parsing.
    const out = compileCellsForCalc([
      { json: ['Assign', 'clean_and_simplify', 9] },
      { json: ['Add', 'clean_and_simplify', 4] },
    ]);
    expect(out.cells[0].statements[0].code).toBe('clean_and_simplify_ = 9');
    expect(out.cells[1].statements[0].code).toBe('clean_and_simplify(clean_and_simplify_ + 4)');
  });
});

for (const importAll of [true, false]) {
  const sp = importAll ? '' : 'sp.';
  const calc = (sources: string[]) => compileCellsForCalc(inputs(sources), { importAll });
  describe(`CG-02/16/21 bindings (importAll=${importAll})`, () => {
    it('separates user constants from SymPy constants and membership machinery', () => {
      const out = calc(['S=2', 'x\\in\\mathbb{R}', 'I=2', 'i^2', 'E=2', 'e^2', 'Q=2', 'p\\in\\mathbb{P}']);
      expect(out.cells[0].statements[0].code).toBe('S_ = 2');
      expect(out.cells[1].statements[0].code).toContain(`${sp}S.Reals`);
      expect(out.cells[3].statements[0].code).toContain(`${sp}I**2`);
      expect(out.cells[5].statements[0].code).toContain(`${sp}E**2`);
      expect(out.cells[7].statements[0].code).toContain(`${sp}Q.prime`);
    });

    it('retains distinct allocations across cells and through assignments', () => {
      const cells = [...inputs(['x_{-}+x_{+}', 'x_{-}-x_{+}']),
        { json: ['Assign', 'x_{+}', 7] as MathJson }, ...inputs(['x_{-}-x_{+}'])];
      const out = compileCellsForCalc(cells, { importAll });
      expect(out.cells[0].defs).toEqual([
        `x_minus_ = ${sp}Symbol("x_{-}")`, `x_plus_ = ${sp}Symbol("x_{+}")`,
      ]);
      expect(out.cells[1].statements[0].code).toBe('clean_and_simplify(x_minus_ - x_plus_)');
      expect(out.cells[2].statements[0].code).toBe('x_plus_ = 7');
      expect(out.cells[3].statements[0].code).toBe('clean_and_simplify(x_minus_ - x_plus_)');
      expect(compileCellsForCalc(cells, { importAll })).toEqual(out);
    });

    it('keeps standalone cell allocations independent', () => {
      const out = compileWorksheet([
        { json: ['Add', 'x_{+}', 'x_plus_'] },
        { json: ['Add', 'x_plus_', 'x_{+}'] },
      ], 'python', { importAll });
      expect(out.cellLines[0]).toContain(`x_plus_ = ${sp}Symbol("x_{+}")`);
      expect(out.cellLines[1]).toContain(`x_plus_2_ = ${sp}Symbol("x_{+}")`);
    });

    it('uses allocated function and matrix names across cells', () => {
      const cells: { json: MathJson }[] = [
        { json: ['Block', ['Declare', 'f_{-}', ['List', 'x']], ['Declare', 'f_{+}', ['List', 'x']]] },
        { json: ['Apply', 'f_{+}', 2] },
        { json: ['Block', ['Assign', 'A_{-}', ['Matrix', ['List', ['List', 1]]]], ['Assign', 'A_{+}', ['Matrix', ['List', ['List', 2]]]]] },
        { json: ['Determinant', 'A_{+}'] },
      ];
      const out = compileCellsForCalc(cells, { importAll });
      expect(out.cells[1].statements[0].code).toContain('f_plus_(2)');
      expect(out.cells[3].statements[0].code).toContain('A_plus_');
      expect(out.cells.flatMap((c) => c.issues)).toEqual([]);
    });

    it('does not let historical symbol declarations override matrix assignments', () => {
      for (const sources of [
        ['A+1', 'A=\\begin{pmatrix}2&1\\\\1&2\\end{pmatrix}', '\\det A'],
        ['\\displaylines{A+1\\\\ A=\\begin{pmatrix}2&1\\\\1&2\\end{pmatrix}\\\\ \\det A}'],
      ]) {
        const out = calc(sources);
        expect(out.cells.flatMap((c) => c.issues).filter((i) => i.severity === 'error')).toEqual([]);
        expect(out.cells.flatMap((c) => c.issues)).toContainEqual(expect.objectContaining({
          severity: 'note', message: expect.stringContaining('"A" is redefined'),
        }));
        expect(out.cells.at(-1)!.statements.at(-1)!.code).toContain(`${sp}Determinant(A)`);
      }
    });

    it('refreshes function return kinds on scalar and matrix redefinitions', () => {
      const out = calc(['\\text{def} f(x)=(x,x^2,x^3)', '\\text{def} f(x)=x^2', '|f(2)|']);
      expect(out.cells[2].statements[0].code).toBe(`clean_and_simplify(${sp}Abs(f(2)))`);
      const reverse = calc(['\\text{def} f(x)=x^2', '\\text{def} f(x)=(x,x^2,x^3)', '|f(2)|']);
      expect(reverse.cells[2].statements[0].code).toContain('(f(2)).norm()');
    });

    it('keeps lambda bindings differentiable as callable values', () => {
      const out = calc(['f=x\\mapsto x^2', '\\frac{df}{dx}']);
      expect(out.cells[1].issues.filter((i) => i.severity === 'error')).toEqual([]);
      expect(out.cells[1].statements[0].code).toContain(`${sp}diff(`);
    });

    it('applies matrix and scalar classifications in written order', () => {
      const out = calc(['\\displaylines{A=2\\\\ |A|\\\\ A=\\begin{pmatrix}2&1\\\\1&2\\end{pmatrix}\\\\ |A|\\\\ A=3\\\\ |A|}']);
      expect(out.cells[0].statements[1].code).toContain(`${sp}Abs(A)`);
      expect(out.cells[0].statements[3].code).toContain('(A).norm()');
      expect(out.cells[0].statements[5].code).toContain(`${sp}Abs(A)`);
    });

    it('emits distinct parameter spellings consistently in signatures and bodies', () => {
      const out = compileCellsForCalc([{ json: ['Def', 'f', ['List', 'x_{-}', 'x_{+}'], ['Add', 'x_{-}', ['Negate', 'x_{+}']]] }], { importAll });
      expect(out.cells[0].statements[0].code).toBe('def f(x_minus_, x_plus_):\n    return x_minus_ - x_plus_');
      expect(out.cells[0].statements[0].display).toContain('(lambda x_minus_, x_plus_:');
    });

    it('retains undefined callables across cells but rejects concrete scalar replacements', () => {
      const out = calc(['\\operatorname{foo}(x)', '\\operatorname{foo}(2)']);
      expect(out.cells[1].statements[0].code).toBe('clean_and_simplify(foo(2))');
      expect(out.cells[1].issues).toEqual(expect.not.arrayContaining([expect.objectContaining({ severity: 'error' })]));
      const scalar = calc(['\\operatorname{foo}(x)', '\\operatorname{foo}=2', '\\operatorname{foo}(2)']);
      expect(scalar.cells[2].statements[0].error).toContain('not callable');
    });
  });
}

describe('CG-16 parameter and binding lifetimes', () => {
  it('preserves readable parameter names locally and restores outer allocations', () => {
    const s = scope();
    s.ident('x_{+}');
    const outer = s.ident('x_{-}');
    expect(s.withParameters(['x_{-}', 'x_{+}'], () => [s.ident('x_{-}'), s.ident('x_{+}')]))
      .toEqual(['x_minus_', 'x_plus_']);
    expect(s.ident('x_{-}')).toBe(outer);
    expect(() => s.withParameters(['x_{-}'], () => { throw new Error('test'); })).toThrow('test');
    expect(s.ident('x_{-}')).toBe(outer);
  });

  it('reserves Python registry identifiers without rewriting their source', () => {
    const out = compileCellsForCalc([
      { json: ['PythonSource', 'def x_plus_(t):\n    return t+1'] },
      { json: ['Add', 'x_{-}', 'x_{+}'] },
    ]);
    expect(out.cells[0].statements[0].code).toContain('def x_plus_(t):');
    expect(out.cells[1].defs).toContain('x_plus_2_ = Symbol("x_{+}")');
  });

  it('does not capture a different global name with a local parameter', () => {
    const s = scope();
    expect(s.ident('x_minus_')).toBe('x_minus_');
    s.withParameters(['x_{-}'], () => {
      expect(s.ident('x_{-}')).toBe('x_minus_2_');
      expect(s.ident('x_minus_')).toBe('x_minus_');
      expect(s.ident('x_minus_2_')).toBe('x_minus_2_2_');
    });
  });
});
