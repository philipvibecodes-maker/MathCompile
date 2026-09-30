<script lang="ts">
  import { COMMENT_PREFIX, TARGETS } from '../targets';
  import type { TargetId } from '../targets';
  import { appStore } from '../appState.svelte.ts';

  // Pure function of app state: expressions, target, and the option flags.
  let stub = $derived.by(() => {
    const c = COMMENT_PREFIX[appStore.target];
    const targetLabel =
      TARGETS.find((t) => t.id === appStore.target)?.label ?? appStore.target;
    const nonEmpty = appStore.cells.filter((e) => e.latex.trim() !== '');
    const captured =
      nonEmpty.length === 0
        ? `${c}   (no expressions yet)`
        : nonEmpty.map((e, i) => `${c}   ${i + 1}: ${e.latex}`).join('\n');
    return `${c} ── IR ────────────────────────────
${c} LaTeX -> AST -> IR lowering not implemented yet.
${c}
${c} ── Codegen (${targetLabel}) ─────────────
${c} IR -> ${targetLabel} codegen not implemented yet.
${c}
${c} ── Options ─────────────────────────────
${c}   d/dx means derivative: ${appStore.dIsDerivative ? 'true' : 'false'}
${c}
${c} ── Captured input (LaTeX) ──────────────
${captured}`;
  });
</script>

<aside class="output-panel">
  <div class="output-header">
    <h2>Output</h2>
    <div class="output-options">
      <div class="option">
        <label
          class="option-checkbox"
          title="Interpret a plain d/dx as the derivative operator"
        >
          <input
            type="checkbox"
            checked={appStore.dIsDerivative}
            onchange={(e) =>
              (appStore.dIsDerivative = e.currentTarget.checked)}
          />
          d/dx means derivative
        </label>
      </div>
      <div class="option">
        <label
          class="option-checkbox"
          title="Auto-convert typed text like 'sqrt' or 'pi' into math"
        >
          <input
            type="checkbox"
            checked={appStore.smartMode}
            onchange={(e) => (appStore.smartMode = e.currentTarget.checked)}
          />
          Smart mode
        </label>
        <span class="option-shortcut">alt+s</span>
      </div>
    </div>
    <label class="target-select">
      Target
      <select
        value={appStore.target}
        onchange={(e) =>
          (appStore.target = e.currentTarget.value as TargetId)}
      >
        {#each TARGETS as t (t.id)}
          <option value={t.id}>{t.label}</option>
        {/each}
      </select>
    </label>
  </div>
  <pre class="output-body">{stub}</pre>
</aside>
