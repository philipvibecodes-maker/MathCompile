import { createEffect, onCleanup, onMount, For } from 'solid-js';
import MathFieldInput from './components/MathFieldInput';
import OutputPanel from './components/OutputPanel';
import CommandPalette from './components/CommandPalette';
import { createCommands } from './commands';
import { appStore } from './store';

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

export default function App() {
  const commands = createCommands(appStore);

  // Capture phase so Ctrl+K is seen even inside a <math-field>, which may
  // swallow keydown events at the target.
  onMount(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyK') {
        e.preventDefault();
        appStore.setPaletteOpen((v) => !v);
        return;
      }
      if (appStore.paletteOpen()) return;
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === 'KeyS') {
        e.preventDefault();
        appStore.setSmartMode((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeydown, true);
    onCleanup(() => window.removeEventListener('keydown', onKeydown, true));
  });

  // Refocus the active cell when the palette closes. Focus updates queued
  // by the command that just ran are already applied here.
  createEffect((wasOpen) => {
    const open = appStore.paletteOpen();
    if (wasOpen && !open) {
      const id = appStore.focusedId();
      if (id != null) appStore.focusCell(id);
    }
    return open;
  });

  return (
    <div class="app">
      <header class="app-header">
        <span class="logo">
          Math<em>Compile</em>
        </span>
        <button
          class="palette-button"
          onClick={() => appStore.setPaletteOpen(true)}
        >
          Commands
          <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
      </header>
      <div class="main">
        <section class="expr-panel">
          <ol class="expr-list">
            <For each={appStore.exprs}>
              {(e, i) => (
                <li class="expr-row">
                  <span class="expr-index">{i() + 1}</span>
                  <MathFieldInput expr={e} />
                  <button
                    class="expr-delete"
                    title="Delete expression"
                    aria-label="Delete expression"
                    onClick={() => appStore.removeExpr(e.id)}
                  >
                    ×
                  </button>
                </li>
              )}
            </For>
          </ol>
          <button class="add-expr" onClick={() => appStore.addExpr()}>
            + Add expression
          </button>
        </section>
        <OutputPanel />
      </div>
      <CommandPalette commands={commands()} />
    </div>
  );
}
