// The single source for name metadata across the compile pipeline.
//
// Every latex command, CE head, call-position name, and leaf symbol that
// carries emission meaning is listed here exactly once — each entry says
// which spellings map onto it and which emission tiers it participates
// in. codegen's SP_FUNCS family and ir.ts's KNOWN_HEADS / CALL_RENAMED /
// SET_LEAF / CE_CONSTANTS / MATRIX_WORD_OPS are derived views over the
// table (mechanical filters at the bottom of the file), so adding a
// notation can no longer "fix the op, forget the mirror."
//
// Entries carry names, kinds, and metadata only — emission control flow
// (Integrate, Comprehension, ForAll, the call-tier name branches) stays
// in codegen. `note` keeps the rationale comments the old tables held.

export interface SetConstraint {
  kwargs: string[];
  preds: string[];
}

export interface Notation {
  /** Registry key — the canonical name. For head entries, the CE head;
   *  for leaf/call-only entries, that name itself. */
  name: string;
  /** CE head(s) the normalizer passes through to codegen — contributes
   *  head -> sympy to SP_FUNCS and the names to KNOWN_HEADS. Used for
   *  twin heads sharing one emission ('Re' + 'Real'). */
  heads?: string[];
  /** Other names resolving to this notation in `call` position
   *  ('nCk', 'perm', 'Trace' beside 'trace') — joins CALL_RENAMED and,
   *  when a sympy target exists, CALL_RENAMES / MATRIX_METHODS keys. */
  callNames?: string[];
  /** Marks `name` (or `heads`) as legitimate `call`-position names —
   *  gates CALL_RENAMED membership; with a sympy target they also land
   *  in CALL_RENAMES. */
  callTier?: boolean;
  /** SymPy emission for call position — defaults to `sympy`. */
  callSympy?: string;
  /** SymPy emission name for head position — unqualified ('sqrt',
   *  'Min', 'S.Reals'); the `sp.` qualifier applies per scope. */
  sympy?: string;
  /** SymPy name when a head sits inside InverseFunction (\sin^{-1}). */
  inverse?: string;
  /** Minimum arity before the head's sympy call emits — under-arity
   *  calls flag instead of producing a SymPy TypeError. */
  minArgs?: number;
  /** Matrix-method emission on a matrix operand ('trace()', 'inv()',
   *  'T') — fills MATRIX_METHODS for `name` + `callNames`. */
  matrixMethod?: string;
  /** Juxtaposition word spellings ir.ts fuses onto a matrix operand
   *  ('\mathrm{trace} M' -> a MatrixMethod node) — MATRIX_WORD_OPS. */
  wordOps?: string[];
  /** Latex command spellings — data for completion/autoCommand checks
   *  and the spelling audit (e.g. '\tr' -> tr). */
  commands?: string[];
  /** Leaf symbol -> SymPy constant emission ('pi', 'S.Reals'). */
  constant?: string;
  /** CE-constant flag — `i` beside one reads as the imaginary unit. */
  ceConstant?: boolean;
  /** Leaf-set emission template — '{sp}' marks the qualifier slot, e.g.
   *  '{sp}Interval.open(0, {sp}oo)'. */
  leafSet?: string;
  /** Provably emits a SymPy Set — gates Element/Union/Complement. */
  setish?: boolean;
  /** Set leaf Superplus/Superminus may decorate (S^{+}/S^{-}). */
  setLeaf?: boolean;
  /** Membership assumption the leaf implies for its symbol. */
  constraint?: SetConstraint;
  /** Latex the printer should show for the CE leaf name
   *  ('epsilonSymbol' -> \varepsilon). */
  display?: string;
  /** Palette completion generated for this notation's insertion alias. */
  completion?: { name: string; hint?: string; preview?: string };
  /** Alternate latex spellings that normalize to this notation's
   *  canonical head (a `heads` member) or to a `call` on one of its
   *  call-position names — the spelling matrix iterates them. Spellings
   *  that normalize to a leaf instead (x\prime -> x') must all produce
   *  the same leaf. */
  spellings?: string[];
  /** Compile probes — each `latex` emits `import sympy as sp` code
   *  containing `expect`. */
  probes?: { latex: string; expect: string }[];
  /** Why the entry exists — the rationale the old tables carried. */
  note?: string;
}

export const NOTATION: Notation[] = [
  // — arithmetic / algebra function heads —
  {
    name: 'Sqrt',
    heads: ['Sqrt'],
    sympy: 'sqrt',
    commands: ['sqrt'],
    spellings: ['\\sqrt{x}', '\\sqrt x'],
    probes: [{ latex: '\\sqrt{x}', expect: 'sp.sqrt(x)' }],
  },
  { name: 'Root', heads: ['Root'], sympy: 'root', minArgs: 1 },
  {
    name: 'Abs',
    heads: ['Abs'],
    sympy: 'Abs',
    spellings: ['|x|', '\\left|x\\right|', '\\operatorname{abs}(x)'],
  },
  { name: 'Sign', heads: ['Sign'], sympy: 'sign' },
  {
    name: 'Floor',
    heads: ['Floor'],
    sympy: 'floor',
    spellings: ['\\lfloor x\\rfloor', '\\operatorname{floor}(x)'],
  },
  {
    name: 'Ceil',
    heads: ['Ceil'],
    sympy: 'ceiling',
    spellings: ['\\lceil x\\rceil', '\\operatorname{ceil}(x)'],
  },
  {
    name: 'Min',
    heads: ['Min'],
    sympy: 'Min',
    minArgs: 1,
    commands: ['min'],
    spellings: ['\\min(a,b)', '\\operatorname{min}(a,b)'],
    probes: [{ latex: '\\min(a,b)', expect: 'sp.Min(a, b)' }],
  },
  {
    name: 'Max',
    heads: ['Max'],
    sympy: 'Max',
    minArgs: 1,
    commands: ['max'],
    spellings: ['\\max(a,b)', '\\operatorname{max}(a,b)'],
  },
  // \min_{x} f / \max_{x} f — the underscript forms lower to
  // sp.minimum/sp.maximum in codegen.
  { name: 'Minimum', heads: ['Minimum'] },
  { name: 'Maximum', heads: ['Maximum'] },
  {
    name: 'Factorial',
    heads: ['Factorial'],
    sympy: 'factorial',
    probes: [{ latex: 'n!', expect: 'sp.factorial(n)' }],
  },
  {
    name: 'Factorial2',
    callTier: true,
    callSympy: 'factorial2',
    note: 'x!! — a call-position name only, never a canonical head',
  },
  { name: 'Gamma', heads: ['Gamma'], sympy: 'gamma' },
  {
    name: 'Binomial',
    heads: ['Binomial'],
    sympy: 'binomial',
    minArgs: 2,
    callNames: ['nCk', 'nCr'],
    commands: ['binom'],
    spellings: [
      '\\binom{n}{k}',
      '\\operatorname{nCk}(n,k)',
    ],
    probes: [{ latex: '\\binom{n}{k}', expect: 'sp.binomial(n, k)' }],
    note: 'nCk/nCr are combinatorics spellings of C(n,k). '
      + '\\operatorname{nCr} normalizes to call `Choose`, which nothing '
      + 'maps — it is not a spelling here (it flags unknown-head)',
  },
  {
    name: 'GCD',
    heads: ['GCD'],
    sympy: 'gcd',
    minArgs: 2,
    commands: ['gcd'],
    spellings: ['\\gcd(6,8)', '\\operatorname{gcd}(6,8)'],
    probes: [{ latex: '\\gcd(6,8)', expect: 'sp.gcd(6, 8)' }],
  },
  {
    name: 'LCM',
    heads: ['LCM'],
    sympy: 'lcm',
    minArgs: 2,
  },
  {
    name: 'Mod',
    heads: ['Mod'],
    sympy: 'Mod',
    minArgs: 2,
    probes: [{ latex: 'x \\bmod y', expect: 'sp.Mod(x, y)' }],
  },
  {
    name: 'Exp',
    heads: ['Exp'],
    sympy: 'exp',
    inverse: 'log',
    commands: ['exp'],
    spellings: ['\\exp(x)', '\\exp x'],
  },
  {
    name: 'Ln',
    heads: ['Ln'],
    sympy: 'log',
    inverse: 'exp',
    commands: ['ln'],
    spellings: ['\\ln(x)', '\\ln x'],
  },
  {
    name: 'Log',
    heads: ['Log'],
    inverse: 'exp',
    commands: ['log'],
    spellings: ['\\log(x)', '\\log x'],
    note: 'Log(x, b) lowers to the change-of-base quotient — no flat '
      + 'sympy name, so no `sympy` field',
  },

  // — trigonometric —
  {
    name: 'Sin',
    heads: ['Sin'],
    sympy: 'sin',
    inverse: 'asin',
    commands: ['sin'],
    spellings: ['\\sin(x)', '\\sin x'],
    probes: [{ latex: '\\sin^{-1}(x)', expect: 'sp.asin(x)' }],
  },
  {
    name: 'Cos',
    heads: ['Cos'],
    sympy: 'cos',
    inverse: 'acos',
    commands: ['cos'],
    spellings: ['\\cos(x)', '\\cos x'],
  },
  {
    name: 'Tan',
    heads: ['Tan'],
    sympy: 'tan',
    inverse: 'atan',
    commands: ['tan'],
    spellings: ['\\tan(x)', '\\tan x'],
  },
  {
    name: 'Sec',
    heads: ['Sec'],
    sympy: 'sec',
    inverse: 'asec',
    commands: ['sec'],
    spellings: ['\\sec(x)', '\\sec x'],
  },
  {
    name: 'Csc',
    heads: ['Csc'],
    sympy: 'csc',
    inverse: 'acsc',
    commands: ['csc'],
    spellings: ['\\csc(x)', '\\csc x'],
  },
  {
    name: 'Cot',
    heads: ['Cot'],
    sympy: 'cot',
    inverse: 'acot',
    commands: ['cot'],
    spellings: ['\\cot(x)', '\\cot x'],
  },
  {
    name: 'Sinh',
    heads: ['Sinh'],
    sympy: 'sinh',
    inverse: 'asinh',
    commands: ['sinh'],
    spellings: ['\\sinh(x)', '\\sinh x'],
  },
  {
    name: 'Cosh',
    heads: ['Cosh'],
    sympy: 'cosh',
    inverse: 'acosh',
    commands: ['cosh'],
    spellings: ['\\cosh(x)', '\\cosh x'],
  },
  {
    name: 'Tanh',
    heads: ['Tanh'],
    sympy: 'tanh',
    inverse: 'atanh',
    commands: ['tanh'],
    spellings: ['\\tanh(x)', '\\tanh x'],
  },
  {
    name: 'Coth',
    heads: ['Coth'],
    sympy: 'coth',
    inverse: 'acoth',
    spellings: ['\\coth(x)', '\\coth x'],
  },
  {
    name: 'Sech',
    heads: ['Sech'],
    sympy: 'sech',
    inverse: 'asech',
    spellings: ['\\sech(x)', '\\sech x'],
  },
  {
    name: 'Csch',
    heads: ['Csch'],
    sympy: 'csch',
    inverse: 'acsch',
    spellings: ['\\csch(x)', '\\csch x'],
  },
  {
    name: 'Arcsin',
    heads: ['Arcsin'],
    sympy: 'asin',
    commands: ['arcsin'],
    spellings: ['\\arcsin(x)', '\\arcsin x', '\\operatorname{asin}(x)'],
  },
  {
    name: 'Arccos',
    heads: ['Arccos'],
    sympy: 'acos',
    commands: ['arccos'],
    spellings: ['\\arccos(x)', '\\arccos x', '\\operatorname{acos}(x)'],
  },
  {
    name: 'Arctan',
    heads: ['Arctan'],
    sympy: 'atan',
    commands: ['arctan'],
    spellings: ['\\arctan(x)', '\\arctan x', '\\operatorname{atan}(x)'],
  },
  { name: 'Arcsec', heads: ['Arcsec'], sympy: 'asec' },
  { name: 'Arccsc', heads: ['Arccsc'], sympy: 'acsc' },
  { name: 'Arccot', heads: ['Arccot'], sympy: 'acot' },
  {
    name: 'Arcsinh',
    heads: ['Arcsinh'],
    sympy: 'asinh',
    callTier: true,
  },
  {
    name: 'Arccosh',
    heads: ['Arccosh'],
    sympy: 'acosh',
    callTier: true,
  },
  {
    name: 'Arctanh',
    heads: ['Arctanh'],
    sympy: 'atanh',
    callTier: true,
  },
  {
    name: 'Arsinh',
    callTier: true,
    callSympy: 'asinh',
    note: '\\operatorname{arsinh}-family — sympy spells them a-prefixed; '
      + 'the bare name displayed `Arsinh(x)` unevaluated',
  },
  { name: 'Arcosh', callTier: true, callSympy: 'acosh' },
  { name: 'Artanh', callTier: true, callSympy: 'atanh' },

  // — complex / misc function heads —
  {
    name: 'Conjugate',
    heads: ['Conjugate'],
    sympy: 'conjugate',
    callTier: true,
    probes: [{ latex: '\\overline{z}', expect: 'sp.conjugate(z)' }],
    note: '\\overline{z}',
  },
  {
    name: 'Real',
    heads: ['Re', 'Real'],
    sympy: 're',
    callTier: true,
    display: '\\Re',
    spellings: [
      '\\operatorname{Re}(z)',
      '\\Re(z)',
      '\\Re z',
    ],
    note: '\\Re alone is a leaf — the display prints \\Re, not re()',
  },
  {
    name: 'Imaginary',
    heads: ['Im', 'Imaginary'],
    sympy: 'im',
    callTier: true,
    display: '\\Im',
    spellings: [
      '\\operatorname{Im}(z)',
      '\\Im(z)',
      '\\Im z',
    ],
    probes: [{ latex: '\\Im(z)', expect: 'sp.im(z)' }],
    note: 'lowercase \\operatorname{im} is deliberately NOT renamed — '
      + 'it is the image of a function, not sp.im; \\operatorname{Im} z '
      + 'without parens multiplies, so it is not a spelling',
  },
  {
    name: 'Argument',
    heads: ['Arg', 'Argument'],
    sympy: 'arg',
    callTier: true,
    spellings: [
      '\\operatorname{Arg}(z)',
      '\\arg(z)',
      '\\arg z',
    ],
  },
  {
    name: 'Erf',
    heads: ['Erf'],
    sympy: 'erf',
    callTier: true,
    probes: [{ latex: '\\operatorname{erf}(x)', expect: 'sp.erf(x)' }],
    note: '\\operatorname{erf}(x) reaches call position too — sp.Erf '
      + 'does not exist and raised a "has no attribute" error row',
  },
  { name: 'Erfc', callTier: true, callSympy: 'erfc' },

  // — matrix word-ops (\mathrm{trace} M fuses in ir.ts; the rest reach
  //   codegen as call names and emit the same method) —
  {
    name: 'trace',
    callNames: ['Trace', 'tr'],
    matrixMethod: 'trace()',
    wordOps: ['trace'],
    commands: ['tr'],
    completion: { name: 'tr', hint: 'matrix trace', preview: '\\mathrm{tr} A' },
    spellings: [
      '\\mathrm{tr}(A)',
      '\\operatorname{tr}(A)',
      '\\mathrm{Trace}(A)',
      '\\text{tr}(A)',
      '\\mathrm{trace}(A)',
      '\\mathrm{tr} A',
    ],
    probes: [
      {
        latex: '\\mathrm{tr}(\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix})',
        expect: '.trace()',
      },
    ],
    note: '\\tr is an insertion alias expanding to \\mathrm{tr}',
  },
  {
    name: 'rank',
    matrixMethod: 'rank()',
    wordOps: ['rank'],
    spellings: ['\\mathrm{rank}(A)', '\\operatorname{rank}(A)', '\\text{rank}(A)'],
  },
  {
    name: 'eigenvals',
    matrixMethod: 'eigenvals()',
    wordOps: ['eigenvals'],
    spellings: ['\\mathrm{eigenvals}(A)', '\\operatorname{eigenvals}(A)'],
  },
  {
    name: 'eigenvects',
    matrixMethod: 'eigenvects()',
    wordOps: ['eigenvects'],
    spellings: ['\\mathrm{eigenvects}(A)', '\\operatorname{eigenvects}(A)'],
  },
  {
    name: 'inverse',
    matrixMethod: 'inv()',
    wordOps: ['inverse'],
    spellings: ['\\mathrm{inverse}(A)', '\\operatorname{inverse}(A)'],
  },
  {
    name: 'transpose',
    matrixMethod: 'T',
    wordOps: ['transpose'],
    spellings: ['\\mathrm{transpose}(A)', '\\operatorname{transpose}(A)'],
  },
  {
    name: 'norm',
    matrixMethod: 'norm()',
    wordOps: ['norm'],
    spellings: ['\\mathrm{norm}(A)', '\\operatorname{norm}(A)'],
  },

  // — constants and leaf sets —
  {
    name: 'Pi',
    constant: 'pi',
    ceConstant: true,
    callTier: true,
    callSympy: 'primepi',
    commands: ['pi'],
    note: '\\pi(n) reads as the prime-counting function — the call maps '
      + 'to primepi while the leaf stays pi',
  },
  { name: 'ExponentialE', constant: 'E', ceConstant: true },
  { name: 'ImaginaryUnit', constant: 'I', ceConstant: true },
  {
    name: 'PositiveInfinity',
    constant: 'oo',
    ceConstant: true,
    commands: ['infty'],
  },
  {
    name: 'NegativeInfinity',
    constant: '-oo',
    ceConstant: true,
  },
  { name: 'EulerGamma', constant: 'EulerGamma', ceConstant: true },
  { name: 'CatalansConstant', constant: 'Catalan', ceConstant: true },
  {
    name: 'GoldenRatio',
    constant: 'GoldenRatio',
    ceConstant: true,
    callTier: true,
    note: '\\varphi(n) reads as sp.totient(n) through the call branch',
  },
  { name: 'EmptySet', constant: 'EmptySet', setish: true },
  // True/False are Python builtins — emitted unqualified in both modes.
  { name: 'True', constant: 'True' },
  { name: 'False', constant: 'False' },

  {
    name: 'RealNumbers',
    constant: 'S.Reals',
    setish: true,
    setLeaf: true,
    constraint: { kwargs: ['real=True'], preds: ['real'] },
  },
  {
    name: 'ComplexNumbers',
    constant: 'S.Complexes',
    setish: true,
    setLeaf: true,
    constraint: { kwargs: ['complex=True'], preds: ['complex'] },
  },
  {
    name: 'RationalNumbers',
    constant: 'S.Rationals',
    setish: true,
    setLeaf: true,
    constraint: { kwargs: ['rational=True'], preds: ['rational'] },
  },
  {
    name: 'Integers',
    constant: 'S.Integers',
    setish: true,
    setLeaf: true,
    constraint: { kwargs: ['integer=True'], preds: ['integer'] },
  },
  {
    name: 'NonNegativeIntegers',
    constant: 'S.Naturals0',
    leafSet: '{sp}S.Naturals0',
    setish: true,
    setLeaf: true,
    constraint: {
      kwargs: ['integer=True', 'nonnegative=True'],
      preds: ['integer', 'nonnegative'],
    },
  },
  {
    name: 'PositiveIntegers',
    constant: 'S.Naturals',
    leafSet: '{sp}S.Naturals',
    setish: true,
    setLeaf: true,
    constraint: {
      kwargs: ['integer=True', 'positive=True'],
      preds: ['integer', 'positive'],
    },
  },
  {
    name: 'NegativeIntegers',
    leafSet: '{sp}Intersection({sp}S.Integers, {sp}Interval.open(-{sp}oo, 0))',
    setish: true,
  },
  {
    name: 'NonPositiveIntegers',
    leafSet: '{sp}Intersection({sp}S.Integers, {sp}Interval(-{sp}oo, 0))',
    setish: true,
  },
  {
    name: 'Primes',
    setish: true,
    setLeaf: true,
    constraint: { kwargs: ['prime=True'], preds: ['prime'] },
    note: '\\mathbb{P} has no S.* constant — membership emits a '
      + 'ConditionSet in codegen',
  },
  {
    name: 'PositiveNumbers',
    leafSet: '{sp}Interval.open(0, {sp}oo)',
    setish: true,
    setLeaf: true,
    constraint: { kwargs: ['positive=True'], preds: ['positive'] },
    note: '\\mathbb{R}_+ — an interval, not an S.* set',
  },
  {
    name: 'NegativeNumbers',
    leafSet: '{sp}Interval.open(-{sp}oo, 0)',
    setish: true,
  },
  {
    name: 'NonNegativeNumbers',
    leafSet: '{sp}Interval(0, {sp}oo)',
    setish: true,
  },
  {
    name: 'NonPositiveNumbers',
    leafSet: '{sp}Interval(-{sp}oo, 0)',
    setish: true,
  },
  // Set leaves with no emission metadata of their own — Superplus/
  // Superminus may still decorate them (S^{+}/S^{-}).
  { name: 'Naturals', setLeaf: true },
  { name: 'AlgebraicNumbers', setLeaf: true },
  { name: 'ImaginaryNumbers', setLeaf: true },

  // — calculus / statement heads: emission is bespoke code in codegen,
  //   the registry rows carry just the head + latex commands —
  {
    name: 'Integrate',
    heads: ['Integrate'],
    commands: ['int', 'iint', 'iiint', 'antid'],
    spellings: [
      '\\int x\\,dx',
      '\\antid x\\,dx',
      '\\int_{a}^{b} x\\,dx',
      '\\iint_{a}^{b} x\\,dx',
    ],
    probes: [
      {
        latex: '\\int_{a}^{b} x\\,dx',
        expect: 'sp.integrate(x, (x, a, b))',
      },
      {
        latex: '\\int x^2 dx',
        expect: 'sp.integrate(x**2, x) + sp.Symbol("C")',
      },
    ],
    note: '\\antid is an insertion alias — ir.ts maps it to \\int '
      + 'before ce.parse (CE has no \\antid); \\iint parses natively. '
      + 'Beware \\iint x\\,dx\\,dy — the extra dv makes it a nested '
      + 'integral, not a spelling of \\int x\\,dx\\,dy',
  },
  {
    name: 'Sum',
    heads: ['Sum'],
    commands: ['sum'],
    spellings: ['\\sum i', '\\sum_{i} i', '\\sum_{i=0}^{n} i'],
    probes: [
      { latex: '\\sum_{i=0}^{n} i', expect: 'sp.summation(i, (i, 0, n))' },
    ],
  },
  {
    name: 'Product',
    heads: ['Product'],
    commands: ['prod'],
    spellings: ['\\prod k', '\\prod_{k=1}^{n} k'],
    probes: [
      { latex: '\\prod_{k=1}^{n} k', expect: 'sp.product(k, (k, 1, n))' },
    ],
  },
  {
    name: 'Limit',
    heads: ['Limit'],
    commands: ['lim'],
    spellings: ['\\lim_{x\\to 0} f(x)', '\\lim_{x\\to\\infty} \\frac{1}{x}'],
    probes: [
      {
        latex: '\\lim_{x\\to 0} f(x)',
        expect: "sp.limit(f * x, x, 0, dir='+-')",
      },
    ],
  },
  {
    name: 'D',
    heads: ['D'],
    commands: ['derivative'],
    spellings: ['\\frac{d}{d x} x^2', '\\frac{d^2}{d x^2} x^3'],
    probes: [{ latex: '\\frac{d}{dx} x^2', expect: 'sp.diff(x**2, x)' }],
    note: '\\derivative expands at insertion to real \\frac{d }{d } '
      + 'atoms — there is no D command in the field',
  },
  {
    name: 'Def',
    heads: ['Def'],
    commands: ['def'],
    probes: [
      { latex: '\\text{def} f(x) = x^2 + 1', expect: 'def f(x):' },
    ],
    note: '\\def is an insertion alias for the \\text{def} statement '
      + 'marker',
  },
  {
    name: 'Determinant',
    heads: ['Determinant'],
    commands: ['det'],
    spellings: ['\\det(A)', '\\det A'],
    probes: [{ latex: '\\det(A)', expect: 'sp.Determinant(A)' }],
  },
  // `x'` parses to a distinct leaf symbol, not a Derivative head — the
  // spelling pair pins that both prime syntaxes mint the same leaf.
  {
    name: 'Prime',
    heads: ['Prime'],
    commands: ['prime'],
    spellings: ['x\\prime', 'x^{\\prime}'],
  },

  // — call-position names with bespoke branches in codegen (real
  //   emissions or self-flagged degradations — either way, not
  //   "unknown head") —
  { name: 'Set', heads: ['Set'], callTier: true, callSympy: 'FiniteSet' },
  {
    name: 'Superstar',
    callTier: true,
    callSympy: 'Adjoint',
    spellings: ['x^*', 'x^{*}'],
    probes: [{ latex: 'x^*', expect: 'sp.conjugate(x)' }],
    note: 'x^{*} — the conjugate/adjoint',
  },
  {
    name: 'Congruent',
    heads: ['Congruent'],
    callTier: true,
    callSympy: 'Congruent',
    probes: [
      { latex: 'a \\equiv b \\pmod{m}', expect: 'sp.Eq(sp.Mod(a, m), b)' },
    ],
    note: 'a ≡ b (mod m) — codegen\'s call branch lowers the 4-arg form; '
      + 'the rename keeps the rest as sp.Congruent, not a worksheet fn',
  },
  { name: 'Ring', callTier: true },
  { name: 'Mean', callTier: true },
  { name: 'ForAll', callTier: true },
  { name: 'Exists', callTier: true },
  { name: 'Comprehension', callTier: true },
  { name: 'PseudoInverse', callTier: true },
  { name: 'Superminus', callTier: true },
  { name: 'Superplus', callTier: true },
  { name: 'KroneckerDelta', callTier: true },
  {
    name: 'nPr',
    callTier: true,
    callSympy: 'ff',
    note: 'P(n,k) — the falling factorial',
  },
  { name: 'perm', callTier: true, callSympy: 'ff' },

  // — leaf display names: the CE name doesn't print like the latex the
  //   user typed —
  { name: 'epsilonSymbol', display: '\\varepsilon' },
  { name: 'finalSigma', display: '\\varsigma' },
  { name: 'piSymbol', display: '\\varpi' },
  { name: 'thetaSymbol', display: '\\vartheta' },
  { name: 'rhoSymbol', display: '\\varrho' },
  { name: 'kappaSymbol', display: '\\varkappa' },
  { name: 'digamma', display: '\\digamma' },
  { name: 'ell', display: '\\ell' },
  {
    name: 'hBar',
    display: 'hbar',
    note: 'hbar not \\hbar — sympy\'s printer knows the name and emits '
      + '\\hbar; a literal \\hbar name accent-splits to \\bar{\\h}',
  },
  { name: 'bet', display: '\\beth' },
  { name: 'gimel', display: '\\gimel' },
  { name: 'daleth', display: '\\daleth' },
  { name: 'aleph', display: '\\aleph' },
  { name: 'weierstrass', display: '\\wp' },
  // \theta — a bare glyph with no emission metadata; carried so the
  // smart-mode command list has a home.
  { name: 'theta', commands: ['theta'] },
];

// `call` heads that are real SymPy functions — codegen keeps emitting
// `sp.<name>` for them; every other applied unknown name (f(x),
// \operatorname{foo}(x)) becomes a worksheet Function def instead
// (`sp.f(x)` raised AttributeError at eval time). Flat list — these
// carry no other metadata so a row each would be noise.
export const SP_BUILTIN_CALL = new Set(
  (
    'erf erfc erfi erfinv erfcinv Ei expint Si Ci Shi Chi li Li zeta ' +
    'lerchphi polylog digamma trigamma polygamma loggamma beta betainc ' +
    'lowergamma uppergamma LambertW besselj bessely besseli besselk ' +
    'hankel1 hankel2 jn yn airyai airybi airyaiprime airybiprime ' +
    'marcumq fresnels fresnelc hyper meijerg appellf1 legendre ' +
    'assoc_legendre hermite hermite_prob chebyshevt chebyshevu ' +
    'gegenbauer jacobi laguerre assoc_laguerre fibonacci lucas ' +
    'tribonacci bernoulli euler bell catalan harmonic genocchi ' +
    'partition primepi mobius totient reduced_totient divisor_sigma ' +
    'nextprime prevprime prime isprime factorint divisors ' +
    'divisor_count proper_divisor_count primefactors integer_nthroot ' +
    'cbrt gcdex ' +
    'legendre_symbol jacobi_symbol kronecker_symbol rf ff factorial2 ' +
    'subfactorial Piecewise ' +
    'sign ceiling conjugate arg re im ' +
    'gcd lcm binomial sqrt floor factorial ' +
    'asinh acosh atanh acoth asech acsch ' +
    'solve solveset linsolve nonlinsolve simplify factor expand cancel ' +
    'collect apart together trigsimp expand_trig powsimp nsimplify ' +
    'radsimp ratsimp fraction limit series residue solve_linear ' +
    'diff integrate summation product '
  ).split(' '),
);

// IR-vocabulary heads the normalizer passes through that carry no
// notation metadata — statement forms, relations, structural wrappers.
// KNOWN_HEADS = these plus every registry `heads`.
const STRUCTURAL_HEADS = [
  // arithmetic / algebra shapes codegen handles positionally
  'Add', 'Multiply', 'Divide', 'Negate', 'Power', 'Rational', 'Complex',
  'Norm', 'Divides', 'Lb', 'Lg', 'Zeta',
  // calculus machinery
  'Derivative', 'Apply', 'EvaluateAt', 'InverseFunction',
  // linear algebra
  'Matrix', 'Transpose', 'ConjugateTranspose', 'Inverse',
  // relations / logic / piecewise
  'Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual',
  'NotLess', 'NotGreater', 'NotLessEqual', 'NotGreaterEqual',
  'NotDivides', 'Implies', 'Equivalent', 'IdenticallyEqual', 'Degrees',
  'Interval', 'Open', 'IntegerRange',
  // set operators — codegen emits real SymPy when operands are
  // set-like, and the same flagged Function stub as before otherwise
  'Element', 'NotElement', 'Union', 'Intersection', 'SetMinus',
  'Subset', 'SubsetEqual', 'Superset', 'SupersetEqual',
  'NotSubset', 'NotSubsetNotEqual', 'NotSuperset', 'NotSupersetNotEqual',
  'And', 'Or', 'Not', 'Which', 'Piecewise',
  // 'Condition' is a Set literal's predicate child
  'Condition', 'Complement', 'Difference',
  // statement-level IR
  'Assign', 'Declare', 'Block', 'WhereBlock', 'Function',
  // verbatim \python{...} source — codegen emits it uninterpreted
  'PythonSource',
  // structural helpers — 'call' marks a node already escaped by the
  // normalizer; without it a nested g(f(x)) re-wraps into
  // ['call', 'call', ...]
  'Limits', 'Tuple', 'List', 'Subscript', 'Delimiters', 'Error', 'call',
  // MatrixMethod lowers `trace(A)`-style word applications on a matrix
  // literal to `(<matrix>).trace()` in codegen
  'MatrixMethod',
];

// ————————————————————————————————————————————————————————————————————
// Derived views — every consumer table is a mechanical projection of
// NOTATION, so a name is written exactly once.
// ————————————————————————————————————————————————————————————————————

const headsOf = (n: Notation): string[] => n.heads ?? [];
// Call-position names an entry owns: `heads` (or `name` for leaf/call
// entries) when callTier, plus explicit callNames.
const callHeadsOf = (n: Notation): string[] =>
  n.callTier ? (n.heads !== undefined ? n.heads : [n.name]) : [];

// — codegen views —

// Known function heads -> the SymPy function name to call.
export const SP_FUNCS: Record<string, string> = Object.fromEntries(
  NOTATION.flatMap((n) =>
    n.sympy === undefined
      ? []
      : headsOf(n).map((h) => [h, n.sympy as string] as const),
  ),
);

// CE head names that exist in SymPy under a different spelling — `call`
// resolves these to `sp.<mapped>` rather than a declared worksheet
// function.
export const CALL_RENAMES: Record<string, string> = Object.fromEntries(
  NOTATION.flatMap((n) => {
    const target = n.callSympy ?? n.sympy;
    if (target === undefined) return [];
    return [...callHeadsOf(n), ...(n.callNames ?? [])].map(
      (c) => [c, target] as const,
    );
  }),
);

// \sin^{-1}(x) etc.: CE wraps the base name as ['InverseFunction', 'Sin'].
export const INVERSE_FUNCS: Record<string, string> = Object.fromEntries(
  NOTATION.flatMap((n) =>
    n.inverse === undefined
      ? []
      : headsOf(n).map((h) => [h, n.inverse as string] as const),
  ),
);

// Minimum arity — a lone `\gcd(10)` or `a\bmod` otherwise emits a call
// SymPy raises TypeError on at eval time. Keyed by the sympy name.
export const SP_FUNC_MIN_ARGS: Record<string, number> = Object.fromEntries(
  NOTATION.filter(
    (n) => n.minArgs !== undefined && n.sympy !== undefined,
  ).map((n) => [n.sympy as string, n.minArgs as number] as const),
);

// Matrix word ops emitted as method calls (`\mathrm{trace}(A)` ->
// `(A).trace()`); CE may capitalize `tr` -> `Trace`.
export const MATRIX_METHODS: Record<string, string> = Object.fromEntries(
  NOTATION.flatMap((n) =>
    n.matrixMethod === undefined
      ? []
      : [n.name, ...(n.callNames ?? [])].map(
          (h) => [h, n.matrixMethod as string] as const,
        ),
  ),
);

// Nodes that provably emit a SymPy Set — used to gate Element/Union/
// Complement emission (those raise TypeError on plain Symbols).
export const SETISH_SYMBOLS = new Set(
  NOTATION.filter((n) => n.setish).map((n) => n.name),
);

// CE constants -> SymPy names (unqualified — the `sp.` prefix is applied
// per-emission via the emitter's `sp` getter so `from sympy import *`
// mode emits bare names). `True`/`False` are Python builtins and stay
// unqualified in both modes.
export const CONSTANTS: Record<string, string> = Object.fromEntries(
  NOTATION.filter((n) => n.constant !== undefined).map(
    (n) => [n.name, n.constant as string] as const,
  ),
);

// \mathbb{S}^{+/-/_+/_-}-style leaf sets CE emits as plain symbol names
// (CONSTANTS can only hold one-segment S.* names — these are intervals
// or integer intersections). Templates fill the `sp.` qualifier slot so
// names can't drift out of qualification.
export const LEAF_SETS: Record<string, (sp: string) => string> =
  Object.fromEntries(
    NOTATION.filter((n) => n.leafSet !== undefined).map((n) => {
      const tpl = n.leafSet as string;
      return [n.name, (sp: string) => tpl.replaceAll('{sp}', sp)] as const;
    }),
  );

// Domain a leaf membership implies for its symbol: `x \in \mathbb{R}`
// constructs `x = Symbol('x', real=True)` when x is first defined.
// `kwargs` go to the Symbol constructor, `preds` are the Q-predicate
// names for a `with assuming(...)` block (compound sets only — leaf
// sets don't need one once the Symbol carries the assumption).
export const SET_CONSTRAINTS: Record<
  string,
  { kwargs: string[]; preds: string[] }
> = Object.fromEntries(
  NOTATION.filter((n) => n.constraint !== undefined).map(
    (n) => [n.name, n.constraint as SetConstraint] as const,
  ),
);

// CE leaf names that don't print like the latex the user typed —
// `\varepsilon` mints `Symbol("epsilonSymbol")`, showing the word
// "epsilonSymbol". Map to a latex name the printer renders as the
// intended glyph.
export const CE_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  NOTATION.filter((n) => n.display !== undefined).map(
    (n) => [n.name, n.display as string] as const,
  ),
);

// — ir.ts views —

// Heads the normalizer understands and passes through (children still
// get normalized): the registry's heads plus the structural vocabulary.
// Anything else becomes `['call', head, ...]` so codegen emits
// `sp.<head>(...)` — the escape hatch that keeps users unblocked by CE
// vocabulary gaps.
export const KNOWN_HEADS = new Set([
  ...NOTATION.flatMap(headsOf),
  ...STRUCTURAL_HEADS,
]);

// Unknown-head names that have a real handling as `call` heads —
// renames (CALL_RENAMES), matrix word-ops, and codegen's call-tier name
// branches — plus the SP_BUILTIN_CALL list. They still become `call`
// nodes, but without the "unknown head" note.
export const CALL_RENAMED = new Set(
  NOTATION.flatMap((n) => [
    ...callHeadsOf(n),
    ...(n.callNames ?? []),
    ...(n.wordOps ?? []),
    ...(n.matrixMethod !== undefined ? [n.name] : []),
  ]),
);
for (const b of SP_BUILTIN_CALL) CALL_RENAMED.add(b);

// Words that read as matrix operations when juxtaposed with a matrix
// literal: `\mathrm{trace}(A)` etc. — codegen lowers them to method
// calls on the emitted Matrix.
export const MATRIX_WORD_OPS = new Set(
  NOTATION.flatMap((n) => n.wordOps ?? []),
);

// Set leaf names that Superplus/Superminus may decorate — S^{+}/S^{-}
// for a standard set maps to the positive/negative half.
export const SET_LEAF = new Set(
  NOTATION.filter((n) => n.setLeaf).map((n) => n.name),
);

// CE constant names — `i` beside one of these (or a number) is the
// imaginary unit, not a symbol (`e^{i\pi}`, `\pi i`); `xi` stays a
// symbol.
export const CE_CONSTANTS = new Set(
  NOTATION.filter((n) => n.ceConstant).map((n) => n.name),
);


