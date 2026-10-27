import type { MathJson } from '../ir';
import type { Scope } from './scope';
import type { StatementOut } from './types';
import { isArr, isStr, isHead, headOf } from './nodes';
import { pyIdent } from './identifiers';
import { freeNames } from './analysis';
import { emitPlotPython, plotDomainBounds } from './plotting';

interface StatementEmitter {
  scope: Scope;
  emit(node: MathJson | undefined, minPrec?: number): string;
  assumingWrap(node: MathJson): string | null;
  matrixValued(node: MathJson | undefined, minted?: boolean): boolean;
  isSetish(node: MathJson | undefined): boolean;
  isFiniteSet(node: MathJson | undefined): boolean;
  emitMember(node: MathJson): string;
  relationalDomain(node: MathJson | undefined): [string, string] | undefined;
}

const CALC_LAYOUT_WORDS: Record<string, string> = {
  nullspace: 'span',
  Kernel: 'span',
  ker: 'span',
  columnspace: 'span',
  eigenvects: 'eigenvects',
};

function calcDisplayLayout(node: MathJson): string | undefined {
  if (!isArr(node)) return undefined;
  const h = headOf(node);
  if (h !== 'call' && h !== 'MatrixMethod') return undefined;
  const w = isStr(node[1]) ? node[1] : undefined;
  return w === undefined ? undefined : CALC_LAYOUT_WORDS[w];
}

// Emit a single expression statement, dropping it when emission flagged
// an error — a broken statement produces `sp.Error(...)`/`None` fragments
// that just repeat what the issues list already says.
function emitExprStatement(node: MathJson, emitter: StatementEmitter): StatementOut {
  const before = emitter.scope.errorCount;
  const line = emitter.emit(node);
  if (emitter.scope.errorCount !== before) return { lines: [] };
  // Compound memberships (`x \in (a,b]`) emit inside `with assuming(...)`
  // so Contains sees the member's implied domain; the membership itself
  // stays the row's display expression.
  const wrap = emitter.assumingWrap(node);
  if (wrap) return { lines: [wrap, `    ${line}`], display: line };
  // Structured results (a basis, eigen-triples) eval through the
  // runtime's layout markers on the calculator path — the python
  // target keeps the plain SymPy call.
  const layout = calcDisplayLayout(node);
  if (layout !== undefined)
    return {
      lines: [line],
      calcLines: [`clean_and_simplify(${line}, layout='${layout}')`],
    };
  return { lines: [line] };
}

// A `\python` body's last line can be an expression — eval it and show
// the value (REPL lane), like the trailing line at a python prompt.
// Returns undefined for statement-ending bodies (they echo the source):
// statement keywords, assignments, `;` chains, suite members (indented
// or `\`-continued), and unbalanced brackets — the conservative check
// keeps a partial expression from replacing the source with a
// SyntaxError row.
const PY_STMT_LINE_RE =
  /^[ \t]*(def|class|import|from|if|elif|else|for|while|try|except|finally|with|return|raise|assert|del|global|nonlocal|pass|break|continue|yield)\b/;
// `=` that isn't part of ==, !=, <=, >=, :=, +=, **=, … — assignment
// lines exec but aren't eval'able expressions.
const PY_ASSIGN_RE = /(?<![=<>!:+\-*/%&|^~@])=(?![=>])/;

// `def`/`async def` blocks (decorators included), `name = lambda` binds,
// and `# @latex` annotation comments are definitions — worksheet inputs,
// not results — so they never echo as a result row. The rest of the
// source still echoes per the REPL convention; an empty remainder means
// the cell only binds functions and evaluates silently.
const PY_DEF_LINE_RE = /^(?:async[ \t]+)?def[ \t]/;
const PY_LAMBDA_ASSIGN_RE =
  /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*[ \t]*(?::[^=\n]+)?=[ \t]*lambda\b/;
const PY_LATEX_NOTE_RE = /^#[ \t]*@?latex\b/;

function pythonSourceSansDefs(code: string): string {
  const kept: string[] = [];
  // `dropping` marks lines inside a def region (decorators, signature,
  // suite, and the blank/comment run that follows it). `cont` is an open
  // bracket/backslash continuation — those lines belong to whichever
  // statement opened them.
  let dropping = false;
  let cont = false;
  let depth = 0;
  for (const raw of code.split('\n')) {
    const line = raw.trim();
    if (cont) {
      for (const c of raw) {
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
      }
      cont = depth > 0 || line.endsWith('\\');
      if (!dropping) kept.push(raw);
      continue;
    }
    if (line === '' || line.startsWith('#')) {
      if (!dropping && !PY_LATEX_NOTE_RE.test(line)) kept.push(raw);
      continue;
    }
    if (/^\s/.test(raw)) {
      // Indented lines are suite members of the open region.
      if (!dropping) kept.push(raw);
      continue;
    }
    // A fresh top-level statement ends any open def suite.
    dropping =
      line.startsWith('@') ||
      PY_DEF_LINE_RE.test(line) ||
      PY_LAMBDA_ASSIGN_RE.test(line);
    if (!dropping) kept.push(raw);
    depth = 0;
    for (const c of raw) {
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
    }
    cont = depth > 0 || line.endsWith('\\');
  }
  return kept.join('\n');
}

function trailingPythonExpr(code: string): string | undefined {
  const lines = code.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#')) continue;
    if (
      lines[i - 1]?.trimEnd().endsWith('\\') || // glued to the line above
      /^\s/.test(lines[i]) || // suite member, not a top-level line
      PY_STMT_LINE_RE.test(line) ||
      PY_ASSIGN_RE.test(line) ||
      line.includes(';') ||
      /[+\-*/%&|^~@<>=,\\]$/.test(line)
    )
      return undefined;
    let depth = 0;
    for (const c of line) {
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      if (depth < 0) return undefined;
    }
    return depth === 0 ? line : undefined;
  }
  return undefined;
}

// `a = 5` shows `a = 5` — a fresh Symbol for the target renders the raw
// name (`x_{1}` shows subscripted, not `x_1`). Matrix/set RHSs need
// evaluate=False: Eq(Symbol, Matrix|FiniteSet) collapses to literal False.
function assignDisplay(
  sp: string,
  name: string,
  rhs: string,
  matrixRhs = false,
): string {
  const uneval = matrixRhs ? ', evaluate=False' : '';
  return `${sp}Eq(${sp}Symbol(${JSON.stringify(name)}), ${rhs}${uneval})`;
}

export function emitStatement(node: MathJson, emitter: StatementEmitter): StatementOut {
  const sp = emitter.scope.qualified ? 'sp.' : '';
  if (!isArr(node)) return emitExprStatement(node, emitter);
  const h = headOf(node);
  if (h === 'Assign') {
    // RHS emits first so `x = x + 1` collects x as a symbol; the Assign
    // then marks `x` bound for later statements/cells.
    const before = emitter.scope.errorCount;
    const rhs = emitter.emit(node[2]);
    // (x, y) = (1, 2) — python tuple-unpack; every member binds.
    if (isHead(node[1], 'List')) {
      const members = node[1].slice(1).filter(isStr);
      for (const m of members) emitter.scope.markDefined(m);
      if (emitter.scope.errorCount > before) return { lines: [] };
      const idents = members.map(pyIdent).join(', ');
      return {
        lines: [`${idents} = ${rhs}`],
        display: `${sp}Eq(${sp}Tuple(${members
          .map((m) => `${sp}Symbol(${JSON.stringify(m)})`)
          .join(', ')}), ${emitter.emitMember(node[2])}, evaluate=False)`,
        defines: true,
      };
    }
    const name = isStr(node[1]) ? node[1] : 'result';
    // `f = x \mapsto body` binds a callable — later `f(…)` call-folds
    // like a def'd name instead of flagging a bound-value call.
    const lambdaMatrixFn =
      isStr(node[1]) &&
      isHead(node[2], 'Function') &&
      (isHead(node[2][1], 'List') ||
        isHead(node[2][1], 'Tuple') ||
        emitter.matrixValued(node[2][1], true));
    if (isStr(node[1]) && isHead(node[2], 'Function'))
      emitter.scope.declareFn(node[1]);
    // Matrix-valued by shape, not by emitted text — `I_2` emits
    // `sp.eye(2)`, `B = A^T` emits `Transpose`, and Eq(Symbol, <matrix>)
    // collapses to literal False without evaluate=False. `\nabla` always
    // emits a Matrix; a multivariate `\D` takes the Jacobian branch —
    // the emitted text is the ground truth for which one it took.
    const matrixRhs =
      emitter.matrixValued(node[2], true) ||
      (isHead(node[2], 'TotalD') && rhs.includes('.jacobian('));
    const setRhs = emitter.isSetish(node[2]);
    const finiteRhs = emitter.isFiniteSet(node[2]);
    const listRhs =
      isHead(node[2], 'List') ||
      (isStr(node[2]) && emitter.scope.kinds.listNames.has(node[2]));
    if (isStr(node[1]))
      // One transition: bound + all value-kind sets refreshed + the
      // name's function residue cleared (see bindAssigned).
      emitter.scope.bindAssigned(name, {
        matrix: matrixRhs,
        set: setRhs,
        finite: finiteRhs,
        list: listRhs,
      });
    // The lambda's params are the callable's declared signature — after
    // bindAssigned so the record isn't cleared, and kept out of `fnArgs`
    // (which carries observed call-site args that merge across sites).
    // A later `\D f`/`\nabla f` applies f at its own arity.
    if (isStr(node[1]) && isHead(node[2], 'Function')) {
      emitter.scope.emit.lambdaParams.set(node[1], node[2].slice(2));
      if (lambdaMatrixFn) emitter.scope.emit.matrixFns.add(node[1]);
    }
    if (emitter.scope.errorCount > before) return { lines: [] };
    // A python-list RHS binds a raw list (`u = [1, 2, 3]`), which
    // Eq can't sympify — display it as the column vector the ops
    // treat it as, unevaluated like other matrix/set RHSes.
    const displayRhs =
      listRhs && !matrixRhs ? `${sp}Matrix(${rhs})` : rhs;
    return {
      lines: [`${pyIdent(name)} = ${rhs}`],
      display: assignDisplay(
        sp,
        name,
        displayRhs,
        matrixRhs || setRhs || listRhs,
      ),
      defines: true,
    };
  }
  // `\text{def} f(x)` — a declaration without a body: f binds an
  // undefined function so `f'(x)` and operand uses still apply it.
  if (h === 'Declare') {
    const name = isStr(node[1]) ? node[1] : 'f';
    const params = isHead(node[2], 'List')
      ? node[2].slice(1).filter(isStr)
      : [];
    emitter.scope.claimFunction(name, params);
    return {
      lines: [`${pyIdent(name)} = ${sp}Function(${JSON.stringify(name)})`],
      // Zero params: show `f` (the function itself), not `f()`.
      display:
        params.length === 0
          ? `${sp}Function(${JSON.stringify(name)})`
          : `${sp}Function(${JSON.stringify(name)})(${params
              .map((p) => `${sp}Symbol(${JSON.stringify(p)})`)
              .join(', ')})`,
      defines: true,
    };
  }
  if (h === 'Def') {
    const name = isStr(node[1]) ? node[1] : 'f';
    const params =
      isHead(node[2], 'List') ? node[2].slice(1).filter(isStr) : [];
    const before = emitter.scope.errorCount;
    const body = emitter.scope.withBoundOnly(params, () =>
      emitter.emit(node[3]),
    );
    // A later bare `f` in operand position emits `f(<params>)` — an
    // unapplied function object raises TypeError as an operand.
    emitter.scope.claimFunction(name, params);
    // A vector/matrix body means `f(…)` (and `D_x f`, `\D f`) is
    // matrix-valued — `\times` etc. take the matrix path on it.
    if (
      isHead(node[3], 'List') ||
      isHead(node[3], 'Tuple') ||
      emitter.matrixValued(node[3], true)
    )
      emitter.scope.emit.matrixFns.add(name);
    if (emitter.scope.errorCount > before) return { lines: [] };
    const idents = params.map(pyIdent).join(', ');
    // `f(x) = body` rendered via an undefined function — the def'd python
    // function would just evaluate back to body. The lambda binds the
    // param idents to fresh Symbols so the display needs no namespace
    // entries for the (def-local) parameters.
    // evaluate=False: Eq(expr, Matrix) collapses to literal False, so a
    // vector-valued def would display `False` instead of the signature.
    const display =
      params.length === 0
        ? `${sp}Eq(${sp}Function(${JSON.stringify(name)})(), ${body}, evaluate=False)`
        : `(lambda ${idents}: ${sp}Eq(${sp}Function(${JSON.stringify(name)})(${idents}), ${body}, evaluate=False))(${params
            .map((p) => `${sp}Symbol(${JSON.stringify(p)})`)
            .join(', ')})`;
    return {
      lines: [`def ${pyIdent(name)}(${idents}):`, `    return ${body}`],
      display,
      defines: true,
    };
  }
  // `f: x ↦ body` — the colon names the lambda's result; bind it (like
  // `f = x ↦ x²`) or a later `f(2)` stays unevaluated. Normalization
  // rewrites the typed signature two ways: a single param wraps into the
  // Function node as `call Typed(f, x)`, several params split out as a
  // top-level `call Colon(f, Function(body, x, y))`.
  if (h === 'Function' && node.length === 3) {
    const typed = node[2];
    if (
      isArr(typed) &&
      headOf(typed) === 'call' &&
      typed[1] === 'Typed' &&
      isStr(typed[2])
    ) {
      const name = typed[2];
      const sig = isStr(typed[3]) ? typed[3] : 'x';
      const before = emitter.scope.errorCount;
      const rhs = emitter.emit(['Function', node[1], sig]);
      emitter.scope.claimFunction(name, [sig]);
      if (
        isHead(node[1], 'List') ||
        isHead(node[1], 'Tuple') ||
        emitter.matrixValued(node[1], true)
      )
        emitter.scope.emit.matrixFns.add(name);
      if (emitter.scope.errorCount > before) return { lines: [] };
      return {
        lines: [`${pyIdent(name)} = ${rhs}`],
        display: assignDisplay(sp, name, rhs),
        defines: true,
      };
    }
  }
  if (
    h === 'call' &&
    node[1] === 'Colon' &&
    isStr(node[2]) &&
    isHead(node[3], 'Function')
  ) {
    const name = node[2];
    const before = emitter.scope.errorCount;
    const rhs = emitter.emit(node[3]);
    const colonParams = node[3].slice(2).filter(isStr);
    emitter.scope.claimFunction(name, colonParams);
    if (
      isHead(node[3][1], 'List') ||
      isHead(node[3][1], 'Tuple') ||
      emitter.matrixValued(node[3][1], true)
    )
      emitter.scope.emit.matrixFns.add(name);
    if (emitter.scope.errorCount > before) return { lines: [] };
    return {
      lines: [`${pyIdent(name)} = ${rhs}`],
      display: assignDisplay(sp, name, rhs),
      defines: true,
    };
  }
  // `\text{plot} <expr>` — the calculator's worker samples the value's
  // signature (free symbols × output shape) and the frontend renders it;
  // the python target emits the `sp.plot*` call the statically known
  // signature admits.
  if (h === 'Plot') {
    const before = emitter.scope.errorCount;
    const body = emitter.emit(node[1]);
    // A `\text{for}` domain carries per-variable (lo, hi) bounds —
    // either end may be absent (a one-sided bound keeps the signature's
    // default end; the worker fills None with its default).
    const bounds = plotDomainBounds(node[2]);
    const domain = new Map<string, { lo?: string; hi?: string }>(
      bounds.map(
        ({ v, lo, hi }): [string, { lo?: string; hi?: string }] => [
          v,
          {
            lo: lo === undefined ? undefined : emitter.emit(lo),
            hi: hi === undefined ? undefined : emitter.emit(hi),
          },
        ],
      ),
    );
    if (node[2] !== undefined && domain.size === 0)
      emitter.scope.flag(
        'note',
        'plot: the \\text{for} condition gave no usable variable bounds — plotting over the default window',
      );
    if (emitter.scope.errorCount > before) return { lines: [] };
    if (emitter.scope.plotTarget === 'calc') {
      const dom =
        domain.size === 0
          ? ''
          : `, {${[...domain]
              .map(
                ([v, { lo, hi }]) =>
                  `${JSON.stringify(v)}: (${lo ?? 'None'}, ${hi ?? 'None'})`,
              )
              .join(', ')}}`;
      return { lines: [`_mc_plot(${body}${dom})`], plot: true };
    }
    return emitPlotPython(node[1], body, emitter, domain);
  }
  // `\text{solve}` / `\text{dsolve}` / `\text{pdesolve}` statements.
  // IR: ['Solve', eqs, vars, domain?] — eqs a node or List, vars a List
  // of bare names, domain the `\text{for}` condition (Element or a
  // relational bound). ['DSolve'|'PDESolve', eqs, depVars, ics] — depVars
  // a List of ['DepVar', name, var…], ics a List of
  // ['IC', name, order|'Nothing', pt, rhs].
  if (h === 'Solve') {
    const eqNodes = isHead(node[1], 'List') ? node[1].slice(1) : [node[1]];
    const varNames = isHead(node[2], 'List')
      ? node[2].slice(1).filter(isStr)
      : [];
    const before = emitter.scope.errorCount;
    const eqTexts = eqNodes.map((e) => emitter.emit(e));
    if (emitter.scope.errorCount !== before) return { lines: [] };
    const eqText =
      eqTexts.length === 1 ? eqTexts[0] : `[${eqTexts.join(', ')}]`;
    // The names the answer row displays on the left of `x = a1, a2, …` —
    // explicit solve vars, or the `\text{for}` domain variable.
    let dispVars = varNames;
    let call: string;
    const domain = node[3];
    let rd: [string, string] | undefined;
    if (domain !== undefined) {
      // `eq \text{ for } x \in S` / `x > a` — solveset over the domain.
      if (isHead(domain, 'Element') && isStr(domain[1])) {
        call = `${sp}solveset(${eqText}, ${emitter.emit(domain[1])}, domain=${emitter.emit(domain[2])})`;
        if (dispVars.length === 0) dispVars = [domain[1]];
      } else if ((rd = emitter.relationalDomain(domain)) !== undefined) {
        call = `${sp}solveset(${eqText}, ${emitter.emit(rd[1])}, domain=${rd[0]})`;
        if (dispVars.length === 0) dispVars = [rd[1]];
      } else if (isStr(domain)) {
        // `eq \text{ for } x` — a bare variable is just the solve-var.
        call = `${sp}solve(${eqText}, ${emitter.emit(domain)})`;
        if (dispVars.length === 0) dispVars = [domain];
      } else {
        emitter.scope.flag(
          'note',
          'the \\text{for} condition could not be read as a domain — solving without one',
        );
        call = '';
      }
    } else call = '';
    if (call === '') {
      const vs = varNames.map((v) => emitter.emit(v));
      const varText =
        vs.length === 0
          ? ''
          : `, ${vs.length === 1 ? vs[0] : `[${vs.join(', ')}]`}`;
      call = `${sp}solve(${eqText}${varText})`;
    }
    if (dispVars.length === 0) {
      // `\text{solve} x^2 = 1` with no var — let SymPy infer it like
      // before, but still name the answer `x = …` when the equation
      // has exactly one free symbol.
      const free = [
        ...new Set(eqNodes.flatMap((e) => freeNames(e))),
      ].filter(
        (n) =>
          !emitter.scope.decls.declaredFns.has(n) &&
          !emitter.scope.emit.functions.has(n) &&
          !emitter.scope.emit.matrices.has(n),
      );
      if (free.length === 1) dispVars = free;
    }
    const varExpr =
      dispVars.length === 0
        ? 'None'
        : dispVars.length === 1
          ? emitter.emit(dispVars[0])
          : `${sp}Tuple(${dispVars.map((v) => emitter.emit(v)).join(', ')})`;
    return {
      lines: [call],
      // Calculator rows show the answer as `x = a1, a2, …` — the calc
      // line carries the solve var as clean_and_simplify's second arg.
      calcLines: [`clean_and_simplify(${call}, ${varExpr})`],
    };
  }
  if (h === 'DSolve' || h === 'PDESolve') {
    const fn = h === 'DSolve' ? 'dsolve' : 'pdsolve';
    const depSpecs = isHead(node[2], 'List') ? node[2].slice(1) : [];
    // Claim the unknowns first: every D site and bare name in the eqs
    // then applies the declared arg list (u(t,x), not u(t) and u(x)).
    const targets: string[] = [];
    const specIvars = new Map<string, string[]>();
    for (const d of depSpecs) {
      if (!isArr(d) || headOf(d) !== 'DepVar' || !isStr(d[1])) continue;
      const vars = d.slice(2).filter(isStr);
      specIvars.set(d[1], vars);
      emitter.scope.claimDepVar(d[1], vars);
      // The declared signature is authoritative for arg order — a
      // `u(x,t)` spec emits u(x,t) at every site even when the
      // derivative sites first saw `D(u,t)` (the seeded union's order).
      if (vars.length > 0) emitter.scope.emit.fnArgs.set(d[1], vars);
      // dsolve/pdsolve want the applied unknown `y(x)` — an unapplied
      // `y` raises TypeError, so a var-less spec contributes no target
      // (sympy then infers the unknown from the equation).
      if (vars.length > 0)
        targets.push(
          `${emitter.scope.emit.functions.get(d[1])!}(${vars
            .map((v) => emitter.emit(v))
            .join(', ')})`,
        );
    }
    const eqNodes = isHead(node[1], 'List') ? node[1].slice(1) : [node[1]];
    const before = emitter.scope.errorCount;
    const eqTexts = eqNodes.map((e) => emitter.emit(e));
    if (emitter.scope.errorCount !== before) return { lines: [] };
    if (h === 'PDESolve' && eqTexts.length > 1) {
      emitter.scope.flag(
        'error',
        'pdsolve solves a single equation — a system is not supported',
      );
      return { lines: [] };
    }
    const eqText =
      eqTexts.length === 1 ? eqTexts[0] : `[${eqTexts.join(', ')}]`;
    // SymPy accepts a scalar func only for a single equation — a list of
    // eqs needs a list of funcs, even a one-element list.
    const targetText =
      targets.length === 0
        ? ''
        : targets.length === 1 && eqTexts.length === 1
          ? `, ${targets[0]}`
          : `, [${targets.join(', ')}]`;
    const icNodes = isHead(node[3], 'List') ? node[3].slice(1) : [];
    const icTexts: string[] = [];
    for (const ic of icNodes) {
      if (!isArr(ic) || headOf(ic) !== 'IC' || !isStr(ic[1])) continue;
      const ident =
        emitter.scope.emit.functions.get(ic[1]) ?? pyIdent(ic[1]);
      const pt = emitter.emit(ic[3]);
      const rhs = emitter.emit(ic[4]);
      const order = ic[2];
      if (order === 'Nothing' || order === undefined) {
        icTexts.push(`${ident}(${pt}): ${rhs}`);
      } else {
        // `f^{(k)}(pt)=rhs` — the derivative is in the unknown's first
        // variable, evaluated at the point.
        const v0 = specIvars.get(ic[1])?.[0] ?? 'x';
        icTexts.push(
          `${sp}diff(${ident}(${v0}), ${v0}, ${emitter.emit(order)}).subs(${v0}, ${pt}): ${rhs}`,
        );
      }
    }
    if (h === 'PDESolve' && icTexts.length > 0) {
      emitter.scope.flag(
        'note',
        'pdsolve takes no boundary/initial conditions — the equation is solved without them',
      );
      icTexts.length = 0;
    }
    const icsText =
      icTexts.length === 0 ? '' : `, ics={${icTexts.join(', ')}}`;
    return { lines: [`${sp}${fn}(${eqText}${targetText}${icsText})`] };
  }
  // `\python{ ... }` — verbatim user source. It execs in the python
  // target's program or the calculator's shared namespace. When the
  // last line is an expression, the row displays its value (REPL
  // lane — `\python{f(9)}` shows 10). Function defs are inputs, not
  // results: a defs-only source execs silently, and a mixed source
  // echoes only its non-def statements.
  if (h === 'PythonSource') {
    const code = isStr(node[1]) ? node[1] : '';
    if (code.trim() === '') return { lines: [] };
    const trailing = trailingPythonExpr(code);
    if (trailing !== undefined)
      return { lines: [code], display: trailing };
    const rest = pythonSourceSansDefs(code).trim();
    return rest === ''
      ? { lines: [code], silent: true }
      : { lines: [code], display: JSON.stringify(rest) };
  }
  if (h === 'Block' || h === 'WhereBlock')
    return {
      lines: node.slice(1).flatMap((s) => emitStatement(s, emitter).lines),
    };
  return emitExprStatement(node, emitter);
}

// Walk normalized IR for heads that only lower to Python.
