import { createEffect, createMemo, createSignal, onCleanup, onMount, Index } from 'solid-js';
import { fuzzyScore } from '../fuzzy';
import type { Command } from '../commands';
import { appStore } from '../store';

// Permanently mounted: opening is a visibility flip + focus(), not a mount
// — cold-open cost is gone by design (challenges.md §8).
export default function CommandPalette(props: { commands: Command[] }) {
  const [query, setQuery] = createSignal('');
  const [index, setIndex] = createSignal(0);
  let inputRef!: HTMLInputElement;
  let listRef!: HTMLUListElement;
  let rootRef!: HTMLDivElement;

  const matches = createMemo(() => {
    const scored: { c: Command; s: number }[] = [];
    for (const c of props.commands) {
      const s = fuzzyScore(query(), `${c.title} ${c.keywords ?? ''}`);
      if (s != null) scored.push({ c, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored;
  });

  const sel = () => Math.min(index(), matches().length - 1);
  const close = () => appStore.setPaletteOpen(false);

  // On open: reset state and focus the input. MathQuill keeps no deferred
  // refocus timer (that ~60ms steal was a MathLive quirk), so a plain
  // focus() is all we need.
  createEffect(() => {
    if (!appStore.paletteOpen()) return;
    setQuery('');
    setIndex(0);
    inputRef.focus();
  });

  // Escape must close even if focus has drifted out of the input.
  onMount(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (appStore.paletteOpen() && e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeydown, true);
    onCleanup(() => window.removeEventListener('keydown', onKeydown, true));
  });

  createEffect(() => {
    const i = sel();
    if (!appStore.paletteOpen() || i < 0) return;
    listRef
      .querySelector('.cmd-item.selected')
      ?.scrollIntoView({ block: 'nearest' });
  });

  // Keyboard extensions (e.g. Vimium) unfocus the input on Escape while
  // suppressing the keydown itself — the unfocus is the only part of the
  // keypress the page sees, so a blur that leaves focus on <body> is a
  // dismiss signal. A focus move to a real element is not.
  const onFocusOut = (e: FocusEvent) => {
    if (
      appStore.paletteOpen() &&
      rootRef &&
      !rootRef.contains(e.relatedTarget as Node)
    )
      setTimeout(() => {
        if (!appStore.paletteOpen()) return;
        if (document.activeElement === document.body) close();
        else inputRef.focus();
      }, 0);
  };

  const pick = (c: Command) => {
    c.run();
    close();
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, matches().length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = matches()[sel()];
      if (m) pick(m.c);
    }
    // Escape is handled by the window capture listener.
  };

  return (
    <div
      class="palette-backdrop"
      classList={{ open: appStore.paletteOpen() }}
      onClick={close}
    >
      <div
        ref={(el) => (rootRef = el)}
        class="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          // Inner clicks keep focus in the input; the input itself keeps
          // default behavior so the caret can be placed by mouse.
          if (e.target !== inputRef) e.preventDefault();
        }}
        onFocusOut={onFocusOut}
      >
        <input
          ref={(el) => (inputRef = el)}
          class="palette-input"
          placeholder="Type a command…"
          value={query()}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={sel() >= 0 ? `palette-opt-${sel()}` : undefined}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            setIndex(0);
          }}
          onKeyDown={onKeydown}
        />
        <ul class="palette-list" id="palette-list" role="listbox" ref={(el) => (listRef = el)}>
          <Index each={matches()}>
            {(m, i) => (
              <li
                id={`palette-opt-${i}`}
                role="option"
                aria-selected={i === sel()}
                class={i === sel() ? 'cmd-item selected' : 'cmd-item'}
                onMouseEnter={() => setIndex(i)}
                onClick={() => pick(m().c)}
              >
                <span class="cmd-title">{m().c.title}</span>
                {m().c.current && <span class="cmd-current">✓</span>}
                {m().c.hint && <kbd class="cmd-hint">{m().c.hint}</kbd>}
              </li>
            )}
          </Index>
          {matches().length === 0 && (
            <li class="cmd-empty">No matching commands</li>
          )}
        </ul>
        <div class="palette-footer">↑↓ navigate · Enter run · Esc close</div>
      </div>
    </div>
  );
}
