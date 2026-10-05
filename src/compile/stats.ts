// scipy.stats-backed builtins: `\mathrm{normcdf}(x,\mu,\sigma)`-style
// distribution methods and `\mathrm{ttest}(d,\mu)`-style one-sample
// statistics emit scipy.stats/numpy calls. scipy isn't in the base
// engine payload — calculator.worker.ts lazy-loads it the first time a
// program's prelude carries the import line emitted for these cells.
//
// Function names are flat `<dist><method>` spellings of the scipy.stats
// API (norm.pdf -> \mathrm{normpdf}). The emitted program stays the
// honest runnable artifact: cells that use stats get the
// `import scipy.stats as st`/`import numpy as np` prelude lines.

/** Import/helper lines a stats-using cell's prelude needs. */
export const SCIPY_IMPORT_PY = 'import scipy.stats as st';
export const NUMPY_IMPORT_PY = 'import numpy as np';
export const MC_MEAN_CI_PY = `def mc_mean_ci(data, conf=0.95):
    # t-based confidence interval for the sample mean
    d = list(data)
    return st.t.interval(conf, len(d) - 1, loc=np.mean(d), scale=st.sem(d))`;

export interface StatsUsage {
  usesScipy: boolean;
  usesNumpy: boolean;
  usesMeanCi: boolean;
}

export function statsPreludeLines(u: StatsUsage): string[] {
  return [
    ...(u.usesScipy ? [SCIPY_IMPORT_PY] : []),
    ...(u.usesNumpy ? [NUMPY_IMPORT_PY] : []),
    ...(u.usesMeanCi ? [MC_MEAN_CI_PY] : []),
  ];
}

interface StatsDist {
  /** scipy.stats attribute (`st.<scipy>`). */
  scipy: string;
  /** Discrete distribution — pmf for pdf, and fit isn't offered. */
  discrete?: true;
  /** Latex params after the point/data arg: [name, default?]. No
   * default = required. */
  params: [name: string, def?: string][];
  /** scipy positional tail built from the emitted params; '%i'
   * substitutes the i-th latex arg (1-based). Entries emit up to the
   * last one whose % refs were all provided — earlier literal entries
   * (the `0` loc placeholders) ride along positionally. */
  tail: string[];
}

const STATS_DISTS: Record<string, StatsDist> = {
  norm: {
    scipy: 'norm',
    params: [['loc', '0'], ['scale', '1']],
    tail: ['%1', '%2'],
  },
  t: {
    scipy: 't',
    params: [['df'], ['loc', '0'], ['scale', '1']],
    tail: ['%1', '%2', '%3'],
  },
  chi2: {
    scipy: 'chi2',
    params: [['df'], ['loc', '0'], ['scale', '1']],
    tail: ['%1', '%2', '%3'],
  },
  // scipy's expon/gamma/lognorm take (loc, scale); the latex sig drops
  // the nonstandard leading loc and fills it with 0.
  expon: { scipy: 'expon', params: [['scale', '1']], tail: ['0', '%1'] },
  gamma: { scipy: 'gamma', params: [['a'], ['scale', '1']], tail: ['%1', '0', '%2'] },
  lognorm: { scipy: 'lognorm', params: [['s'], ['scale', '1']], tail: ['%1', '0', '%2'] },
  // uniform takes interval endpoints (a, b); scipy wants loc, scale.
  uniform: {
    scipy: 'uniform',
    params: [['a', '0'], ['b', '1']],
    tail: ['%1', '(%2) - (%1)'],
  },
  beta: {
    scipy: 'beta',
    params: [['a'], ['b'], ['loc', '0'], ['scale', '1']],
    tail: ['%1', '%2', '%3', '%4'],
  },
  cauchy: { scipy: 'cauchy', params: [['loc', '0'], ['scale', '1']], tail: ['%1', '%2'] },
  f: { scipy: 'f', params: [['dfn'], ['dfd']], tail: ['%1', '%2'] },
  binom: { scipy: 'binom', discrete: true, params: [['n'], ['p']], tail: ['%1', '%2'] },
  nbinom: { scipy: 'nbinom', discrete: true, params: [['n'], ['p']], tail: ['%1', '%2'] },
  poisson: { scipy: 'poisson', discrete: true, params: [['mu']], tail: ['%1'] },
  geom: { scipy: 'geom', discrete: true, params: [['p']], tail: ['%1'] },
  hypergeom: {
    scipy: 'hypergeom',
    discrete: true,
    params: [['M'], ['n'], ['N']],
    tail: ['%1', '%2', '%3'],
  },
};

type DistMethodKind = 'point' | 'params' | 'conf' | 'size' | 'data';
interface DistMethod {
  suffix: string;
  scipy: string;
  kind: DistMethodKind;
  /** Keyword arg appended after the positional tail (stats only). */
  kw?: string;
}

// Longest suffixes first — 'isf' must win over 'sf', 'interval'/'median'
///'moment'/'stats'/'mean'/'var'/'std' all end in shorter suffixes ('f'
// dist + 'sf' etc. resolve by longest match then prefix lookup).
const DIST_METHODS: DistMethod[] = [
  { suffix: 'interval', scipy: 'interval', kind: 'conf' },
  { suffix: 'median', scipy: 'median', kind: 'params' },
  { suffix: 'moment', scipy: 'moment', kind: 'point' },
  { suffix: 'stats', scipy: 'stats', kind: 'params', kw: "moments='mvsk'" },
  { suffix: 'mean', scipy: 'mean', kind: 'params' },
  { suffix: 'std', scipy: 'std', kind: 'params' },
  { suffix: 'var', scipy: 'var', kind: 'params' },
  { suffix: 'pdf', scipy: 'pdf', kind: 'point' },
  { suffix: 'pmf', scipy: 'pmf', kind: 'point' },
  { suffix: 'cdf', scipy: 'cdf', kind: 'point' },
  { suffix: 'ppf', scipy: 'ppf', kind: 'point' },
  { suffix: 'isf', scipy: 'isf', kind: 'point' },
  { suffix: 'sf', scipy: 'sf', kind: 'point' },
  { suffix: 'rvs', scipy: 'rvs', kind: 'size' },
  { suffix: 'fit', scipy: 'fit', kind: 'data' },
];

interface SampleFunc {
  /** What the emitted call needs imported: 'st' = scipy.stats,
   * 'np' = numpy, 'ci' = the mc_mean_ci helper (implies both). */
  needs: 'st' | 'np' | 'ci';
  /** Extra args after the data operand: [min, max]. Default none. */
  rest?: [min: number, max: number];
  /** The helper wraps its own arg in list() — pass the emitted operand
   * raw instead of pre-wrapping. */
  rawData?: true;
  build: (data: string, rest: string[], sp: string) => string;
}

const SAMPLE_FUNCS: Record<string, SampleFunc> = {
  smean: { needs: 'np', build: (d) => `np.mean(${d})` },
  smedian: { needs: 'np', build: (d) => `np.median(${d})` },
  median: { needs: 'np', build: (d) => `np.median(${d})` },
  svar: { needs: 'np', build: (d) => `np.var(${d}, ddof=1)` },
  var: { needs: 'np', build: (d) => `np.var(${d}, ddof=1)` },
  sstd: { needs: 'np', build: (d) => `np.std(${d}, ddof=1)` },
  std: { needs: 'np', build: (d) => `np.std(${d}, ddof=1)` },
  smin: { needs: 'np', build: (d) => `np.min(${d})` },
  smax: { needs: 'np', build: (d) => `np.max(${d})` },
  sem: { needs: 'st', build: (d) => `st.sem(${d})` },
  skew: { needs: 'st', build: (d) => `st.skew(${d})` },
  kurtosis: { needs: 'st', build: (d) => `st.kurtosis(${d})` },
  iqr: { needs: 'st', build: (d) => `st.iqr(${d})` },
  gmean: { needs: 'st', build: (d) => `st.gmean(${d})` },
  hmean: { needs: 'st', build: (d) => `st.hmean(${d})` },
  describe: { needs: 'st', build: (d) => `st.describe(${d})` },
  zscore: {
    needs: 'st',
    build: (d, _r, sp) => `${sp}Matrix(st.zscore(${d}).tolist())`,
  },
  ttest: {
    needs: 'st',
    rest: [0, 1],
    build: (d, r) => `st.ttest_1samp(${d}, ${r[0] ?? '0'})`,
  },
  meanconf: {
    needs: 'ci',
    rest: [0, 1],
    rawData: true,
    build: (d, r) => `mc_mean_ci(${d}, ${r[0] ?? '0.95'})`,
  },
};

// True when `name` (a possibly-quoted call head) is one of the stats
// builtins — used by ir.ts to skip the "unknown head" note and by
// codegen to dispatch before the generic call tier.
export function isStatsName(name: string): boolean {
  const unquoted = /^'(.+)'$/.exec(name)?.[1] ?? name;
  const lower = unquoted.toLowerCase();
  if (lower in SAMPLE_FUNCS) return true;
  for (const m of DIST_METHODS) {
    if (!lower.endsWith(m.suffix)) continue;
    if (lower.slice(0, -m.suffix.length) in STATS_DISTS) return true;
  }
  return false;
}

interface EmitCtx {
  /** Emit an arg node to Python source. */
  emit: (n: unknown) => string;
  /** Emit an honest stub for a flagged call (`fn(name)(args)`). */
  stub: (name: string) => string;
  flag: (severity: 'error' | 'note', message: string) => void;
  /** `sp.` in qualified mode, '' under `from sympy import *`. */
  sp: string;
  usage: StatsUsage;
}

// Emit the scipy call for a stats function name, or undefined when the
// name isn't one of the builtins (the caller falls through to the
// generic Function-stub tier). Emitting anything marks usage on ctx so
// the prelude picks up the scipy/numpy import lines.
export function emitStatsCall(
  name: string,
  argNodes: unknown[],
  ctx: EmitCtx,
): string | undefined {
  // `\mathrm{normmean}()` arrives with a CE 'Nothing' arg marker —
  // treat missing slots as absent args.
  const args = argNodes.filter((a) => a !== 'Nothing');
  const lower = name.toLowerCase();
  const sample = SAMPLE_FUNCS[lower];
  if (sample !== undefined) {
    const rest = args.slice(1);
    const [minRest, maxRest] = sample.rest ?? [0, 0];
    if (args.length === 0 || rest.length < minRest || rest.length > maxRest) {
      const want =
        maxRest > minRest
          ? `${1 + minRest} or ${1 + maxRest} arguments`
          : 'a data list';
      ctx.flag('error', `${name} needs ${want}`);
      return ctx.stub(name);
    }
    const data = sample.rawData
      ? ctx.emit(args[0])
      : `list(${ctx.emit(args[0])})`;
    markUsage(ctx.usage, sample.needs);
    return sample.build(data, rest.map((a) => ctx.emit(a)), ctx.sp);
  }
  for (const meth of DIST_METHODS) {
    if (!lower.endsWith(meth.suffix)) continue;
    const dist = STATS_DISTS[lower.slice(0, -meth.suffix.length)];
    if (dist === undefined) continue;
    return emitDistCall(name, dist, meth, args, ctx);
  }
  return undefined;
}

function markUsage(u: StatsUsage, needs: 'st' | 'np' | 'ci'): void {
  if (needs === 'np') u.usesNumpy = true;
  else if (needs === 'st') u.usesScipy = true;
  else {
    u.usesScipy = true;
    u.usesNumpy = true;
    u.usesMeanCi = true;
  }
}

function emitDistCall(
  name: string,
  dist: StatsDist,
  meth: DistMethod,
  argNodes: unknown[],
  ctx: EmitCtx,
): string {
  const arity = (want: string): string => {
    ctx.flag('error', `${name} needs ${want}`);
    return ctx.stub(name);
  };
  // pdf/pmf aren't interchangeable — scipy exposes only the matching one.
  if (meth.suffix === 'pdf' && dist.discrete)
    return arity(`${name.slice(0, -3)}pmf (discrete distributions have pmf, not pdf)`);
  if (meth.suffix === 'pmf' && !dist.discrete)
    return arity(`${name.slice(0, -3)}pdf (continuous distributions have pdf, not pmf)`);
  if (meth.kind === 'data') {
    if (dist.discrete)
      return arity('a continuous distribution (scipy fits only those)');
    if (argNodes.length !== 1) return arity('one data list');
    ctx.usage.usesScipy = true;
    return `st.${dist.scipy}.fit(list(${ctx.emit(argNodes[0])}))`;
  }
  const hasLead =
    meth.kind === 'point' || meth.kind === 'conf' || meth.kind === 'size';
  const params = hasLead ? argNodes.slice(1) : argNodes;
  if (hasLead && argNodes.length === 0) return arity('an argument');
  const required = dist.params.filter((p) => p[1] === undefined).length;
  if (params.length < required || params.length > dist.params.length) {
    const sig = dist.params.map((p) => p[0]).join(', ');
    return arity(
      required === dist.params.length
        ? `${required} distribution arg${required === 1 ? '' : 's'} (${sig})`
        : `the point and ${required}-${dist.params.length} distribution args (${sig})`,
    );
  }
  const emittedParams = params.map((a) => ctx.emit(a));
  // Emit the positional tail through the last entry whose %-refs are all
  // provided — literal entries inside that prefix (the `0` loc) emit
  // positionally, trailing ones fall back to scipy's defaults.
  let tailEnd = 0;
  dist.tail.forEach((t, i) => {
    const refs = [...t.matchAll(/%(\d)/g)].map((m) => Number(m[1]));
    if (refs.length > 0 && refs.every((r) => r <= params.length))
      tailEnd = i + 1;
  });
  const tail = dist.tail
    .slice(0, tailEnd)
    .map((t) => t.replace(/%(\d)/g, (_, i) => emittedParams[Number(i) - 1]));
  const tailStr = tail.length > 0 ? `, ${tail.join(', ')}` : '';
  ctx.usage.usesScipy = true;
  const lead = hasLead ? `${ctx.emit(argNodes[0])}` : '';
  switch (meth.kind) {
    case 'point':
      return `st.${dist.scipy}.${meth.scipy}(${lead}${tailStr})`;
    case 'params': {
      const kw = meth.kw ? `${tail.length > 0 ? ', ' : ''}${meth.kw}` : '';
      return `st.${dist.scipy}.${meth.scipy}(${tail.join(', ')}${kw})`;
    }
    case 'conf':
      return `st.${dist.scipy}.interval(${lead}${tailStr})`;
    case 'size':
      return `${ctx.sp}Matrix(st.${dist.scipy}.rvs(${tail.join(', ')}${tail.length > 0 ? ', ' : ''}size=${lead}).tolist())`;
  }
}
