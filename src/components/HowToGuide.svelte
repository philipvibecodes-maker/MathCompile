<script lang="ts">
  import { fade } from 'svelte/transition';
  import { appStore } from '../state/store.svelte';
  import AgentPromptButton from './AgentPromptButton.svelte';
  import {
    DEFAULT_HELP_IDS,
    TOPIC_BY_ID,
    type HelpTopic,
  } from '../help/topics';

  // `smart` shows when smart mode is on, `plain` when off; `how` is shared.
  const howText = (t: HelpTopic) =>
    t.how ?? (appStore.smartMode ? t.smart : t.plain) ?? '';

  // The list is the pin set (in pin order), minus anything hidden — the
  // catalog's `default` topics are just its initial value, so unpin and
  // hide behave identically on every row. Search lives in the centered
  // HelpSearch overlay (Ctrl+/); results pin into this list.
  let listed = $derived.by(() => {
    const hidden = new Set(appStore.hiddenHelp);
    return appStore.pinnedHelp
      .map((id) => TOPIC_BY_ID.get(id))
      .filter((t): t is HelpTopic => t !== undefined && !hidden.has(t.id));
  });

  // The restore button appears only when it would do something: a topic
  // is hidden, or a default has been unpinned away.
  let needsRestore = $derived(
    appStore.hiddenHelp.length > 0 ||
      !DEFAULT_HELP_IDS.every((id) => appStore.pinnedHelp.includes(id)),
  );
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
        <dt>No topics pinned</dt>
        <dd></dd>
        <dd class="howto-acts"></dd>
      </div>
    {/each}
  </dl>
  <div class="howto-foot">
    {#if needsRestore}
      <button
        class="howto-restore"
        onclick={() => appStore.restoreDefaultHelp()}
      >
        restore default help topics
      </button>
    {/if}
    <AgentPromptButton
      class="howto-agent"
      label="Copy agent prompt for custom functions"
    />
    <button
      class="howto-find"
      title="Search help topics (Ctrl+/)"
      onclick={() => appStore.openHelpSearch()}
      >Search all topics&hellip;</button
    >
  </div>
</details>
