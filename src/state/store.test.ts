import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStore } from './store.svelte';
import {
  flushPendingCells,
  WORKBOOK_STORAGE_KEY,
  type Workbook,
} from './persistence';

// Same minimal Storage stub as persistence.test.ts — worksheet ops that
// read the workbook back (switch, snapshot) need it.
function stubStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const fake = {
    getItem: vi.fn((k: string) => map.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void map.set(k, v)),
    removeItem: vi.fn((k: string) => void map.delete(k)),
    clear: vi.fn(() => map.clear()),
    key: vi.fn(),
    get length() {
      return map.size;
    },
  } satisfies Storage;
  vi.stubGlobal('window', { localStorage: fake });
  return { map, storage: fake };
}

const storedWorkbook = (map: Map<string, string>): Workbook =>
  JSON.parse(map.get(WORKBOOK_STORAGE_KEY) ?? '{}');

afterEach(() => {
  flushPendingCells();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('pending worksheet writes', () => {
  it('deleting the active worksheet cancels its pending timer without resurrection', () => {
    vi.useFakeTimers();
    const { map, storage } = stubStorage();
    const s = new AppStore();
    s.setLatex(s.cells[0].id, 'kept');
    const kept = s.activeWorksheetId;
    const deleted = s.createWorksheet('Delete me');
    s.setLatex(s.cells[0].id, 'pending edit');
    s.deleteWorksheet(deleted);
    const writes = storage.setItem.mock.calls.length;
    vi.advanceTimersByTime(1_000);
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
    expect(storedWorkbook(map).sheets.map((sheet) => sheet.id)).toEqual([kept]);
    expect(s.cells[0].latex).toBe('kept');
  });

  it('switching flushes recent edits and retains saved cell identities', () => {
    vi.useFakeTimers();
    const { map } = stubStorage();
    const s = new AppStore();
    const first = s.activeWorksheetId;
    const firstCell = s.cells[0].id;
    s.setLatex(firstCell, 'first edit');
    const second = s.createWorksheet();
    s.setLatex(s.cells[0].id, 'second edit');
    s.switchWorksheet(first);
    expect(s.cells[0]).toMatchObject({ id: firstCell, latex: 'first edit' });
    vi.advanceTimersByTime(1_000);
    expect(storedWorkbook(map).sheets.find((sheet) => sheet.id === second)?.cells[0].latex)
      .toBe('second edit');
  });

  it('renaming with a pending edit preserves the new name without a late write', () => {
    vi.useFakeTimers();
    const { map, storage } = stubStorage();
    const s = new AppStore();
    s.setLatex(s.cells[0].id, 'latest');
    s.renameWorksheet(s.activeWorksheetId, 'Renamed');
    const writes = storage.setItem.mock.calls.length;
    vi.advanceTimersByTime(1_000);
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
    expect(storedWorkbook(map).sheets[0]).toMatchObject({
      name: 'Renamed', cells: [{ id: s.cells[0].id, latex: 'latest' }],
    });
  });

  it('editing retains the field and cell identity without requesting focus', () => {
    const s = new AppStore();
    const first = s.cells[0].id;
    const second = s.addCell();
    const handle = {
      focus: vi.fn(), getValue: () => '', setValue: vi.fn(),
      setSmartMode: vi.fn(), lineAnchors: () => [], dispose: vi.fn(),
    };
    s.registerField(first, handle);
    expect(handle.focus).not.toHaveBeenCalled();
    const original = s.cells[0];
    s.setLatex(first, 'x + 1');
    expect(s.cells[0]).toBe(original);
    expect(s.fields.get(first)).toBe(handle);
    expect(s.focusedId).toBe(second);
    expect(handle.focus).not.toHaveBeenCalled();
  });
});

// Cell-list operations are DOM-free: focusCell just updates focusedId when
// no field handle is registered for the id.
describe('app store', () => {
  it('starts with a single focused cell with the default expression', () => {
    const s = new AppStore();
    expect(s.cells).toHaveLength(1);
    expect(s.cells[0].latex).toBe('2^n = \\sum_{i=0}^n\\binom{n}{i}');
    expect(s.focusedId).toBe(s.cells[0].id);
  });

  it('addCell appends a focused empty cell', () => {
    const s = new AppStore();
    const id = s.addCell();
    expect(s.cells).toHaveLength(2);
    expect(s.cells[1].id).toBe(id);
    expect(s.cells[1].latex).toBe('');
    expect(s.focusedId).toBe(id);
  });

  it('addCell(afterId) inserts directly below that cell', () => {
    const s = new AppStore();
    const first = s.cells[0].id;
    s.setLatex(first, 'a');
    s.addCell();
    s.setLatex(s.cells[1].id, 'b');
    const mid = s.addCell(first);
    expect(s.cells.map((e) => e.latex)).toEqual(['a', '', 'b']);
    expect(s.cells[1].id).toBe(mid);
    expect(s.focusedId).toBe(mid);
  });

  it('addCell with an unknown afterId inserts at the top', () => {
    const s = new AppStore();
    s.setLatex(s.cells[0].id, 'a');
    s.addCell(-999);
    expect(s.cells.map((e) => e.latex)).toEqual(['', 'a']);
  });

  it('setLatex only changes that cell', () => {
    const s = new AppStore();
    s.addCell();
    s.setLatex(s.cells[0].id, 'x+y');
    expect(s.cells.map((e) => e.latex)).toEqual(['x+y', '']);
  });

  it('removeCell removes only that cell', () => {
    const s = new AppStore();
    const a = s.cells[0].id;
    const b = s.addCell();
    s.setLatex(a, 'a');
    s.setLatex(b, 'b');
    s.removeCell(a);
    expect(s.cells.map((e) => e.latex)).toEqual(['b']);
  });

  it('removing the last remaining cell clears it instead', () => {
    const s = new AppStore();
    s.setLatex(s.cells[0].id, 'x+y');
    s.removeCell(s.cells[0].id);
    expect(s.cells).toHaveLength(1);
    expect(s.cells[0].latex).toBe('');
  });

  it('duplicateCell copies the cell directly below it and focuses the copy', () => {
    const s = new AppStore();
    const a = s.cells[0].id;
    s.setLatex(a, 'x+1');
    s.duplicateCell(a);
    expect(s.cells.map((e) => e.latex)).toEqual(['x+1', 'x+1']);
    expect(s.cells[1].id).not.toBe(a);
    expect(s.focusedId).toBe(s.cells[1].id);
  });

  it('deleteFocused removes the focused cell and focuses the next one', () => {
    const s = new AppStore();
    const a = s.cells[0].id;
    s.setLatex(a, 'a');
    const b = s.addCell();
    s.setLatex(b, 'b');
    // b is focused; deleting it falls back to the previous cell.
    s.deleteFocused();
    expect(s.cells.map((e) => e.id)).toEqual([a]);
    expect(s.focusedId).toBe(a);
  });

  it('clearAll leaves a single empty focused cell', () => {
    const s = new AppStore();
    s.addCell();
    s.addCell();
    s.setLatex(s.cells[0].id, 'a');
    s.clearAll();
    expect(s.cells).toHaveLength(1);
    expect(s.cells[0].latex).toBe('');
    expect(s.focusedId).toBe(s.cells[0].id);
  });

  it('moveOut up at the first cell is a no-op; down past the last appends', () => {
    const s = new AppStore();
    const a = s.cells[0].id;
    s.moveOut(a, 'up');
    expect(s.cells).toHaveLength(1);
    expect(s.focusedId).toBe(a);
    s.moveOut(a, 'down');
    expect(s.cells).toHaveLength(2);
    expect(s.focusedId).toBe(s.cells[1].id);
  });

  it('moveOut hops to the adjacent cell', () => {
    const s = new AppStore();
    const a = s.cells[0].id;
    const b = s.addCell();
    s.moveOut(b, 'up');
    expect(s.focusedId).toBe(a);
    s.moveOut(a, 'down');
    expect(s.focusedId).toBe(b);
  });

  it('a python cell keeps its source in latex and wraps it as PythonSource json', () => {
    const s = new AppStore();
    const id = s.addPythonCell();
    s.setLatex(id, 'def relu(x):\n    return x');
    expect(s.cells[1].kind).toBe('python');
    expect(s.cells[1].json).toEqual([
      'PythonSource',
      'def relu(x):\n    return x',
    ]);
  });

  it('setCellKind flips the editor and reparses the source', () => {
    const s = new AppStore();
    s.setLatex(s.cells[0].id, 'x + 1');
    s.setCellKind(s.cells[0].id, 'python');
    expect(s.cells[0].kind).toBe('python');
    expect(s.cells[0].json).toEqual(['PythonSource', 'x + 1']);
    s.setCellKind(s.cells[0].id, 'math');
    expect(s.cells[0].kind).toBe('math');
    expect(s.cells[0].json).toEqual(['Add', 'x', 1]);
  });

  it('duplicateCell preserves the python kind', () => {
    const s = new AppStore();
    s.addPythonCell();
    s.duplicateCell(s.cells[1].id);
    expect(s.cells.map((c) => c.kind)).toEqual(['math', 'python', 'python']);
  });

  it('a python cell round-trips its kind through workbook storage', () => {
    const { map } = stubStorage();
    const s = new AppStore();
    s.addPythonCell();
    s.setLatex(s.cells[1].id, 'def f(x):\n    return x');
    flushPendingCells();
    expect(storedWorkbook(map).sheets[0].cells[1].kind).toBe('python');
    const again = new AppStore();
    expect(again.cells.map((c) => c.kind)).toEqual(['math', 'python']);
    expect(again.cells[1].json).toEqual([
      'PythonSource',
      'def f(x):\n    return x',
    ]);
  });

  it('importWorksheet keeps imported cell kinds', () => {
    stubStorage();
    const s = new AppStore();
    s.importWorksheet('Imported', [
      { id: 1, latex: 'z' },
      { id: 2, latex: 'def f(x): return x', kind: 'python' },
    ]);
    expect(s.cells.map((c) => c.kind)).toEqual(['math', 'python']);
  });

  it('worksheetSnapshot carries cell kind for export', () => {
    stubStorage();
    const s = new AppStore();
    s.addPythonCell();
    s.setLatex(s.cells[1].id, 'def f(x): return x');
    const snap = s.worksheetSnapshot();
    expect(snap?.cells[1]).toEqual({
      id: s.cells[1].id,
      latex: 'def f(x): return x',
      kind: 'python',
    });
  });

  it('toggles option state and the palette', () => {
    const s = new AppStore();
    s.target = 'glsl';
    expect(s.target).toBe('glsl');
    s.smartMode = true;
    expect(s.smartMode).toBe(true);
    s.openPalette();
    expect(s.paletteOpen).toBe(true);
    s.closePalette();
    expect(s.paletteOpen).toBe(false);
  });
});

describe('worksheets', () => {
  it('starts on one "Worksheet 1" and restores the active sheet', () => {
    const { map } = stubStorage();
    const s = new AppStore();
    expect(s.worksheets).toHaveLength(1);
    expect(s.worksheets[0].name).toBe('Worksheet 1');
    // Nothing is written until the first edit persists.
    expect(map.has(WORKBOOK_STORAGE_KEY)).toBe(false);
    s.setLatex(s.cells[0].id, 'x');
    flushPendingCells();
    const id = storedWorkbook(map).active;
    const again = new AppStore();
    expect(again.activeWorksheetId).toBe(id);
    expect(again.cells.map((c) => c.latex)).toEqual(['x']);
  });

  it('createWorksheet adds a named blank sheet and switches to it', () => {
    stubStorage();
    const s = new AppStore();
    s.setLatex(s.cells[0].id, 'x');
    const id = s.createWorksheet();
    expect(s.worksheets.map((w) => w.name)).toEqual([
      'Worksheet 1',
      'Worksheet 2',
    ]);
    expect(s.activeWorksheetId).toBe(id);
    expect(s.cells).toHaveLength(1);
    expect(s.cells[0].latex).toBe('');
    expect(s.focusedId).toBe(s.cells[0].id);
  });

  it('switchWorksheet keeps each sheet\'s cells', () => {
    stubStorage();
    const s = new AppStore();
    const first = s.worksheets[0].id;
    s.setLatex(s.cells[0].id, 'a');
    s.createWorksheet();
    s.setLatex(s.cells[0].id, 'b');
    s.switchWorksheet(first);
    expect(s.cells.map((c) => c.latex)).toEqual(['a']);
    s.switchWorksheet(s.worksheets[1].id);
    expect(s.cells.map((c) => c.latex)).toEqual(['b']);
  });

  it('renameWorksheet updates the meta and the stored sheet', () => {
    const { map } = stubStorage();
    const s = new AppStore();
    s.setLatex(s.cells[0].id, 'x');
    s.renameWorksheet(s.worksheets[0].id, '  derivations  ');
    expect(s.worksheets[0].name).toBe('derivations');
    flushPendingCells();
    expect(storedWorkbook(map).sheets[0].name).toBe('derivations');
    // Blank names are ignored.
    s.renameWorksheet(s.worksheets[0].id, '   ');
    expect(s.worksheets[0].name).toBe('derivations');
  });

  it('deleteWorksheet removes the sheet and moves off an active delete', () => {
    stubStorage();
    const s = new AppStore();
    const first = s.worksheets[0].id;
    s.setLatex(s.cells[0].id, 'a');
    const second = s.createWorksheet();
    s.setLatex(s.cells[0].id, 'b');
    s.deleteWorksheet(second);
    expect(s.worksheets.map((w) => w.id)).toEqual([first]);
    expect(s.activeWorksheetId).toBe(first);
    expect(s.cells.map((c) => c.latex)).toEqual(['a']);
    // The last remaining sheet can't be deleted.
    s.deleteWorksheet(first);
    expect(s.worksheets).toHaveLength(1);
  });

  it('importWorksheet opens a file as a new sheet and remaps cell ids', () => {
    const { map } = stubStorage();
    const s = new AppStore();
    s.setLatex(s.cells[0].id, 'a');
    s.importWorksheet('Imported', [
      { id: 1, latex: 'z' },
      { id: 2, latex: 'w' },
    ]);
    expect(s.worksheets).toHaveLength(2);
    expect(s.activeWorksheetId).toBe(s.worksheets[1].id);
    expect(s.cells.map((c) => c.latex)).toEqual(['z', 'w']);
    // Remapped ids can't collide with the first sheet's ids.
    const firstIds = s.worksheets[0].id;
    s.switchWorksheet(firstIds);
    const existing = new Set(s.cells.map((c) => c.id));
    s.switchWorksheet(s.worksheets[1].id);
    expect(s.cells.every((c) => !existing.has(c.id))).toBe(true);
    flushPendingCells();
    expect(storedWorkbook(map).sheets[1].cells.map((c) => c.latex)).toEqual([
      'z',
      'w',
    ]);
  });

  it('importWorksheet dedupes a name that already exists', () => {
    stubStorage();
    const s = new AppStore();
    s.importWorksheet('Worksheet 1', [{ id: 1, latex: 'z' }]);
    expect(s.worksheets[1].name).toBe('Worksheet 1 (2)');
  });

  it('worksheetSnapshot returns the active sheet\'s live cells', () => {
    stubStorage();
    const s = new AppStore();
    s.setLatex(s.cells[0].id, 'live');
    const snap = s.worksheetSnapshot();
    expect(snap?.name).toBe('Worksheet 1');
    expect(snap?.cells).toEqual([{ id: s.cells[0].id, latex: 'live' }]);
  });
});
