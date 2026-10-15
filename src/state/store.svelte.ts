import type { FieldHandle } from '../editor/attach-field';
import type { TargetId } from '../compile/targets';
import {
  parseCellLatex,
  type MathJson,
  type PairTupleMode,
} from '../compile/ir';
import {
  flushPendingCells,
  installFlushOnHide,
  loadPrefs,
  loadWorkbook,
  loadWorksheetCells,
  newWorksheetId,
  nextWorksheetName,
  persistCells,
  removeStoredWorksheet,
  renameStoredWorksheet,
  setActiveWorksheet,
  uniqueWorksheetName,
  upsertWorksheet,
  type StoredCell,
  type WorksheetMeta,
} from './persistence';

// 'math' cells edit latex in a math-field; 'python' cells edit raw
// python source in a plain code field. For a python cell `latex` is
// the source text and `json` is the PythonSource statement node —
// codegen emits it verbatim either way.
export type CellKind = 'math' | 'python';

export interface Cell {
  id: number;
  kind: CellKind;
  latex: string;
  // Parsed MathJSON for the compile pipeline; undefined while unparseable
  // or empty. Kept in sync by setLatex/createCell.
  json?: MathJson;
}

export type Edge = 'start' | 'end';

// The cell source's pipeline form: latex parses to MathJSON; python
// source wraps whole as the verbatim PythonSource statement.
function sourceJson(kind: CellKind, src: string): MathJson | undefined {
  if (kind === 'python')
    return src.trim() === '' ? undefined : ['PythonSource', src];
  return parseCellLatex(src);
}

let nextId = 1;
const createCell = (latex = '', kind: CellKind = 'math'): Cell => ({
  id: nextId++,
  kind,
  latex,
  json: sourceJson(kind, latex),
});

const SEED_LATEX = '2^n = \\sum_{i=0}^n\\binom{n}{i}';

// Restored ids push nextId forward so later cells never collide — across
// every sheet, not just the active one (imports remap their ids too).
// Persisted cells carry no json — recompute it on hydrate. An empty
// stored sheet opens as one blank cell.
function hydrateCells(stored: StoredCell[]): Cell[] {
  nextId = Math.max(nextId, Math.max(0, ...stored.map((c) => c.id)) + 1);
  const cells: Cell[] = stored.map((c) => {
    const kind = c.kind ?? 'math';
    return { id: c.id, kind, latex: c.latex, json: sourceJson(kind, c.latex) };
  });
  return cells.length > 0 ? cells : [createCell()];
}

// Hydrate the workbook; a first run gets one ephemeral "Worksheet 1"
// holding the seeded example cell, persisted only on the first edit.
function initWorkbook(): {
  sheets: WorksheetMeta[];
  activeId: string;
  cells: Cell[];
} {
  const wb = loadWorkbook();
  if (!wb) {
    const meta = { id: newWorksheetId(), name: 'Worksheet 1' };
    return { sheets: [meta], activeId: meta.id, cells: [createCell(SEED_LATEX)] };
  }
  const active = wb.sheets.find((s) => s.id === wb.active) ?? wb.sheets[0];
  return {
    sheets: wb.sheets.map(({ id, name }) => ({ id, name })),
    activeId: active.id,
    cells: hydrateCells(active.cells),
  };
}

export const THEME_STORAGE_KEY = 'mathcompile-theme';

// Saved preference > prefers-color-scheme > light. Window access is
// guarded so the store stays importable in node (vitest).
function initDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

// App state + the field registry/focus service: the single focus owner.
// Commands reach fields through `fields.get(id)?.method()` — never through
// prop-encoded commands. Cell ops are DOM-free except focusCell, which
// no-ops when no field is registered for the id — so this is fully
// unit-testable in node.
export class AppStore {
  private readonly boot = initWorkbook();
  // Every worksheet in the workbook (active sheet's cells live in
  // `cells`; the rest sit in storage until switched to).
  worksheets = $state<WorksheetMeta[]>(this.boot.sheets);
  activeWorksheetId = $state<string>(this.boot.activeId);
  cells = $state<Cell[]>(this.boot.cells);
  focusedId = $state<number>(this.cells[0].id);
  focusEdge = $state<Edge | undefined>(undefined);
  target = $state<TargetId>(loadPrefs().target ?? 'latex');
  smartMode = $state(loadPrefs().smartMode ?? true);
  // Calculator code blocks show the `e = ...` capture lines when on.
  showPlumbing = $state(loadPrefs().showPlumbing ?? false);
  guideOpen = $state(loadPrefs().guideOpen ?? true);
  // Python output mode: `from sympy import *` (default, bare names) vs
  // `import sympy as sp` (sp.-qualified).
  importAll = $state(loadPrefs().importAll ?? true);
  // `(a,b)` lowers to the open interval (default) or a 1×2 row matrix —
  // longer tuples are row matrices either way.
  pairTuple = $state<PairTupleMode>(loadPrefs().pairTuple ?? 'interval');
  // Animation knobs (persisted prefs). fadeMs drives code-line fades
  // (also exported as --fade-ms for CSS mount animations); debounceMs
  // delays issue overlays until typing pauses; fadeInMs/fadeOutMs are
  // the overlays' transition times. Shared so the settings menu drives
  // every target live.
  fadeMs = $state(loadPrefs().fadeMs ?? 150);
  debounceMs = $state(loadPrefs().debounceMs ?? 600);
  fadeInMs = $state(loadPrefs().fadeInMs ?? 150);
  fadeOutMs = $state(loadPrefs().fadeOutMs ?? 150);
  paletteOpen = $state(false);
  darkMode = $state(initDarkMode());

  // Mounted math-field handles, keyed by cell id.
  readonly fields = new Map<number, FieldHandle>();

  constructor() {
    installFlushOnHide();
  }

  // Debounced snapshot of the active worksheet; persistence.ts
  // coalesces the writes so the keystroke path never touches setItem
  // directly.
  private persist() {
    const meta = this.worksheets.find((w) => w.id === this.activeWorksheetId);
    if (meta) persistCells(meta, this.cells);
  }

  get activeWorksheet(): WorksheetMeta | undefined {
    return this.worksheets.find((w) => w.id === this.activeWorksheetId);
  }

  switchWorksheet(id: string) {
    if (id === this.activeWorksheetId) return;
    if (!this.worksheets.some((w) => w.id === id)) return;
    flushPendingCells();
    this.cells = hydrateCells(loadWorksheetCells(id) ?? []);
    this.activeWorksheetId = id;
    setActiveWorksheet(id);
    this.focusCell(this.cells[0].id);
  }

  createWorksheet(name?: string): string {
    flushPendingCells();
    const meta: WorksheetMeta = {
      id: newWorksheetId(),
      name: name?.trim() || nextWorksheetName(this.worksheets),
    };
    upsertWorksheet({ ...meta, cells: [] });
    this.worksheets = [...this.worksheets, meta];
    this.switchWorksheet(meta.id);
    return meta.id;
  }

  renameWorksheet(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Flush so a pending write can't land after the rename and upsert the
    // sheet back under its old name.
    flushPendingCells();
    renameStoredWorksheet(id, trimmed);
    this.worksheets = this.worksheets.map((w) =>
      w.id === id ? { ...w, name: trimmed } : w,
    );
  }

  deleteWorksheet(id: string) {
    if (this.worksheets.length <= 1) return;
    // Flush before removing so the deleted sheet's pending write can't
    // resurrect it.
    flushPendingCells();
    removeStoredWorksheet(id);
    const remaining = this.worksheets.filter((w) => w.id !== id);
    this.worksheets = remaining;
    if (id === this.activeWorksheetId) this.switchWorksheet(remaining[0].id);
  }

  // A saved file opens as a new worksheet; its cell ids are remapped so
  // they can't collide with ids already in the workbook.
  importWorksheet(name: string, cells: StoredCell[]) {
    flushPendingCells();
    const remapped = cells.map((c) => ({
      id: nextId++,
      latex: c.latex,
      ...(c.kind === 'python' ? { kind: 'python' as const } : {}),
    }));
    const meta: WorksheetMeta = {
      id: newWorksheetId(),
      name: uniqueWorksheetName(name.trim() || 'Imported', this.worksheets),
    };
    upsertWorksheet({ ...meta, cells: remapped });
    this.worksheets = [...this.worksheets, meta];
    this.switchWorksheet(meta.id);
  }

  // Cells + name as a downloadable snapshot — the active sheet reads its
  // live cells so a just-typed edit is included.
  worksheetSnapshot(id = this.activeWorksheetId) {
    const meta = this.worksheets.find((w) => w.id === id);
    if (!meta) return null;
    const cells =
      id === this.activeWorksheetId
        ? this.cells.map((c) => ({
            id: c.id,
            latex: c.latex,
            ...(c.kind === 'python' ? { kind: 'python' as const } : {}),
          }))
        : (loadWorksheetCells(id) ?? []);
    return { name: meta.name, cells };
  }

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
    if (c) {
      c.latex = latex;
      c.json = sourceJson(c.kind, latex);
      this.persist();
    }
  }

  // Flip a cell between math and python editing. The source text is
  // kept — a `def` reads as garbage latex and vice versa, but nothing
  // is silently destroyed; the field remounts on the kind change.
  setCellKind(id: number, kind: CellKind) {
    const c = this.cells.find((e) => e.id === id);
    if (!c || c.kind === kind) return;
    c.kind = kind;
    c.json = sourceJson(kind, c.latex);
    this.persist();
  }

  addCell(afterId?: number, latex = '', kind: CellKind = 'math'): number {
    const cell = createCell(latex, kind);
    const at =
      afterId == null
        ? this.cells.length
        : Math.max(this.cells.findIndex((x) => x.id === afterId) + 1, 0);
    this.cells.splice(at, 0, cell);
    this.persist();
    this.focusCell(cell.id);
    return cell.id;
  }

  // Python source cells define functions a math cell can call as
  // `\mathrm{name}(x)` (or via a `# @latex` annotation) — same insert
  // position as addCell.
  addPythonCell(afterId?: number): number {
    return this.addCell(afterId, '', 'python');
  }

  removeCell(id: number) {
    if (this.cells.length > 1) this.cells = this.cells.filter((e) => e.id !== id);
    else if (this.cells[0]?.id === id) {
      this.cells[0].latex = '';
      this.cells[0].json = undefined;
    }
    this.persist();
  }

  duplicateCell(id: number) {
    const cur = this.cells.find((e) => e.id === id);
    if (cur) this.addCell(cur.id, cur.latex, cur.kind);
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
    this.persist();
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
