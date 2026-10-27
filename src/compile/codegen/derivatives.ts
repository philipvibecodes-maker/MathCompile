import type { MathJson } from '../ir';
import type { Emission, ExpressionEmitter } from './expression-types';
import { isArr, isStr, headOf, missingArg } from './nodes';
import { freeNames } from './analysis';
import { PREC_ATOM } from './precedence';

interface DerivativeEmitter extends ExpressionEmitter {
  fn(name: string): string;
  sym(name: string): string;
  matrixValued(node: MathJson | undefined, minted?: boolean): boolean;
}

type DerivativeHead = 'D' | 'TotalD' | 'Gradient';

export function emitDerivative(
  h: DerivativeHead, args: MathJson[], emitter: DerivativeEmitter,
): Emission {
  switch (h) {
      case 'D': {
        // \frac{d}{dx} f and partials both parse to D(f, x[, n]). The
        // variable is bound for the body's emission (a bound `i` stays
        // a symbol instead of resolving to sp.I).
        return emitter.scope.withLambdaBound(
          isStr(args[1]) ? [args[1]] : [],
          (): [string, number] => {
            // \frac{df}{dx} — a bare name as the body is a function of
            // the variable, not an independent symbol: `diff(f, x)`
            // would evaluate to 0. Emit `diff(f(x), x)` ->
            // Derivative(f(x), x).
            let f: string;
            if (
              isStr(args[0]) &&
              args[0] !== args[1] &&
              !emitter.scope.decls.defined.has(args[0])
            ) {
              // A dependent variable's full arg list applies at every
              // site — `D(u,t) = D(u,x,x)` emits diff(u(t,x), t), not
              // u(t) here / u(x) there. cellBody seeds the union before
              // emission; args[1] is always part of it.
              const call = [
                ...(emitter.scope.emit.fnArgs.get(args[0]) ?? []),
                args[1],
              ].filter((v, i, a) => a.indexOf(v) === i);
              f = `${emitter.fn(args[0])}(${call.map((a) => emitter.emit(a)).join(', ')})`;
              emitter.scope.noteDepVar(args[0], call);
            } else {
              f = emitter.emit(args[0]);
              // `\dot{x}` after `x = 5` — sp.diff(5, t) evaluates to 0,
              // so the emitted equation silently says `0 = rhs` instead
              // of a derivative; flag rather than emit a plausible
              // falsehood. A symbol-bound name is still a variable —
              // diff(f, x) = 0 is the honest partial.
              if (isStr(args[0]) && emitter.scope.isValueBound(args[0]))
                emitter.scope.flag(
                  'error',
                  `${args[0]} is bound to a value — cannot differentiate`,
                );
            }
            const x = emitter.emit(args[1]);
            return args.length >= 3
              ? [
                  `${emitter.sp}diff(${f}, ${x}, ${emitter.emit(args[2])})`,
                  PREC_ATOM,
                ]
              : [`${emitter.sp}diff(${f}, ${x})`, PREC_ATOM];
          },
        );
      }
      case 'TotalD': {
        // `\D f` — the TOTAL derivative: the best linear approximation
        // of f at a point, expressed as the Jacobian —
        // `sp.Matrix([body]).jacobian(vars)`. It takes no variable:
        // `\D_x f` is a
        // partial and folds to the ordinary D path, and the
        // `\frac{\D}{\D}` spelling is not the notation — flagged, with
        // the plausible univariate derivative emitted as a fallback.
        const body = args[0];
        const v = args[1];
        if (isStr(v) && !missingArg(v)) {
          emitter.scope.flag(
            'error',
            '\\frac{\\D}{\\D} is not the notation — write \\D f for the total derivative or \\D_x f for the partial in x',
          );
          return emitter.scope.withLambdaBound([v], (): [string, number] => {
            let f: string;
            if (
              isStr(body) &&
              body !== v &&
              !emitter.scope.decls.defined.has(body)
            ) {
              const call = [
                ...(emitter.scope.emit.fnArgs.get(body) ?? []),
                v,
              ].filter((a, i, arr) => arr.indexOf(a) === i);
              f = `${emitter.fn(body)}(${call.map((a) => emitter.emit(a)).join(', ')})`;
              emitter.scope.noteDepVar(body, call);
            } else {
              f = emitter.emit(body);
            }
            const x = emitter.emit(v);
            return args.length >= 3
              ? [
                  `${emitter.sp}diff(${f}, ${x}, ${emitter.emit(args[2])})`,
                  PREC_ATOM,
                ]
              : [`${emitter.sp}diff(${f}, ${x})`, PREC_ATOM];
          });
        }
        // Bare `\D f` / `\D^n f` — the total derivative. `\D` applies to
        // a function: one variable emits plain `sp.diff(body, v)` —
        // SymPy differentiates matrices elementwise — and a multivariate
        // scalar emits the Jacobian `sp.Matrix([body]).jacobian(vars)`.
        let vars: string[];
        let bodyIsFn = false;
        let recordedArgs: MathJson[] | undefined;
        if (isStr(body)) {
          // `\D f` on a bare name — a field, not a symbol. Its recorded
          // args define the variables; an undeclared f becomes f(x) —
          // unless the name IS the variable (`\D x` → `diff(x, x)`),
          // which must not mark x as a function of anything.
          recordedArgs =
            emitter.scope.emit.fnArgs.get(body) ??
            emitter.scope.emit.lambdaParams.get(body);
          if (recordedArgs !== undefined) {
            vars = recordedArgs.filter((a): a is string => isStr(a));
            bodyIsFn = true;
          } else if (emitter.scope.isValueBound(body)) {
            emitter.scope.flag(
              'error',
              `${body} is bound to a value — not a field`,
            );
            return [
              `${emitter.sp}diff(${emitter.emit(body)}, x)`,
              PREC_ATOM,
            ];
          } else if (emitter.scope.emit.matrices.has(body)) {
            // `\D A` — differentiate the matrix entries: `diff` handles
            // matrices elementwise.
            vars = ['x'];
          } else if (body === 'x' || emitter.scope.emit.symbols.has(body)) {
            // A coordinate or a symbol-bound name is its own variable —
            // `\D x`/`diff(u, u)` = 1, not a field claim.
            vars = [body];
          } else {
            emitter.fn(body);
            emitter.scope.noteDepVar(body, ['x']);
            vars = ['x'];
            bodyIsFn = true;
          }
        } else {
          vars = freeNames(body).filter(
            (n) =>
              !emitter.scope.isValueBound(n) &&
              !emitter.scope.emit.matrices.has(n) &&
              !emitter.scope.emit.functions.has(n) &&
              !emitter.scope.decls.declaredFns.has(n) &&
              !emitter.scope.kinds.depVars.has(n),
          );
        }
        if (vars.length === 0) {
          emitter.scope.flag('error', 'total derivative needs a free variable');
          return [
            `${emitter.sp}diff(${emitter.emit(body)}, x)`,
            PREC_ATOM,
          ];
        }
        // `\D^n f` — the nth total derivative. A non-integer order flags.
        let order = 1;
        const orderNode = v === 'Nothing' ? args[2] : undefined;
        if (orderNode !== undefined) {
          const n = typeof orderNode === 'number' ? orderNode : NaN;
          if (Number.isInteger(n) && n >= 1) {
            order = n;
          } else {
            emitter.scope.flag(
              'error',
              'higher-order total derivative needs a whole-number order',
            );
          }
        }
        // A callable bound by `f = x \mapsto …` lives in `lambdaParams`,
        // not `functions` — sym() would emit the bare Lambda object, so
        // apply it at its declared signature here.
        const emitted =
          isStr(body) &&
          bodyIsFn &&
          recordedArgs !== undefined &&
          !emitter.scope.emit.functions.has(body)
            ? `${emitter.fn(body)}(${recordedArgs
                .map((a) => emitter.emit(a))
                .join(', ')})`
            : emitter.emit(body);
        if (vars.length === 1) {
          const x = emitter.emit(vars[0]);
          return [
            `${emitter.sp}diff(${emitted}, ${x}${
              order > 1 ? `, ${order}` : ''
            })`,
            PREC_ATOM,
          ];
        }
        // Multivariate — the Jacobian. `sp.Matrix(...).jacobian` needs a
        // concrete matrix: a scalar body wraps as a 1×1, a matrix
        // literal differentiates its entries directly.
        const jac =
          (bodyIsFn || !isArr(body) || headOf(body) !== 'Matrix') &&
          !emitter.matrixValued(body, true)
            ? `${emitter.sp}Matrix([${emitted}])`
            : emitted;
        let out = `${jac}.jacobian([${vars
          .map((sv) => emitter.sym(sv))
          .join(', ')}])`;
        for (let i = 1; i < order; i++)
          out = `${out}.jacobian([${vars
            .map((sv) => emitter.sym(sv))
            .join(', ')}])`;
        return [out, PREC_ATOM];
      }
      case 'Gradient': {
        // `\nabla f` — the gradient over the canonical coordinates
        // (x, y, z), emitted as a 1×3 Matrix (the Jacobian of the scalar
        // body) — an sp.Array doesn't carry matrix ops. `\nabla x` is
        // the coordinate field itself -> (1, 0, 0); a coordinate bound
        // to a value can't be a diff variable, so its column is a
        // literal 0.
        const body = args[0];
        const COORDS = ['x', 'y', 'z'];
        const grad = (b: string): [string, number] => {
          if (COORDS.every((c) => !emitter.scope.isValueBound(c)))
            return [
              `${emitter.sp}Matrix([${b}]).jacobian([${COORDS.map((c) =>
                emitter.sym(c),
              ).join(', ')}])`,
              PREC_ATOM,
            ];
          return [
            `${emitter.sp}Matrix([[${COORDS.map((c) =>
              emitter.scope.isValueBound(c)
                ? '0'
                : `${emitter.sp}diff(${b}, ${emitter.sym(c)})`,
            ).join(', ')}]])`,
            PREC_ATOM,
          ];
        };
        if (isStr(body)) {
          // ∇f on a bare name: a def'd/called name is the field
          // f(<args>) — applied at its recorded signature — a
          // coordinate or symbol-bound name is the symbol itself
          // (∇x → (1,0,0)), a fresh name becomes a field of all three
          // coords, and a name bound to a scalar value differentiates
          // as that value (∇x after `x = 5` is the zero row).
          // Matrix/set/list bindings aren't scalar fields.
          const recorded =
            emitter.scope.emit.fnArgs.get(body) ??
            emitter.scope.emit.lambdaParams.get(body);
          if (recorded !== undefined) {
            const applied = emitter.scope.emit.functions.has(body)
              ? emitter.emit(body)
              : `${emitter.fn(body)}(${recorded
                  .map((a) => emitter.emit(a))
                  .join(', ')})`;
            return grad(applied);
          }
          if (
            emitter.scope.emit.matrices.has(body) ||
            emitter.scope.kinds.matrixNames.has(body) ||
            emitter.scope.kinds.setNames.has(body) ||
            emitter.scope.kinds.listNames.has(body)
          ) {
            emitter.scope.flag(
              'error',
              `${body} is bound to a value — not a scalar field`,
            );
            return [`${emitter.sp}Matrix([[0, 0, 0]])`, PREC_ATOM];
          }
          if (
            !COORDS.includes(body) &&
            !emitter.scope.emit.symbols.has(body) &&
            !emitter.scope.isValueBound(body)
          ) {
            emitter.fn(body);
            emitter.scope.noteDepVar(body, COORDS);
            const applied = emitter.scope.emit.functions.has(body)
              ? emitter.emit(body)
              : `${emitter.fn(body)}(${COORDS.map((c) => emitter.sym(c)).join(', ')})`;
            return grad(applied);
          }
          return grad(emitter.emit(body));
        }
        for (const n of freeNames(body))
          if (emitter.scope.isValueBound(n))
            emitter.scope.flag(
              'error',
              `${n} is bound to a value — cannot differentiate`,
            );
        return grad(emitter.emit(body));
      }
  }
}
