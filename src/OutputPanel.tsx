import { COMMENT_PREFIX, TARGETS, type TargetId } from './targets';

interface OutputPanelProps {
  exprs: { latex: string }[];
  target: TargetId;
  onTargetChange: (t: TargetId) => void;
  dIsDerivative: boolean;
  onDIsDerivativeChange: (v: boolean) => void;
}

export default function OutputPanel({
  exprs,
  target,
  onTargetChange,
  dIsDerivative,
  onDIsDerivativeChange,
}: OutputPanelProps) {
  const c = COMMENT_PREFIX[target];
  const targetLabel = TARGETS.find((t) => t.id === target)?.label ?? target;
  const nonEmpty = exprs.filter((e) => e.latex.trim() !== '');

  const captured =
    nonEmpty.length === 0
      ? `${c}   (no expressions yet)`
      : nonEmpty.map((e, i) => `${c}   ${i + 1}: ${e.latex}`).join('\n');

  const stub = `${c} ── IR ────────────────────────────
${c} LaTeX -> AST -> IR lowering not implemented yet.
${c}
${c} ── Codegen (${targetLabel}) ─────────────
${c} IR -> ${targetLabel} codegen not implemented yet.
${c}
${c} ── Options ─────────────────────────────
${c}   d/dx means derivative: ${dIsDerivative ? 'true' : 'false'}
${c}
${c} ── Captured input (LaTeX) ──────────────
${captured}`;

  return (
    <aside className="output-panel">
      <div className="output-header">
        <h2>Output</h2>
        <label className="option-checkbox" title="Interpret a plain d/dx as the derivative operator">
          <input
            type="checkbox"
            checked={dIsDerivative}
            onChange={(e) => onDIsDerivativeChange(e.target.checked)}
          />
          d/dx means derivative
        </label>
        <label className="target-select">
          Target
          <select
            value={target}
            onChange={(e) => onTargetChange(e.target.value as TargetId)}
          >
            {TARGETS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <pre className="output-body">{stub}</pre>
    </aside>
  );
}
