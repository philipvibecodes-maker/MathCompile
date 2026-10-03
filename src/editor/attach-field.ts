import {
  isMqKeyTarget,
  pointerRecentlyDown,
  type MathFieldElement,
  type MoveOutDetail,
} from './math-field';
import { attachAutocompleteMenu } from './ac-menu';
import { attachSymbolPicker } from './ac-picker';

export interface FieldCallbacks {
  onChange: (latex: string) => void;
  // Shift+Enter (new-cell event): create a new cell below the current one.
  onNewCell?: () => void;
  // Caret hit the top/bottom edge of the field: hop to the adjacent cell.
  onMoveOut?: (direction: 'up' | 'down') => void;
  // Backspace/Delete pressed while the field holds only a blank line.
  onDeleteOut?: () => void;
  onFocus?: () => void;
}

export interface FieldHandle {
  focus: (edge?: 'start' | 'end') => void;
  getValue: () => string;
  setValue: (latex: string) => void;
  // Type a keystroke sequence at the caret exactly as a user would
  // ('\\int\n' runs the \int command input and accepts it with Enter,
  // leaving the caret in the lower bound — the same as typing it).
  type: (text: string) => void;
  // Smart mode = MQ autoCommands + autoSubscriptNumerals.
  setSmartMode: (v: boolean) => void;
  // Per-line anchors of the rendered \\displaylines, in field-relative
  // px — the index is the \\-row index (statement order). `top`/`height`
  // frame the line; `right` is the line's content end, where an inline
  // issue tail would start. Used to pin indicators beside a line.
  lineAnchors: () => { top: number; height: number; right: number }[];
  dispose: () => void;
}

const SMART_AUTO_COMMANDS =
  'int iint antid sum sqrt prod pi infty theta derivative def';

// "Only one blank line": an empty field, or a lone \displaylines wrap
// around nothing (what a single Enter-then-blank line serializes as).
const BLANK_LATEX = /^\s*$|^\\displaylines\{\s*\}$/;

// Attach the app's editing behavior to a <math-field>: translates the
// element's DOM events into FieldCallbacks and returns the FieldHandle
// the rest of the app sees. Nothing outside src/editor/ touches
// MathQuill — math-field.ts owns MQ internals, this file owns the
// app-facing contract.
export function attachField(
  el: MathFieldElement,
  cb: FieldCallbacks,
): FieldHandle {
  const handleInput = () => cb.onChange(el.value);
  const handleFocusIn = () => cb.onFocus?.();

  // A blur to nowhere that no click caused is a programmatic blur —
  // Vimium's insert-mode Escape does exactly this (and eats the
  // keydown, so the field never sees it). Refocus the cell: Escape
  // must always land the user back in the input.
  const handleFocusOut = (e: FocusEvent) => {
    if (e.relatedTarget === null && !pointerRecentlyDown())
      el.mq?.focus();
  };

  // move-out: hop cells on vertical edges; skip selection extensions
  // (shift-arrow dead-ends emit move-out with selecting=true).
  const handleMoveOut = (ev: Event) => {
    const detail = (ev as CustomEvent<MoveOutDetail>).detail;
    if (detail.selecting) return;
    if (detail.direction === 'upward') cb.onMoveOut?.('up');
    else if (detail.direction === 'downward') cb.onMoveOut?.('down');
  };
  const handleNewCell = () => cb.onNewCell?.();
  // Backspace/Delete on a blank cell deletes the cell — intercept before
  // MQ's hidden textarea so MQ never munges the keypress.
  const handleKeydown = (e: KeyboardEvent) => {
    if (!isMqKeyTarget(e.target)) return;
    if (
      (e.key === 'Backspace' || e.key === 'Delete') &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      BLANK_LATEX.test(el.value.trim())
    ) {
      e.preventDefault();
      cb.onDeleteOut?.();
    }
  };

  el.addEventListener('input', handleInput);
  el.addEventListener('focusin', handleFocusIn);
  el.addEventListener('focusout', handleFocusOut);
  el.addEventListener('move-out', handleMoveOut);
  el.addEventListener('new-cell', handleNewCell);
  el.addEventListener('keydown', handleKeydown, true);

  const detachAutocomplete = attachAutocompleteMenu(el);
  const detachPicker = attachSymbolPicker(el);

  return {
    focus: (edge) => el.focus({ edge }),
    getValue: () => el.value,
    setValue: (latex) => {
      el.value = latex;
      // A programmatic set fires no input event — if MathQuill rejected
      // or canonicalized the value (unparseable latex wipes the field),
      // push the effective value back so the store/output column can't
      // keep displaying latex the field doesn't contain.
      if (el.value !== latex) cb.onChange(el.value);
    },
    // '\n' segments are Enter *keystrokes*, not typedText('\n'): keystroke
    // dispatch is what accepts an open \… command input (typedText('\n')
    // would go to the enter handler and insert a line break instead).
    type: (text) => {
      for (const [i, seg] of text.split('\n').entries()) {
        if (i > 0) el.mq?.keystroke('Enter');
        if (seg) el.mq?.typedText(seg);
      }
    },
    setSmartMode: (v) =>
      el.config({
        autoCommands: v ? SMART_AUTO_COMMANDS : '',
        autoSubscriptNumerals: v,
      }),
    lineAnchors: () => {
      const fieldRect = el.getBoundingClientRect();
      const toAnchor = (r: DOMRect) => ({
        top: r.top - fieldRect.top,
        height: r.height,
        right: r.right - fieldRect.left,
      });
      const rows = el.querySelectorAll<HTMLElement>(
        '.mq-displaylines > table > tr',
      );
      if (rows.length > 0)
        return [...rows].map((tr) =>
          // The last td holds the line's math — its right edge is where
          // an inline tail would start.
          toAnchor(
            (tr.querySelector('td:last-child') ?? tr).getBoundingClientRect(),
          ),
        );
      // Single-line field: the root block is the line; anchor at its
      // last rendered child's right edge so a tail hugs the expression.
      const last =
        el.querySelector<HTMLElement>('.mq-root-block')
          ?.lastElementChild ?? el;
      return [toAnchor(last.getBoundingClientRect())];
    },
    dispose() {
      el.removeEventListener('input', handleInput);
      el.removeEventListener('focusin', handleFocusIn);
      el.removeEventListener('focusout', handleFocusOut);
      el.removeEventListener('move-out', handleMoveOut);
      el.removeEventListener('new-cell', handleNewCell);
      el.removeEventListener('keydown', handleKeydown, true);
      detachAutocomplete();
      detachPicker();
    },
  };
}
