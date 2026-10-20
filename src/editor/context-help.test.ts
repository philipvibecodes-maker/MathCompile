// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountAppField, type } from './test-field';
import { readHelpContext, HELP_ENTRIES } from './context-help';
import type { MathFieldElement } from './math-field';

const ctx = (el: MathFieldElement) => readHelpContext(el);

describe('readHelpContext', () => {
  it('caret inside \\sum bounds reads in-bounds', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\sum');
    mq.keystroke('Enter'); // caret lands in the lower (.mq-from) bound
    expect(ctx(el)).toBe('in-bounds');
    mq.keystroke('Tab'); // upper bound (.mq-to)
    expect(ctx(el)).toBe('in-bounds');
    mq.keystroke('Right'); // leaves the operator
    expect(ctx(el)).not.toBe('in-bounds');
  });

  it('caret inside \\frac reads in-frac', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\frac');
    mq.keystroke('Enter'); // numerator
    expect(ctx(el)).toBe('in-frac');
    mq.keystroke('Tab'); // denominator
    expect(ctx(el)).toBe('in-frac');
    mq.keystroke('Tab'); // exits right
    expect(ctx(el)).not.toBe('in-frac');
  });

  it('an open \\-command input reads command-input', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\sq');
    expect(ctx(el)).toBe('command-input');
  });

  it('caret after \\def reads in-def', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\def');
    mq.keystroke('Enter');
    expect(ctx(el)).toBe('in-def');
    type(mq, 'g(x)=2x'); // marker stays context while typing the signature
    expect(ctx(el)).toBe('in-def');
  });

  it('caret after \\solve reads in-solve', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\solve');
    mq.keystroke('Enter');
    expect(ctx(el)).toBe('in-solve');
    type(mq, 'x^2=1,x');
    expect(ctx(el)).toBe('in-solve');
  });

  it('caret after \\dsolve and \\ode reads in-dsolve', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\dsolve');
    mq.keystroke('Enter');
    expect(ctx(el)).toBe('in-dsolve');
    type(mq, "y'=y");
    expect(ctx(el)).toBe('in-dsolve');

    const second = mountAppField();
    type(second.mq, '\\ode');
    second.mq.keystroke('Enter');
    expect(ctx(second.el)).toBe('in-dsolve');
  });

  it('caret after \\pdesolve and \\pde reads in-pdesolve', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\pdesolve');
    mq.keystroke('Enter');
    expect(ctx(el)).toBe('in-pdesolve');

    const second = mountAppField();
    type(second.mq, '\\pde');
    second.mq.keystroke('Enter');
    expect(ctx(second.el)).toBe('in-pdesolve');
  });

  it('matrix contexts still win inside a grid', () => {
    const { el, mq } = mountAppField();
    el.value = '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}';
    mq.keystroke('Ctrl-Home');
    mq.keystroke('Right'); // inside cell a
    expect(ctx(el)).toBe('inside-matrix');
  });

  it('HELP_ENTRIES has a row for every context', () => {
    for (const k of [
      'inside-matrix',
      'left-of-matrix',
      'right-of-matrix',
      'in-plot',
      'in-def',
      'in-solve',
      'in-dsolve',
      'in-pdesolve',
      'in-bounds',
      'in-frac',
      'command-input',
    ] as const) {
      expect(HELP_ENTRIES[k].length).toBeGreaterThan(0);
    }
  });
});
