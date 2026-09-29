suite('focusBlur', function () {
  const $ = window.test_only_jquery;
  function assertHasFocus(mq, name, invert) {
    assert.ok(
      !!invert ^ ($(mq.el()).find('textarea')[0] === document.activeElement),
      name + (invert ? ' does not have focus' : ' has focus')
    );
  }

  suite('handlers can shift focus away', function () {
    var mq, mq2, wasUpOutOfCalled;
    setup(function () {
      mq = MQ.MathField($('<span></span>').appendTo('#mock')[0], {
        handlers: {
          upOutOf: function () {
            wasUpOutOfCalled = true;
            mq2.focus();
          }
        }
      });
      mq2 = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
      wasUpOutOfCalled = false;
    });

    function triggerUpOutOf(mq) {
      trigger.keydown(mq.el().querySelector('textarea'), 'ArrowUp');
      assert.ok(wasUpOutOfCalled);
    }

    test('normally', function () {
      mq.focus();
      assertHasFocus(mq, 'mq');

      triggerUpOutOf(mq);
      assertHasFocus(mq2, 'mq2');
    });

    test("even if there's a selection", function (done) {
      mq.focus();
      assertHasFocus(mq, 'mq');

      mq.typedText('asdf');
      assert.equal(mq.latex(), 'asdf');

      mq.keystroke('Shift-Left');
      setTimeout(function () {
        assert.equal($(mq.el()).find('textarea').val(), 'f');

        triggerUpOutOf(mq);
        assertHasFocus(mq2, 'mq2');
        done();
      });
    });
  });

  test('select behaves normally after blurring and re-focusing', function (done) {
    var mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);

    mq.focus();
    assertHasFocus(mq, 'mq');

    mq.typedText('asdf');
    assert.equal(mq.latex(), 'asdf');

    mq.keystroke('Shift-Left');
    setTimeout(function () {
      assert.equal($(mq.el()).find('textarea').val(), 'f');

      mq.blur();
      assertHasFocus(mq, 'mq', 'not');
      setTimeout(function () {
        assert.equal($(mq.el()).find('textarea').val(), '');

        mq.focus();
        assertHasFocus(mq, 'mq');

        mq.keystroke('Shift-Left');
        setTimeout(function () {
          assert.equal($(mq.el()).find('textarea').val(), 'd');
          done();
        });
      }, 100);
    });
  });

  test('blur event fired when math field loses focus', function (done) {
    var mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);

    mq.focus();
    assertHasFocus(mq, 'math field');

    var textarea = $('<textarea>').appendTo('#mock').focus();
    assert.ok(textarea[0] === document.activeElement, 'textarea has focus');

    setTimeout(function () {
      assert.ok(
        !$(mq.el()).hasClass('mq-focused'),
        'math field is visibly blurred'
      );

      $('#mock').empty();
      done();
    });
  });

  test('full range selected on focusing tabbable static math', function () {
    var mq = MQ.StaticMath(
      $('<span>1234\\times 10^{23}</span>').appendTo('#mock')[0],
      { tabindex: 0 }
    );

    mq.focus();

    assertHasFocus(mq, 'math field');
    assert.equal(
      mq.selection().latex,
      '1234\\times10^{23}',
      'full textarea selected'
    );

    assert.equal($(document.activeElement).attr('tabindex'), '0');
    mq.config({ tabindex: -1 });
    assert.equal(
      $(document.activeElement).attr('tabindex'),
      '-1',
      'tab index updated when tabindex is set to -1'
    );

    mq.config({ tabindex: 0 });
    assert.equal(
      $(document.activeElement).attr('tabindex'),
      '0',
      'tab index restored when tabindex is set to 0'
    );

    mq.blur();
    assertHasFocus(mq, 'math field', 'not');
  });

  test('tabindex for editable math', function () {
    var mq = MQ.MathField($('<span></span>').appendTo('#mock')[0], {
      tabindex: -1
    });

    mq.focus();
    mq.typedText('1+1');

    assertHasFocus(mq, 'math field');
    assert.equal(mq.latex(), '1+1', 'latex populated');

    assert.equal($(document.activeElement).attr('tabindex'), '-1');
    mq.config({ tabindex: 0 });
    assert.equal(
      $(document.activeElement).attr('tabindex'),
      '0',
      'tab index updated tabindex is set to 0'
    );

    mq.config({ tabindex: -1 });
    assert.equal(
      $(document.activeElement).attr('tabindex'),
      '-1',
      'tab index restored when tabindex is set to -1'
    );

    mq.blur();
    assertHasFocus(mq, 'math field', 'not');
  });

  test('full range selected on focusing un-tabbable static math', function () {
    var mq = MQ.StaticMath(
      $('<span>1234\\times 10^{23}</span>').appendTo('#mock')[0]
    );

    mq.focus();

    assertHasFocus(mq, 'math field');
    assert.equal(
      mq.selection().latex,
      '1234\\times10^{23}',
      'full textarea selected'
    );

    assert.equal($(document.activeElement).attr('tabindex'), '-1');

    mq.blur();
    assertHasFocus(mq, 'math field', 'not');
  });

  test('static math does not focus on click', function (done) {
    var mq = MQ.StaticMath(
      $('<span>1234\\times 10^{23}</span>').appendTo('#mock')[0]
    );

    const clickEvent = new Event('mousedown', {
      bubbles: true,
      cancelable: true
    });

    mq.el().dispatchEvent(clickEvent);
    setTimeout(function () {
      assertHasFocus(mq, 'math field', 'not');
      done();
    }, 100);
  });

  test('editable math does focus on click', function (done) {
    var mq = MQ.MathField(
      $('<span>1234\\times 10^{23}</span>').appendTo('#mock')[0]
    );

    const clickEvent = new Event('mousedown', {
      bubbles: true,
      cancelable: true
    });

    mq.el().dispatchEvent(clickEvent);
    setTimeout(function () {
      assertHasFocus(mq, 'math field');
      done();
    }, 100);
  });
});
