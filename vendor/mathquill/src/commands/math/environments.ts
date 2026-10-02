/*************************************************
 * LaTeX environments: \begin{matrix} family and
 * \displaylines{...}, plus insertion-time \derivative.
 *
 * Vendored patch on top of desmosinc/mathquill — the matrix
 * implementation is a port of Learnosity/mathquill's `matrix`
 * branch (upstream PR mathquill/mathquill#762, ~2017 jQuery
 * base) to the jQuery-free TypeScript internals used here.
 *************************************************/

var Environments: { [name: string]: () => CellGrid } = {};

LatexCmds.begin = class extends MathCommand {
  ctrlSeq = '\\begin';
  domView = new DOMView(1, (blocks) =>
    h('span', { class: 'mq-non-leaf' }, [
      h.text('\\begin{'),
      h.block('span', {}, blocks[0]),
      h.text('}'),
    ])
  );

  parser() {
    var string = Parser.string;
    var regex = Parser.regex;
    return string('{')
      .then(regex(/^[a-z]+/i))
      .skip(string('}'))
      .then(function (env) {
        return (
          Environments[env]
            ? Environments[env]().parser()
            : Parser.fail('unknown environment type: ' + env)
        ).skip(string('\\end{' + env + '}'));
      });
  }
};

// A MathCommand whose children ("cells") are laid out in a grid:
// the matrix family (N columns, optional bracket delimiters) and
// displaylines (a single column).
class CellGrid extends MathCommand {
  // Delimiters consumed by the parser.
  delimiters = { column: '&', row: '\\\\' };
  // Separators written by latex() — displaylines emits 'a\\ b'.
  rowSep = '\\\\';
  colSep = '&';
  parens: {
    left: keyof typeof SVG_SYMBOLS | null;
    right: keyof typeof SVG_SYMBOLS | null;
  } = {
    left: null,
    right: null,
  };
  // When true the parser expects the cell grid in braces: `\pmatrix{a&b}`.
  // Set for bare LatexCmds registrations; \begin{...} parses are
  // \end{...}-bounded instead.
  needsBraces = false;
  // number of columns; set by relink()
  rowSize = 0;
  gridClass = 'mq-matrix mq-non-leaf';
  cellTextAlign = 'center';

  get cells() {
    return (this.blocks || []) as MatrixCell[];
  }

  latexOpen() {
    return '';
  }
  latexClose() {
    return '';
  }

  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);

    ctx.uncleanedLatex += this.latexOpen();
    var row: number | undefined;
    var rowSep = this.rowSep,
      colSep = this.colSep;
    this.eachChild(function (child) {
      const cell = child as MatrixCell;
      if (row !== undefined) {
        ctx.uncleanedLatex += row !== cell.row ? rowSep : colSep;
      }
      row = cell.row;
      cell.latexRecursive(ctx);
      return undefined;
    });
    ctx.uncleanedLatex += this.latexClose();

    this.checkCursorContextClose(ctx);
  }

  html() {
    const self = this;
    self.relink();
    this.domView = new DOMView(0, function () {
      const rows: HTMLElement[] = [];
      let tr: HTMLElement | undefined;
      let row = -1;
      for (const cell of self.cells) {
        if (cell.row !== row) {
          row = cell.row;
          tr = h('tr', {});
          rows.push(tr);
        }
        tr!.appendChild(h.block('td', { style: 'text-align:' + self.cellTextAlign }, cell));
      }
      const styleBits: string[] = [];
      if (self.parens.left)
        styleBits.push('margin-left:' + SVG_SYMBOLS[self.parens.left].width);
      if (self.parens.right)
        styleBits.push('margin-right:' + SVG_SYMBOLS[self.parens.right].width);
      const table = h(
        'table',
        {
          class:
            'mq-non-leaf' + (rows.length === 1 ? ' mq-rows-1' : ''),
          style: styleBits.join(';') || undefined,
        },
        rows
      );
      function parenHtml(side: 'left' | 'right') {
        const paren = self.parens[side];
        if (!paren) return h('span', { style: 'display:none' });
        const symbol = SVG_SYMBOLS[paren];
        return h(
          'span',
          {
            style: 'width:' + symbol.width,
            class:
              'mq-scaled mq-paren mq-bracket-' +
              (side === 'left' ? 'l' : 'r'),
          },
          [symbol.html()]
        );
      }
      return h('span', { class: self.gridClass }, [
        parenHtml('left'),
        table,
        parenHtml('right'),
      ]);
    });
    return super.html();
  }

  finalizeTree() {
    this.relink();
    const trs = this.tableRows();
    const table = trs[0]?.parentElement;
    table?.classList.toggle('mq-rows-1', trs.length === 1);
  }

  parser() {
    var inner = this.cellsParser();
    if (!this.needsBraces) return inner;
    return Parser.string('{')
      .then(inner)
      .skip(Parser.optWhitespace)
      .skip(Parser.string('}'));
  }

  // Parses `&`- and `\\`-separated math blocks into cells.
  cellsParser() {
    var optWhitespace = Parser.optWhitespace;
    var string = Parser.string;
    var block = latexMathParser.block;
    var self = this;

    return optWhitespace
      .then(
        (
          (this.delimiters.column
            ? string(this.delimiters.column)
            : Parser.fail('no column delimiter')) as Parser<string | MathBlock>
        )
          .or(string(this.delimiters.row))
          .or(block)
      )
      .many()
      .skip(optWhitespace)
      .then(function (items) {
        var collected: MathBlock[] = [];
        var row = 0;
        self.blocks = [];

        function addCell() {
          self.blocks.push(new MatrixCell(row, self, collected));
          collected = [];
        }

        for (var i = 0; i < items.length; i += 1) {
          const item = items[i] as string | MathBlock;
          if (item instanceof MathBlock) {
            collected.push(item);
          } else {
            addCell();
            if (item === self.delimiters.row) row += 1;
          }
        }
        addCell();
        self.autocorrect();
        return Parser.succeed(self as MQNode | Fragment);
      });
  }

  // Set up directional pointers between cells; also fixes rowSize,
  // sibling links, and the command's ends.
  relink() {
    var blocks = this.cells;
    var rows: MatrixCell[][] = [];
    var row = -1,
      column = 0;

    if (!blocks.length) {
      (this as { ends: Ends<NodeRef> }).ends = { [L]: 0, [R]: 0 };
      return;
    }

    // Assume one row until a second shows up; overwritten below.
    this.rowSize = blocks.length;

    for (var i = 0; i < blocks.length; i += 1) {
      var cell = blocks[i];
      if (row !== cell.row) {
        if (cell.row === 1) {
          // Just finished iterating the first row.
          this.rowSize = column;
        }
        row = cell.row;
        rows[row] = [];
        column = 0;
      }
      rows[row][column] = cell;

      // Horizontal linkage
      cell[R] = blocks[i + 1] || 0;
      cell[L] = blocks[i - 1] || 0;

      // Vertical linkage
      var above = rows[row - 1] && rows[row - 1][column];
      if (above) {
        cell.upOutOf = above;
        above.downOutOf = cell;
      } else {
        delete cell.upOutOf;
      }
      delete cell.downOutOf;
      column += 1;
    }

    this.setEnds({
      [L]: blocks[0],
      [R]: blocks[blocks.length - 1],
    });
  }

  // Pad shorter rows so the grid is rectangular (after parsing).
  autocorrect() {
    var lengths: number[] = [];
    var rows: MatrixCell[][] = [];
    var blocks = this.cells;
    var row = -1;

    for (var i = 0; i < blocks.length; i += 1) {
      row = blocks[i].row;
      rows[row] = rows[row] || [];
      rows[row].push(blocks[i]);
      lengths[row] = rows[row].length;
    }

    var maxLength = Math.max.apply(null, lengths);
    if (rows.length === 1 || maxLength === Math.min.apply(null, lengths))
      return;

    for (i = 0; i < rows.length; i += 1) {
      var shortfall = maxLength - rows[i].length;
      while (shortfall) {
        var position = maxLength * i + rows[i].length;
        blocks.splice(position, 0, new MatrixCell(i, this));
        shortfall -= 1;
      }
    }
    this.relink();
  }

  // Enter the grid at the top or bottom row when moving vertically.
  getEntryPoint(dir: Direction, updown: 'up' | 'down') {
    if (updown === 'up') {
      return dir === L ? this.cells[this.rowSize - 1] : this.cells[0];
    } else {
      return dir === L
        ? this.cells[this.cells.length - 1]
        : this.cells[this.cells.length - this.rowSize];
    }
  }

  // Exit the grid past the first and last columns when moving
  // vertically out of it.
  atExitPoint(dir: Direction, cursor: Cursor) {
    var i = this.cells.indexOf(cursor.parent as MatrixCell);
    if (dir === L) {
      return i % this.rowSize === 0;
    } else {
      return (i + 1) % this.rowSize === 0;
    }
  }

  moveTowards(dir: Direction, cursor: Cursor, updown?: 'up' | 'down') {
    var entryPoint = updown && this.getEntryPoint(dir, updown);
    cursor.insAtDirEnd(
      -dir as Direction,
      entryPoint || this.getEnd(-dir as Direction)
    );
    cursor.controller.aria
      .queueDirEndOf(-dir as Direction)
      .queue(cursor.parent, true);
  }

  tableRows(): HTMLElement[] {
    const table = this.domFrag().oneElement().querySelector('table');
    return table ? Array.from(table.querySelectorAll('tr')) : [];
  }

  renderCell(cell: MatrixCell): HTMLElement {
    const td = h('td', {
      class: cell.isEmpty() ? 'mq-empty' : '',
      style: 'text-align:' + this.cellTextAlign,
    });
    cell.setDOM(td);
    NodeBase.linkElementByBlockNode(td, cell);
    return td;
  }

  // Split `cell` into two rows: content after `splitAfter` (a direct
  // child of the cell, or 0 to keep the whole row) moves to a new row
  // below; returns the new cell. `splitAfter === cell.getEnd(L)` splits
  // *before* that node is not supported — pass the node to split after.
  splitRowBelow(cell: MatrixCell, splitAfter: NodeRef, cursor: Cursor) {
    var rightEnd = cell.getEnd(R);
    // Everything after splitAfter moves to the new row; splitAfter = 0
    // means the whole row moves down.
    var rightStart: NodeRef = splitAfter ? splitAfter[R] : cell.getEnd(L);
    var rightFrag = rightStart
      ? new Fragment(rightStart, rightEnd)
      : new Fragment(0, 0);

    // Bump later rows before constructing the new cell — its ctor adopts
    // it as a child, so it must not be seen by the increment pass or its
    // row lands one too high (colliding with the row after it).
    this.eachChild(function (child) {
      const c = child as MatrixCell;
      if (c.row > cell.row) c.row += 1;
      return undefined;
    });
    var newCell = new MatrixCell(cell.row + 1, this);
    this.blocks.splice(this.cells.indexOf(cell) + 1, 0, newCell);

    rightFrag.disown();
    rightFrag.adopt(newCell, 0, 0);

    // DOM: append a new <tr> after this cell's row.
    const td = this.renderCell(newCell);
    const tr = cell.domFrag().oneElement().closest('tr');
    tr?.after(h('tr', {}, [td]));

    this.relink();
    newCell.blur(cursor);
    return newCell;
  }

  // Deleting a cell also deletes the current row and column if they
  // are empty, and relinks the grid.
  deleteCell(currentCell: MatrixCell) {
    var rows: MatrixCell[][] = [],
      columns: MatrixCell[][] = [],
      myRow: MatrixCell[] = [],
      myColumn: MatrixCell[] = [];
    var blocks = this.cells,
      row = -1,
      column = 0;

    this.eachChild(function (child) {
      const cell = child as MatrixCell;
      if (row !== cell.row) {
        row = cell.row;
        rows[row] = [];
        column = 0;
      }
      columns[column] = columns[column] || [];
      columns[column].push(cell);
      rows[row].push(cell);

      if (cell === currentCell) {
        myRow = rows[row];
        myColumn = columns[column];
      }

      column += 1;
      return undefined;
    });

    function isEmpty(cells: MatrixCell[]) {
      var empties = [];
      for (var i = 0; i < cells.length; i += 1) {
        if (cells[i].isEmpty()) empties.push(cells[i]);
      }
      return empties.length === cells.length;
    }

    function remove(cells: MatrixCell[]) {
      for (var i = 0; i < cells.length; i += 1) {
        if (blocks.indexOf(cells[i]) > -1) {
          cells[i].remove();
          blocks.splice(blocks.indexOf(cells[i]), 1);
        }
      }
    }

    if (isEmpty(myRow) && myColumn.length > 1) {
      row = rows.indexOf(myRow);
      // Decrease all following row numbers
      this.eachChild(function (child) {
        const cell = child as MatrixCell;
        if (cell.row > row) cell.row -= 1;
        return undefined;
      });
      // Dispose of cells and remove the <tr>
      const trs = this.tableRows();
      remove(myRow);
      trs[row]?.remove();
    }
    if (isEmpty(myColumn) && myRow.length > 1) {
      const col = columns.indexOf(myColumn);
      remove(myColumn);
      // Remove the orphaned <td>s from each row
      this.tableRows().forEach(function (tr) {
        (tr.children[col] as HTMLElement | undefined)?.remove();
      });
    }
    this.finalizeTree();
  }

  addRow(afterCell: MatrixCell) {
    var previous: MatrixCell[] = [],
      newCells: MatrixCell[] = [],
      next: MatrixCell[] = [];
    var row = afterCell.row,
      columns = 0,
      column = 0;

    this.eachChild(function (child) {
      const cell = child as MatrixCell;
      // Cache previous rows
      if (cell.row <= row) previous.push(cell);
      // Work out how many columns
      if (cell.row === row) {
        if (cell === afterCell) column = columns;
        columns += 1;
      }
      // Cache cells after the new row
      if (cell.row > row) {
        cell.row += 1;
        next.push(cell);
      }
      return undefined;
    });

    // Add new cells, one for each column
    const tds: HTMLElement[] = [];
    for (var i = 0; i < columns; i += 1) {
      var block = new MatrixCell(row + 1, this);
      newCells.push(block);
      tds.push(this.renderCell(block));
    }

    // Insert the new <tr> after the current row's
    const trs = this.tableRows();
    trs[row]?.after(h('tr', {}, tds));

    this.blocks = previous.concat(newCells, next);
    return newCells[column];
  }

  addColumn(afterCell: MatrixCell) {
    var rows: MatrixCell[][] = [],
      newCells: MatrixCell[] = [];
    var column = 0;

    // Build the rows array and find the new column index
    this.eachChild(function (child) {
      const cell = child as MatrixCell;
      rows[cell.row] = rows[cell.row] || [];
      rows[cell.row].push(cell);
      if (cell === afterCell) column = rows[cell.row].length;
      return undefined;
    });

    // Add new cells, one for each row
    for (var i = 0; i < rows.length; i += 1) {
      var block = new MatrixCell(i, this);
      newCells.push(block);
      rows[i].splice(column, 0, block);
    }

    // Add <td> elements in the right position in each row
    const trs = this.tableRows();
    for (i = 0; i < trs.length && i < rows.length; i += 1) {
      const td = this.renderCell(newCells[i]);
      const before = trs[i].children[column] as HTMLElement | undefined;
      if (before) trs[i].insertBefore(td, before);
      else trs[i].appendChild(td);
    }

    // Flatten the rows array-of-arrays
    this.blocks = ([] as MatrixCell[]).concat.apply([], rows);
    return newCells[afterCell.row];
  }

  insert(
    method: 'addRow' | 'addColumn',
    afterCell: MatrixCell,
    ctrlr: Controller
  ) {
    var cellToFocus = this[method](afterCell);
    this.finalizeTree();
    this.bubble(function (node) {
      node.reflow();
      return undefined;
    });
    ctrlr.cursor.insAtRightEnd(cellToFocus);
  }

  backspace(
    cell: MatrixCell,
    dir: Direction,
    cursor: Cursor,
    finalDeleteCallback: () => void
  ) {
    var dirwards: NodeRef = cell[dir];
    if (cell.isEmpty()) {
      this.deleteCell(cell);
      while (
        dirwards &&
        dirwards[dir] &&
        this.cells.indexOf(dirwards as MatrixCell) === -1
      ) {
        dirwards = dirwards[dir] as MatrixCell;
      }
      if (dirwards) {
        cursor.insAtDirEnd(-dir as Direction, dirwards);
      }
      if (this.cells.length === 1 && this.cells[0].isEmpty()) {
        finalDeleteCallback();
        this.finalizeTree();
      }
      this.bubble(function (node) {
        node.reflow();
        return undefined;
      });
    }
  }
}

class MatrixCell extends MathBlock {
  row: number;

  constructor(row: number, parent?: CellGrid, replaces?: MathBlock[]) {
    super();
    this.row = row;
    if (parent) {
      this.adopt(parent, parent.getEnd(R), 0);
    }
    if (replaces) {
      for (var i = 0; i < replaces.length; i++) {
        replaces[i].children().adopt(this, this.getEnd(R), 0);
      }
    }
  }

  keystroke(key: string, e: KeyboardEvent | undefined, ctrlr: Controller) {
    switch (key) {
      case 'Shift-Spacebar':
        e?.preventDefault();
        return (this.parent as CellGrid).insert('addColumn', this, ctrlr);
    }
    return super.keystroke(key, e, ctrlr);
  }

  deleteOutOf(dir: Direction, cursor: Cursor) {
    var self = this;
    (this.parent as CellGrid).backspace(this, dir, cursor, function () {
      // called when the last cell gets deleted
      MathBlock.prototype.deleteOutOf.call(self, dir, cursor);
    });
  }

  moveOutOf(dir: Direction, cursor: Cursor, updown?: 'up' | 'down') {
    var atExitPoint =
      updown && (this.parent as CellGrid).atExitPoint(dir, cursor);
    // Step out of the grid if we've moved past an edge column
    if (!atExitPoint && this[dir])
      cursor.insAtDirEnd(-dir as Direction, this[dir] as MQNode);
    else cursor.insDirOf(dir, this.parent);
  }
}

class Matrix extends CellGrid {
  createBlocks() {
    this.blocks = [
      new MatrixCell(0, this),
      new MatrixCell(0, this),
      new MatrixCell(1, this),
      new MatrixCell(1, this),
    ];
  }
}

function withBraces<T extends CellGrid>(env: T): T {
  env.needsBraces = true;
  return env;
}

Environments.matrix = () => new Matrix();
LatexCmds.matrix = () => withBraces(new Matrix());

class PMatrix extends Matrix {
  parens = { left: '(' as const, right: ')' as const };
  latexOpen() {
    return '\\begin{pmatrix}';
  }
  latexClose() {
    return '\\end{pmatrix}';
  }
}
class BMatrix extends Matrix {
  parens = { left: '[' as const, right: ']' as const };
  latexOpen() {
    return '\\begin{bmatrix}';
  }
  latexClose() {
    return '\\end{bmatrix}';
  }
}
class BBMatrix extends Matrix {
  parens = { left: '{' as const, right: '}' as const };
  latexOpen() {
    return '\\begin{Bmatrix}';
  }
  latexClose() {
    return '\\end{Bmatrix}';
  }
}
class VMatrix extends Matrix {
  parens = { left: '|' as const, right: '|' as const };
  latexOpen() {
    return '\\begin{vmatrix}';
  }
  latexClose() {
    return '\\end{vmatrix}';
  }
}
class VVMatrix extends Matrix {
  parens = { left: '&#8741;' as const, right: '&#8741;' as const };
  latexOpen() {
    return '\\begin{Vmatrix}';
  }
  latexClose() {
    return '\\end{Vmatrix}';
  }
}

class MatrixEnv extends Matrix {
  latexOpen() {
    return '\\begin{matrix}';
  }
  latexClose() {
    return '\\end{matrix}';
  }
}

Environments.pmatrix = () => new PMatrix();
Environments.bmatrix = () => new BMatrix();
Environments.Bmatrix = () => new BBMatrix();
Environments.vmatrix = () => new VMatrix();
Environments.Vmatrix = () => new VVMatrix();

// \displaylines{a\\ b}: a single-column grid for multi-line cells.
class DisplayLines extends CellGrid {
  // Rows only — no `&` column delimiter.
  delimiters = { column: '', row: '\\\\' };
  rowSep = '\\\\ ';
  gridClass = 'mq-displaylines mq-non-leaf';
  cellTextAlign = 'left';

  latexOpen() {
    return '\\displaylines{';
  }
  latexClose() {
    return '}';
  }

  createBlocks() {
    this.blocks = [new MatrixCell(0, this), new MatrixCell(1, this)];
  }
}

Environments.displaylines = () => new DisplayLines();
LatexCmds.displaylines = () => withBraces(new DisplayLines());
LatexCmds.pmatrix = () => withBraces(new PMatrix());
LatexCmds.bmatrix = () => withBraces(new BMatrix());
LatexCmds.Bmatrix = () => withBraces(new BBMatrix());
LatexCmds.vmatrix = () => withBraces(new VMatrix());
LatexCmds.Vmatrix = () => withBraces(new VVMatrix());

// Fix up Environments.matrix to use the proper latex wrapper.
Environments.matrix = () => new MatrixEnv();

// \derivative{a}{b}: expands to real atoms at insertion time —
// \frac{da}{db} when the dIsDerivative option is on (default), D(a)
// otherwise. Two blocks so `\derivative{a}{b}` in stored latex still
// round-trips verbatim; the typed path (`\derivative` + terminator, or
// the `derivative` autoCommand) expands via writeLatex so the result is
// ordinary editable content.
class Derivative extends MathCommand {
  constructor() {
    super(
      '\\derivative',
      new DOMView(2, (blocks) =>
        h('span', { class: 'mq-non-leaf' }, [
          h.text('D('),
          h.block('span', {}, blocks[0]),
          h.text(', '),
          h.block('span', {}, blocks[1]),
          h.text(')'),
        ])
      ),
      ['D(', ')']
    );
  }

  createLeftOf(cursor: Cursor) {
    // Expand immediately instead of inserting a \derivative node.
    const arg = (i: number) => {
      const block = this.blocks?.[i];
      return block && !block.isEmpty() ? block.latex() : '';
    };
    const isDeriv = cursor.options.dIsDerivative !== false;
    const latex = isDeriv
      ? '\\frac{d' + arg(0) + '}{d' + arg(1) + '}'
      : 'D(' + arg(0) + ')';
    cursor.parent.writeLatex(cursor, latex);
    // Caret lands at the end of the denominator for \frac{d#1}{d#2};
    // for D(#1) it goes before the closing paren ('(' and ')' parse as
    // separate atoms in latex, so just step left of ')').
    const prev = cursor[L] as MQNode | 0;
    if (isDeriv) {
      if (prev instanceof MathCommand && prev.blocks?.length) {
        cursor.insAtRightEnd(prev.getEnd(R));
      }
    } else if (prev) {
      cursor.insDirOf(L, prev);
    }
  }
}
LatexCmds.derivative = () => new Derivative();

/**
 * Enter semantics for editable fields: add a row when inside a matrix
 * cell, split the current row when inside a \displaylines cell, or wrap
 * top-level content in a two-row \displaylines split at the row-level
 * atom containing the caret.
 */
function insertLineBreakAtCursor(ctrlr: Controller) {
  var cursor = ctrlr.cursor;
  if (cursor.selection) cursor.deleteSelection();

  // Find the line-level block (nearest MatrixCell / root block) and the
  // atom inside it that contains the caret.
  var lineBlock: MQNode | undefined;
  var atomInLine: MQNode | undefined;
  var node: MQNode = cursor.parent;
  while (true) {
    if (node instanceof MatrixCell || Controller.isControllerRoot(node)) {
      lineBlock = node;
      break;
    }
    var par = node.parent;
    if (!par) break;
    if (par instanceof MatrixCell || Controller.isControllerRoot(par)) {
      lineBlock = par;
      atomInLine = node;
      break;
    }
    node = par;
  }
  if (!lineBlock) return;

  // Inside a matrix cell: Enter adds a row below the cell's row.
  if (
    lineBlock instanceof MatrixCell &&
    !((lineBlock.parent as MQNode) instanceof DisplayLines)
  ) {
    (lineBlock.parent as CellGrid).insert('addRow', lineBlock, ctrlr);
    ctrlr.notify('edit');
    ctrlr.scrollHoriz();
    return;
  }

  // Split point: just after the row-level atom containing the caret, or
  // at the caret itself when it sits directly inside the line block.
  var splitAfter: NodeRef = atomInLine || (cursor[L] as NodeRef);

  if (Controller.isControllerRoot(lineBlock)) {
    // A lone top-level \displaylines env owns the whole cell. Enter typed
    // beside it (e.g. after mq.latex() hydrates the caret at baseline
    // right of the env, or after arrows walk out of an edge row) must
    // split a row inside that env — wrapping it produces a nested
    // \displaylines{...} inside a single row.
    var only = lineBlock.getEnd(L);
    if (
      only instanceof DisplayLines &&
      only === lineBlock.getEnd(R) &&
      (cursor[R] === only || cursor[L] === only)
    ) {
      var cells = only.cells as MatrixCell[];
      var edgeCell: MatrixCell;
      if (cursor[R] === only) {
        // left of the env: splitRowBelow(0) moves the first row down into
        // a new row — the emptied first cell is the new top row
        edgeCell = cells[0];
        only.splitRowBelow(edgeCell, 0, cursor);
      } else {
        var lastCell = cells[cells.length - 1];
        edgeCell = only.splitRowBelow(lastCell, lastCell.getEnd(R), cursor);
      }
      only.bubble(function (n) {
        n.reflow();
        return undefined;
      });
      cursor.insAtLeftEnd(edgeCell);
      ctrlr.notify('edit');
      ctrlr.scrollHoriz();
      return;
    }

    // Wrap the root's whole content in a two-row \displaylines.
    var env = new DisplayLines();
    var cellL = new MatrixCell(0, env);
    var cellR = new MatrixCell(1, env);
    env.blocks = [cellL, cellR];
    env.relink();

    var leftEnd = lineBlock.getEnd(L);
    var rightEnd = lineBlock.getEnd(R);
    // NB: adopt() mutates sibling links (clears rightEnd[R]), so both
    // fragments must be constructed *before* any disown/adopt runs.
    // leftFrag: [leftEnd .. splitAfter] — empty when splitting at the
    // start of the line (splitAfter = 0).
    var leftFrag =
      leftEnd && splitAfter
        ? new Fragment(leftEnd, splitAfter)
        : new Fragment(0, 0);
    // rightFrag: [splitAfter's right sibling .. rightEnd] — everything
    // when splitting at the start; empty when splitting at the end.
    var rightStart: NodeRef = splitAfter ? splitAfter[R] : leftEnd;
    var rightFrag =
      rightStart && rightEnd
        ? new Fragment(rightStart, rightEnd)
        : new Fragment(0, 0);
    leftFrag.disown();
    rightFrag.disown();
    leftFrag.adopt(cellL, 0, 0);
    rightFrag.adopt(cellR, 0, 0);

    env.adopt(lineBlock, 0, 0);

    var el = lineBlock.domFrag().oneElement();
    lineBlock.domFrag().empty();
    domFrag(env.html()).appendTo(el);
    env.postOrder(function (n) {
      n.finalizeTree(cursor.options);
    });
    env.postOrder(function (n) {
      n.blur(cursor);
    });
    env.bubble(function (n) {
      n.reflow();
      return undefined;
    });
    cursor.insAtLeftEnd(cellR);
  } else {
    // A \displaylines cell: split it into two rows.
    var grid = lineBlock.parent as CellGrid;
    var newCell = grid.splitRowBelow(lineBlock as MatrixCell, splitAfter, cursor);
    grid.bubble(function (n) {
      n.reflow();
      return undefined;
    });
    cursor.insAtLeftEnd(newCell);
  }

  ctrlr.notify('edit');
  ctrlr.scrollHoriz();
}
