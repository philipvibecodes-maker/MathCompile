import type { StoredCell } from './persistence';

// Worksheet files keep math out of localStorage: a JSON document the app
// downloads and reads back. `kind`/`version` leave room for future
// payload types; parse also accepts a bare cells array and any {cells}
// object so hand-written or older files still open.
export const WORKSHEET_FILE_SUFFIX = '.mathcompile.json';

export interface WorksheetFile {
  name?: string;
  cells: StoredCell[];
}

export function serializeWorksheet(name: string, cells: StoredCell[]): string {
  return JSON.stringify(
    { app: 'mathcompile', kind: 'worksheet', version: 1, name, cells },
    null,
    2,
  );
}

const isStoredCell = (c: unknown): c is StoredCell =>
  typeof c === 'object' &&
  c !== null &&
  typeof (c as StoredCell).id === 'number' &&
  typeof (c as StoredCell).latex === 'string';

export function parseWorksheetFile(text: string): WorksheetFile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const cellsRaw = Array.isArray(parsed)
    ? parsed
    : (parsed as WorksheetFile | null)?.cells;
  if (!Array.isArray(cellsRaw)) return null;
  const cells = cellsRaw.filter(isStoredCell);
  if (cells.length === 0) return null;
  const name =
    typeof parsed === 'object' &&
    parsed !== null &&
    typeof (parsed as WorksheetFile).name === 'string'
      ? (parsed as WorksheetFile).name
      : undefined;
  return { name, cells };
}

// The name a sheet gets from an opened file: the file's basename with
// the .mathcompile.json (or bare .json) suffix stripped, so the name in
// the worksheet dropdown matches the name in the file manager — a
// renamed file renames the sheet. The embedded `name` is only a
// fallback for files whose stem carries nothing usable.
export function worksheetNameFromFile(
  fileName: string,
  embedded?: string,
): string {
  const stem = fileName
    .replace(/\.mathcompile\.json$/i, '')
    .replace(/\.json$/i, '')
    .trim();
  return stem || embedded?.trim() || 'Imported';
}

export function worksheetFileName(name: string): string {
  const base =
    name
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'worksheet';
  return `${base}${WORKSHEET_FILE_SUFFIX}`;
}

// DOM-free callers get the serialized text; this is the only browser bit.
export function downloadWorksheetFile(
  name: string,
  cells: StoredCell[],
): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([serializeWorksheet(name, cells)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = worksheetFileName(name);
  a.click();
  URL.revokeObjectURL(url);
}

export interface PickedWorksheet {
  name: string;
  cells: StoredCell[];
}

// Read + parse a File into an importable sheet; the display name comes
// from the file name (see worksheetNameFromFile).
export async function readWorksheetFile(
  file: File,
): Promise<PickedWorksheet | null> {
  const parsed = parseWorksheetFile(await file.text());
  if (!parsed) return null;
  return {
    name: worksheetNameFromFile(file.name, parsed.name),
    cells: parsed.cells,
  };
}

// Opens the OS file picker with a throwaway input — the command palette
// has no persistent input element to reuse. Resolves null on cancel or
// an unparseable file.
export function pickWorksheetFile(): Promise<PickedWorksheet | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      resolve(file ? await readWorksheetFile(file) : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
