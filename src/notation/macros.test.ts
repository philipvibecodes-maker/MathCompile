import { beforeEach, describe, expect, it } from 'vitest';
import {
  defineUserMacro,
  expandLatex,
  listMacros,
  parseNotationDef,
  removeUserMacro,
  setCellMacros,
} from './macros.svelte';
import { parseCellLatex, syncCellMacros } from '../compile/ir';
import { compileWorksheet } from '../compile/codegen';

// Module state persists across tests in this file — clear both macro
// tables before each. (Node has no __mcUserMacro hook, so registration
// always "succeeds" here; builtin-collision rejection is e2e-only.)
beforeEach(() => {
  setCellMacros([]);
  for (const m of listMacros().slice()) removeUserMacro(m.name);
});

describe('parseNotationDef', () => {
  it('parses a \\text{notation} statement with parenthesized args', () => {
    expect(
      parseNotationDef('\\text{notation} \\mathrm{vv}(x) := \\mathbf{x}'),
    ).toEqual({ name: 'vv', arity: 1, params: ['x'], body: '\\mathbf{x}' });
  });

  it('parses the auto-paired \\left( \\right) arg form MQ serializes', () => {
    expect(
      parseNotationDef(
        '\\text{notation}\\ \\mathrm{vv}\\left(x,y\\right) := x + y',
      ),
    ).toEqual({ name: 'vv', arity: 2, params: ['x', 'y'], body: 'x + y' });
  });

  it('parses brace-group args and a bare-`=` separator', () => {
    expect(parseNotationDef('\\text{notation} \\sq{x} = x^2')).toEqual({
      name: 'sq',
      arity: 1,
      params: ['x'],
      body: 'x^2',
    });
  });

  it('parses a zero-arg constant', () => {
    expect(parseNotationDef('\\text{notation} \\half := \\frac{1}{2}')).toEqual(
      { name: 'half', arity: 0, params: [], body: '\\frac{1}{2}' },
    );
  });

  it('parses pasted \\newcommand with an explicit arity', () => {
    expect(
      parseNotationDef('\\newcommand{\\vv}[1]{\\mathbf{#1}}'),
    ).toEqual({ name: 'vv', arity: 1, params: [], body: '\\mathbf{#1}' });
  });

  it('infers arity from #k placeholders when [n] is omitted', () => {
    expect(parseNotationDef('\\newcommand{\\dd}{\\frac{#1}{#2}}')).toEqual({
      name: 'dd',
      arity: 2,
      params: [],
      body: '\\frac{#1}{#2}',
    });
  });

  it('parses the bare-letter and \\text{…} spellings plain typing produces', () => {
    expect(
      parseNotationDef('\\text{notation} vv\\left(x\\right) := \\mathbf{x}'),
    ).toEqual({ name: 'vv', arity: 1, params: ['x'], body: '\\mathbf{x}' });
    expect(
      parseNotationDef('\\text{notation} \\text{vv}(x) := \\mathbf{x}'),
    ).toEqual({ name: 'vv', arity: 1, params: ['x'], body: '\\mathbf{x}' });
  });

  it('returns null for ordinary statements', () => {
    expect(parseNotationDef('x + 1')).toBeNull();
    expect(parseNotationDef('\\text{def} f(x) = x^2')).toBeNull();
    expect(parseNotationDef('\\text{notation}')).toBeNull();
  });
});

describe('expandLatex', () => {
  it('substitutes named params whole-token', () => {
    setCellMacros([
      { name: 'sq', arity: 1, params: ['x'], body: 'x^2 + 1' },
    ]);
    expect(expandLatex('\\sq{a} + 3')).toBe('a^2 + 1 + 3');
  });

  it('does not substitute inside a longer command name (\\xi)', () => {
    setCellMacros([
      { name: 'w', arity: 1, params: ['x'], body: '\\xi - x' },
    ]);
    expect(expandLatex('\\w{a}')).toBe('\\xi - a');
  });

  it('substitutes #k positionally for \\newcommand bodies', () => {
    setCellMacros([
      { name: 'dd', arity: 2, params: [], body: '\\frac{#1}{#2}' },
    ]);
    expect(expandLatex('\\dd{u}{v}')).toBe('\\frac{u}{v}');
  });

  it('leaves unknown commands and incomplete calls untouched', () => {
    setCellMacros([
      { name: 'sq', arity: 1, params: ['x'], body: 'x^2' },
    ]);
    expect(expandLatex('\\frac{1}{\\sq} + \\unknown{2}')).toBe(
      '\\frac{1}{\\sq} + \\unknown{2}',
    );
  });

  it('expands cell macros over user macros of the same name', () => {
    defineUserMacro({ name: 'k', arity: 0, params: [], body: '1' });
    setCellMacros([{ name: 'k', arity: 0, params: [], body: '2' }]);
    expect(expandLatex('\\k + 0')).toBe('2 + 0');
  });
});

describe('parseCellLatex integration', () => {
  it('a notation statement produces a Notation node', () => {
    const j = parseCellLatex(
      '\\text{notation}\\ \\mathrm{sq}\\left(x\\right) := x^2',
    );
    expect(j).toEqual(['Notation', 'sq', 'x^2']);
  });

  it('a macro registered from another statement expands on use', () => {
    syncCellMacros(['\\text{notation} \\mathrm{sq}(x) := x^2']);
    expect(parseCellLatex('\\sq{3}')).toEqual(['Power', 3, 2]);
  });
});

describe('compileWorksheet with notation', () => {
  const cells = (...latex: string[]) =>
    latex.map((l) => ({ json: parseCellLatex(l) }));

  it('emits nothing for the def statement and expands the use', () => {
    syncCellMacros([
      '\\displaylines{\\text{notation} \\mathrm{sq}(x) := x^2 \\\\ \\sq{a} + 1}',
    ]);
    const out = compileWorksheet(
      cells(
        '\\displaylines{\\text{notation} \\mathrm{sq}(x) := x^2 \\\\ \\sq{a} + 1}',
      ),
      'python',
      { importAll: false },
    );
    expect(out.cellLines[0]).toEqual([
      'import sympy as sp',
      'a = sp.Symbol("a")',
      'a**2 + 1',
    ]);
    expect(
      out.cellIssues[0].some(
        (i) => i.severity === 'note' && i.message.includes('\\sq'),
      ),
    ).toBe(true);
  });
});
