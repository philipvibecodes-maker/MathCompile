<script lang="ts">
  import { onMount } from 'svelte';
  import { attachField } from '../editor/math-field';
  import type { FieldHandle, MathFieldElement } from '../editor/math-field';
  import { appStore } from '../appState.svelte.ts';
  import type { Cell } from '../appState.svelte.ts';

  // Thin wrapper: the element is created here but every editor
  // interaction goes through the adapter handle. Imperative actions
  // (focus, setValue) are methods on the handle
  // registered in the store — no prop-delta channels like focusNonce.
  let { cell }: { cell: Cell } = $props();

  let mf: MathFieldElement;
  // $state so the value/smartMode effects re-run once attach lands.
  let handle = $state<FieldHandle | undefined>(undefined);

  onMount(() => {
    const id = cell.id;
    const h = attachField(mf, {
      onChange: (latex) => appStore.setLatex(id, latex),
      onNewCell: () => appStore.addCell(id),
      onMoveOut: (dir) => appStore.moveOut(id, dir),
      onFocus: () => appStore.noteFocus(id),
    });
    handle = h;
    // Duplicated cells mount with content already in the store.
    if (cell.latex) h.setValue(cell.latex);
    h.setSmartMode(appStore.smartMode);
    appStore.registerField(id, h);
    return () => {
      appStore.unregisterField(id);
      h.dispose();
    };
  });

  // Push external value changes (e.g. clearing the last cell) into the
  // field; the getValue guard breaks the onChange echo.
  $effect(() => {
    const v = cell.latex;
    if (handle && handle.getValue() !== v) handle.setValue(v);
  });

  $effect(() => handle?.setSmartMode(appStore.smartMode));
</script>

<math-field bind:this={mf}></math-field>
