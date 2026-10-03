<script lang="ts">
  import { onMount } from 'svelte';
  import { COMMAND_CATALOG, type CatalogEntry } from '../command-catalog';
  import { fuzzyScore } from '../fuzzy';
  import { mountStaticMath } from '../editor/static-math';
  import type { FieldHandle } from '../editor/attach-field';
  import type { MathFieldElement } from '../editor/math-field';

  // Autocomplete for the \… command input: while LatexCommandInput is
  // open, a dropdown under it lists matching commands with a rendered
  // preview. ↓/↑ select, Enter completes (retypes the input), Esc
  // dismisses until the input closes, click completes.
  let { field, handle }: { field: MathFieldElement; handle: FieldHandle | undefined } =
    $props();

  let prefix = $state<string | null>(null);
  let anchor = $state<{ left: number; top: number } | null>(null);
  let sel = $state(0);
  // Esc dismisses until the current command input closes.
  let dismissed = $state(false);

  let matches = $derived.by(() => {
    if (prefix == null || dismissed) return [];
    const p = prefix;
    const scored: { e: CatalogEntry; s: number }[] = [];
    for (const e of COMMAND_CATALOG) {
      let s: number | null;
      if (e.cmd.startsWith(p)) s = 10000 - e.cmd.length;
      else s = fuzzyScore(p, `${e.cmd} ${e.title} ${e.kw ?? ''}`);
      if (s != null) scored.push({ e, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 8);
  });

  const refresh = () => {
    const inputEl =
      field.querySelector<HTMLElement>('.mq-latex-command-input');
    if (!inputEl) {
      prefix = null;
      dismissed = false;
      return;
    }
    // textContent = '\' + the letters typed so far, plus a zero-width
    // space that lives in .mq-cursor — strip both.
    const p = (inputEl.textContent ?? '')
      .replace(/^\\/, '')
      .replace(/\u200b/g, '');
    if (p !== prefix) sel = 0;
    prefix = p;
    const r = inputEl.getBoundingClientRect();
    anchor = { left: r.left, top: r.bottom + 4 };
  };

  const complete = (e: CatalogEntry) => {
    const h = handle;
    if (!h || prefix == null) return;
    // The input may hold letters that aren't a prefix of the pick
    // (fuzzy hit): erase it and retype the full command.
    for (let i = 0; i < prefix.length; i++) h.keystroke('Backspace');
    h.type(e.cmd + (e.accept === false ? '' : '\n'));
    prefix = null;
    dismissed = false;
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (prefix == null || dismissed || matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      sel = Math.min(sel + 1, matches.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      sel = Math.max(sel - 1, 0);
    } else if (e.key === 'Escape') {
      // Swallow: dismiss only the dropdown — the command input stays.
      e.preventDefault();
      e.stopPropagation();
      dismissed = true;
    } else if (e.key === 'Enter' && prefix.length > 0) {
      const m = matches[Math.min(sel, matches.length - 1)];
      if (m) {
        e.preventDefault();
        e.stopPropagation();
        complete(m.e);
      }
    }
  };

  onMount(() => {
    const update = () => requestAnimationFrame(refresh);
    for (const ev of ['input', 'keyup', 'mouseup', 'focusin', 'focusout'])
      field.addEventListener(ev, update);
    field.addEventListener('keydown', onKeydown, true);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    refresh();
    return () => {
      for (const ev of ['input', 'keyup', 'mouseup', 'focusin', 'focusout'])
        field.removeEventListener(ev, update);
      field.removeEventListener('keydown', onKeydown, true);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  });

  const previewMath = (node: HTMLElement, latex: string) => {
    const h = mountStaticMath(node);
    h.set(latex);
    return { update: (l: string) => h.set(l) };
  };
</script>

{#if matches.length > 0 && anchor}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="cmd-suggest"
    style={`left:${anchor.left}px; top:${anchor.top}px`}
    onmousedown={(e) => e.preventDefault()}
  >
    {#each matches as m, i (m.e.cmd)}
      <div
        class="cmd-sug-item"
        class:selected={i === Math.min(sel, matches.length - 1)}
        onmousemove={() => (sel = i)}
        onclick={() => complete(m.e)}
        role="option"
        tabindex="-1"
        aria-selected={i === Math.min(sel, matches.length - 1)}
      >
        <span class="cmd-sug-glyph" use:previewMath={m.e.preview}></span>
        <code class="cmd-sug-cmd">\{m.e.cmd}</code>
        <span class="cmd-sug-title">{m.e.title}</span>
      </div>
    {/each}
    <div class="cmd-sug-footer">↓↑ select · ↵ complete · Esc dismiss</div>
  </div>
{/if}
