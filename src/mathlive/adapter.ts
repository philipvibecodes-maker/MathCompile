import 'mathlive';
import 'mathlive/fonts.css';
import type { MathfieldElement, MoveOutEvent } from 'mathlive';
import {
  applyCaret,
  arrowLeftInLimits,
  arrowRightInLimits,
  hasBounds,
  isBoundsCarrier,
  lowerPlaceholderSelection,
} from './limitNavigation';
import type { CaretAction, InternalModel } from './limitNavigation';

export interface FieldCallbacks {
  onChange: (latex: string) => void;
  // Shift+Enter: create a new cell below the current one.
  onNewCell?: () => void;
  // Caret hit the top/bottom edge of the field: hop to the adjacent cell.
  onMoveOut?: (direction: 'up' | 'down') => void;
  onFocus?: () => void;
}

export interface FieldHandle {
  focus: (edge?: 'start' | 'end') => void;
  getValue: () => string;
  setValue: (latex: string) => void;
  // Insert LaTeX at the caret ('#?' marks placeholders) — used by the
  // palette's "insert derivative" command.
  insert: (latex: string) => void;
  setSmartMode: (v: boolean) => void;
  dispose: () => void;
}

const getModel = (mf: MathfieldElement): InternalModel | undefined =>
  (mf as unknown as { _mathfield?: { model?: InternalModel } })._mathfield
    ?.model;

const isCompletionOpen = () =>
  document
    .getElementById('mathlive-suggestion-popover')
    ?.classList.contains('is-visible') ?? false;

const insertLineBreak = (mf: MathfieldElement) => {
  const model = getModel(mf);
  if (!model) return;
  // addRowAfter no-ops when the caret is nested inside an atom (e.g.
  // \frac{1}{|2}): snap it to just after the nearest ancestor that is a
  // direct child of a row (or of the root), so the break lands on a line
  // boundary with that atom kept whole.
  let atom = model.at(model.position);
  while (
    atom?.parent?.parent &&
    !Array.isArray(atom.parentBranch) &&
    atom.parent.type !== 'root'
  )
    atom = atom.parent;
  if (atom?.parent) mf.position = model.offsetOf(atom);
  mf.executeCommand('addRowAfter');
};

// Attach the app's editing behavior to a <math-field>. This module is the
// single boundary with MathLive internals: `_mathfield` access, shadow-DOM
// reads, and all event wiring live here (challenges.md §2). The keydown
// listener is one ordered intent pipeline — completion popover, latex mode,
// Enter/Shift+Enter, limit-aware arrows, Backspace bounds-hop — so
// precedence is explicit rather than spread across handlers.
export function attachField(
  mf: MathfieldElement,
  cb: FieldCallbacks,
): FieldHandle {
  mf.mathVirtualKeyboardPolicy = 'auto';
  // 'derivative' inserts real \frac atoms directly — no parse-time macro, so
  // nothing is write-only and there is no bake pass (challenges.md §6).
  // Whether d/dx means derivative is a semantic decision deferred to the
  // compiler's IR lowering, not an editor display option.
  mf.inlineShortcuts = {
    ...mf.inlineShortcuts,
    derivative: '\\frac{d#?}{dx}',
  };

  const handleInput = () => cb.onChange(mf.value);

  // The 'input' event is dispatched deferred (setTimeout), which is too
  // late for fast typing — 'selection-change' fires synchronously, so the
  // placeholder selection is moved before the next keystroke lands.
  // The placeholder fix only applies to selections set by template
  // insertion — suppress it while caret navigation (ours or MathLive's
  // arrow/tab keybindings) is in flight, or ArrowRight into the upper
  // limit would immediately be moved back down.
  let suppressSelectionFix = false;
  const apply = (action: CaretAction) => {
    const prev = suppressSelectionFix;
    suppressSelectionFix = true;
    try {
      applyCaret(mf, action);
    } finally {
      suppressSelectionFix = prev;
    }
  };
  const handleSelectionChange = () => {
    if (suppressSelectionFix) return;
    const model = getModel(mf);
    const action = model && lowerPlaceholderSelection(model);
    if (action) apply(action);
  };

  const handleFocusIn = () => cb.onFocus?.();

  // A click on the upper placeholder is deliberate: don't let the
  // placeholder fix drag the selection back to the lower limit.
  const handlePointerDown = () => {
    suppressSelectionFix = true;
    setTimeout(() => (suppressSelectionFix = false), 0);
  };

  // Shift+Arrow at the field's edge also emits move-out; it should only
  // extend the selection, not hop cells.
  let suppressMoveOut = false;

  const handleKeydown = (ev: KeyboardEvent) => {
    suppressMoveOut =
      ev.shiftKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown');
    // MathLive's caret keybindings dispatch 'selection-change' during this
    // same event; don't let the placeholder fix fight deliberate moves.
    if (ev.key === 'Tab' || ev.key.startsWith('Arrow')) {
      suppressSelectionFix = true;
      setTimeout(() => (suppressSelectionFix = false), 0);
    }
    if (ev.key === 'Enter' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      // Capture phase: this runs before MathLive's own keybinding. While the
      // user is typing a \command, Enter accepts the autocomplete
      // suggestion — let MathLive handle it.
      if (mf.mode === 'latex' || isCompletionOpen()) return;
      ev.preventDefault();
      if (ev.shiftKey) cb.onNewCell?.();
      else insertLineBreak(mf);
      return;
    }
    if (
      (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') &&
      !ev.shiftKey &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey
    ) {
      const model = getModel(mf);
      if (model && mf.mode === 'math') {
        const action =
          ev.key === 'ArrowRight'
            ? arrowRightInLimits(model)
            : arrowLeftInLimits(model);
        if (action) {
          ev.preventDefault();
          apply(action);
        }
      }
      return;
    }
    if (ev.key !== 'Backspace' || ev.shiftKey || ev.ctrlKey || ev.metaKey)
      return;
    const model = getModel(mf);
    if (!model || mf.mode !== 'math' || !model.selectionIsCollapsed) return;
    const atom = model.at(model.position);
    if (!atom) return;
    if (hasBounds(atom)) {
      // Caret right after a limits-bearing atom (\int_a^b, \sum...): MathLive
      // descends into the lower bound first; the last bound in reading
      // order is the upper one, so go there instead.
      ev.preventDefault();
      const last = atom.superscript?.at(-1) ?? atom.subscript?.at(-1);
      if (last) mf.position = model.offsetOf(last);
      return;
    }
    if (atom.type === 'first') {
      const right = atom.rightSibling;
      if (!isBoundsCarrier(right)) return;
      // Caret before a limits-bearing atom (e.g. after its bounds were
      // cleared): backspace can only look left, where there's nothing.
      // Hop over its bounds — or if it's a bare operator, delete it.
      ev.preventDefault();
      if (right && hasBounds(right)) mf.position = model.offsetOf(right);
      else mf.executeCommand('deleteForward');
    }
  };

  // MathLive dispatches move-out when the caret hits the top/bottom edge of
  // the field (or of a nested environment); hop to the adjacent cell.
  const handleMoveOut = (ev: CustomEvent<MoveOutEvent>) => {
    if (suppressMoveOut) {
      suppressMoveOut = false;
      return;
    }
    const dir = ev.detail?.direction;
    if (dir === 'upward' || dir === 'downward')
      cb.onMoveOut?.(dir === 'upward' ? 'up' : 'down');
  };

  mf.addEventListener('input', handleInput);
  mf.addEventListener('selection-change', handleSelectionChange);
  mf.addEventListener('focusin', handleFocusIn);
  mf.addEventListener('pointerdown', handlePointerDown, true);
  mf.addEventListener('keydown', handleKeydown, true);
  mf.addEventListener('move-out', handleMoveOut);

  return {
    focus(edge) {
      mf.focus();
      if (edge === 'start') mf.executeCommand('moveToMathfieldStart');
      else if (edge === 'end') mf.executeCommand('moveToMathfieldEnd');
    },
    getValue: () => mf.value,
    setValue: (latex) => mf.setValue(latex),
    insert: (latex) => mf.insert(latex),
    setSmartMode: (v) => {
      mf.smartMode = v;
    },
    dispose() {
      mf.removeEventListener('input', handleInput);
      mf.removeEventListener('selection-change', handleSelectionChange);
      mf.removeEventListener('focusin', handleFocusIn);
      mf.removeEventListener('pointerdown', handlePointerDown, true);
      mf.removeEventListener('keydown', handleKeydown, true);
      mf.removeEventListener('move-out', handleMoveOut);
    },
  };
}
