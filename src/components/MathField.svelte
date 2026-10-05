<script lang="ts">
  import { onMount } from 'svelte';
  import { attachField } from '../editor/attach-field';
  import type { FieldHandle } from '../editor/attach-field';
  import type { MathFieldElement } from '../editor/math-field';
  import { HELP_ENTRIES } from '../editor/context-help';
  import type { HelpContext } from '../editor/context-help';
  import { appStore } from '../state/store.svelte';
  import type { Cell } from '../state/store.svelte';

  // Thin wrapper: the element is created here but every editor
  // interaction goes through the adapter handle. Imperative actions
  // (focus, setValue) are methods on the handle
  // registered in the store — never prop-encoded commands.
  let { cell }: { cell: Cell } = $props();

  let mf: MathFieldElement;
  // $state so the value/smartMode effects re-run once attach lands.
  let handle = $state<FieldHandle | undefined>(undefined);
  // Caret-position context for the hint strip inside the field;
  // helpShown holds the last non-null context so content stays put
  // while the strip fades out.
  let help = $state<HelpContext | null>(null);
  let helpShown = $state<HelpContext | null>(null);

  onMount(() => {
    const id = cell.id;
    const h = attachField(mf, {
      onChange: (latex) => appStore.setLatex(id, latex),
      onNewCell: () => appStore.addCell(id),
      onMoveOut: (dir) => appStore.moveOut(id, dir),
      onDeleteOut: () => appStore.deleteFocused(),
      onFocus: () => appStore.noteFocus(id),
      onCaretContext: (ctx) => {
        help = ctx;
        if (ctx) helpShown = ctx;
      },
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

<math-field bind:this={mf} class:empty={cell.latex.trim() === ''}>
  <div class="caret-help" class:on={help !== null} aria-hidden={help === null}>
    {#if helpShown}
      {#each HELP_ENTRIES[helpShown] as e (e.key)}
        <span class="caret-help-item"><kbd>{e.key}</kbd> {e.does}</span>
      {/each}
    {/if}
  </div>
</math-field>
