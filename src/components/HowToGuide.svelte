<script lang="ts">
  import { appStore } from '../state/store.svelte';
  import { fuzzyScore } from '../fuzzy';
  import { HELP_TOPICS, TOPIC_BY_ID, type HelpTopic } from '../help/topics';

  let query = $state('');
  let searchEl: HTMLInputElement | undefined = $state(undefined);
  let detailsEl: HTMLDetailsElement | undefined = $state(undefined);

  // `smart` shows when smart mode is on, `plain` when off; `how` is shared.
  const howText = (t: HelpTopic) =>
    t.how ?? (appStore.smartMode ? t.smart : t.plain) ?? '';

  // The list when nothing is typed: pinned topics first (in pin order,
  // non-featured topics only appear while pinned), then the featured
  // defaults — minus anything the user hid.
  let listed = $derived.by(() => {
    const hidden = new Set(appStore.hiddenHelp);
    const pinned = appStore.pinnedHelp
      .map((id) => TOPIC_BY_ID.get(id))
      .filter((t): t is HelpTopic => t !== undefined && !hidden.has(t.id));
    const pinnedIds = new Set(appStore.pinnedHelp);
    const featured = HELP_TOPICS.filter(
      (t) => t.featured && !hidden.has(t.id) && !pinnedIds.has(t.id),
    );
    return [...pinned, ...featured];
  });

  // Search looks at the whole catalog — hidden topics stay findable so
  // they can be restored from a result row.
  let results = $derived.by(() => {
    const q = query.trim();
    if (!q) return [];
    const scored: { t: HelpTopic; s: number }[] = [];
    for (const t of HELP_TOPICS) {
      const s = fuzzyScore(q, `${t.goal} ${t.keywords ?? ''}`);
      if (s != null) scored.push({ t, s });
    }
    return scored.sort((a, b) => b.s - a.s).map((r) => r.t);
  });

  // Every "search help" entry point (header ? button, Ctrl+/, palette
  // command) bumps helpSearchFocus; focus the input on each bump. The
  // deferred focus re-checks paletteOpen — a stale focus after a palette
  // close would steal it back from a cell.
  $effect(() => {
    if (appStore.helpSearchFocus === 0) return;
    const t = setTimeout(() => {
      if (appStore.paletteOpen) return;
      detailsEl?.scrollIntoView({ block: 'nearest' });
      searchEl?.focus();
    }, 0);
    return () => clearTimeout(t);
  });

  const onSearchKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      appStore.toggleHelpPin(results[0].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) query = '';
      else searchEl?.blur();
    }
  };
</script>

{#snippet topicRow(t: HelpTopic)}
  {@const pinned = appStore.pinnedHelp.includes(t.id)}
  {@const hidden = appStore.hiddenHelp.includes(t.id)}
  <div class="howto-item" class:hidden-topic={hidden}>
    <dt>
      {t.goal}{#if hidden}<span class="howto-hidden-tag">hidden</span>{/if}
    </dt>
    <dd><code>{howText(t)}</code></dd>
    <dd class="howto-acts">
      <button
        class="howto-pin"
        class:on={pinned}
        title={pinned ? 'Unpin from this list' : 'Pin to this list'}
        aria-pressed={pinned}
        onclick={() => appStore.toggleHelpPin(t.id)}
        >{pinned ? 'unpin' : 'pin'}</button
      >
      {#if hidden}
        <button
          class="howto-hide"
          title="Show this tip again"
          aria-label="Show {t.goal} again"
          onclick={() => appStore.unhideHelpTopic(t.id)}>↩</button
        >
      {:else}
        <button
          class="howto-hide"
          title="Hide this tip"
          aria-label="Hide {t.goal}"
          onclick={() => appStore.hideHelpTopic(t.id)}>×</button
        >
      {/if}
    </dd>
  </div>
{/snippet}

<details class="howto" bind:open={appStore.guideOpen} bind:this={detailsEl}>
  <summary>How do I&hellip;</summary>
  <input
    bind:this={searchEl}
    class="howto-search"
    type="search"
    placeholder="Search help…"
    aria-label="Search help topics"
    bind:value={query}
    onkeydown={onSearchKeydown}
  />
  {#if query.trim()}
    <dl class="howto-list">
      {#each results as t (t.id)}
        {@render topicRow(t)}
      {:else}
        <div class="howto-item howto-empty">
          <dt>No matching help topics</dt>
          <dd></dd>
          <dd class="howto-acts"></dd>
        </div>
      {/each}
    </dl>
    <div class="howto-hint">Enter pins the top result · Esc clears</div>
  {:else}
    <dl class="howto-list">
      {#each listed as t (t.id)}
        {@render topicRow(t)}
      {/each}
    </dl>
    {#if appStore.hiddenHelp.length > 0}
      <button class="howto-restore" onclick={() => appStore.restoreHiddenHelp()}>
        {appStore.hiddenHelp.length} hidden — restore
      </button>
    {/if}
  {/if}
</details>
