import { mq3, type MQ, type MQConfig } from './mathquill';

export type MoveDirection = 'upward' | 'downward' | 'forward' | 'backward';

export interface MoveOutDetail {
  direction: MoveDirection;
  /** true when the out-of-field move came from a selection extension. */
  selecting: boolean;
}

/**
 * Framework-free `<math-field>` custom element wrapping a vendored
 * MathQuill v3 EditableField. Keeps the e2e-facing contract of the old
 * MathLive element: a `<math-field>` host that dispatches `input` on
 * edits and `move-out` (detail.direction: up/down/forward/backward)
 * when the caret leaves the field.
 *
 * Keymap contract (mirrors the old app):
 * - Enter → MQ `enter` handler → `insertLineBreak()` (vendored env
 *   patch): matrix row inside a matrix, \displaylines split otherwise.
 *   LatexCommandInput Enter stays MQ-owned (command acceptance).
 * - Shift+Enter → cancelable capture-phase keydown interception →
 *   `new-cell` event; MQ never sees the keypress.
 * - move-out selecting flag lets the app suppress cell hops while
 *   shift-selecting.
 */
export class MathFieldElement extends HTMLElement {
  static readonly tag = 'math-field';

  /** Set before/after connect; passed through to MQ `config()`. */
  private _options: MQConfig = {};
  get options(): MQConfig {
    return this._options;
  }
  set options(value: MQConfig) {
    this._options = value;
    this._mq?.config(value);
  }

  private host: HTMLSpanElement | undefined;
  private _mq: MQ | undefined;

  get mq(): MQ | undefined {
    return this._mq;
  }

  get value(): string {
    return this._mq?.latex() ?? '';
  }
  set value(latex: string) {
    this._mq?.latex(latex);
  }

  connectedCallback() {
    if (this._mq) return;
    this.host = document.createElement('span');
    this.host.className = 'mq-mount';
    this.appendChild(this.host);

    const opts = this._options;
    const userHandlers = opts.handlers;
    this._mq = mq3.MathField(this.host, {
      ...opts,
      handlers: {
        ...userHandlers,
        edit: (mq) => {
          this.dispatchEvent(new InputEvent('input', { bubbles: true }));
          userHandlers?.edit?.(mq);
        },
        // App hook wins; default Enter semantics is a line break.
        enter: (mq) =>
          userHandlers?.enter ? userHandlers.enter(mq) : mq.insertLineBreak(),
        moveOutOf: (dir, mq) => {
          this.emitMoveOut(dir === -1 ? 'backward' : 'forward');
          userHandlers?.moveOutOf?.(dir, mq);
        },
        upOutOf: (mq) => {
          this.emitMoveOut('upward');
          userHandlers?.upOutOf?.(mq);
        },
        downOutOf: (mq) => {
          this.emitMoveOut('downward');
          userHandlers?.downOutOf?.(mq);
        },
        selectOutOf: (dir, mq) => {
          this.emitMoveOut(dir === -1 ? 'backward' : 'forward', true);
          userHandlers?.selectOutOf?.(dir, mq);
        },
        deleteOutOf: (dir, mq) => {
          this.dispatchEvent(
            new CustomEvent('delete-out', {
              bubbles: true,
              detail: { direction: dir === -1 ? 'backward' : 'forward' },
            }),
          );
          userHandlers?.deleteOutOf?.(dir, mq);
        },
      },
    });

    // Capture phase on the element: Shift+Enter becomes a `new-cell`
    // request before MQ's hidden textarea ever sees the keypress (a
    // canceled keydown suppresses the keypress that would call the
    // `enter` handler).
    this.addEventListener(
      'keydown',
      (e) => {
        if (
          e.key === 'Enter' &&
          e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey
        ) {
          e.preventDefault();
          this.dispatchEvent(new CustomEvent('new-cell', { bubbles: true }));
        }
      },
      true,
    );

    this._mq.config(this._options);
  }

  private emitMoveOut(direction: MoveDirection, selecting = false) {
    this.dispatchEvent(
      new CustomEvent<MoveOutDetail>('move-out', {
        bubbles: true,
        detail: { direction, selecting },
      }),
    );
  }

  focus(opts?: { edge?: 'start' | 'end' }) {
    const mq = this._mq;
    if (!mq) return;
    mq.focus();
    if (opts?.edge === 'start') mq.moveToLeftEnd();
    else if (opts?.edge === 'end') mq.moveToRightEnd();
  }

  blur() {
    this._mq?.blur();
  }

  config(options: MQConfig) {
    this.options = { ...this._options, ...options };
  }
}

export function defineMathField() {
  if (!customElements.get(MathFieldElement.tag))
    customElements.define(MathFieldElement.tag, MathFieldElement);
}
