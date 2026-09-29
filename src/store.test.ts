import { describe, expect, it } from 'vitest';
import { createAppStore } from './store';

// Cell-list operations are DOM-free: focusCell just updates focusedId when
// no field handle is registered for the id.
describe('app store', () => {
  it('starts with a single focused empty cell', () => {
    const s = createAppStore();
    expect(s.exprs).toHaveLength(1);
    expect(s.exprs[0].latex).toBe('');
    expect(s.focusedId()).toBe(s.exprs[0].id);
  });

  it('addExpr appends a focused empty cell', () => {
    const s = createAppStore();
    const id = s.addExpr();
    expect(s.exprs).toHaveLength(2);
    expect(s.exprs[1].id).toBe(id);
    expect(s.exprs[1].latex).toBe('');
    expect(s.focusedId()).toBe(id);
  });

  it('addExpr(afterId) inserts directly below that cell', () => {
    const s = createAppStore();
    const first = s.exprs[0].id;
    s.updateExpr(first, 'a');
    s.addExpr();
    s.updateExpr(s.exprs[1].id, 'b');
    const mid = s.addExpr(first);
    expect(s.exprs.map((e) => e.latex)).toEqual(['a', '', 'b']);
    expect(s.exprs[1].id).toBe(mid);
    expect(s.focusedId()).toBe(mid);
  });

  it('addExpr with an unknown afterId inserts at the top', () => {
    const s = createAppStore();
    s.updateExpr(s.exprs[0].id, 'a');
    s.addExpr(-999);
    expect(s.exprs.map((e) => e.latex)).toEqual(['', 'a']);
  });

  it('updateExpr only changes that cell', () => {
    const s = createAppStore();
    s.addExpr();
    s.updateExpr(s.exprs[0].id, 'x+y');
    expect(s.exprs.map((e) => e.latex)).toEqual(['x+y', '']);
  });

  it('removeExpr removes only that cell', () => {
    const s = createAppStore();
    const a = s.exprs[0].id;
    const b = s.addExpr();
    s.updateExpr(a, 'a');
    s.updateExpr(b, 'b');
    s.removeExpr(a);
    expect(s.exprs.map((e) => e.latex)).toEqual(['b']);
  });

  it('removing the last remaining cell clears it instead', () => {
    const s = createAppStore();
    s.updateExpr(s.exprs[0].id, 'x+y');
    s.removeExpr(s.exprs[0].id);
    expect(s.exprs).toHaveLength(1);
    expect(s.exprs[0].latex).toBe('');
  });

  it('duplicateExpr copies the cell directly below it and focuses the copy', () => {
    const s = createAppStore();
    const a = s.exprs[0].id;
    s.updateExpr(a, 'x+1');
    s.duplicateExpr(a);
    expect(s.exprs.map((e) => e.latex)).toEqual(['x+1', 'x+1']);
    expect(s.exprs[1].id).not.toBe(a);
    expect(s.focusedId()).toBe(s.exprs[1].id);
  });

  it('deleteFocused removes the focused cell and focuses the next one', () => {
    const s = createAppStore();
    const a = s.exprs[0].id;
    s.updateExpr(a, 'a');
    const b = s.addExpr();
    s.updateExpr(b, 'b');
    // b is focused; deleting it falls back to the previous cell.
    s.deleteFocused();
    expect(s.exprs.map((e) => e.id)).toEqual([a]);
    expect(s.focusedId()).toBe(a);
  });

  it('clearAll leaves a single empty focused cell', () => {
    const s = createAppStore();
    s.addExpr();
    s.addExpr();
    s.updateExpr(s.exprs[0].id, 'a');
    s.clearAll();
    expect(s.exprs).toHaveLength(1);
    expect(s.exprs[0].latex).toBe('');
    expect(s.focusedId()).toBe(s.exprs[0].id);
  });

  it('moveOut up at the first cell is a no-op; down past the last appends', () => {
    const s = createAppStore();
    const a = s.exprs[0].id;
    s.moveOut(a, 'up');
    expect(s.exprs).toHaveLength(1);
    expect(s.focusedId()).toBe(a);
    s.moveOut(a, 'down');
    expect(s.exprs).toHaveLength(2);
    expect(s.focusedId()).toBe(s.exprs[1].id);
  });

  it('moveOut hops to the adjacent cell', () => {
    const s = createAppStore();
    const a = s.exprs[0].id;
    const b = s.addExpr();
    s.moveOut(b, 'up');
    expect(s.focusedId()).toBe(a);
    s.moveOut(a, 'down');
    expect(s.focusedId()).toBe(b);
  });

  it('toggles target and option signals', () => {
    const s = createAppStore();
    s.setTarget('glsl');
    expect(s.target()).toBe('glsl');
    s.setDIsDerivative(false);
    expect(s.dIsDerivative()).toBe(false);
    s.setSmartMode(true);
    expect(s.smartMode()).toBe(true);
    s.setPaletteOpen(true);
    expect(s.paletteOpen()).toBe(true);
  });
});
