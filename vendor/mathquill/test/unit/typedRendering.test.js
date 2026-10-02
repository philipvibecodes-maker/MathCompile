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
});
