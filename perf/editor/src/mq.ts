// MathQuill backend: the app's own <math-field> element (vendored
// MathQuill + the capture-phase wrappers that ship with it). This is the
// element as the app embeds it, minus app-level extras (autocomplete,
// pickers, menus) which a port would re-implement on any engine.

import {
  defineMathField,
  type MathFieldElement,
} from '../../../src/editor/math-field';
import { mountPoint, makeInputCounter } from './bench';

defineMathField();

const mountEl = mountPoint();
const counter = makeInputCounter();
const fields: MathFieldElement[] = [];

const addField = () => {
  const el = document.createElement('math-field') as MathFieldElement;
  mountEl.appendChild(el);
  // Smart mode off: the battery measures raw keystroke->paint — inline
  // shortcuts/autoSubscriptNumerals would rewrite the probe input. The
  // vendored patch accepts '' = off.
  el.config({ autoCommands: '', autoSubscriptNumerals: false });
  el.addEventListener('input', counter.bump);
  fields.push(el);
};
addField();

window.bench = {
  inputCount: counter.n,
  count: () => fields.length,
  getValue: (i = 0) => fields[i]?.value ?? '',
  setValue: (i, latex) => {
    fields[i].value = latex;
  },
  focus: (i, edge) => fields[i].focus({ edge }),
  mountOne: () => (addField(), fields.length),
};
