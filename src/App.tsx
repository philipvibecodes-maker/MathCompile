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
        <span class="stack-credit">
          <svg
            class="solid-logo"
            viewBox="0 0 24 24"
            role="img"
            aria-label="SolidJS"
          >
            <path d="M11.558.788A9.082 9.082 0 0 0 9.776.99l-.453.15c-.906.303-1.656.755-2.1 1.348l-.301.452-2.035 3.528c.426-.387.974-.698 1.643-.894h.001l.613-.154h.001a8.82 8.82 0 0 1 1.777-.206c2.916-.053 6.033 1.148 8.423 2.36 2.317 1.175 3.888 2.32 3.987 2.39L24 5.518c-.082-.06-1.66-1.21-3.991-2.386-2.393-1.206-5.521-2.396-8.45-2.343zM8.924 5.366a8.634 8.634 0 0 0-1.745.203l-.606.151c-1.278.376-2.095 1.16-2.43 2.108-.334.948-.188 2.065.487 3.116.33.43.747.813 1.216 1.147L12.328 10h.001a6.943 6.943 0 0 1 6.013 1.013l2.844-.963c-.17-.124-1.663-1.2-3.91-2.34-2.379-1.206-5.479-2.396-8.352-2.344zm5.435 4.497a6.791 6.791 0 0 0-1.984.283L2.94 13.189 0 18.334l9.276-2.992a6.945 6.945 0 0 1 7.408 2.314v.001c.695.903.89 1.906.66 2.808l2.572-4.63c.595-1.041.45-2.225-.302-3.429a6.792 6.792 0 0 0-5.255-2.543zm-3.031 5.341a6.787 6.787 0 0 0-2.006.283L.008 18.492c.175.131 2.02 1.498 4.687 2.768 2.797 1.332 6.37 2.467 9.468 1.712l.454-.152h.002c1.278-.376 2.134-1.162 2.487-2.09.353-.93.207-2.004-.541-2.978a6.791 6.791 0 0 0-5.237-2.548z" />
          </svg>
          <span class="mathlive-word">mathlive</span>
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
