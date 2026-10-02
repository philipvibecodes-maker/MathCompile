// Vendored patch tests: typed-path rendering regressions — every input
// is exercised through typedText()/keystroke() the way a user types it,
// not just mq.latex() (regressions found by sweeping the PR-27 fixture
// inputs through the typed path).
suite('typed rendering', function () {
  const $ = window.test_only_jquery;
  var mq, el;

  setup(function () {
    el = $('<span></span>').appendTo('#mock')[0];
    mq = MQ.MathField(el);
  });

  function typed(input) {
    mq.latex('');
    for (var i = 0; i < input.length; i += 1) mq.typedText(input[i]);
    // accept a trailing open latex-command input, like a user's Enter
    if (el.querySelector('.mq-latex-command-input')) mq.keystroke('Enter');
  }
  function rootEl() {
    return mq.__controller.root.domFrag().oneElement();
  }
  function rootText() {
    return rootEl().textContent;
  }

  suite('entity-string glyphs render as glyphs, not literal text', function () {
    var cases = [
      ['\\iiint', '∭'],
      ['\\idotsint', '⋰'],
      ['\\ointctrclockwise', '∳'],
      ['\\varointclockwise', '∲'],
      ['\\smallint', '∫'],
      ['\\ointclockwise', '∲'],
      ['\\intop', '∫'],
      ['\\ointop', '∮'],
      ['\\bigsqcap', '⨅'],
      ['\\varinjlim', 'lim→'],
      ['\\varprojlim', 'lim←']
    ];
    cases.forEach(function (pair) {
      var input = pair[0],
        glyph = pair[1];
      test(input + ' → ' + glyph, function () {
        mq.latex(input);
        assert.ok(rootText().indexOf(glyph) > -1, 'parsed ' + input);
        assert.ok(rootText().indexOf('&#') === -1, 'parsed ' + input);
        typed(input);
        assert.ok(rootText().indexOf(glyph) > -1, 'typed ' + input);
        assert.ok(rootText().indexOf('&#') === -1, 'typed ' + input);
      });
    });

    var belowMarks = [
      ['\\d{u}', '̣'],
      ['\\b{o}', '̲'],
      ['\\k{x}', '̨']
    ];
    belowMarks.forEach(function (pair) {
      var input = pair[0],
        mark = pair[1];
      test(input + ' → ' + mark, function () {
        mq.latex(input);
        assert.ok(rootText().indexOf(mark) > -1, 'parsed ' + input);
        typed(input);
        assert.ok(rootText().indexOf(mark) > -1, 'typed ' + input);
      });
    });
  });

  suite('zero-block commands do not crash on insertion', function () {
    // commands with no editable blocks (\verb, \end) used to crash in
    // placeCursor — there is no child block for the caret to land in
    var cases = [
      ['\\verb|x|', '\\verb\\left|x\\right|'],
      ['\\end{foo}', '\\end{}\\left\\{foo\\right\\}'],
      [
        '\\begin{foo}x\\end{foo}',
        '\\begin{foo} x\\end{}\\left\\{foo\\right\\}'
      ],
      [
        '\\begin{gathered}a\\\\b\\end{gathered}',
        '\\begin{gathered}a\\ b\\end{}\\left\\{gathered\\right\\}\\\\ \\end{gathered}'
      ],
      [
        '\\begin{smallmatrix}a\\end{smallmatrix}',
        '\\begin{smallmatrix}a\\end{}\\left\\{smallmatrix\\right\\}&\\\\&\\end{smallmatrix}'
      ]
    ];
    cases.forEach(function (pair) {
      var input = pair[0],
        latex = pair[1];
      test(input, function () {
        typed(input);
        assert.equal(mq.latex(), latex);
      });
    });
  });

  suite('parser-only commands typed in the field do not crash', function () {
    var cases = [
      // sized-delimiter prefixes (\big \bigl \middle …) are parser-only,
      // like \left — a typed one inserts nothing and the following
      // delimiter keystroke auto-pairs on its own
      ['\\bigl(x\\bigr)', '\\left(x\\right)'],
      ['\\Bigl[x\\Bigr]', '\\left[x\\right]'],
      ['\\left(x\\middle|y\\right)', '\\left(\\left(x\\right|y\\right)'],
      // raw-arg commands can't collect their argument typed — they
      // insert nothing (same convention as \textcolor)
      ['\\colorbox{red}{x}', '\\left\\{red\\right\\}\\left\\{x\\right\\}'],
      [
        '\\fcolorbox{blue}{yellow}{x}',
        '\\left\\{blue\\right\\}\\left\\{yellow\\right\\}\\left\\{x\\right\\}'
      ],
      ['\\href{u}{x}', '\\left\\{u\\right\\}\\left\\{x\\right\\}']
    ];
    cases.forEach(function (pair) {
      var input = pair[0],
        latex = pair[1];
      test(input, function () {
        typed(input);
        assert.equal(mq.latex(), latex);
      });
    });

    test('\\begin{array}{cc}a&b typed mid-cell does not crash', function () {
      typed('\\begin{array}{cc}a&b\\end{array}');
      assert.ok(mq.latex().length > 0);
    });
  });

  suite('typed \\begin{env} resolves every registered environment', function () {
    test('\\begin{aligned} resolves to the aligned grid', function () {
      typed('\\begin{aligned}');
      assert.equal(mq.latex(), '\\begin{aligned}&\\\\&\\end{aligned}');
      assert.equal(rootEl().querySelectorAll('td').length, 4);
    });

    test('\\begin{aligned}a&=b keeps cell content without crashing', function () {
      typed('\\begin{aligned}a&=b');
      assert.equal(
        mq.latex(),
        '\\begin{aligned}a\\&=b&\\\\&\\end{aligned}'
      );
    });

    test('\\begin{align} resolves like aligned', function () {
      typed('\\begin{align}');
      assert.equal(mq.latex(), '\\begin{aligned}&\\\\&\\end{aligned}');
    });

    test('\\begin{alignat} resolves to a grid without crashing', function () {
      typed('\\begin{alignat}');
      assert.equal(mq.latex(), '\\begin{alignat}{}&\\\\&\\end{alignat}');
    });
  });
});
