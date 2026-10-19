// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountAppField, type, caretInfo } from './test-field';

// Port of e2e/limits.spec.ts — caret/bounds interaction on \int, \sum,
// \lim, and the boundless \iint/\antid signs. Every assertion reads the
// serialized value plus the .mq-cursor's DOM position (caretInfo), both
// of which work headless. Left e2e: the two tests that assert bound
// geometry via getBoundingClientRect (the \lim underscript stack, and
// the lone-sup bound height on \iint).

const inField = (el: HTMLElement, sel: string) =>
  el.querySelector('.mq-editable-field')!.querySelectorAll(sel).length;

describe('\\int bounds', () => {
  // `\int` through the latex command input: Enter accepts it and lands
  // the caret in the lower bound (MQ visits sub before sup).
  it('\\int a Right b Right x^2 produces \\int_{a}^{b}x^{2}', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\int');
    mq.keystroke('Enter');
    expect(caretInfo(el)).toMatchObject({
      value: '\\int_{ }^{ }',
      where: 'lower',
    });
    type(mq, 'a');
    expect(caretInfo(el)).toMatchObject({
      value: '\\int_{a}^{ }',
      where: 'lower',
    });
    mq.keystroke('Right');
    expect(caretInfo(el)).toMatchObject({ where: 'upper' });
    type(mq, 'b');
    expect(caretInfo(el)).toMatchObject({
      value: '\\int_{a}^{b}',
      where: 'upper',
    });
    mq.keystroke('Right');
    expect(caretInfo(el)).toMatchObject({ where: 'right' });
    type(mq, 'x^2');
    expect(caretInfo(el).value).toBe('\\int_{a}^{b}x^{2}');
  });

  it('ArrowLeft twice from the lower limit lands left of the integral', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\int');
    mq.keystroke('Enter');
    type(mq, 'a');
    mq.keystroke('Left');
    mq.keystroke('Left');
    expect(caretInfo(el).where).toBe('left');
  });

  it('ArrowRight from left of the integral enters the lower limit', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\int');
    mq.keystroke('Enter');
    // MQ binds Home/End to the current block; Ctrl+Home reaches the
    // field start.
    mq.keystroke('Ctrl-Home');
    expect(caretInfo(el)).toMatchObject({ where: 'left' });
    mq.keystroke('Right');
    expect(caretInfo(el)).toMatchObject({
      value: '\\int_{ }^{ }',
      where: 'lower',
    });
    type(mq, 'a');
    expect(caretInfo(el).value).toBe('\\int_{a}^{ }');
  });

  it('ArrowRight does not hijack in-limit movement', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\int');
    mq.keystroke('Enter');
    type(mq, 'a');
    mq.keystroke('Right');
    type(mq, 'b');
    mq.keystroke('Right');
    type(mq, 'x');
    expect(caretInfo(el).value).toBe('\\int_{a}^{b}x');
    mq.keystroke('Ctrl-Home');
    mq.keystroke('Right');
    expect(caretInfo(el)).toMatchObject({ where: 'lower' });
    mq.keystroke('Right');
    expect(caretInfo(el)).toMatchObject({ where: 'lower' });
  });

  it('ArrowLeft traverses upper -> lower -> left of the integral', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\int');
    mq.keystroke('Enter');
    type(mq, 'a');
    mq.keystroke('Right');
    type(mq, 'b');
    mq.keystroke('Left');
    expect(caretInfo(el)).toMatchObject({ where: 'upper' });
    mq.keystroke('Left');
    expect(caretInfo(el)).toMatchObject({ where: 'lower' });
    mq.keystroke('Left');
    expect(caretInfo(el)).toMatchObject({ where: 'lower' });
    mq.keystroke('Left');
    expect(caretInfo(el)).toMatchObject({ where: 'left' });
  });

  it('fast typing: inta lands a in the lower limit', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\int');
    mq.keystroke('Enter');
    type(mq, 'a');
    expect(caretInfo(el).value).toBe('\\int_{a}^{ }');
  });

  it('ArrowLeft on a plain expression moves one atom', () => {
    const { el, mq } = mountAppField();
    type(mq, 'x+y');
    mq.keystroke('Left');
    // Caret between '+' and 'y': typing inserts there.
    type(mq, '1');
    expect(caretInfo(el).value).toBe('x+1y');
  });

  it('\\sum: multi-atom lower bound then upper', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\sum');
    mq.keystroke('Enter');
    expect(caretInfo(el)).toMatchObject({
      value: '\\sum_{ }^{ }',
      where: 'lower',
    });
    type(mq, 'i=1');
    expect(caretInfo(el).value).toBe('\\sum_{i=1}^{ }');
    mq.keystroke('Right');
    type(mq, 'n');
    // 'n' landed in the upper bound: ArrowRight reached it.
    expect(caretInfo(el).value).toBe('\\sum_{i=1}^{n}');
  });

  it('Backspace right of a limits-bearing atom descends into it', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\int');
    mq.keystroke('Enter');
    type(mq, 'a');
    mq.keystroke('Right');
    type(mq, 'b');
    mq.keystroke('Right');
    expect(caretInfo(el)).toMatchObject({
      value: '\\int_{a}^{b}',
      where: 'right',
    });
    mq.keystroke('Backspace');
    // MQ descends into the last bound (upper) rather than deleting.
    const info = caretInfo(el);
    expect(info.where).toBe('upper');
    expect(info.value).toBe('\\int_{a}^{b}');
  });

  it('Backspace at the start of the field hops over a bounds-carrying atom', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\int');
    mq.keystroke('Enter');
    type(mq, 'a');
    mq.keystroke('Right');
    type(mq, 'b');
    mq.keystroke('Ctrl-Home');
    mq.keystroke('Backspace');
    // Nothing to delete on the left: MQ selects the atom rather than
    // deleting past it.
    expect(caretInfo(el).value).toBe('\\int_{a}^{b}');
  });
});

describe('\\lim', () => {
  // `\lim` is a displaystyle operator: the approach bound stacks under
  // the "lim" text like \sum's lower bound. (The rendered "bound sits
  // below the operator" geometry assert stays e2e — headless has no
  // layout.)
  it('lim inserts a displaystyle limit, bound types below the operator', () => {
    const { el, mq } = mountAppField();
    type(mq, 'lim');
    expect(caretInfo(el)).toMatchObject({
      value: '\\lim_{ }',
      where: 'lower',
    });
    type(mq, 'x->0');
    expect(caretInfo(el).value).toBe('\\lim_{x\\to0}');
    mq.keystroke('Right');
    type(mq, 'f');
    expect(caretInfo(el).value).toBe('\\lim_{x\\to0}f');
  });

  it('\\lim through the latex command input is displaystyle too', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\lim');
    mq.keystroke('Enter');
    expect(caretInfo(el)).toMatchObject({
      value: '\\lim_{ }',
      where: 'lower',
    });
    type(mq, 'x->0');
    expect(caretInfo(el).value).toBe('\\lim_{x\\to0}');
  });

  it('typed / after \\lim keeps the limit out of the numerator', () => {
    const { el, mq } = mountAppField();
    type(mq, 'lim');
    type(mq, 'x->0');
    mq.keystroke('Right');
    type(mq, 'f');
    mq.typedText('/');
    const info = caretInfo(el);
    expect(info.value).toMatch(/^\\lim_\{x\\to0\}\\frac\{f\}/);
    expect(info.value).not.toMatch(/frac\{[^}]*lim/);
    // DOM check: the .mq-limit atom is not inside the numerator block.
    expect(inField(el, '.mq-numerator .mq-limit')).toBe(0);
    type(mq, 'y');
    expect(caretInfo(el).value).toBe('\\lim_{x\\to0}\\frac{f}{y}');
  });

  it('Tab from the lower bound reaches the upper bound', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\int');
    mq.keystroke('Enter');
    type(mq, 'a');
    mq.keystroke('Tab');
    expect(caretInfo(el)).toMatchObject({ where: 'upper' });
    type(mq, 'b');
    expect(caretInfo(el).value).toBe('\\int_{a}^{b}');
  });
});

// Boundless integral signs: \iint renders the double sign ∬, \antid the
// single sign ∫ — neither carries blocks, so the integrand types
// linearly right of the sign and `_`/`^` grow an ordinary sibling SupSub.
describe('boundless \\iint / \\antid', () => {
  it('iint inserts a boundless double integral, typed linearly', () => {
    const { el, mq } = mountAppField();
    type(mq, 'iint');
    expect(caretInfo(el)).toMatchObject({ value: '\\iint', where: 'right' });
    // Renders the double-integral sign ∬, not a bare ∫.
    const root = el.querySelector('.mq-editable-field')!;
    expect(root.querySelector('.mq-int')!.textContent).toBe('∬');
    type(mq, 'xdxdy');
    expect(caretInfo(el).value).toBe('\\iint xdxdy');
  });

  it('antid inserts a boundless integral sign', () => {
    const { el, mq } = mountAppField();
    type(mq, 'antid');
    expect(caretInfo(el)).toMatchObject({ value: '\\antid', where: 'right' });
    // Space stays inside an open exponent, so Right first.
    type(mq, 'x^2');
    mq.keystroke('Right');
    type(mq, 'dx');
    expect(caretInfo(el).value).toBe('\\antid x^{2}dx');
  });

  it('\\antid through the latex command input is boundless too', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\antid');
    mq.keystroke('Enter');
    expect(caretInfo(el)).toMatchObject({ value: '\\antid', where: 'right' });
    type(mq, 'xdx');
    expect(caretInfo(el).value).toBe('\\antid xdx');
  });

  // A typed `/` scans left for numerator content — the scan must stop
  // at a boundless integral sign the way it does at `\sum`/`\int`.
  it('typed / after \\antid keeps the integral sign out of the fraction', () => {
    const { el, mq } = mountAppField();
    type(mq, 'antid');
    type(mq, 'x');
    mq.typedText('/');
    const info = caretInfo(el);
    expect(info.value).toMatch(/^\\antid *\\frac\{x\}/);
    expect(info.value).not.toMatch(/frac\{[^}]*antid/);
    expect(inField(el, '.mq-numerator .mq-int')).toBe(0);
    type(mq, 'y');
    expect(caretInfo(el).value).toBe('\\antid\\frac{x}{y}');
  });

  it('typed / after \\iint_{a}^{b} leaves sign and bounds outside', () => {
    const { el, mq } = mountAppField();
    type(mq, 'iint');
    type(mq, '_a');
    mq.keystroke('Right');
    type(mq, '^b');
    mq.keystroke('Right');
    type(mq, 'x');
    mq.typedText('/');
    // The bound SupSub belongs to the integral — the numerator is just x.
    expect(caretInfo(el).value).toBe('\\iint_{a}^{b}\\frac{x}{ }');
    const root = el.querySelector('.mq-editable-field')!;
    const num = root.querySelector('.mq-numerator');
    expect(
      (num?.querySelectorAll('.mq-int').length ?? 0) +
        (num?.querySelectorAll('.mq-supsub').length ?? 0),
    ).toBe(0);
  });

  // `_`/`^` still produce a definite integral on the boundless signs:
  // a sibling SupSub welds onto the atom.
  it('\\iint _a Right ^b Right xdx produces \\iint_{a}^{b}xdx', () => {
    const { el, mq } = mountAppField();
    type(mq, 'iint');
    type(mq, '_a');
    expect(caretInfo(el)).toMatchObject({
      value: '\\iint_{a}',
      where: 'lower',
    });
    mq.keystroke('Right');
    type(mq, '^b');
    expect(caretInfo(el)).toMatchObject({
      value: '\\iint_{a}^{b}',
      where: 'upper',
    });
    mq.keystroke('Right');
    type(mq, 'xdx');
    expect(caretInfo(el).value).toBe('\\iint_{a}^{b}xdx');
  });

  // With smart mode's autoSubscriptNumerals a sub-only bound is
  // arrow-skippable at baseline — after `\antid_{1}` ArrowRight lands to
  // the RIGHT of the bound (same semantics as `x_1`).
  it('\\antid with a lone sub bound keeps baseline typing', () => {
    const { el, mq } = mountAppField();
    type(mq, 'antid');
    type(mq, '_1');
    expect(caretInfo(el).value).toBe('\\antid_{1}');
    mq.keystroke('Right');
    type(mq, 'xdx');
    expect(caretInfo(el).value).toBe('\\antid_{1}xdx');
  });

  // A boundless sign carrying ONLY an upper bound parses and keeps the
  // bound in a sibling SupSub (the rendered bound-height check stays
  // e2e — it needs real layout).
  it('\\iint with a lone sup bound keeps the bound as a sibling SupSub', () => {
    const { el, mq } = mountAppField();
    type(mq, 'iint');
    type(mq, '^b');
    expect(caretInfo(el).value).toBe('\\iint^{b}');
    const root = el.querySelector('.mq-editable-field')!;
    expect(root.querySelectorAll('.mq-int ~ .mq-supsub .mq-sup')).toHaveLength(
      1,
    );
    el.value = '\\iint_{a}^{b}';
    expect(
      root.querySelectorAll('.mq-int ~ .mq-supsub .mq-sup'),
    ).toHaveLength(1);
  });
});
