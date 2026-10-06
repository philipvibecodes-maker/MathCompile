import { defineUserMacro } from '../notation/macros.svelte';
import { appStore } from '../state/store.svelte';
import { readCompletionContext } from './caret-context';
import { mountStaticMath } from './static-math';
import type { MathFieldElement } from './math-field';

// JIT notation definition: when the typed `\name` has no completions the
// autocomplete menu offers "define \name…", which opens this popover at
// the caret. `\name = <expansion latex>` — Enter defines a zero-arity
// macro (registered with MathQuill on the spot) and then completes the
// still-open command input, so `\vv` lands as a real macro node.
export function openDefinePopover(
  field: MathFieldElement,
  name: string,
  anchor: DOMRect,
): void {
  const pop = document.createElement('div');
  pop.className = 'mc-def';

  const row = document.createElement('div');
  row.className = 'mc-def-row';
  const label = document.createElement('span');
  label.className = 'mc-def-name';
  label.textContent = `\\${name} =`;
  const input = document.createElement('input');
  input.className = 'mc-def-input';
  input.placeholder = '\\mathbf{x}';
  input.spellcheck = false;
  row.append(label, input);

  const prev = document.createElement('div');
  prev.className = 'mc-def-prev';
  const sm = mountStaticMath(prev);

  const hint = document.createElement('div');
  hint.className = 'mc-def-hint';
  hint.textContent = 'Enter defines · Esc cancels';

  pop.append(row, prev, hint);

  // Position like the autocomplete menu — inside the field, under the
  // caret's anchor rect.
  const fr = field.getBoundingClientRect();
  pop.style.top = `${anchor.bottom - fr.top + 4}px`;
  pop.style.left = `${Math.max(
    0,
    Math.min(anchor.left - fr.left, fr.width - 260),
  )}px`;

  const remove = () => pop.remove();

  const commit = () => {
    const body = input.value.trim();
    if (body === '') return cancel();
    if (!defineUserMacro({ name, arity: 0, params: [], body }))
      return cancel();
    // Defining \name makes earlier `\name` uses in other cells expand —
    // their cached parse is stale now.
    appStore.reparseAll();
    remove();
    const mq = field.mq;
    mq?.focus();
    if (!mq) return;
    // The command input normally survives the blur — resume it and
    // complete; if it collapsed to a word run instead, replace that.
    const c = readCompletionContext(field);
    if (c?.kind === 'command' && name.startsWith(c.prefix)) {
      mq.typedText(name.slice(c.prefix.length));
      mq.keystroke('Enter');
    } else if (c?.kind === 'word' && c.prefix === name) {
      mq.keystroke('Backspace '.repeat(name.length).trim());
      mq.cmd(`\\${name}`);
    }
  };

  const cancel = () => {
    remove();
    field.mq?.focus();
  };

  input.addEventListener('input', () => sm.set(input.value));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      // preventDefault keeps the keypress that follows this keydown
      // from landing on the refocused MQ textarea as a second Enter.
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });
  // Mousedown outside the input mustn't move focus (blur to document);
  // inside it, let the click position the caret normally.
  pop.addEventListener('mousedown', (e) => {
    if (e.target !== input) e.preventDefault();
  });
  field.appendChild(pop);
  input.focus();
}
