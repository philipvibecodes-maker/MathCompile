import { useState } from 'react';
import MathFieldInput from './MathFieldInput';
import OutputPanel from './OutputPanel';
import type { TargetId } from './targets';

interface Expr {
  id: number;
  latex: string;
}

let nextId = 1;
const createExpr = (): Expr => ({ id: nextId++, latex: '' });

export default function App() {
  const [exprs, setExprs] = useState<Expr[]>([createExpr()]);
  const [target, setTarget] = useState<TargetId>('python');
  const [dIsDerivative, setDIsDerivative] = useState(true);
  const [focus, setFocus] = useState<{
    id: number;
    edge?: 'start' | 'end';
  } | null>(null);

  const updateExpr = (id: number, latex: string) =>
    setExprs((es) => es.map((e) => (e.id === id ? { ...e, latex } : e)));

  const addExpr = (afterId?: number) => {
    const e = createExpr();
    setExprs((es) => {
      const idx = afterId == null ? es.length : es.findIndex((x) => x.id === afterId) + 1;
      const copy = [...es];
      copy.splice(Math.max(idx, 0), 0, e);
      return copy;
    });
    setFocus({ id: e.id });
  };

  const removeExpr = (id: number) =>
    setExprs((es) =>
      es.length > 1
        ? es.filter((e) => e.id !== id)
        : es.map((e) => (e.id === id ? { ...e, latex: '' } : e)),
    );

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo">
          Math<em>Compile</em>
        </span>
      </header>
      <div className="main">
        <section className="expr-panel">
          <ol className="expr-list">
            {exprs.map((e, i) => (
              <li className="expr-row" key={e.id}>
                <span className="expr-index">{i + 1}</span>
                <MathFieldInput
                  value={e.latex}
                  dIsDerivative={dIsDerivative}
                  autoFocus={focus?.id === e.id}
                  focusEdge={focus?.id === e.id ? focus.edge : undefined}
                  onFocus={() => setFocus({ id: e.id })}
                  onChange={(latex) => updateExpr(e.id, latex)}
                  onNewCell={() => addExpr(e.id)}
                  onMoveOut={(dir) => {
                    const next = i + (dir === 'down' ? 1 : -1);
                    if (next < 0) return;
                    if (next >= exprs.length) addExpr();
                    else
                      setFocus({
                        id: exprs[next].id,
                        edge: dir === 'down' ? 'start' : 'end',
                      });
                  }}
                />
                <button
                  className="expr-delete"
                  title="Delete expression"
                  aria-label="Delete expression"
                  onClick={() => removeExpr(e.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          <button className="add-expr" onClick={() => addExpr()}>
            + Add expression
          </button>
        </section>
        <OutputPanel
          exprs={exprs}
          target={target}
          onTargetChange={setTarget}
          dIsDerivative={dIsDerivative}
          onDIsDerivativeChange={setDIsDerivative}
        />
      </div>
    </div>
  );
}
