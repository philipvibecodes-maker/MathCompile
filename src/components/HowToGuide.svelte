<script lang="ts">
  import { REFERENCE, type RefEntry } from '../reference-data';
  import { fuzzyScore } from '../fuzzy';
  import { mountStaticMath } from '../editor/static-math';
  import { appStore } from '../state/store.svelte';

  // Searchable input reference: every entry is a goal + keystroke recipe
  // (+ smart-mode shortcut and a rendered preview where one helps). The
  // Traps section names the failure modes that bite — blocks swallowing
  // keys, dead commands, corrupted pairs.
  let query = $state('');

  let groups = $derived.by(() => {
    const q = query.trim();
    const scored: { e: RefEntry; score: number }[] = [];
    for (const e of REFERENCE) {
      if (!q) {
        scored.push({ e, score: 0 });
        continue;
      }
      const s = fuzzyScore(q, `${e.goal} ${e.keys} ${e.kw ?? ''}`);
      if (s == null) continue;
      // Entries in a group the query also matches ('trap' -> Traps)
      // outrank incidental cross-group hits.
      scored.push({ e, score: s + (fuzzyScore(q, e.group) ? 100 : 0) });
    }
    const out: {
      name: string;
      best: number;
      items: { e: RefEntry; score: number }[];
    }[] = [];
    for (const { e, score } of scored) {
      let g = out.find((x) => x.name === e.group);
      if (!g) out.push((g = { name: e.group, best: score, items: [] }));
      g.best = Math.max(g.best, score);
      g.items.push({ e, score });
    }
    if (q) {
      for (const g of out) g.items.sort((a, b) => b.score - a.score);
      out.sort((a, b) => b.best - a.best);
    }
    return out;
  });

  const previewMath = (node: HTMLElement, latex: string) => {
    const h = mountStaticMath(node);
    h.set(latex);
    return { update: (l: string) => h.set(l) };
  };
</script>

<details class="howto" bind:open={appStore.guideOpen}>
  <summary>How do I&hellip;</summary>
  {#if appStore.guideOpen}
    <input
      class="howto-search"
      type="search"
      placeholder="Search — e.g. piecewise, bound, trap, norm"
      bind:value={query}
    />
    <dl class="howto-list">
      {#each groups as g (g.name)}
        <dt class="howto-group">{g.name}</dt>
        {#each g.items as item (item.e.goal)}
          <div class="howto-item">
            <dt>{item.e.goal}</dt>
            <dd>
              <code
                >{appStore.smartMode && item.e.smart
                  ? item.e.smart
                  : item.e.keys}</code
              >
              {#if item.e.preview}
                <span
                  class="howto-preview"
                  use:previewMath={item.e.preview}
                ></span>
              {/if}
            </dd>
          </div>
        {/each}
      {/each}
      {#if groups.length === 0}
        <div class="howto-empty">No entries match “{query}”.</div>
      {/if}
    </dl>
  {/if}
</details>
