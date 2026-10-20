// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountAppField, type } from './test-field';
import type { MathFieldElement } from './math-field';

// Port of e2e/parseronly.spec.ts — parser-only LatexCmds (\left, \right,
// \textcolor, \class) used to crash the field with `Cannot read
// properties of undefined (reading 'childCount')` when typed through the
// latex command input. They're now no-ops on typed insertion: the
// following keystroke continues normally. A synchronous throw from
// typedText/keystroke fails the test — the e2e `pageerror` check's job.
//
// Not ported: the KaTeX_Caligraphic webfont assertion (needs real CSS);
// a residual e2e keeps it.

const field = (): MathFieldElement => mountAppField().el;

describe('parser-only commands', () => {
  it('typed \\textcolor is a no-op, not a crash', () => {
    const { el, mq } = mountAppField();
    type(mq, 'x+');
    type(mq, '\\textcolor');
    mq.keystroke('Enter');
    type(mq, 'y');
    expect(el.value).toBe('x+y');
  });

  it('typed \\class is a no-op, not a crash', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\class');
    mq.keystroke('Enter');
    type(mq, 'z');
    expect(el.value).toBe('z');
  });

  it('typed \\left( auto-pairs the bracket', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\left(');
    expect(el.value).toBe('\\left(\\right)');
    type(mq, 'x');
    expect(el.value).toBe('\\left(x\\right)');
  });

  it('typed \\right) auto-pairs the bracket', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\right)');
    expect(el.value).toBe('\\left(\\right)');
  });

  it('typed \\left| renders the absolute-value pair', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\left|');
    expect(el.value).toBe('\\left|\\right|');
  });

  // The . delimiter in \left./\right. (invisible side, used for
  // evaluation bars) previously failed to parse at all.
  it('\\left. x \\right|_{a}^{b} parses and round-trips', () => {
    const el = field();
    el.value = '\\left. x \\right|_{a}^{b}';
    expect(el.value).toBe('\\left.x\\right|_{a}^{b}');
  });

  it('x\\left|y\\right. parses and round-trips', () => {
    const el = field();
    el.value = 'x\\left|y\\right.';
    expect(el.value).toBe('x\\left|y\\right.');
  });

  // `sign` used to type as s*i*g*n — it's now an auto operator name and
  // exports as \operatorname{sign}, which compiles to SymPy's sign().
  it('sign unitalicizes in smart mode', () => {
    const { el, mq } = mountAppField();
    type(mq, 'sign(x)');
    expect(el.value).toBe('\\operatorname{sign}\\left(x\\right)');
  });
});

// \<char> escapes that used to blank the whole cell on hydrate: spacing,
// braces, and the norm shorthand. Bare typed chars are unaffected.
const ESCAPE_CASES: [string, string][] = [
  ['\\{1,2\\}', '\\{ 1,2\\} '],
  ['x\\;y', 'x\\; y'],
  ['x\\,y', 'x\\, y'],
  ['x\\:y', 'x\\: y'],
  ['\\|\\mathbf{v}\\|', '\\| \\mathbf{v}\\| '],
  // negated relations / asymptotic equality — were unparseable commands
  // that blanked the field on hydrate.
  ['a\\nleq b', 'a\\nleq b'],
  ['a\\ngeq b', 'a\\ngeq b'],
  ['a\\nle b', 'a\\nleq b'],
  ['a\\nge b', 'a\\ngeq b'],
  ['a\\asymp b', 'a\\asymp b'],
];
describe('\\-escape hydration', () => {
  for (const [latex, expected] of ESCAPE_CASES) {
    it(`hydrates ${latex}`, () => {
      const el = field();
      el.value = latex;
      expect(el.value).toBe(expected);
    });
  }

  it('typed , ; : ! keep their literal meaning', () => {
    const { el, mq } = mountAppField();
    type(mq, 'a,b');
    expect(el.value).toBe('a,b');
    el.value = '';
    type(mq, 'a;b');
    expect(el.value).toBe('a;b');
    el.value = '';
    type(mq, 'a:b');
    expect(el.value).toBe('a:b');
    el.value = '';
    type(mq, 'n!');
    expect(el.value).toBe('n!');
  });
});

describe('block commands', () => {
  // \boxed and the brace groups used to blank the field.
  it('\\boxed parses, renders, and round-trips', () => {
    const el = field();
    el.value = '\\boxed{x+1}';
    expect(el.querySelectorAll('.mq-boxed')).toHaveLength(1);
    expect(el.value).toBe('\\boxed{x+1}');
  });

  it('\\underbrace keeps its sibling subscript', () => {
    const el = field();
    el.value = '\\underbrace{x+1}_{n}';
    expect(el.querySelectorAll('.mq-underbrace')).toHaveLength(1);
    expect(el.value).toBe('\\underbrace{x+1}_{n}');
  });

  it('\\overbrace keeps its sibling superscript', () => {
    const el = field();
    el.value = '\\overbrace{a+b}^{2}';
    expect(el.querySelectorAll('.mq-overbrace')).toHaveLength(1);
    expect(el.value).toBe('\\overbrace{a+b}^{2}');
  });

  // \underset/\overset are two-block commands — the label sits under/over
  // the main row.
  it('\\underset renders the label under the main row', () => {
    const el = field();
    el.value = '\\underset{x\\to0}{\\lim}f';
    expect(el.querySelectorAll('.mq-overunderset')).toHaveLength(1);
    // \lim is a real command now — its own underscript block is empty.
    expect(el.value).toBe('\\underset{x\\to0}{\\lim_{ }}f');
  });

  it('typed \\underset inserts the two-block command', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\underset');
    mq.keystroke('Enter');
    expect(el.value).toBe('\\underset{ }{ }');
  });
});

describe('font commands', () => {
  // \mathbb{X} parses to a glyph leaf — a pending `\mathbb{arg}` input
  // takes the arg and resolves via writeLatex.
  it('typed \\mathbb{R} produces the glyph leaf', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\mathbb{R}');
    expect(el.value).toBe('\\mathbb{R}');
    // the leaf renders the double-struck char, not the latex text
    expect(el.textContent).toContain('ℝ');
  });

  it('typed \\mathbb{ stays a visible pending input', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\mathbb{');
    expect(el.value).toBe('\\mathbb{ }');
  });

  it('typed \\mathbb arg resolves on Enter', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\mathbb{N');
    mq.keystroke('Enter');
    expect(el.value).toBe('\\mathbb{N}');
  });

  it('typed \\Bbb resolves to \\mathbb', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\Bbb{Z}');
    expect(el.value).toBe('\\mathbb{Z}');
  });

  // \mathcal types through the same pending `\mathcal{arg}` input.
  it('typed \\mathcal{A} produces the calligraphic style node', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\mathcal{');
    expect(el.value).toBe('\\mathcal{ }');
    type(mq, 'A}');
    expect(el.value).toBe('\\mathcal{A}');
    // The webfont check (font-family: KaTeX_Caligraphic) stays e2e —
    // headless has no stylesheet.
    expect(
      el.querySelectorAll(
        '.mq-editable-field > .mq-root-block .mq-caligraphic',
      ),
    ).toHaveLength(1);
  });

  it('typed \\mathcal arg resolves on Enter and keeps extra letters', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\mathcal{BC');
    mq.keystroke('Enter');
    expect(el.value).toBe('\\mathcal{BC}');
    expect(
      el.querySelectorAll(
        '.mq-editable-field > .mq-root-block .mq-caligraphic',
      ),
    ).toHaveLength(1);
  });
});

describe('insertion aliases', () => {
  // \tr is an insertion alias — it expands to \mathrm{tr}, the word-op
  // form the compiler lowers to .trace().
  it('typed \\tr expands to \\mathrm{tr}', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\tr');
    mq.keystroke('Enter');
    expect(el.value).toBe('\\mathrm{tr}');
    type(mq, '(A)');
    expect(el.value).toBe('\\mathrm{tr}\\left(A\\right)');
  });

  // \D is an insertion alias — it expands to \text{D}, the upright mark
  // the compiler reads as the total-derivative operator.
  it('typed \\D expands to \\text{D}', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\D');
    mq.keystroke('Enter');
    expect(el.value).toBe('\\text{D}');
  });

  // \gradient is an insertion alias — it expands to the \nabla sign the
  // compiler lowers to a Gradient node.
  it('typed \\gradient expands to \\nabla', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\gradient');
    mq.keystroke('Enter');
    expect(el.value).toBe('\\nabla');
  });

  // \norm expands like \tr but keeps a trailing space — its operand is
  // usually a bare name where `\mathrm{norm}A` would render as one word.
  it('typed \\norm expands to \\mathrm{norm} + space', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\norm');
    mq.keystroke('Enter');
    expect(el.value).toBe('\\mathrm{norm}\\ ');
    type(mq, 'A');
    expect(el.value).toBe('\\mathrm{norm}\\ A');
  });

  // \| is shorthand for \lVert — typed, it inserts the same
  // auto-pairing norm bracket. (Pasted \| keeps the standalone ‖
  // symbol — the escape-hydration table above — so \|v\| still
  // round-trips.)
  it('typed \\| inserts the \\lVert pair', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\|');
    expect(el.value).toBe('\\left\\lVert\\right\\rVert');
    type(mq, 'v');
    expect(el.value).toBe('\\left\\lVert v\\right\\rVert');
  });
});

describe('delimiters and accents', () => {
  // \widehat aliases \hat (wide variant): parses and renders the hat.
  it('\\widehat parses and renders as a hat', () => {
    const el = field();
    el.value = '\\widehat{AB}';
    expect(el.value).toBe('\\hat{AB}');
  });

  // \big*/\Big*/\bigg*/\Bigg* fixed-size delimiters used to blank the cell.
  const BIG_CASES: [string, string][] = [
    ['a\\big|_{x=0}', 'a\\big|_{x=0}'],
    ['a\\Big(b\\Big)', 'a\\Big(b\\Big)'],
    ['\\frac{dy}{dx}\\bigg|_{x=0}', '\\frac{dy}{dx}\\bigg|_{x=0}'],
    ['\\big\\langle u,v\\big\\rangle', '\\big\\langle u,v\\big\\rangle'],
  ];
  for (const [latex, expected] of BIG_CASES) {
    it(`hydrates sized delimiter ${latex}`, () => {
      const el = field();
      el.value = latex;
      expect(el.value).toBe(expected);
    });
  }
});
