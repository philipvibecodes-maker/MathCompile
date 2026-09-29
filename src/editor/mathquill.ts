// The only place the app imports the vendored MathQuill build (challenges.md
// §2-style boundary). Side-effect import installs window.MathQuill; we then
// pin interface v3 — the jQuery-free API surface.
import '../../vendor/mathquill/build/mathquill.js';
import '../../vendor/mathquill/build/mathquill.css';

export const MQ = window.MathQuill.getInterface(3);

export type MathField = MathQuill.v3.EditableMathQuill;
export type MQConfig = MathQuill.v3.Config;
export const { L, R } = MQ;
