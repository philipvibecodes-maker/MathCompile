import { TARGETS } from './targets';
import type { AppStore } from './appState.svelte.ts';

export interface Command {
  id: string;
  title: string;
  hint?: string;
  current?: boolean;
  keywords?: string;
  run: () => void;
}

// The command list reads the store directly; wrap the call in $derived at
// the callsite so the (always-mounted) palette only recomputes it when the
// underlying state changes.
export const buildCommands = (store: AppStore): Command[] => {
  const focusId = store.focusedId;
  return [
    {
      id: 'insert-below',
      title: 'Insert expression below',
      keywords: 'new add cell row',
      hint: 'Shift+Enter',
      run: () => store.addCell(focusId),
    },
    {
      id: 'duplicate',
      title: 'Duplicate current expression',
      keywords: 'copy clone cell',
      run: () => store.duplicateCell(focusId),
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
      run: () => store.fields.get(focusId)?.insert('\\frac{d}{d#?}'),
    },
    {
      id: 'toggle-derivative',
      title: 'd/dx means derivative',
      keywords: 'toggle option fraction',
      current: store.dIsDerivative,
      run: () => (store.dIsDerivative = !store.dIsDerivative),
    },
    {
      id: 'toggle-smart',
      title: 'Smart mode',
      keywords: 'toggle option autocomplete',
      hint: 'Alt+S',
      current: store.smartMode,
      run: () => (store.smartMode = !store.smartMode),
    },
    ...TARGETS.map((t) => ({
      id: `target-${t.id}`,
      title: `Target: ${t.label}`,
      keywords: 'set compile codegen language output',
      current: t.id === store.target,
      run: () => (store.target = t.id),
    })),
    ...store.cells.map((e, i) => ({
      id: `goto-${e.id}`,
      title: `Go to expression ${i + 1}: ${e.latex.trim() || '(empty)'}`,
      keywords: 'focus jump cell',
      run: () => store.focusCell(e.id, 'end' as const),
    })),
  ];
};
