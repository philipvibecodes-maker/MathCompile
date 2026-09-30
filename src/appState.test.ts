import { describe, expect, it } from 'vitest';
import { AppStore } from './appState.svelte.ts';

// Cell-list operations are DOM-free: focusCell just updates focusedId when
// no field handle is registered for the id.
describe('app store', () => {
  it('starts with a single focused empty cell', () => {
    const s = new AppStore();
    expect(s.cells).toHaveLength(1);
    expect(s.cells[0].latex).toBe('');
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
