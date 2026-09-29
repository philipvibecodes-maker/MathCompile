// ============================================================================
// MATHCOMPILE local patch (see vendor/README.md)
//
// \begin{matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix}..\end{..}
// environments and \displaylines{a\\ b}, plus the \derivative template
// command and the mqInsertRowBreak() row-split helper.
//
// The matrix implementation is a port of the abandoned jQuery-era
// Learnosity/mathquill `matrix` branch (upstream mathquill/mathquill#762)
// onto this fork's TypeScript tree/DOM APIs (MathBlock, h.block,
// DOMFragment, adopt/disown). Enter/Shift-Space in a cell grow rows/columns;
// the app's Shift-Enter new-cell shortcut is intercepted before MQ sees it.
// ============================================================================

const MATRIX_COL_DELIM = '&';
const MATRIX_ROW_DELIM = '\\\\';

const MQEnvironments: { [env: string]: () => Matrix } = {};

function matrixParen(ch: string, side: Direction): HTMLElement {
  const sym = (
    SVG_SYMBOLS as Record<string, { width: string; html: () => ChildNode }>
  )[ch] || {
    width: '0',
    html: () => h.text(ch)
  };
  return h(
    'span',
    {
      class: 'mq-scaled mq-paren mq-bracket-' + (side === L ? 'l' : 'r'),
      style: 'width:' + sym.width
    },
    [sym.html()]
  ) as HTMLElement;
}

// A MathBlock that knows which matrix row it belongs to and adds
// matrix-specific keyboard handling.
class MatrixCell extends MathBlock {
  row = 0;

  constructor(row: number, parent?: MQNode, replaces?: MathBlock[]) {
    super();
    this.row = row;
    if (parent) {
      this.adopt(parent, parent.getEnd(R), 0);
    }
    if (replaces) {
      for (let i = 0; i < replaces.length; i += 1) {
        replaces[i].children().adopt(this, this.getEnd(R), 0);
      }
    }
  }

  keystroke(key: string, e: KeyboardEvent | undefined, ctrlr: Controller) {
    switch (key) {
      case 'Shift-Spacebar':
        e?.preventDefault();
        (this.parent as unknown as Matrix).insert('addColumn', this, ctrlr);
        return;
      case 'Enter':
        e?.preventDefault();
        (this.parent as unknown as Matrix).insert('addRow', this, ctrlr);
        return;
      case 'Shift-Enter':
        // app-level new-cell shortcut; the app intercepts the keydown before
        // MQ's textarea sees it, but swallow it here too so no stray '\n'
        // reaches the `enter` handler if one slips through.
        e?.preventDefault();
        return;
    }
    return super.keystroke(key, e, ctrlr);
  }

  // Stepping out of a cell moves to the adjacent cell; at the edge columns
  // with leftRightIntoCmdGoes configured we exit the matrix entirely.
  moveOutOf(dir: Direction, cursor: Cursor, updown?: 'up' | 'down') {
    const matrix = this.parent as unknown as Matrix;
    const atExitPoint = updown && matrix.atExitPoint(dir, cursor);
    const next = this[dir];
    if (!atExitPoint && next) {
      cursor.insAtDirEnd(-dir as Direction, next);
    } else {
      cursor.insDirOf(dir, matrix);
    }
  }

  // Backspace/Delete at a cell boundary delegates to the matrix's
  // row/column bookkeeping; when the env collapses to a single empty cell
  // the callback removes the whole environment node.
  deleteOutOf(dir: Direction, cursor: Cursor) {
    const self = this;
    (this.parent as unknown as Matrix).backspace(this, dir, cursor, () => {
      MathBlock.prototype.deleteOutOf.call(self, dir, cursor);
    });
  }
}

type MatrixEditTarget = { cell: MatrixCell; edge: Direction };

class Matrix extends MathCommand {
  environment = 'matrix';
  parens: { left: string | null; right: string | null } = {
    left: null,
    right: null
  };
  rowSize = 0;
  declare blocks: MatrixCell[];

  ariaLabel = 'matrix';

  // The latex wrapper around the delimited cell list. Plain envs wrap in
  // \begin{env}..\end{env}; DisplayLines overrides for the bare-brace form.
  latexOpen() {
    return `\\begin{${this.environment}}`;
  }
  latexClose() {
    return `\\end{${this.environment}}`;
  }

  numBlocks() {
    return this.blocks ? this.blocks.length : 0;
  }

  // Parses the matrix BODY: `a & b \\ c & d`. For \begin envs the
  // environment name and \end{env} are consumed by the \begin parser; for
  // \displaylines the braces are handled by DisplayLines.parser.
  parser(): Parser<MQNode | Fragment> {
    return this.bodyParser();
  }

  bodyParser(): Parser<MQNode> {
    const self = this;
    const optWhitespace = Parser.optWhitespace;
    const string = Parser.string;

    return optWhitespace
      .then(
        string(MATRIX_COL_DELIM)
          .or(string(MATRIX_ROW_DELIM))
          .or(latexMathParser.block)
      )
      .many()
      .skip(optWhitespace)
      .then((items) => {
        self.blocks = [];
        let row = 0;
        let pieces: MathBlock[] = [];

        function addCell() {
          self.blocks.push(new MatrixCell(row, self, pieces));
          pieces = [];
        }

        for (let i = 0; i < items.length; i += 1) {
          const item = items[i];
          if (item instanceof MathBlock) {
            pieces.push(item);
          } else {
            addCell();
            if (item === MATRIX_ROW_DELIM) row += 1;
          }
        }
        addCell();
        self.autocorrect();
        return Parser.succeed(self as MQNode);
      });
  }

  // Renders <span.mq-matrix>[paren]<table><tr><td/>..</table>[paren]</span>,
  // linking every <td> to its MatrixCell. The cell count is dynamic so we
  // build the DOM directly rather than through DOMView.
  html(): Element | DocumentFragment {
    const cells: HTMLElement[][] = [];
    let row = -1;
    this.eachChild((cell) => {
      const c = cell as MatrixCell;
      if (row !== c.row) {
        row = c.row;
        cells[row] = [];
      }
      cells[row].push(h.block('td', {}, c) as HTMLElement);
      return undefined;
    });

    const trs = cells.map((tds) => h('tr', {}, tds) as HTMLElement);
    const table = h(
      'table',
      { class: 'mq-non-leaf' + (trs.length === 1 ? ' mq-rows-1' : '') },
      trs
    ) as HTMLElement;

    const children: (HTMLElement | SVGElement)[] = [];
    if (this.parens.left) children.push(matrixParen(this.parens.left, L));
    children.push(table);
    if (this.parens.right) children.push(matrixParen(this.parens.right, R));

    const dom = h('span', { class: 'mq-matrix mq-non-leaf' }, children);
    this.setDOM(dom);
    NodeBase.linkElementByCmdNode(dom, this);
    return dom;
  }

  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);
    ctx.uncleanedLatex += this.latexOpen();
    let row = -1;
    this.eachChild((cell) => {
      const c = cell as MatrixCell;
      if (row !== -1) {
        ctx.uncleanedLatex +=
          row !== c.row ? MATRIX_ROW_DELIM : MATRIX_COL_DELIM;
      }
      row = c.row;
      c.latexRecursive(ctx);
      return undefined;
    });
    ctx.uncleanedLatex += this.latexClose();
    this.checkCursorContextClose(ctx);
  }

  finalizeTree(_options?: CursorOptions, _dir?: Direction) {
    if (!this.blocks.length) return;
    const el = this.domFrag().oneElement();
    const table = el && el.querySelector ? el.querySelector('table') : null;
    if (table) {
      table.classList.toggle(
        'mq-rows-1',
        table.querySelectorAll('tr').length === 1
      );
    }
    this.relink();
  }

  // When leftRightIntoCmdGoes is configured, vertical motion into the
  // matrix lands on the nearest row edge rather than the default end cell.
  getEntryPoint(dir: Direction, updown: 'up' | 'down'): MatrixCell {
    if (updown === 'up') {
      return dir === L ? this.blocks[this.rowSize - 1] : this.blocks[0];
    }
    return dir === L
      ? this.blocks[this.blocks.length - 1]
      : this.blocks[this.blocks.length - this.rowSize];
  }

  // Horizontal motion at the edge columns exits the matrix (used when
  // leftRightIntoCmdGoes lets arrows cross command boundaries).
  atExitPoint(dir: Direction, cursor: Cursor) {
    const i = this.blocks.indexOf(cursor.parent as MatrixCell);
    if (dir === L) {
      return i % this.rowSize === 0;
    }
    return (i + 1) % this.rowSize === 0;
  }

  moveTowards(dir: Direction, cursor: Cursor, updown?: 'up' | 'down') {
    const entryPoint = updown && this.getEntryPoint(dir, updown);
    cursor.insAtDirEnd(
      -dir as Direction,
      entryPoint || this.getEnd(-dir as Direction)
    );
  }

  // Rebuilds the doubly-linked child list and the up/down pointers from
  // this.blocks order. Called after parsing, autocorrect, and structural
  // edits; may run before the block list is wired up, so iterate the array
  // rather than the child links.
  relink() {
    const blocks = this.blocks;
    const rows: MatrixCell[][] = [];
    let row = -1;
    let column = 0;

    // One-row default; overwritten once a second row is found.
    this.rowSize = blocks.length;

    for (let i = 0; i < blocks.length; i += 1) {
      const cell = blocks[i];
      if (row !== cell.row) {
        if (cell.row === 1) {
          // just finished the first row — that was the true row size
          this.rowSize = column;
        }
        row = cell.row;
        rows[row] = [];
        column = 0;
      }
      rows[row][column] = cell;

      cell[R] = blocks[i + 1] || 0;
      cell[L] = blocks[i - 1] || 0;
      cell.upOutOf = undefined;
      cell.downOutOf = undefined;

      const above = rows[row - 1] && rows[row - 1][column];
      if (above) {
        cell.upOutOf = above;
        above.downOutOf = cell;
      }

      column += 1;
    }

    this.setEnds({ [L]: blocks[0], [R]: blocks[blocks.length - 1] });
  }

  // Pads shorter rows so every row has the same column count.
  autocorrect() {
    const blocks = this.blocks;
    const rows: MatrixCell[][] = [];
    const lengths: number[] = [];

    for (let i = 0; i < blocks.length; i += 1) {
      const cell = blocks[i];
      const r = cell.row;
      rows[r] = rows[r] || [];
      rows[r].push(cell);
      lengths[r] = rows[r].length;
    }

    const maxLength = Math.max.apply(null, lengths);
    if (maxLength !== Math.min.apply(null, lengths)) {
      for (let i = 0; i < rows.length; i += 1) {
        let shortfall = maxLength - rows[i].length;
        while (shortfall) {
          const position = maxLength * i + rows[i].length;
          blocks.splice(position, 0, new MatrixCell(i, this));
          shortfall -= 1;
        }
      }
      this.relink();
    }
  }

  // Deleting a cell also deletes its row/column when they are empty, and
  // relinks the matrix.
  deleteCell(currentCell: MatrixCell) {
    const rows: MatrixCell[][] = [];
    const columns: MatrixCell[][] = [];
    let myRow: MatrixCell[] = [];
    let myColumn: MatrixCell[] = [];
    const blocks = this.blocks;
    let row = -1;
    let column = 0;

    this.eachChild((cell) => {
      const c = cell as MatrixCell;
      if (row !== c.row) {
        row = c.row;
        rows[row] = [];
        column = 0;
      }
      columns[column] = columns[column] || [];
      columns[column].push(c);
      rows[row].push(c);

      if (c === currentCell) {
        myRow = rows[row];
        myColumn = columns[column];
      }
      column += 1;
      return undefined;
    });

    function allEmpty(cells: MatrixCell[]) {
      for (let i = 0; i < cells.length; i += 1) {
        if (!cells[i].isEmpty()) return false;
      }
      return true;
    }

    const removeCells = (cells: MatrixCell[]) => {
      for (let i = 0; i < cells.length; i += 1) {
        const idx = blocks.indexOf(cells[i]);
        if (idx > -1) {
          cells[i].remove();
          blocks.splice(idx, 1);
        }
      }
    };

    if (allEmpty(myRow) && myColumn.length > 1) {
      const removedRow = rows.indexOf(myRow);
      this.eachChild((cell) => {
        const c = cell as MatrixCell;
        if (c.row > removedRow) c.row -= 1;
        return undefined;
      });
      removeCells(myRow);
      const el = this.domFrag().oneElement();
      const table = el && el.querySelector ? el.querySelector('table') : null;
      const tr = table && table.rows[removedRow];
      if (tr) tr.remove();
    }
    if (allEmpty(myColumn) && myRow.length > 1) {
      removeCells(myColumn);
    }
    this.finalizeTree();
  }

  // Inserts an empty row below `afterCell`'s row; the caret lands on the new
  // cell under the same column. DisplayLines overrides this to split the
  // line at the caret instead.
  addRow(afterCell: MatrixCell, _ctrlr: Controller): MatrixEditTarget {
    const previous: MatrixCell[] = [];
    const newCells: MatrixCell[] = [];
    const next: MatrixCell[] = [];
    const row = afterCell.row;
    let columns = 0;
    let column = 0;

    this.eachChild((cell) => {
      const c = cell as MatrixCell;
      if (c.row <= row) previous.push(c);
      if (c.row === row) {
        if (c === afterCell) column = columns;
        columns += 1;
      }
      if (c.row > row) {
        c.row += 1;
        next.push(c);
      }
      return undefined;
    });

    const newRowTds: HTMLElement[] = [];
    for (let i = 0; i < columns; i += 1) {
      const block = new MatrixCell(row + 1);
      block.parent = this;
      newCells.push(block);
      newRowTds.push(h.block('td', { class: 'mq-empty' }, block) as HTMLElement);
    }
    const newRow = h('tr', {}, newRowTds) as HTMLElement;

    const el = this.domFrag().oneElement();
    const table = el && el.querySelector ? el.querySelector('table') : null;
    const tr = table && table.rows[row];
    if (tr) tr.after(newRow);

    this.blocks = previous.concat(newCells, next);
    return { cell: newCells[column], edge: R };
  }

  // Inserts an empty column to the right of `afterCell`'s column; the caret
  // lands on the new cell in the same row.
  addColumn(afterCell: MatrixCell, _ctrlr: Controller): MatrixEditTarget {
    const rows: MatrixCell[][] = [];
    const newCells: MatrixCell[] = [];
    let column = 0;

    this.eachChild((cell) => {
      const c = cell as MatrixCell;
      rows[c.row] = rows[c.row] || [];
      rows[c.row].push(c);
      if (c === afterCell) column = rows[c.row].length;
      return undefined;
    });

    const el = this.domFrag().oneElement();
    const table = el && el.querySelector ? el.querySelector('table') : null;

    for (let i = 0; i < rows.length; i += 1) {
      const block = new MatrixCell(i);
      block.parent = this;
      newCells.push(block);
      rows[i].splice(column, 0, block);

      const td = h.block('td', { class: 'mq-empty' }, block) as HTMLElement;
      const tr = table && table.rows[i];
      const before = tr && tr.cells[column - 1];
      if (before) before.after(td);
      else if (tr) tr.appendChild(td);
    }

    this.blocks = ([] as MatrixCell[]).concat.apply([], rows);
    return { cell: newCells[afterCell.row], edge: R };
  }

  // Structural edit entry point used by MatrixCell.keystroke.
  insert(
    method: 'addRow' | 'addColumn',
    cell: MatrixCell,
    ctrlr: Controller
  ) {
    const target = this[method](cell, ctrlr);
    this.finalizeTree();
    ctrlr.notify('edit');
    this.bubble((node) => {
      node.reflow();
      return undefined;
    });
    ctrlr.cursor.insAtDirEnd(target.edge, target.cell);
  }

  // Backspace at an empty cell boundary: drop empty rows/columns, move the
  // caret to a surviving neighbour, and delete the env node entirely when
  // it collapses to a single empty cell (or zero cells for 1-column envs).
  backspace(
    cell: MatrixCell,
    dir: Direction,
    cursor: Cursor,
    finalDeleteCallback: () => void
  ) {
    let dirwards = cell[dir];
    if (cell.isEmpty()) {
      this.deleteCell(cell);
      while (
        dirwards &&
        (dirwards as MQNode)[dir] &&
        this.blocks.indexOf(dirwards as MatrixCell) === -1
      ) {
        dirwards = (dirwards as MQNode)[dir];
      }
      if (dirwards) {
        cursor.insAtDirEnd(-dir as Direction, dirwards as MQNode);
      }
      if (
        this.blocks.length === 0 ||
        (this.blocks.length === 1 && this.blocks[0].isEmpty())
      ) {
        finalDeleteCallback();
        if (this.blocks.length > 0) this.finalizeTree();
      }
      cursor.controller.notify('edit');
      cursor.parent.bubble((node) => {
        node.reflow();
        return undefined;
      });
    }
  }
}

class DisplayLines extends Matrix {
  environment = 'displaylines';
  ctrlSeq = '\\displaylines';
  ariaLabel = 'lines';

  latexOpen() {
    return '\\displaylines{';
  }
  latexClose() {
    return '}';
  }

  // \displaylines{a\\ b}: the braces are part of the command itself.
  parser(): Parser<MQNode | Fragment> {
    const self = this;
    return Parser.string('{')
      .then(() => self.bodyParser())
      .skip(Parser.string('}'));
  }

  // One-line cells serialize as the bare line, matching MathLive's `lines`
  // environment which drops the wrapper when it has a single row.
  latexRecursive(ctx: LatexContext) {
    const rows: number[] = [];
    this.eachChild((cell) => {
      const c = cell as MatrixCell;
      if (rows.indexOf(c.row) === -1) rows.push(c.row);
      return undefined;
    });
    if (rows.length <= 1) {
      this.checkCursorContextOpen(ctx);
      this.eachChild((cell) => {
        cell.latexRecursive(ctx);
        return undefined;
      });
      this.checkCursorContextClose(ctx);
      return;
    }
    super.latexRecursive(ctx);
  }

  // Enter in a lines cell splits the row at the caret: content right of the
  // caret moves into the new row's cell and the caret stays before it.
  addRow(afterCell: MatrixCell, ctrlr: Controller): MatrixEditTarget {
    const cursor = ctrlr.cursor;
    const target = super.addRow(afterCell, ctrlr);
    const newCell = target.cell;
    if (cursor.parent === (afterCell as unknown as MQNode)) {
      const tailStart = cursor[R];
      const tailEnd = afterCell.getEnd(R);
      if (tailStart && tailEnd) {
        const tail = new Fragment(tailStart as MQNode, tailEnd);
        tail.disown().adopt(newCell, 0, 0);
        tail.domFrag().appendTo(newCell.domFrag().oneElement());
        newCell.domFrag().removeClass('mq-empty');
        return { cell: newCell, edge: L };
      }
    }
    return target;
  }
}

MQEnvironments.matrix = () => new Matrix();

class PMatrix extends Matrix {
  environment = 'pmatrix';
  parens = { left: '(', right: ')' };
}
MQEnvironments.pmatrix = () => new PMatrix();

class BMatrix extends Matrix {
  environment = 'bmatrix';
  parens = { left: '[', right: ']' };
}
MQEnvironments.bmatrix = () => new BMatrix();

class BBMatrix extends Matrix {
  environment = 'Bmatrix';
  parens = { left: '{', right: '}' };
}
MQEnvironments.Bmatrix = () => new BBMatrix();

class VMatrix extends Matrix {
  environment = 'vmatrix';
  parens = { left: '|', right: '|' };
}
MQEnvironments.vmatrix = () => new VMatrix();

class VVMatrix extends Matrix {
  environment = 'Vmatrix';
  parens = { left: '&#8741;', right: '&#8741;' };
}
MQEnvironments.Vmatrix = () => new VVMatrix();

LatexCmds.displaylines = DisplayLines;

LatexCmds.begin = class BeginEnvironment extends MathCommand {
  ctrlSeq = '\\begin';

  parser() {
    const string = Parser.string;
    const regex = Parser.regex;
    return string('{')
      .then(regex(/^[a-z]+/i))
      .skip(string('}'))
      .then((env: string) => {
        const factory = MQEnvironments[env];
        return (
          factory
            ? factory().parser()
            : Parser.fail('unknown environment type: ' + env)
        ).skip(string('\\end{' + env + '}'));
      });
  }

  // Typed `\begin` has no environment name yet; insert a fresh 2x2 pmatrix
  // and land the caret in the first cell.
  createLeftOf(cursor: Cursor) {
    cursor.parent.writeLatex(cursor, '\\begin{pmatrix}&&\\\\&&\\end{pmatrix}');
    const m = cursor[L];
    if (m instanceof Matrix) {
      cursor.insAtRightEnd(m.getEnd(L));
    }
  }
};

// \derivative is an insertion-time template: it expands to real \frac{d}{dx}
// atoms (no write-only macro atom) and lands the caret at the end of the
// numerator, so the next keystroke fills it. Bound to the `derivative`
// autoCommand word, mirroring MathLive's `derivative` inline shortcut.
LatexCmds.derivative = class Derivative extends MathCommand {
  ctrlSeq = '\\derivative';

  createLeftOf(cursor: Cursor) {
    cursor.parent.writeLatex(cursor, '\\frac{d}{dx}');
    const frac = cursor[L];
    if (frac instanceof MathCommand) {
      cursor.insAtRightEnd(frac.getEnd(L));
    }
  }
};

// Splits the top-level content of the field at the caret into a
// \displaylines env (MathLive `addRowAfter` semantics: the caret snaps to
// just after the nearest row-level ancestor so nested atoms stay whole).
// Only meaningful outside environments — Enter inside a matrix/lines cell
// is handled by MatrixCell.keystroke before the `enter` handler fires.
function mqInsertRowBreak(ctrlr: Controller) {
  const cursor = ctrlr.cursor;
  const root = ctrlr.root as unknown as MQNode;

  if (cursor.selection) cursor.deleteSelection();
  if (root.isEmpty()) return;

  // Snap the caret to just after the nearest top-level ancestor.
  if (cursor.parent !== root) {
    let n = cursor.parent;
    while (n.parent !== root) n = n.parent;
    cursor.insRightOf(n);
  }

  const leftward = cursor[L];
  const rightward = cursor[R];
  const leftFrag = leftward
    ? new Fragment(root.getEnd(L) as MQNode, leftward as MQNode)
    : undefined;
  const rightFrag = rightward
    ? new Fragment(rightward as MQNode, root.getEnd(R) as MQNode)
    : undefined;

  const env = new DisplayLines();
  env.blocks = [];
  const cell0 = new MatrixCell(0, env);
  const cell1 = new MatrixCell(1, env);
  env.blocks.push(cell0, cell1);

  const leftDom = leftFrag && leftFrag.domFrag();
  const rightDom = rightFrag && rightFrag.domFrag();
  if (leftFrag) leftFrag.disown().adopt(cell0, 0, 0);
  if (rightFrag) rightFrag.disown().adopt(cell1, 0, 0);
  env.adopt(root, 0, 0);

  const rootEl = root.domFrag().oneElement();
  rootEl.appendChild(env.html());
  if (leftDom) leftDom.appendTo(cell0.domFrag().oneElement());
  if (rightDom) rightDom.appendTo(cell1.domFrag().oneElement());

  cell0.blur(cursor);
  cell1.blur(cursor);
  env.finalizeTree();
  cursor.insAtLeftEnd(cell1);
  ctrlr.notify('edit');
  env.bubble((node) => {
    node.reflow();
    return undefined;
  });
}
