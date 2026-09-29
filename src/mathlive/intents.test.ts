import { describe, expect, it } from 'vitest';
import { reduceKeydown } from './intents';
import type { InternalAtom, InternalModel } from './limitNavigation';
import { nextPlaceholderAction } from './limitNavigation';

// Same flat-model conventions as limitNavigation.test.ts: parents come
// after children, '?' denotes a placeholder atom, `children` is wired so
// nextPlaceholderAction's reading-order traversal can reach every branch.
const makeModel = (
  flat: InternalAtom[],
  position: number,
  collapsed = true,
): InternalModel => ({
  position,
  selectionIsCollapsed: collapsed,
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
  // Tree path for reading-order traversal (flat array alone loses it).
  root.children = [rootFirst, carrier];
  return [rootFirst, ...sup, ...sub, carrier];
};

// x+y at top level: [first, x, +, y]
const plain = (s: string) => {
  const root = atom('root');
  const atoms = [atom('first'), ...branchAtoms(s)];
  link(atoms, root, 'main');
  root.children = atoms;
  return atoms;
};

const key = (k: string, mods: Partial<KeyMods> = {}) => ({
  key: k,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});
interface KeyMods {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

const snap = (
  model: InternalModel | null,
  mode = 'math',
  completionOpen = false,
) => ({ model, mode, completionOpen });

const pos = (o: number) => ({ kind: 'position', offset: o });
const sel = (a: number, e: number) => ({ kind: 'select', anchor: a, extent: e });

describe('reduceKeydown: Enter', () => {
  const model = makeModel(plain('x+y'), 2);

  it('plain Enter inserts a line break', () => {
    expect(reduceKeydown(key('Enter'), snap(model))).toEqual({
      type: 'insertBreak',
    });
  });

  it('Shift+Enter creates a new cell', () => {
    expect(
      reduceKeydown(key('Enter', { shiftKey: true }), snap(model)),
    ).toEqual({ type: 'newCell' });
  });

  it('passes through when a completion is open', () => {
    expect(
      reduceKeydown(key('Enter'), snap(model, 'math', true)),
    ).toEqual({ type: 'pass' });
  });

  it('passes through in latex mode', () => {
    expect(reduceKeydown(key('Enter'), snap(model, 'latex'))).toEqual({
      type: 'pass',
    });
  });

  it('passes through with modifiers', () => {
    expect(
      reduceKeydown(key('Enter', { ctrlKey: true }), snap(model)),
    ).toEqual({ type: 'pass' });
  });
});

describe('reduceKeydown: arrows', () => {
  it('lower limit end -> caret intent into the upper limit', () => {
    const m = makeModel(integral('a', 'b'), 4);
    expect(reduceKeydown(key('ArrowRight'), snap(m))).toEqual({
      type: 'caret',
      action: pos(1),
    });
  });

  it('left of the integral -> caret intent into the lower limit', () => {
    const m = makeModel(integral('a', 'b'), 0);
    expect(reduceKeydown(key('ArrowRight'), snap(m))).toEqual({
      type: 'caret',
      action: pos(3),
    });
  });

  it('start of upper limit -> caret intent to lower limit end', () => {
    const m = makeModel(integral('a', 'b'), 1);
    expect(reduceKeydown(key('ArrowLeft'), snap(m))).toEqual({
      type: 'caret',
      action: pos(4),
    });
  });

  it('plain expression -> pass', () => {
    const m = makeModel(plain('x+y'), 2);
    expect(reduceKeydown(key('ArrowRight'), snap(m))).toEqual({
      type: 'pass',
    });
  });

  it('Shift+Arrow passes (selection extension, no limits override)', () => {
    const m = makeModel(integral('a', 'b'), 4);
    expect(
      reduceKeydown(key('ArrowRight', { shiftKey: true }), snap(m)),
    ).toEqual({ type: 'pass' });
  });

  it('ArrowUp/ArrowDown pass (move-out handles cell hops)', () => {
    const m = makeModel(integral('a', 'b'), 4);
    expect(reduceKeydown(key('ArrowUp'), snap(m))).toEqual({ type: 'pass' });
    expect(reduceKeydown(key('ArrowDown'), snap(m))).toEqual({ type: 'pass' });
  });
});

describe('reduceKeydown: Tab', () => {
  it('selects the upper placeholder from the lower one', () => {
    // \int_{#?}^{#?} with the lower placeholder selected (extent 4).
    const m = makeModel(integral('?', '?'), 4, false);
    expect(reduceKeydown(key('Tab'), snap(m))).toEqual({
      type: 'caret',
      action: sel(1, 2),
    });
  });

  it('Shift+Tab goes back to the lower placeholder', () => {
    const m = makeModel(integral('?', '?'), 2, false);
    expect(reduceKeydown(key('Tab', { shiftKey: true }), snap(m))).toEqual({
      type: 'caret',
      action: sel(3, 4),
    });
  });

  it('no placeholders -> pass', () => {
    const m = makeModel(integral('a', 'b'), 4);
    expect(reduceKeydown(key('Tab'), snap(m))).toEqual({ type: 'pass' });
    expect(reduceKeydown(key('Tab'), snap(makeModel(plain('x+y'), 2)))).toEqual(
      { type: 'pass' },
    );
  });
});

describe('reduceKeydown: Backspace', () => {
  it('right of a limits-bearing atom -> caret to the upper limit', () => {
    // \int_{a}^{b}: caret pos 5 is right of the carrier; the last bound in
    // reading order is the upper bound's last atom 'b' (offset 2).
    const m = makeModel(integral('a', 'b'), 5);
    expect(reduceKeydown(key('Backspace'), snap(m))).toEqual({
      type: 'caret',
      action: pos(2),
    });
  });

  it('at the start before a bounds carrier -> hops to its right', () => {
    const m = makeModel(integral('a', 'b'), 0);
    expect(reduceKeydown(key('Backspace'), snap(m))).toEqual({
      type: 'caret',
      action: pos(5),
    });
  });

  it('before a bare operator (bounds cleared) -> deleteForward', () => {
    const carrier = atom('extensible-symbol');
    const root = atom('root');
    const first = atom('first');
    carrier.parent = root;
    first.parent = root;
    first.rightSibling = carrier;
    carrier.leftSibling = first;
    root.children = [first, carrier];
    const m = makeModel([first, carrier], 0);
    expect(reduceKeydown(key('Backspace'), snap(m))).toEqual({
      type: 'deleteForward',
    });
  });

  it('mid-expression -> pass', () => {
    const m = makeModel(plain('x+y'), 2);
    expect(reduceKeydown(key('Backspace'), snap(m))).toEqual({
      type: 'pass',
    });
  });

  it('non-collapsed selection -> pass', () => {
    const m = makeModel(integral('a', 'b'), 5, false);
    expect(reduceKeydown(key('Backspace'), snap(m))).toEqual({ type: 'pass' });
  });
});

describe('reduceKeydown: passthrough', () => {
  const m = makeModel(plain('x+y'), 2);
  it.each(['x', 'Home', 'Delete', 'F5', '1'])(
    'passes %s through untouched',
    (k) => {
      expect(reduceKeydown(key(k), snap(m))).toEqual({ type: 'pass' });
    },
  );

  it('passes arrows with modifiers', () => {
    expect(
      reduceKeydown(key('ArrowRight', { altKey: true }), snap(m)),
    ).toEqual({ type: 'pass' });
  });
});

describe('nextPlaceholderAction', () => {
  it('lower placeholder -> upper placeholder', () => {
    const m = makeModel(integral('?', '?'), 4, false);
    expect(nextPlaceholderAction(m, 1)).toEqual(sel(1, 2));
  });

  it('upper placeholder -> lower placeholder going backward', () => {
    const m = makeModel(integral('?', '?'), 2, false);
    expect(nextPlaceholderAction(m, -1)).toEqual(sel(3, 4));
  });

  it('collapsed caret at lower-limit end -> upper placeholder', () => {
    // \int_{a}^{#?}: caret pos 4 after 'a'; next placeholder is the upper.
    const m = makeModel(integral('a', '?'), 4);
    expect(nextPlaceholderAction(m, 1)).toEqual(sel(1, 2));
  });

  it('past the last placeholder -> null', () => {
    // Caret at upper placeholder (rank after lower): no later placeholder.
    const m = makeModel(integral('?', '?'), 2, false);
    expect(nextPlaceholderAction(m, 1)).toBeNull();
  });

  it('before the first placeholder -> null going backward', () => {
    const m = makeModel(integral('?', '?'), 4, false);
    expect(nextPlaceholderAction(m, -1)).toBeNull();
  });

  it('no placeholders -> null', () => {
    expect(nextPlaceholderAction(makeModel(plain('x+y'), 1), 1)).toBeNull();
  });
});
