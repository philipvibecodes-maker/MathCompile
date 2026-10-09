// Vendored patch tests: Ctrl-Z/Ctrl-Shift-Z undo history
// (src/services/undo.ts), and the multi-line-cell edge fixes in
// services/keystroke.ts (line-aware Home/End, Tab/Shift-Tab at the
// \displaylines edges, select-all/select-to-root-end stall guard).
suite('undo/redo', function () {
  const $ = window.test_only_jquery;
  var mq;
  setup(function () {
    mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
  });

  function caretParent() {
    return mq.__controller.cursor.parent;
  }

  test('Ctrl-Z undoes a typing burst back to the previous state', function () {
    mq.typedText('a+b');
    mq.keystroke('Left'); // caret move ends the coalescing burst
    mq.keystroke('Right');
    mq.typedText('c');
    assert.equal(mq.latex(), 'a+bc');
    mq.keystroke('Ctrl-Z');
    assert.equal(mq.latex(), 'a+b');
    mq.keystroke('Ctrl-Z');
    assert.equal(mq.latex(), '');
  });

  test('Ctrl-Shift-Z and Ctrl-Y redo', function () {
    mq.typedText('x');
    mq.keystroke('Ctrl-Z');
    assert.equal(mq.latex(), '');
    mq.keystroke('Ctrl-Shift-Z');
    assert.equal(mq.latex(), 'x');
    mq.keystroke('Ctrl-Z');
    mq.keystroke('Ctrl-Y');
    assert.equal(mq.latex(), 'x');
  });

  test('Meta-Z also undoes', function () {
    mq.typedText('x');
    mq.keystroke('Meta-Z');
    assert.equal(mq.latex(), '');
  });

  test('undo restores a select-all + delete', function () {
    mq.typedText('a+bc');
    mq.keystroke('Ctrl-A');
    mq.keystroke('Backspace');
    assert.equal(mq.latex(), '');
    mq.keystroke('Ctrl-Z');
    assert.equal(mq.latex(), 'a+bc');
  });

  test('undo restores the caret into the same spot', function () {
    mq.typedText('ab');
    mq.keystroke('Left');
    mq.keystroke('Left'); // burst broken, caret at start
    mq.typedText('z');
    assert.equal(mq.latex(), 'zab');
    mq.keystroke('Ctrl-Z');
    assert.equal(mq.latex(), 'ab');
    // caret back at the end of the pre-edit snapshot
    assert.equal(caretParent(), mq.__controller.root);
    assert.ok(!mq.__controller.cursor[R]);
  });

  test('undo steps through a line break', function () {
    mq.typedText('x');
    mq.keystroke('Left'); // break burst
    mq.keystroke('Right');
    mq.insertLineBreak();
    mq.typedText('y');
    assert.equal(mq.latex(), '\\displaylines{x\\\\ y}');
    mq.keystroke('Ctrl-Z');
    assert.equal(mq.latex(), 'x');
  });

  test('a programmatic latex() rebases history — not an undo step', function () {
    mq.typedText('abc');
    mq.keystroke('Ctrl-Home'); // break the burst
    mq.latex('new'); // programmatic replace: 'abc' must not become a step
    mq.keystroke('Ctrl-Z'); // -> the pre-'abc' baseline, skipping 'abc'
    assert.equal(mq.latex(), '');
    mq.keystroke('Ctrl-Shift-Z');
    assert.equal(mq.latex(), 'new');
  });

  test('new edits after undo clear the redo stack', function () {
    mq.typedText('a');
    mq.keystroke('Left');
    mq.keystroke('Right');
    mq.typedText('b');
    mq.keystroke('Ctrl-Z');
    assert.equal(mq.latex(), 'a');
    mq.typedText('z');
    mq.keystroke('Ctrl-Shift-Z');
    assert.equal(mq.latex(), 'az');
  });
});

suite('multi-line cell keys', function () {
  const $ = window.test_only_jquery;
  var mq;
  setup(function () {
    mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
  });

  function caretRow() {
    var p = mq.__controller.cursor.parent;
    return typeof p.row === 'number' ? p.row : -1;
  }
  function cursor() {
    return mq.__controller.cursor;
  }

  test('Home/End go to the line edges inside a grid cell', function () {
    mq.latex('\\displaylines{ab\\\\ cd}');
    // mq.latex lands the caret at the end of the last line
    mq.keystroke('Home');
    assert.equal(caretRow(), 1);
    assert.ok(!cursor()[L], 'caret at start of line 2');
    mq.keystroke('End');
    assert.equal(caretRow(), 1);
    assert.ok(!cursor()[R], 'caret at end of line 2');
    mq.keystroke('Ctrl-Home');
    assert.equal(caretRow(), 0);
    mq.keystroke('End');
    assert.ok(!cursor()[R], 'caret at end of line 1');
  });

  test('Home/End inside a nested block still mean line edges', function () {
    mq.latex('\\displaylines{a+\\frac{1}{2}\\\\ b}');
    mq.keystroke('Ctrl-Home');
    mq.keystroke('Right');
    mq.keystroke('Right');
    mq.keystroke('Right'); // into the frac
    assert.equal(caretRow(), -1, 'caret descended into the frac');
    mq.keystroke('Home');
    assert.equal(caretRow(), 0);
    assert.ok(!cursor()[L], 'caret at start of the line, not the frac');
    mq.keystroke('End');
    assert.equal(caretRow(), 0);
    assert.ok(!cursor()[R], 'caret at end of the line, not the frac');
  });

  test('Tab at the last line edge does not preventDefault (leaves field)', function () {
    mq.latex('\\displaylines{ab\\\\ cd}');
    var prevented = false;
    mq.keystroke('Tab', {
      preventDefault: function () {
        prevented = true;
      },
    });
    assert.equal(prevented, false);
    assert.equal(caretRow(), 1, 'caret stays put — the browser takes the key');
    // but mid-last-line Tab still walks blocks like upstream
  });

  test('Tab on a middle line moves to the next line', function () {
    mq.latex('\\displaylines{ab\\\\ cd\\\\ ef}');
    mq.keystroke('Ctrl-Home');
    var prevented = false;
    mq.keystroke('Tab', {
      preventDefault: function () {
        prevented = true;
      },
    });
    assert.equal(prevented, true);
    assert.equal(caretRow(), 1);
  });

  test('Shift-Tab at the first line edge does not preventDefault', function () {
    mq.latex('\\displaylines{ab\\\\ cd}');
    mq.keystroke('Ctrl-Home');
    var prevented = false;
    mq.keystroke('Shift-Tab', {
      preventDefault: function () {
        prevented = true;
      },
    });
    assert.equal(prevented, false);
    assert.equal(caretRow(), 0);
  });

  test('Ctrl-A covers every line; Backspace clears the cell', function () {
    mq.latex('\\displaylines{ab\\\\ cd\\\\ ef}');
    mq.keystroke('Ctrl-A');
    mq.keystroke('Backspace');
    assert.equal(mq.latex(), '');
  });

  test('Ctrl-Shift-Home/End do not hang inside a multi-line cell', function () {
    mq.latex('\\displaylines{ab\\\\ cd}');
    // used to loop forever via the root-edge snap; now selects back to
    // the first line's start and lands the caret there
    mq.keystroke('Ctrl-Shift-Home');
    assert.equal(caretRow(), 0);
    assert.ok(!cursor()[L]);
    mq.keystroke('Ctrl-Shift-End');
    assert.equal(caretRow(), 1);
    assert.ok(!cursor()[R]);
  });
});
