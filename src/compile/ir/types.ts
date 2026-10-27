// MathJSON is untyped JSON: head arrays, bare symbol strings, numbers, and
// occasional `{num: "..."}` / `{str: "..."}` wrappers.
export type RawMathJson =
  | string
  | number
  | boolean
  | { [key: string]: unknown }
  | RawMathJson[];

// Compatibility name at the external Compute Engine boundary.
export type MathJson = RawMathJson;

export interface Issue {
  severity: 'error' | 'note';
  message: string;
  /** 0-based input line (displayline index) the issue was raised at,
   * when codegen can place it — where a line-anchored indicator pins. */
  line?: number;
}

export interface NormResult {
  ok: boolean;
  ir: MathJson | undefined;
  issues: Issue[];
}


// How a two-element paren tuple `(a,b)` lowers: the open interval
// (default) or a 1×2 row matrix. Plumbed from the settings pref; three
// or more elements always lower to a row matrix either way.
export type PairTupleMode = 'interval' | 'matrix';
export interface NormalizeOptions {
  pairTuple?: PairTupleMode;
  /** Names a python cell's `def`/`lambda` resolves to (pydefs.ts) —
   *  `\mathrm{relu}(x)` lowers to a `call` like a declared fn instead
   *  of raising the unknown-head note. */
  pyFns?: ReadonlySet<string>;
}

