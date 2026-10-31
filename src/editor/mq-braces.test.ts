// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountAppField, type } from './test-field';

describe('set-builder brace entry', () => {
  it('inserts a paired brace after an assignment', () => {
    const { el, mq } = mountAppField();
    type(mq, 'A={');
    expect(el.value).toBe('A=\\left\\{\\right\\}');
  });
  it('inserts a paired brace in a new worksheet line', () => {
    const { el, mq } = mountAppField();
    el.value = 'A=\\left\\{\\left(x,y\\right)\\mid x+y=1\\right\\}';
    mq.moveToRightEnd();
    mq.typedText('\n');
    type(mq, '{');
    expect(el.value).toContain('\\left\\{\\right\\}');
  });
  it('inserts braces in an empty field', () => {
    const { el, mq } = mountAppField();
    type(mq, '{');
    expect(el.value).toBe('\\left\\{\\right\\}');
  });
  it('inserts and closes a set inside an empty matrix cell', () => {
    const { el, mq } = mountAppField();
    el.value = '\\begin{pmatrix} & \\\\ & \\end{pmatrix}';
    mq.moveToLeftEnd();
    mq.keystroke('Right');
    type(mq, '{x}');
    expect(el.value).toContain('\\left\\{x\\right\\}');
  });
  it('keeps curly braces around a typed absolute-value pair', () => {
    const { el, mq } = mountAppField();
    type(mq, '{|');
    expect(el.value).toBe('\\left\\{\\left|\\right|\\right\\}');
    type(mq, 'x|}');
    expect(el.value).toBe('\\left\\{\\left|x\\right|\\right\\}');
  });

  it('keeps command argument braces working', () => {
    const { el, mq } = mountAppField();
    type(mq, '\\frac{1}{2}');
    expect(el.value).toBe('\\frac{1}{2}');
  });
  it('accepts the brace after typing the left delimiter command', () => {
    const { el, mq } = mountAppField();
    type(mq, 'A=\\left\\{');
    expect(el.value).toBe('A=\\left\\{\\right\\}');
  });
});
