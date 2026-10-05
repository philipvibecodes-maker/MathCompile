// Vendored patch tests: matrix family, \displaylines, \derivative,
// and EditableField#insertLineBreak (src/commands/math/environments.ts).
suite('environments', function () {
  const $ = window.test_only_jquery;
  var mq;
  setup(function () {
    mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
  });

  suite('matrix', function () {
    test('parses, serializes, and renders as a table', function () {
      mq.latex('\\begin{matrix}a&b\\\\c&d\\end{matrix}');
      assert.equal(mq.latex(), '\\begin{matrix}a&b\\\\c&d\\end{matrix}');
      assert.equal(mq.__controller.root.domFrag().oneElement().querySelectorAll('td').length, 4);
      assert.equal(mq.__controller.root.domFrag().oneElement().querySelectorAll('tr').length, 2);
    });

    test('pmatrix has bracket delimiters and round-trips', function () {
      mq.latex('\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
      assert.equal(mq.latex(), '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
      assert.equal(
        mq.__controller.root.domFrag().oneElement().querySelectorAll(
          '.mq-paren'
        ).length,
        2
      );
    });

    test('ragged input is padded to a rectangle', function () {
      mq.latex('\\begin{matrix}a&b\\\\c\\end{matrix}');
      assert.equal(mq.latex(), '\\begin{matrix}a&b\\\\c&\\end{matrix}');
    });

    test('cases parses, round-trips, and renders a left brace', function () {
      mq.latex('\\begin{cases}x&x>0\\\\-x&x\\le0\\end{cases}');
      assert.equal(
        mq.latex(),
        '\\begin{cases}x&x>0\\\\-x&x\\le0\\end{cases}'
      );
      var root = mq.__controller.root.domFrag().oneElement();
      // one (left) brace delimiter, 2x2 cells
      assert.equal(root.querySelectorAll('.mq-bracket-l').length, 1);
      assert.equal(root.querySelectorAll('td').length, 4);
      assert.equal(root.querySelectorAll('tr').length, 2);
    });

    test('arrows move cell-to-cell; moveOutOf fires only at the field edge', function () {
      mq.latex('\\begin{matrix}a&b\\\\c&d\\end{matrix}');
      var exits = 0;
      mq.config({
        handlers: {
          moveOutOf: function () {
            exits += 1;
          }
        }
      });
      mq.moveToLeftEnd();
      mq.keystroke('Left'); // field edge: fires moveOutOf
      for (var i = 0; i < 10; i += 1) mq.keystroke('Right');
      assert.equal(mq.latex(), '\\begin{matrix}a&b\\\\c&d\\end{matrix}');
      assert.equal(exits, 2); // the Left above + the final Right field edge
    });
  });

  suite('insertLineBreak', function () {
    test('at top level wraps content in \\displaylines at the caret', function () {
      mq.latex('x+1');
      mq.moveToLeftEnd().keystroke('Right');
      mq.insertLineBreak();
      assert.equal(mq.latex(), '\\displaylines{x\\\\ +1}');
    });

    test('inside a displaylines row splits the row', function () {
      mq.latex('\\displaylines{x\\\\ +1}');
      mq.moveToRightEnd().keystroke('Left'); // between + and 1
      mq.insertLineBreak();
      assert.equal(mq.latex(), '\\displaylines{x\\\\ +\\\\ 1}');
    });

    test('inside a non-last displaylines row splits without merging rows', function () {
      mq.latex('\\displaylines{abc\\\\ de\\\\ fg}');
      mq.moveToLeftEnd().keystroke('Right').keystroke('Right'); // after 'b' in row 0
      mq.insertLineBreak();
      assert.equal(mq.latex(), '\\displaylines{ab\\\\ c\\\\ de\\\\ fg}');
    });

    test('inside a matrix cell adds a row below', function () {
      mq.latex('\\begin{matrix}a&b\\\\c&d\\end{matrix}');
      mq.moveToRightEnd().keystroke('Left'); // into cell d
      mq.insertLineBreak();
      assert.equal(mq.latex(), '\\begin{matrix}a&b\\\\c&d\\\\&\\end{matrix}');
    });

    test('caret lands at the start of the new row', function () {
      mq.latex('x+1');
      mq.moveToLeftEnd().keystroke('Right');
      mq.insertLineBreak();
      mq.typedText('y');
      assert.equal(mq.latex(), '\\displaylines{x\\\\ y+1}');
    });
  });

  suite('matrix editing', function () {
    test('Shift-Spacebar adds a column', function () {
      mq.latex('\\begin{matrix}a&b\\\\c&d\\end{matrix}');
      mq.moveToRightEnd().keystroke('Left');
      mq.keystroke('Shift-Spacebar');
      assert.equal(mq.latex(), '\\begin{matrix}a&b&\\\\c&d&\\end{matrix}');
      assert.equal(
        mq.__controller.root.domFrag().oneElement().querySelectorAll('td')
          .length,
        6
      );
    });

    test('backspace in an empty row removes the row', function () {
      mq.latex('\\begin{matrix}a&b\\\\ & \\end{matrix}');
      mq.moveToRightEnd().keystroke('Left'); // last cell (empty, row 1)
      mq.keystroke('Backspace');
      assert.equal(mq.latex(), '\\begin{matrix}a&b\\end{matrix}');
    });

    var ownRows = function (gridEl) {
      return gridEl
        .querySelector(':scope > table')
        .querySelectorAll(':scope > tr').length;
    };
    var rootEl = function () {
      return mq.__controller.root.domFrag().oneElement();
    };

    test('deleting an empty line below a matrix keeps the matrix rows', function () {
      mq.latex(
        '\\displaylines{\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}\\\\ }'
      );
      mq.moveToRightEnd(); // into the empty second line
      mq.keystroke('Backspace');
      assert.equal(
        mq.latex(),
        '\\displaylines{\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}}'
      );
      var root = rootEl();
      // the displaylines row is gone — and the nested matrix kept both
      // of its own <tr>s (the flat tr list used to index into them)
      assert.equal(ownRows(root.querySelector('.mq-displaylines')), 1);
      assert.equal(ownRows(root.querySelector('.mq-matrix')), 2);
    });

    test('adding a row to a matrix with a nested matrix keeps rows apart', function () {
      mq.latex(
        '\\begin{pmatrix}\\begin{matrix}x&y\\\\z&w\\end{matrix}&b\\\\c&d\\end{pmatrix}'
      );
      mq.moveToRightEnd().keystroke('Left'); // into outer cell d
      mq.insertLineBreak();
      assert.equal(
        mq.latex(),
        '\\begin{pmatrix}\\begin{matrix}x&y\\\\z&w\\end{matrix}&b\\\\c&d\\\\&\\end{pmatrix}'
      );
      var grids = rootEl().querySelectorAll('.mq-matrix');
      assert.equal(ownRows(grids[0]), 3); // outer gained the row
      assert.equal(ownRows(grids[1]), 2); // nested kept its own rows
    });

    test('adding a column to a matrix with a nested matrix keeps cells apart', function () {
      mq.latex(
        '\\begin{pmatrix}\\begin{matrix}x&y\\\\z&w\\end{matrix}&b\\\\c&d\\end{pmatrix}'
      );
      mq.moveToRightEnd().keystroke('Left');
      mq.keystroke('Shift-Spacebar');
      assert.equal(
        mq.latex(),
        '\\begin{pmatrix}\\begin{matrix}x&y\\\\z&w\\end{matrix}&b&\\\\c&d&\\end{pmatrix}'
      );
      var grids = rootEl().querySelectorAll('.mq-matrix');
      assert.equal(
        grids[0]
          .querySelector(':scope > table')
          .querySelectorAll(':scope > tr > td').length,
        6
      );
      assert.equal(
        grids[1]
          .querySelector(':scope > table')
          .querySelectorAll(':scope > tr > td').length,
        4
      );
    });

    test('deleting an empty first column keeps the other cells rendered', function () {
      mq.latex('\\begin{matrix}&a\\\\&b\\end{matrix}');
      // moveToLeftEnd stops at the root edge, left of the matrix atom —
      // one Right steps into the first cell (empty, col 0).
      mq.moveToLeftEnd().keystroke('Right');
      mq.keystroke('Backspace');
      assert.equal(mq.latex(), '\\begin{matrix}a\\\\b\\end{matrix}');
      // the surviving column's <td>s must stay attached — the old code
      // re-removed tr.children[col] after the cells already detached
      assert.equal(
        rootEl().querySelectorAll('.mq-matrix > table > tr > td').length,
        2
      );
      // and the caret landed on a surviving cell, not a detached td
      mq.typedText('z');
      assert.equal(mq.latex(), '\\begin{matrix}za\\\\b\\end{matrix}');
    });

    test('deleting the first line keeps the caret alive', function () {
      mq.latex(
        '\\displaylines{ \\\\ \\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}}'
      );
      mq.moveToLeftEnd(); // first (empty) line
      mq.keystroke('Backspace');
      assert.equal(
        mq.latex(),
        '\\displaylines{\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}}'
      );
      mq.typedText('z');
      assert.equal(
        mq.latex(),
        '\\displaylines{z\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}}'
      );
    });
||||||| de97691
    test('Ctrl-Shift-Backspace deletes the current row, content and all', function () {
      mq.latex('\\begin{matrix}a&b\\\\x&y\\\\c&d\\end{matrix}');
      mq.moveToLeftEnd().keystroke('Right'); // cell a (row 0)
      mq.keystroke('Ctrl-Shift-Backspace');
      assert.equal(mq.latex(), '\\begin{matrix}x&y\\\\c&d\\end{matrix}');
      assert.equal(ownRows(rootEl().querySelector('.mq-matrix')), 2);
      // caret lands live on the cell that slid up into the deleted row
      mq.typedText('z');
      assert.equal(mq.latex(), '\\begin{matrix}xz&y\\\\c&d\\end{matrix}');
    });

    test('Ctrl-Shift-Del deletes the current column', function () {
      mq.latex('\\begin{matrix}a&b\\\\c&d\\end{matrix}');
      mq.moveToLeftEnd().keystroke('Right'); // cell a (col 0)
      mq.keystroke('Ctrl-Shift-Del');
      assert.equal(mq.latex(), '\\begin{matrix}b\\\\d\\end{matrix}');
      assert.equal(
        rootEl().querySelector('.mq-matrix').querySelectorAll('td').length,
        2
      );
      mq.typedText('z');
      assert.equal(mq.latex(), '\\begin{matrix}bz\\\\d\\end{matrix}');
    });

    test('Ctrl-Shift-Backspace/Ctrl-Shift-Del refuse on the last row or column', function () {
      mq.latex('\\begin{matrix}a&b\\end{matrix}');
      mq.moveToLeftEnd().keystroke('Right');
      mq.keystroke('Ctrl-Shift-Backspace'); // one row: no-op
      assert.equal(mq.latex(), '\\begin{matrix}a&b\\end{matrix}');
      mq.keystroke('Ctrl-Shift-Del'); // delete col 0 -> single column
      assert.equal(mq.latex(), '\\begin{matrix}b\\end{matrix}');
      mq.keystroke('Ctrl-Shift-Del'); // one column: no-op
      assert.equal(mq.latex(), '\\begin{matrix}b\\end{matrix}');
    });

    test('inside \\displaylines the delete shortcuts keep word-delete', function () {
      // \displaylines is a grid internally, but the rebinding is
      // matrices-only: the keys still clear the current line's content.
      mq.latex('\\displaylines{a\\\\b\\\\c}');
      mq.moveToRightEnd(); // last line (fillsRootEdge descends)
      mq.keystroke('Ctrl-Shift-Backspace');
      assert.equal(mq.latex(), '\\displaylines{a\\\\ b\\\\ }');
      // forward-delete on the now-empty line removes it — the usual
      // empty-cell delete, not the matrix rebinding
      mq.keystroke('Ctrl-Shift-Del');
      assert.equal(mq.latex(), '\\displaylines{a\\\\ b}');
    });

    test('outside a grid the delete shortcuts still clear the block', function () {
      // ctrlDeleteDir removes the rest of the current block in that
      // direction — the rebinding must not change that outside a grid.
      mq.latex('foo');
      mq.moveToRightEnd();
      mq.keystroke('Ctrl-Shift-Backspace');
      assert.equal(mq.latex(), '');
      mq.latex('bar');
      mq.moveToLeftEnd();
      mq.keystroke('Ctrl-Shift-Del');
      assert.equal(mq.latex(), '');
    });
  });

  suite('env shortcuts', function () {
    test('\\cases opens the cases grid with the caret in the first cell', function () {
      mq.typedText('\\cases');
      mq.keystroke('Enter');
      assert.equal(mq.latex(), '\\begin{cases}&\\\\&\\end{cases}');
      mq.typedText('x');
      assert.equal(mq.latex(), '\\begin{cases}x&\\\\&\\end{cases}');
    });

    test('env names canonicalize like \\begin{name}', function () {
      mq.typedText('\\gather');
      mq.keystroke('Enter');
      assert.equal(mq.latex(), '\\begin{gathered}\\\\ \\end{gathered}');
      mq.latex('');
      mq.typedText('\\split');
      mq.keystroke('Enter');
      assert.equal(mq.latex(), '\\begin{aligned}&\\\\&\\end{aligned}');
    });

    test('\\array{spec} opens the grid with the column spec applied', function () {
      mq.typedText('\\array{cc}');
      assert.equal(mq.latex(), '\\begin{array}{cc}&\\\\&\\end{array}');
      mq.typedText('x');
      assert.equal(mq.latex(), '\\begin{array}{cc}x&\\\\&\\end{array}');
    });

    test('\\subarray \\tabular \\alignat \\alignedat carry their arg', function () {
      mq.typedText('\\subarray{c}');
      assert.equal(mq.latex(), '\\begin{subarray}{c}&\\\\&\\end{subarray}');
      mq.latex('');
      mq.typedText('\\tabular{ll}');
      assert.equal(mq.latex(), '\\begin{tabular}{ll}&\\\\&\\end{tabular}');
      mq.latex('');
      mq.typedText('\\alignat{2}');
      assert.equal(mq.latex(), '\\begin{alignat}{2}&\\\\&\\end{alignat}');
      mq.latex('');
      mq.typedText('\\alignedat{3}');
      assert.equal(
        mq.latex(),
        '\\begin{alignedat}{3}&\\\\&\\end{alignedat}'
      );
    });

    test('typed \\begin{array}{spec} routes through the arg input', function () {
      mq.typedText('\\begin{array}{cc}');
      assert.equal(mq.latex(), '\\begin{array}{cc}&\\\\&\\end{array}');
    });

    test('Enter/Tab inside the pending arg input resolves it', function () {
      mq.typedText('\\array');
      mq.keystroke('Enter'); // accepts \array, opens the pending arg input
      assert.equal(mq.latex(), '\\array{ }');
      mq.typedText('lr');
      mq.keystroke('Enter');
      assert.equal(mq.latex(), '\\begin{array}{lr}&\\\\&\\end{array}');
      mq.latex('');
      mq.typedText('\\array');
      mq.keystroke('Enter');
      mq.typedText('c');
      mq.keystroke('Tab');
      assert.equal(mq.latex(), '\\begin{array}{c}&\\\\&\\end{array}');
    });

    test('an unresolved arg input serializes \\name{arg} and re-parses', function () {
      mq.latex('\\array{cc}');
      assert.equal(mq.latex(), '\\array{cc}');
    });
  });

  suite('derivative', function () {
    test('expands to \\frac{d#1}{d#2} with caret in the denominator', function () {
      mq.typedText('\\derivative');
      mq.keystroke('Enter');
      assert.equal(mq.latex(), '\\frac{d}{d}');
      mq.typedText('f');
      assert.equal(mq.latex(), '\\frac{d}{df}');
    });

    test('expands to D(#1) when dIsDerivative is off', function () {
      mq.config({ dIsDerivative: false });
      mq.typedText('\\derivative');
      mq.keystroke('Enter');
      assert.equal(mq.latex(), 'D()');
      mq.typedText('f');
      assert.equal(mq.latex(), 'D(f)');
    });
  });
});
