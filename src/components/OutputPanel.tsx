import { createMemo, For } from 'solid-js';
import { COMMENT_PREFIX, TARGETS, type TargetId } from '../targets';
import { appStore } from '../store';

// Pure render of app state: expressions, target, and the option toggles.
// dIsDerivative is a semantic (compiler) option — it changes what the IR
// lowering will do with a d/dx fraction, never the cells' content.
export default function OutputPanel() {
  const body = createMemo(() => {
    const c = COMMENT_PREFIX[appStore.target()];
    const targetLabel =
      TARGETS.find((t) => t.id === appStore.target())?.label ??
      appStore.target();
    const nonEmpty = appStore.exprs.filter((e) => e.latex.trim() !== '');
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
${c}   d/dx means derivative: ${appStore.dIsDerivative() ? 'true' : 'false'}
${c}
${c} ── Captured input (LaTeX) ──────────────
${captured}`;
  });

  return (
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
                checked={appStore.dIsDerivative()}
                onChange={(e) =>
                  appStore.setDIsDerivative(e.currentTarget.checked)
                }
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
                checked={appStore.smartMode()}
                onChange={(e) =>
                  appStore.setSmartMode(e.currentTarget.checked)
                }
              />
              Smart mode
            </label>
            <span class="option-shortcut">alt+s</span>
          </div>
        </div>
        <label class="target-select">
          Target
          <select
            value={appStore.target()}
            onChange={(e) =>
              appStore.setTarget(e.currentTarget.value as TargetId)
            }
          >
            <For each={TARGETS}>
              {(t) => <option value={t.id}>{t.label}</option>}
            </For>
          </select>
        </label>
      </div>
      <pre class="output-body">{body()}</pre>
    </aside>
  );
}
