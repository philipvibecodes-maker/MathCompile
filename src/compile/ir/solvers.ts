import type { NormalizeCtx } from './context';
import { delimiterArgs,head,isArray,isDelimiterGroup,isString,isSymbolString } from './shapes';
import type { MathJson } from './types';

const solveItems = (n: MathJson | undefined): MathJson[] => {
  if (!isArray(n)) return n === undefined ? [] : [n];
  const h = head(n);
  if (
    h === 'Delimiter' &&
    isArray(n[1]) &&
    head(n[1]) === 'Sequence'
  )
    return n[1].slice(1);
  if (h === 'List' || h === 'Set' || h === 'Tuple') return n.slice(1);
  if (
    h === 'Interval' &&
    n.slice(1).every((a) => isArray(a) && head(a) === 'Equal')
  )
    return n.slice(1);
  return [n];
};

// A whole item spelling a dependent variable: `y`, `y(x)`, `u(x,t)`.
const depSpecOf = (
  n: MathJson,
): { name: string; vars: string[] } | null => {
  if (isSymbolString(n)) return { name: n, vars: [] };
  if (
    isArray(n) &&
    head(n) === 'InvisibleOperator' &&
    n.length === 3 &&
    isSymbolString(n[1]) &&
    isDelimiterGroup(n[2])
  ) {
    const args = delimiterArgs(n[2]);
    if (args.length > 0 && args.every(isSymbolString))
      return { name: n[1], vars: args as string[] };
  }
  return null;
};

// The evidence a node gives that `name` is a dependent variable:
// vars — independent variables it is differentiated/applied by,
// primed — it carries `'`/`''` notation (variable unknown until the
//   dep var's own var list resolves), subs — subscript-derivative
//   letters seen on `name_sub` strings, seen — any derivative sighting.
interface DepEvidence {
  vars: string[];
  primed: boolean;
  subs: string[];
  seen: boolean;
}
const depEvidenceFor = (
  acc: Map<string, DepEvidence>,
  name: string,
): DepEvidence => {
  const e = acc.get(name) ?? { vars: [], primed: false, subs: [], seen: false };
  e.seen = true;
  acc.set(name, e);
  return e;
};
// `u_t`, `u_{xx}`, `u_{xt}` — the PDE notation the user guide
// documents: `name_sub` with an all-letter subscript of up to 3
// variables reads as derivatives of `name` by each subscript letter.
// Digits (`u_0`) and longer names (`u_max`) are ordinary variables.
const SUB_DERIV_RE = /^([A-Za-z]+)_([a-zA-Z]{1,3})$/;
const collectDepEvidence = (
  n: MathJson,
  acc: Map<string, DepEvidence>,
): void => {
  if (!isArray(n)) {
    if (isSymbolString(n)) {
      const m = SUB_DERIV_RE.exec(n);
      if (m) {
        const e = depEvidenceFor(acc, m[1]);
        for (const c of m[2]) if (!e.subs.includes(c)) e.subs.push(c);
      }
    }
    return;
  }
  const h = head(n);
  // D(f, v[, v…]) — `D(u,x,x)` is diff(u, x, x); repeated vars count once.
  if (h === 'D' && isString(n[1])) {
    const e = depEvidenceFor(acc, n[1]);
    for (const v of n.slice(2))
      if (isString(v) && !e.vars.includes(v)) e.vars.push(v);
  } else if (h === 'Prime' && isString(n[1])) {
    depEvidenceFor(acc, n[1]).primed = true;
  } else if (h === 'Derivative' && isString(n[1])) {
    depEvidenceFor(acc, n[1]);
  } else if (
    h === 'Apply' &&
    isArray(n[1]) &&
    head(n[1]) === 'Derivative' &&
    isString(n[1][1])
  ) {
    // `y^{(k)}(x)` — the callee pins the variable list.
    const e = depEvidenceFor(acc, n[1][1]);
    for (const v of n.slice(2))
      if (isString(v) && !e.vars.includes(v)) e.vars.push(v);
  }
  for (const c of n.slice(1)) collectDepEvidence(c, acc);
};

// Rewrite prime and subscript derivative notation for dependent
// variables into D nodes, so the normalized equation is uniformly
// `D(name, v, …)` / `Apply(Derivative(name,k), pt)` shaped.
const rewriteDepNotation = (
  n: MathJson,
  ivars: (name: string) => string[] | undefined,
  issue: NormalizeCtx['issue'],
): MathJson => {
  if (!isArray(n)) {
    if (isSymbolString(n)) {
      const m = SUB_DERIV_RE.exec(n);
      if (!m) return n;
      const vs = ivars(m[1]);
      if (vs === undefined) return n;
      const extra = [...m[2]].filter((c) => !vs.includes(c));
      if (extra.length > 0)
        issue(
          'error',
          `${n} differentiates ${m[1]} by ${extra.join(', ')} — ${m[1]} is a function of (${vs.join(', ')})`,
        );
      return ['D', m[1], ...m[2]] as MathJson;
    }
    return n;
  }
  if (head(n) === 'Prime' && isString(n[1])) {
    const vs = ivars(n[1]);
    if (vs !== undefined) {
      if (vs.length !== 1) {
        issue(
          'error',
          `'${n[1]}' notation needs a single independent variable — write \\frac{d${n[1]}}{dx} or name the variable explicitly`,
        );
        return n;
      }
      return n.length >= 3
        ? (['D', n[1], vs[0], n[2]] as MathJson)
        : (['D', n[1], vs[0]] as MathJson);
    }
  }
  return [
    n[0],
    ...n.slice(1).map((c) => rewriteDepNotation(c, ivars, issue)),
  ] as MathJson;
};

// `f(<pt>) = rhs` / `f^(k)(<pt>) = rhs` under a dsolve/pdesolve marker —
// an initial condition when `f` is a dependent variable and the point
// is not the variable list itself (`y(x)=x^2` stays an equation).
const icShapeOf = (
  n: MathJson,
  isDep: (name: string) => boolean,
  ivars: (name: string) => string[] | undefined,
): { name: string; order: MathJson; pt: MathJson; rhs: MathJson } | null => {
  if (!isArray(n) || head(n) !== 'Equal' || n.length !== 3) return null;
  const atPt = (
    fn: MathJson,
    args: MathJson[],
    order: MathJson,
  ): { name: string; order: MathJson; pt: MathJson; rhs: MathJson } | null => {
    if (!isString(fn) || !isDep(fn) || args.length !== 1) return null;
    const pt = args[0];
    if (isString(pt) && (ivars(fn) ?? []).includes(pt)) return null;
    return { name: fn, order, pt, rhs: n[2] };
  };
  const lhs = n[1];
  if (
    isArray(lhs) &&
    head(lhs) === 'InvisibleOperator' &&
    lhs.length === 3 &&
    isDelimiterGroup(lhs[2])
  )
    return atPt(lhs[1], delimiterArgs(lhs[2]), 'Nothing');
  if (
    isArray(lhs) &&
    head(lhs) === 'Apply' &&
    isArray(lhs[1]) &&
    head(lhs[1]) === 'Derivative' &&
    lhs.length === 3
  )
    return atPt(lhs[1][1], [lhs[2]], lhs[1][2] ?? 1);
  return null;
};

// Lower a ['SolveMark', kind, body] statement to its Solve/DSolve/
// PDESolve node. Children normalize with atStatement=false — the eqs
// stay Equal (never Assign) inside the solver head.
export function solveMarkedStatement(
  kind: string,
  body: MathJson | undefined,
  ctx: NormalizeCtx,
): MathJson {
  // `\text{solve} eq \text{ for } cond` arrives as Comprehension(eq, cond)
  // — the cond supplies the domain (`x \in S`, `x > 0`) or the variable.
  let domain: MathJson | undefined;
  if (isArray(body) && head(body) === 'Comprehension' && body.length === 3) {
    domain = body[2];
    body = body[1];
  }
  const items = solveItems(body);
  if (items.length === 0) {
    ctx.issue('error', `a \\text{${kind}} statement needs an equation to solve`);
    return ['Error', `'empty-${kind}'`];
  }
  if (kind === 'solve') {
    // Trailing bare symbols are the variables to solve for —
    // `\text{solve} x^2=1, x`. A non-trailing bare name stays an equation.
    const vars: string[] = [];
    while (items.length > 1 && isSymbolString(items[items.length - 1]))
      vars.unshift(items.pop() as string);
    const eqs =
      items.length === 1
        ? ctx.norm(items[0])
        : (['List', ...items.map((i) => ctx.norm(i))] as MathJson);
    const vs = ['List', ...vars] as MathJson;
    return domain === undefined
      ? ['Solve', eqs, vs]
      : ['Solve', eqs, vs, ctx.norm(domain)];
  }
  // dsolve/pdesolve family. First gather every dependent-variable
  // sighting so `f(pt)=…` reads as an initial condition only when `f`
  // is one of the unknowns.
  const evidence = new Map<string, DepEvidence>();
  for (const it of items) collectDepEvidence(it, evidence);
  const specNames = new Set<string>();
  const specVars = new Map<string, string[]>();
  for (const it of items) {
    const spec = depSpecOf(it);
    if (spec !== null && !specNames.has(spec.name)) {
      specNames.add(spec.name);
      specVars.set(spec.name, spec.vars);
      if (!evidence.has(spec.name)) depEvidenceFor(evidence, spec.name);
    }
  }
  const depNames = [...evidence.keys()];
  const ivars = (name: string): string[] | undefined => {
    if (!depNames.includes(name)) return undefined;
    const declared = specVars.get(name);
    const e = evidence.get(name)!;
    if (declared !== undefined && declared.length > 0) {
      const extra = e.vars.filter((v) => !declared.includes(v));
      if (extra.length > 0)
        ctx.issue(
          'error',
          `${name} is differentiated by ${extra.join(', ')} but declared a function of (${declared.join(', ')})`,
        );
      return declared;
    }
    const vars = [...e.vars];
    for (const c of e.subs) if (!vars.includes(c)) vars.push(c);
    if (vars.length === 0 && e.primed) vars.push('x');
    return vars;
  };
  const eqs: MathJson[] = [];
  const ics: MathJson[] = [];
  for (const it of items) {
    if (depSpecOf(it) !== null) continue;
    const ic = icShapeOf(it, (n) => depNames.includes(n), ivars);
    if (ic !== null) {
      ics.push(
        ['IC', ic.name, ic.order, ctx.norm(ic.pt), ctx.norm(ic.rhs)] as MathJson,
      );
      continue;
    }
    eqs.push(it);
  }
  if (eqs.length === 0) {
    ctx.issue('error', `a \\text{${kind}} statement needs an equation to solve`);
    return ['Error', `'empty-${kind}'`];
  }
  if (domain !== undefined)
    ctx.issue('note', `a \\text{for} domain only reads on \\text{solve} — ignored here`);
  const rewritten = eqs.map((e) =>
    rewriteDepNotation(e, ivars, ctx.issue),
  );
  const eqsN =
    rewritten.length === 1
      ? ctx.norm(rewritten[0])
      : (['List', ...rewritten.map((e) => ctx.norm(e))] as MathJson);
  const depsN = [
    'List',
    ...depNames.map(
      (name) => ['DepVar', name, ...ivars(name)!] as MathJson,
    ),
  ] as MathJson;
  const icsN = ['List', ...ics] as MathJson;
  return kind === 'pdesolve' || kind === 'pde'
    ? ['PDESolve', eqsN, depsN, icsN]
    : ['DSolve', eqsN, depsN, icsN];
}
// or a relational bound on the variable (x >= 0, 0 <= x <= 1). Returns
// the variable plus an Interval/Set domain node when one is expressible.
