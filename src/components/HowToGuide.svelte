<script lang="ts">
  import { fade } from 'svelte/transition';
  import { appStore } from '../state/store.svelte';
  import { fuzzyHits, fuzzyScore } from '../fuzzy';
  import { HELP_TOPICS, TOPIC_BY_ID, type HelpTopic } from '../help/topics';

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

  let searchEl: HTMLInputElement | undefined = $state(undefined);
  let detailsEl: HTMLDetailsElement | undefined = $state(undefined);
  let listEl: HTMLDListElement | undefined = $state(undefined);
  // While searching the list keeps the height it had when the search
  // started, so filtering only changes rows — the box (and everything
  // below it) never moves. Released when the search clears.
  let frozenH = $state(0);
  $effect.pre(() => {
    if (query.trim() && frozenH === 0 && listEl)
      frozenH = listEl.offsetHeight;
  });
  $effect(() => {
    if (!activeQuery) frozenH = 0;
  });

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
  // they can be restored from a result row. The displayed text (goal and
  // keystrokes) is part of the haystack so marks land on visible text.
  const searchTopics = (q: string) => {
    if (!q) return [] as HelpTopic[];
    const scored: { t: HelpTopic; s: number }[] = [];
    for (const t of HELP_TOPICS) {
      const s = fuzzyScore(
        q,
        `${t.goal} ${t.keywords ?? ''} ${t.how ?? ''} ${t.smart ?? ''} ${t.plain ?? ''}`,
      );
      if (s != null) scored.push({ t, s });
    }
    return scored.sort((a, b) => b.s - a.s).map((r) => r.t);
  };

  // The rendered list trails the input by the debounce; Enter pins
  // against the live query so a quick type+Enter isn't dropped.
  let results = $derived(searchTopics(activeQuery));

  // One keyed list for both modes — rows that persist across the search
  // boundary keep their DOM and don't re-fade.
  let rows = $derived(activeQuery ? results : listed);
  let searching = $derived(activeQuery !== '');

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
    if (e.key === 'Enter') {
      const top = searchTopics(query.trim())[0];
      if (top) {
        e.preventDefault();
        appStore.toggleHelpPin(top.id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) query = '';
      else searchEl?.blur();
    }
  };
</script>

{#snippet marked(text: string)}
  {#each markSegs(text) as s, i (i)}{#if s.hit}<mark>{s.t}</mark
      >{:else}{s.t}{/if}{/each}
{/snippet}

{#snippet topicRow(t: HelpTopic)}
  {@const pinned = appStore.pinnedHelp.includes(t.id)}
  {@const hidden = appStore.hiddenHelp.includes(t.id)}
  <div class="howto-item" class:hidden-topic={hidden}>
    <dt in:fade={{ duration: 100 }}>
      {@render marked(t.goal)}{#if hidden}<span class="howto-hidden-tag"
          >hidden</span
        >{/if}
    </dt>
    <dd in:fade={{ duration: 100 }}><code>{@render marked(howText(t))}</code></dd>
    <dd class="howto-acts" in:fade={{ duration: 100 }}>
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
  <dl
    class="howto-list"
    bind:this={listEl}
    style:min-height={frozenH ? `${frozenH}px` : null}
  >
    {#each rows as t (t.id)}
      {@render topicRow(t)}
    {:else}
      <div class="howto-item howto-empty">
        <dt>{searching ? 'No matching help topics' : 'All topics hidden'}</dt>
        <dd></dd>
        <dd class="howto-acts"></dd>
      </div>
    {/each}
  </dl>
  <div class="howto-foot">
    {#if searching}
      <span class="howto-hint">Enter pins the top result · Esc clears</span>
    {:else if appStore.hiddenHelp.length > 0}
      <button
        class="howto-restore"
        onclick={() => appStore.restoreHiddenHelp()}
      >
        {appStore.hiddenHelp.length} hidden — restore
      </button>
    {/if}
  </div>
</details>
