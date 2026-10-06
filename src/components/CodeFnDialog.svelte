<script lang="ts">
  import { onMount } from 'svelte';
  import {
    codeFnDialog,
    codeFns,
    defineCodeFn,
    removeCodeFn,
  } from '../compile/codefns.svelte.ts';

  // Define Python function dialog: name + params + a Python body; saved
  // defs emit `name = lambda params: body` in every cell's prelude and
  // `\name{args}`/`name(args)` calls resolve to them. Always mounted —
  // .open flips visibility like the command palette.
  let name = $state('');
  let params = $state('');
  let body = $state('');
  let nameRef: HTMLInputElement;

  const nameError = $derived(
    name === ''
      ? ''
      : /^[a-zA-Z]+$/.test(name)
        ? ''
        : 'letters only — this is also the \\name command',
  );
  const canSave = $derived(name !== '' && nameError === '' && body !== '');

  function save() {
    if (!canSave) return;
    defineCodeFn({
      name,
      params: params
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p !== ''),
      body,
    });
    name = '';
    params = '';
    body = '';
    codeFnDialog.open = false;
  }

  const close = () => (codeFnDialog.open = false);

  $effect(() => {
    if (codeFnDialog.open) nameRef?.focus();
  });

  onMount(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (codeFnDialog.open && e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeydown, true);
    return () => window.removeEventListener('keydown', onKeydown, true);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="codefn-backdrop"
  class:open={codeFnDialog.open}
  aria-hidden={!codeFnDialog.open}
  onclick={close}
>
  <div
    class="codefn"
    role="dialog"
    aria-modal="true"
    aria-label="Define Python function"
    onclick={(e) => e.stopPropagation()}
  >
    <h3 class="codefn-title">Define Python function</h3>
    <p class="codefn-blurb">
      Bind a name to a Python body — it runs in every cell's prelude, so
      <code>{'\\name{args}'}</code> calls it anywhere.
    </p>
    <label class="codefn-field">
      Name
      <input
        bind:this={nameRef}
        bind:value={name}
        placeholder="clen"
        spellcheck="false"
      />
    </label>
    {#if nameError !== ''}
      <p class="codefn-error">{nameError}</p>
    {/if}
    <label class="codefn-field">
      Params <span class="codefn-hint">comma-separated</span>
      <input bind:value={params} placeholder="n, k=0" spellcheck="false" />
    </label>
    <label class="codefn-field">
      Python body
      <textarea
        bind:value={body}
        placeholder="k if n == 1 else clen(3*n+1 if n%2 else n//2, k+1)"
        rows="3"
        spellcheck="false"
      ></textarea>
    </label>
    <div class="codefn-actions">
      <button
        class="codefn-save"
        disabled={!canSave}
        onclick={save}
        onkeydown={(e) => e.key === 'Enter' && save()}>Define</button
      >
    </div>
    {#if codeFns.length > 0}
      <ul class="codefn-list">
        {#each codeFns as f (f.name)}
          <li>
            <code>\{f.name}({f.params.join(', ')})</code>
            <span class="codefn-body">{f.body}</span>
            <button
              class="codefn-remove"
              title="Remove"
              onclick={() => removeCodeFn(f.name)}>×</button
            >
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
