// Vendored patch tests: \python{ ... } raw-source blocks
// (src/commands/math/pythonBlock.ts).
suite('pythonBlock', function () {
  const $ = window.test_only_jquery;
  var mq;
  setup(function () {
    mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
  });

  function pythonBlockEl() {
    return mq.__controller.root.domFrag().oneElement().querySelector(
      '.mq-python'
    );
  }

  // The block's code text, ignoring the caret span when the cursor is
  // inside the element.
  function codeText() {
    var el = pythonBlockEl();
    return Array.prototype.map
      .call(el.childNodes, function (n) {
        return n.nodeType === Node.TEXT_NODE ? n.data : '';
      })
      .join('');
  }

  suite('parse/serialize', function () {
    test('simple code round-trips', function () {
      mq.latex('\\python{x = 1}');
      assert.equal(mq.latex(), '\\python{x = 1}');
      assert.equal(codeText(), 'x = 1');
    });

    test('multi-line source round-trips with literal newlines', function () {
      mq.latex('\\python{def f(x):\n    return x + 1}');
      assert.equal(mq.latex(), '\\python{def f(x):\n    return x + 1}');
      assert.equal(codeText(), 'def f(x):\n    return x + 1');
    });

    test('balanced braces stay raw in the serialization', function () {
      mq.latex('\\python{d = {"a": 1}}');
      assert.equal(mq.latex(), '\\python{d = {"a": 1}}');
      assert.equal(codeText(), 'd = {"a": 1}');
    });

    test('unbalanced braces and backslashes escape and reparse', function () {
      // body s = "a}b" — the literal } would end the scan, so it escapes
      mq.latex('\\python{s = "a\\}b"}');
      assert.equal(mq.latex(), '\\python{s = "a\\}b"}');
      assert.equal(codeText(), 's = "a}b"');

      mq.latex('\\python{s = "\\\\n"}');
      assert.equal(mq.latex(), '\\python{s = "\\\\n"}');
      assert.equal(codeText(), 's = "\\n"');
    });

    test('an unclosed body takes the rest of the stream', function () {
      mq.latex('\\python{x = (1,');
      // serializer re-wraps the consumed remainder so it reparses to itself
      assert.equal(mq.latex(), '\\python{x = (1,}');
      assert.equal(codeText(), 'x = (1,');
    });
  });

  suite('typing', function () {
    setup(function () {
      mq.latex('\\python{}');
      mq.keystroke('Left'); // descend into the empty block
    });

    test('every character is plain text — no math behavior inside', function () {
      mq.typedText('x^2 = {a: [1]}\\int "str" $x$');
      // ^, {, [, \, ", $ are all literal source characters
      assert.equal(codeText(), 'x^2 = {a: [1]}\\int "str" $x$');
      // backslash + unbalanced braces escape on the way out and reparse
      // to the identical body
      mq.latex(mq.latex());
      assert.equal(codeText(), 'x^2 = {a: [1]}\\int "str" $x$');
    });

    test('the { that opens the block is a delimiter, not code', function () {
      // simulate \python + { typed through the latex command input
      mq.latex('');
      mq.typedText('\\');
      mq.typedText('python');
      mq.typedText('{');
      assert.equal(codeText(), '');
      assert.equal(mq.latex(), '\\python{}');
      mq.typedText('x');
      assert.equal(codeText(), 'x');
    });

    test('Enter inserts a newline character, not a displaylines row', function () {
      mq.typedText('a = 1');
      mq.keystroke('Enter');
      mq.typedText('b = 2');
      assert.equal(codeText(), 'a = 1\nb = 2');
      assert.equal(mq.latex(), '\\python{a = 1\nb = 2}');
      // no \displaylines wrapper got created around the field
      assert.equal(
        mq.__controller.root.domFrag().oneElement().querySelector(
          '.mq-displaylines'
        ),
        null
      );
    });

    test('Tab inserts a tab character', function () {
      mq.typedText('x');
      mq.keystroke('Tab');
      assert.equal(codeText(), 'x\t');
    });

    test('Up/Down step between source lines; Up on line 1 moves out', function () {
      mq.latex('\\python{ab\ncd}');
      var movedOut = 0;
      mq.config({ handlers: { upOutOf: function () { movedOut++; } } });
      mq.keystroke('Left'); // caret after 'd' on line 2, goal column 2
      mq.keystroke('Up');
      mq.typedText('X'); // lands on line 1 at column 2
      assert.equal(codeText(), 'abX\ncd');
      assert.equal(movedOut, 0);
      mq.keystroke('Up'); // already on line 1 — bubbles to the field edge
      assert.equal(movedOut, 1);
    });

    test('Backspace inside deletes a char; at the left edge it exits', function () {
      mq.latex('\\python{abc}');
      mq.keystroke('Left'); // enter at right end
      mq.keystroke('Backspace');
      assert.equal(codeText(), 'ab');
      mq.keystroke('Backspace Backspace');
      assert.equal(codeText(), '');
      assert.equal(mq.latex(), '\\python{}');
      mq.keystroke('Backspace'); // empty block: caret exits left of it
      mq.keystroke('Backspace'); // deletes the whole \python{} atom
      assert.equal(mq.latex(), '');
    });
  });

  suite('the block keeps upstream structure', function () {
    test('the element holds a single text node — delimiters are CSS', function () {
      mq.latex('\\python{x = 1}');
      mq.keystroke('Ctrl-End'); // park the caret outside the block
      var el = pythonBlockEl();
      assert.equal(el.childNodes.length, 1);
      assert.equal(el.childNodes[0].nodeType, Node.TEXT_NODE);
      var before = getComputedStyle(el, ':before').content;
      var after = getComputedStyle(el, ':after').content;
      assert.ok(before.indexOf('python') !== -1, 'opening delimiter');
      assert.equal(after, '"}"');
    });
  });
});
