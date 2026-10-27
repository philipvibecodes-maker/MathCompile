import type { NormalizeCtx } from './context';
import { head,isArray,isString } from './shapes';
import type { MathJson } from './types';

// Differential marks: plain `d`/`d_upright` symbols and the quoted
// `'d'` string literal that `\text{d}` produces.
const DIFF_MARKS = new Set(['d', 'd_upright', "'d'", "'d_upright'"]);
export const isDiffMark = (v: MathJson | undefined): boolean =>
  v !== undefined && isString(v) && DIFF_MARKS.has(v);

// A `d`-power: `d`, `d^2`, or the same inside a Power node.
const diffPower = (
  v: MathJson | undefined,
): { is: boolean; order: MathJson | undefined } => {
  if (isDiffMark(v)) return { is: true, order: undefined };
  if (isArray(v) && head(v) === 'Power' && v.length === 3 && isDiffMark(v[1]))
    return { is: true, order: v[2] };
  return { is: false, order: undefined };
};

// `\frac{d f}{d x}` written with \text{d} (or d_upright) never becomes
// CE's `D` — it survives as Divide('d', Multiply('d', x)) and the calc
// pipeline would emit `d / (d * x) * f` = f/x — silently wrong. Match
// the quotient shape so the caller can fold it to D(body, x[, order]).
export const dQuotient = (
  num: MathJson,
  den: MathJson,
):
  | { body?: MathJson; x: MathJson; order: MathJson | undefined }
  | null => {
  if (!isArray(den) || (head(den) !== 'Multiply' && head(den) !== 'InvisibleOperator'))
    return null;
  const dp = diffPower(den[1]);
  if (!dp.is || den.length !== 3) return null;
  let order = dp.order;
  let x: MathJson;
  if (isArray(den[2]) && head(den[2]) === 'Power' && den[2].length === 3) {
    x = den[2][1];
    if (order !== undefined && JSON.stringify(order) !== JSON.stringify(den[2][2]))
      return null;
    order = den[2][2];
  } else {
    x = den[2];
    if (order !== undefined) return null; // d^2 / (d x) — not a clean
    // nth-order quotient; leave it a fraction.
  }
  const np = diffPower(num);
  if (np.is) {
    if (np.order !== undefined && order !== undefined &&
        JSON.stringify(np.order) !== JSON.stringify(order))
      return null;
    return { x, order: order ?? np.order };
  }
  if (
    isArray(num) &&
    (head(num) === 'Multiply' || head(num) === 'InvisibleOperator')
  ) {
    const nq = diffPower(num[1]);
    if (!nq.is) return null;
    if (nq.order !== undefined && order !== undefined &&
        JSON.stringify(nq.order) !== JSON.stringify(order))
      return null;
    const tail = num.slice(2);
    return {
      body: tail.length === 1 ? tail[0] : ['Multiply', ...tail],
      x,
      order: order ?? nq.order,
    };
  }
  return null;
};

// Scan a product's normalized factors for a d-quotient and fold it to
// `D(body, x[, order])` — returns the rewritten factor list, or null.
export const foldDQuotient = (args: MathJson[]): MathJson[] | null => {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!isArray(a) || head(a) !== 'Divide' || a.length !== 3) continue;
    const q = dQuotient(a[1], a[2]);
    if (!q) continue;
    const rest = args.filter((_, j) => j !== i);
    if (q.body !== undefined) {
      // `\frac{df}{dx} g` — g stays a factor outside the derivative.
      const d: MathJson =
        q.order !== undefined
          ? ['D', q.body, q.x, q.order]
          : ['D', q.body, q.x];
      return [...args.slice(0, i), d, ...args.slice(i + 1)];
    }
    if (rest.length === 0) return null; // `\frac{d}{dx}` alone — leave it.
    const body: MathJson =
      rest.length === 1 ? rest[0] : ['Multiply', ...rest];
    return [
      q.order !== undefined ? ['D', body, q.x, q.order] : ['D', body, q.x],
    ];
  }
  return null;
};

// `\text{D}` marks — the quoted 'D' literal the `\D` insertion alias
// (and the 'd-total-alias' latex rewrite) produces. They must be read
// on RAW children: norming unquotes 'D' to a plain D symbol.
const isTotalDMark = (v: MathJson | undefined): boolean => v === "'D'";

// A `\text{D}`-power: `\text{D}`, `\text{D}^2` — total-derivative order.
const totalDPower = (
  v: MathJson | undefined,
): { is: boolean; order: MathJson | undefined } => {
  if (isTotalDMark(v)) return { is: true, order: undefined };
  if (
    isArray(v) &&
    head(v) === 'Power' &&
    v.length === 3 &&
    isTotalDMark(v[1])
  )
    return { is: true, order: v[2] };
  return { is: false, order: undefined };
};

// `\frac{\D f}{\D x}` on raw children — the same quotient shapes as
// dQuotient keyed on the 'D' literal, folding to TotalD slots.
export const tdQuotient = (
  num: MathJson,
  den: MathJson,
):
  | { body?: MathJson; x: MathJson; order: MathJson | undefined }
  | null => {
  if (
    !isArray(den) ||
    (head(den) !== 'Multiply' && head(den) !== 'InvisibleOperator') ||
    den.length !== 3
  )
    return null;
  const dp = totalDPower(den[1]);
  if (!dp.is) return null;
  let order = dp.order;
  let x: MathJson;
  if (isArray(den[2]) && head(den[2]) === 'Power' && den[2].length === 3) {
    x = den[2][1];
    if (
      order !== undefined &&
      JSON.stringify(order) !== JSON.stringify(den[2][2])
    )
      return null;
    order = den[2][2];
  } else {
    x = den[2];
    if (order !== undefined) return null; // \D^2 / (\D x) — not a clean
    // nth-order quotient; leave it a fraction.
  }
  const np = totalDPower(num);
  if (np.is) {
    if (
      np.order !== undefined &&
      order !== undefined &&
      JSON.stringify(np.order) !== JSON.stringify(order)
    )
      return null;
    return { x, order: order ?? np.order };
  }
  if (
    isArray(num) &&
    (head(num) === 'Multiply' || head(num) === 'InvisibleOperator')
  ) {
    const nq = totalDPower(num[1]);
    if (!nq.is) return null;
    if (
      nq.order !== undefined &&
      order !== undefined &&
      JSON.stringify(nq.order) !== JSON.stringify(order)
    )
      return null;
    const tail = num.slice(2);
    return {
      body: tail.length === 1 ? tail[0] : ['Multiply', ...tail],
      x,
      order: order ?? nq.order,
    };
  }
  return null;
};

// True when a 'D' literal appears anywhere inside a node — a mark that
// must fold before norming unquotes it to a plain D symbol.
export const hasTotalDMark = (v: MathJson): boolean =>
  isTotalDMark(v) || (isArray(v) && v.some((c) => hasTotalDMark(c)));

// Fold the `\D` (`\text{D}`) operator inside a juxtaposition — runs on
// the RAW factor list since norming would unquote the mark. The
// notation is asymmetric: bare `\D f` / `\D(f)` is the TOTAL
// derivative — the Jacobian, which takes no variable — while `\D_x f`
// is a PARTIAL in x and folds to the ordinary D head. `\frac{\D}{\D}`
// is not the notation: it still folds to TotalD with a variable so
// codegen can flag it.
export const foldTotalD = (
  rawArgs: MathJson[],
  ctx: NormalizeCtx,
): MathJson | null => {
  const normVar = (v: MathJson): MathJson => ctx.norm(v, false, false, true);
  const bodyOf = (parts: MathJson[]): MathJson =>
    parts.length === 1
      ? ctx.norm(parts[0])
      : (['Multiply', ...parts.map((n) => ctx.norm(n))] as MathJson);
  const first = rawArgs[0];
  // `\D_x f` / `\D_x^2 f` — a PARTIAL in x: the ordinary D head, so
  // other symbols stay constants.
  const sub =
    isArray(first) &&
    head(first) === 'Subscript' &&
    first.length === 3 &&
    isTotalDMark(first[1])
      ? { x: first[2], order: undefined as MathJson | undefined }
      : isArray(first) &&
          head(first) === 'Power' &&
          first.length === 3 &&
          isArray(first[1]) &&
          head(first[1]) === 'Subscript' &&
          first[1].length === 3 &&
          isTotalDMark(first[1][1])
        ? { x: first[1][2], order: first[2] as MathJson | undefined }
        : null;
  if (sub !== null && rawArgs.length > 1)
    return sub.order !== undefined
      ? ['D', bodyOf(rawArgs.slice(1)), normVar(sub.x), ctx.norm(sub.order)]
      : ['D', bodyOf(rawArgs.slice(1)), normVar(sub.x)];
  // `\D f` / `\D^2 f` — a bare mark: the TOTAL derivative (Jacobian),
  // no variable. 'Nothing' holds the var slot so a following slot can
  // carry the order without colliding with the fraction form's var.
  const dp = totalDPower(first);
  if (dp.is && rawArgs.length > 1)
    return dp.order !== undefined
      ? ['TotalD', bodyOf(rawArgs.slice(1)), 'Nothing', ctx.norm(dp.order)]
      : ['TotalD', bodyOf(rawArgs.slice(1))];
  // A `\frac{\D f}{\D x}` factor — the same two placements as the
  // d-quotient fold.
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (!isArray(a) || head(a) !== 'Divide' || a.length !== 3) continue;
    const q = tdQuotient(a[1], a[2]);
    if (!q) continue;
    const x = normVar(q.x);
    if (q.body !== undefined) {
      // `\frac{\D f}{\D x} g` — g stays a factor outside the derivative.
      const d: MathJson =
        q.order !== undefined
          ? ['TotalD', ctx.norm(q.body), x, ctx.norm(q.order)]
          : ['TotalD', ctx.norm(q.body), x];
      const factors = [
        ...rawArgs.slice(0, i).map((n) => ctx.norm(n)),
        d,
        ...rawArgs.slice(i + 1).map((n) => ctx.norm(n)),
      ];
      return factors.length === 1 ? factors[0] : ['Multiply', ...factors];
    }
    const rest = rawArgs.filter((_, j) => j !== i);
    if (rest.length === 0) return null; // `\frac{\D}{\D x}` alone — leave it.
    return q.order !== undefined
      ? ['TotalD', bodyOf(rest), x, ctx.norm(q.order)]
      : ['TotalD', bodyOf(rest), x];
  }
  return null;
};

