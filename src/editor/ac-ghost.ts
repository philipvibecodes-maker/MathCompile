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
import type { MathFieldElement } from './math-field';

// Copilot-style ghost completion: the single best candidate renders as
// faint text right after the caret — the remaining command-name letters
// inside a `\` input, or a "Tab ⇒ <preview>" hint after a bare
// letter-run (2+ chars, which converts to the command on accept).
// Tab accepts, Esc dismisses until the next keystroke; anything else
// just passes through to MathQuill.
export function attachAutocompleteGhost(field: MathFieldElement) {
  const ghost = document.createElement('span');
  ghost.className = 'mc-ghost';
  ghost.hidden = true;
  field.appendChild(ghost);

  const previewCache = new Map<string, HTMLElement>();
  let ctx: CompletionContext | null = null;
  let item: CompletionItem | null = null;
  let suppressed = false;

  const previewEl = (it: CompletionItem) => {
    let el = previewCache.get(it.name);
    if (!el) {
      el = document.createElement('span');
      el.className = 'mc-ghost-prev';
      mountStaticMath(el).set(it.preview ?? `\\${it.name}`);
      previewCache.set(it.name, el);
    }
    return el;
  };

  const hide = () => {
    ghost.hidden = true;
    ctx = null;
    item = null;
  };

  const refresh = () => {
    ctx = readCompletionContext(field);
    item = null;
    if (!ctx || suppressed) return hide();
    if (ctx.kind === 'word' && ctx.prefix.length < 2) return hide();
    const [best] = matchCompletions(ctx.prefix, 1);
    if (!best) return hide();

    ghost.replaceChildren();
    if (ctx.kind === 'command') {
      const suffix = best.name.slice(ctx.prefix.length);
      if (!suffix) return hide();
      const el = document.createElement('span');
      el.className = 'mc-ghost-suffix';
      el.textContent = suffix;
      ghost.append(el);
    } else {
      const kbd = document.createElement('kbd');
      kbd.className = 'mc-ghost-kbd';
      kbd.textContent = 'Tab';
      ghost.append(kbd, previewEl(best));
    }
    item = best;

    const fr = field.getBoundingClientRect();
    ghost.style.top = `${ctx.anchor.top - fr.top}px`;
    ghost.style.left = `${ctx.anchor.right - fr.left + 1}px`;
    ghost.hidden = false;
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (ghost.hidden) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const mq = field.mq;
      if (!mq || !ctx || !item) return;
      if (ctx.kind === 'command')
        acceptCommandCompletion(mq, item, ctx.prefix);
      else acceptWordCompletion(mq, item, ctx.prefix);
      hide();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      suppressed = true;
      hide();
    }
  };

  const onInput = () => {
    suppressed = false;
    refresh();
  };
  const onKeyup = () => refresh();
  const onFocusOut = () => hide();
  const onWindowChange = () => {
    if (!ghost.hidden) refresh();
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
    ghost.remove();
  };
}
