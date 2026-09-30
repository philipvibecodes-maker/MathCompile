import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CELLS_STORAGE_KEY,
  loadCells,
  loadPrefs,
  persistCells,
  PREFS_STORAGE_KEY,
  savePrefs,
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
  it('debounces writes to a single setItem after edits settle', () => {
    const { fake } = stubStorage();
    vi.useFakeTimers();
    const cells = [{ id: 1, latex: 'a' }];
    persistCells(cells);
    persistCells(cells);
    persistCells(cells);
    expect(fake.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fake.setItem).toHaveBeenCalledTimes(1);
    expect(fake.setItem).toHaveBeenCalledWith(
      CELLS_STORAGE_KEY,
      JSON.stringify(cells),
    );
  });

  it('snapshots at flush time so trailing mutations are captured', () => {
    const { fake } = stubStorage();
    vi.useFakeTimers();
    const cells = [{ id: 1, latex: 'a' }];
    persistCells(cells);
    cells[0].latex = 'b';
    vi.advanceTimersByTime(300);
    expect(fake.setItem).toHaveBeenCalledWith(
      CELLS_STORAGE_KEY,
      JSON.stringify([{ id: 1, latex: 'b' }]),
    );
  });

  it('no-ops without a window', () => {
    vi.useFakeTimers();
    expect(() => {
      persistCells([{ id: 1, latex: 'a' }]);
      vi.advanceTimersByTime(1000);
    }).not.toThrow();
  });
});

describe('prefs', () => {
  it('round-trips smartMode, target, and guideOpen', () => {
    stubStorage();
    savePrefs({ smartMode: false, target: 'latex', guideOpen: false });
    expect(loadPrefs()).toEqual({
      smartMode: false,
      target: 'latex',
      guideOpen: false,
    });
  });

  it('ignores invalid values', () => {
    stubStorage({
      [PREFS_STORAGE_KEY]: JSON.stringify({
        smartMode: 'yes',
        target: 'cobol',
        guideOpen: 'nope',
      }),
    });
    expect(loadPrefs()).toEqual({
      smartMode: undefined,
      target: undefined,
      guideOpen: undefined,
    });
  });

  it('returns {} on corrupt JSON', () => {
    stubStorage({ [PREFS_STORAGE_KEY]: 'nope' });
    expect(loadPrefs()).toEqual({});
  });
});
