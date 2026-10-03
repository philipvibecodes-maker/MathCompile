// Caret-context hints: read the rendered MQ DOM around .mq-cursor and
// surface the non-obvious keystroke for wherever the caret is sitting.
// DOM classes are the same ones the e2e suite pins (caretInfo in
// e2e/limits.spec.ts).
//
// Precedence is innermost-first: a bound inside a fraction inside a
// matrix reports the bound's hint — that is the block the next key
// lands in.
export function caretHint(field: HTMLElement): string | null {
  const cursor = field.querySelector('.mq-cursor');
  // Focused fields always have a .mq-cursor; no cursor = not focused.
  if (!cursor) return null;
  if (cursor.closest('.mq-latex-command-input'))
    return 'Enter accepts the \\… command · a non-letter finishes it early';
  if (cursor.closest('.mq-from, .mq-to'))
    return 'you are inside a bound — everything types here until Right or Tab exits';
  if (cursor.closest('.mq-sub, .mq-sup'))
    return 'inside a script — Right or Tab returns to the baseline';
  if (cursor.closest('.mq-numerator'))
    return 'numerator — Tab jumps to the denominator, Right exits';
  if (cursor.closest('.mq-denominator'))
    return 'denominator — Right exits the fraction';
  if (cursor.closest('.mq-sqrt-stem'))
    return 'inside the radical — Right exits the √';
  if (cursor.closest('.mq-text-mode'))
    return 'typing literal text — Right exits back to math';
  if (cursor.closest('.mq-aligned'))
    return 'aligned rows — Enter: new row · Tab: next column · Ctrl+End: exit';
  if (cursor.closest('.mq-matrix, .mq-smallmatrix'))
    return 'grid — Enter: new row · Shift+Space: new column · Ctrl+End: exit';
  if (cursor.closest('.mq-displaylines'))
    return 'multi-line cell — Enter: new line · Shift+Enter: new cell';
  // Any other inner block (parens, groups): the field swallows keys here.
  if (cursor.closest('.mq-root-block .mq-non-leaf'))
    return 'inside a group — Right exits to the outer expression';
  return null;
}
