// Translates MathQuill latex into nerdamer input syntax. Simple latex
// (algebra, \frac, \sqrt{x}, powers) goes through nerdamer's own
// convertFromLaTeX; the calculus commands its parser chokes on are
// mapped onto the equivalent nerdamer CAS calls so interim results
// still compute: \int→integrate/defint, \sum→sum, \prod→product,
// \lim→limit, \frac{d}{dx}→diff, \binom→factorials, \sqrt[n]→nthroot.

export interface NerdamerExpr {
  toString(): string;
  toTeX(): string;
}
export interface Nerdamer {
  (input: string): NerdamerExpr;
  convertFromLaTeX(latex: string): NerdamerExpr;
}

type Rec = (s: string) => string;

interface CmdMatch {
  start: number;
  end: number; // offset after the command's args ('rest' args → src.length)
  out: string; // nerdamer input for the command itself
}

type Matcher = (src: string, rec: Rec) => CmdMatch | null;

// Reads a {balanced} group (or a single unbraced token) at s[i].
function readGroup(
  s: string,
  i: number,
): { content: string; end: number } | null {
  if (s[i] === '{') {
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') {
        depth--;
        if (depth === 0) return { content: s.slice(i + 1, j), end: j + 1 };
      }
    }
    return null;
  }
  const m = /^\s*([a-zA-Z0-9]+)/.exec(s.slice(i));
  return m ? { content: m[1], end: i + m[0].length } : null;
}

const skipWs = (s: string, i: number): number => {
  while (s[i] === ' ') i++;
  return i;
};

// After \int / \sum / \prod / \lim: optional _{lo} and ^{hi} in either
// order (MathQuill writes sub before sup). Returns [lo, hi, endIndex].
function readBounds(s: string, i: number): [string, string, number] {
  let lo = '';
  let hi = '';
  for (let k = 0; k < 2; k++) {
    i = skipWs(s, i);
    const ch = s[i];
    if (ch !== '_' && ch !== '^') break;
    const g = readGroup(s, i + 1);
    if (!g) break;
    if (ch === '_') lo = g.content;
    else hi = g.content;
    i = g.end;
  }
  return [lo, hi, i];
}

// Strips a trailing differential (dx, \,dx, \mathrm{d}x …) from an
// integrand; returns [integrand, var].
function splitDifferential(s: string): [string, string] {
  const m =
    /(?:\\,|\\;|\s)*(?:\\mathrm\{d\}|\\text\{d\}|\\operatorname\{d\}|\bd)\s*([a-zA-Z])\s*$/.exec(
      s,
    );
  if (m) return [s.slice(0, m.index), m[1]];
  return [s, 'x'];
}

const nonempty = (s: string): boolean => s.trim() !== '';

// Constant of integration for the interim result — first capital letter
// not appearing in the cell's latex (C, else D, E, …). Mirrors codegen's
// nextConstName so interim and SymPy rows agree on the letter.
function constLetter(src: string): string {
  const used = new Set(src.match(/[A-Z]/g) ?? []);
  return 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !used.has(l)) ?? 'C';
}

// \int_{lo}^{hi} f dx → defint(f, lo, hi, var); without bounds →
// integrate(f, var) + C. The integrand is the rest of the line.
const matchInt: Matcher = (src, rec) => {
  const start = src.indexOf('\\int');
  if (start < 0) return null;
  const [lo, hi, end] = readBounds(src, start + 4);
  const [body, dvar] = splitDifferential(src.slice(end));
  const inner = nonempty(body) ? rec(body) : 'x';
  if (nonempty(lo) !== nonempty(hi))
    // Half-empty bounds are an error on the real engine — produce an
    // empty interim rather than a wrong definite/indefinite guess.
    return { start, end: src.length, out: '' };
  if (nonempty(lo) && nonempty(hi)) {
    return {
      start,
      end: src.length,
      out: `defint(${inner}, ${rec(lo)}, ${rec(hi)}, ${dvar})`,
    };
  }
  // Parens keep +C bound to the integral when it sits inside a larger
  // expression.
  return {
    start,
    end: src.length,
    out: `(integrate(${inner}, ${dvar})+${constLetter(src)})`,
  };
};

// \sum_{i=lo}^{hi} f → sum(f, i, lo, hi); \prod likewise.
const matchSumProd =
  (cmd: 'sum' | 'prod', fn: 'sum' | 'product'): Matcher =>
  (src, rec) => {
    const start = src.indexOf(`\\${cmd}`);
    if (start < 0) return null;
    const [lo, hi, end] = readBounds(src, start + cmd.length + 1);
    const idx = /^\s*([a-zA-Z])\s*=\s*(.*)$/.exec(lo);
    if (!idx || !nonempty(idx[2]) || !nonempty(hi)) {
      // Bounds were written but don't form a complete i=lo..hi pair —
      // poison the interim rather than letting leaf-fallback text
      // produce a nonsense row.
      if (nonempty(lo) || nonempty(hi))
        return { start, end: src.length, out: '' };
      return null;
    }
    const inner = rec(src.slice(end));
    return {
      start,
      end: src.length,
      out: `${fn}(${inner}, ${idx[1]}, ${rec(idx[2])}, ${rec(hi)})`,
    };
  };

// \lim_{x\to a} f → limit(f, x, a)
const matchLim: Matcher = (src, rec) => {
  const start = src.indexOf('\\lim');
  if (start < 0) return null;
  const [lo, , end] = readBounds(src, start + 4);
  const m = /^\s*([a-zA-Z])\s*(?:\\to|\\rightarrow)\s*(.*)$/.exec(lo);
  if (!m || !nonempty(m[2])) {
    // \lim with bound text it can't read (\lim_{x\to}) — poison the
    // interim rather than showing stripped-latex garbage.
    if (nonempty(lo)) return { start, end: src.length, out: '' };
    return null;
  }
  const inner = rec(src.slice(end));
  return {
    start,
    end: src.length,
    out: `limit(${inner}, ${m[1]}, ${rec(m[2])})`,
  };
};

// \frac{d}{dx} f  (MathQuill emits \frac{d }{d x} for \derivative) →
// diff(f, x); \frac{d^n}{dx^n} → diff(f, x, n).
const matchDiff: Matcher = (src, rec) => {
  const m = /\\[dt]?frac/.exec(src);
  if (!m) return null;
  const num = readGroup(src, skipWs(src, m.index + m[0].length));
  const den = num ? readGroup(src, skipWs(src, num.end)) : null;
  if (!num || !den) return null;
  const n1 = /^d\s*(?:\^\{?(\d+)\}?)?\s*$/.exec(num.content);
  const v = /^d\s*([a-zA-Z])\s*(?:\^\{?(\d+)\}?)?\s*$/.exec(den.content);
  if (!n1 || !v) return null;
  const order = n1[1] ?? v[2];
  const inner = rec(src.slice(den.end));
  return {
    start: m.index,
    end: src.length,
    out: `diff(${inner}, ${v[1]}${order ? `, ${order}` : ''})`,
  };
};

// \binom{a}{b} → factorial(a)/(factorial(b)*factorial(a-b)) —
// nerdamer has no binomial; the expansion evaluates for numbers and
// renders as factorials for symbols.
const matchBinom: Matcher = (src, rec) => {
  const start = src.indexOf('\\binom');
  if (start < 0) return null;
  const a = readGroup(src, skipWs(src, start + 6));
  const b = a ? readGroup(src, skipWs(src, a.end)) : null;
  if (!a || !b) return null;
  const A = rec(a.content);
  const B = rec(b.content);
  return {
    start,
    end: b.end,
    out: `factorial(${A})/(factorial(${B})*factorial(${A}-${B}))`,
  };
};

// \sqrt[n]{x} → nthroot(x, n)
const matchNthroot: Matcher = (src, rec) => {
  const start = src.indexOf('\\sqrt');
  if (start < 0) return null;
  const open = src.indexOf('[', start);
  if (open < 0 || open > skipWs(src, start + 5)) return null;
  const close = src.indexOf(']', open);
  if (close < 0) return null;
  const x = readGroup(src, skipWs(src, close + 1));
  if (!x) return null;
  return {
    start,
    end: x.end,
    out: `nthroot(${rec(x.content)}, ${rec(src.slice(open + 1, close))})`,
  };
};

const MATCHERS: Matcher[] = [
  matchInt,
  matchSumProd('sum', 'sum'),
  matchSumProd('prod', 'product'),
  matchLim,
  matchDiff,
  matchBinom,
  matchNthroot,
];

function leaf(src: string, nerdamer: Nerdamer): string {
  try {
    return nerdamer.convertFromLaTeX(src).toString();
  } catch {
    // Last-ditch: plain braces are the main thing nerdamer can't read
    // — stripped latex is close enough for a best-effort interim.
    return src.replace(/[{}]/g, '');
  }
}

const START_OP = /^[=+\-*/^),:;,]/;
const END_OP = /[=+\-*/^(,:;]$/;

export function toNerdamerInput(src: string, nerdamer: Nerdamer): string {
  const rec = (s: string) => toNerdamerInput(s, nerdamer);
  let best: CmdMatch | null = null;
  for (const match of MATCHERS) {
    const m = match(src, rec);
    if (m && (best === null || m.start < best.start)) best = m;
  }
  if (!best) return leaf(src, nerdamer);

  let out = '';
  const before = src.slice(0, best.start).trim();
  const after = src.slice(best.end).trim();
  if (before !== '') {
    out += leaf(before, nerdamer);
    if (!END_OP.test(out)) out += '*';
  }
  out += best.out;
  if (after !== '') {
    // Keep a leading operator verbatim — rec() would feed '+\sqrt{2}'
    // to convertFromLaTeX, which eats the unary + (a+b → a*b).
    if (START_OP.test(after)) {
      out += after[0];
      out += rec(after.slice(1));
    } else {
      out += `*${rec(after)}`;
    }
  }
  return out;
}
