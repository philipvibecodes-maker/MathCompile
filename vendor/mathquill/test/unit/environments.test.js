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
      mq.moveToRightEnd().keystroke('Left').keystroke('Left'); // between + and 1
      mq.insertLineBreak();
      assert.equal(mq.latex(), '\\displaylines{x\\\\ +\\\\ 1}');
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
