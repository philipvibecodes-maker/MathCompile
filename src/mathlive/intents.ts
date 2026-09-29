import {
  arrowLeftInLimits,
  arrowRightInLimits,
  hasBounds,
  isBoundsCarrier,
  nextPlaceholderAction,
} from './limitNavigation';
import type { CaretAction, InternalModel } from './limitNavigation';

// One pure reducer for every app-level key opinion (challenges.md §1/§3/§5):
// the adapter captures keydown before MathLive's bindings, snapshots the
// model, and calls this. Keys we claim return an Intent (applied
// synchronously, preventing MathLive's competing behavior — e.g. Tab's
// placeholder navigation); keys we don't claim return 'pass'.
export interface KeyInfo {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export interface KeySnapshot {
  model: InternalModel | null;
  // mf.mode: 'math' or 'latex' (typing a \command)
  mode: string;
  completionOpen: boolean;
}

export type Intent =
  | { type: 'caret'; action: CaretAction }
  | { type: 'insertBreak' }
  | { type: 'newCell' }
  | { type: 'deleteForward' }
  | { type: 'pass' };

export function reduceKeydown(key: KeyInfo, snap: KeySnapshot): Intent {
  const plain = !key.ctrlKey && !key.metaKey && !key.altKey;

  // Enter precedence: an open completion popover or a pending \command lets
  // MathLive accept first; then Shift+Enter = new cell, else line break.
  if (key.key === 'Enter' && plain) {
    if (snap.completionOpen || snap.mode === 'latex') return { type: 'pass' };
    return key.shiftKey ? { type: 'newCell' } : { type: 'insertBreak' };
  }

  // Limit-aware horizontal arrows (lower-then-upper reading order).
  if (
    (key.key === 'ArrowRight' || key.key === 'ArrowLeft') &&
    plain &&
    !key.shiftKey &&
    snap.model &&
    snap.mode === 'math'
  ) {
    const action =
      key.key === 'ArrowRight'
        ? arrowRightInLimits(snap.model)
        : arrowLeftInLimits(snap.model);
    return action ? { type: 'caret', action } : { type: 'pass' };
  }

  // Tab navigates placeholders in reading order — claimed so the
  // selection-change placeholder fix can't yank the selection back.
  // Pass through when no placeholder applies (Tab can still leave the field).
  if (key.key === 'Tab' && plain) {
    if (snap.model && snap.mode === 'math') {
      const action = nextPlaceholderAction(snap.model, key.shiftKey ? -1 : 1);
      if (action) return { type: 'caret', action };
    }
    return { type: 'pass' };
  }

  // Backspace edge cases around limits-bearing atoms.
  if (
    key.key === 'Backspace' &&
    !key.shiftKey &&
    !key.ctrlKey &&
    !key.metaKey &&
    snap.model &&
    snap.mode === 'math' &&
    snap.model.selectionIsCollapsed
  ) {
    const atom = snap.model.at(snap.model.position);
    if (!atom) return { type: 'pass' };
    if (hasBounds(atom)) {
      // Caret right after a limits-bearing atom (\int_a^b, \sum...): MathLive
      // descends into the lower bound first; the last bound in reading
      // order is the upper one, so go there instead.
      const last = atom.superscript?.at(-1) ?? atom.subscript?.at(-1);
      return last
        ? { type: 'caret', action: { kind: 'position', offset: snap.model.offsetOf(last) } }
        : { type: 'pass' };
    }
    if (atom.type === 'first') {
      const right = atom.rightSibling;
      if (!isBoundsCarrier(right)) return { type: 'pass' };
      // Caret before a limits-bearing atom (e.g. after its bounds were
      // cleared): backspace can only look left, where there's nothing.
      // Hop over its bounds — or if it's a bare operator, delete it.
      if (right && hasBounds(right))
        return {
          type: 'caret',
          action: { kind: 'position', offset: snap.model.offsetOf(right) },
        };
      return { type: 'deleteForward' };
    }
  }

  return { type: 'pass' };
}
