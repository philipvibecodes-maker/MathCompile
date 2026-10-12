import {
  pointerRecentlyDown,
  type MathFieldElement,
} from './math-field';
import { mountStaticMath } from './static-math';

// Matrix dimensions menu. With the vendored matrixDimensionsMenu option
// on, a typed matrix-family command (\pmatrix, \begin{bmatrix},
// \array{cc}, …) doesn't drop a default 2x2 grid — it fires
// 'mq:matrix-request' on the field's MQ mount with an insert(rows, cols)
// callback. This menu collects the dimensions: Enter inserts the grid,
// Escape or a click-away cancels and leaves the field as it was.
// \cases and the non-matrix grids (aligned, gathered, displaylines)
// never fire it.
const MAX_DIM = 50;
const DEFAULT_DIM = 2;

interface MatrixInsertDetail {
  env: string;
  insert: (rows: number, cols: number) => void;
  // The exact latex insert() would write (selection included in the
  // first cell) — the menu renders it as the live preview.
  latex: (rows: number, cols: number) => string;
  // Restores a replaced selection's text at the command's gap; a no-op
  // when nothing was selected.
  cancel?: () => void;
}

const clampDim = (value: string) => {
  const n = parseInt(value, 10);
  return Math.min(MAX_DIM, Math.max(1, Number.isNaN(n) ? DEFAULT_DIM : n));
};

export function attachMatrixMenu(field: MathFieldElement) {
  const wrap = document.createElement('div');
  wrap.className = 'mc-mat';
  wrap.hidden = true;
  wrap.title = 'matrix dimensions';

  const dims = document.createElement('div');
  dims.className = 'mc-mat-dims';

  const rows = document.createElement('input');
  rows.className = 'mc-mat-dim';
  rows.inputMode = 'numeric';
  rows.setAttribute('aria-label', 'rows');
  rows.setAttribute('spellcheck', 'false');

  const sep = document.createElement('span');
  sep.className = 'mc-mat-sep';
  sep.textContent = '×';

  const cols = document.createElement('input');
  cols.className = 'mc-mat-dim';
  cols.inputMode = 'numeric';
  cols.setAttribute('aria-label', 'columns');
  cols.setAttribute('spellcheck', 'false');

  const hint = document.createElement('span');
  hint.className = 'mc-mat-hint';
  hint.textContent = 'rows × columns';

  dims.append(rows, sep, cols, hint);

  const prev = document.createElement('div');
  prev.className = 'mc-mat-prev';

  wrap.append(dims, prev);
  field.appendChild(wrap);

  const preview = mountStaticMath(prev);

  let pending: MatrixInsertDetail | null = null;

  const refresh = () => {
    if (pending)
      preview.set(pending.latex(clampDim(rows.value), clampDim(cols.value)));
  };

  const close = (refocus = false) => {
    const detail = pending;
    wrap.hidden = true;
    pending = null;
    detail?.cancel?.();
    if (refocus) field.mq?.focus();
  };

  const commit = () => {
    const detail = pending;
    wrap.hidden = true;
    pending = null;
    if (!detail) return;
    detail.insert(clampDim(rows.value), clampDim(cols.value));
    field.mq?.focus();
  };

  // Clicks on the menu's own chrome keep the active input focused —
  // the inputs are the only real mousedown targets.
  wrap.addEventListener('mousedown', (e) => {
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
  });

  const onRequest = (e: Event) => {
    pending = (e as CustomEvent<MatrixInsertDetail>).detail;
    // The cursor element still exists at dispatch time (the field is
    // focused); capture its rect before focusing the input removes it.
    const cursor = field.querySelector<HTMLElement>('.mq-cursor');
    const anchor =
      cursor?.getBoundingClientRect() ?? field.getBoundingClientRect();
    const fr = field.getBoundingClientRect();
    wrap.hidden = false;
    wrap.style.top = `${anchor.bottom - fr.top + 4}px`;
    wrap.style.left = `${Math.max(
      0,
      Math.min(anchor.left - fr.left, fr.width - wrap.offsetWidth - 4),
    )}px`;
    rows.value = String(DEFAULT_DIM);
    cols.value = String(DEFAULT_DIM);
    refresh();
    rows.focus();
    rows.select();
  };

  const onInputKeydown = (e: KeyboardEvent) => {
    const input = e.target as HTMLInputElement;
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') close(true);
    else if (e.key === 'Tab') {
      // Cycle between the two inputs instead of letting focus leave
      // the menu.
      const other = input === rows ? cols : rows;
      other.focus();
      other.select();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      input.value = String(
        clampDim(input.value) + (e.key === 'ArrowUp' ? 1 : -1),
      );
      input.select();
      refresh();
    } else return;
    e.preventDefault();
  };

  const onInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    input.value = input.value.replace(/\D/g, '');
    refresh();
  };

  const onFocusOut = (e: FocusEvent) => {
    if (wrap.contains(e.relatedTarget as Node)) return;
    // Same blur rule as the symbol picker: a pointer-away click closes
    // without stealing focus back; a bare programmatic blur (Vimium's
    // Escape) returns focus to the field.
    close(e.relatedTarget === null && !pointerRecentlyDown());
  };

  const onWindowChange = () => {
    if (!wrap.hidden) close(false);
  };

  field.addEventListener('mq:matrix-request', onRequest);
  rows.addEventListener('keydown', onInputKeydown);
  cols.addEventListener('keydown', onInputKeydown);
  rows.addEventListener('input', onInput);
  cols.addEventListener('input', onInput);
  wrap.addEventListener('focusout', onFocusOut);
  window.addEventListener('scroll', onWindowChange, true);
  window.addEventListener('resize', onWindowChange);

  return () => {
    field.removeEventListener('mq:matrix-request', onRequest);
    wrap.removeEventListener('focusout', onFocusOut);
    window.removeEventListener('scroll', onWindowChange, true);
    window.removeEventListener('resize', onWindowChange);
    wrap.remove();
  };
}
