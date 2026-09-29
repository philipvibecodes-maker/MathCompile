/// <reference path="../../vendor/mathquill/src/mathquill.d.ts" />
// Vendored MathQuill bundle: a side-effect script that sets window.MathQuill.
import '../../vendor/mathquill/build/mathquill.js';
import '../../vendor/mathquill/build/mathquill.css';

export type MQ = MathQuill.v3.EditableMathQuill;
export type MQConfig = MathQuill.v3.Config;
export type MQDirection = MathQuill.Direction;

export const mq3: MathQuill.v3.API = (
  window as unknown as { MathQuill: MathQuill.MathQuill }
).MathQuill.getInterface(3);
