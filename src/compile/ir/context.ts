import type { Issue,MathJson,PairTupleMode } from './types';

export interface NormalizeCtx {
  /** Names declared callable by statements seen so far, in cell order. */
  declaredFns: Set<string>;
  /** Names a python cell's `def`/`lambda` binds (pydefs.ts) — a
   *  registered name juxtaposed to an argument is a call even when no
   *  Delimiter group marks it (a pmatrix absorbs the parens). */
  pyFns: ReadonlySet<string>;
  /** The 2-element paren-tuple lowering for this pass. */
  pairTuple: PairTupleMode;
  /** True when the node sits in statement position (a top-level child of
   *  a Block, or the cell's single statement). */
  atStatement: boolean;
  /** True inside Limits bounds, where 'Nothing' means an indefinite
   *  operator rather than an empty slot. */
  allowNothing: boolean;
  /** True in name slots (assignment targets, def params, integral
   *  variables) — strings there keep literal meaning. */
  asName: boolean;
  /** Recursive normalize; the non-statement expression position is the
   *  default (the flags today's `normalize(n, false)` calls used). */
  norm(
    n: MathJson,
    atStatement?: boolean,
    allowNothing?: boolean,
    asName?: boolean,
  ): MathJson;
  /** Push an issue into the current cell's issue list. */
  issue(severity: Issue['severity'], message: string): void;
}

// Sentinel for "shape matched but the fold doesn't apply" — see above.
export const DECLINE = Symbol('normalize-decline');

export interface NormalizeRule {
  /** Stable id — the audit/test handle for this fold. */
  name: string;
  /** The decision the rule implements — why the fold exists, including
   *  real ordering constraints on its position in the list. */
  why: string;
  /** Pure shape test. rewrite() runs only when this matches. */
  when(h: string, node: MathJson[], ctx: NormalizeCtx): boolean;
  /** The fold — or DECLINE to continue dispatch to later rules. */
  rewrite(
    node: MathJson[],
    ctx: NormalizeCtx,
  ): MathJson | typeof DECLINE;
}

