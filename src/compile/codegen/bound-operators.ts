import type { MathJson } from '../ir';
import { isDiffMark } from '../ir';
import type { Emission, ExpressionEmitter } from './expression-types';
import { isArr, isStr, isHead, isNum, numText, unwrapLambda } from './nodes';
import { freeNames, firstFreeCapital } from './analysis';
import { PREC_ADD, PREC_ATOM } from './precedence';

interface BoundOperatorEmitter extends ExpressionEmitter {
  matrixShape(node: MathJson | undefined): string | null;
}

type BoundOperator = 'Integrate' | 'Sum' | 'Product' | 'BigUnion' | 'BigIntersection' | 'Limit';

export function emitBoundOperator(
  h: BoundOperator, args: MathJson[], emitter: BoundOperatorEmitter,
): Emission {
  switch (h) {
      case 'Integrate': {
        const { body: parsedBody, params } = unwrapLambda(args[0]);
        let body = parsedBody;
        const limits = isHead(args[1], 'Limits') ? args[1].slice(1) : null;
        const missing = (n: MathJson | undefined): boolean =>
          n === undefined || n === 'Nothing' || isHead(n, 'Error');
        let v = limits?.[0] ?? params[0];
        const lo = limits?.[1];
        const hi = limits?.[2];
        // Every indefinite integral takes its own `+ C` — per level, so
        // an inner constant integrates into a real term (`∬f dx dy` ->
        // F + C·y + D). The emitted program nests integrate() calls so
        // each level's constant is visible.
        const constTerm = () => {
          const c = firstFreeCapital(emitter.scope.emit.constNames);
          const shape = emitter.matrixShape(body);
          return shape
            ? `${emitter.sp}MatrixSymbol(${JSON.stringify(c)}, ${shape})`
            : `${emitter.sp}Symbol(${JSON.stringify(c)})`;
        };
        let extraVars: string[] = [];
        // `\int x^2 \text{d}x` — CE leaves a \text{d} differential as a
        // `d * x` factor pair in the body instead of marking the var.
        // `\iint`/`\iiint` park several pairs on one Integrate node —
        // peel them all (leftmost = innermost). A pair naming the
        // already-bound variable (`(x,0,1)` limits) is consumed, not
        // counted as an extra variable.
        const stripDiffs = (factors: MathJson[]): string[] => {
          const found: string[] = [];
          while (
            factors.length >= 2 &&
            isStr(factors[factors.length - 1]) &&
            isDiffMark(factors[factors.length - 2])
          ) {
            const name = factors.pop() as string;
            factors.pop();
            if (name !== v) found.unshift(name);
          }
          return found;
        };
        // CE flattens `f(x)` inside an integral to plain factors —
        // `Multiply(f, x, d, x)` loses the call marker. Fold a
        // function-name factor fused with the next name back into a
        // call so `∫f(x)dx` isn't emitted `∫f·x dx`.
        const foldCalls = (factors: MathJson[]): MathJson[] => {
          const out: MathJson[] = [];
          for (let i = 0; i < factors.length; i++) {
            const a = factors[i];
            const b = factors[i + 1];
            if (isStr(a) && emitter.scope.emit.functions.has(a) && isStr(b)) {
              out.push(['call', a, b]);
              i++;
            } else out.push(a);
          }
          return out;
        };
        const promoteVar = () => {
          if (missing(v) && extraVars.length > 0) {
            v = extraVars[0];
            extraVars = extraVars.slice(1);
          }
        };
        // CE glues the `\text{d}v` differential onto the tail of the
        // integrand — flat (`Multiply(x², d, x)`) or nested inside the
        // last factor's arguments (`x\sin x\,dx` →
        // `Multiply(x, Sin(Multiply(x, d, x)))`, `\sin²x\,dx` →
        // `Power(Sin(Multiply(x, d, x)), 2)`). Peel pairs at the
        // deepest level they sit at and rebuild the application.
        const peelNode = (
          node: MathJson,
        ): { node: MathJson; names: string[] } => {
          if (isHead(node, 'Multiply')) {
            const r = peelDeep(node.slice(1));
            if (r.names.length > 0 && r.factors.length >= 1) {
              return {
                node:
                  r.factors.length === 1
                    ? r.factors[0]
                    : (['Multiply', ...r.factors] as MathJson),
                names: r.names,
              };
            }
            return { node, names: [] };
          }
          if (isArr(node) && node.length >= 2) {
            for (let i = node.length - 1; i >= 1; i--) {
              const r = peelNode(node[i]);
              if (r.names.length > 0) {
                const out = [...node];
                out[i] = r.node;
                return { node: out as MathJson, names: r.names };
              }
            }
          }
          return { node, names: [] };
        };
        const peelDeep = (
          factors: MathJson[],
        ): { factors: MathJson[]; names: string[] } => {
          const tail = [...factors];
          const names = stripDiffs(tail);
          if (names.length > 0) return { factors: tail, names };
          const last = tail[tail.length - 1];
          const r = peelNode(last);
          if (r.names.length > 0) {
            tail[tail.length - 1] = r.node;
            return { factors: tail, names: r.names };
          }
          return { factors, names: [] };
        };
        const r = peelDeep(
          isHead(body, 'Multiply') && body.length >= 3
            ? body.slice(1)
            : [body],
        );
        if (r.names.length > 0 && r.factors.length >= 1) {
          extraVars = [...extraVars, ...r.names];
          const parts = foldCalls(r.factors);
          body = parts.length === 1 ? parts[0] : ['Multiply', ...parts];
          promoteVar();
        }
        if (missing(v)) {
          // No `dx` — infer the variable from the body's free symbols
          // (`\int x^2` -> x). Ambiguous bodies can't be emitted — SymPy
          // would just raise a ValueError, so flag and let the statement
          // drop instead.
          const free = freeNames(body);
          if (free.length === 1) {
            v = free[0];
            emitter.scope.flag(
              'note',
              `no differential — integrating w.r.t. ${v}`,
            );
          } else {
            emitter.scope.flag(
              'error',
              "can't infer the integration variable — add a differential like dx",
            );
            return [`${emitter.sp}integrate(${emitter.emit(body)})`, PREC_ATOM];
          }
        }
        // The integration variable is bound for the body's emission (a
        // bound `i` stays a symbol instead of resolving to sp.I).
        const finish = (): [string, number] => {
          const hasLo = !missing(lo);
          const hasHi = !missing(hi);
          if (hasLo !== hasHi) {
            emitter.scope.flag(
              'error',
              `${hasLo ? 'upper' : 'lower'} bound is empty — fill it in or delete it`,
            );
            return [`${emitter.sp}integrate(${emitter.emit(body)}, ${emitter.emit(v)})`, PREC_ATOM];
          }
          // Several differentials on one sign (`\iint f dx dy`) — an
          // iterated integral, innermost first. A lone bound pair
          // applies to every variable (`\iint_a^b` reads as a square).
          if (extraVars.length > 0) {
            const vars = [v, ...extraVars].filter(isStr);
            if (hasLo)
              return [
                `${emitter.sp}integrate(${emitter.emit(body)}, ${vars
                  .map(
                    (w) =>
                      `(${emitter.emit(w)}, ${emitter.emit(lo)}, ${emitter.emit(hi)})`,
                  )
                  .join(', ')})`,
                PREC_ATOM,
              ];
            // Indefinite: a nested call per level so each `+ C`
            // integrates through — `integrate(f, x, y) + C` would show
            // one constant where the antiderivative has one per level.
            let acc = `${emitter.sp}integrate(${emitter.emit(body)}, ${emitter.emit(vars[0])}) + ${constTerm()}`;
            for (const w of vars.slice(1))
              acc = `${emitter.sp}integrate(${acc}, ${emitter.emit(w)}) + ${constTerm()}`;
            return [acc, PREC_ADD];
          }
          if (hasLo)
            return [
              `${emitter.sp}integrate(${emitter.emit(body)}, (${emitter.emit(v)}, ${emitter.emit(lo)}, ${emitter.emit(hi)}))`,
              PREC_ATOM,
            ];
          // Indefinite: append the constant of integration (`+ C`) at
          // every level. PREC_ADD keeps the sum parenthesized when the
          // integral nests inside a larger term (`(∫x dx)^2` ->
          // `(x**2/2 + C)**2`) or inside an outer integrand. A matrix
          // integrand's constant is a matrix too — `Matrix + Symbol`
          // raises TypeError, so emit a same-shape MatrixSymbol.
          const indefinite = `${emitter.sp}integrate(${emitter.emit(body)}, ${emitter.emit(v)})`;
          return [`${indefinite} + ${constTerm()}`, PREC_ADD];
        };
        return emitter.scope.withLambdaBound(
          isStr(v) ? [v, ...extraVars] : [],
          finish,
        );
      }
      case 'Sum':
      case 'Product': {
        const { body } = unwrapLambda(args[0]);
        const limits = isHead(args[1], 'Limits') ? args[1].slice(1) : null;
        const eager = h === 'Sum' ? 'summation' : 'product';
        const missing = (n: MathJson | undefined): boolean =>
          n === undefined || n === 'Nothing' || isHead(n, 'Error');
        const word = h === 'Sum' ? 'sum' : 'product';
        // A stray `d x` under a product/sum (`\prod x^2 dx`) isn't
        // meaningful — flag at compile time rather than emitting an
        // unbound-variable sum.
        if (
          isHead(body, 'Multiply') &&
          body.length >= 3 &&
          isStr(body[body.length - 2]) &&
          isStr(body[body.length - 1]) &&
          isDiffMark(body[body.length - 2])
        ) {
          emitter.scope.flag(
            'error',
            `differential ${body[body.length - 2]}${body[body.length - 1]} under \\${h === 'Sum' ? 'sum' : 'prod'} — did you mean \\int?`,
          );
          return [`${emitter.sp}${h}(${emitter.emit(body)})`, PREC_ATOM];
        }
        // The index variable is bound for the body's emission (a bound
        // `i` stays a symbol instead of resolving to sp.I).
        const boundVars =
          limits && isStr(limits[0]) && !missing(limits[0])
            ? [limits[0]]
            : [];
        // SymPy has no boundless/partial Sum or Product form — every
        // shape except a complete (var, lo, hi) tuple raises ValueError.
        // Flag like the integral's half-bound case and drop the row.
        const finish = (): [string, number] => {
          if (!limits || missing(limits[0])) {
            emitter.scope.flag(
              'error',
              `${word} needs an index and bounds — write ${
                h === 'Sum' ? '\\sum' : '\\prod'
              }_{i=1}^{n}`,
            );
            return [`${emitter.sp}${h}(${emitter.emit(body)})`, PREC_ATOM];
          }
          if (missing(limits[1]) || missing(limits[2])) {
            emitter.scope.flag(
              'error',
              `${missing(limits[2]) ? 'upper' : 'lower'} bound is empty — fill it in or delete it`,
            );
            return [`${emitter.sp}${h}(${emitter.emit(body)})`, PREC_ATOM];
          }
          return [
            `${emitter.sp}${eager}(${emitter.emit(body)}, (${emitter.emit(limits[0])}, ${emitter.emit(limits[1])}, ${emitter.emit(limits[2])}))`,
            PREC_ATOM,
          ];
        };
        return emitter.scope.withLambdaBound(boundVars, finish);
      }
      case 'BigUnion':
      case 'BigIntersection': {
        // `\bigcup_{i=1}^{n} A_i` / `\bigcap` — an n-ary set op over an
        // index. SymPy's Union/Intersection have no bound form, so
        // emit an explicit comprehension: `Union(*[A_i for i in
        // Range(1, n+1)])` — Range works whenever the bounds resolve
        // to ints at eval time; an unbounded upper bound would hang
        // the comprehension, so that one flags.
        const { body } = unwrapLambda(args[0]);
        const op = h === 'BigUnion' ? 'Union' : 'Intersection';
        const cmd = h === 'BigUnion' ? '\\bigcup' : '\\bigcap';
        const word = h === 'BigUnion' ? 'big union' : 'big intersection';
        const missing = (n: MathJson | undefined): boolean =>
          n === undefined || n === 'Nothing' || isHead(n, 'Error');
        // `\bigcup_{i \in S} A_i` — union over a set's members,
        // iterated directly.
        if (isHead(args[1], 'Element') && isStr(args[1][1])) {
          const v = args[1][1];
          return emitter.scope.withLambdaBound([v], () => [
            `${emitter.sp}${op}(*[${emitter.emit(body)} for ${emitter.emit(v)} in ${emitter.emit((args[1] as MathJson[])[2])}])`,
            PREC_ATOM,
          ]);
        }
        const limits = isHead(args[1], 'Limits') ? args[1].slice(1) : null;
        const boundVars =
          limits && isStr(limits[0]) && !missing(limits[0])
            ? [limits[0]]
            : [];
        const finish = (): [string, number] => {
          if (!limits || missing(limits[0])) {
            emitter.scope.flag(
              'error',
              `${word} needs an index and bounds — write ${cmd}_{i=1}^{n}`,
            );
            return [`${emitter.sp}${op}(${emitter.emit(body)})`, PREC_ATOM];
          }
          if (missing(limits[1]) || missing(limits[2])) {
            emitter.scope.flag(
              'error',
              `${missing(limits[2]) ? 'upper' : 'lower'} bound is empty — fill it in or delete it`,
            );
            return [`${emitter.sp}${op}(${emitter.emit(body)})`, PREC_ATOM];
          }
          if (
            limits[2] === 'PositiveInfinity' ||
            limits[2] === 'NegativeInfinity' ||
            limits[2] === 'Infinity' ||
            limits[2] === '-Infinity'
          ) {
            emitter.scope.flag(
              'error',
              `${word} over an unbounded index can't enumerate — write it as a set comprehension`,
            );
            return [`${emitter.sp}${op}(${emitter.emit(body)})`, PREC_ATOM];
          }
          return [
            `${emitter.sp}${op}(*[${emitter.emit(body)} for ${emitter.emit(limits[0])} in ${emitter.sp}Range(${emitter.emit(limits[1])}, ${emitter.emit(limits[2])} + 1)])`,
            PREC_ATOM,
          ];
        };
        return emitter.scope.withLambdaBound(boundVars, finish);
      }
      case 'Limit': {
        // ["Limit", ["Function", body, x], value] or
        // ["Limit", ["Function", body, x], value, dir] where dir is ±1
        // (one-sided limits); defensive flat form ["Limit", expr, x,
        // value] too.
        const { body, params } = unwrapLambda(args[0]);
        if (isHead(args[0], 'Function')) {
          const v = params[0] ?? 'x';
          // CE carries `x \to a^{\pm}` as a ±1 third arg. Without a
          // direction the limit is two-sided: sympy's default dir='+'
          // would silently give the right-hand answer.
          const dir =
            args.length >= 3 && isNum(args[2])
              ? Number(numText(args[2])) > 0
                ? '+'
                : '-'
              : '+-';
          return emitter.scope.withLambdaBound(isStr(v) ? [v] : [], () => [
            `${emitter.sp}limit(${emitter.emit(body)}, ${emitter.emit(v)}, ${emitter.emit(args[1])}, dir='${dir}')`,
            PREC_ATOM,
          ]);
        }
        if (args.length >= 3)
          return [
            `${emitter.sp}limit(${emitter.emit(body)}, ${emitter.emit(args[1])}, ${emitter.emit(args[2])})`,
            PREC_ATOM,
          ];
        const v = params[0] ?? 'x';
        return [
          `${emitter.sp}limit(${emitter.emit(body)}, ${emitter.emit(v)}, ${emitter.emit(args[1])})`,
          PREC_ATOM,
        ];
      }
  }
}
