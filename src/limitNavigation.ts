export interface InternalAtom {
  type: string;
  parentBranch?: string;
  parent?: InternalAtom | null;
  leftSibling?: InternalAtom | null;
  rightSibling?: InternalAtom | null;
  superscript?: InternalAtom[];
  subscript?: InternalAtom[];
}

export interface InternalModel {
  position: number;
  selectionIsCollapsed: boolean;
  at(offset: number): InternalAtom | null | undefined;
  offsetOf(atom: InternalAtom): number;
}

export type CaretAction =
  | { kind: 'position'; offset: number }
  | { kind: 'select'; anchor: number; extent: number };

export const hasBounds = (a?: InternalAtom | null) =>
  !!(a?.superscript || a?.subscript);

export const isBoundsCarrier = (a?: InternalAtom | null) =>
  !!a &&
  (a.type === 'extensible-symbol' ||
    a.type === 'operator' ||
    a.type === 'mop' ||
    a.type === 'subsup' ||
    hasBounds(a));

// At the end of the lower limit: go to the start of the upper limit in
// lower-then-upper reading order. The atom to the left of the caret is the
// last subscript atom and the next atom in the flat model is the
// limit-bearing carrier itself. At the end of the upper limit: exit to the
// right of the carrier.
export function arrowRightInLimits(model: InternalModel): CaretAction | null {
  const sub = model.at(model.position);
  const carrier = sub?.parent;
  const next = model.at(model.position + 1);
  if (
    sub &&
    carrier &&
    next === carrier &&
    sub.parentBranch === 'subscript' &&
    isBoundsCarrier(carrier)
  ) {
    // Lower limit end -> upper limit start.
    const upper = carrier.superscript?.find((a) => a.type !== 'first');
    if (!upper) return null;
    const off = model.offsetOf(upper);
    return upper.type === 'placeholder'
      ? { kind: 'select', anchor: off - 1, extent: off }
      : { kind: 'position', offset: off - 1 };
  }
  if (
    sub &&
    sub.parentBranch === 'superscript' &&
    next?.parentBranch === 'subscript' &&
    next.parent === sub.parent &&
    sub.parent &&
    isBoundsCarrier(sub.parent)
  ) {
    // Upper limit end -> right of the limit-bearing atom.
    return { kind: 'position', offset: model.offsetOf(sub.parent) };
  }
  // Immediately left of a limits-bearing atom: descend into the lower limit
  // (first in reading order) instead of the flat-order-first upper limit.
  // In the flat model the atom after the caret is the superscript's 'first'
  // marker, not the carrier — find the carrier via left's rightSibling.
  const left = model.at(model.position);
  const boundsCarrier = left?.rightSibling;
  if (boundsCarrier && isBoundsCarrier(boundsCarrier) && boundsCarrier.subscript) {
    const lower = boundsCarrier.subscript.find((a) => a.type !== 'first');
    if (!lower) return null;
    if (lower.type === 'placeholder') {
      const off = model.offsetOf(lower);
      return { kind: 'select', anchor: off - 1, extent: off };
    }
    const marker = boundsCarrier.subscript.find((a) => a.type === 'first');
    if (marker) return { kind: 'position', offset: model.offsetOf(marker) };
  }
  return null;
}

// At the start of the lower limit: exit to the left of the limit-bearing
// atom (the start of the surrounding branch), instead of into the upper
// limit. Only when the selection is collapsed.
export function arrowLeftInLimits(model: InternalModel): CaretAction | null {
  const atom = model.at(model.position);
  // A selected superscript placeholder (e.g. right after \int_{#?}^{#?} is
  // inserted or ArrowRight lands on it) means "caret at the start of the
  // upper limit" — let that through to the start-of-upper case below.
  const selectedUpperPlaceholder =
    !model.selectionIsCollapsed &&
    atom?.type === 'placeholder' &&
    atom.parentBranch === 'superscript' &&
    atom.leftSibling?.type === 'first';
  if (!model.selectionIsCollapsed && !selectedUpperPlaceholder) return null;
  if (
    atom?.parentBranch === 'subscript' &&
    atom.parent &&
    isBoundsCarrier(atom.parent) &&
    atom.type === 'first'
  ) {
    const carrier = atom.parent;
    let first = carrier;
    while (first.leftSibling) first = first.leftSibling;
    return { kind: 'position', offset: model.offsetOf(first) };
  }
  // At the start of the upper limit (caret right after the superscript
  // 'first' marker): go to the end of the lower limit, which precedes it in
  // lower-then-upper reading order, instead of left of the carrier.
  if (
    atom?.parentBranch === 'superscript' &&
    (atom.type === 'first' || selectedUpperPlaceholder) &&
    atom.parent &&
    isBoundsCarrier(atom.parent) &&
    atom.parent.subscript
  ) {
    const last = atom.parent.subscript.at(-1);
    if (!last || last.type === 'first') return null;
    const off = model.offsetOf(last);
    return last.type === 'placeholder'
      ? { kind: 'select', anchor: off - 1, extent: off }
      : { kind: 'position', offset: off };
  }
  return null;
}

// When a template with both limits is inserted (e.g. \int_{#?}^{#?}),
// MathLive selects the upper bound placeholder first because "superscript"
// precedes "subscript" in its branch order. Reading order is
// lower-then-upper, so move the selection down.
export function lowerPlaceholderSelection(
  model: InternalModel,
): CaretAction | null {
  const atom = model.at(model.position);
  if (atom?.type !== 'placeholder' || atom.parentBranch !== 'superscript')
    return null;
  const lower = atom.parent?.subscript?.find((a) => a.type === 'placeholder');
  if (!lower) return null;
  const off = model.offsetOf(lower);
  return { kind: 'select', anchor: off - 1, extent: off };
}

// Caret changes must go through the public element API — writing
// model.position / model.setSelection does not request a re-render.
export function applyCaret(
  mf: { position: number; selection: unknown },
  action: CaretAction,
): void {
  if (action.kind === 'position') mf.position = action.offset;
  else mf.selection = { ranges: [[action.anchor, action.extent]] };
}
