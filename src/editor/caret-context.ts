import type { MQ } from './mathquill';
import type { CompletionItem } from './completions';

// Where an autocomplete suggestion can come from, read off the rendered
// MathQuill DOM. Two surfaces:
//
// - 'command': the caret is inside an open `\`-command input
//   (.mq-latex-command-input); the prefix is the letters typed so far.
// - 'word': a run of plain <var> letters immediately left of the caret
//   (smart-mode typing). Completing replaces the run with a command.
export interface CompletionContext {
  kind: 'command' | 'word';
  prefix: string;
  /** Rect to anchor a popup under/next to. */
  anchor: DOMRect;
}

const BLOCKS_WORD_RUN = '.mq-text-mode, .mq-matrix, .mq-smallmatrix';

export function readCompletionContext(
  field: HTMLElement,
): CompletionContext | null {
  // MQ only marks the field's own cursor; an unfocused field has none
  // rendered at all, so presence implies focus.
  const cursor = field.querySelector<HTMLElement>('.mq-cursor');
  if (!cursor) return null;

  const cmdInput = cursor.closest<HTMLElement>('.mq-latex-command-input');
  if (cmdInput) {
    // The input's last child is the letter block; its children are the
    // typed-letter spans plus the cursor element.
    const block = cmdInput.lastElementChild;
    let prefix = '';
    for (const child of Array.from(block?.children ?? [])) {
      if (!child.classList.contains('mq-cursor'))
        prefix += child.textContent ?? '';
    }
    return { kind: 'command', prefix, anchor: cmdInput.getBoundingClientRect() };
  }

  if (cursor.closest(BLOCKS_WORD_RUN)) return null;

  // Contiguous <var> siblings immediately left of the caret. Variables
  // render one element per letter (`f` is still a plain <var>).
  let prefix = '';
  for (
    let sib = cursor.previousElementSibling;
    sib && sib.tagName === 'VAR';
    sib = sib.previousElementSibling
  ) {
    prefix = (sib.textContent ?? '') + prefix;
  }
  if (!prefix) return null;
  return { kind: 'word', prefix, anchor: cursor.getBoundingClientRect() };
}

// Accept a candidate on the `\` surface: fill the remaining letters into
// the open command input, then render it exactly like pressing Enter.
export function acceptCommandCompletion(
  mq: MQ,
  item: CompletionItem,
  prefix: string,
) {
  mq.typedText(item.name.slice(prefix.length));
  mq.keystroke('Enter');
}

// Accept a candidate on the word surface: backspace the letter run, then
// insert the command (caret lands in its first block, as if typed).
export function acceptWordCompletion(
  mq: MQ,
  item: CompletionItem,
  prefix: string,
) {
  mq.keystroke('Backspace '.repeat(prefix.length).trim());
  mq.cmd('\\' + item.name);
}
