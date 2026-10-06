import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expandLatex,
  getMacro,
  macroRejected,
  parseNotationDef,
  setCellMacros,
} from './macros';
import { parseCellLatex, syncCellMacros } from './ir';
import { compileWorksheet } from './codegen';

// Module state persists across tests in this file — clear the macro
// table before each.
beforeEach(() => {
  vi.unstubAllGlobals();
  setCellMacros([]);
});

describe('parseNotationDef', () => {
  it('parses pasted \\newcommand with an explicit arity', () => {
    expect(parseNotationDef('\\newcommand{\\vv}[1]{\\mathbf{#1}}')).toEqual({
      name: 'vv',
      arity: 1,
      body: '\\mathbf{#1}',
    });
  });

  it('parses the \\left…\\right form a typed def serializes to', () => {
    // Typing `\newcommand{\vv}[1]{\mathbf{#1}}` stores
    // \left\{…\right\} brace pairs and \text{vv} for the name.
    expect(
      parseNotationDef(
        '\\newcommand\\left\\{\\text{vv}\\right\\}\\left[1\\right]\\left\\{\\mathbf{#1}\\right\\}',
      ),
    ).toEqual({ name: 'vv', arity: 1, body: '\\mathbf{#1}' });
  });

  it('parses mixed verbatim/typed component spellings', () => {
    expect(
      parseNotationDef(
        '\\newcommand \\text{vv}\\left[2\\right]{#1 + #2}',
      ),
    ).toEqual({ name: 'vv', arity: 2, body: '#1 + #2' });
    expect(parseNotationDef('\\newcommand\\vv{x^2}')).toEqual({
      name: 'vv',
      arity: 0,
      body: 'x^2',
    });
  });

  it('accepts \\renewcommand and \\providecommand', () => {
    expect(parseNotationDef('\\renewcommand{\\vv}[1]{#1}')).toEqual({
      name: 'vv',
      arity: 1,
      body: '#1',
    });
    expect(parseNotationDef('\\providecommand{\\k}{1}')).toEqual({
      name: 'k',
      arity: 0,
      body: '1',
    });
  });

  it('infers arity from the highest #k when [n] is omitted', () => {
    expect(parseNotationDef('\\newcommand{\\dd}{\\frac{#1}{#2}}')).toEqual({
      name: 'dd',
      arity: 2,
      body: '\\frac{#1}{#2}',
    });
    // A repeated placeholder doesn't inflate the count.
    expect(parseNotationDef('\\newcommand{\\sq}{#1 * #1}')).toEqual({
      name: 'sq',
      arity: 1,
      body: '#1 * #1',
    });
  });

  it('reads a name spec the field wrote with the macro registered', () => {
    // Re-defining `\vv` while it is registered serializes the name as
    // `\vv{ }` — an empty arg block — inside the braces.
    expect(
      parseNotationDef(
        '\\newcommand\\left\\{\\vv{ }\\right\\}\\left\\{\\mathbf{#1}\\right\\}',
      ),
    ).toEqual({ name: 'vv', arity: 1, body: '\\mathbf{#1}' });
  });

  it('keeps a nested \\left…\\right pair inside the body', () => {
    expect(
      parseNotationDef(
        '\\newcommand{\\vv}[1]{\\left(#1\\right)}',
      ),
    ).toEqual({ name: 'vv', arity: 1, body: '\\left(#1\\right)' });
  });

  it('returns null for ordinary statements and malformed defs', () => {
    expect(parseNotationDef('x + 1')).toBeNull();
    expect(parseNotationDef('\\text{def} f(x) = x^2')).toBeNull();
    expect(parseNotationDef('\\newcommand')).toBeNull();
    expect(parseNotationDef('\\newcommand{\\vv}')).toBeNull();
    // trailing content — not a bare def statement
    expect(parseNotationDef('\\newcommand{\\vv}{x} + 1')).toBeNull();
    expect(parseNotationDef('\\newcommand{\\vv}[x]{x}')).toBeNull();
    // \newcommandx is a different command
    expect(parseNotationDef('\\newcommandx{\\vv}{x}')).toBeNull();
  });
});

describe('setCellMacros', () => {
  it('reports whether the table changed', () => {
    expect(setCellMacros([{ name: 'vv', arity: 1, body: 'x' }])).toBe(true);
    expect(setCellMacros([{ name: 'vv', arity: 1, body: 'x' }])).toBe(false);
    expect(setCellMacros([])).toBe(true);
    expect(setCellMacros([])).toBe(false);
  });

  it('drops a def whose name collides with a builtin command', () => {
    vi.stubGlobal('window', {
      __mcUserMacro: (name: string) => name !== 'sin',
      __mcUserMacroRemove: () => {},
    });
    setCellMacros([
      { name: 'vv', arity: 1, body: 'x' },
      { name: 'sin', arity: 1, body: 'x' },
    ]);
    expect(getMacro('vv')).toBeDefined();
    expect(getMacro('sin')).toBeUndefined();
    expect(macroRejected('sin')).toBe(true);
    expect(macroRejected('vv')).toBe(false);
  });

  it('clears the rejection when the def disappears', () => {
    vi.stubGlobal('window', {
      __mcUserMacro: (name: string) => name !== 'sin',
      __mcUserMacroRemove: () => {},
    });
    setCellMacros([{ name: 'sin', arity: 1, body: 'x' }]);
    expect(macroRejected('sin')).toBe(true);
    setCellMacros([]);
    expect(macroRejected('sin')).toBe(false);
  });
});

describe('expandLatex', () => {
  it('substitutes #k positionally', () => {
    setCellMacros([{ name: 'dd', arity: 2, body: '\\frac{#1}{#2}' }]);
    expect(expandLatex('\\dd{u}{v}')).toBe('\\frac{u}{v}');
  });

  it('expands a zero-arity macro', () => {
    setCellMacros([{ name: 'half', arity: 0, body: '\\frac{1}{2}' }]);
    expect(expandLatex('3\\half + \\half')).toBe('3\\frac{1}{2} + \\frac{1}{2}');
  });

  it('expands macros nested inside another macro\'s args', () => {
    setCellMacros([
      { name: 'sq', arity: 1, body: '#1^2' },
      { name: 'half', arity: 0, body: '\\frac{1}{2}' },
    ]);
    expect(expandLatex('\\sq{3 + \\half}')).toBe('3 + \\frac{1}{2}^2');
  });

  it('expands a macro invoked from another macro\'s body', () => {
    setCellMacros([
      { name: 'q', arity: 0, body: '\\half + \\half' },
      { name: 'half', arity: 0, body: '\\frac{1}{2}' },
    ]);
    expect(expandLatex('\\q')).toBe('\\frac{1}{2} + \\frac{1}{2}');
  });

  it('leaves unknown commands and incomplete calls untouched', () => {
    setCellMacros([{ name: 'sq', arity: 1, body: '#1^2' }]);
    expect(expandLatex('\\frac{1}{\\sq} + \\unknown{2}')).toBe(
      '\\frac{1}{\\sq} + \\unknown{2}',
    );
  });

  it('caps a self-referential body instead of looping', () => {
    setCellMacros([{ name: 'a', arity: 0, body: '\\a' }]);
    // terminates; the leftover \a flags unsupported downstream
    expect(expandLatex('\\a')).toBe('\\a');
  });
});

describe('parseCellLatex integration', () => {
  it('a \\newcommand statement produces a Notation node', () => {
    expect(parseCellLatex('\\newcommand{\\vv}[1]{\\mathbf{#1}}')).toEqual([
      'Notation',
      'vv',
      '\\mathbf{#1}',
    ]);
  });

  it('a rejected (builtin-named) def still parses, marked for codegen', () => {
    vi.stubGlobal('window', {
      __mcUserMacro: (name: string) => name !== 'sin',
      __mcUserMacroRemove: () => {},
    });
    syncCellMacros(['\\newcommand{\\sin}[1]{x}']);
    expect(parseCellLatex('\\newcommand{\\sin}[1]{x}')).toEqual([
      'Notation',
      'sin',
      'x',
      'builtin',
    ]);
  });

  it('a macro registered from another statement expands on use', () => {
    syncCellMacros(['\\newcommand{\\sq}[1]{#1^2}']);
    expect(parseCellLatex('\\sq{3}')).toEqual(['Power', 3, 2]);
  });

  it('a macro expands inside \\displaylines rows', () => {
    syncCellMacros(['\\newcommand{\\half}{\\frac{1}{2}}']);
    expect(parseCellLatex('\\displaylines{\\half \\\\ \\half + 1}')).toEqual([
      'Block',
      ['Divide', 1, 2],
      ['Add', ['Divide', 1, 2], 1],
    ]);
  });
});

describe('compileWorksheet with notation', () => {
  const cells = (...latex: string[]) =>
    latex.map((l) => ({ json: parseCellLatex(l) }));

  it('emits nothing for the def statement and expands the use', () => {
    syncCellMacros(['\\newcommand{\\sq}[1]{#1^2}']);
    const out = compileWorksheet(
      cells('\\displaylines{\\newcommand{\\sq}[1]{#1^2} \\\\ \\sq{a} + 1}'),
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

  it('flags an error when the name collides with a builtin', () => {
    vi.stubGlobal('window', {
      __mcUserMacro: (name: string) => name !== 'sin',
      __mcUserMacroRemove: () => {},
    });
    syncCellMacros(['\\newcommand{\\sin}[1]{x}']);
    const out = compileWorksheet(
      cells('\\newcommand{\\sin}[1]{x}'),
      'python',
      { importAll: false },
    );
    // The def statement emits no lines — only the error flag.
    expect(out.cellLines[0]).toEqual([]);
    expect(
      out.cellIssues[0].some(
        (i) => i.severity === 'error' && i.message.includes('\\sin'),
      ),
    ).toBe(true);
  });
});
