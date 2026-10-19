suite('set operations (\\cup \\cap -> \\bigcup \\bigcap)', function () {
  const $ = window.test_only_jquery;
  var mq;
  setup(function () {
    mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
  });

  suite('aliases', function () {
    test('\\union and \\intersect serialize as \\cup and \\cap', function () {
      mq.latex('A \\union B');
      assert.equal(mq.latex(), 'A\\cup B');
      mq.latex('A \\intersect B');
      assert.equal(mq.latex(), 'A\\cap B');
    });
  });

  suite('script upgrade', function () {
    test('a typed subscript upgrades \\cup to \\bigcup', function () {
      mq.latex('\\cup');
      mq.typedText('_').typedText('i');
      assert.equal(mq.latex(), '\\bigcup_{i}^{ }');
    });

    test('a typed superscript upgrades \\cap to \\bigcap', function () {
      mq.latex('\\cap');
      mq.typedText('^').typedText('n');
      assert.equal(mq.latex(), '\\bigcap_{ }^{n}');
    });

    test('written \\cup_{i=1}^{n} becomes \\bigcup_{i=1}^{n}', function () {
      mq.write('\\cup_{i=1}^{n}');
      assert.equal(mq.latex(), '\\bigcup_{i=1}^{n}');
    });

    test('written \\cap_{i=1}^{n} becomes \\bigcap_{i=1}^{n}', function () {
      mq.write('\\cap_{i=1}^{n}');
      assert.equal(mq.latex(), '\\bigcap_{i=1}^{n}');
    });

    test('pasted \\cup_{i}^{n} upgrades too', function () {
      mq.latex('\\cup_{i}^{n}');
      assert.equal(mq.latex(), '\\bigcup_{i}^{n}');
    });

    test('the upgraded op renders like a \\sum-style large operator', function () {
      mq.latex('\\cup');
      mq.typedText('_').typedText('i');
      const $el = $(mq.el());
      assert.equal($el.find('.mq-large-operator').length, 1);
      assert.equal($el.find('.mq-from').length, 1);
      assert.equal($el.find('.mq-to').length, 1);
    });

    test('the caret lands inside the new bound', function () {
      mq.latex('\\cup');
      mq.typedText('_');
      mq.typedText('i');
      assert.equal(mq.latex(), '\\bigcup_{i}^{ }');
      // still inside the bound — next typed char joins it
      mq.typedText('+1');
      assert.equal(mq.latex(), '\\bigcup_{i+1}^{ }');
    });
  });

  suite('big ops', function () {
    test('\\bigcup/\\bigcap round-trip with bounds', function () {
      mq.latex('\\bigcup_{i=1}^{n}');
      assert.equal(mq.latex(), '\\bigcup_{i=1}^{n}');
      mq.latex('\\bigcap_{i=1}^{n}');
      assert.equal(mq.latex(), '\\bigcap_{i=1}^{n}');
    });

    test('a typed script fills an empty \\bigcup bound', function () {
      mq.latex('\\bigcup_{ }^{ }');
      mq.moveToRightEnd().typedText('_').typedText('i');
      assert.equal(mq.latex(), '\\bigcup_{i}^{ }');
    });

    test('a second script stays a sibling when the bound is filled', function () {
      mq.latex('\\bigcup_{i}^{ }');
      mq.moveToRightEnd().typedText('_').typedText('j');
      assert.equal(mq.latex(), '\\bigcup_{i}^{ }_{j}');
    });
  });
});
