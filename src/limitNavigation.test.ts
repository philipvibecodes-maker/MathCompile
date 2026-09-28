import { describe, expect, it } from 'vitest';
import {
  applyCaret,
  arrowLeftInLimits,
  arrowRightInLimits,
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
