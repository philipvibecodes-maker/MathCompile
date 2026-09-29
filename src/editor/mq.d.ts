// The vendored build is a plain IIFE that sets window.MathQuill.
// (vendor/mathquill/src/mathquill.d.ts is in tsconfig include — ambient.)
declare module '*/mathquill.js';

interface Window {
  MathQuill: MathQuill.MathQuill;
}
