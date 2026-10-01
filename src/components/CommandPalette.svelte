<script lang="ts">
  import { onMount } from 'svelte';
  import { fuzzyScore } from '../fuzzy';
  import type { Command } from '../commands';
  import { appStore } from '../state/store.svelte';

  // Permanently mounted: opening is a visibility flip + focus(), not a
  // mount — cold-open cost is gone by design.
  let { commands }: { commands: Command[] } = $props();

  let query = $state('');
  let index = $state(0);
  let inputRef: HTMLInputElement;
  let listRef: HTMLUListElement;
  let rootRef: HTMLDivElement;

  let matches = $derived.by(() => {
    const scored: { c: Command; s: number }[] = [];
    for (const c of commands) {
      const s = fuzzyScore(query, `${c.title} ${c.keywords ?? ''}`);
      if (s != null) scored.push({ c, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored;
  });

  let sel = $derived(Math.min(index, matches.length - 1));

  const close = () => appStore.closePalette();

  // On open: reset state and focus the input. The palette is already laid
  // out (always mounted), so focus() is cheap. The deferred re-assert is
  // guarded: with the palette still mounted, a stale focus() after close
  // would steal focus back from a cell.
  $effect(() => {
    if (!appStore.paletteOpen) return;
    query = '';
    index = 0;
    inputRef?.focus();
    const t = setTimeout(() => {
      if (appStore.paletteOpen) inputRef?.focus();
    }, 70);
    return () => clearTimeout(t);
  });

  // Items select on mousemove, not mouseenter: a cursor parked over
  // the list fires mouseenter when the palette renders under it (the
  // layout hit-test), which would steal the keyboard selection.
  // Escape must close even if focus has drifted out of the input.
  onMount(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (appStore.paletteOpen && e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeydown, true);
    return () => window.removeEventListener('keydown', onKeydown, true);
  });

  $effect(() => {
    const i = sel;
    if (!appStore.paletteOpen || i < 0) return;
    listRef
      ?.querySelector('.cmd-item.selected')
      ?.scrollIntoView({ block: 'nearest' });
  });

  // Keep focus inside while the palette is open. Re-check openness inside
  // the timeout — commands close the palette while focus is already moving
  // to a cell, and the mounted input must not take it back.
  const onFocusOut = (e: FocusEvent) => {
    if (
      appStore.paletteOpen &&
      rootRef &&
      !rootRef.contains(e.relatedTarget as Node)
    )
      setTimeout(() => {
        if (!appStore.paletteOpen) return;
        // A blur that leaves focus on <body> is a dismiss signal: keyboard
        // extensions unfocus the input on Escape while suppressing the
        // keydown itself, so the unfocus is the only part the page sees. A
        // focus move to a real element is not.
        if (document.activeElement === document.body) close();
        else inputRef?.focus();
      }, 0);
  };

  const pick = (c: Command) => {
    c.run();
    close();
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      index = Math.min(index + 1, matches.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      index = Math.max(index - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = matches[sel];
      if (m) pick(m.c);
    }
    // Escape is handled by the window capture listener.
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="palette-backdrop"
  class:open={appStore.paletteOpen}
  aria-hidden={!appStore.paletteOpen}
  onclick={close}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    bind:this={rootRef}
    class="palette"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Command palette"
    onclick={(e) => e.stopPropagation()}
    onmousedown={(e) => {
      // Inner clicks keep focus in the input; the input itself keeps
      // default behavior so the caret can be placed by mouse.
      if (e.target !== inputRef) e.preventDefault();
    }}
    onfocusout={onFocusOut}
  >
    <input
      bind:this={inputRef}
      class="palette-input"
      placeholder="Type a command…"
      bind:value={query}
      role="combobox"
      aria-expanded="true"
      aria-controls="palette-list"
      aria-activedescendant={sel >= 0 ? `palette-opt-${sel}` : undefined}
      oninput={() => (index = 0)}
      onkeydown={onKeydown}
    />
    <ul class="palette-list" id="palette-list" role="listbox" bind:this={listRef}>
      {#each matches as m, i (m.c.id)}
        <li
          id={`palette-opt-${i}`}
          role="option"
          aria-selected={i === sel}
          class="cmd-item"
          class:selected={i === sel}
          onmousemove={() => (index = i)}
          onclick={() => pick(m.c)}
        >
          <span class="cmd-title">{m.c.title}</span>
          {#if m.c.current}<span class="cmd-current">✓</span>{/if}
          {#if m.c.hint}<kbd class="cmd-hint">{m.c.hint}</kbd>{/if}
        </li>
      {/each}
      {#if matches.length === 0}
        <li class="cmd-empty">No matching commands</li>
      {/if}
    </ul>
    <div class="palette-footer">↑↓ navigate · Enter run · Esc close</div>
  </div>
</div>
