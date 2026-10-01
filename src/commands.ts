import { TARGETS } from './compile/targets';
import type { AppStore } from './state/store.svelte';

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
      id: 'toggle-smart',
      title: 'Smart mode',
      keywords: 'toggle option autocomplete',
      hint: 'Alt+S',
      current: store.smartMode,
      run: () => (store.smartMode = !store.smartMode),
    },
    {
      id: 'toggle-dark',
      title: 'Dark mode',
      keywords: 'toggle theme appearance light night',
      current: store.darkMode,
      run: () => (store.darkMode = !store.darkMode),
    },
    ...TARGETS.filter((t) => t.enabled).map((t) => ({
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
