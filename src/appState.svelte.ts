import type { FieldHandle } from './editor/math-field';
import type { TargetId } from './targets';

export interface Cell {
  id: number;
  latex: string;
}

export type Edge = 'start' | 'end';

let nextId = 1;
const createCell = (latex = ''): Cell => ({ id: nextId++, latex });

export const THEME_STORAGE_KEY = 'mathcompile-theme';

// Saved preference > prefers-color-scheme > light. Window access is
// guarded so the store stays importable in node (vitest).
function initDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

// App state + the field registry/focus service (challenges.md §4/§7: one
// focus owner; commands reach fields through `fields.get(id)?.method()`,
// never through prop deltas like the old focusNonce). Cell ops are DOM-free
// except focusCell, which no-ops when no field is registered for the id —
// so this is fully unit-testable in node.
export class AppStore {
  cells = $state<Cell[]>([createCell('2^n = \\sum_{i=0}^n\\binom{i}{n}')]);
  focusedId = $state<number>(this.cells[0].id);
  focusEdge = $state<Edge | undefined>(undefined);
  target = $state<TargetId>('latex');
  smartMode = $state(true);
  showCode = $state(false);
  paletteOpen = $state(false);
  darkMode = $state(initDarkMode());

  // Mounted math-field handles, keyed by cell id.
  readonly fields = new Map<number, FieldHandle>();

  focusCell(id: number, edge?: Edge) {
    this.focusedId = id;
    this.focusEdge = edge;
    this.fields.get(id)?.focus(edge);
  }

  noteFocus(id: number) {
    this.focusedId = id;
  }

  registerField(id: number, handle: FieldHandle) {
    this.fields.set(id, handle);
    // Self-focus path: if this cell already claimed focus (addCell, goto,
    // clearAll), the direct call in focusCell couldn't reach it — Svelte
    // mounts the component after the store call — so focus now on mount.
    if (this.focusedId === id) {
      const edge = this.focusEdge;
      this.focusEdge = undefined;
      handle.focus(edge);
    }
  }

  unregisterField(id: number) {
    this.fields.delete(id);
  }

  setLatex(id: number, latex: string) {
    const c = this.cells.find((e) => e.id === id);
    // In-place mutation keeps {#each} row identity — replacing the cell
    // object would remount the field and lose the caret every keystroke.
    if (c) c.latex = latex;
  }

  addCell(afterId?: number, latex = ''): number {
    const cell = createCell(latex);
    const at =
      afterId == null
        ? this.cells.length
        : Math.max(this.cells.findIndex((x) => x.id === afterId) + 1, 0);
    this.cells.splice(at, 0, cell);
    this.focusCell(cell.id);
    return cell.id;
  }

  removeCell(id: number) {
    if (this.cells.length > 1) this.cells = this.cells.filter((e) => e.id !== id);
    else if (this.cells[0]?.id === id) this.cells[0].latex = '';
  }

  duplicateCell(id: number) {
    const cur = this.cells.find((e) => e.id === id);
    if (cur) this.addCell(cur.id, cur.latex);
  }

  deleteFocused() {
    const idx = this.cells.findIndex((e) => e.id === this.focusedId);
    if (idx < 0) return;
    const removedId = this.cells[idx].id;
    const next = this.cells[idx + 1] ?? this.cells[idx - 1];
    this.removeCell(removedId);
    if (next && next.id !== removedId) this.focusCell(next.id);
  }

  clearAll() {
    const cell = createCell();
    this.cells = [cell];
    this.focusCell(cell.id);
  }

  // Caret hit the top/bottom edge of cell `id`: hop to the adjacent cell,
  // or append a new one past the last row.
  moveOut(id: number, dir: 'up' | 'down') {
    const i = this.cells.findIndex((e) => e.id === id);
    if (i < 0) return;
    const next = i + (dir === 'down' ? 1 : -1);
    if (next < 0) return;
    if (next >= this.cells.length) this.addCell();
    else this.focusCell(this.cells[next].id, dir === 'down' ? 'start' : 'end');
  }

  openPalette() {
    this.paletteOpen = true;
  }

  // Every close path refocuses the active cell — commands that moved focus
  // (e.g. go-to) have already updated focusedId by the time this runs.
  closePalette() {
    this.paletteOpen = false;
    this.focusCell(this.focusedId);
  }

  togglePalette() {
    if (this.paletteOpen) this.closePalette();
    else this.openPalette();
  }
}

export const appStore = new AppStore();
