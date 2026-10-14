import { describe, expect, it } from 'vitest';
import { collectPyFns } from './pydefs';
import { parseCellLatex, type MathJson } from './ir';
import { compileCellsForCalc, compileWorksheet } from './codegen';

// Python cells store their source as a bare PythonSource statement.
const py = (code: string) => ({
  json: ['PythonSource', code] as MathJson,
});
const math = (latex: string) => ({ json: parseCellLatex(latex) });

describe('collectPyFns', () => {
  it('registers a top-level def under its \\mathrm name', () => {
    const r = collectPyFns([py('def relu(x):\n    return x * (x > 0)')]);
    expect(r.fns.get('relu')).toMatchObject({ ident: 'relu', cell: 0 });
  });

  it('single-letter names register only the upright form', () => {
    const r = collectPyFns([py('def f(x):\n    return x')]);
    expect(r.fns.has('f')).toBe(false);
    expect(r.fns.get('f_upright')?.ident).toBe('f');
  });

  it('picks up lambda assignments and \\python{} blocks in math cells', () => {
    // \python{} is a statement — in a multi-statement cell it nests
    // inside the Block.
    const r = collectPyFns([
      math('y = 1 \\\\ \\python{relu = lambda x: x**2}'),
    ]);
    expect(r.fns.get('relu')?.ident).toBe('relu');
  });

  it('registers # @latex aliases on comment and def lines', () => {
    const r = collectPyFns([
      py('# @latex \\mathcal{F}\ndef my_func(x):\n    return x'),
      py('def g(x):  # @latex \\tilde{g}\n    return x'),
    ]);
    expect(r.fns.get('F_calligraphic')?.ident).toBe('my_func');
    expect(r.fns.get('g_tilde')?.ident).toBe('g');
  });

  it('notes an annotation that is not a callable name', () => {
    const r = collectPyFns([py('# @latex x + 1\ndef f(x):\n    return x')]);
    expect(r.notes[0].message).toMatch(/doesn't resolve/);
  });

  it('notes when the name shadows a SymPy builtin call', () => {
    const r = collectPyFns([py('def solve(x):\n    return x')]);
    expect(r.notes.some((n) => n.message.includes('built-in'))).toBe(true);
  });

  it('notes an alias whose call form injects extra operands', () => {
    // \pm(x) parses as Measurement(0, x) — the user's parens never map
    // one-to-one onto the def's params, so every call would misfire.
    const r = collectPyFns([
      py('# @latex \\pm\ndef goo(x):\n    return x + 2'),
    ]);
    expect(r.fns.get('Measurement')?.ident).toBe('goo');
    expect(
      r.notes.some((n) =>
        n.message.includes('expands to Measurement(0, x)'),
      ),
    ).toBe(true);
  });

  it('accepts a multi-param def called through a clean \\mathrm name', () => {
    const r = collectPyFns([py('def f(a, b):\n    return a')]);
    expect(r.notes).toEqual([]);
    // …and the Tuple splat calls it with both args.
    const out = compileCellsForCalc(
      [py('def f(a, b):\n    return a'), math('\\mathrm{f}(a,b)')],
      { importAll: false },
    );
    expect(out.cells[1].statements[0].code).toBe(
      'clean_and_simplify(f(a, b))',
    );
  });
});

describe('python-def calls in math cells', () => {
  it('compileWorksheet calls the python def and inlines its source', () => {
    const out = compileWorksheet(
      [
        py('def relu(x):\n    return x ** 2'),
        math('\\mathrm{relu}(x)'),
      ],
      'python',
      { importAll: false },
    );
    // The calling cell's standalone script carries the def it calls.
    expect(out.cellLines[1]).toEqual([
      'import sympy as sp',
      'def relu(x):\n    return x ** 2',
      'x = sp.Symbol("x")',
      'relu(x)',
    ]);
    expect(out.cellIssues[1]).toEqual([]);
  });

  it('a python cell above makes later calculator cells see the def', () => {
    const out = compileCellsForCalc(
      [py('def relu(x):\n    return x ** 2'), math('\\mathrm{relu}(3)')],
      { importAll: false },
    );
    const call = out.cells[1].statements[0];
    expect(call.code).toBe('clean_and_simplify(relu(3))');
    expect(out.cells[1].issues).toEqual([]);
  });

  it('a call above its def still emits the call plus the ordering note', () => {
    const out = compileCellsForCalc(
      // The calc prefix ends at the calling cell; the worksheetCells
      // option lets the def below still resolve.
      [math('\\mathrm{relu}(3)')],
      {
        importAll: false,
        worksheetCells: [
          math('\\mathrm{relu}(3)'),
          py('def relu(x):\n    return x'),
        ],
      },
    );
    expect(out.cells[0].statements[0].code).toBe(
      'clean_and_simplify(relu(3))',
    );
    expect(
      out.cells[0].issues.some((i) => i.message.includes('python cell 2')),
    ).toBe(true);
  });

  it('a # @latex annotation makes the latex form callable', () => {
    const out = compileCellsForCalc(
      [
        py('# @latex \\mathcal{F}\ndef my_func(x):\n    return x * 2'),
        math('\\mathcal{F}(x)'),
      ],
      { importAll: false },
    );
    expect(out.cells[1].statements[0].code).toBe(
      'clean_and_simplify(my_func(x))',
    );
  });

  it('an unregistered \\mathrm name still falls back to a Function stub', () => {
    const out = compileCellsForCalc([math('\\mathrm{relu}(x)')], {
      importAll: false,
    });
    expect(out.cells[0].defs).toEqual([
      'x = sp.Symbol("x")',
      'relu = sp.Function("relu")',
    ]);
    expect(
      out.cells[0].issues.some((i) => i.message.includes('unknown head')),
    ).toBe(true);
  });
});
