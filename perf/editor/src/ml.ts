// MathLive backend: the stock <math-field> custom element (the same tag
// name our element uses — the spec's locators work unchanged).

import 'mathlive';
import 'mathlive/fonts.css';
import type { MathfieldElement } from 'mathlive';
import { mountPoint, makeInputCounter } from './bench';

const mountEl = mountPoint();
const counter = makeInputCounter();
const fields: MathfieldElement[] = [];

const addField = () => {
  const el = document.createElement('math-field') as MathfieldElement;
  mountEl.appendChild(el);
  // Match the MQ harness: no inline shortcuts / smart-mode rewriting of
  // the probe input, and never pop the virtual keyboard mid-run.
  el.smartMode = false;
  el.inlineShortcuts = {};
  el.mathVirtualKeyboardPolicy = 'manual';
  el.addEventListener('input', counter.bump);
  fields.push(el);
};
addField();

window.bench = {
  inputCount: counter.n,
  count: () => fields.length,
  getValue: (i = 0) => fields[i]?.getValue() ?? '',
  setValue: (i, latex) => fields[i].setValue(latex),
  focus: (i, edge) => {
    fields[i].focus();
    if (edge === 'start') fields[i].executeCommand('moveToMathfieldStart');
    else if (edge === 'end') fields[i].executeCommand('moveToMathfieldEnd');
  },
  mountOne: () => (addField(), fields.length),
};
