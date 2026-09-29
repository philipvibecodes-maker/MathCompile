import { createEffect, onCleanup, onMount } from 'solid-js';
import { attachField } from '../editor/adapter';
import type { FieldHandle } from '../editor/adapter';
import { appStore } from '../store';
import type { Expr } from '../store';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': JSX.HTMLAttributes<HTMLElement>;
    }
  }
}

// Thin wrapper: the element is created here but every MathQuill interaction
// goes through the adapter handle (challenges.md §2). Imperative actions
// (focus, setValue) are methods on the handle registered in the store — no
// prop-delta channels like focusNonce.
export default function MathFieldInput(props: { expr: Expr }) {
  let mf!: HTMLElement;
  let handle: FieldHandle | undefined;

  onMount(() => {
    const id = props.expr.id;
    const h = attachField(mf, {
      onChange: (latex) => appStore.updateExpr(id, latex),
      onNewCell: () => appStore.addExpr(id),
      onMoveOut: (dir) => appStore.moveOut(id, dir),
      onFocus: () => appStore.setFocusedId(id),
    });
    handle = h;
    appStore.registerField(id, h);
    // Duplicated cells mount with content already in the store.
    if (props.expr.latex) h.setValue(props.expr.latex);
    h.setSmartMode(appStore.smartMode());
    if (appStore.focusedId() === id) h.focus();
  });
  onCleanup(() => {
    appStore.unregisterField(props.expr.id);
    handle?.dispose();
  });

  // Push external value changes (e.g. clearing the last cell) into the
  // field; the getValue guard breaks the onChange echo.
  createEffect(() => {
    const v = props.expr.latex;
    if (handle && handle.getValue() !== v) handle.setValue(v);
  });
  createEffect(() => handle?.setSmartMode(appStore.smartMode()));

  return <math-field ref={(el) => (mf = el)} />;
}
