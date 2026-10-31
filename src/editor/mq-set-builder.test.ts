// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { copyableLatex, outputLatex } from '../compile/latex';
import { compileWorksheet } from '../compile/codegen';
import { parseCellLatex } from '../compile/ir';
import { HELP_TOPICS } from '../help/topics';
import { mountAppField, type } from './test-field';

describe('set-builder smart separators', () => {
  for (const [word, latex] of [['where', '\\mid'], ['st', '\\operatorname{s.t.}']]) {
    it(`expands ${word} and compiles the resulting multi-variable set`, () => {
      const { el, mq } = mountAppField();
      type(mq, '{(x,y)');
      type(mq, word);
      expect(el.value).toContain(latex);
      type(mq, 'x+y=1}');
      const out = compileWorksheet([{ json: parseCellLatex(el.value) }], 'python', { importAll: false });
      expect(out.issues).toEqual([]);
      expect(out.cellLines[0].at(-1)).toBe('sp.ConditionSet((x, y), sp.Eq(x + y, 1))');
      expect(copyableLatex(el.value)).toContain(latex.trim());
      expect(outputLatex(el.value)).toContain(latex.trim());
    });
  }

  it('inserts the help template and places the caret before mid', () => {
    const { el, mq, handle } = mountAppField();
    const topic = HELP_TOPICS.find((t) => t.id === 'setbuilder')!;
    expect(handle.insertLatex!(topic.insert!)).toBe(true);
    expect(el.value).toBe('\\left\\{\\mid\\right\\}');
    type(mq, '(x,y)');
    expect(el.value).toBe('\\left\\{\\left(x,y\\right)\\mid\\right\\}');
    mq.keystroke('Right');
    type(mq, 'x+y=1');
    expect(el.value).toBe('\\left\\{\\left(x,y\\right)\\mid x+y=1\\right\\}');
  });

  for (const separator of ['\\mid', '\\operatorname{s.t.}', '\\text{s.t.}']) {
    it(`Tab and Shift-Tab cross ${separator} without changing the expression`, () => {
      const { el, mq } = mountAppField();
      el.value = `\\left\\{${separator}\\right\\}`;
      mq.keystroke('Ctrl-Home Right');
      type(mq, 'x');
      const before = el.value;
      mq.keystroke('Tab');
      expect(el.value).toBe(before);
      type(mq, 'y');
      mq.keystroke('Shift-Tab');
      type(mq, 'z');
      expect(el.value).toBe(`\\left\\{xz${separator}${separator === '\\mid' ? ' ' : ''}y\\right\\}`);
    });
  }

  it('Tab crosses from inside the element tuple', () => {
    const { el, mq } = mountAppField();
    el.value = '\\left\\{\\left(x,y\\right)\\mid\\right\\}';
    mq.keystroke('Ctrl-Home Right Right');
    mq.keystroke('Tab');
    type(mq, 'x+y=1');
    expect(el.value).toBe('\\left\\{\\left(x,y\\right)\\mid x+y=1\\right\\}');
  });

  it('Tab still switches fraction arguments within a set element', () => {
    const { el, mq } = mountAppField();
    el.value = '\\left\\{\\frac{x}{y}\\mid x>0\\right\\}';
    mq.keystroke('Ctrl-Home Right Right Tab');
    type(mq, 'z');
    expect(el.value).toContain('\\frac{x}{zy}');
  });

  it('leaves words as letters with smart mode disabled', () => {
    const { el, mq } = mountAppField({ autoCommands: '' });
    type(mq, 'where st');
    expect(el.value).toBe('where\\ st');
  });

  it('supports explicit command entry with smart mode disabled', () => {
    const { el, mq } = mountAppField({ autoCommands: '' });
    type(mq, '\\st');
    mq.keystroke('Enter');
    expect(el.value).toBe('\\operatorname{s.t.}');
    type(mq, '\\where');
    mq.keystroke('Enter');
    expect(el.value).toBe('\\operatorname{s.t.}\\mid');
  });
});
