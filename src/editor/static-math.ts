import { mq3 } from './mathquill';

export interface StaticMathHandle {
  set: (latex: string) => void;
}

// Read-only MathQuill rendering for computed output (calculator target).
// The element's owner drops the node on unmount; no dispose is needed.
export function mountStaticMath(el: HTMLElement): StaticMathHandle {
  const sm = mq3.StaticMath(el);
  return { set: (latex) => sm.latex(latex) };
}
