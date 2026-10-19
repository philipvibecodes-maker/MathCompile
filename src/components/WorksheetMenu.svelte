<script lang="ts">
  import { appStore } from '../state/store.svelte';
  import {
    downloadWorksheetFile,
    readWorksheetFile,
  } from '../state/worksheet-file';

  // Header dropdown over the workbook: switch, rename, delete sheets and
  // move them in/out of .mathcompile.json files. Mirrors the settings
  // menu's open-class + backdrop pattern.
  let open = $state(false);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let confirmingDeleteId = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | undefined>(undefined);

  const close = () => {
    open = false;
    renamingId = null;
    confirmingDeleteId = null;
  };

  function switchTo(id: string) {
    appStore.switchWorksheet(id);
    close();
  }

  function startRename(id: string, name: string) {
    renamingId = id;
    renameValue = name;
  }

  function commitRename() {
    if (renamingId !== null) appStore.renameWorksheet(renamingId, renameValue);
    renamingId = null;
  }

  function onDelete(id: string) {
    if (confirmingDeleteId === id) {
      appStore.deleteWorksheet(id);
      confirmingDeleteId = null;
    } else {
      confirmingDeleteId = id;
    }
  }

  function saveToFile() {
    const snap = appStore.worksheetSnapshot();
    if (snap) downloadWorksheetFile(snap.name, snap.cells);
    close();
  }

  async function onFileChosen(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const picked = await readWorksheetFile(file);
    if (!picked) return;
    appStore.importWorksheet(picked.name, picked.cells);
    close();
  }
</script>

<div class="worksheets">
  <button
    class="worksheets-btn"
    title="Worksheets"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open ? close() : (open = true))}
  >
    <span class="worksheets-current"
      >{appStore.activeWorksheet?.name ?? 'Worksheet'}</span
    >
    <span class="worksheets-caret" aria-hidden="true">▾</span>
  </button>
  {#if open}
    <button
      class="settings-backdrop"
      aria-label="Close worksheets menu"
      onclick={close}
    ></button>
    <div class="worksheets-menu" role="menu">
      <div class="worksheets-list">
        {#each appStore.worksheets as w (w.id)}
          <div
            class="ws-row"
            class:active={w.id === appStore.activeWorksheetId}
          >
            {#if renamingId === w.id}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                class="ws-rename"
                bind:value={renameValue}
                autofocus
                onkeydown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') renamingId = null;
                }}
                onblur={commitRename}
              />
            {:else}
              <button
                class="ws-name"
                role="menuitem"
                onclick={() => switchTo(w.id)}>{w.name}</button
              >
              <button
                class="ws-icon"
                title="Rename worksheet"
                aria-label="Rename {w.name}"
                onclick={() => startRename(w.id, w.name)}>✎</button
              >
              {#if appStore.worksheets.length > 1}
                <button
                  class="ws-icon ws-delete"
                  class:confirming={confirmingDeleteId === w.id}
                  title={confirmingDeleteId === w.id
                    ? 'Click again to delete'
                    : 'Delete worksheet'}
                  aria-label="Delete {w.name}"
                  onclick={() => onDelete(w.id)}
                  >{confirmingDeleteId === w.id ? '?' : '×'}</button
                >
              {/if}
            {/if}
          </div>
        {/each}
      </div>
      <div class="ws-actions">
        <button
          class="ws-action"
          role="menuitem"
          onclick={() => {
            appStore.createWorksheet();
            close();
          }}>+ New worksheet</button
        >
        <button
          class="ws-action"
          role="menuitem"
          onclick={() => fileInput?.click()}>Open from file…</button
        >
        <button class="ws-action" role="menuitem" onclick={saveToFile}
          >Save to file</button
        >
      </div>
    </div>
  {/if}
  <input
    bind:this={fileInput}
    type="file"
    accept=".json,application/json"
    class="ws-file"
    tabindex="-1"
    aria-hidden="true"
    onchange={onFileChosen}
  />
</div>
