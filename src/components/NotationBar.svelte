<script lang="ts">
  import {
    defineUserMacro,
    listAll,
    removeUserMacro,
  } from '../notation/macros.svelte';
  import { appStore } from '../state/store.svelte';
  import Static from './Static.svelte';

  // Notation chip bar: every defined macro is a chip that inserts `\name`
  // into the focused cell. `+` opens an inline define form
  // (`vv(x,y) = \mathbf{x}`); × removes a UI-defined macro (cell-defined
  // ones are edited in their cell).

  let macros = $derived(listAll());
  let addOpen = $state(false);
  let nameArg = $state('');
  let body = $state('');
  let addError = $state('');

  const sig = (m: { name: string; arity: number }) =>
    m.arity > 0
      ? `\\${m.name}(${Array(m.arity).fill('·').join(',')})`
      : `\\${m.name}`;

  function parseNameArg(raw: string) {
    const m = raw.trim().match(/^([A-Za-z]+)\s*(?:\(\s*([^)]*?)\s*\))?$/);
    if (!m) return null;
    const params = (m[2] ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== '');
    return { name: m[1], params };
  }

  function add() {
    const p = parseNameArg(nameArg);
    if (!p) {
      addError = 'name like vv or vv(x,y)';
      return;
    }
    const b = body.trim();
    if (b === '') {
      addError = 'expansion is empty';
      return;
    }
    if (
      !defineUserMacro({
        name: p.name,
        arity: p.params.length,
        params: p.params,
        body: b,
      })
    ) {
      addError = `\\${p.name} is already a command`;
      return;
    }
    nameArg = '';
    body = '';
    addError = '';
    addOpen = false;
  }

  function insert(name: string) {
    const id = appStore.focusedId;
    appStore.fields.get(id)?.insertCommand(`\\${name}`);
  }

  function onFormKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') add();
    else if (e.key === 'Escape') {
      addOpen = false;
      addError = '';
    }
  }
</script>

<div class="notation-bar">
  <span class="notation-label">notation</span>
  <div class="notation-chips">
    {#each macros as m (m.source + ':' + m.name)}
      <span class="notation-chip" class:cell={m.source === 'cell'}>
        <button
          class="notation-insert"
          title={m.source === 'cell'
            ? `${m.body} — defined in a cell`
            : m.body}
          onmousedown={(e) => e.preventDefault()}
          onclick={() => insert(m.name)}
        >
          <span class="notation-sig">{sig(m)}</span>
          <span class="notation-arrow">→</span>
          <span class="notation-body"><Static latex={m.body} /></span>
        </button>
        {#if m.source === 'user'}
          <button
            class="notation-del"
            title="Remove \\{m.name}"
            aria-label="Remove \\{m.name}"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => removeUserMacro(m.name)}>×</button
          >
        {/if}
      </span>
    {/each}
    <button
      class="notation-add"
      title="Define notation"
      aria-expanded={addOpen}
      onmousedown={(e) => e.preventDefault()}
      onclick={() => (addOpen = !addOpen)}>+</button
    >
  </div>
  <!-- Always mounted (palette pattern): .open flips visibility +
       opacity so the bar's height never changes. -->
  <div class="notation-form" class:open={addOpen}>
    <input
      class="notation-name"
      placeholder="vv(x,y)"
      bind:value={nameArg}
      onkeydown={onFormKeydown}
      spellcheck="false"
      tabindex={addOpen ? 0 : -1}
    />
    <span class="notation-eq">=</span>
    <input
      class="notation-body"
      placeholder={'\\mathbf{x}'}
      bind:value={body}
      onkeydown={onFormKeydown}
      spellcheck="false"
      tabindex={addOpen ? 0 : -1}
    />
    <button
      class="notation-save"
      onclick={add}
      tabindex={addOpen ? 0 : -1}>add</button
    >
    {#if addError}
      <span class="notation-error">{addError}</span>
    {/if}
    <span class="notation-form-prev"><Static latex={body} /></span>
  </div>
</div>
