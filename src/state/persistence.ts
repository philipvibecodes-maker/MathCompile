import type { Cell } from './store.svelte';
import { TARGETS, type TargetId } from '../compile/targets';

export const CELLS_STORAGE_KEY = 'mathcompile-cells';
export const PREFS_STORAGE_KEY = 'mathcompile-prefs';

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
  showCode?: boolean;
  importAll?: boolean;
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
      showCode: typeof p.showCode === 'boolean' ? p.showCode : undefined,
      importAll:
        typeof p.importAll === 'boolean' ? p.importAll : undefined,
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

// Returns the stored cells plus the highest id seen so the caller can
// re-seed its id counter past it. Null on miss or corrupt data.
export function loadCells(): { cells: Cell[]; maxId: number } | null {
  const raw = storage()?.getItem(CELLS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const cells = parsed.filter(
      (c): c is Cell =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as Cell).id === 'number' &&
        typeof (c as Cell).latex === 'string',
    );
    if (cells.length === 0) return null;
    return { cells, maxId: Math.max(...cells.map((c) => c.id)) };
  } catch {
    return null;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Cell[] | undefined;

function flushCells(): void {
  clearTimeout(timer);
  timer = undefined;
  if (pending === undefined) return;
  const snapshot = pending.map((c) => ({ id: c.id, latex: c.latex }));
  pending = undefined;
  try {
    storage()?.setItem(CELLS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or disabled — keep running in memory only.
  }
}

// Debounced trailing-edge write. Called from the store's mutating
// methods, so it must stay cheap: it only schedules; the stringify +
// setItem happen at most once per DEBOUNCE_MS after edits settle.
export function persistCells(cells: Cell[]): void {
  if (typeof window === 'undefined') return;
  pending = cells;
  clearTimeout(timer);
  timer = setTimeout(flushCells, DEBOUNCE_MS);
}

// Tab close / backgrounding must not drop the last <300ms of typing.
let flushListenerInstalled = false;
export function installFlushOnHide(): void {
  if (typeof window === 'undefined' || flushListenerInstalled) return;
  flushListenerInstalled = true;
  window.addEventListener('pagehide', flushCells);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushCells();
  });
}
