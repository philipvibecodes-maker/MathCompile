// Test harness for headless MathQuill tests (vitest + happy-dom).
//
// happy-dom supplies a real-enough DOM for MQ's parse/keystroke/serialize
// paths: latex()/typedText()/keystroke() work, <math-field> mounts, focus
// lands on the hidden textarea, and dispatched KeyboardEvents reach MQ's
// keydown handlers. What it does NOT do: real text insertion on keypress
// (drive text via typedText()), Enter never arrives as a keystroke (it
// lands as '\n' text -> the `enter` handler -> insertLineBreak), layout
// (all rects are 0), clipboard, fonts, CSS.highlights, pointer events.
//
// Two mounts:
//   mountRaw()   — a bare mq3.MathField on a <span> (spike.html parity)
//   mountAppField() — the <math-field> element + attachField, the same
//                  wiring MathField.svelte installs in the app.
import { mq3, type MQ, type MQConfig } from './mathquill';
import { defineMathField, type MathFieldElement } from './math-field';
import { attachField, type FieldHandle } from './attach-field';
import {
  SMART_AUTO_COMMANDS,
  SMART_WORD_COMMANDS,
} from './smart-commands';

// Same autoCommands spike.html uses for its bare field.
export const RAW_AUTO_COMMANDS = 'int sum sqrt prod pi infty theta';
export const ADAPTER_AUTO_COMMANDS =
  'int sum sqrt prod pi infty theta derivative def';

/** The app's smart-mode config (MathField.svelte -> setSmartMode). */
export const SMART_OPTIONS: MQConfig = {
  autoCommands: SMART_AUTO_COMMANDS,
  autoWordCommands: SMART_WORD_COMMANDS,
  autoSubscriptNumerals: true,
};

export interface RawField {
  el: HTMLSpanElement;
  mq: MQ;
  events: string[];
}

/** A bare MathQuill field on a span, like e2e/spike.ts mounts it. */
export function mountRaw(opts: MQConfig = {}): RawField {
  const el = document.createElement('span');
  document.body.appendChild(el);
  const events: string[] = [];
  const mq = mq3.MathField(el, {
    autoCommands: RAW_AUTO_COMMANDS,
    ...opts,
    handlers: {
      // spike.ts parity: the bare field's enter handler only logs —
      // insertLineBreak is the <math-field> adapter's default, not MQ's.
      enter: () => events.push('handler:enter'),
      upOutOf: () => events.push('handler:upOutOf'),
      downOutOf: () => events.push('handler:downOutOf'),
      moveOutOf: (dir) => events.push(`handler:moveOutOf:${dir}`),
      edit: () => events.push('handler:edit'),
      ...opts.handlers,
    },
  });
  return { el, mq, events };
}

export interface AppField {
  el: MathFieldElement;
  mq: MQ;
  handle: FieldHandle;
  /** Every callback attachField fired, in order. */
  events: string[];
}

/**
 * The <math-field> custom element + attachField — the wiring the app
 * gives every cell (matrixDimensionsMenu on, smart mode on, the
 * capture-phase Shift+Enter -> new-cell interception, blank-cell
 * Backspace -> delete-out).
 */
export function mountAppField(opts: MQConfig = {}): AppField {
  defineMathField();
  const el = document.createElement('math-field') as MathFieldElement;
  document.body.appendChild(el);
  const events: string[] = [];
  const handle = attachField(el, {
    onChange: () => events.push('change'),
    onNewCell: () => events.push('new-cell'),
    onMoveOut: (d) => events.push(`move-out:${d}`),
    onDeleteOut: () => events.push('delete-out'),
    onFocus: () => events.push('focus'),
  });
  el.options = { ...SMART_OPTIONS, ...opts };
  handle.focus('end');
  return { el, mq: el.mq!, handle, events };
}

/** Type a string through the editor one char at a time. */
export function type(mq: MQ, s: string) {
  for (const ch of s) mq.typedText(ch);
}

/**
 * What a real Enter keypress does: '\n' text -> MQ `enter` handler ->
 * insertLineBreak() (or command acceptance inside an open latex input).
 */
export function pressEnter(mq: MQ) {
  mq.typedText('\n');
}

/**
 * Dispatch a real keydown on MQ's hidden textarea — reaches capture-phase
 * listeners on the element AND MQ's own keystroke dispatch. Text chars and
 * Enter's '\n' insertion do NOT happen headless; use type()/pressEnter().
 */
export function key(field: HTMLElement, init: KeyboardEventInit) {
  const ta = field.querySelector('textarea');
  if (!ta) throw new Error('no mq textarea');
  ta.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
  );
}

export type CaretWhere = 'lower' | 'upper' | 'right' | 'left' | 'none';

/**
 * limits.spec.ts's caretInfo: which bound/edge the .mq-cursor sits in.
 * .mq-sub/.mq-from/.mq-approaches = lower; .mq-sup/.mq-to = upper;
 * else compareDocumentPosition vs the bounds-bearing atom.
 */
export function caretInfo(el: HTMLElement): {
  value: string;
  where: CaretWhere;
} {
  const value = (el as MathFieldElement).value;
  // Scope to the editable field — overlay previews (autocomplete,
  // matrix menu) render their own .mq-* nodes inside the element.
  const root = el.querySelector('.mq-editable-field') ?? el;
  const cursor = root.querySelector('.mq-cursor');
  const op =
    root.querySelector('.mq-int') ??
    root.querySelector('.mq-large-operator') ??
    root.querySelector('.mq-limit');
  if (!cursor || !op) return { value, where: 'none' };
  const bound =
    root.querySelector('.mq-supsub .mq-sub') ??
    root.querySelector('.mq-sub, .mq-from, .mq-approaches');
  if (bound?.contains(cursor)) return { value, where: 'lower' };
  const upper =
    root.querySelector('.mq-supsub .mq-sup') ??
    root.querySelector('.mq-sup, .mq-to');
  if (upper?.contains(cursor)) return { value, where: 'upper' };
  const rel = op.compareDocumentPosition(cursor);
  if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return { value, where: 'right' };
  if (rel & Node.DOCUMENT_POSITION_PRECEDING) return { value, where: 'left' };
  return { value, where: 'none' };
}

/** True when the .mq-cursor sits inside the selected element. */
export function caretAncestor(el: HTMLElement, selector: string): boolean {
  const cursor = el.querySelector('.mq-cursor');
  return (cursor && el.querySelector(selector)?.contains(cursor)) ?? false;
}

/**
 * standard-keys.spec.ts's rowInfo: which \displaylines row the caret is on
 * and the row's text left of the caret.
 */
export function rowInfo(el: HTMLElement): {
  rowIdx: number;
  leftText: string;
} {
  const cur = el.querySelector('.mq-cursor');
  if (!cur) return { rowIdx: -1, leftText: '' };
  const td = cur.closest('td');
  const row = td?.closest('tr');
  const rows = row?.parentElement?.querySelectorAll(':scope > tr');
  return {
    rowIdx: row && rows ? Array.from(rows).indexOf(row) : -1,
    leftText: td
      ? Array.from(td.children)
          .slice(0, Array.from(td.children).indexOf(cur))
          .map((s) => s.textContent)
          .join('')
      : '',
  };
}
