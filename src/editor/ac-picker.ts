import {
  COMPLETIONS,
  type CompletionItem,
} from './completions';
import { mountStaticMath } from './static-math';
import type { MathFieldElement } from './math-field';

// On-demand symbol picker: Ctrl+Space opens a searchable grid anchored
// under the caret with rendered previews of every candidate command.
// Type to filter, arrows move within the grid, Enter/click inserts the
// command at the caret, Esc (or clicking away) closes and refocuses the
// field. Nothing pops up while typing — the picker is explicit only.
const COLS = 6;

export function attachSymbolPicker(field: MathFieldElement) {
  const wrap = document.createElement('div');
  wrap.className = 'mc-pick';
  wrap.hidden = true;

  const input = document.createElement('input');
  input.className = 'mc-pick-q';
  input.placeholder = 'symbol or command…';
  input.setAttribute('spellcheck', 'false');

  const grid = document.createElement('div');
  grid.className = 'mc-pick-grid';

  wrap.append(input, grid);
  field.appendChild(wrap);

  // Clicks on the picker's own chrome (padding, grid gaps) keep the
  // search input focused; only the input takes a real mousedown.
  wrap.addEventListener('mousedown', (e) => {
    if (e.target !== input) e.preventDefault();
  });

  const cardCache = new Map<string, HTMLElement>();
  let items: CompletionItem[] = [];
  let sel = 0;

  const card = (item: CompletionItem, i: number) => {
    let el = cardCache.get(item.name);
    if (!el) {
      el = document.createElement('div');
      el.className = 'mc-pick-card';
      const prev = document.createElement('span');
      prev.className = 'mc-pick-prev';
      mountStaticMath(prev).set(item.preview ?? `\\${item.name}`);
      const name = document.createElement('span');
      name.className = 'mc-pick-name';
      name.textContent = item.name;
      el.append(prev, name);
      el.addEventListener('mousedown', (e) => {
        // Keep the search input focused until accept runs.
        e.preventDefault();
        accept(item);
      });
      cardCache.set(item.name, el);
    }
    el.classList.toggle('sel', i === sel);
    el.dataset.i = String(i);
    return el;
  };

  const render = () => {
    const q = input.value.trim().toLowerCase();
    const starts = COMPLETIONS.filter((c) =>
      c.name.toLowerCase().startsWith(q),
    );
    const inside = q
      ? COMPLETIONS.filter(
          (c) => !c.name.toLowerCase().startsWith(q) &&
            (c.name.toLowerCase().includes(q) ||
              c.hint?.toLowerCase().includes(q)),
        )
      : [];
    items = [...starts, ...inside];
    sel = Math.min(sel, Math.max(0, items.length - 1));
    grid.replaceChildren(...items.map(card));
    if (items[sel]) grid.children[sel]?.scrollIntoView({ block: 'nearest' });
  };

  const open = () => {
    const cursor = field.querySelector<HTMLElement>('.mq-cursor');
    const anchor =
      cursor?.getBoundingClientRect() ?? field.getBoundingClientRect();
    const fr = field.getBoundingClientRect();
    wrap.style.top = `${anchor.bottom - fr.top + 4}px`;
    wrap.style.left = `${Math.max(
      0,
      Math.min(anchor.left - fr.left, fr.width - wrap.offsetWidth - 4),
    )}px`;
    wrap.hidden = false;
    input.value = '';
    sel = 0;
    render();
    input.focus();
  };

  const close = (refocus = true) => {
    wrap.hidden = true;
    if (refocus) field.mq?.focus();
  };

  const accept = (item: CompletionItem) => {
    const mq = field.mq;
    if (mq) {
      mq.focus();
      mq.cmd('\\' + item.name);
    }
    close();
  };

  const move = (delta: number) => {
    sel = (sel + delta + items.length) % items.length;
    items.forEach((_, i) =>
      grid.children[i]?.classList.toggle('sel', i === sel),
    );
    grid.children[sel]?.scrollIntoView({ block: 'nearest' });
  };

  const onFieldKeydown = (e: KeyboardEvent) => {
    if (
      e.code === 'Space' &&
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      !e.shiftKey
    ) {
      e.preventDefault();
      e.stopPropagation();
      if (wrap.hidden) open();
    }
  };

  const onInputKeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') move(COLS);
    else if (e.key === 'ArrowUp') move(-COLS);
    else if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowLeft') move(-1);
    else if (e.key === 'Enter') {
      if (items[sel]) accept(items[sel]);
    } else if (e.key === 'Escape') {
      close();
      return;
    } else return;
    e.preventDefault();
  };

  const onInput = () => {
    sel = 0;
    render();
  };
  const onBlur = () => {
    // mousedown on a card calls preventDefault, so blur only fires when
    // the user clicks genuinely outside the picker.
    close(false);
  };
  const onWindowChange = () => {
    if (!wrap.hidden) close(false);
  };

  field.addEventListener('keydown', onFieldKeydown, true);
  input.addEventListener('keydown', onInputKeydown);
  input.addEventListener('input', onInput);
  input.addEventListener('blur', onBlur);
  window.addEventListener('scroll', onWindowChange, true);
  window.addEventListener('resize', onWindowChange);

  return () => {
    field.removeEventListener('keydown', onFieldKeydown, true);
    window.removeEventListener('scroll', onWindowChange, true);
    window.removeEventListener('resize', onWindowChange);
    wrap.remove();
  };
}
