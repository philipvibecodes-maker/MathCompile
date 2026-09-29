// The single boundary with MathQuill (challenges.md §2). attachField wires
// the vendored field onto a <math-field> host element and exposes the
// element-level API the e2e suite uses (getValue/setValue/smartMode/focus).
// Everything MathQuill-specific — config, handler plumbing, __controller
// peeking — lives here and nowhere else.
import { L, MQ } from './mathquill';

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
  // Insert LaTeX at the caret; a `\word` string resolves through LatexCmds
  // (e.g. '\\derivative' inserts the editable fraction template with the
  // caret in the numerator).
  insert: (latexOrCmd: string) => void;
  setSmartMode: (v: boolean) => void;
  dispose: () => void;
}

// __controller is runtime-accessible but outside the public types — the
// narrow slice we need for caret placement after template insertions.
interface MQInternals {
  __controller: {
    cursor: {
      [k: number]: unknown;
      insAtRightEnd: (node: unknown) => void;
    };
  };
}

const AUTO_COMMANDS = [
  'sum',
  'int',
  'prod',
  'sqrt',
  'nthroot',
  'pi',
  'theta',
  'forall',
  'exists',
  'infty',
  'infinity',
  'union',
  'intersection',
  'derivative',
].join(' ');

export function attachField(
  el: HTMLElement,
  cb: FieldCallbacks,
): FieldHandle {
  const mq = MQ.MathField(el, {
    autoCommands: AUTO_COMMANDS,
    handlers: {
      // Content changed (typing, paste, latex()): push to the store.
      edit: () => cb.onChange(mq.latex()),
      // Plain Enter at the top level splits the row into a \displaylines
      // env. Inside a matrix/lines cell Enter is handled by the cell's
      // own keystroke (add row / split) and never reaches this hook.
      enter: () => mq.insertRowBreak(),
      // Caret hit a vertical dead end at the field's edge.
      upOutOf: () => cb.onMoveOut?.('up'),
      downOutOf: () => cb.onMoveOut?.('down'),
    },
  });

  // The host itself is focusable so plain `el.focus()` (or Playwright's
  // CDP-level DOM.focus, which bypasses JS property overrides) lands on it;
  // we bounce it straight into MQ's textarea.
  el.tabIndex = -1;
  const handleHostFocus = () => mq.focus();

  // Shift+Enter is an app-level "new cell" command, intercepted in the
  // capture phase before MQ's textarea sees it — otherwise the '\n' would
  // reach the `enter` handler and split the row instead.
  const handleKeydown = (ev: KeyboardEvent) => {
    if (
      ev.key === 'Enter' &&
      ev.shiftKey &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey
    ) {
      ev.preventDefault();
      ev.stopPropagation();
      cb.onNewCell?.();
    }
  };
  const handleFocusIn = () => cb.onFocus?.();
  el.addEventListener('focus', handleHostFocus);
  el.addEventListener('keydown', handleKeydown, true);
  el.addEventListener('focusin', handleFocusIn);

  let smartMode = false;
  const handle: FieldHandle = {
    focus(edge) {
      mq.focus();
      if (edge === 'start') mq.moveToLeftEnd();
      else if (edge === 'end') mq.moveToRightEnd();
    },
    getValue: () => mq.latex(),
    setValue: (latex) => {
      mq.latex(latex);
    },
    insert: (latexOrCmd) => {
      mq.focus();
      if (/^\\[a-z]+$/i.test(latexOrCmd)) {
        mq.cmd(latexOrCmd);
      } else {
        mq.write(latexOrCmd);
        // If the last-inserted node is an environment (matrix/lines), drop
        // the caret into its first cell rather than after the whole thing.
        const cursor = (mq as unknown as MQInternals).__controller.cursor;
        const left = cursor[L] as {
          getEnd?: (dir: number) => unknown;
        } | null;
        const firstCell = left?.getEnd?.(L);
        if (firstCell) cursor.insAtRightEnd(firstCell);
      }
    },
    setSmartMode: (v) => {
      smartMode = v;
      mq.config({
        autoSubscriptNumerals: v,
        sumStartsWithNEquals: v,
      });
    },
    dispose() {
      el.removeEventListener('focus', handleHostFocus);
      el.removeEventListener('keydown', handleKeydown, true);
      el.removeEventListener('focusin', handleFocusIn);
      mq.revert();
    },
  };

  // Element-level API the e2e suite (and DevTools) pokes at the host.
  Object.defineProperties(el, {
    getValue: { value: handle.getValue },
    setValue: { value: handle.setValue },
    smartMode: {
      get: () => smartMode,
      set: (v: boolean) => handle.setSmartMode(v),
    },
  });

  return handle;
}
