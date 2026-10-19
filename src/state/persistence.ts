import type { CellKind } from './store.svelte';
import { TARGETS, type TargetId } from '../compile/targets';
import type { PairTupleMode } from '../compile/ir';

export const WORKBOOK_STORAGE_KEY = 'mathcompile-worksheets';
export const PREFS_STORAGE_KEY = 'mathcompile-prefs';
// Pre-workbook format: a bare cells array. Migrated into the workbook on
// first load, then removed.
export const CELLS_STORAGE_KEY = 'mathcompile-cells';

const DEBOUNCE_MS = 300;

// All storage access is guarded so the module stays importable in node
// (vitest) — every loader returns null and every write no-ops there.
const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export interface Prefs {
  smartMode?: boolean;
  target?: TargetId;
  guideOpen?: boolean;
  // "How do I…" customization: topic ids pinned into the list and ids
  // hidden from it (see src/help/topics.ts).
  pinnedHelp?: string[];
  hiddenHelp?: string[];
  showPlumbing?: boolean;
  importAll?: boolean;
  pairTuple?: PairTupleMode;
  fadeMs?: number;
  debounceMs?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}

export function loadPrefs(): Prefs {
  const raw = storage()?.getItem(PREFS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const p = parsed as Record<string, unknown>;
    return {
      smartMode: typeof p.smartMode === 'boolean' ? p.smartMode : undefined,
      target: TARGETS.some((t) => t.id === p.target)
        ? (p.target as TargetId)
        : undefined,
      guideOpen: typeof p.guideOpen === 'boolean' ? p.guideOpen : undefined,
      pinnedHelp: Array.isArray(p.pinnedHelp)
        ? p.pinnedHelp.filter((id): id is string => typeof id === 'string')
        : undefined,
      hiddenHelp: Array.isArray(p.hiddenHelp)
        ? p.hiddenHelp.filter((id): id is string => typeof id === 'string')
        : undefined,
      showPlumbing:
        typeof p.showPlumbing === 'boolean' ? p.showPlumbing : undefined,
      importAll:
        typeof p.importAll === 'boolean' ? p.importAll : undefined,
      pairTuple:
        p.pairTuple === 'interval' || p.pairTuple === 'matrix'
          ? p.pairTuple
          : undefined,
      fadeMs: typeof p.fadeMs === 'number' ? p.fadeMs : undefined,
      debounceMs: typeof p.debounceMs === 'number' ? p.debounceMs : undefined,
      fadeInMs: typeof p.fadeInMs === 'number' ? p.fadeInMs : undefined,
      fadeOutMs: typeof p.fadeOutMs === 'number' ? p.fadeOutMs : undefined,
    };
  } catch {
    return {};
  }
}

export function savePrefs(prefs: Required<Prefs>): void {
  try {
    storage()?.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or disabled — prefs simply don't persist.
  }
}

// ── Workbook: every worksheet in one document ────────────────────────
//
// localStorage['mathcompile-worksheets'] holds { version, active, sheets }
// where each sheet is { id, name, cells: [{ id, latex, kind? }] }. `active`
// is the sheet shown on load. `kind` is 'python' for source cells (whose
// `latex` holds the raw python source); absent means a math cell.
// Everything else the app stores is prefs/theme.
export interface StoredCell {
  id: number;
  latex: string;
  kind?: 'python';
}

export interface WorksheetMeta {
  id: string;
  name: string;
}

export interface StoredWorksheet extends WorksheetMeta {
  cells: StoredCell[];
}

export interface Workbook {
  version: 1;
  active: string;
  sheets: StoredWorksheet[];
}

export function newWorksheetId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

// "Worksheet N" with the smallest N not already taken — sheets keep their
// names across deletes, so length+1 can collide.
export function nextWorksheetName(existing: { name: string }[]): string {
  const used = new Set(
    existing
      .map((w) => /^Worksheet (\d+)$/.exec(w.name)?.[1])
      .filter((n): n is string => n !== undefined),
  );
  let n = 1;
  while (used.has(String(n))) n += 1;
  return `Worksheet ${n}`;
}

// Imported/duplicated names get a " (n)" suffix until they're unique.
export function uniqueWorksheetName(
  name: string,
  existing: { name: string }[],
): string {
  const taken = new Set(existing.map((w) => w.name));
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} (${n})`)) n += 1;
  return `${name} (${n})`;
}

const isStoredCell = (c: unknown): c is StoredCell =>
  typeof c === 'object' &&
  c !== null &&
  typeof (c as StoredCell).id === 'number' &&
  typeof (c as StoredCell).latex === 'string' &&
  ((c as StoredCell).kind === undefined || (c as StoredCell).kind === 'python');

function parseCellsArray(parsed: unknown): StoredCell[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isStoredCell)
    .map((c) =>
      c.kind === 'python'
        ? { id: c.id, latex: c.latex, kind: 'python' }
        : { id: c.id, latex: c.latex },
    );
}

// Returns the stored cells plus the highest id seen so the caller can
// re-seed its id counter past it. Null on miss or corrupt data.
// Reads the legacy single-worksheet key — the workbook path migrates it.
export function loadCells(): { cells: StoredCell[]; maxId: number } | null {
  const raw = storage()?.getItem(CELLS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const cells = parseCellsArray(JSON.parse(raw));
    if (cells.length === 0) return null;
    return { cells, maxId: Math.max(...cells.map((c) => c.id)) };
  } catch {
    return null;
  }
}

function writeWorkbook(wb: Workbook): void {
  try {
    storage()?.setItem(WORKBOOK_STORAGE_KEY, JSON.stringify(wb));
  } catch {
    // Storage full or disabled — keep running in memory only.
  }
}

function readWorkbook(): Workbook | null {
  const ls = storage();
  if (!ls) return null;
  const raw = ls.getItem(WORKBOOK_STORAGE_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const sheets = (
        typeof parsed === 'object' && parsed !== null
          ? (parsed as Workbook).sheets
          : null
      );
      if (Array.isArray(sheets)) {
        const valid = sheets
          .filter(
            (s): s is StoredWorksheet =>
              typeof s === 'object' &&
              s !== null &&
              typeof s.id === 'string' &&
              typeof s.name === 'string' &&
              Array.isArray(s.cells),
          )
          .map((s) => ({ id: s.id, name: s.name, cells: parseCellsArray(s.cells) }));
        if (valid.length > 0) {
          const active = valid.some((s) => s.id === (parsed as Workbook).active)
            ? (parsed as Workbook).active
            : valid[0].id;
          return { version: 1, active, sheets: valid };
        }
      }
    } catch {
      // Corrupt workbook — fall through to the legacy key.
    }
  }
  // One-time migration of the single-worksheet format.
  const legacy = loadCells();
  if (!legacy) return null;
  const sheet: StoredWorksheet = {
    id: newWorksheetId(),
    name: 'Worksheet 1',
    cells: legacy.cells,
  };
  const wb: Workbook = { version: 1, active: sheet.id, sheets: [sheet] };
  writeWorkbook(wb);
  try {
    ls.removeItem(CELLS_STORAGE_KEY);
  } catch {
    // Couldn't remove the legacy key — it just migrates again next load.
  }
  return wb;
}

export function loadWorkbook(): Workbook | null {
  return readWorkbook();
}

export function loadWorksheetCells(id: string): StoredCell[] | null {
  return readWorkbook()?.sheets.find((s) => s.id === id)?.cells ?? null;
}

// Every write reads the document back first so a pending debounced flush
// can never clobber a structural op that landed in between (and vice
// versa). `active` is repaired to a real sheet on every write.
function mutateWorkbook(fn: (wb: Workbook) => void): void {
  if (!storage()) return;
  const wb = readWorkbook() ?? { version: 1 as const, active: '', sheets: [] };
  fn(wb);
  if (!wb.sheets.some((s) => s.id === wb.active)) {
    wb.active = wb.sheets[0]?.id ?? '';
  }
  writeWorkbook(wb);
}

export function upsertWorksheet(sheet: StoredWorksheet): void {
  mutateWorkbook((wb) => {
    const i = wb.sheets.findIndex((s) => s.id === sheet.id);
    if (i >= 0) wb.sheets[i] = sheet;
    else wb.sheets.push(sheet);
  });
}

export function setActiveWorksheet(id: string): void {
  mutateWorkbook((wb) => {
    if (wb.sheets.some((s) => s.id === id)) wb.active = id;
  });
}

export function renameStoredWorksheet(id: string, name: string): void {
  mutateWorkbook((wb) => {
    const s = wb.sheets.find((e) => e.id === id);
    if (s) s.name = name;
  });
}

export function removeStoredWorksheet(id: string): void {
  mutateWorkbook((wb) => {
    wb.sheets = wb.sheets.filter((s) => s.id !== id);
  });
}

let timer: ReturnType<typeof setTimeout> | undefined;
let pending:
  | { sheet: WorksheetMeta; cells: CellLike[] }
  | undefined;

// The snapshot needs only id/source/kind — a structural subset of the
// store's Cell so callers and tests can pass plain literals.
type CellLike = { id: number; latex: string; kind?: CellKind };

function flushCells(): void {
  clearTimeout(timer);
  timer = undefined;
  if (pending === undefined) return;
  const { sheet, cells } = pending;
  pending = undefined;
  const snapshot = cells.map((c) =>
    c.kind === 'python'
      ? { id: c.id, latex: c.latex, kind: 'python' as const }
      : { id: c.id, latex: c.latex },
  );
  mutateWorkbook((wb) => {
    const i = wb.sheets.findIndex((s) => s.id === sheet.id);
    // An existing record keeps its stored name (a rename may have landed
    // after this write was scheduled); a new one takes the meta's.
    if (i >= 0) wb.sheets[i] = { ...wb.sheets[i], cells: snapshot };
    else wb.sheets.push({ id: sheet.id, name: sheet.name, cells: snapshot });
  });
}

// Debounced trailing-edge write into one sheet of the workbook. Called
// from the store's mutating methods, so it must stay cheap: it only
// schedules; the stringify + setItem happen at most once per DEBOUNCE_MS
// after edits settle.
export function persistCells(sheet: WorksheetMeta, cells: CellLike[]): void {
  if (typeof window === 'undefined') return;
  pending = { sheet, cells };
  clearTimeout(timer);
  timer = setTimeout(flushCells, DEBOUNCE_MS);
}

// Structural ops (switch/delete) flush first so no edit is lost and a
// deleted sheet isn't resurrected by a late flush.
export function flushPendingCells(): void {
  flushCells();
}

// Tab close / backgrounding must not drop the last <300ms of typing.
let flushListenerInstalled = false;
export function installFlushOnHide(): void {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    flushListenerInstalled
  )
    return;
  flushListenerInstalled = true;
  window.addEventListener('pagehide', flushCells);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushCells();
  });
}
