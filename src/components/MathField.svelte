<script lang="ts">
  import { onMount } from 'svelte';
  import { attachField } from '../editor/attach-field';
  import type { FieldHandle } from '../editor/attach-field';
  import { caretHint } from '../editor/caret-hints';
  import type { MathFieldElement } from '../editor/math-field';
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

  let hint = $state<string | null>(null);
  const refreshHint = () => {
    if (!mf) return;
    hint =
      !mf.contains(document.activeElement) && mf.value === ''
        ? null
        : mf.contains(document.activeElement)
          ? (caretHint(mf) ??
            (mf.value === ''
              ? 'type \\ for commands · smart words: int sum sqrt lim · Shift+Enter: new cell'
              : null))
          : null;
  };

  onMount(() => {
    const id = cell.id;
    const h = attachField(mf, {
      onChange: (latex) => appStore.setLatex(id, latex),
      onNewCell: () => appStore.addCell(id),
      onMoveOut: (dir) => appStore.moveOut(id, dir),
      onDeleteOut: () => appStore.deleteFocused(),
      onFocus: () => appStore.noteFocus(id),
    });
    handle = h;
    // Duplicated cells mount with content already in the store.
    if (cell.latex) h.setValue(cell.latex);
    h.setSmartMode(appStore.smartMode);
    appStore.registerField(id, h);

    // Caret hints update on anything that can move the caret: edits,
    // keys, clicks, focus shifts. rAF lets MQ process the key first.
    const update = () => requestAnimationFrame(refreshHint);
    for (const ev of ['input', 'keyup', 'mouseup', 'focusin', 'focusout'])
      mf.addEventListener(ev, update);
    refreshHint();
    return () => {
      for (const ev of ['input', 'keyup', 'mouseup', 'focusin', 'focusout'])
        mf.removeEventListener(ev, update);
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
{#if hint}
  <div class="field-hint" role="status">{hint}</div>
{/if}
