/**
 * App-level capture-phase keymap. Runs before per-field handling so it
 * works inside <math-field> hidden textareas (which may swallow keydown
 * at the target). Returns an uninstaller.
 */
export interface GlobalKeymapOptions {
  onPaletteToggle(): void;
  onSmartModeToggle(): void;
  isPaletteOpen(): boolean;
}

export function installGlobalKeymap(opts: GlobalKeymapOptions) {
  const onKeydown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyK') {
      e.preventDefault();
      opts.onPaletteToggle();
      return;
    }
    if (opts.isPaletteOpen()) return;
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'KeyS') {
      e.preventDefault();
      opts.onSmartModeToggle();
    }
  };
  window.addEventListener('keydown', onKeydown, true);
  return () => window.removeEventListener('keydown', onKeydown, true);
}
