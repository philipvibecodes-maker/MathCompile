<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { appStore } from '../state/store.svelte';
  import { fuzzyHits, fuzzyTextScore } from '../fuzzy';
  import { HELP_TOPICS, TOPIC_BY_ID, type HelpTopic } from '../help/topics';
  import { copyAgentPrompt } from '../agent-prompt';

  // Permanently mounted like the command palette: opening is a
  // visibility flip + focus(), not a mount — cold-open cost is gone.

  // The input binds `query` instantly; `activeQuery` trails it by a
  // debounce so a burst of keystrokes settles into one list update
  // instead of a flicker per character. Clearing applies immediately.
  let query = $state('');
  let activeQuery = $state('');
  $effect(() => {
    const q = query.trim();
    if (!q) {
      activeQuery = '';
      return;
    }
    const t = setTimeout(() => (activeQuery = q), 120);
    return () => clearTimeout(t);
  });

  let index = $state(0);
  let inputRef: HTMLInputElement | undefined = $state(undefined);
  let listRef: HTMLDivElement | undefined = $state(undefined);
  let rootRef: HTMLDivElement | undefined = $state(undefined);

  // While searching the list keeps the height it had when the search
  // started, so filtering only changes rows — the dialog never grows or
  // shrinks under the cursor. Released when the search clears.
  let frozenH = $state(0);
  $effect.pre(() => {
    if (query.trim() && frozenH === 0 && listRef)
      frozenH = listRef.offsetHeight;
  });
  $effect(() => {
    if (!activeQuery) frozenH = 0;
  });

  // `smart` shows when smart mode is on, `plain` when off; `how` is shared.
  const howText = (t: HelpTopic) =>
    t.how ?? (appStore.smartMode ? t.smart : t.plain) ?? '';

  // The default list — the same pin set the section shows, minus
  // hidden — so an empty query still offers topics.
  let listed = $derived.by(() => {
    const hidden = new Set(appStore.hiddenHelp);
    return appStore.pinnedHelp
      .map((id) => TOPIC_BY_ID.get(id))
      .filter((t): t is HelpTopic => t !== undefined && !hidden.has(t.id));
  });

  // Search looks at the whole catalog — hidden topics stay findable so
  // they can be restored from a result row. Per-field tiered scoring:
  // visible text (goal ×3, keystrokes ×2) outranks keywords (×1, and
  // keywords can't match on a loose subsequence alone — an invisible
  // scattered hit would surface a row with nothing to highlight).
  const scoreTopic = (q: string, t: HelpTopic): number => {
    const field = (s: string | undefined, loose = true) =>
      s === undefined ? -Infinity : (fuzzyTextScore(q, s, loose) ?? -Infinity);
    // Pinned topics win close calls — they're the answers the user
    // keeps at hand. 'root' finds Square root (a default pin) over
    // nth root, which contains the same substring slightly earlier
    // in its goal.
    return (
      Math.max(
        field(t.goal) * 3,
        Math.max(field(t.how), field(t.smart), field(t.plain)) * 2,
        field(t.keywords, false),
      ) + (appStore.pinnedHelp.includes(t.id) ? 15 : 0)
    );
  };

  const searchTopics = (q: string) => {
    if (!q) return [] as HelpTopic[];
    return HELP_TOPICS.filter((t) => scoreTopic(q, t) > -Infinity).sort(
      (a, b) => scoreTopic(q, b) - scoreTopic(q, a),
    );
  };

  // One keyed list for both modes — rows that persist across the search
  // boundary keep their DOM and don't re-fade.
  let results = $derived(searchTopics(activeQuery));
  let rows = $derived(activeQuery ? results : listed);
  let sel = $derived(Math.min(index, rows.length - 1));

  // Runs of matched characters (same scan fuzzyScore uses) wrapped as
  // segments so the row can mark up the parts the query hit.
  const markSegs = (text: string) => {
    const hits = fuzzyHits(activeQuery, text);
    if (!hits || hits.length === 0) return [{ t: text, hit: false }];
    const set = new Set(hits);
    const segs: { t: string; hit: boolean }[] = [];
    let cur = '';
    let curHit = false;
    for (let i = 0; i < text.length; i++) {
      const hit = set.has(i);
      if (i > 0 && hit !== curHit) {
        segs.push({ t: cur, hit: curHit });
        cur = '';
      }
      curHit = hit;
      cur += text[i];
    }
    segs.push({ t: cur, hit: curHit });
    return segs;
  };

  const close = () => appStore.closeHelpSearch();

  // On open: reset state and focus the input. The panel is already laid
  // out (always mounted), so focus() is cheap. The deferred re-assert
  // is guarded — a stale focus() after close would steal focus back.
  $effect(() => {
    if (!appStore.helpSearchOpen) return;
    query = '';
    index = 0;
    inputRef?.focus();
    const t = setTimeout(() => {
      if (appStore.helpSearchOpen) inputRef?.focus();
    }, 70);
    return () => clearTimeout(t);
  });

  // Escape must close even if focus has drifted to a row's button.
  onMount(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (appStore.helpSearchOpen && e.key === 'Escape') {
        e.preventDefault();
        // First Esc clears a typed query; a second Esc closes.
        if (query) {
          query = '';
          index = 0;
        } else close();
      }
    };
    window.addEventListener('keydown', onKeydown, true);
    return () => window.removeEventListener('keydown', onKeydown, true);
  });

  $effect(() => {
    const i = sel;
    if (!appStore.helpSearchOpen || i < 0) return;
    listRef
      ?.querySelector('.help-item.selected')
      ?.scrollIntoView({ block: 'nearest' });
  });

  // Keep focus inside while the search is open (same contract as the
  // palette). Re-check openness inside the timeout — a stale focus()
  // after close must not steal it back from a cell.
  const onFocusOut = (e: FocusEvent) => {
    if (
      appStore.helpSearchOpen &&
      rootRef &&
      !rootRef.contains(e.relatedTarget as Node)
    )
      setTimeout(() => {
        if (!appStore.helpSearchOpen) return;
        // A blur that leaves focus on <body> is a dismiss signal:
        // keyboard extensions unfocus the input on Escape while
        // suppressing the keydown itself, so the unfocus is the only
        // part the page sees. A focus move to a real element is not.
        if (document.activeElement === document.body) close();
        else inputRef?.focus();
      }, 0);
  };

  // The row's pin button toggles; Enter's pin fallback only ever adds —
  // activating an already-pinned topic must not unpin it. A pin lands
  // in the "How do I…" section — open it so the new pin is visible
  // once the dialog closes.
  const pin = (t: HelpTopic) => {
    if (!appStore.pinnedHelp.includes(t.id)) appStore.guideOpen = true;
    appStore.toggleHelpPin(t.id);
  };
  const ensurePinned = (t: HelpTopic) => {
    if (appStore.pinnedHelp.includes(t.id)) return;
    appStore.toggleHelpPin(t.id);
    appStore.guideOpen = true;
  };

  // Enter/click does the row's primary action: write the topic's input
  // into the active cell when it has one (family/UI topics have no
  // single input — they pin instead). Insertion closes the overlay;
  // pinning stays open so several results can be collected.
  const activate = (t: HelpTopic) => {
    if (t.agentPrompt) {
      void copyAgentPrompt();
      close();
      return;
    }
    if (t.insert && appStore.insertHelpLatex(t.insert)) {
      close();
      return;
    }
    ensurePinned(t);
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      index = Math.min(index + 1, rows.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      index = Math.max(index - 1, 0);
    } else if (e.key === 'Enter') {
      // Acts on the live query — the rendered list trails it by the
      // debounce, so a quick type+Enter must not act on stale rows.
      const live = query.trim() ? searchTopics(query.trim()) : listed;
      const t = live[Math.min(index, live.length - 1)];
      if (t) {
        e.preventDefault();
        if (e.shiftKey) ensurePinned(t);
        else activate(t);
      }
    }
    // Escape is handled by the window capture listener.
  };
</script>

{#snippet marked(text: string)}
  {#each markSegs(text) as s, i (i)}{#if s.hit}<mark>{s.t}</mark
      >{:else}{s.t}{/if}{/each}
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="help-backdrop"
  class:open={appStore.helpSearchOpen}
  aria-hidden={!appStore.helpSearchOpen}
  onclick={close}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    bind:this={rootRef}
    class="help-panel"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Search help"
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
      class="help-input"
      type="search"
      placeholder="Search help topics…"
      aria-label="Search help topics"
      bind:value={query}
      role="combobox"
      aria-expanded="true"
      aria-controls="help-list"
      aria-activedescendant={sel >= 0 ? `help-opt-${sel}` : undefined}
      oninput={() => (index = 0)}
      onkeydown={onKeydown}
    />
    <div
      class="help-list"
      id="help-list"
      role="listbox"
      bind:this={listRef}
      style:min-height={frozenH ? `${frozenH}px` : null}
    >
      {#each rows as t, i (t.id)}
        {@const pinned = appStore.pinnedHelp.includes(t.id)}
        {@const hidden = appStore.hiddenHelp.includes(t.id)}
        <!-- Focus stays in the input (aria-activedescendant), so the
             option rows intentionally take no tabindex. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus -->
        <div
          id={`help-opt-${i}`}
          class="help-item"
          class:selected={i === sel}
          class:hidden-topic={hidden}
          role="option"
          aria-selected={i === sel}
          onmousemove={() => (index = i)}
          onclick={() => activate(t)}
          in:fade={{ duration: 100 }}
        >
          <span class="help-goal"
            >{@render marked(t.goal)}{#if hidden}<span
                class="howto-hidden-tag">hidden</span
              >{/if}</span
          >
          <code class="help-how">{@render marked(howText(t))}</code>
          <span class="howto-acts">
            <button
              class="howto-pin"
              class:on={pinned}
              title={pinned ? 'Unpin from this list' : 'Pin to this list'}
              aria-pressed={pinned}
              onclick={(e) => {
                e.stopPropagation();
                pin(t);
              }}>{pinned ? 'unpin' : 'pin'}</button
            >
            {#if hidden}
              <button
                class="howto-hide"
                title="Show this tip again"
                aria-label="Show {t.goal} again"
                onclick={(e) => {
                  e.stopPropagation();
                  appStore.unhideHelpTopic(t.id);
                }}>↩</button
              >
            {:else}
              <button
                class="howto-hide"
                title="Hide this tip"
                aria-label="Hide {t.goal}"
                onclick={(e) => {
                  e.stopPropagation();
                  appStore.hideHelpTopic(t.id);
                }}>×</button
              >
            {/if}
          </span>
        </div>
      {:else}
        <div class="help-empty">No matching help topics</div>
      {/each}
    </div>
    <div class="help-foot">↑↓ navigate · Enter insert · ⇧Enter pin · Esc close</div>
  </div>
</div>
