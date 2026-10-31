import type { MathJson } from '../ir';
import { freeNames } from './analysis';
import type { Emission, ExpressionEmitter } from './expression-types';
import { BOOLISH_HEADS } from './heads';
import { asInt, headOf, isArr, isHead, isStr } from './nodes';
import { PREC_ATOM, PREC_MUL } from './precedence';

interface CollectionEmitter extends ExpressionEmitter {
  assumeFrom(member: MathJson, set: MathJson): void;
  emitMember(member: MathJson): string;
  fn(name: string): string;
  sym(name: string): string;
  isPosInt(node: MathJson | undefined): node is number;
  isSetish(node: MathJson | undefined): boolean;
  setArg(node: MathJson): string;
  unknownCall(head: string, args: MathJson[]): Emission;
}

// Parenthesized pairs normally denote intervals. Inside a set-builder's
// element/binder slot they denote ordered tuples, including in matrix mode.
function builderItems(node: MathJson): MathJson[] | undefined {
  if (!isArr(node)) return undefined;
  if (headOf(node) === 'Delimiter') return builderItems(node[1]);
  if (['Tuple', 'List', 'Sequence', 'Interval'].includes(headOf(node) ?? ''))
    return node.slice(1).map((n) => isHead(n, 'Open') ? n[1] : n);
  if (isHead(node, 'Matrix') && isHead(node[1], 'List')) {
    const rows = (node[1] as MathJson[]).slice(1);
    if (rows.every((r) => isHead(r, 'List')) &&
        (rows.length === 1 || rows.every((r) => r.length === 2)))
      return rows.flatMap((r) => (r as MathJson[]).slice(1));
  }
  return undefined;
}

function builderVars(node: MathJson): string[] | undefined {
  const items = isStr(node) ? [node] : builderItems(node);
  return items?.length && items.every(isStr) && new Set(items).size === items.length
    ? items as string[] : undefined;
}

function multiBuilder(elem: MathJson, pred: MathJson, e: CollectionEmitter): Emission | undefined {
  const tuple = (names: string[]) => `(${names.map((n) => e.sym(n)).join(', ')}${names.length === 1 ? ',' : ''})`;
  const value = () => {
    const items = builderItems(elem);
    return items ? `${e.sp}Tuple(${items.map((n) => e.emit(n)).join(', ')})` : e.emit(elem);
  };
  const clauses = isHead(pred, 'And') ? pred.slice(1) : [pred];
  // x,y ∈ D is parsed as And(x, Element(y,D)); expand the shared domain.
  const expanded: MathJson[] = [];
  for (let i = 0; i < clauses.length; i++) {
    if (isStr(clauses[i])) {
      let j = i;
      while (j < clauses.length && isStr(clauses[j])) j++;
      const next = clauses[j];
      if (isHead(next, 'Element') && isStr(next[1])) {
        for (; i < j; i++) expanded.push(['Element', clauses[i], next[2]]);
        expanded.push(next);
        continue;
      }
    }
    expanded.push(clauses[i]);
  }
  pred = expanded.length === 1 ? expanded[0] : ['And', ...expanded];
  const names = builderVars(isHead(elem, 'Element') ? elem[1] : elem);
  if (names && names.length > 1) {
    // {(x,y) ∈ D | predicate}, or {(x,y) | predicate}.
    // Pure memberships on the right are handled as image domains below.
    if (isHead(elem, 'Element') || !expanded.some((p) => isHead(p, 'Element'))) {
      const base = isHead(elem, 'Element') ? `, ${e.setArg(elem[2])}` : '';
      return [`${e.sp}ConditionSet(${tuple(names)}, ${e.emit(pred)}${base})`, PREC_ATOM];
    }
  }
  const memberships = expanded.filter((p) => isHead(p, 'Element')) as MathJson[][];
  const bindings = memberships.map((p) => builderVars(p[1]));
  if (!memberships.length || bindings.some((b) => !b)) return undefined;
  const vars = bindings.flat() as string[];
  if ((vars.length < 2 && !builderItems(elem)) || new Set(vars).size !== vars.length) return undefined;
  const filters = expanded.filter((p) => !isHead(p, 'Element'));
  // Each membership supplies one domain; tuple membership supplies a product.
  memberships.forEach((p, i) => {
    if (bindings[i]!.length === 1) e.assumeFrom(p[1], p[2]);
  });
  const domains = memberships.map((p) => e.setArg(p[2]));
  const bound = bindings.map((b) => b!.length === 1 ? e.sym(b![0]) : tuple(b!));
  if (!filters.length)
    return [`${e.sp}ImageSet(${e.sp}Lambda((${bound.join(', ')}${bound.length === 1 ? ',' : ''}), ${value()}), ${domains.join(', ')})`, PREC_ATOM];
  // Filter a product domain before mapping, retaining coupled predicates.
  if (memberships.length > 1 && bindings.some((b) => b!.length !== 1)) return undefined;
  const condition = filters.length === 1 ? filters[0] : ['And', ...filters] as MathJson;
  const base = memberships.length === 1 ? domains[0] : `${e.sp}ProductSet(${domains.join(', ')})`;
  const domain = `${e.sp}ConditionSet(${tuple(vars)}, ${e.emit(condition)}, ${base})`;
  return [`${e.sp}ImageSet(${e.sp}Lambda((${tuple(vars)},), ${value()}), ${domain})`, PREC_ATOM];
}

type CollectionHead = 'Condition' | 'Complement' | 'Difference' | 'SymmetricDifference' | 'Degrees' | 'Minimum' | 'Maximum' | 'Supremum' | 'Infimum' | 'IntegerRange' | 'Interval' | 'Open' | 'Element' | 'NotElement' | 'Set' | 'Union' | 'Intersection' | 'SetMinus' | 'Subset' | 'SubsetEqual' | 'Superset' | 'SupersetEqual' | 'NotSubset' | 'NotSubsetNotEqual' | 'NotSuperset' | 'NotSupersetNotEqual' | 'And' | 'Or' | 'Not' | 'Which' | 'Piecewise';

export function emitCollection(
  h: CollectionHead, args: MathJson[], emitter: CollectionEmitter,
): Emission {
  switch (h) {
      case 'Condition': {
        // A Condition escaping a Set wrapper — defensive; the variable
        // comes from the predicate's free names.
        const free = freeNames(args[0]);
        if (free.length === 0) {
          emitter.scope.flag(
            'error',
            'set-builder notation needs at least one variable',
          );
          return ['None', PREC_ATOM];
        }
        return [
          `${emitter.sp}ConditionSet(${free.length === 1 ? emitter.emit(free[0]) : `(${free.map((n) => emitter.sym(n)).join(', ')})`}, ${emitter.emit(args[0])})`,
          PREC_ATOM,
        ];
      }
      case 'Complement':
      case 'Difference':
      case 'SymmetricDifference': {
        // A \ B, A \triangle B — non-set operands wrap as singletons so
        // `x \ y` shows `{x} \ {y}` instead of a flagged stub (sympy has
        // no set variables; `A \ B` can't be held abstractly anyway).
        const fn =
          h === 'SymmetricDifference' ? 'SymmetricDifference' : 'Complement';
        return [
          `${emitter.sp}${fn}(${args.map((a) => emitter.setArg(a)).join(', ')})`,
          PREC_ATOM,
        ];
      }
      case 'Degrees':
        // x^{\circ} — convert to radians.
        return [
          `${emitter.emit(args[0], PREC_MUL)} * ${emitter.sp}pi / 180`,
          PREC_MUL,
        ];
      case 'Minimum':
      case 'Maximum': {
        // \min_{x} f — value of f minimized over x (sp.minimum), not the
        // elementwise sp.Min that \min(x, y) emits. A third arg is the
        // domain (\min_{x \in S} f / \min_{x \ge 0} f -> Interval).
        const fn = h === 'Minimum' ? 'minimum' : 'maximum';
        const mx = h === 'Minimum' ? 'Min' : 'Max';
        const [body, v, dom] = args;
        // The index var is bound inside the body — a bound `i` stays a
        // Symbol instead of resolving to sp.I (same as Sum/Integrate).
        return emitter.scope.withLambdaBound(isStr(v) ? [v] : [], () => {
          // SymPy's minimum/maximum can't bound an undefined function's
          // range — call/Apply bodies raise NotImplementedError at eval.
          if (isHead(body, 'call') || isHead(body, 'Apply'))
            return emitter.unknownCall(h, args);
          if (dom === undefined)
            return [
              `${emitter.sp}${fn}(${emitter.emit(body)}, ${emitter.emit(v)})`,
              PREC_ATOM,
            ];
          // \min_{i=lo}^{hi}: i is an integer index (like \sum bounds),
          // not a real interval. Concrete integer bounds emit Min/Max
          // over the explicit substitutions; sympy can't iterate a
          // symbolic sp.Range, so those degrade to a flagged stub.
          if (isHead(dom, 'IntegerRange')) {
            const lo = asInt(dom[1]);
            const hi = asInt(dom[2]);
            if (lo !== undefined && hi !== undefined)
              return [
                `${emitter.sp}${mx}(*[${emitter.emit(body, PREC_ATOM)}.subs(${emitter.emit(v)}, _i) for _i in range(${lo}, ${hi + 1})])`,
                PREC_ATOM,
              ];
            emitter.scope.flag(
              'note',
              `${fn} over a symbolic i=lo..hi range — sympy can't iterate a symbolic sp.Range; emitted as a ${h} stub`,
            );
            return emitter.unknownCall(h, args);
          }
          if (!emitter.isSetish(dom)) {
            emitter.scope.flag(
              'note',
              `${fn} domain isn't a set — emitted without it`,
            );
            return [
              `${emitter.sp}${fn}(${emitter.emit(body)}, ${emitter.emit(v)})`,
              PREC_ATOM,
            ];
          }
          return [
            `${emitter.sp}${fn}(${emitter.emit(body)}, ${emitter.emit(v)}, ${emitter.emit(dom)})`,
            PREC_ATOM,
          ];
        });
      }
      case 'Supremum':
      case 'Infimum':
        // No `sp.Supremum`/`sp.Infimum` exists — keep the readable stub
        // (Function, valid python) instead of an AttributeError.
        return emitter.unknownCall(h, args);
      case 'IntegerRange': {
        // i=lo..hi index bounds — sp.Range's upper bound is exclusive.
        const hi = asInt(args[1]);
        return [
          `${emitter.sp}Range(${emitter.emit(args[0])}, ${hi !== undefined ? String(hi + 1) : `${emitter.emit(args[1])} + 1`})`,
          PREC_ATOM,
        ];
      }
      case 'Interval': {
        // (a,b] / [a,b) — CE marks open ends with Open(x). A fully
        // closed [a,b] parses as List, not Interval.
        const [a0, a1] = args;
        const lo = emitter.emit(isHead(a0, 'Open') ? a0[1] : a0);
        const hi = emitter.emit(isHead(a1, 'Open') ? a1[1] : a1);
        const loOpen = isHead(a0, 'Open');
        const hiOpen = isHead(a1, 'Open');
        const flags =
          (loOpen ? ', left_open=True' : '') +
          (hiOpen ? ', right_open=True' : '');
        return [`${emitter.sp}Interval(${lo}, ${hi}${flags})`, PREC_ATOM];
      }
      case 'Open':
        // Open marks an interval endpoint — a stray one is meaningless.
        return [emitter.emit(args[0]), PREC_ATOM];
      case 'Element': {
        // x \in S — sp.Contains requires a real Set (a bare Symbol raises
        // TypeError); a non-set operand is wrapped as a singleton like
        // the Union operands (`x \in S` -> `x \in {S}`). A first-referenced
        // member also picks up the set's domain as Symbol kwargs
        // (\mathbb{R} -> real=True, or MatrixSymbol dims for
        // \mathbb{R}^{2\times2} — assumeFrom must run even when the set
        // isn't setish); \notin asserts the opposite, so NotElement
        // intentionally skips emitter.
        emitter.assumeFrom(args[0], args[1]);
        const set = args[1];
        if (!emitter.isSetish(set) && isHead(set, 'Power') && emitter.isSetish(set[1])) {
          // \mathbb{R}^{2\times2} / \mathbb{R}^n — SymPy has no matrix
          // space or symbolic set power; a named stub keeps it valid
          // Python and readable.
          const exp = set[2];
          const dims =
            (isHead(exp, 'Multiply') ||
              isHead(exp, 'CircleMinus') ||
              isHead(exp, 'CircleTimes') ||
              isHead(exp, 'CircledAst')) &&
            (exp as MathJson[]).slice(1).every((e) => emitter.isPosInt(e))
              ? (exp as MathJson[]).slice(1)
              : null;
          const fname = dims ? 'MatrixSpace' : 'SetPower';
          emitter.scope.flag(
            'note',
            `no SymPy ${dims ? 'matrix space' : 'symbolic set power'} — emitted as a ${fname} stub`,
          );
          const extra = dims
            ? dims.map((e) => emitter.emit(e)).join(', ')
            : emitter.emit(exp);
          return [
            `${emitter.fn('Element')}(${emitter.emitMember(args[0])}, ${emitter.fn(fname)}(${emitter.emit(set[1])}, ${extra}))`,
            PREC_ATOM,
          ];
        }
        return [
          `${emitter.sp}Contains(${emitter.emitMember(args[0])}, ${emitter.setArg(set)})`,
          PREC_ATOM,
        ];
      }
      case 'NotElement': {
        return [
          `${emitter.sp}Not(${emitter.sp}Contains(${emitter.emitMember(args[0])}, ${emitter.setArg(args[1])}))`,
          PREC_ATOM,
        ];
      }
      case 'Set': {
        // \{a, b\} is a FiniteSet; set-builder \{x | p(x)\} is a
        // ConditionSet, and \{f(x) | x \in D\} is an ImageSet.
        const [elem, cond] = args;
        const condNode = isHead(cond, 'call') ? cond.slice(1) : cond;
        const condHead = isArr(condNode) ? headOf(condNode) : undefined;
        const condPred = isArr(condNode) ? condNode[1] : undefined;
        // ConditionSet's predicate must emit a Boolean — a stray
        // expression (`{p : p \text{ prime}}` multiplies the text in)
        // raises TypeError at eval, so it falls through to FiniteSet.
        const boolish = isArr(condPred) && BOOLISH_HEADS.has(headOf(condPred) ?? '');
        if (condHead === 'Condition' && boolish) {
          const multi = multiBuilder(elem, condPred!, emitter);
          if (multi) return multi;
          if (isHead(elem, 'Element') && isStr(elem[1])) {
            // \{x \in D \mid p\} — base set is D. A non-set base can't
            // be a ConditionSet domain — keep a readable Function stub.
            emitter.assumeFrom(elem[1], elem[2]);
            return [
              emitter.isSetish(elem[2])
                ? `${emitter.sp}ConditionSet(${isStr(elem[1]) ? emitter.sym(elem[1]) : emitter.emit(elem[1])}, ${emitter.emit(condPred)}, ${emitter.emit(elem[2])})`
                : `${emitter.sp}Function("ConditionSet")(${isStr(elem[1]) ? emitter.sym(elem[1]) : emitter.emit(elem[1])}, ${emitter.emit(condPred)}, ${emitter.emit(elem[2])})`,
              PREC_ATOM,
            ];
          }
          if (isHead(condPred, 'Element') && isStr(condPred[1])) {
            // \{f(x) \mid x \in D\} — an image over the base set.
            emitter.assumeFrom(condPred[1], condPred[2]);
            return [
              emitter.isSetish(condPred[2])
                ? `${emitter.sp}ImageSet(${emitter.sp}Lambda(${emitter.sym(condPred[1])}, ${emitter.emit(elem)}), ${emitter.emit(condPred[2])})`
                : `${emitter.sp}Function("ImageSet")(${emitter.sp}Lambda(${emitter.sym(condPred[1])}, ${emitter.emit(elem)}), ${emitter.emit(condPred[2])})`,
              PREC_ATOM,
            ];
          }
          if (isStr(elem) || isHead(elem, 'Tuple'))
            return [
              `${emitter.sp}ConditionSet(${isStr(elem) ? emitter.sym(elem) : emitter.emit(elem)}, ${emitter.emit(condPred)})`,
              PREC_ATOM,
            ];
        }
        return [
          `${emitter.sp}FiniteSet(${args.map((a) => emitter.emitMember(a)).join(', ')})`,
          PREC_ATOM,
        ];
      }
      case 'Union':
      case 'Intersection':
      case 'SetMinus': {
        // Union/Intersection/Complement raise on non-Set operands —
        // `x \cup y` wraps each side as a singleton so it computes
        // `{x, y}` instead of echoing a flagged `Union(x, y)` stub.
        const fn =
          h === 'Union'
            ? 'Union'
            : h === 'Intersection'
              ? 'Intersection'
              : 'Complement';
        return [
          `${emitter.sp}${fn}(${args.map((a) => emitter.setArg(a)).join(', ')})`,
          PREC_ATOM,
        ];
      }
      case 'Subset':
      case 'SubsetEqual':
      case 'Superset':
      case 'SupersetEqual':
      case 'NotSubset':
      case 'NotSubsetNotEqual':
      case 'NotSuperset':
      case 'NotSupersetNotEqual': {
        // `A.is_subset(B)` returns None (not a Boolean) whenever the
        // operands are undecidable — bare `sp.Not(None)` then raises
        // AttributeError. `A ⊆ B` ⟺ `Union(A,B) == B` (strict ⊂ adds
        // `A != B`) always lowers to an Eq/Ne the worker can hold.
        const [sub, sup] = h.startsWith('NotSup') || h.startsWith('Sup')
          ? [args[1], args[0]]
          : [args[0], args[1]];
        if (!emitter.isSetish(sub) || !emitter.isSetish(sup)) {
          // SymPy has no set-typed symbol (unlike MatrixSymbol), so a
          // bare `A ⊆ B` can't name two unknown sets — FiniteSet(A)
          // would be the singleton, turning ⊆ into membership.
          emitter.scope.flag(
            'error',
            'subset/superset needs concrete set operands — sympy has no set-typed symbols',
          );
        }
        const l = emitter.setArg(sub);
        const r = emitter.setArg(sup);
        const strict =
          h === 'Subset' || h === 'Superset' ||
          h === 'NotSubset' || h === 'NotSuperset';
        const eq = `${emitter.sp}Eq(${emitter.sp}Union(${l}, ${r}), ${r})`;
        const base = strict
          ? `${emitter.sp}And(${eq}, ${emitter.sp}Ne(${l}, ${r}))`
          : eq;
        return [
          h.startsWith('Not') ? `${emitter.sp}Not(${base})` : base,
          PREC_ATOM,
        ];
      }
      case 'And':
        return [`${emitter.sp}And(${args.map((a) => emitter.emit(a)).join(', ')})`, PREC_ATOM];
      case 'Or':
        return [`${emitter.sp}Or(${args.map((a) => emitter.emit(a)).join(', ')})`, PREC_ATOM];
      case 'Not':
        return [`${emitter.sp}Not(${emitter.emit(args[0])})`, PREC_ATOM];
      case 'Which': {
        // CE: (cond, expr) pairs, odd tail is the else value. An
        // `\mathrm{otherwise}`/`\mathrm{else}` condition arrives as a
        // bare symbol — it means the default branch (True), not a
        // symbolic condition that can never fire.
        const cond = (a: MathJson): string =>
          a === 'otherwise' || a === 'else' || a === 'True'
            ? 'True'
            : emitter.emit(a);
        const pieces: string[] = [];
        for (let i = 0; i + 1 < args.length; i += 2)
          pieces.push(`(${emitter.emit(args[i + 1])}, ${cond(args[i])})`);
        if (args.length % 2 === 1)
          pieces.push(`(${emitter.emit(args[args.length - 1])}, True)`);
        return [`${emitter.sp}Piecewise(${pieces.join(', ')})`, PREC_ATOM];
      }
      case 'Piecewise': {
        // CE also emits ["Piecewise", ["List", expr, cond], ...]
        const cond = (a: MathJson): string =>
          a === 'otherwise' || a === 'else' || a === 'True'
            ? 'True'
            : emitter.emit(a);
        const pieces = args
          .map((a) =>
            isHead(a, 'List') && a.length === 3
              ? `(${emitter.emit(a[1])}, ${cond(a[2])})`
              : `(${emitter.emit(a)}, True)`,
          )
          .join(', ');
        return [`${emitter.sp}Piecewise(${pieces})`, PREC_ATOM];
      }
  }
}
