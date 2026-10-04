/**
 * App-level capture-phase keymap. Runs before per-field handling so it
 * works inside <math-field> hidden textareas (which may swallow keydown
 * at the target). Returns an uninstaller.
 */
export interface GlobalKeymapOptions {
  onPaletteToggle(): void;
}

export function installGlobalKeymap(opts: GlobalKeymapOptions) {
  const onKeydown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyK') {
      e.preventDefault();
      opts.onPaletteToggle();
    }
  };
  window.addEventListener('keydown', onKeydown, true);
  return () => window.removeEventListener('keydown', onKeydown, true);
}
