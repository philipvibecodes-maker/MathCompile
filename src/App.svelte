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
    <span class="stack" title="Built with Svelte + MathLive">
      <svg
        class="svelte-mark"
        viewBox="0 0 98.1 118"
        role="img"
        aria-label="Svelte"
        ><path
          fill="#FF3E00"
          d="M91.8 15.6C80.9-.1 59.2-4.7 43.6 5.2L16.1 23.8a30.2 30.2 0 0 0-6.7 7.9 29.8 29.8 0 0 0-3.1 20.9 30 30 0 0 0 .8 4.5 30.4 30.4 0 0 0-4 10.9 29.8 29.8 0 0 0 3.1 20.9c10.9 15.7 32.6 20.3 48.2 10.4l27.5-18.6a30.2 30.2 0 0 0 6.7-7.9 29.8 29.8 0 0 0 3.1-20.9 30 30 0 0 0-.8-4.5 30.4 30.4 0 0 0 4-10.9 29.8 29.8 0 0 0-3.1-20.9z"
        /><path
          fill="#FFF"
          d="M40.9 103.9a20.3 20.3 0 0 1-23.7-8.7 18.6 18.6 0 0 1-2.3-14.9 18.8 18.8 0 0 1 .6-2.4l.7-1.4 1.6 1a20.9 20.9 0 0 0 6.6 2.5l.6.1-.1.6a6.3 6.3 0 0 0 1.2 4.6 6.9 6.9 0 0 0 8 2.9 7 7 0 0 0 2.1-1.2l27.5-18.6a6.7 6.7 0 0 0 3.1-5.6 6.8 6.8 0 0 0-1.1-4.5 6.9 6.9 0 0 0-8-2.9 7 7 0 0 0-2.1 1.2l-10.8 7.3a19.8 19.8 0 0 1-6.4 2.6 20.3 20.3 0 0 1-23.7-8.7 18.6 18.6 0 0 1-2.3-14.9 20 20 0 0 1 4.6-8.4l27.5-18.6a19.4 19.4 0 0 1 4.9-2.9 20.3 20.3 0 0 1 23.7 8.7 18.6 18.6 0 0 1 2.3 14.9 18.8 18.8 0 0 1-.6 2.4l-.7 1.4-1.6-1a20.9 20.9 0 0 0-6.6-2.5l-.6-.1.1-.6a6.3 6.3 0 0 0-1.2-4.6 6.9 6.9 0 0 0-8-2.9 7 7 0 0 0-2.1 1.2L35.1 49.3a6.7 6.7 0 0 0-3.1 5.6 6.8 6.8 0 0 0 1.1 4.5 6.9 6.9 0 0 0 8 2.9 7 7 0 0 0 2.1-1.2l10.8-7.3a19.8 19.8 0 0 1 6.4-2.6 20.3 20.3 0 0 1 23.7 8.7 18.6 18.6 0 0 1 2.3 14.9 20 20 0 0 1-4.6 8.4L52.3 101.8a19.4 19.4 0 0 1-4.9 2.9 20 20 0 0 1-6.5.8z"
        /></svg
      ><span class="stack-name">mathlive</span>
    </span>
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
