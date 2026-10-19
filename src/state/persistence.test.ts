import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CELLS_STORAGE_KEY,
  flushPendingCells,
  loadCells,
  loadPrefs,
  loadWorkbook,
  nextWorksheetName,
  persistCells,
  PREFS_STORAGE_KEY,
  removeStoredWorksheet,
  renameStoredWorksheet,
  savePrefs,
  setActiveWorksheet,
  uniqueWorksheetName,
  upsertWorksheet,
  WORKBOOK_STORAGE_KEY,
} from './persistence';

// Minimal Storage stub — the module only touches getItem/setItem.
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
  return { map, fake };
}

afterEach(() => {
  // Drain any scheduled debounce so it can't leak a write into the next
  // test's stubbed storage.
  flushPendingCells();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('loadCells', () => {
  it('returns null when nothing is stored', () => {
    stubStorage();
    expect(loadCells()).toBeNull();
  });

  it('returns stored cells and the max id', () => {
    stubStorage({
      [CELLS_STORAGE_KEY]: JSON.stringify([
        { id: 3, latex: 'x' },
        { id: 7, latex: 'y' },
      ]),
    });
    expect(loadCells()).toEqual({
      cells: [
        { id: 3, latex: 'x' },
        { id: 7, latex: 'y' },
      ],
      maxId: 7,
    });
  });

  it('returns null on corrupt JSON', () => {
    stubStorage({ [CELLS_STORAGE_KEY]: '{oops' });
    expect(loadCells()).toBeNull();
  });

  it('drops malformed entries and returns null if none survive', () => {
    stubStorage({
      [CELLS_STORAGE_KEY]: JSON.stringify([{ id: 'x' }, { latex: 1 }]),
    });
    expect(loadCells()).toBeNull();
    stubStorage({
      [CELLS_STORAGE_KEY]: JSON.stringify([{ id: 'x' }, { id: 2, latex: 'a' }]),
    });
    expect(loadCells()?.cells).toEqual([{ id: 2, latex: 'a' }]);
  });
});

describe('persistCells', () => {
  const sheet = { id: 'a', name: 'Worksheet 1' };

  it('debounces writes to a single setItem after edits settle', () => {
    const { fake } = stubStorage();
    vi.useFakeTimers();
    const cells = [{ id: 1, latex: 'a' }];
    persistCells(sheet, cells);
    persistCells(sheet, cells);
    persistCells(sheet, cells);
    expect(fake.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fake.setItem).toHaveBeenCalledTimes(1);
    expect(fake.setItem).toHaveBeenCalledWith(
      WORKBOOK_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        active: 'a',
        sheets: [{ id: 'a', name: 'Worksheet 1', cells: [{ id: 1, latex: 'a' }] }],
      }),
    );
  });

  it('snapshots at flush time so trailing mutations are captured', () => {
    const { fake } = stubStorage();
    vi.useFakeTimers();
    const cells = [{ id: 1, latex: 'a' }];
    persistCells(sheet, cells);
    cells[0].latex = 'b';
    vi.advanceTimersByTime(300);
    expect(fake.setItem).toHaveBeenCalledWith(
      WORKBOOK_STORAGE_KEY,
      expect.stringContaining('"latex":"b"'),
    );
  });

  it('writes into the named sheet, not the active one', () => {
    const { fake } = stubStorage({
      [WORKBOOK_STORAGE_KEY]: JSON.stringify({
        version: 1,
        active: 'b',
        sheets: [
          { id: 'a', name: 'A', cells: [] },
          { id: 'b', name: 'B', cells: [{ id: 1, latex: 'z' }] },
        ],
      }),
    });
    vi.useFakeTimers();
    persistCells({ id: 'a', name: 'A' }, [{ id: 2, latex: 'x' }]);
    vi.advanceTimersByTime(300);
    const wb = JSON.parse(fake.setItem.mock.lastCall?.[1] ?? '{}');
    expect(wb.sheets.find((s: { id: string }) => s.id === 'a').cells).toEqual([
      { id: 2, latex: 'x' },
    ]);
    expect(wb.sheets.find((s: { id: string }) => s.id === 'b').cells).toEqual([
      { id: 1, latex: 'z' },
    ]);
    expect(wb.active).toBe('b');
  });

  it('flushPendingCells forces a pending write before a structural op', () => {
    stubStorage();
    persistCells(sheet, [{ id: 1, latex: 'a' }]);
    flushPendingCells();
    expect(loadWorkbook()?.sheets[0].cells).toEqual([{ id: 1, latex: 'a' }]);
  });

  it('no-ops without a window', () => {
    vi.useFakeTimers();
    expect(() => {
      persistCells(sheet, [{ id: 1, latex: 'a' }]);
      vi.advanceTimersByTime(1000);
      flushPendingCells();
    }).not.toThrow();
  });
});

describe('workbook', () => {
  it('returns null when nothing is stored', () => {
    stubStorage();
    expect(loadWorkbook()).toBeNull();
  });

  it('migrates the legacy cells key into a first worksheet', () => {
    const { map } = stubStorage({
      [CELLS_STORAGE_KEY]: JSON.stringify([
        { id: 3, latex: 'x' },
        { id: 7, latex: 'y' },
      ]),
    });
    const wb = loadWorkbook();
    expect(wb?.sheets).toHaveLength(1);
    expect(wb?.sheets[0].name).toBe('Worksheet 1');
    expect(wb?.sheets[0].cells).toEqual([
      { id: 3, latex: 'x' },
      { id: 7, latex: 'y' },
    ]);
    expect(wb?.active).toBe(wb?.sheets[0].id);
    // The migration writes the workbook back and drops the legacy key.
    expect(map.has(WORKBOOK_STORAGE_KEY)).toBe(true);
    expect(map.has(CELLS_STORAGE_KEY)).toBe(false);
  });

  it('ignores a corrupt workbook document', () => {
    stubStorage({ [WORKBOOK_STORAGE_KEY]: '{oops' });
    expect(loadWorkbook()).toBeNull();
  });

  it('drops malformed sheets and repairs a dangling active id', () => {
    stubStorage({
      [WORKBOOK_STORAGE_KEY]: JSON.stringify({
        version: 1,
        active: 'gone',
        sheets: [
          { name: 'no id' },
          { id: 'b', name: 'B', cells: [{ id: 1, latex: 'x' }] },
        ],
      }),
    });
    const wb = loadWorkbook();
    expect(wb?.sheets.map((s) => s.id)).toEqual(['b']);
    expect(wb?.active).toBe('b');
  });

  it('upsert/rename/remove/setActive mutate the document', () => {
    stubStorage();
    upsertWorksheet({ id: 'a', name: 'A', cells: [{ id: 1, latex: 'x' }] });
    upsertWorksheet({ id: 'b', name: 'B', cells: [] });
    setActiveWorksheet('b');
    renameStoredWorksheet('a', 'Renamed');
    let wb = loadWorkbook();
    expect(wb?.active).toBe('b');
    expect(wb?.sheets.map((s) => s.name)).toEqual(['Renamed', 'B']);
    removeStoredWorksheet('b');
    wb = loadWorkbook();
    expect(wb?.sheets.map((s) => s.id)).toEqual(['a']);
    // Removing the active sheet repairs `active` to a real sheet.
    expect(wb?.active).toBe('a');
  });

  it('names new worksheets with the smallest free N and dedupes imports', () => {
    expect(nextWorksheetName([{ name: 'Worksheet 1' }])).toBe('Worksheet 2');
    expect(
      nextWorksheetName([{ name: 'Worksheet 1' }, { name: 'Worksheet 3' }]),
    ).toBe('Worksheet 2');
    expect(
      uniqueWorksheetName('Imported', [{ name: 'Imported' }]),
    ).toBe('Imported (2)');
  });
});

describe('prefs', () => {
  it('round-trips all prefs', () => {
    stubStorage();
    savePrefs({
      smartMode: false,
      target: 'latex',
      guideOpen: false,
      pinnedHelp: ['solve', 'cases'],
      hiddenHelp: ['greek'],
      showPlumbing: true,
      importAll: false,
      pairTuple: 'matrix',
      fadeMs: 150,
      debounceMs: 600,
      fadeInMs: 150,
      fadeOutMs: 150,
    });
    expect(loadPrefs()).toEqual({
      smartMode: false,
      target: 'latex',
      guideOpen: false,
      pinnedHelp: ['solve', 'cases'],
      hiddenHelp: ['greek'],
      showPlumbing: true,
      importAll: false,
      pairTuple: 'matrix',
      fadeMs: 150,
      debounceMs: 600,
      fadeInMs: 150,
      fadeOutMs: 150,
    });
  });

  it('ignores invalid values', () => {
    stubStorage({
      [PREFS_STORAGE_KEY]: JSON.stringify({
        smartMode: 'yes',
        target: 'cobol',
        guideOpen: 'nope',
        pinnedHelp: 'solve',
        hiddenHelp: [1, 'greek'],
        showPlumbing: 42,
        pairTuple: 'tuple',
      }),
    });
    expect(loadPrefs()).toEqual({
      smartMode: undefined,
      target: undefined,
      guideOpen: undefined,
      pinnedHelp: undefined,
      hiddenHelp: ['greek'],
      showPlumbing: undefined,
      importAll: undefined,
      pairTuple: undefined,
    });
  });

  it('returns {} on corrupt JSON', () => {
    stubStorage({ [PREFS_STORAGE_KEY]: 'nope' });
    expect(loadPrefs()).toEqual({});
  });
});
