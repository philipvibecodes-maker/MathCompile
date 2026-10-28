import { CONSTANTS, INVERSE_FUNCS } from '../notation';
import type { MathJson } from '../ir';
import type { Emission, ExpressionEmitter } from './expression-types';
import { isStr, isHead, isNum, numText } from './nodes';
import { PREC_ATOM, PREC_LOW, PREC_MUL, PREC_POW, PREC_UNARY } from './precedence';

interface FunctionEmitter extends ExpressionEmitter {
  fn(name: string): string;
  sym(name: string): string;
  isFunctionish(name: string): boolean;
  isSetish(node: MathJson | undefined): boolean;
  callArg(node: MathJson): string;
  freshLetters(count: number, ...code: string[]): string[];
  callOrImage(args: MathJson[], apply: (params: string[]) => string,
    argEmit?: (arg: MathJson) => string): string;
}

type FunctionHead = 'Apply' | 'Prime' | 'Derivative' | 'Function';

export function emitFunction(
  h: FunctionHead, args: MathJson[], emitter: FunctionEmitter,
): Emission {
  switch (h) {
      case 'Apply': {
        const callee = args[0];
        if (isHead(callee, 'InverseFunction')) {
          // \sin^{-1}(x) -> asin(x); an unknown base keeps a readable
          // inverse(f)(x)-style row instead of InverseFunction garbage.
          const base = callee[1];
          const mapped = isStr(base) ? INVERSE_FUNCS[base] : undefined;
          const applyInverse = (ps: string[]): string =>
            base === 'Sqrt'
              ? `(${ps.join(', ')})**2`
              : mapped
                ? `${emitter.sp}${mapped}(${ps.join(', ')})`
                : `${emitter.sp}Function(${JSON.stringify(
                    isStr(base) ? `${base}inv` : 'inverse',
                  )})(${ps.join(', ')})`;
          const text = emitter.callOrImage(
            args.slice(1),
            applyInverse,
            (a) => emitter.callArg(a),
          );
          return [
            text,
            base === 'Sqrt' && !args.slice(1).some((a) => emitter.isSetish(a))
              ? PREC_POW
              : PREC_ATOM,
          ];
        }
        if (isHead(callee, 'Derivative')) {
          // f'(x): ["Apply", ["Derivative", f, n], x] — the prime
          // differentiates f w.r.t. its own variable; the call arg is
          // where that derivative is evaluated (f'(0) is the derivative
          // at 0, not `diff(f(0), 0)` which has no differentiation var).
          const [, f, n] = callee;
          // `f^{(n)}(x)` — a symbolic order has no sympy form this
          // sympy version can hold: `diff(f, x, n)` differentiates by
          // x then n (→ 0) and `diff(f, (x, n))` hard-aborts the wasm
          // runtime — flag it rather than crash the worker.
          const diffBy = (v: string): string => {
            if (n === undefined || n === 'Nothing' || n === 1) return v;
            if (isNum(n)) return `${v}, ${numText(n)}`;
            emitter.scope.flag(
              'error',
              'symbolic derivative order is unsupported',
            );
            return v;
          };
          const argNodes = args.slice(1);
          // `x^{(2)}(3)` on a variable isn't a derivative call — the
          // power is a juxtaposed factor (`x**2 * 3`). The base reads as
          // a function when it's def'd or already called; an undeclared
          // name in callee position is a function by use (like `r(x)`).
          if (isStr(f) && !emitter.isFunctionish(f)) {
            const basePow = emitter.emit(
              n === undefined || n === 'Nothing' ? f : ['Power', f, n],
              PREC_MUL,
            );
            return [
              [basePow, ...argNodes.map((a) => emitter.emit(a, PREC_MUL))].join(
                ' * ',
              ),
              PREC_MUL,
            ];
          }
          const fname = isStr(f) ? emitter.fn(f) : null;
          // f is a function of its call args' variables — a later bare
          // `f` operand emits `f(<vars>)` (UndefinedFunction operand
          // raises TypeError).
          if (isStr(f)) {
            const fvars = argNodes.filter((a) => isStr(a) && a !== f);
            if (fvars.length > 0) emitter.scope.noteDepVar(f, fvars);
          }
          const applied = (list: string[]) =>
            fname !== null
              ? `${fname}(${list.join(', ')})`
              : `${emitter.emit(f)}(${list.join(', ')})`;
          // A string arg can still be a *constant* name (f'(\pi)) —
          // constants aren't diff variables either, so they take the
          // same fresh-symbol substitution path as literal args.
          const isVar = (a: MathJson): boolean =>
            isStr(a) && !CONSTANTS[a];
          if (argNodes.every(isVar)) {
            const argList = argNodes.map((a) => emitter.emit(a)).join(', ');
            return [
              `${emitter.sp}diff(${applied(argNodes.map((a) => emitter.emit(a)))}, ${diffBy(argList)})`,
              PREC_ATOM,
            ];
          }
          // Non-variable eval points need fresh differentiation vars —
          // the first unused lowercase letters (a free `x` arg or a
          // function named `x` would otherwise capture/collide).
          const varCode = argNodes.map((a) => (isVar(a) ? emitter.emit(a) : ''));
          const evalCode = argNodes.map((a) => (isVar(a) ? '' : emitter.emit(a)));
          const fresh = emitter.freshLetters(
            evalCode.filter((s) => s !== '').length,
            applied(argNodes.map((_, i) => `\x00${i}`)),
            ...varCode,
            ...evalCode,
          );
          let fk = 0;
          const vars = argNodes.map((a, i) =>
            isVar(a) ? varCode[i] : emitter.sym(fresh[fk++]),
          );
          let text = `${emitter.sp}diff(${applied(vars)}, ${diffBy(vars.join(', '))})`;
          argNodes.forEach((a, i) => {
            if (isVar(a)) return;
            // `f'(\{1,2\})` — a set evaluation point maps the derivative
            // elementwise; subs would hand it the whole set.
            if (emitter.isSetish(a))
              text = `${emitter.sp}imageset(${emitter.sp}Lambda(${vars[i]}, ${text}), ${evalCode[i]})`;
            else text = `${text}.subs(${vars[i]}, ${evalCode[i]})`;
          });
          return [text, PREC_ATOM];
        }
        if (isHead(callee, 'Function')) {
          // `(x \mapsto x^2)(3)` — a lambda callee is a real call, not
          // juxtaposed factors (the generic multiply path below would
          // emit `(lambda ...) * 3`, a TypeError at exec).
          const lambda = emitter.emit(callee);
          return [
            emitter.callOrImage(
              args.slice(1),
              (ps) => `${lambda}(${ps.join(', ')})`,
              (a) => emitter.callArg(a),
            ),
            PREC_ATOM,
          ];
        }
        if (!isStr(callee)) {
          // A non-name "callee" isn't a call — `\sqrt{x}(x+1)`, `2(x+1)`,
          // `x^2(y)` are juxtaposed factors (the delimiter group was the
          // last factor). Emitting `f(args)` here produced executable
          // nonsense like `sqrt(x)(x + 1)` → 'Pow' object is not
          // callable; multiplication is the conventional reading.
          return [
            args.map((a) => emitter.emit(a, PREC_MUL)).join(' * '),
            PREC_MUL,
          ];
        }
        const calleeText = emitter.fn(callee);
        // Record the application so a later bare `f` in operand
        // position emits `f(<args>)` (UndefinedFunction operands raise).
        const fnArgs = args.slice(1).filter((a) => a !== callee);
        emitter.scope.noteCallArgs(callee, fnArgs);
        return [
          emitter.callOrImage(args.slice(1), (ps) =>
            `${calleeText}(${ps.join(', ')})`,
          ),
          PREC_ATOM,
        ];
      }
      case 'Prime': {
        // y'' — the nth derivative of the function w.r.t. x. The arg's
        // `x` must be allocated first: for `x'` itself, taking the
        // function ident first gives `x` to the callee and `x_2` to the
        // variable, scrambling the names (`Derivative(x(x_2), x)`).
        const arg = emitter.sym('x');
        const name = isStr(args[0])
          ? `${emitter.fn(args[0])}(${arg})`
          : emitter.emit(args[0], PREC_ATOM);
        if (isStr(args[0])) emitter.scope.noteDepVar(args[0], ['x']);
        const n =
          isNum(args[1]) && numText(args[1]) !== '1'
            ? `, ${numText(args[1])}`
            : '';
        return [`${emitter.sp}Derivative(${name}, x${n})`, PREC_ATOM];
      }
      case 'Derivative': {
        // Bare `f^{(n)}` / `x^{(2)}` — a derivative only when the base is
        // an established function (def'd or already used in call
        // position); `x^{(2)}` on a variable is the ordinary power
        // `x**2`, same as `5^{(2)}` → 25.
        if (
          isStr(args[0]) &&
          !emitter.scope.emit.functions.has(args[0]) &&
          !emitter.scope.decls.declaredFns.has(args[0])
        ) {
          const order =
            args[1] === undefined
              ? '1'
              : isNum(args[1])
                ? numText(args[1])
                : emitter.emit(args[1], PREC_UNARY);
          return [`${emitter.sym(args[0])}**${order}`, PREC_POW];
        }
        // A string callee arrives unapplied and `Derivative(f, n)` raises
        // TypeError ('cannot represent derivative of UndefinedFunction').
        // Diff the applied function like \ddot does: `sp.diff(f(x), x, n)`.
        if (isStr(args[0])) {
          const f = emitter.fn(args[0]);
          // `x^{(2)}` can't differentiate `x(x)` by `x` — the var must
          // differ from the callee name.
          const v = emitter.sym(args[0] === 'x' ? 't' : 'x');
          emitter.scope.noteDepVar(args[0], [args[0] === 'x' ? 't' : 'x']);
          if (args[1] !== undefined && !isNum(args[1])) {
            // Same wasm-crashing (v, n) tuple as the applied path.
            emitter.scope.flag(
              'error',
              'symbolic derivative order is unsupported',
            );
            return [`${emitter.sp}diff(${f}(${v}), ${v})`, PREC_ATOM];
          }
          const order =
            args[1] === undefined ? `, ${v}` : `, ${v}, ${numText(args[1])}`;
          return [`${emitter.sp}diff(${f}(${v})${order})`, PREC_ATOM];
        }
        return [
          `${emitter.sp}Derivative(${args
            .map((a) => emitter.emit(a))
            .join(', ')})`,
          PREC_ATOM,
        ];
      }
      case 'Function': {
        // Anonymous lambda — CE wraps calculus bodies this way. Emitted
        // directly only when it escapes an operator that unwraps it
        // (e.g. `x \mapsto x^2`). A sympy `Lambda` — a raw python lambda
        // has no latex/repr and displays its own address. Params bind
        // like operator-bound names: `i \mapsto i^2` binds a plain
        // Symbol — `Lambda(sp.I, …)` can't take the imaginary constant.
        const rawParams = args.slice(1).map((p) => (isStr(p) ? p : 'x'));
        // lambdaBound pushes before the params' idents mint (a param
        // named `i` stays a plain Symbol); `bound` pushes after, so the
        // minted names themselves aren't treated as already-bound.
        return emitter.scope.withLambdaBound(rawParams, () => {
          const params = rawParams.map((p) => emitter.sym(p));
          return emitter.scope.withBound(rawParams, () => {
            const body = emitter.emit(args[0]);
            const sig =
              params.length === 1 ? params[0] : `(${params.join(', ')})`;
            return [`${emitter.sp}Lambda(${sig}, ${body})`, PREC_LOW];
          });
        });
      }
  }
}
