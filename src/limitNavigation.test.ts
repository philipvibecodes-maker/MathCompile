import { describe, expect, it } from 'vitest';
import {
  applyCaret,
  arrowLeftInLimits,
  arrowRightInLimits,
  hasBounds,
  isBoundsCarrier,
  lowerPlaceholderSelection,
} from './limitNavigation';
import type { InternalAtom, InternalModel } from './limitNavigation';

// Builds atoms in MathLive's flat order (parents come after children) and
// wires parent/parentBranch/leftSibling/rightSibling per branch.
const makeModel = (
  flat: InternalAtom[],
  position: number,
  collapsed = true,
): InternalModel => ({
  position,
  selectionIsCollapsed: collapsed,
  // at(p) is the atom to the LEFT of the caret; atom at flat index i
  // occupies caret offset i, so offsetOf(atom) is its index.
  at: (offset) => flat[offset] ?? null,
  offsetOf: (atom) => flat.indexOf(atom),
});

const link = (atoms: InternalAtom[], parent: InternalAtom, branch: string) => {
  atoms.forEach((a, i) => {
    a.parent = parent;
    a.parentBranch = branch;
    a.leftSibling = atoms[i - 1] ?? null;
    a.rightSibling = atoms[i + 1] ?? null;
  });
};

const atom = (type: string): InternalAtom => ({ type });

// '?' denotes a placeholder atom; everything else is a 'mord'.
const branchAtoms = (s: string): InternalAtom[] =>
  [...s].map((ch) => atom(ch === '?' ? 'placeholder' : 'mord'));

// \int_{lower}^{upper}: flat order is
// [root first, sup first, ...upper, sub first, ...lower, carrier]
const integral = (lower: string, upper: string) => {
  const carrier = atom('extensible-symbol');
  const root = atom('root');
  const rootFirst = atom('first');
  const sup = [atom('first'), ...branchAtoms(upper)];
  const sub = [atom('first'), ...branchAtoms(lower)];
  carrier.superscript = sup;
  carrier.subscript = sub;
  carrier.parent = root;
  rootFirst.parent = root;
  link(sup, carrier, 'superscript');
  link(sub, carrier, 'subscript');
  rootFirst.rightSibling = carrier;
  carrier.leftSibling = rootFirst;
  return [rootFirst, ...sup, ...sub, carrier];
};

// x\int_{lower}^{upper}: flat order is
// [root first, x, sup first, ...upper, sub first, ...lower, carrier]
const xIntegral = (lower: string, upper: string) => {
  const carrier = atom('extensible-symbol');
  const root = atom('root');
  const rootFirst = atom('first');
  const x = atom('mord');
  const sup = [atom('first'), ...branchAtoms(upper)];
  const sub = [atom('first'), ...branchAtoms(lower)];
  carrier.superscript = sup;
  carrier.subscript = sub;
  carrier.parent = root;
  rootFirst.parent = root;
  x.parent = root;
  link(sup, carrier, 'superscript');
  link(sub, carrier, 'subscript');
  rootFirst.rightSibling = x;
  x.leftSibling = rootFirst;
  x.rightSibling = carrier;
  carrier.leftSibling = x;
  return [rootFirst, x, ...sup, ...sub, carrier];
};

// \int^{upper} with no subscript: [root first, sup first, ...upper, carrier]
const supOnly = (upper: string) => {
  const carrier = atom('extensible-symbol');
  const root = atom('root');
  const rootFirst = atom('first');
  const sup = [atom('first'), ...branchAtoms(upper)];
  carrier.superscript = sup;
  carrier.parent = root;
  rootFirst.parent = root;
  link(sup, carrier, 'superscript');
  rootFirst.rightSibling = carrier;
  carrier.leftSibling = rootFirst;
  return [rootFirst, ...sup, carrier];
};

// \int_{lower} with no superscript: [root first, sub first, ...lower, carrier]
const subOnly = (lower: string) => {
  const carrier = atom('extensible-symbol');
  const root = atom('root');
  const rootFirst = atom('first');
  const sub = [atom('first'), ...branchAtoms(lower)];
  carrier.subscript = sub;
  carrier.parent = root;
  rootFirst.parent = root;
  link(sub, carrier, 'subscript');
  rootFirst.rightSibling = carrier;
  carrier.leftSibling = rootFirst;
  return [rootFirst, ...sub, carrier];
};

// x+y at top level: [first, x, +, y]
const plain = (s: string) => {
  const root = atom('root');
  const atoms = [atom('first'), ...branchAtoms(s)];
  link(atoms, root, 'main');
  return atoms;
};

const pos = (o: number) => ({ kind: 'position', offset: o });
const sel = (a: number, e: number) => ({ kind: 'select', anchor: a, extent: e });

describe('arrowRightInLimits', () => {
  it('lower limit end -> upper limit start', () => {
    // \int_{a}^{b}: caret pos 4 is after 'a' in the lower limit.
    const m = makeModel(integral('a', 'b'), 4);
    expect(arrowRightInLimits(m)).toEqual(pos(1));
  });

  it('lower limit end -> selects upper placeholder', () => {
    const m = makeModel(integral('a', '?'), 4);
    expect(arrowRightInLimits(m)).toEqual(sel(1, 2));
  });

  it('works when the lower placeholder is selected (not collapsed)', () => {
    // \int_{#?}^{#?}: selection [3,4] on the lower placeholder.
    const m = makeModel(integral('?', '?'), 4, false);
    expect(arrowRightInLimits(m)).toEqual(sel(1, 2));
  });

  it('upper limit end -> right of the integral', () => {
    const m = makeModel(integral('a', 'b'), 2);
    expect(arrowRightInLimits(m)).toEqual(pos(5));
  });

  it('ignores plain expressions', () => {
    const m = makeModel(plain('x+y'), 2);
    expect(arrowRightInLimits(m)).toBeNull();
  });

  it('multi-atom lower limit (\\sum_{i=1}^{n})', () => {
    // flat: [first, supFirst, n, subFirst, i, =, 1, carrier] pos 6 is after '1'.
    const m = makeModel(integral('i=1', 'n'), 6);
    expect(arrowRightInLimits(m)).toEqual(pos(1));
  });

  it('left of the integral -> start of the lower limit', () => {
    const m = makeModel(integral('a', 'b'), 0);
    expect(arrowRightInLimits(m)).toEqual(pos(3));
  });

  it('left of the integral -> selects the lower placeholder', () => {
    const m = makeModel(integral('?', '?'), 0);
    expect(arrowRightInLimits(m)).toEqual(sel(3, 4));
  });

  it('after an ordinary atom left of the integral', () => {
    // flat: [first, x, supFirst, b, subFirst, a, carrier]; caret pos 1 after x.
    const m = makeModel(xIntegral('a', 'b'), 1);
    expect(arrowRightInLimits(m)).toEqual(pos(4));
  });

  it('left of a superscript-only carrier -> no override', () => {
    const m = makeModel(supOnly('b'), 0);
    expect(arrowRightInLimits(m)).toBeNull();
  });

  it('mid-lower-limit (not at end) -> no override', () => {
    // flat: [first, supFirst, c, subFirst, a, b, carrier]; pos 4 is after 'a'
    // with 'b' still to its right.
    const m = makeModel(integral('ab', 'c'), 4);
    expect(arrowRightInLimits(m)).toBeNull();
  });

  it('mid-upper-limit (not at end) -> no override', () => {
    // flat: [first, supFirst, b, c, subFirst, a, carrier]; pos 2 after 'b'.
    const m = makeModel(integral('a', 'bc'), 2);
    expect(arrowRightInLimits(m)).toBeNull();
  });

  it('lower limit end with no upper limit -> null', () => {
    // \int_{a}: flat [first, subFirst, a, carrier]; pos 2 is after 'a'.
    const m = makeModel(subOnly('a'), 2);
    expect(arrowRightInLimits(m)).toBeNull();
  });

  it('left of an integral whose lower limit is empty -> null', () => {
    // flat: [first, supFirst, b, subFirst, carrier]
    const m = makeModel(integral('', 'b'), 0);
    expect(arrowRightInLimits(m)).toBeNull();
  });

  it('upper limit end with an empty lower limit -> right of the integral', () => {
    // flat: [first, supFirst, b, subFirst, carrier]; pos 2 is after 'b'.
    const m = makeModel(integral('', 'b'), 2);
    expect(arrowRightInLimits(m)).toEqual(pos(4));
  });

  it('non-collapsed selection inside limits still matches by position', () => {
    // arrowRightInLimits ignores selectionIsCollapsed; the flat-layout rules
    // apply the same. \int_{a}^{b} with a selection ending at lower-limit end.
    const m = makeModel(integral('a', 'b'), 4, false);
    expect(arrowRightInLimits(m)).toEqual(pos(1));
  });
});

describe('arrowLeftInLimits', () => {
  it('start of lower limit -> left of the integral', () => {
    const m = makeModel(integral('a', 'b'), 3);
    expect(arrowLeftInLimits(m)).toEqual(pos(0));
  });

  it('start of upper limit -> end of lower limit', () => {
    const m = makeModel(integral('a', 'b'), 1);
    expect(arrowLeftInLimits(m)).toEqual(pos(4));
  });

  it('start of upper limit -> selects the lower placeholder', () => {
    const m = makeModel(integral('?', '?'), 1);
    expect(arrowLeftInLimits(m)).toEqual(sel(3, 4));
  });

  it('start of upper limit, multi-atom lower -> last lower atom', () => {
    // flat: [first, supFirst, n, subFirst, i, =, 1, carrier]; pos 1.
    const m = makeModel(integral('i=1', 'n'), 1);
    expect(arrowLeftInLimits(m)).toEqual(pos(6));
  });

  it('start of upper limit, superscript-only carrier -> null', () => {
    const m = makeModel(supOnly('b'), 1);
    expect(arrowLeftInLimits(m)).toBeNull();
  });

  it('selected upper placeholder -> end of lower limit', () => {
    const m = makeModel(integral('a', '?'), 2, false);
    expect(arrowLeftInLimits(m)).toEqual(pos(4));
  });

  it('selected upper placeholder -> selects the lower placeholder', () => {
    const m = makeModel(integral('?', '?'), 2, false);
    expect(arrowLeftInLimits(m)).toEqual(sel(3, 4));
  });

  it('non-collapsed selection outside limits -> null', () => {
    const m = makeModel(plain('x+y'), 2, false);
    expect(arrowLeftInLimits(m)).toBeNull();
  });

  it('ignores plain expressions', () => {
    const m = makeModel(plain('x+y'), 2);
    expect(arrowLeftInLimits(m)).toBeNull();
  });

  it('multi-atom lower limit start -> left of the integral', () => {
    const m = makeModel(integral('i=1', 'n'), 3);
    expect(arrowLeftInLimits(m)).toEqual(pos(0));
  });

  it('mid-lower-limit (not at start) -> null', () => {
    // flat: [first, supFirst, c, subFirst, a, b, carrier]; pos 4 after 'a'.
    const m = makeModel(integral('ab', 'c'), 4);
    expect(arrowLeftInLimits(m)).toBeNull();
  });

  it('mid-upper-limit (not at start) -> null', () => {
    // flat: [first, supFirst, b, c, subFirst, a, carrier]; pos 2 after 'b'.
    const m = makeModel(integral('a', 'bc'), 2);
    expect(arrowLeftInLimits(m)).toBeNull();
  });

  it('selected lower placeholder -> null (only upper placeholder passes)', () => {
    // \int_{#?}^{#?} with the lower placeholder selected.
    const m = makeModel(integral('?', '?'), 4, false);
    expect(arrowLeftInLimits(m)).toBeNull();
  });

  it('start of upper limit with an EMPTY lower limit -> null', () => {
    // flat: [first, supFirst, b, subFirst, carrier]; pos 1 at sup 'first'.
    const m = makeModel(integral('', 'b'), 1);
    expect(arrowLeftInLimits(m)).toBeNull();
  });

  it('non-collapsed selection over ordinary atoms inside a limit -> null', () => {
    const m = makeModel(integral('ab', 'c'), 4, false);
    expect(arrowLeftInLimits(m)).toBeNull();
  });
});

describe('lowerPlaceholderSelection', () => {
  it('upper placeholder selected -> selects the lower one', () => {
    const m = makeModel(integral('?', '?'), 2, false);
    expect(lowerPlaceholderSelection(m)).toEqual(sel(3, 4));
  });

  it('no lower placeholder -> null', () => {
    const m = makeModel(integral('a', '?'), 2, false);
    expect(lowerPlaceholderSelection(m)).toBeNull();
  });

  it('caret on a non-placeholder atom -> null', () => {
    const m = makeModel(integral('a', 'b'), 2, false);
    expect(lowerPlaceholderSelection(m)).toBeNull();
  });

  it('selected LOWER placeholder -> null (already correct)', () => {
    const m = makeModel(integral('?', '?'), 4, false);
    expect(lowerPlaceholderSelection(m)).toBeNull();
  });

  it('collapsed caret at the start of the upper limit -> null', () => {
    // pos 1 sits on the superscript 'first' marker, not the placeholder.
    const m = makeModel(integral('a', '?'), 1);
    expect(lowerPlaceholderSelection(m)).toBeNull();
  });

  it('no subscript at all -> null', () => {
    const m = makeModel(supOnly('?'), 2, false);
    expect(lowerPlaceholderSelection(m)).toBeNull();
  });
});

describe('hasBounds', () => {
  it('is true for a superscript or a subscript', () => {
    expect(hasBounds({ type: 'mord', superscript: [atom('first')] })).toBe(
      true,
    );
    expect(hasBounds({ type: 'mord', subscript: [atom('first')] })).toBe(true);
    expect(
      hasBounds({
        type: 'mord',
        superscript: [atom('first')],
        subscript: [atom('first')],
      }),
    ).toBe(true);
  });

  it('is false with no limit branches or a missing atom', () => {
    expect(hasBounds(atom('mord'))).toBe(false);
    expect(hasBounds(null)).toBe(false);
    expect(hasBounds(undefined)).toBe(false);
  });
});

describe('isBoundsCarrier', () => {
  it.each(['extensible-symbol', 'operator', 'mop', 'subsup'])(
    'is true for type %s',
    (type) => {
      expect(isBoundsCarrier(atom(type))).toBe(true);
    },
  );

  it('is true for any atom carrying bounds regardless of type', () => {
    expect(
      isBoundsCarrier({ type: 'mord', subscript: [atom('first')] }),
    ).toBe(true);
  });

  it('is false for ordinary atoms and missing atoms', () => {
    expect(isBoundsCarrier(atom('mord'))).toBe(false);
    expect(isBoundsCarrier(atom('genfrac'))).toBe(false);
    expect(isBoundsCarrier(null)).toBe(false);
    expect(isBoundsCarrier(undefined)).toBe(false);
  });
});

describe('applyCaret', () => {
  const fake = () => {
    const mf = {
      pos: -1,
      sel: null as unknown,
      get position() {
        return mf.pos;
      },
      set position(v: number) {
        mf.pos = v;
      },
      get selection() {
        return mf.sel;
      },
      set selection(v: unknown) {
        mf.sel = v;
      },
    };
    return mf;
  };

  it('position action sets mf.position', () => {
    const mf = fake();
    applyCaret(mf, { kind: 'position', offset: 5 });
    expect(mf.pos).toBe(5);
    expect(mf.sel).toBeNull();
  });

  it('select action sets mf.selection ranges', () => {
    const mf = fake();
    applyCaret(mf, { kind: 'select', anchor: 3, extent: 4 });
    expect(mf.sel).toEqual({ ranges: [[3, 4]] });
    expect(mf.pos).toBe(-1);
  });
});
