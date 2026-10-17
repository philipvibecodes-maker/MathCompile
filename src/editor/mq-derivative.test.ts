// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountAppField, type } from './test-field';

// Port of e2e/derivative.spec.ts — \derivative and \def are
// insertion-time expansions from the vendored MathQuill patch:
// \derivative becomes real \frac{d}{d} atoms (or D() when the option is
// off) and \def becomes \text{def} — there is no macro atom, so nothing
// downstream needs to bake or canonicalize them.

describe('insertion aliases', () => {
  it('\\derivative expands to a real fraction with the caret in the denominator', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\derivative');
    mq.keystroke('Enter');
    expect(el.value).toBe('\\frac{d}{d}');
    // Caret lands inside the denominator.
    type(mq, 'f');
    expect(el.value).toBe('\\frac{d}{df}');
  });

  it('the expanded fraction stays editable like ordinary content', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\derivative');
    mq.keystroke('Enter');
    // ArrowLeft into the numerator proves the expansion is real atoms.
    mq.keystroke('Left');
    mq.keystroke('Left');
    mq.keystroke('Left');
    type(mq, 'g');
    expect(el.value).toBe('\\frac{gd}{d}');
  });

  it('with dIsDerivative off, \\derivative expands to D() with the caret inside', () => {
    const { el, mq } = mountAppField();
    // No UI for the vendored dIsDerivative option; the element's config
    // passthrough flips it.
    el.config({ dIsDerivative: false });
    type(mq, '\\derivative');
    mq.keystroke('Enter');
    expect(el.value).toBe('D()');
    // Caret lands inside the parens: typing fills D(f).
    type(mq, 'f');
    expect(el.value).toBe('D(f)');
  });

  it('\\def expands to a \\text{def} TextBlock plus a space', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\def');
    mq.keystroke('Enter');
    expect(el.value).toBe('\\text{def}\\ ');
    // The caret is after the space — typing fills the signature directly.
    type(mq, 'g(x)');
    expect(el.value).toBe('\\text{def}\\ g\\left(x\\right)');
  });

  it('typed `for` expands to a \\text{for} TextBlock plus a space', () => {
    const { el, mq } = mountAppField();
    // Smart mode autoCommands — no backslash needed, like `int`.
    type(mq, '\\plot');
    mq.keystroke('Enter');
    type(mq, 'x^2');
    // Space inside a sup block stays inside — arrow out to baseline
    // first, the same as any autoCommand after a superscript.
    mq.keystroke('Right');
    type(mq, ' for');
    expect(el.value).toBe('\\text{plot}\\ x^{2}\\ \\text{for}\\ ');
    // The caret is after the space — the condition types directly.
    type(mq, 'x');
    expect(el.value).toBe('\\text{plot}\\ x^{2}\\ \\text{for}\\ x');
  });

  it('\\for through the latex command input expands the same way', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\for');
    mq.keystroke('Enter');
    expect(el.value).toBe('\\text{for}\\ ');
  });
});
