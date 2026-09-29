import { createMemo } from 'solid-js';
import { TARGETS } from './targets';
import type { AppStore } from './store';

export interface Command {
  id: string;
  title: string;
  hint?: string;
  current?: boolean;
  keywords?: string;
  run: () => void;
}

// The command list is a memo so the (always-mounted) palette only
// recomputes it when the underlying signals change.
export const createCommands = (store: AppStore) =>
  createMemo<Command[]>(() => {
    const focusId = store.focusedId();
    return [
      {
        id: 'insert-below',
        title: 'Insert expression below',
        keywords: 'new add cell row',
        hint: 'Shift+Enter',
        run: () => store.addExpr(focusId ?? undefined),
      },
      {
        id: 'duplicate',
        title: 'Duplicate current expression',
        keywords: 'copy clone cell',
        run: () => {
          if (focusId != null) store.duplicateExpr(focusId);
        },
      },
      {
        id: 'delete-current',
        title: 'Delete current expression',
        keywords: 'remove cell',
        run: () => store.deleteFocused(),
      },
      {
        id: 'clear-all',
        title: 'Clear all expressions',
        keywords: 'reset delete remove',
        run: () => store.clearAll(),
      },
      {
        id: 'insert-derivative',
        title: 'Insert derivative',
        keywords: 'differentiate fraction',
        run: () =>
          focusId != null && store.fields.get(focusId)?.insert('\\derivative'),
      },
      {
        id: 'toggle-derivative',
        title: 'd/dx means derivative',
        keywords: 'toggle option fraction',
        current: store.dIsDerivative(),
        run: () => store.setDIsDerivative((v) => !v),
      },
      {
        id: 'toggle-smart',
        title: 'Smart mode',
        keywords: 'toggle option autocomplete',
        hint: 'Alt+S',
        current: store.smartMode(),
        run: () => store.setSmartMode((v) => !v),
      },
      ...TARGETS.map((t) => ({
        id: `target-${t.id}`,
        title: `Target: ${t.label}`,
        keywords: 'set compile codegen language output',
        current: t.id === store.target(),
        run: () => store.setTarget(t.id),
      })),
      ...store.exprs.map((e, i) => ({
        id: `goto-${e.id}`,
        title: `Go to expression ${i + 1}: ${e.latex.trim() || '(empty)'}`,
        keywords: 'focus jump cell',
        run: () => store.focusCell(e.id, 'end'),
      })),
    ];
  });
