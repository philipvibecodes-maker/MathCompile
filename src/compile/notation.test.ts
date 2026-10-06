// Pins the notation registry's derived views against the literals they
// replaced — the transitional check that proves the registry carries the
// same name metadata the old tables did. The one intentional difference
// is CALL_RENAMED: codegen's SP_BUILTIN_CALL supersedes ir.ts's drifted
// copy, so the derived set gains the names the drifted copy dropped.

import { describe, expect, it } from 'vitest';
import { SMART_AUTO_COMMANDS } from '../editor/smart-commands';
import { compileWorksheet } from './codegen';
import { normalizeIR, parseCellLatex, unquote } from './ir';
import {
  CALL_RENAMED,
  CALL_RENAMES,
  CE_CONSTANTS,
  CE_DISPLAY_NAMES,
  CONSTANTS,
  INVERSE_FUNCS,
  KNOWN_HEADS,
  LEAF_SETS,
  MATRIX_METHODS,
  MATRIX_WORD_OPS,
  NOTATION,
  SET_CONSTRAINTS,
  SET_LEAF,
  SETISH_SYMBOLS,
  SP_BUILTIN_CALL,
  SP_FUNCS,
  SP_FUNC_MIN_ARGS,
} from './notation';

const sort = (xs: Iterable<string>) => [...xs].sort();

describe('derived codegen views equal the replaced literals', () => {
  it('SP_FUNCS', () => {
    expect(SP_FUNCS).toEqual({
      Sqrt: 'sqrt', Root: 'root',
      Abs: 'Abs', Sign: 'sign', Floor: 'floor', Ceil: 'ceiling',
      Min: 'Min', Max: 'Max',
      Factorial: 'factorial', Gamma: 'gamma', Binomial: 'binomial',
      GCD: 'gcd', LCM: 'lcm', Mod: 'Mod',
      Exp: 'exp', Ln: 'log',
      Sin: 'sin', Cos: 'cos', Tan: 'tan',
      Sec: 'sec', Csc: 'csc', Cot: 'cot',
      Sinh: 'sinh', Cosh: 'cosh', Tanh: 'tanh',
      Coth: 'coth', Sech: 'sech', Csch: 'csch',
      Arcsin: 'asin', Arccos: 'acos', Arctan: 'atan',
      Arcsec: 'asec', Arccsc: 'acsc', Arccot: 'acot',
      Arcsinh: 'asinh', Arccosh: 'acosh', Arctanh: 'atanh',
      Conjugate: 'conjugate',
      Re: 're', Im: 'im', Arg: 'arg',
      Real: 're', Imaginary: 'im', Argument: 'arg',
      Erf: 'erf',
    });
  });

  it('CALL_RENAMES', () => {
    expect(CALL_RENAMES).toEqual({
      Factorial2: 'factorial2',
      Erf: 'erf', Erfc: 'erfc',
      Conjugate: 'conjugate',
      Re: 're', Im: 'im', Arg: 'arg',
      Real: 're', Imaginary: 'im', Argument: 'arg',
      Superstar: 'Adjoint',
      Congruent: 'Congruent',
      nCk: 'binomial', nCr: 'binomial', nPr: 'ff', perm: 'ff',
      Pi: 'primepi',
      Arsinh: 'asinh', Arcosh: 'acosh', Artanh: 'atanh',
      Arcsinh: 'asinh', Arccosh: 'acosh', Arctanh: 'atanh',
      Set: 'FiniteSet',
    });
  });

  it('INVERSE_FUNCS', () => {
    expect(INVERSE_FUNCS).toEqual({
      Sin: 'asin', Cos: 'acos', Tan: 'atan',
      Sec: 'asec', Csc: 'acsc', Cot: 'acot',
      Sinh: 'asinh', Cosh: 'acosh', Tanh: 'atanh',
      Coth: 'acoth', Sech: 'asech', Csch: 'acsch',
      Exp: 'log', Ln: 'exp', Log: 'exp',
    });
  });

  it('SP_FUNC_MIN_ARGS', () => {
    expect(SP_FUNC_MIN_ARGS).toEqual({
      Min: 1, Max: 1,
      root: 1, binomial: 2, gcd: 2, lcm: 2, Mod: 2,
    });
  });

  it('MATRIX_METHODS', () => {
    expect(MATRIX_METHODS).toEqual({
      trace: 'trace()', Trace: 'trace()', tr: 'trace()',
      rank: 'rank()',
      eigenvals: 'eigenvals()', eigenvects: 'eigenvects()',
      inverse: 'inv()', transpose: 'T', norm: 'norm()',
    });
  });

  it('SETISH_SYMBOLS', () => {
    expect(sort(SETISH_SYMBOLS)).toEqual(
      sort([
        'RealNumbers', 'ComplexNumbers', 'RationalNumbers', 'Integers',
        'NonNegativeIntegers', 'PositiveIntegers', 'NegativeIntegers',
        'NonPositiveIntegers', 'Primes',
        'PositiveNumbers', 'NegativeNumbers', 'NonNegativeNumbers',
        'NonPositiveNumbers', 'EmptySet',
      ]),
    );
  });

  it('LEAF_SETS', () => {
    const sp = 'sp.';
    expect(Object.keys(LEAF_SETS).sort()).toEqual(
      [
        'PositiveNumbers', 'NegativeNumbers', 'NonNegativeNumbers',
        'NonPositiveNumbers', 'PositiveIntegers', 'NonNegativeIntegers',
        'NegativeIntegers', 'NonPositiveIntegers',
      ].sort(),
    );
    expect(LEAF_SETS['PositiveNumbers'](sp)).toBe('sp.Interval.open(0, sp.oo)');
    expect(LEAF_SETS['NegativeNumbers'](sp)).toBe(
      'sp.Interval.open(-sp.oo, 0)',
    );
    expect(LEAF_SETS['NonNegativeNumbers'](sp)).toBe('sp.Interval(0, sp.oo)');
    expect(LEAF_SETS['NonPositiveNumbers'](sp)).toBe(
      'sp.Interval(-sp.oo, 0)',
    );
    expect(LEAF_SETS['PositiveIntegers'](sp)).toBe('sp.S.Naturals');
    expect(LEAF_SETS['NonNegativeIntegers'](sp)).toBe('sp.S.Naturals0');
    expect(LEAF_SETS['NegativeIntegers'](sp)).toBe(
      'sp.Intersection(sp.S.Integers, sp.Interval.open(-sp.oo, 0))',
    );
    expect(LEAF_SETS['NonPositiveIntegers'](sp)).toBe(
      'sp.Intersection(sp.S.Integers, sp.Interval(-sp.oo, 0))',
    );
  });

  it('SET_CONSTRAINTS', () => {
    expect(SET_CONSTRAINTS).toEqual({
      RealNumbers: { kwargs: ['real=True'], preds: ['real'] },
      ComplexNumbers: { kwargs: ['complex=True'], preds: ['complex'] },
      RationalNumbers: { kwargs: ['rational=True'], preds: ['rational'] },
      Integers: { kwargs: ['integer=True'], preds: ['integer'] },
      NonNegativeIntegers: {
        kwargs: ['integer=True', 'nonnegative=True'],
        preds: ['integer', 'nonnegative'],
      },
      PositiveIntegers: {
        kwargs: ['integer=True', 'positive=True'],
        preds: ['integer', 'positive'],
      },
      PositiveNumbers: { kwargs: ['positive=True'], preds: ['positive'] },
      Primes: { kwargs: ['prime=True'], preds: ['prime'] },
    });
  });

  it('CONSTANTS', () => {
    expect(CONSTANTS).toEqual({
      Pi: 'pi',
      ExponentialE: 'E',
      ImaginaryUnit: 'I',
      PositiveInfinity: 'oo',
      NegativeInfinity: '-oo',
      EulerGamma: 'EulerGamma',
      CatalansConstant: 'Catalan',
      GoldenRatio: 'GoldenRatio',
      EmptySet: 'EmptySet',
      RealNumbers: 'S.Reals',
      ComplexNumbers: 'S.Complexes',
      RationalNumbers: 'S.Rationals',
      Integers: 'S.Integers',
      PositiveIntegers: 'S.Naturals',
      NonNegativeIntegers: 'S.Naturals0',
      True: 'True',
      False: 'False',
    });
  });

  it('CE_DISPLAY_NAMES', () => {
    expect(CE_DISPLAY_NAMES).toEqual({
      epsilonSymbol: '\\varepsilon',
      finalSigma: '\\varsigma',
      piSymbol: '\\varpi',
      thetaSymbol: '\\vartheta',
      rhoSymbol: '\\varrho',
      kappaSymbol: '\\varkappa',
      digamma: '\\digamma',
      ell: '\\ell',
      hBar: 'hbar',
      bet: '\\beth',
      gimel: '\\gimel',
      daleth: '\\daleth',
      aleph: '\\aleph',
      weierstrass: '\\wp',
      Real: '\\Re',
      Imaginary: '\\Im',
    });
  });
});

describe('derived ir.ts views equal the replaced literals', () => {
  it('KNOWN_HEADS', () => {
    expect(sort(KNOWN_HEADS)).toEqual(
      sort([
        'Add', 'Multiply', 'Divide', 'Negate', 'Power', 'Rational',
        'Complex', 'Norm', 'Divides', 'Lb', 'Lg', 'Zeta',
        'Derivative', 'Apply', 'Prime', 'EvaluateAt', 'InverseFunction',
        'Matrix', 'Transpose', 'ConjugateTranspose', 'Inverse',
        'Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater',
        'GreaterEqual', 'NotLess', 'NotGreater', 'NotLessEqual',
        'NotGreaterEqual', 'NotDivides', 'Implies', 'Equivalent',
        'IdenticallyEqual', 'Degrees', 'Minimum', 'Maximum',
        'Interval', 'Open', 'IntegerRange',
        'Element', 'NotElement', 'Union', 'Intersection', 'SetMinus',
        'Subset', 'SubsetEqual', 'Superset', 'SupersetEqual',
        'NotSubset', 'NotSubsetNotEqual', 'NotSuperset',
        'NotSupersetNotEqual', 'And', 'Or', 'Not', 'Which', 'Piecewise',
        'Set', 'Condition', 'Complement', 'Difference',
        'Assign', 'Def', 'Declare', 'Block', 'WhereBlock', 'Function',
        'Limits', 'Tuple', 'List', 'Subscript', 'Delimiters', 'Error',
        'call', 'MatrixMethod',
        'Integrate', 'Sum', 'Product', 'Limit', 'D', 'Determinant',
        'Congruent',
        'Sqrt', 'Root', 'Abs', 'Sign', 'Floor', 'Ceil', 'Min', 'Max',
        'Factorial', 'Gamma', 'Binomial', 'GCD', 'LCM', 'Mod',
        'Exp', 'Ln', 'Log',
        'Sin', 'Cos', 'Tan', 'Sec', 'Csc', 'Cot',
        'Sinh', 'Cosh', 'Tanh', 'Coth', 'Sech', 'Csch',
        'Arcsin', 'Arccos', 'Arctan', 'Arcsec', 'Arccsc', 'Arccot',
        'Arcsinh', 'Arccosh', 'Arctanh',
        'Conjugate', 'Real', 'Imaginary', 'Argument', 'Erf',
        'Re', 'Im', 'Arg',
      ]),
    );
  });

  it('MATRIX_WORD_OPS', () => {
    expect(sort(MATRIX_WORD_OPS)).toEqual(
      sort(['trace', 'rank', 'eigenvals', 'eigenvects', 'inverse',
        'transpose', 'norm']),
    );
  });

  it('SET_LEAF', () => {
    expect(sort(SET_LEAF)).toEqual(
      sort([
        'RealNumbers', 'RationalNumbers', 'Integers', 'Naturals',
        'ComplexNumbers', 'AlgebraicNumbers', 'ImaginaryNumbers',
        'PositiveNumbers', 'PositiveIntegers', 'NonNegativeIntegers',
        'Primes',
      ]),
    );
  });

  it('CE_CONSTANTS', () => {
    expect(sort(CE_CONSTANTS)).toEqual(
      sort([
        'Pi', 'ExponentialE', 'GoldenRatio', 'EulerGamma',
        'CatalansConstant', 'PositiveInfinity', 'NegativeInfinity',
        'ImaginaryUnit',
      ]),
    );
  });

  it('CALL_RENAMED is the old set plus the drifted builtin names', () => {
    // The old CALL_RENAMED carried its own builtin list that had
    // silently drifted from codegen's SP_BUILTIN_CALL — derived from
    // the same source, the new set restores those names ('asinh' etc.)
    // and 'Set' (present in codegen's CALL_RENAMES, absent here before).
    const expected = new Set([
      'Factorial2', 'Erf', 'Erfc', 'Conjugate',
      'Re', 'Im', 'Arg', 'Real', 'Imaginary', 'Argument',
      'Superstar', 'Congruent',
      'nCk', 'nCr', 'nPr', 'perm', 'Pi',
      'Trace', 'trace', 'tr', 'rank', 'eigenvals', 'eigenvects',
      'inverse', 'transpose', 'norm',
      'Ring', 'GoldenRatio', 'Mean', 'ForAll', 'Exists', 'Comprehension',
      'PseudoInverse', 'Superminus', 'Superplus', 'KroneckerDelta',
      'Arsinh', 'Arcosh', 'Artanh',
      'Arcsinh', 'Arccosh', 'Arctanh',
      'diff', 'integrate', 'summation', 'product',
      'Set',
      ...SP_BUILTIN_CALL,
    ]);
    expect(sort(CALL_RENAMED)).toEqual(sort(expected));
    // Every drift fix actually landed:
    for (const name of ['asinh', 'acosh', 'atanh', 'acoth', 'asech',
      'acsch', 'Set'])
      expect(CALL_RENAMED.has(name)).toBe(true);
  });
});

describe('spelling matrix', () => {
  for (const n of NOTATION.filter((x) => x.spellings !== undefined)) {
    it(`${n.name}: every declared spelling normalizes to the entry`, () => {
      const leaves: string[] = [];
      for (const s of n.spellings ?? []) {
        const { ir, ok } = normalizeIR(parseCellLatex(s));
        expect(ok, `${s} should normalize cleanly`).toBe(true);
        if (Array.isArray(ir)) {
          if (ir[0] === 'call') {
            // a call spelling is the entry's when its name is the
            // entry's canonical name or a declared call name
            const callNames = [n.name, ...(n.callNames ?? [])];
            const callName = unquote(ir[1] as string) ?? ir[1];
            expect(callNames, `${s} -> call ${ir[1]}`).toContain(callName);
          } else {
            expect(n.heads ?? [], `${s} -> ${ir[0]}`).toContain(ir[0]);
          }
        } else {
          leaves.push(String(ir));
        }
      }
      // Spellings that normalize to a leaf (x\prime -> x') must agree
      // with each other — they mint the same symbol.
      for (const l of leaves) expect(l).toBe(leaves[0]);
    });
  }
});

describe('registry probes', () => {
  for (const n of NOTATION.filter((x) => x.probes !== undefined)) {
    for (const p of n.probes ?? []) {
      it(`${n.name}: ${p.latex}`, () => {
        const out = compileWorksheet(
          [{ json: parseCellLatex(p.latex) }],
          'python',
          { importAll: false },
        );
        expect(out.cellLines[0].join('\n')).toContain(p.expect);
      });
    }
  }
});

describe('registry hygiene', () => {
  it('every smart-mode command is a registry commands spelling', () => {
    const commands = new Set(NOTATION.flatMap((n) => n.commands ?? []));
    for (const cmd of SMART_AUTO_COMMANDS.split(' '))
      expect(commands.has(cmd)).toBe(true);
  });

  it('registry names are unique', () => {
    const names = NOTATION.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
