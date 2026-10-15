// Help-topic catalog for the "How do I…" section. `featured` topics
// appear in the list by default; every topic is reachable through the
// section's search and can be pinned into the list or hidden from it.
// `how` is the keystroke text shown regardless of Smart mode;
// `smart`/`plain` split the text on it (smart when on, plain when off).
// `insert` is a latex string written into the active cell (via mq.cmd)
// when the topic is Entered/clicked in the help search — omitted for
// family/UI topics where no single input makes sense (Greek letters,
// arrows, the Command palette); those fall back to pinning.
export interface HelpTopic {
  id: string;
  goal: string;
  keywords?: string;
  how?: string;
  smart?: string;
  plain?: string;
  insert?: string;
  featured?: boolean;
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'fraction',
    insert: '\\frac',
    goal: 'Fraction',
    keywords: 'divide numerator denominator over',
    how: 'type 1/2 or \\frac ⏎',
    featured: true,
  },
  {
    id: 'subsup',
    goal: 'Subscript / superscript',
    keywords: 'sub super script power exponent index',
    smart: 'x2 or _ or ^',
    plain: '_ or ^',
    featured: true,
  },
  {
    id: 'sqrt',
    insert: '\\sqrt',
    goal: 'Square root',
    keywords: 'radical nth root nthroot',
    smart: 'sqrt or \\nthroot for ∛',
    plain: '\\sqrt ⏎ or \\nthroot for ∛',
    featured: true,
  },
  {
    id: 'sumprod',
    insert: '\\sum',
    goal: 'Sum / product',
    keywords: 'sigma bounds series',
    smart: 'sum or prod — then _ and ^',
    plain: '\\sum or \\prod ⏎ — then _ and ^',
    featured: true,
  },
  {
    id: 'int-def',
    insert: '\\int',
    goal: 'Definite integral',
    keywords: 'integrate bounds antiderivative',
    smart: 'int — then _ and ^',
    plain: '\\int ⏎ — then _ and ^',
    featured: true,
  },
  {
    id: 'int-indef',
    insert: '\\antid',
    goal: 'Indefinite integral',
    keywords: 'antiderivative double iint antid',
    smart: 'iint or antid',
    plain: '\\iint ⏎ or \\antid ⏎',
    featured: true,
  },
  {
    id: 'limit',
    insert: '\\lim',
    goal: 'Limit',
    keywords: 'approaches to onsided lim',
    how: 'lim — then _ for x\\to0',
    featured: true,
  },
  {
    id: 'binom',
    insert: '\\binom',
    goal: 'Binomial coefficient',
    keywords: 'choose ncr combinatorics',
    how: '\\binom ⏎',
    featured: true,
  },
  {
    id: 'matrix',
    insert: '\\pmatrix{a&b\\\\c&d}',
    goal: 'Matrix',
    keywords: 'grid pmatrix bmatrix vmatrix rows columns',
    how: '\\pmatrix ⏎ — Enter adds a row or Shift+Space a column',
    featured: true,
  },
  {
    id: 'greek',
    goal: 'Greek letters',
    keywords: 'alpha beta gamma pi theta omega infinity infty',
    smart: 'pi or theta or infty',
    plain: '\\alpha … \\omega ⏎',
    featured: true,
  },
  {
    id: 'newline',
    goal: 'New line',
    keywords: 'break row displaylines cell',
    how: 'Enter or Shift+Enter for a new cell',
    featured: true,
  },
  {
    id: 'autocomplete',
    goal: 'Autocomplete',
    keywords: 'suggest command menu symbol picker',
    how: 'type \\… or a word — Ctrl+Space for the symbol picker',
    featured: true,
  },
  {
    id: 'text',
    insert: '\\text',
    goal: 'Text',
    keywords: 'words upright label',
    how: '\\text ⏎',
    featured: true,
  },

  {
    id: 'cases',
    insert: '\\cases',
    goal: 'Piecewise function',
    keywords: 'cases branches condition',
    how: '\\cases ⏎',
  },
  {
    id: 'aligned',
    insert: '\\aligned',
    goal: 'Aligned equations',
    keywords: 'align equals stack gathered split eqnarray',
    how: '\\aligned ⏎ — & marks the alignment point',
  },
  {
    id: 'derivative',
    insert: '\\derivative',
    goal: 'Derivative',
    keywords: 'differentiate d/dx leibniz prime',
    smart: 'derivative — caret lands in the denominator',
    plain: '\\derivative ⏎ or \\frac{d }{d } by hand',
  },
  {
    id: 'funcdef',
    insert: '\\def',
    goal: 'Define a function',
    keywords: 'def declare signature assign',
    smart: 'def — then f(x) = …',
    plain: '\\def ⏎ — then f(x) = …',
  },
  {
    id: 'solve',
    insert: '\\solve',
    goal: 'Solve equations',
    keywords: 'roots equation find x solveset system',
    smart: 'solve — then the equation(s)',
    plain: '\\solve ⏎ — then the equation(s)',
  },
  {
    id: 'dsolve',
    insert: '\\dsolve',
    goal: 'Solve an ODE',
    keywords: 'differential equation ode initial conditions',
    smart: 'dsolve — then the equation',
    plain: '\\dsolve ⏎ or \\ode ⏎ — then the equation',
  },
  {
    id: 'pdesolve',
    insert: '\\pdesolve',
    goal: 'Solve a PDE',
    keywords: 'partial differential equation pde',
    smart: 'pdesolve — then the equation',
    plain: '\\pdesolve ⏎ or \\pde ⏎ — then the equation',
  },
  {
    id: 'matops',
    insert: '\\det',
    goal: 'Matrix operations',
    keywords: 'det trace rank inverse transpose rref eigenvals charpoly nullspace',
    how: 'det then the matrix, or \\mathrm{rref} / \\mathrm{eigenvals} / …',
  },
  {
    id: 'norm',
    insert: '\\lVert',
    goal: 'Norm / absolute value',
    keywords: 'magnitude abs lvert lVert modulus',
    how: '\\|x\\| or \\lVert — pairs auto-close',
  },
  {
    id: 'sets',
    goal: 'Named sets',
    keywords: 'real integers rationals complex naturals mathbb blackboard',
    how: '\\R \\Z \\Q \\C \\N — or \\reals \\integers \\rationals',
  },
  {
    id: 'setops',
    goal: 'Set operations',
    keywords: 'union intersection complement member subset empty set-builder',
    how: '\\cup \\cap \\setminus \\in \\subseteq \\emptyset',
  },
  {
    id: 'logic',
    goal: 'Logic',
    keywords: 'and or not forall exists quantifier implies iff therefore',
    how: '\\land \\lor \\lnot \\forall \\exists \\implies \\iff',
  },
  {
    id: 'arrows',
    goal: 'Arrows',
    keywords: 'implies maps mapsto rightarrow leftrightarrow',
    how: '\\to \\Rightarrow \\mapsto \\Leftrightarrow',
  },
  {
    id: 'accents',
    goal: 'Accents',
    keywords: 'hat vector bar dot overline tilde',
    how: '\\dot \\ddot \\bar \\hat \\vec \\tilde',
  },
  {
    id: 'complex',
    goal: 'Complex parts',
    keywords: 'conjugate real imaginary modulus argument polar',
    how: '\\Re \\Im \\arg \\bar{z}',
  },
  {
    id: 'floor',
    insert: '\\lfloor',
    goal: 'Floor / ceiling / factorial',
    keywords: 'round double factorial',
    how: '\\lfloor ⏎ \\lceil ⏎ — n! and n!! work too',
  },
  {
    id: 'partial',
    insert: '\\partial',
    goal: 'Partial derivative',
    keywords: 'multivariable del partialx',
    how: '\\partial — or \\partial_ x then u for the short form',
  },
  {
    id: 'nabla',
    insert: '\\nabla',
    goal: 'Gradient / divergence / curl',
    keywords: 'del nabla grad div curl laplacian Delta',
    how: '\\nabla — \\nabla\\cdot and \\nabla\\times for div and curl',
  },
  {
    id: 'multint',
    goal: 'Double / closed integrals',
    keywords: 'iterated contour surface iiint oint oiint',
    how: '\\iint \\iiint \\oint \\oiint — bounds with _ and ^',
  },
  {
    id: 'tuple',
    goal: 'Interval or tuple (a,b)',
    keywords: 'open interval pair matrix settings',
    how: 'just type (a,b) — Settings switches interval vs 1×2 matrix',
  },
  {
    id: 'exit-block',
    goal: 'Leave a block',
    keywords: 'caret escape placeholder hop out',
    how: 'Right or Tab steps out of the current block',
  },
  {
    id: 'parens',
    goal: 'Paired brackets',
    keywords: 'parentheses auto pair angle langle braces',
    how: '( [ { insert pairs — type the closer to hop over it',
  },
  {
    id: 'unicode',
    goal: 'Unicode input',
    keywords: 'character direct type symbol',
    how: 'type α, ≤, ∫, ∀ directly — they just work',
  },
  {
    id: 'latexcmd',
    goal: 'LaTeX commands',
    keywords: 'backslash command suggestion menu',
    how: '\\ then a name — Enter accepts, arrows pick a suggestion',
  },
  {
    id: 'sympicker',
    goal: 'Symbol picker',
    keywords: 'symbols search unicode picker ctrl space',
    how: 'Ctrl+Space — type to filter, Enter inserts',
  },
  {
    id: 'palette',
    goal: 'Command palette',
    keywords: 'commands jump goto ctrl k',
    how: 'Ctrl+K — commands, worksheets, go-to cell',
  },
  {
    id: 'navcells',
    goal: 'Move between cells',
    keywords: 'navigate focus caret arrow edge',
    how: '↑ / ↓ at a cell edge — Ctrl+Home / Ctrl+End for field edges',
  },
  {
    id: 'deletecell',
    goal: 'Delete a cell',
    keywords: 'remove expression row',
    how: 'the × button, or Backspace on a blank cell',
  },
  {
    id: 'pythoncell',
    goal: 'Python cell',
    keywords: 'code custom function @latex def',
    how: '+ Python cell — def f(x): … is callable as \\mathrm{f}(x)',
  },
  {
    id: 'targets',
    goal: 'Output target',
    keywords: 'compile sympy python latex calculator code',
    how: 'Output menu — LaTeX, Calculator, or Python',
  },
  {
    id: 'calculator',
    goal: 'Calculator results',
    keywords: 'evaluate answers sympy engine estimate namespace',
    how: 'Output → Calculator — cells share one namespace in order',
  },
  {
    id: 'copyout',
    goal: 'Copy output',
    keywords: 'clipboard export latex code',
    how: 'Copy on a cell — Copy script grabs the whole Python program',
  },
  {
    id: 'worksheets',
    goal: 'Worksheets',
    keywords: 'sheet notebook save load file json rename delete',
    how: 'header worksheet menu — switch, rename, delete, save/open files',
  },
  {
    id: 'darkmode',
    goal: 'Dark mode',
    keywords: 'theme light night toggle',
    how: 'moon button in the header — or Ctrl+K → Dark mode',
  },
  {
    id: 'smartmode',
    goal: 'Smart mode',
    keywords: 'auto convert subscript words',
    how: 'header checkbox — sqrt / int / x2 auto-convert when on',
  },
];

export const TOPIC_BY_ID = new Map(HELP_TOPICS.map((t) => [t.id, t]));
