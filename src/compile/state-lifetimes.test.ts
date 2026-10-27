import { describe, expect, it } from 'vitest';
import { compileCellForCalc, compileCellsForCalc, compileWorksheet } from './codegen';
import { parseCellLatex, type MathJson } from './ir';
import { Scope } from './codegen/scope';

const scope = () => new Scope(false, new Set(), new Set(), new Set(), [], [], 0);

describe('temporary compiler bindings', () => {
  it('a new cell replaces diagnostics while retaining worksheet bindings', () => {
    const s = scope();
    s.markDefined('a');
    s.emit.constNames.add('C');
    s.flag('error', 'previous cell');
    const issues: import('./ir').Issue[] = [];
    s.beginCell(2, issues);
    expect(s.cellIdx).toBe(2);
    expect(s.errorCount).toBe(0);
    expect(s.decls.defined.has('a')).toBe(true);
    expect(s.emit.constNames.has('C')).toBe(true);
    s.flag('note', 'current cell');
    expect(issues).toEqual([{ severity: 'note', message: 'current cell' }]);
  });

  it('restores nested shadowing and operator bindings after an exception', () => {
    const s = scope();
    s.emit.bound.add('outer');
    const bound = s.emit.bound;
    const lambdaBound = s.emit.lambdaBound;
    expect(() => s.withBound(['x'], () => {
      expect([...s.emit.bound]).toEqual(['outer', 'x']);
      s.withBoundOnly(['x'], () => {
        expect([...s.emit.bound]).toEqual(['x']);
        s.withLambdaBound(['i'], () => {
          s.withLambdaBound(['x'], () => {
            expect([...s.emit.lambdaBound]).toEqual(['i', 'x']);
            throw new Error('interrupted emission');
          });
        });
      });
    })).toThrow('interrupted emission');
    expect(s.emit.bound).toBe(bound);
    expect([...bound]).toEqual(['outer']);
    expect(s.emit.lambdaBound).toBe(lambdaBound);
    expect([...lambdaBound]).toEqual([]);
  });

  it('clears nested function cycle guards on throw', () => {
    const s = scope();
    expect(() => s.withEmitting('f', () => {
      s.withEmitting('g', () => {
        expect([...s.emit.emitting]).toEqual(['f', 'g']);
        throw new Error('interrupted function');
      });
    })).toThrow('interrupted function');
    expect([...s.emit.emitting]).toEqual([]);
    expect(s.withEmitting('f', () => 'recovered')).toBe('recovered');
    expect([...s.emit.emitting]).toEqual([]);
  });
});

describe('independent compilation requests', () => {
  const worksheets: { name: string; cells: { json?: MathJson }[] }[] = [
    {
      name: 'nested and shadowed lambdas',
      cells: [{ json: ['Function', ['Apply', ['Function', ['Power', 'x', 2], 'x'], 'x'], 'x'] }],
    },
    {
      name: 'mutually referring symbolic functions',
      cells: [{ json: ['Block', ['Declare', 'f', ['List', 'g']], ['Declare', 'g', ['List', 'f']], ['Add', 'f', 'g']] }],
    },
    {
      name: 'integration constants across cells',
      cells: ['C = 2', '\\int x dx', '\\int y dy'].map((latex) => ({ json: parseCellLatex(latex) })),
    },
    {
      name: 'matrix and scalar rebinding',
      cells: ['A = \\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', '\\det A', 'A = 3', 'A + 1']
        .map((latex) => ({ json: parseCellLatex(latex) })),
    },
  ];

  for (const fixture of worksheets) {
    it(`${fixture.name}: repeated compilation does not mutate inputs or leak state`, () => {
      const original = structuredClone(fixture.cells);
      const calc = compileCellsForCalc(fixture.cells);
      const python = compileWorksheet(fixture.cells, 'python');
      // An unrelated worksheet deliberately overlaps the same identifiers.
      compileCellsForCalc([{ json: ['Block', ['Assign', 'x', 99], ['Assign', 'C', 1], ['Assign', 'A', 0]] }]);
      expect(compileCellsForCalc(fixture.cells)).toEqual(calc);
      expect(compileWorksheet(fixture.cells, 'python')).toEqual(python);
      expect(fixture.cells).toEqual(original);
    });
  }

  it('a malformed cell does not contaminate a following valid cell or request', () => {
    const bad = { json: parseCellLatex('\\frac{1}{}') };
    const good = { json: parseCellLatex('y + 1') };
    const expected = compileCellForCalc(good);
    expect(compileCellForCalc(bad).issues.some((issue) => issue.severity === 'error')).toBe(true);
    const worksheet = compileCellsForCalc([bad, good]);
    expect(worksheet.cells[1]).toEqual(compileCellsForCalc([good]).cells[0]);
    expect(compileCellForCalc(good)).toEqual(expected);
  });
});
