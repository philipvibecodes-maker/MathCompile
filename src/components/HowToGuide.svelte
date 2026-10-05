<script lang="ts">
  import { appStore } from '../state/store.svelte';

  const userGuidePdf = `${import.meta.env.BASE_URL}user-guide.pdf`;

  // `smart` shows when smart mode is on, `plain` when off; `how` is shared.
  const entries: { goal: string; how?: string; smart?: string; plain?: string }[] = [
    { goal: 'Fraction', how: 'type 1/2 or \\frac ⏎' },
    { goal: 'Subscript / superscript', smart: 'x2 or _ or ^', plain: '_ or ^' },
    { goal: 'Square root', smart: 'sqrt or \\nthroot for ∛', plain: '\\sqrt ⏎ or \\nthroot for ∛' },
    { goal: 'Sum / product', smart: 'sum or prod — then _ and ^', plain: '\\sum or \\prod ⏎ — then _ and ^' },
    { goal: 'Definite integral', smart: 'int — then _ and ^', plain: '\\int ⏎ — then _ and ^' },
    { goal: 'Indefinite integral', smart: 'iint or antid', plain: '\\iint ⏎ or \\antid ⏎' },
    { goal: 'Limit', how: 'lim — then _ for x\\to0' },
    { goal: 'Binomial coefficient', how: '\\binom ⏎' },
    { goal: 'Matrix', how: '\\pmatrix ⏎ — Enter adds a row or Shift+Space a column' },
    { goal: 'Greek letters', smart: 'pi or theta or infty', plain: '\\alpha … \\omega ⏎' },
    { goal: 'New line', how: 'Enter or Shift+Enter for a new cell' },
    { goal: 'Autocomplete', how: 'type \\… or a word — Ctrl+Space for the symbol picker' },
    { goal: 'Text', how: '\\text ⏎' },
  ];
</script>

<details class="howto" bind:open={appStore.guideOpen}>
  <summary>How do I&hellip;</summary>
  <dl class="howto-list">
    {#each entries as e (e.goal)}
      <div class="howto-item">
        <dt>{e.goal}</dt>
        <dd><code>{e.how ?? (appStore.smartMode ? e.smart : e.plain)}</code></dd>
      </div>
    {/each}
  </dl>
  <a class="howto-pdf" href={userGuidePdf} target="_blank" rel="noreferrer">
    User guide (PDF)
  </a>
</details>
