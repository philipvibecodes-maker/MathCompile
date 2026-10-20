import { TARGETS } from './compile/targets';
import type { AppStore } from './state/store.svelte';
import {
  downloadWorksheetFile,
  pickWorksheetFile,
} from './state/worksheet-file';

export interface Command {
  id: string;
  title: string;
  hint?: string;
  current?: boolean;
  keywords?: string;
  run?: () => void;
  // Commands that need a text argument swap the palette input into a
  // prompt instead of running on pick; Enter submits, Escape cancels.
  prompt?: { placeholder: string; initial: string; run: (value: string) => void };
}

// ms-valued settings knobs share one prompt: integer input clamped to the
// slider range; unparseable input is a no-op.
const msPrompt = (
  placeholder: string,
  current: number,
  max: number,
  set: (ms: number) => void,
): Command['prompt'] => ({
  placeholder,
  initial: String(current),
  run: (v) => {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) set(Math.min(max, Math.max(0, n)));
  },
});

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
      id: 'insert-python',
      title: 'Insert Python cell below',
      keywords: 'code script def function custom python',
      hint: 'Alt+Enter',
      run: () => store.addPythonCell(focusId),
    },
    // Cell-kind conversions — the source text is kept through the flip.
    {
      id: 'to-python',
      title: 'Convert cell to Python',
      keywords: 'code script def function custom',
      hint: 'Alt+M',
      current: store.cells.find((c) => c.id === focusId)?.kind === 'python',
      run: () => store.setCellKind(focusId, 'python'),
    },
    {
      id: 'to-math',
      title: 'Convert cell to math',
      keywords: 'latex expression formula',
      hint: 'Alt+M',
      current: store.cells.find((c) => c.id === focusId)?.kind !== 'python',
      run: () => store.setCellKind(focusId, 'math'),
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
      id: 'new-worksheet',
      title: 'New worksheet',
      keywords: 'create sheet notebook',
      run: () => store.createWorksheet(),
    },
    {
      id: 'rename-worksheet',
      title: `Rename worksheet (${store.activeWorksheet?.name ?? 'Worksheet'})`,
      keywords: 'name title sheet notebook',
      prompt: {
        placeholder: 'New worksheet name…',
        initial: store.activeWorksheet?.name ?? '',
        run: (v) => store.renameWorksheet(store.activeWorksheetId, v),
      },
    },
    {
      id: 'save-worksheet-file',
      title: 'Save worksheet to file',
      keywords: 'export download json backup',
      run: () => {
        const snap = store.worksheetSnapshot();
        if (snap) downloadWorksheetFile(snap.name, snap.cells);
      },
    },
    {
      id: 'open-worksheet-file',
      title: 'Open worksheet from file',
      keywords: 'import load json upload',
      // Opens the OS picker; the imported sheet arrives async.
      run: () => {
        void pickWorksheetFile().then((w) => {
          if (w) store.importWorksheet(w.name, w.cells);
        });
      },
    },
    {
      id: 'toggle-smart',
      title: 'Smart mode',
      keywords: 'toggle option autocomplete',
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
    // The settings menu's options, mirrored so they're reachable from the
    // palette (the menu itself only renders for the codegen targets).
    {
      id: 'settings-import-all',
      title: 'Settings: import *',
      keywords: 'settings sympy import star codegen qualified',
      current: store.importAll,
      run: () => (store.importAll = !store.importAll),
    },
    {
      id: 'settings-plumbing',
      title: 'Settings: display plumbing',
      keywords: 'settings calculator generated code plumbing',
      current: store.showPlumbing,
      run: () => (store.showPlumbing = !store.showPlumbing),
    },
    {
      id: 'settings-pair-interval',
      title: 'Settings: (a,b) is an open interval',
      keywords: 'settings pair tuple interval codegen',
      current: store.pairTuple === 'interval',
      run: () => (store.pairTuple = 'interval'),
    },
    {
      id: 'settings-pair-matrix',
      title: 'Settings: (a,b) is a 1x2 matrix',
      keywords: 'settings pair tuple matrix codegen',
      current: store.pairTuple === 'matrix',
      run: () => (store.pairTuple = 'matrix'),
    },
    {
      id: 'settings-fade',
      title: 'Settings: fade duration (ms)',
      keywords: 'settings animation fade code line',
      prompt: msPrompt('fade ms (0-800)', store.fadeMs, 800, (n) => {
        store.fadeMs = n;
      }),
    },
    {
      id: 'settings-debounce',
      title: 'Settings: issue debounce (ms)',
      keywords: 'settings animation debounce issues delay',
      prompt: msPrompt('debounce ms (0-2000)', store.debounceMs, 2000, (n) => {
        store.debounceMs = n;
      }),
    },
    {
      id: 'settings-fade-in',
      title: 'Settings: issue fade-in (ms)',
      keywords: 'settings animation fade issues overlay',
      prompt: msPrompt('fade-in ms (0-800)', store.fadeInMs, 800, (n) => {
        store.fadeInMs = n;
      }),
    },
    {
      id: 'settings-fade-out',
      title: 'Settings: issue fade-out (ms)',
      keywords: 'settings animation fade issues overlay',
      prompt: msPrompt('fade-out ms (0-800)', store.fadeOutMs, 800, (n) => {
        store.fadeOutMs = n;
      }),
    },
    {
      id: 'search-help',
      title: 'Search help…',
      keywords: 'how question guide documentation hint keystroke',
      hint: 'Ctrl+/',
      run: () => store.openHelpSearch(),
    },
    {
      id: 'open-guide',
      title: 'Open user guide (PDF)',
      keywords: 'help documentation manual pdf guide',
      run: () =>
        window.open(`${import.meta.env.BASE_URL}user-guide.pdf`, '_blank'),
    },
    ...TARGETS.filter((t) => t.enabled).map((t) => ({
      id: `target-${t.id}`,
      title: `Target: ${t.label}`,
      keywords: 'set compile codegen language output',
      current: t.id === store.target,
      run: () => (store.target = t.id),
    })),
    ...store.worksheets.map((w) => ({
      id: `worksheet-${w.id}`,
      title: `Worksheet: ${w.name}`,
      keywords: 'switch sheet notebook',
      current: w.id === store.activeWorksheetId,
      run: () => store.switchWorksheet(w.id),
    })),
    ...store.cells.map((e, i) => ({
      id: `goto-${e.id}`,
      title: `Go to expression ${i + 1}: ${e.latex.trim() || '(empty)'}`,
      keywords: 'focus jump cell',
      run: () => store.focusCell(e.id, 'end' as const),
    })),
  ];
};
