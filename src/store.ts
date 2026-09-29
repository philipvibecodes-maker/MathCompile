import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { FieldHandle } from './mathlive/adapter';
import type { TargetId } from './targets';

export interface Expr {
  id: number;
  latex: string;
}

export type Edge = 'start' | 'end';

let nextId = 1;
export const createExpr = (latex = ''): Expr => ({ id: nextId++, latex });

// App state + the field registry/focus service. Cell ops are DOM-free
// except focusCell, which no-ops when no field is registered for the id —
// so this is fully unit-testable in node.
export function createAppStore() {
  const [exprs, setExprs] = createStore<Expr[]>([createExpr()]);
  const [focusedId, setFocusedId] = createSignal<number | null>(exprs[0].id);
  const [target, setTarget] = createSignal<TargetId>('python');
  const [dIsDerivative, setDIsDerivative] = createSignal(true);
  const [smartMode, setSmartMode] = createSignal(false);
  const [paletteOpen, setPaletteOpen] = createSignal(false);

  // Mounted math-field handles, keyed by cell id. The single focus owner:
  // focus changes go through focusCell rather than prop deltas.
  const fields = new Map<number, FieldHandle>();
  const registerField = (id: number, handle: FieldHandle) =>
    fields.set(id, handle);
  const unregisterField = (id: number) => fields.delete(id);

  const focusCell = (id: number, edge?: Edge) => {
    fields.get(id)?.focus(edge);
    setFocusedId(id);
  };

  const updateExpr = (id: number, latex: string) => {
    const i = exprs.findIndex((e) => e.id === id);
    if (i >= 0) setExprs(i, 'latex', latex);
  };

  const addExpr = (afterId?: number, latex = ''): number => {
    const e = createExpr(latex);
    const at =
      afterId == null
        ? exprs.length
        : Math.max(exprs.findIndex((x) => x.id === afterId) + 1, 0);
    setExprs([...exprs.slice(0, at), e, ...exprs.slice(at)]);
    // Solid renders synchronously, so the new field is registered by the
    // time focusCell runs here.
    focusCell(e.id);
    return e.id;
  };

  const removeExpr = (id: number) => {
    if (exprs.length > 1) setExprs(exprs.filter((e) => e.id !== id));
    else {
      const i = exprs.findIndex((e) => e.id === id);
      if (i >= 0) setExprs(i, 'latex', '');
    }
  };

  const duplicateExpr = (id: number) => {
    const cur = exprs.find((e) => e.id === id);
    if (cur) addExpr(cur.id, cur.latex);
  };

  const deleteFocused = () => {
    const id = focusedId();
    const idx = exprs.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const removedId = exprs[idx].id;
    const next = exprs[idx + 1] ?? exprs[idx - 1];
    removeExpr(removedId);
    if (next && next.id !== removedId) focusCell(next.id);
  };

  const clearAll = () => {
    const e = createExpr();
    setExprs([e]);
    focusCell(e.id);
  };

  // Caret hit the top/bottom edge of cell `id`: hop to the adjacent cell,
  // or append a new one past the last row.
  const moveOut = (id: number, dir: 'up' | 'down') => {
    const i = exprs.findIndex((e) => e.id === id);
    if (i < 0) return;
    const next = i + (dir === 'down' ? 1 : -1);
    if (next < 0) return;
    if (next >= exprs.length) addExpr();
    else focusCell(exprs[next].id, dir === 'down' ? 'start' : 'end');
  };

  return {
    exprs,
    focusedId,
    setFocusedId,
    target,
    setTarget,
    dIsDerivative,
    setDIsDerivative,
    smartMode,
    setSmartMode,
    paletteOpen,
    setPaletteOpen,
    fields,
    registerField,
    unregisterField,
    focusCell,
    updateExpr,
    addExpr,
    removeExpr,
    duplicateExpr,
    deleteFocused,
    clearAll,
    moveOut,
  };
}

export type AppStore = ReturnType<typeof createAppStore>;

export const appStore = createAppStore();
