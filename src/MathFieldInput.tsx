import { useEffect, useRef } from 'react';
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

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<
        React.HTMLAttributes<MathfieldElement>,
        MathfieldElement
      >;
    }
  }
}

const getModel = (mf: MathfieldElement): InternalModel | undefined =>
  (mf as unknown as { _mathfield?: { model?: InternalModel } })._mathfield
    ?.model;

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

interface MathFieldInputProps {
  value: string;
  onChange: (latex: string) => void;
  onNewCell?: () => void;
  onMoveOut?: (direction: 'up' | 'down') => void;
  onFocus?: () => void;
  autoFocus?: boolean;
  focusEdge?: 'start' | 'end';
  dIsDerivative: boolean;
}

export default function MathFieldInput({
  value,
  onChange,
  onNewCell,
  onMoveOut,
  onFocus,
  autoFocus,
  focusEdge,
  dIsDerivative,
}: MathFieldInputProps) {
  const ref = useRef<MathfieldElement>(null);
  const latest = useRef({ onChange, onNewCell, onMoveOut, onFocus });
  const suppressMoveOut = useRef(false);
  useEffect(() => {
    latest.current = { onChange, onNewCell, onMoveOut, onFocus };
  });

  useEffect(() => {
    const mf = ref.current;
    if (!mf) return;

    mf.smartMode = true;
    mf.mathVirtualKeyboardPolicy = 'auto';

    const handleInput = () => latest.current.onChange(mf.value);
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
    const handleFocusIn = () => latest.current.onFocus?.();
    // Same for mouse placement: a click on the upper placeholder is deliberate.
    const handlePointerDown = () => {
      suppressSelectionFix = true;
      setTimeout(() => (suppressSelectionFix = false), 0);
    };
    const handleKeydown = (ev: KeyboardEvent) => {
      // Shift+Arrow at the field's edge also emits move-out; it should only
      // extend the selection, not hop cells.
      suppressMoveOut.current =
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
        const popoverOpen = document
          .getElementById('mathlive-suggestion-popover')
          ?.classList.contains('is-visible');
        if (mf.mode === 'latex' || popoverOpen) return;
        ev.preventDefault();
        if (ev.shiftKey) latest.current.onNewCell?.();
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
      if (suppressMoveOut.current) {
        suppressMoveOut.current = false;
        return;
      }
      const dir = ev.detail?.direction;
      if (dir === 'upward' || dir === 'downward')
        latest.current.onMoveOut?.(dir === 'upward' ? 'up' : 'down');
    };

    mf.addEventListener('input', handleInput);
    mf.addEventListener('selection-change', handleSelectionChange);
    mf.addEventListener('focusin', handleFocusIn);
    mf.addEventListener('pointerdown', handlePointerDown, true);
    mf.addEventListener('keydown', handleKeydown, true);
    mf.addEventListener('move-out', handleMoveOut);
    return () => {
      mf.removeEventListener('input', handleInput);
      mf.removeEventListener('selection-change', handleSelectionChange);
      mf.removeEventListener('focusin', handleFocusIn);
      mf.removeEventListener('pointerdown', handlePointerDown, true);
      mf.removeEventListener('keydown', handleKeydown, true);
      mf.removeEventListener('move-out', handleMoveOut);
    };
  }, []);

  useEffect(() => {
    const mf = ref.current;
    if (!mf) return;
    mf.macros = {
      ...mf.macros,
      derivative: dIsDerivative
        ? '\\frac{d#1}{d#2}'
        : '\\frac{ⅆ#1}{ⅆ#2}',
    };
    // Macros expand at parse time, so re-parse to restyle existing content.
    // setValue() is a no-op for identical input, so clear first to force it.
    if (mf.value) {
      const v = mf.getValue();
      mf.setValue('');
      mf.setValue(v);
    }
  }, [dIsDerivative]);

  useEffect(() => {
    const mf = ref.current;
    if (mf && mf.value !== value) mf.setValue(value);
  }, [value]);

  useEffect(() => {
    const mf = ref.current;
    if (!mf || !autoFocus) return;
    mf.focus();
    if (focusEdge === 'start') mf.executeCommand('moveToMathfieldStart');
    else if (focusEdge === 'end') mf.executeCommand('moveToMathfieldEnd');
  }, [autoFocus, focusEdge]);

  return <math-field ref={ref} />;
}
