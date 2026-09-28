import { useEffect, useRef } from 'react';
import 'mathlive';
import 'mathlive/fonts.css';
import type { MathfieldElement } from 'mathlive';

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

interface InternalAtom {
  type: string;
  parentBranch?: string;
  parent?: InternalAtom | null;
  leftSibling?: InternalAtom | null;
  rightSibling?: InternalAtom | null;
  superscript?: InternalAtom[];
  subscript?: InternalAtom[];
}

interface InternalModel {
  position: number;
  selectionIsCollapsed: boolean;
  at(offset: number): InternalAtom | null | undefined;
  offsetOf(atom: InternalAtom): number;
  setSelection(anchor: number, extent: number): void;
}

const getModel = (mf: MathfieldElement): InternalModel | undefined =>
  (mf as unknown as { _mathfield?: { model?: InternalModel } })._mathfield
    ?.model;

const hasBounds = (a?: InternalAtom | null) =>
  !!(a?.superscript || a?.subscript);

const isBoundsCarrier = (a?: InternalAtom | null) =>
  !!a &&
  (a.type === 'extensible-symbol' ||
    a.type === 'operator' ||
    a.type === 'mop' ||
    a.type === 'subsup' ||
    hasBounds(a));

interface MathFieldInputProps {
  value: string;
  onChange: (latex: string) => void;
  onEnterKey?: () => void;
  onFocus?: () => void;
  autoFocus?: boolean;
  dIsDerivative: boolean;
}

export default function MathFieldInput({
  value,
  onChange,
  onEnterKey,
  onFocus,
  autoFocus,
  dIsDerivative,
}: MathFieldInputProps) {
  const ref = useRef<MathfieldElement>(null);
  const latest = useRef({ onChange, onEnterKey, onFocus });
  useEffect(() => {
    latest.current = { onChange, onEnterKey, onFocus };
  });

  useEffect(() => {
    const mf = ref.current;
    if (!mf) return;

    mf.smartMode = true;
    mf.mathVirtualKeyboardPolicy = 'auto';

    const handleInput = () => {
      latest.current.onChange(mf.value);
      // When a template with both limits is inserted (e.g. \int_{#?}^{#?}),
      // MathLive selects the upper bound placeholder first because
      // "superscript" precedes "subscript" in its branch order. Reading order
      // is lower-then-upper, so move the selection down.
      const model = getModel(mf);
      if (!model) return;
      const atom = model.at(model.position);
      if (atom?.type !== 'placeholder' || atom.parentBranch !== 'superscript')
        return;
      const lower = atom.parent?.subscript?.find(
        (a) => a.type === 'placeholder',
      );
      if (!lower) return;
      const off = model.offsetOf(lower);
      model.setSelection(off - 1, off);
    };
    const handleFocusIn = () => latest.current.onFocus?.();
    const handleKeydown = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
        // Capture phase: this runs before MathLive's own keybinding. While the
        // user is typing a \command, Enter accepts the autocomplete
        // suggestion — let MathLive handle it.
        const popoverOpen = document
          .getElementById('mathlive-suggestion-popover')
          ?.classList.contains('is-visible');
        if (mf.mode === 'latex' || popoverOpen) return;
        ev.preventDefault();
        latest.current.onEnterKey?.();
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
        if (last) model.position = model.offsetOf(last);
        return;
      }
      if (atom.type === 'first') {
        const right = atom.rightSibling;
        if (!isBoundsCarrier(right)) return;
        // Caret before a limits-bearing atom (e.g. after its bounds were
        // cleared): backspace can only look left, where there's nothing.
        // Hop over its bounds — or if it's a bare operator, delete it.
        ev.preventDefault();
        if (right && hasBounds(right)) model.position = model.offsetOf(right);
        else mf.executeCommand('deleteForward');
      }
    };

    mf.addEventListener('input', handleInput);
    mf.addEventListener('focusin', handleFocusIn);
    mf.addEventListener('keydown', handleKeydown, true);
    return () => {
      mf.removeEventListener('input', handleInput);
      mf.removeEventListener('focusin', handleFocusIn);
      mf.removeEventListener('keydown', handleKeydown, true);
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
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return <math-field ref={ref} />;
}
