<script lang="ts">
  import { onMount } from 'svelte';
  import MathField from './components/MathField.svelte';
  import OutputPanel from './components/OutputPanel.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import { appStore } from './appState.svelte.ts';
  import { buildCommands } from './commands.ts';

  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  let commands = $derived(buildCommands(appStore));

  // Capture phase so Ctrl+K is seen even inside a <math-field>, which may
  // swallow keydown events at the target.
  onMount(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyK') {
        e.preventDefault();
        appStore.togglePalette();
        return;
      }
      if (appStore.paletteOpen) return;
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === 'KeyS') {
        e.preventDefault();
        appStore.smartMode = !appStore.smartMode;
      }
    };
    window.addEventListener('keydown', onKeydown, true);
    return () => window.removeEventListener('keydown', onKeydown, true);
  });
</script>

<div class="app">
  <header class="app-header">
    <span class="logo">Math<em>Compile</em></span>
    <button class="palette-button" onclick={() => appStore.openPalette()}>
      Commands
      <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
  </header>
  <div class="main">
    <section class="expr-panel">
      <ol class="expr-list">
        {#each appStore.cells as cell, i (cell.id)}
          <li class="expr-row">
            <span class="expr-index">{i + 1}</span>
            <MathField {cell} />
            <button
              class="expr-delete"
              title="Delete expression"
              aria-label="Delete expression"
              onclick={() => appStore.removeCell(cell.id)}>×</button
            >
          </li>
        {/each}
      </ol>
      <button class="add-expr" onclick={() => appStore.addCell()}>
        + Add expression
      </button>
    </section>
    <OutputPanel />
  </div>
  <CommandPalette {commands} />
</div>
