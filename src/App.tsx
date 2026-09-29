import { useEffect, useRef, useState } from 'react';
import MathFieldInput from './MathFieldInput';
import OutputPanel from './OutputPanel';
import CommandPalette from './CommandPalette';
import type { Command } from './CommandPalette';
import { TARGETS, type TargetId } from './targets';

interface Expr {
  id: number;
  latex: string;
}

let nextId = 1;
const createExpr = (latex = ''): Expr => ({ id: nextId++, latex });

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

export default function App() {
  const [initialExpr] = useState(createExpr);
  const [exprs, setExprs] = useState<Expr[]>([initialExpr]);
  const [target, setTarget] = useState<TargetId>('python');
  const [dIsDerivative, setDIsDerivative] = useState(true);
  const [smartMode, setSmartMode] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focus, setFocus] = useState<{
    id: number;
    edge?: 'start' | 'end';
    nonce?: number;
  } | null>({ id: initialExpr.id });

  // Capture phase so Ctrl+K is seen even inside a <math-field>, which may
  // swallow keydown events at the target.
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyK') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (paletteOpen) return;
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === 'KeyS') {
        e.preventDefault();
        setSmartMode((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeydown, true);
    return () => window.removeEventListener('keydown', onKeydown, true);
  }, [paletteOpen]);

  // Refocus the active cell whenever the palette closes. Focus updates
  // queued by the command that just ran are already applied here.
  const wasPaletteOpen = useRef(false);
  useEffect(() => {
    if (wasPaletteOpen.current && !paletteOpen)
      setFocus((f) => (f ? { ...f, nonce: (f.nonce ?? 0) + 1 } : f));
    wasPaletteOpen.current = paletteOpen;
  }, [paletteOpen]);

  const updateExpr = (id: number, latex: string) =>
    setExprs((es) => es.map((e) => (e.id === id ? { ...e, latex } : e)));

  const addExpr = (afterId?: number, latex = '') => {
    const e = createExpr(latex);
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

  const focusId = focus?.id;
  const commands: Command[] = [
    {
      id: 'insert-below',
      title: 'Insert expression below',
      keywords: 'new add cell row',
      hint: 'Shift+Enter',
      run: () => addExpr(focusId),
    },
    {
      id: 'duplicate',
      title: 'Duplicate current expression',
      keywords: 'copy clone cell',
      run: () => {
        const cur = exprs.find((e) => e.id === focusId);
        if (cur) addExpr(cur.id, cur.latex);
      },
    },
    {
      id: 'delete-current',
      title: 'Delete current expression',
      keywords: 'remove cell',
      run: () => {
        const idx = exprs.findIndex((e) => e.id === focusId);
        if (idx < 0) return;
        const next = exprs[idx + 1] ?? exprs[idx - 1];
        removeExpr(exprs[idx].id);
        if (next && next.id !== exprs[idx].id) setFocus({ id: next.id });
      },
    },
    {
      id: 'clear-all',
      title: 'Clear all expressions',
      keywords: 'reset delete remove',
      run: () => {
        const e = createExpr();
        setExprs([e]);
        setFocus({ id: e.id });
      },
    },
    {
      id: 'toggle-derivative',
      title: 'd/dx means derivative',
      keywords: 'toggle option fraction',
      current: dIsDerivative,
      run: () => setDIsDerivative((v) => !v),
    },
    {
      id: 'toggle-smart',
      title: 'Smart mode',
      keywords: 'toggle option autocomplete',
      hint: 'Alt+S',
      current: smartMode,
      run: () => setSmartMode((v) => !v),
    },
    ...TARGETS.map((t) => ({
      id: `target-${t.id}`,
      title: `Target: ${t.label}`,
      keywords: 'set compile codegen language output',
      current: t.id === target,
      run: () => setTarget(t.id),
    })),
    ...exprs.map((e, i) => ({
      id: `goto-${e.id}`,
      title: `Go to expression ${i + 1}: ${e.latex.trim() || '(empty)'}`,
      keywords: 'focus jump cell',
      run: () => setFocus({ id: e.id, edge: 'end' as const }),
    })),
  ];

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo">
          Math<em>Compile</em>
        </span>
        <button className="palette-button" onClick={() => setPaletteOpen(true)}>
          Commands
          <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
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
                  smartMode={smartMode}
                  autoFocus={focus?.id === e.id}
                  focusEdge={focus?.id === e.id ? focus.edge : undefined}
                  focusNonce={focus?.id === e.id ? focus.nonce : undefined}
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
          smartMode={smartMode}
          onSmartModeChange={setSmartMode}
        />
      </div>
      {paletteOpen && (
        <CommandPalette
          commands={commands}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}
