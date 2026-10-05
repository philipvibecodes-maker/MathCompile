import {
  matchCompletions,
  type CompletionItem,
} from './completions';
import {
  acceptCommandCompletion,
  acceptWordCompletion,
  readCompletionContext,
  type CompletionContext,
} from './caret-context';
import { mountStaticMath } from './static-math';
import { isMqKeyTarget, type MathFieldElement } from './math-field';

// IDE-style autocomplete: a filtered dropdown anchored under the caret
// whenever the typed context has completions — the `\` command input
// (any prefix length) or a bare letter-run (2+ chars). Arrow Up/Down
// navigate, Enter/Tab accepts, Esc dismisses until the next keystroke.
// Row elements are cached by command name so the StaticMath previews
// survive re-renders on every keystroke.
export function attachAutocompleteMenu(field: MathFieldElement) {
  const menu = document.createElement('div');
  menu.className = 'mc-ac';
  menu.hidden = true;
  field.appendChild(menu);

  const rowCache = new Map<string, HTMLElement>();
  let ctx: CompletionContext | null = null;
  let items: CompletionItem[] = [];
  let sel = 0;
  let suppressed = false;

  const hide = () => {
    menu.hidden = true;
    ctx = null;
  };

  const row = (item: CompletionItem, i: number) => {
    let el = rowCache.get(item.name);
    if (!el) {
      el = document.createElement('div');
      el.className = 'mc-ac-item';
      const name = document.createElement('span');
      name.className = 'mc-ac-name';
      name.textContent = item.name;
      const prev = document.createElement('span');
      prev.className = 'mc-ac-prev';
      mountStaticMath(prev).set(item.preview ?? `\\${item.name}`);
      el.append(name, prev);
      if (item.hint) {
        const hint = document.createElement('span');
        hint.className = 'mc-ac-hint';
        hint.textContent = item.hint;
        el.append(hint);
      }
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        accept(item);
      });
      rowCache.set(item.name, el);
    }
    el.classList.toggle('sel', i === sel);
    el.dataset.i = String(i);
    return el;
  };

  const refresh = () => {
    // Focus inside the field but outside MathQuill (e.g. the symbol
    // picker's search input) means the user isn't typing math.
    const ae = document.activeElement;
    if (
      ae instanceof HTMLElement &&
      field.contains(ae) &&
      !ae.closest('.mq-textarea')
    )
      return hide();
    ctx = readCompletionContext(field);
    if (!ctx || suppressed) return hide();
    if (ctx.kind === 'word' && ctx.prefix.length < 2) return hide();
    items = matchCompletions(ctx.prefix);
    if (!items.length) return hide();
    sel = Math.min(sel, items.length - 1);
    menu.replaceChildren(...items.map(row));
    const fr = field.getBoundingClientRect();
    menu.style.top = `${ctx.anchor.bottom - fr.top + 4}px`;
    menu.style.left = `${Math.max(
      0,
      Math.min(ctx.anchor.left - fr.left, fr.width - menu.offsetWidth - 4),
    )}px`;
    menu.hidden = false;
  };

  const accept = (item: CompletionItem) => {
    const mq = field.mq;
    if (!mq || !ctx) return;
    if (ctx.kind === 'command') acceptCommandCompletion(mq, item, ctx.prefix);
    else acceptWordCompletion(mq, item, ctx.prefix);
    hide();
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (!isMqKeyTarget(e.target)) return;
    if (menu.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((_, i) =>
        menu.children[i]?.classList.toggle('sel', i === sel),
      );
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      accept(items[sel]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      suppressed = true;
      hide();
    }
  };

  const onInput = () => {
    suppressed = false;
    sel = 0;
    refresh();
  };
  const onKeyup = () => refresh();
  const onFocusOut = () => hide();
  const onWindowChange = () => {
    if (!menu.hidden) refresh();
  };

  field.addEventListener('keydown', onKeydown, true);
  field.addEventListener('input', onInput);
  field.addEventListener('keyup', onKeyup);
  field.addEventListener('focusout', onFocusOut);
  window.addEventListener('scroll', onWindowChange, true);
  window.addEventListener('resize', onWindowChange);

  return () => {
    field.removeEventListener('keydown', onKeydown, true);
    field.removeEventListener('input', onInput);
    field.removeEventListener('keyup', onKeyup);
    field.removeEventListener('focusout', onFocusOut);
    window.removeEventListener('scroll', onWindowChange, true);
    window.removeEventListener('resize', onWindowChange);
    menu.remove();
  };
}
