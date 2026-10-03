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
    const out: { name: string; items: RefEntry[] }[] = [];
    for (const e of REFERENCE) {
      if (q && fuzzyScore(q, `${e.goal} ${e.keys} ${e.kw ?? ''}`) == null)
        continue;
      let g = out.find((x) => x.name === e.group);
      if (!g) out.push((g = { name: e.group, items: [] }));
      g.items.push(e);
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
        {#each g.items as e (e.goal)}
          <div class="howto-item">
            <dt>{e.goal}</dt>
            <dd>
              <code
                >{appStore.smartMode && e.smart ? e.smart : e.keys}</code
              >
              {#if e.preview}
                <span class="howto-preview" use:previewMath={e.preview}></span>
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
