// Pre-parse latex rewrites as named rule objects.
//
// Every rewrite the pipeline applies to raw cell latex is a `LatexRule`
// with a name, the decision it encodes (`why`), a cheap `applies` gate,
// the `rewrite`, and in→out `tests` pinned beside it — the failure mode
// this fixes is a rule outliving the decision that motivated it: the
// `\iint`→`\int` canonicalization arm was deleted but its e2e pin
// survived because the rationale lived nowhere near the test. With the
// why/tests inside the rule, deleting a decision deletes its evidence.
//
// `outputLatex`/`copyableLatex`/`latexToStatementStrings` compose rules
// by name, so "which rules ran, in what order" is an explicit list
// instead of per-call-site folklore (the `big-delim` double run around
// `eval-bar` is load-bearing and now spelled out).

export interface LatexRule {
  /** Stable id used in rule-name compositions. */
  name: string;
  /** The decision the rule implements — why the rewrite exists.
   *  Delete the rule when the decision is reversed; its tests die
   *  with it. */
  why: string;
  /** Cheap gate: rewrite() runs only when it matches. Must be a
   *  superset of what rewrite() can change, and non-global — `.test`
   *  on a /g regex carries lastIndex state across calls. */
  applies: RegExp;
  /** The full rewrite — runs on the whole string when `applies` hits. */
  rewrite: (s: string) => string;
  /** in → out pins — the vitest in latex.test.ts runs every pair. */
  tests: [string, string][];
}

// Read a `{...}` group starting at s[i] (after optional spaces);
// returns [innerText, indexAfterClosingBrace] or null.
function readBraceArg(s: string, i: number): [string, number] | null {
  while (s[i] === ' ') i++;
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}') {
      depth--;
      if (depth === 0) return [s.slice(i + 1, j), j + 1];
    }
  }
  return null;
}

const OVERUNDER = /\\(under|over)set(?![a-zA-Z])/;
function rewriteOverUnder(s: string): string {
  let out = '';
  let rest = s;
  for (;;) {
    const m = OVERUNDER.exec(rest);
    if (!m) break;
    const a = readBraceArg(rest, m.index + m[0].length);
    const b = a && readBraceArg(rest, a[1]);
    if (!a || !b) break;
    out += rest.slice(0, m.index);
    // Fill an empty bound on the body first — \lim serializes as
    // \lim_{ } now, and \lim_{ }_{x\to0} is an unparseable double bound.
    const emptyBound = m[1] === 'under' ? '_{ }' : '^{ }';
    const bound = m[1] === 'under' ? `_{${a[0]}}` : `^{${a[0]}}`;
    out += b[0].includes(emptyBound)
      ? b[0].replace(emptyBound, bound)
      : `${b[0]}${bound}`;
    rest = rest.slice(b[1]);
  }
  return out + rest;
}

const BIG_DELIM = /\\(?:big|Big|bigg|Bigg)\s*(?=[()[\]|.\\])/g;
const stripBigDelims = (s: string): string => s.replace(BIG_DELIM, '');

function rewriteEvalBar(s: string): string {
  // Bare pipes only: skip \| escapes and pipes that are the delimiter
  // argument of a command (\right|, \left|, \middle|, \vert| …).
  const pipes = [...s.matchAll(/\|/g)].filter((m) => {
    const before = s.slice(0, m.index);
    if (before.endsWith('\\')) return false;
    if (/\\[a-zA-Z]+$/.test(before)) return false;
    return true;
  });
  if (pipes.length !== 1) return s;
  const i = pipes[0].index;
  const rest = s.slice(i + 1);
  if (!/^\s*[_^]\{/.test(rest)) return s;
  return `\\left.${s.slice(0, i)}\\right|${rest}`;
}

// The (?![a-zA-Z]) guard keeps longer command names like \antidx
// untouched, and the backslash-run parity check keeps a `\\` row
// separator followed by the literal letters "antid" (e.g. `x\\antid y`)
// from collapsing: the alias's own \ must sit at an odd position in the
// run.
const INT_ALIASES = /(?<!\\)((?:\\\\)*)\\antid(?![a-zA-Z])/g;
const canonicalInt = (s: string): string =>
  s.replace(INT_ALIASES, '$1\\int');

export const LATEX_RULES: LatexRule[] = [
  {
    name: 'over-under',
    why: 'CE parses neither \\underset nor \\overset but handles the '
      + 'rewritten bound forms (\\underset{x\\to0}{\\lim} -> \\lim_{x\\to0}).',
    applies: /\\(?:under|over)set/,
    rewrite: rewriteOverUnder,
    tests: [
      ['\\underset{x\\to0}{\\lim}', '\\lim_{x\\to0}'],
      ['\\overset{a}{b}', 'b^{a}'],
      ['\\underset{x}{\\lim_{ }}', '\\lim_{x}'],
    ],
  },
  {
    name: 'big-delim',
    why: '\\big| \\Big| \\bigg| \\Bigg| are pure sizing — CE can\'t '
      + 'parse them, so the size word is dropped and the bare '
      + 'delimiter remains. Runs twice in CANONICAL_RULES: once before '
      + 'eval-bar (a \\big| must read as a bare pipe) and once after '
      + '(the \\right| it writes must not grow a stray \\big).',
    applies: /\\(?:big|Big|bigg|Bigg)/,
    rewrite: stripBigDelims,
    tests: [
      ['\\big|x\\big|', '|x|'],
      ['\\bigg(x\\bigg)', '(x)'],
      ['\\big x', '\\big x'],
    ],
  },
  {
    name: 'eval-bar',
    why: 'a lone bare `|` immediately followed by `_{...}`/`^{...}` '
      + 'bounds is textbook "evaluated at" notation (`f\'|_{x=a}`); '
      + 'CE can\'t parse a bare delimiter, so the expression wraps in '
      + 'the \\left. \\right| form codegen understands. Only a single '
      + 'unescaped | qualifies — `a|b` and `a\\mid b` keep their own '
      + 'meaning/flag.',
    applies: /\|/,
    rewrite: rewriteEvalBar,
    tests: [
      ["f'|_{x=a}", "\\left.f'\\right|_{x=a}"],
      ['x|_{1}^{2}', '\\left.x\\right|_{1}^{2}'],
      ['a|b', 'a|b'],
      ['a\\mid b', 'a\\mid b'],
    ],
  },
  {
    name: 'int-alias',
    why: '\\antid is MathQuill\'s boundless insertion alias for a '
      + 'single indefinite ∫ — the output view shows the canonical '
      + '\\int and parsing sees an ordinary Integrate. \\iint is NOT '
      + 'aliased: it is a real boundless ∬ sign CE parses natively '
      + '(the stale \\iint→\\int arm was removed with its decision).',
    applies: /\\antid(?![a-zA-Z])/,
    rewrite: canonicalInt,
    tests: [
      ['\\antid x dx', '\\int x dx'],
      ['\\antidx', '\\antidx'],
      // backslash-run parity: an even count means the slashes are row
      // separators and "antid" is literal text — the alias's own \ must
      // sit at an odd position in the run.
      ['x\\\\antid y', 'x\\\\antid y'],
      ['x\\\\\\\\antid y', 'x\\\\\\\\antid y'],
      ['x\\\\\\antid y', 'x\\\\\\int y'],
    ],
  },
  {
    name: 'displaylines-unwrap',
    why: '\\displaylines{...} is the editing artifact MathQuill wraps '
      + 'multi-line cells in — not part of the expression, so output '
      + 'and parse paths unwrap it.',
    applies: /^\\displaylines\{/,
    rewrite: (s) => {
      const prefix = '\\displaylines{';
      let depth = 0;
      for (let i = prefix.length - 1; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          // only a wrapper covering the whole string unwraps
          if (depth === 0)
            return i === s.length - 1 ? s.slice(prefix.length, i) : s;
        }
      }
      return s;
    },
    tests: [
      ['\\displaylines{x\\\\ y}', 'x\\\\ y'],
      ['\\displaylines{\\frac{1}{2}\\\\ y^{2}}', '\\frac{1}{2}\\\\ y^{2}'],
      ['\\displaylines{x} + y', '\\displaylines{x} + y'],
    ],
  },
  {
    name: 'limits-hints',
    why: '\\limits/\\nolimits/\\displaylimits are display hints, not '
      + 'semantics — CE chokes on `\\sum\\limits_{i=1}^{n}` while '
      + '`\\sum_{i=1}^{n}` parses fine.',
    applies: /\\(?:limits|nolimits|displaylimits)/,
    rewrite: (s) =>
      s.replace(/\\(?:limits|nolimits|displaylimits)(?![a-zA-Z])/g, ''),
    tests: [
      ['\\sum\\limits_{i=1}^{n} i', '\\sum_{i=1}^{n} i'],
      ['\\int\\nolimits x dx', '\\int x dx'],
    ],
  },
  {
    name: 'thin-space',
    why: 'thin spaces (\\, \\; \\: \\! and the escaped \\ ) are layout '
      + 'hints — CE wraps them as an InvisibleOperator call which then '
      + 'reads as a function application (`\\int x\\,dx` -> '
      + 'integrate(InvisibleOperator(x), x)).',
    applies: /\\[,;:!]|\\ /,
    rewrite: (s) => s.replace(/\\[,;:!]|(?<!\\)\\ /g, ' '),
    tests: [
      ['\\int x\\,dx', '\\int x dx'],
      ['a\\;b', 'a b'],
    ],
  },
  {
    name: 'partial-subscript',
    why: '`\\partial_{x}` is the partial operator applied as a '
      + 'subscript — CE glues it to the next factor '
      + '(`\\partial_{x}x^{2}` -> x**x*2). The \\frac{\\partial}{'
      + '\\partial x} form routes through D() cleanly for every '
      + 'operand.',
    applies: /\\partial_/,
    rewrite: (s) =>
      s.replace(
        /\\partial_(?:\{([^}]*)\}|([a-zA-Z]))(?!\s*\^)/g,
        (_m, braced: string | undefined, bare: string | undefined) =>
          `\\frac{\\partial}{\\partial ${braced ?? bare}}`,
      ),
    tests: [
      ['\\partial_{x}y', '\\frac{\\partial}{\\partial x}y'],
      ['\\partial_x y', '\\frac{\\partial}{\\partial x} y'],
    ],
  },
  {
    name: 'd-total-alias',
    why: '\\D is the insertion alias for the total-derivative operator — '
      + 'in the field it expands to \\text{D} atoms, so this rewrite only '
      + 'covers a \\D that reaches the parser anyway (pasted latex, '
      + 'stored cells from before the alias). A plain D stays a symbol.',
    applies: /\\D(?![a-zA-Z])/,
    rewrite: (s) =>
      s.replace(/(?<!\\)((?:\\\\)*)\\D(?![a-zA-Z])/g, '$1\\text{D}'),
    tests: [
      ['\\frac{\\D f}{\\D x}', '\\frac{\\text{D} f}{\\text{D} x}'],
      ['\\D_x f', '\\text{D}_x f'],
      ['\\Delta', '\\Delta'],
      // backslash-run parity: an even count means the slashes are row
      // separators and "D" is literal text.
      ['x\\\\D y', 'x\\\\D y'],
      ['x\\\\\\D y', 'x\\\\\\text{D} y'],
    ],
  },
  {
    name: 'nabla-gradient',
    why: '\\nabla/\\gradient spell the gradient operator — CE has no '
      + 'latex for it, so they rewrite to \\operatorname{grad} which the '
      + 'normalizer folds to a Gradient node. \\nabla\\cdot/\\times '
      + '(div/curl), \\nabla^2 (laplacian) and \\nabla_v stay '
      + 'unsupported-command errors — only the gradient reading exists.',
    applies: /\\(?:nabla|gradient)(?![a-zA-Z])/,
    rewrite: (s) =>
      s.replace(
        /(?<!\\)((?:\\\\)*)\\(?:nabla|gradient)(?![a-zA-Z])(?!\s*(?:\\cdot|\\times|\^|_))/g,
        '$1\\operatorname{grad}',
      ),
    tests: [
      ['\\nabla f', '\\operatorname{grad} f'],
      ['\\gradient f', '\\operatorname{grad} f'],
      ['\\nabla \\cdot F', '\\nabla \\cdot F'],
      ['\\nabla^2 f', '\\nabla^2 f'],
      ['\\nablas', '\\nablas'],
      ['x\\\\nabla y', 'x\\\\nabla y'],
      ['x\\\\\\nabla y', 'x\\\\\\operatorname{grad} y'],
    ],
  },
];

const ruleByName = new Map(LATEX_RULES.map((r) => [r.name, r]));

// Run the named rules in order — each fires only when its `applies`
// gate matches the current text (an unmatched gate is the same
// no-op the old unconditional calls short-circuited into).
export function applyLatexRules(s: string, names: string[]): string {
  return names.reduce((acc, n) => {
    const r = ruleByName.get(n);
    if (r === undefined) throw new Error(`unknown latex rule '${n}'`);
    return r.applies.test(acc) ? r.rewrite(acc) : acc;
  }, s);
}

// The canonical-command pipeline — what every latex consumer runs
// before output or parse. big-delim brackets eval-bar on both sides:
// before, so a `\big|` size word doesn't hide the pipe from the
// eval-bar check; after, so nothing the rewrite produced keeps a
// leftover size word.
const CANONICAL_CMD_RULES = [
  'over-under',
  'big-delim',
  'eval-bar',
  'big-delim',
  'int-alias',
];

// Clipboard form: the field's stored serialization verbatim — still
// \displaylines-wrapped for multi-line cells — with only the \int
// canonicalization. Unlike outputLatex's unwrapped text, this parses
// back verbatim (a bare top-level \\ is not valid MathQuill input, so
// copying the display form silently wiped a pasted cell).
export function copyableLatex(latex: string): string {
  return applyLatexRules(latex, ['int-alias']);
}

// The latex output target shows a cell's LaTeX verbatim, except the
// \displaylines{} wrapper MathQuill adds to multi-line cells — that's an
// editing artifact, not part of the expression, so it is unwrapped here.
export function outputLatex(latex: string): string {
  return applyLatexRules(latex, [
    'displaylines-unwrap',
    ...CANONICAL_CMD_RULES,
  ]);
}

// The pre-parse surgery ir.ts runs after outputLatex — exported as a
// rule-name list so the parse path composes by name like every other
// consumer.
export const PRE_PARSE_RULES = [
  'limits-hints',
  'thin-space',
  'partial-subscript',
  'd-total-alias',
  'nabla-gradient',
];

// Display form for the output column: unwrapped like outputLatex, with
// each \\ row separator kept and followed by a real line break. The space
// MQ writes after \\ is dropped so the next row starts flush left.
export function displayLatex(latex: string): string {
  return outputLatex(latex).replaceAll(/\\\\ */g, '\\\\\n');
}
