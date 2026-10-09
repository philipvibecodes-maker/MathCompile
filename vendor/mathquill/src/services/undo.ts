/***************************************************
 * MATHCOMPILE: undo/redo history.
 *
 * Snapshot stack per editable field: each entry is the serialized
 * latex plus a caret path (child indices from the root to the caret's
 * block, then the caret's offset among that block's children). The
 * after-change signal is ControllerBase.handle('edit') — the last
 * handler the root reflow fires once a mutation lands — which routes
 * here via noteEdited() (see controller.ts).
 *
 * Consecutive edits within ~1s coalesce into one undo step; a caret
 * move or selection ends the burst early (notify hook below). A
 * programmatic latex() — hydration, setValue, or an undo/redo restore —
 * suspends and rebases the history so it never becomes an undo step.
 **************************************************/

type UndoEntry = {
  latex: string;
  caret: number[];
};

// index of `node` among its parent's children (left-sibling count)
function childIndex(node: MQNode): number {
  var i = 0;
  for (var s = node.parent.getEnd(L); s && s !== node; s = s[R]) i++;
  return i;
}

// [i0..ik, offset]: indices descending from the root to the caret's
// block, then the caret's left-sibling count within that block.
function caretPath(cursor: Cursor): number[] {
  var offset = 0;
  for (var n = cursor[L]; n; n = n[L]) offset++;
  var path = [offset];
  for (var node = cursor.parent; node.parent; node = node.parent) {
    path.unshift(childIndex(node));
  }
  return path;
}

function nthChild(node: MQNode, index: number): NodeRef {
  var child = node.getEnd(L);
  for (var i = 0; i < index && child; i++) child = child[R];
  return child;
}

function restoreCaretPath(ctrlr: Controller, path: number[]) {
  var cursor = ctrlr.cursor;
  var block: MQNode = ctrlr.root;
  for (var i = 0; i < path.length - 1; i++) {
    var child = nthChild(block, path[i]);
    if (!child) return cursor.insAtRightEnd(ctrlr.root);
    block = child as MQNode;
  }
  var at = nthChild(block, path[path.length - 1]);
  if (at) cursor.insLeftOf(at as MQNode);
  else cursor.insAtRightEnd(block);
}

class Controller_undo extends Controller_latex {
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private lastEdit: UndoEntry | undefined;
  private burstOpen = false;
  private burstAt = 0;

  private undoSnapshot(): UndoEntry {
    return { latex: this.exportLatex(), caret: caretPath(this.cursor) };
  }

  // After-change signal (ControllerBase.handle('edit')). The stack
  // keeps the state *before* each change: on the first edit of a burst
  // the previous baseline is pushed; later edits in the burst only
  // advance the baseline.
  noteEdited() {
    if (this.suspendHistory) return;
    var cur = this.undoSnapshot();
    var last = this.lastEdit;
    if (!last || cur.latex === last.latex) {
      this.lastEdit = cur;
      return;
    }
    var now = Date.now();
    if (!this.burstOpen || now - this.burstAt > 1000) {
      this.undoStack.push(last);
      this.redoStack.length = 0;
    }
    this.lastEdit = cur;
    this.burstAt = now;
    this.burstOpen = true;
  }

  // Programmatic latex() calls (load, hydration, undo/redo restore)
  // rebase silently instead of pushing a step. renderLatexMath wraps
  // itself in suspendHistory, so this runs after the render lands.
  rebaseHistory() {
    this.lastEdit = this.undoSnapshot();
    this.burstOpen = false;
  }

  breakUndoBurst() {
    this.burstOpen = false;
  }

  undo() {
    var entry = this.undoStack.pop();
    if (!entry) {
      this.aria.alert('nothing to undo');
      return;
    }
    this.burstOpen = false;
    if (this.lastEdit) this.redoStack.push(this.lastEdit);
    this.restoreHistoryEntry(entry);
    this.aria.alert('undone');
  }

  redo() {
    var entry = this.redoStack.pop();
    if (!entry) {
      this.aria.alert('nothing to redo');
      return;
    }
    this.burstOpen = false;
    if (this.lastEdit) this.undoStack.push(this.lastEdit);
    this.restoreHistoryEntry(entry);
    this.aria.alert('redone');
  }

  private restoreHistoryEntry(entry: UndoEntry) {
    this.suspendHistory++;
    try {
      this.renderLatexMath(entry.latex);
    } finally {
      this.suspendHistory--;
    }
    this.lastEdit = entry;
    restoreCaretPath(this.getControllerSelf(), entry.caret);
    this.cursor.show();
  }
}

ControllerBase.onNotify(function (cursor: Cursor, e: ControllerEvent) {
  // A caret move or selection ends the edit-coalescing window.
  if (e === 'move' || e === 'select' || e === 'upDown')
    cursor.controller.breakUndoBurst();
});
