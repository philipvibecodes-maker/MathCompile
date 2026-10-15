<script lang="ts">
  import { fade } from 'svelte/transition';
  import { appStore } from '../state/store.svelte';
  import { HELP_TOPICS, TOPIC_BY_ID, type HelpTopic } from '../help/topics';

  // `smart` shows when smart mode is on, `plain` when off; `how` is shared.
  const howText = (t: HelpTopic) =>
    t.how ?? (appStore.smartMode ? t.smart : t.plain) ?? '';

  // Pinned topics first (in pin order — non-featured topics only appear
  // while pinned), then the featured defaults, minus anything hidden.
  // Search lives in the centered HelpSearch overlay (Ctrl+/); results
  // pin into this list.
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
</script>

{#snippet topicRow(t: HelpTopic)}
  {@const pinned = appStore.pinnedHelp.includes(t.id)}
  <div class="howto-item">
    <dt in:fade={{ duration: 100 }}>{t.goal}</dt>
    <dd in:fade={{ duration: 100 }}><code>{howText(t)}</code></dd>
    <dd class="howto-acts" in:fade={{ duration: 100 }}>
      <button
        class="howto-pin"
        class:on={pinned}
        title={pinned ? 'Unpin from this list' : 'Pin to this list'}
        aria-pressed={pinned}
        onclick={() => appStore.toggleHelpPin(t.id)}
        >{pinned ? 'unpin' : 'pin'}</button
      >
      <button
        class="howto-hide"
        title="Hide this tip"
        aria-label="Hide {t.goal}"
        onclick={() => appStore.hideHelpTopic(t.id)}>×</button
      >
    </dd>
  </div>
{/snippet}

<details class="howto" bind:open={appStore.guideOpen}>
  <summary>How do I&hellip;</summary>
  <dl class="howto-list">
    {#each listed as t (t.id)}
      {@render topicRow(t)}
    {:else}
      <div class="howto-item howto-empty">
        <dt>All topics hidden</dt>
        <dd></dd>
        <dd class="howto-acts"></dd>
      </div>
    {/each}
  </dl>
  <div class="howto-foot">
    {#if appStore.hiddenHelp.length > 0}
      <button
        class="howto-restore"
        onclick={() => appStore.restoreHiddenHelp()}
      >
        {appStore.hiddenHelp.length} hidden — restore
      </button>
    {/if}
    <button
      class="howto-find"
      title="Search help topics (Ctrl+/)"
      onclick={() => appStore.openHelpSearch()}
      >Search all topics&hellip;</button
    >
  </div>
</details>
