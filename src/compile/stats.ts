// scipy.stats-backed builtins: `\mathrm{normcdf}(x,\mu,\sigma)`-style
// distribution methods and `\mathrm{ttest}(d,\mu)`-style sample statistics
// (one-sample, two-sample, and hypothesis tests) emit scipy.stats/numpy
// calls. scipy isn't in the base
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
  /** Extra args after the data operand(s): [min, max]. Default none. */
  rest?: [min: number, max: number];
  /** How many leading args are data operands (wrapped in list()).
   * Default 1; 'all' wraps every arg for variadic multi-sample tests. */
  nData?: number | 'all';
  /** Minimum data operands — only with nData 'all' (default 2). */
  minData?: number;
  /** The helper wraps its own arg — pass the emitted operand(s)
   * raw instead of pre-wrapping (scalar-arity tests). */
  rawData?: true;
  /** Coerce data operands to floats — scipy's bartlett raises on
   * int-typed samples (its NaN-fill path can't write to an int
   * array on newer versions). */
  floatData?: true;
  /** Wrap rest args in list() too (chisquare's f_exp). */
  listRest?: true;
  /** Emit rest args as quoted strings (kstest's dist name). */
  quoteRest?: true;
  /** What the call wants, for the arity-error message. */
  want?: string;
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
  // Two-sample tests — both operands are list()-wrapped.
  ttestind: { needs: 'st', nData: 2, build: (d) => `st.ttest_ind(${d})` },
  ttestrel: { needs: 'st', nData: 2, build: (d) => `st.ttest_rel(${d})` },
  mannwhitneyu: {
    needs: 'st',
    nData: 2,
    build: (d) => `st.mannwhitneyu(${d})`,
  },
  wilcoxon: { needs: 'st', nData: 2, build: (d) => `st.wilcoxon(${d})` },
  ks2samp: { needs: 'st', nData: 2, build: (d) => `st.ks_2samp(${d})` },
  pearsonr: { needs: 'st', nData: 2, build: (d) => `st.pearsonr(${d})` },
  spearmanr: { needs: 'st', nData: 2, build: (d) => `st.spearmanr(${d})` },
  kendalltau: { needs: 'st', nData: 2, build: (d) => `st.kendalltau(${d})` },
  // Multi-sample tests — variadic, at least two samples (friedman ≥ 3).
  levene: { needs: 'st', nData: 'all', build: (d) => `st.levene(${d})` },
  bartlett: {
    needs: 'st',
    nData: 'all',
    floatData: true,
    build: (d) => `st.bartlett(${d})`,
  },
  fligner: { needs: 'st', nData: 'all', build: (d) => `st.fligner(${d})` },
  foneway: { needs: 'st', nData: 'all', build: (d) => `st.f_oneway(${d})` },
  friedman: {
    needs: 'st',
    nData: 'all',
    minData: 3,
    build: (d) => `st.friedmanchisquare(${d})`,
  },
  // Normality and goodness-of-fit — one sample.
  shapiro: { needs: 'st', build: (d) => `st.shapiro(${d})` },
  normaltest: { needs: 'st', build: (d) => `st.normaltest(${d})` },
  jarquebera: { needs: 'st', build: (d) => `st.jarque_bera(${d})` },
  skewtest: { needs: 'st', build: (d) => `st.skewtest(${d})` },
  kurtosistest: { needs: 'st', build: (d) => `st.kurtosistest(${d})` },
  kstest: {
    needs: 'st',
    rest: [0, 1],
    quoteRest: true,
    build: (d, r) => `st.kstest(${d}, ${r[0] ?? "'norm'"})`,
  },
  anderson: {
    needs: 'st',
    rest: [0, 1],
    quoteRest: true,
    build: (d, r) => `st.anderson(${d}, ${r[0] ?? "'norm'"})`,
  },
  chisquare: {
    needs: 'st',
    rest: [0, 1],
    listRest: true,
    build: (d, r) =>
      `st.chisquare(${d}${r[0] !== undefined ? `, ${r[0]}` : ''})`,
  },
  // Scalar-arity test — counts, not data lists.
  binomtest: {
    needs: 'st',
    rawData: true,
    rest: [1, 2],
    want: 'k, n, and optionally p',
    build: (d, r) =>
      `st.binomtest(${d}, ${r[0]}${r[1] !== undefined ? `, ${r[1]}` : ''})`,
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
    const nData = sample.nData === 'all' ? args.length : (sample.nData ?? 1);
    const minData =
      sample.nData === 'all' ? (sample.minData ?? 2) : (sample.nData ?? 1);
    const rest = args.slice(nData);
    const [minRest, maxRest] = sample.rest ?? [0, 0];
    if (
      args.length < minData ||
      rest.length < minRest ||
      rest.length > maxRest
    ) {
      ctx.flag(
        'error',
        `${name} needs ${sampleWant(sample, minData, minRest, maxRest)}`,
      );
      return ctx.stub(name);
    }
    const data = args
      .slice(0, nData)
      .map((a) =>
        sample.rawData
          ? ctx.emit(a)
          : sample.floatData
            ? `list(map(float, ${ctx.emit(a)}))`
            : `list(${ctx.emit(a)})`,
      )
      .join(', ');
    const emittedRest = rest.map((a) => {
      if (sample.quoteRest) return `'${ctx.emit(a)}'`;
      if (sample.listRest) return `list(${ctx.emit(a)})`;
      return ctx.emit(a);
    });
    markUsage(ctx.usage, sample.needs);
    return sample.build(data, emittedRest, ctx.sp);
  }
  for (const meth of DIST_METHODS) {
    if (!lower.endsWith(meth.suffix)) continue;
    const dist = STATS_DISTS[lower.slice(0, -meth.suffix.length)];
    if (dist === undefined) continue;
    return emitDistCall(name, dist, meth, args, ctx);
  }
  return undefined;
}

// The arity-error tail for a sample func — 'a data list', '2 data lists',
// 'at least N data lists' for the variadic tests, plus a rest-arg clause.
function sampleWant(
  f: SampleFunc,
  minData: number,
  minRest: number,
  maxRest: number,
): string {
  if (f.want !== undefined) return f.want;
  if (f.nData === 'all') return `at least ${minData} data lists`;
  const data = minData > 1 ? `${minData} data lists` : 'a data list';
  const extra =
    minRest === maxRest
      ? minRest > 0
        ? ` and ${minRest} more argument${minRest > 1 ? 's' : ''}`
        : ''
      : ` and ${minRest}–${maxRest} more arguments`;
  return data + extra;
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
