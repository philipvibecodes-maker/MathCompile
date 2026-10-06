// ============================================================================
//  pythonBlock.ts — \python{ ... } inline Python source block
// ============================================================================
//
// `\python{ ... }` marks an inline Python source region: everything between
// the braces is typed, selected and deleted as plain characters — none of
// MathQuill's math behavior applies inside (no autoCommands, no SupSub or
// fraction typing, no command input on `\`). The `\python{` and `}`
// delimiters stay visible: they're rendered as ::before/::after pseudo
// content on the block's span, so the DOM keeps upstream's TextBlock
// contract — a root span holding text nodes only — and fuse/seek/caret
// placement need no delimiter bookkeeping.
//
// What's different from TextBlock:
//
//   - parser() accepts arbitrary-depth balanced braces and newlines (the
//     upstream text-mode regex caps nesting at 3), and folds the \{ \} \\
//     escapes that latexRecursive emits back to literal characters.
//   - write() treats every character — including `$` — as text.
//   - Enter inserts a real '\n' character: keystroke() swallows the
//     keypress so it never reaches typedText('\n') -> handle('enter'), and
//     the insertLineBreakAtCursor patch in environments.ts covers
//     programmatic Enter (mq.typedText('\n') / mq.insertLineBreak()).
//   - Tab inserts '\t'; Home/End move to the current source line's edges;
//     Up/Down move vertically between source lines, bubbling out at the
//     edge lines so the field's upOutOf/downOutOf -> move-out still works.
//   - seek() uses caretRangeFromPoint (with the clientY stashed on the
//     cursor by Controller_mouse.seek) so clicks on later lines land at the
//     rendered position; upstream's flat-width guess only works for one
//     line.
//   - The code is syntax-highlighted via the CSS Custom Highlight API
//     (::highlight(mq-py-*) rules in editable.less) — ranges over the live
//     text node, so the DOM stays a single editable text node and there is
//     no span soup to corrupt selection or deletion.
//   - reflow() refreshes the highlights — reflow is bubbled by every
//     mutating path (write, delete, paste, fuse).
//
// SOURCES_FULL only: needs TextBlock (commands/text.ts). Concatenated after
// extraCommands.ts and before environments.ts — insertLineBreakAtCursor in
// environments.ts references PythonBlock and class declarations don't
// hoist across concatenated files.
// ============================================================================

// ---------------------------------------------------------------------------
// Python tokenizer — same five token classes as src/calc/python-highlight.ts
// (str, comment, kw, num, call); keep the regexes in sync. Produces
// [start,end) char-offset ranges for the CSS Custom Highlight API rather
// than token spans, so the editable DOM stays plain text.
// ---------------------------------------------------------------------------
type PyTokenCls = 'str' | 'comment' | 'kw' | 'num' | 'call';
interface PyTokenRange {
  start: number;
  end: number;
  cls: PyTokenCls;
}
// Triple-quoted strings come first — docstrings span lines and must not get
// keyword/call coloring on their contents.
const PY_TOKEN_RE =
  /("""[\s\S]*?"""|'''[\s\S]*?'''|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")|(#[^\n]*)|(\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|try|while|with|yield|True|False)\b)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_]\w*(?=\s*\())/g;
const PY_TOKEN_CLASSES: readonly PyTokenCls[] = [
  'str',
  'comment',
  'kw',
  'num',
  'call',
];

function pyTokenRanges(code: string): PyTokenRange[] {
  const ranges: PyTokenRange[] = [];
  PY_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PY_TOKEN_RE.exec(code)) !== null) {
    for (let g = 1; g <= PY_TOKEN_CLASSES.length; g++) {
      if (m[g] === undefined) continue;
      ranges.push({
        start: m.index,
        end: m.index + m[g].length,
        cls: PY_TOKEN_CLASSES[g - 1],
      });
      break;
    }
  }
  return ranges;
}

// A Range covering chars [start,end) of el's concatenated text, across
// however many DOM text nodes the pieces are currently split into.
function textRangeForOffsets(
  el: Element,
  s: number,
  e: number
): Range | undefined {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let node: Node | null;
  let sNode: Node | undefined;
  let sOff = 0;
  while ((node = walker.nextNode())) {
    const len = (node as Text).data.length;
    if (sNode === undefined && s <= acc + len) {
      sNode = node;
      sOff = s - acc;
    }
    if (e <= acc + len) {
      if (sNode === undefined) return undefined;
      const range = document.createRange();
      range.setStart(sNode, sOff);
      range.setEnd(node, e - acc);
      return range;
    }
    acc += len;
  }
  return undefined;
}

// Rebuild every `mq-py-*` Highlight in the document: the highlight registry
// is global and registry.set replaces a whole named highlight, so a
// per-block refresh would drop the other fields' ranges.
function refreshPythonHighlights() {
  const css: any = (window as any).CSS;
  const registry = css && css.highlights;
  const HighlightCtor = (window as any).Highlight;
  if (
    !registry ||
    typeof registry.set !== 'function' ||
    typeof HighlightCtor !== 'function'
  )
    return;
  const ranges: { [cls: string]: Range[] } = {};
  const codeEls = document.querySelectorAll('.mq-python');
  for (let i = 0; i < codeEls.length; i++) {
    const el = codeEls[i];
    const code = el.textContent || '';
    const tokens = pyTokenRanges(code);
    for (let t = 0; t < tokens.length; t++) {
      const tok = tokens[t];
      const range = textRangeForOffsets(el, tok.start, tok.end);
      if (!range) continue;
      (ranges[tok.cls] || (ranges[tok.cls] = [])).push(range);
    }
  }
  for (let c = 0; c < PY_TOKEN_CLASSES.length; c++) {
    const cls = PY_TOKEN_CLASSES[c];
    registry.set('mq-py-' + cls, new HighlightCtor(...(ranges[cls] || [])));
  }
}

// Serialize the code body for latex(): source that is brace-balanced and
// backslash-free stays raw (the readable common case); anything else gets
// \ { } escaped so the balanced scan in PYTHON_BODY can't stop early and
// the pair round-trips byte-exact.
function escapePythonBody(code: string): string {
  if (code.indexOf('\\') === -1) {
    let depth = 0;
    let balanced = true;
    for (let i = 0; i < code.length; i++) {
      const c = code[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      if (depth < 0) {
        balanced = false;
        break;
      }
    }
    if (balanced && depth === 0) return code;
  }
  return code
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

// The \python body after the opening `{`: raw source scanned to the
// depth-0 `}` that closes it. `\{`, `\}` and `\\` are the literal escapes
// escapePythonBody emits; an unclosed body takes the rest of the stream so
// one bad latex string can't blank the field.
const PYTHON_BODY: Parser<string> = new Parser(function (
  stream: string,
  onSuccess: (stream: string, result: string) => UnknownParserResult,
  _onFailure: (stream: string, msg: string) => UnknownParserResult
) {
  let depth = 1;
  for (let i = 0; i < stream.length; i++) {
    const c = stream[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0)
        return onSuccess(stream.slice(i + 1), stream.slice(0, i));
    }
  }
  return onSuccess('', stream);
});

class PythonBlock extends TextBlock {
  ctrlSeq = '\\python';
  ariaLabel = 'Python block';
  mathspeakTemplate = ['Python', 'EndPython'];

  parser() {
    var block = this;
    return Parser.optWhitespace
      .then(Parser.string('{'))
      .then(PYTHON_BODY)
      .map(function (body) {
        var code = body.replace(/\\([{}\\])/g, '$1');
        if (code !== '') new TextPiece(code).adopt(block, 0, 0);
        return block;
      });
  }

  html() {
    var out = h('span', { class: 'mq-text-mode mq-python' }, [
      h.text(this.textContents()),
    ]);
    this.setDOM(out);
    NodeBase.linkElementByCmdNode(out, this);
    // Bind the left-end piece to the code text node: upstream leaves
    // TextPieces DOM-less until a fuse binds them, and appendText on an
    // unbound piece throws.
    var endsL = this.getEnd(L);
    if (endsL instanceof TextPiece && endsL.domFrag().isEmpty())
      endsL.setDOM(out.childNodes[0] as Text);
    return out;
  }

  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);
    // Always emit the wrapper so an empty block round-trips as \python{}.
    ctx.uncleanedLatex += '\\python{';
    ctx.uncleanedLatex += escapePythonBody(this.textContents());
    ctx.uncleanedLatex += '}';
    this.checkCursorContextClose(ctx);
  }

  // --- editing -----------------------------------------------------------

  // Every character — `$` included — is plain text in a source block.
  write(cursor: Cursor, ch: string) {
    cursor.show().deleteSelection();
    var cursorL = cursor[L];
    if (!cursorL) new TextPiece(ch).createLeftOf(cursor);
    else if (cursorL instanceof TextPiece) cursorL.appendText(ch);
    this.bubble(function (node) {
      node.reflow();
      return undefined;
    });
    cursor.controller.aria.alert(ch);
  }

  keystroke(key: string, e: KeyboardEvent | undefined, ctrlr: Controller) {
    var cursor = ctrlr.cursor;
    switch (key) {
      // Enter is a newline in the source, not a line break in the field —
      // preventing the keydown default keeps the keypress -> typedText('\n')
      // -> handle('enter') -> insertLineBreak path from firing too.
      case 'Enter':
        this.write(cursor, '\n');
        e?.preventDefault();
        ctrlr.notify('edit');
        ctrlr.scrollHoriz();
        return;
      case 'Tab':
        this.write(cursor, '\t');
        e?.preventDefault();
        ctrlr.notify('edit');
        ctrlr.scrollHoriz();
        return;
      case 'Home': {
        var text = this.textContents();
        this.placeCaret(
          text.lastIndexOf('\n', this.caretOffset(cursor) - 1) + 1,
          cursor
        );
        e?.preventDefault();
        ctrlr.scrollHoriz();
        return;
      }
      case 'End': {
        var endText = this.textContents();
        var nextBreak = endText.indexOf('\n', this.caretOffset(cursor));
        this.placeCaret(
          nextBreak === -1 ? endText.length : nextBreak,
          cursor
        );
        e?.preventDefault();
        ctrlr.scrollHoriz();
        return;
      }
    }
    return super.keystroke(key, e, ctrlr);
  }

  // Up/Down step between source lines; at the edge line they return true so
  // the moveUpDown bubble continues to the root's upOutOf/downOutOf and the
  // field emits its move-out (cell hop) event as usual.
  upOutOf(cursor: Cursor) {
    return this.verticalMove(L, cursor) ? undefined : (true as any);
  }
  downOutOf(cursor: Cursor) {
    return this.verticalMove(R, cursor) ? undefined : (true as any);
  }

  // Char offset of the caret within the block's text.
  private caretOffset(cursor: Cursor): number {
    var off = 0;
    for (
      var n = this.getEnd(L) as TextPiece | undefined;
      n && n !== cursor[R];
      n = n[R] as TextPiece | undefined
    ) {
      off += n.textStr.length;
    }
    return off;
  }

  // Fuse pieces and drop the caret at a char offset — same shape as the
  // tail of TextBlock.seek. The caret detaches first: fuse prays the
  // element holds a single text node, and a shown caret span inside it
  // would be a second child.
  private placeCaret(offset: number, cursor: Cursor) {
    cursor.hide();
    var textPc = TextBlockFuseChildren(this);
    if (!textPc || offset <= 0) cursor.insAtLeftEnd(this);
    else if (offset >= textPc.textStr.length) cursor.insAtRightEnd(this);
    else cursor.insLeftOf(textPc.splitRight(offset));
    cursor.show();
  }

  // Move the caret one source line up (dir === L) or down (dir === R),
  // keeping a goal column across repeats in cursor.upDownCache (cleared on
  // any non-upDown notify — the same mechanism arrows into sub/sup use).
  private verticalMove(dir: Direction, cursor: Cursor): boolean {
    var text = this.textContents();
    var caret = this.caretOffset(cursor);
    var lineStart = text.lastIndexOf('\n', caret - 1) + 1;
    var col = caret - lineStart;
    if (dir === L && lineStart === 0) return false;
    var nextBreak = text.indexOf('\n', caret);
    if (dir === R && nextBreak === -1) return false;

    var cacheKey = 'python:' + this.id;
    var cache = (cursor.upDownCache as any)[cacheKey];
    var goal = typeof cache === 'number' ? cache : col;
    var target: number;
    if (dir === L) {
      var prevStart =
        lineStart >= 2 ? text.lastIndexOf('\n', lineStart - 2) + 1 : 0;
      target = Math.min(prevStart + goal, lineStart - 1);
    } else {
      var nextStart = nextBreak + 1;
      var nextEnd = text.indexOf('\n', nextStart);
      var nextLen = (nextEnd === -1 ? text.length : nextEnd) - nextStart;
      target = nextStart + Math.min(goal, nextLen);
    }
    (cursor.upDownCache as any)[cacheKey] = goal;
    this.placeCaret(target, cursor);
    return true;
  }

  seek(clientX: number, cursor: Cursor) {
    cursor.hide();
    var el: HTMLElement | undefined;
    if (!this.domFrag().isEmpty()) el = this.domFrag().oneElement();
    var placed = false;
    // Multi-line source needs the click's rendered position, not a flat
    // width guess: caretRangeFromPoint maps (x, y) to the nearest text
    // position, which the Range below converts to a char offset.
    var caretFromPoint = (document as any).caretRangeFromPoint;
    if (
      el &&
      cursor.seekClientY !== undefined &&
      typeof caretFromPoint === 'function'
    ) {
      try {
        var point = caretFromPoint.call(document, clientX, cursor.seekClientY) as
          | Range
          | undefined;
        if (point && el.contains(point.startContainer)) {
          var before = document.createRange();
          before.selectNodeContents(el);
          before.setEnd(point.startContainer, point.startOffset);
          this.placeCaret(before.toString().length, cursor);
          placed = true;
        }
      } catch (_e) {
        // fall through to the flat-width approximation
      }
    }
    if (!placed && el) {
      var textPc = TextBlockFuseChildren(this);
      if (!textPc) return;
      var textNode = el.childNodes[0] as Text | undefined;
      if (textNode && textNode.nodeType === 3) {
        var range = document.createRange();
        range.selectNodeContents(textNode);
        var rects = range.getClientRects();
        if (rects.length === 1) {
          var left = rects[0].left;
          var width = rects[0].width;
          var approx = Math.round(
            ((clientX - left) / width) * textPc.textStr.length
          );
          this.placeCaret(approx, cursor);
        } else {
          cursor.insAtLeftEnd(this);
        }
      }
    }
    cursor.show();

    // Anticursor bookkeeping, identical to TextBlock.seek — needed so
    // mouse-drag selection anchors inside the block.
    if (!cursor.anticursor) {
      const cursorL = cursor[L];
      this.anticursorPosition =
        cursorL && (cursorL as TextPiece).textStr.length;
    } else if (cursor.anticursor.parent === this) {
      const cursorL = cursor[L];
      var cursorPosition = cursorL && (cursorL as TextPiece).textStr.length;
      if (this.anticursorPosition === cursorPosition) {
        cursor.anticursor = Anticursor.fromCursor(cursor);
      } else {
        if (this.anticursorPosition! < cursorPosition!) {
          var newTextPc = (cursorL as any as TextPiece).splitRight(
            this.anticursorPosition!
          );
          cursor[L] = newTextPc;
        } else {
          const cursorR = cursor[R] as any as TextPiece;
          var newTextPc = cursorR.splitRight(
            this.anticursorPosition! - cursorPosition!
          );
        }
        cursor.anticursor = new Anticursor(this, newTextPc[L], newTextPc);
      }
    }
  }

  blur(cursor?: Cursor) {
    MathBlock.prototype.blur.call(this, cursor);
    if (!cursor) return;
    // An empty block stays — \python{} is a real cell (the delimiters are
    // visible chrome, so nothing reads as missing), unlike \text which
    // self-removes.
    TextBlockFuseChildren(this);
  }

  reflow() {
    refreshPythonHighlights();
  }
}

LatexCmds.python = PythonBlock;
