import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyScore } from './fuzzy';

export interface Command {
  id: string;
  title: string;
  hint?: string;
  current?: boolean;
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}

// The palette stays mounted while closed: `open` flips the backdrop's
// visibility, so opening is a style flip + paint instead of a mount plus the
// overlay subtree's first style/layout (the cold-open cost). The hidden
// subtree keeps receiving renders so no DOM mutation is owed at open time.
function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Queued focus work (the focusout trap's refocus) must not fire after close.
  const openRef = useRef(open);

  const matches = useMemo(() => {
    const scored: { c: Command; s: number }[] = [];
    for (const c of commands) {
      const s = fuzzyScore(query, `${c.title} ${c.keywords ?? ''}`);
      if (s != null) scored.push({ c, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored;
  }, [commands, query]);

  const sel = Math.min(index, matches.length - 1);

  // Every close path goes through close() so state resets in the closing
  // event, not in an effect — reopening then needs no state update (and none
  // of the DOM mutation one would cause) on the keydown-to-paint path.
  const close = useCallback(() => {
    setQuery('');
    setIndex(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    openRef.current = open;
    if (!open) return;
    // A previous session may have left the list scrolled; scrollTop is a
    // write, so clearing it doesn't force layout before the open paints.
    listRef.current?.scrollTo({ top: 0 });
    // Defer focus past first paint: focusing the input blurs the math-field,
    // and MathLive's blur work plus the native focus() layout would otherwise
    // run before the palette's first paint and delay it.
    const t0 = setTimeout(() => inputRef.current?.focus(), 0);
    // The deferred MathLive refocus lands up to ~60ms after the field was
    // focused; re-assert input focus just past that window in case a steal
    // slipped past the focusout trap below.
    const t1 = setTimeout(() => inputRef.current?.focus(), 70);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [open]);

  // Escape must close even if focus has drifted out of the input. Attached
  // only while open so a hidden palette never swallows keys.
  useEffect(() => {
    if (!open) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      const input = inputRef.current;
      if (input && document.activeElement !== input) {
        // Focus hasn't landed yet (it's deferred past first paint); a key
        // arriving now would otherwise be typed into the still-focused
        // math-field. Take focus and swallow the event — replaying the key
        // into the query if it was a printable character.
        input.focus();
        e.preventDefault();
        e.stopPropagation();
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          setQuery((q) => q + e.key);
          setIndex(0);
        }
      }
    };
    window.addEventListener('keydown', onKeydown, true);
    return () => window.removeEventListener('keydown', onKeydown, true);
  }, [open, close]);

  const wasOpen = useRef(false);
  useEffect(() => {
    // Skip the run where the palette just opened — scrollIntoView forces a
    // synchronous document layout, which would sit between the visibility
    // flip and the palette's first paint.
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!open || justOpened) return;
    listRef.current
      ?.querySelector('.cmd-item.selected')
      ?.scrollIntoView({ block: 'nearest' });
  }, [sel, open]);

  // MathLive re-asserts focus on a ~60ms timer after a field is focused,
  // which can steal focus from the palette when it was opened right after
  // editing a cell — so keep focus inside while the palette is open.
  const onFocusOut = (e: React.FocusEvent) => {
    if (!open) return;
    const root = rootRef.current;
    if (root && !root.contains(e.relatedTarget as Node))
      setTimeout(() => {
        if (openRef.current) inputRef.current?.focus();
      }, 0);
  };

  const pick = (c: Command) => {
    c.run();
    close();
  };

  const onKeydown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = matches[sel];
      if (m) pick(m.c);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  return (
    <div
      className={open ? 'palette-backdrop open' : 'palette-backdrop'}
      inert={!open}
      onClick={close}
    >
      <div
        ref={rootRef}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onBlur={onFocusOut}
      >
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Type a command…"
          value={query}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={sel >= 0 ? `palette-opt-${sel}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={onKeydown}
        />
        <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {matches.map((m, i) => (
            <li
              key={m.c.id}
              id={`palette-opt-${i}`}
              role="option"
              aria-selected={i === sel}
              className={i === sel ? 'cmd-item selected' : 'cmd-item'}
              onMouseEnter={() => setIndex(i)}
              onClick={() => pick(m.c)}
            >
              <span className="cmd-title">{m.c.title}</span>
              {m.c.current && <span className="cmd-current">✓</span>}
              {m.c.hint && <kbd className="cmd-hint">{m.c.hint}</kbd>}
            </li>
          ))}
          {matches.length === 0 && (
            <li className="cmd-empty">No matching commands</li>
          )}
        </ul>
        <div className="palette-footer">
          ↑↓ navigate · Enter run · Esc close
        </div>
      </div>
    </div>
  );
}

export default memo(CommandPalette);
