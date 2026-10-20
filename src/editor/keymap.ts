/**
 * App-level capture-phase keymap. Runs before per-field handling so it
 * works inside <math-field> hidden textareas (which may swallow keydown
 * at the target). Returns an uninstaller.
 */
export interface GlobalKeymapOptions {
  onPaletteToggle(): void;
  onHelpSearch(): void;
  onInsertPython?(): void;
  onToggleCellKind?(): void;
}

export function installGlobalKeymap(opts: GlobalKeymapOptions) {
  const onKeydown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyK') {
      e.preventDefault();
      opts.onPaletteToggle();
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'Slash') {
      e.preventDefault();
      opts.onHelpSearch();
    } else if (e.altKey && e.code === 'Enter') {
      e.preventDefault();
      opts.onInsertPython?.();
    } else if (e.altKey && e.code === 'KeyM') {
      e.preventDefault();
      opts.onToggleCellKind?.();
    }
  };
  window.addEventListener('keydown', onKeydown, true);
  return () => window.removeEventListener('keydown', onKeydown, true);
}
