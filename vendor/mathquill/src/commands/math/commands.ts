/***************************
 * Commands and Operators.
 **************************/
var SVG_SYMBOLS = {
  sqrt: {
    width: '',
    html: () =>
      h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 32 54' }, [
        h('path', {
          d: 'M0 33 L7 27 L12.5 47 L13 47 L30 0 L32 0 L13 54 L11 54 L4.5 31 L0 33'
        })
      ])
  },
  '|': {
    width: '.4em',
    html: () =>
      h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 10 54' }, [
        h('path', { d: 'M4.4 0 L4.4 54 L5.6 54 L5.6 0' })
      ])
  },
  '[': {
    width: '.55em',
    html: () =>
      h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 11 24' }, [
        h('path', { d: 'M8 0 L3 0 L3 24 L8 24 L8 23 L4 23 L4 1 L8 1' })
      ])
  },
  ']': {
    width: '.55em',
    html: () =>
      h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 11 24' }, [
        h('path', { d: 'M3 0 L8 0 L8 24 L3 24 L3 23 L7 23 L7 1 L3 1' })
      ])
  },
  '(': {
    width: '.55em',
    html: () =>
      h('svg', { preserveAspectRatio: 'none', viewBox: '3 0 106 186' }, [
        h('path', {
          d: 'M85 0 A61 101 0 0 0 85 186 L75 186 A75 101 0 0 1 75 0'
        })
      ])
  },
  ')': {
    width: '.55em',
    html: () =>
      h('svg', { preserveAspectRatio: 'none', viewBox: '3 0 106 186' }, [
        h('path', {
          d: 'M24 0 A61 101 0 0 1 24 186 L34 186 A75 101 0 0 0 34 0'
        })
      ])
  },
  '{': {
    width: '.7em',
    html: () =>
      h('svg', { preserveAspectRatio: 'none', viewBox: '10 0 210 350' }, [
        h('path', {
          d: 'M170 0 L170 6 A47 52 0 0 0 123 60 L123 127 A35 48 0 0 1 88 175 A35 48 0 0 1 123 223 L123 290 A47 52 0 0 0 170 344 L170 350 L160 350 A58 49 0 0 1 102 301 L103 220 A45 40 0 0 0 58 180 L58 170 A45 40 0 0 0 103 130 L103 49 A58 49 0 0 1 161 0'
        })
      ])
  },
  '}': {
    width: '.7em',
    html: () =>
      h('svg', { preserveAspectRatio: 'none', viewBox: '10 0 210 350' }, [
        h('path', {
          d: 'M60 0 L60 6 A47 52 0 0 1 107 60 L107 127 A35 48 0 0 0 142 175 A35 48 0 0 0 107 223 L107 290 A47 52 0 0 1 60 344 L60 350 L70 350 A58 49 0 0 0 128 301 L127 220 A45 40 0 0 1 172 180 L172 170 A45 40 0 0 1 127 130 L127 49 A58 49 0 0 0 70 0'
        })
      ])
  },
  '&#8741;': {
    width: '.7em',
    html: () =>
      h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 10 54' }, [
        h('path', { d: 'M3.2 0 L3.2 54 L4 54 L4 0 M6.8 0 L6.8 54 L6 54 L6 0' })
      ])
  },
  '&lang;': {
    width: '.55em',
    html: () =>
      h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 10 54' }, [
        h('path', { d: 'M6.8 0 L3.2 27 L6.8 54 L7.8 54 L4.2 27 L7.8 0' })
      ])
  },
  '&rang;': {
    width: '.55em',
    html: () =>
      h('svg', { preserveAspectRatio: 'none', viewBox: '0 0 10 54' }, [
        h('path', { d: 'M3.2 0 L6.8 27 L3.2 54 L2.2 54 L5.8 27 L2.2 0' })
      ])
  }
};

const ArrowText = '\u27A4';

class Style extends MathCommand {
  shouldNotSpeakDelimiters: boolean | undefined;

  constructor(
    ctrlSeq: string,
    tagName: HTMLTagName,
    attrs: { class: string },
    ariaLabel?: string,
    opts?: {
      shouldNotSpeakDelimiters?: boolean;
      beforeChild?: () => HTMLElement;
      afterChild?: () => HTMLElement;
    }
  ) {
    super(
      ctrlSeq,
      new DOMView(1, (blocks) => {
        return h.block(tagName, attrs, blocks[0], {
          beforeChild: opts?.beforeChild?.(),
          afterChild: opts?.afterChild?.()
        });
      })
    );

    this.ariaLabel = ariaLabel || ctrlSeq.replace(/^\\/, '');
    this.mathspeakTemplate = [
      'Start' + this.ariaLabel + ',',
      'End' + this.ariaLabel
    ];
    // In most cases, mathspeak should announce the start and end of style blocks.
    // There is one exception currently (mathrm).
    this.shouldNotSpeakDelimiters = opts && opts.shouldNotSpeakDelimiters;
  }
  mathspeak(opts?: MathspeakOptions) {
    if (!this.shouldNotSpeakDelimiters || (opts && opts.ignoreShorthand)) {
      return super.mathspeak();
    }
    return this.foldChildren('', function (speech, block) {
      return speech + ' ' + block.mathspeak(opts);
    }).trim();
  }
}

//fonts
LatexCmds.mathrm = class extends Style {
  constructor() {
    super('\\mathrm', 'span', { class: 'mq-roman mq-font' }, 'Roman Font', {
      shouldNotSpeakDelimiters: true
    });
  }
  isTextBlock() {
    return true;
  }
};
LatexCmds.mathit = () =>
  new Style('\\mathit', 'i', { class: 'mq-font' }, 'Italic Font');
LatexCmds.mathbf = () =>
  new Style('\\mathbf', 'b', { class: 'mq-font' }, 'Bold Font');
LatexCmds.mathsf = () =>
  new Style(
    '\\mathsf',
    'span',
    { class: 'mq-sans-serif mq-font' },
    'Serif Font'
  );
LatexCmds.mathtt = () =>
  new Style('\\mathtt', 'span', { class: 'mq-monospace mq-font' }, 'Math Text');
LatexCmds.mathcal = () =>
  new Style(
    '\\mathcal',
    'span',
    { class: 'mq-caligraphic mq-font' },
    'Calligraphic Font'
  );
LatexCmds.mathscr = () =>
  new Style(
    '\\mathscr',
    'span',
    { class: 'mq-caligraphic mq-font' },
    'Script Font'
  );
LatexCmds.mathfrak = () =>
  new Style(
    '\\mathfrak',
    'span',
    { class: 'mq-fraktur mq-font' },
    'Fraktur Font'
  );
// \bold in math mode is boldmath — serialized canonically as \mathbf
LatexCmds.bold = () =>
  new Style('\\mathbf', 'b', { class: 'mq-font' }, 'Bold Font');
//text-decoration
LatexCmds.underline = () =>
  new Style(
    '\\underline',
    'span',
    { class: 'mq-non-leaf mq-underline' },
    'Underline'
  );
LatexCmds.overline = LatexCmds.bar = () =>
  new Style(
    '\\overline',
    'span',
    { class: 'mq-non-leaf mq-overline' },
    'Overline'
  );
LatexCmds.overrightarrow = () =>
  new Style(
    '\\overrightarrow',
    'span',
    { class: 'mq-non-leaf mq-overarrow' },
    'Over Right Arrow',
    {
      afterChild: () =>
        h('span', { class: 'mq-arrow-right-content' }, [h.text(ArrowText)])
    }
  );
LatexCmds.overleftarrow = () =>
  new Style(
    '\\overleftarrow',
    'span',
    { class: 'mq-non-leaf mq-overarrow' },
    'Over Left Arrow',
    {
      beforeChild: () =>
        h('span', { class: 'mq-arrow-left-content' }, [h.text(ArrowText)])
    }
  );
LatexCmds.overleftrightarrow = () =>
  new Style(
    '\\overleftrightarrow ',
    'span',
    { class: 'mq-non-leaf mq-overarrow' },
    'Over Left and Right Arrow',
    {
      beforeChild: () =>
        h('span', { class: 'mq-arrow-left-content' }, [h.text(ArrowText)]),
      afterChild: () =>
        h('span', { class: 'mq-arrow-right-content' }, [h.text(ArrowText)])
    }
  );
LatexCmds.overarc = () =>
  new Style(
    '\\overarc',
    'span',
    { class: 'mq-non-leaf mq-overarc' },
    'Over Arc'
  );
LatexCmds.dot = () => {
  return new MathCommand(
    '\\dot',
    new DOMView(1, (blocks) =>
      h('span', { class: 'mq-non-leaf' }, [
        h('span', { class: 'mq-dot-recurring-inner' }, [
          h('span', { class: 'mq-dot-recurring' }, [h.text(U_DOT_ABOVE)]),
          h.block('span', { class: 'mq-empty-box' }, blocks[0])
        ])
      ])
    )
  );
};

// \boxed{...} — content with a drawn frame.
LatexCmds.boxed = () =>
  new Style(
    '\\boxed',
    'span',
    { class: 'mq-non-leaf mq-boxed' },
    'Boxed'
  );

// \underbrace{x}_{label} / \overbrace{x}^{label} — the label lands as an
// ordinary sibling SupSub (same pattern as boundless integral bounds),
// so only the grouping command itself is needed here.
LatexCmds.underbrace = () =>
  new Style(
    '\\underbrace',
    'span',
    { class: 'mq-non-leaf mq-underbrace' },
    'Underbrace'
  );
LatexCmds.overbrace = () =>
  new Style(
    '\\overbrace',
    'span',
    { class: 'mq-non-leaf mq-overbrace' },
    'Overbrace'
  );

// \underset{a}{b} renders b with a below it; \overset{a}{b} with a above.
class UnderOverSet extends MathCommand {
  constructor(top: boolean) {
    super();
    this.ctrlSeq = top ? '\\overset' : '\\underset';
    this.ariaLabel = top ? 'overset' : 'underset';
    this.domView = new DOMView(2, (blocks) =>
      top
        ? h('span', { class: 'mq-overunderset mq-non-leaf' }, [
            h('span', { class: 'mq-overunderset-label' }, [
              h.block('span', {}, blocks[0])
            ]),
            h.block('span', { class: 'mq-overunderset-main' }, blocks[1])
          ])
        : h('span', { class: 'mq-overunderset mq-non-leaf' }, [
            h.block('span', { class: 'mq-overunderset-main' }, blocks[1]),
            h('span', { class: 'mq-overunderset-label' }, [
              h.block('span', {}, blocks[0])
            ])
          ])
    );
  }
  parser() {
    var self = this;
    var block = latexMathParser.block;
    var blocks = (this.blocks = [new MathBlock(), new MathBlock()]);
    for (var i = 0; i < blocks.length; i += 1) {
      blocks[i].adopt(self, self.getEnd(R), 0);
    }
    return Parser.optWhitespace
      .then(block)
      .then(function (b0) {
        b0.children().adopt(blocks[0], blocks[0].getEnd(R), 0);
        return Parser.optWhitespace.then(block).then(function (b1) {
          b1.children().adopt(blocks[1], blocks[1].getEnd(R), 0);
          return Parser.succeed(self);
        });
      });
  }
}
LatexCmds.underset = () => new UnderOverSet(false);
LatexCmds.overset = () => new UnderOverSet(true);

// `\textcolor{color}{math}` will apply a color to the given math content, where
// `color` is any valid CSS Color Value (see [SitePoint docs][] (recommended),
// [Mozilla docs][], or [W3C spec][]).
//
// [SitePoint docs]: http://reference.sitepoint.com/css/colorvalues
// [Mozilla docs]: https://developer.mozilla.org/en-US/docs/CSS/color_value#Values
// [W3C spec]: http://dev.w3.org/csswg/css3-color/#colorunits
LatexCmds.textcolor = class extends MathCommand {
  color: string | undefined;
  model = '';

  // Parser-only command: typing '\textcolor' in the command input
  // can't supply a color argument, so typed insertion is a no-op
  // (same convention as \operatorname / \mathbb).
  createLeftOf() {}
  numBlocks() {
    return 1 as const;
  }

  setColor(color: string) {
    this.color = color;
    this.domView = new DOMView(1, (blocks) =>
      h.block(
        'span',
        { class: 'mq-textcolor', style: 'color:' + color },
        blocks[0]
      )
    );
    this.ariaLabel = color.replace(/^\\/, '');
    this.mathspeakTemplate = [
      'Start ' + this.ariaLabel + ',',
      'End ' + this.ariaLabel
    ];
  }
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);
    var blocks0 = this.blocks![0];
    ctx.uncleanedLatex +=
      '\\textcolor' +
      (this.model ? '[' + this.model + ']' : '') +
      '{' +
      this.color +
      '}{';
    blocks0.latexRecursive(ctx);
    ctx.uncleanedLatex += '}';
    this.checkCursorContextClose(ctx);
  }
  parser() {
    var optWhitespace = Parser.optWhitespace;
    var string = Parser.string;
    var regex = Parser.regex;
    var self = this;

    return optWhitespace
      .then(regex(/^\[[a-zA-Z]+\]/).or(Parser.succeed('')))
      .then(function (model: string) {
        if (model) self.model = model.slice(1, -1);
        return string('{')
          .then(regex(/^[#\w\s.,()%-]*/))
          .skip(string('}'));
      })
      .then((color) => {
        this.setColor(color);
        return super.parser();
      });
  }
  isStyleBlock() {
    return true;
  }
};

// \color{color}math is the declaration form of \textcolor — it
// canonicalizes to \textcolor{color}{math} (the next block is colored).
LatexCmds.color = LatexCmds.textcolor;


// \colorbox{color}{math} — a filled box around content; the color arg is
// raw text like \textcolor's, emitted back verbatim.
LatexCmds.colorbox = class extends MathCommand {
  color = '';
  model = '';
  // Parser-only command: typing '\colorbox' in the command input can't
  // supply a color argument, so typed insertion is a no-op (same
  // convention as \textcolor).
  createLeftOf() {}
  numBlocks() {
    return 1 as const;
  }
  parser() {
    var self = this;
    return Parser.optWhitespace
      .then(Parser.regex(/^\[[a-zA-Z]+\]/).or(Parser.succeed('')))
      .then(function (model: string) {
        if (model) self.model = model.slice(1, -1);
        return Parser.string('{')
          .then(Parser.regex(/^[#\w\s.,()%-]*/))
          .skip(Parser.string('}'));
      })
      .then((color: string) => {
        self.color = color;
        self.domView = new DOMView(1, (blocks) =>
          h.block(
            'span',
            { class: 'mq-colorbox', style: 'background-color:' + color },
            blocks[0]
          )
        );
        return super.parser();
      });
  }
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);
    ctx.uncleanedLatex +=
      '\\colorbox' +
      (this.model ? '[' + this.model + ']' : '') +
      '{' +
      this.color +
      '}{';
    this.blocks![0].latexRecursive(ctx);
    ctx.uncleanedLatex += '}';
    this.checkCursorContextClose(ctx);
  }
  isStyleBlock() {
    return true;
  }
};

// \fcolorbox{frame}{bg}{math} — framed + filled box; two raw color args.
LatexCmds.fcolorbox = class extends MathCommand {
  frameColor = '';
  bgColor = '';
  model = '';
  // Parser-only command: typing '\fcolorbox' in the command input can't
  // supply color arguments, so typed insertion is a no-op (same
  // convention as \textcolor).
  createLeftOf() {}
  numBlocks() {
    return 1 as const;
  }
  parser() {
    var self = this;
    var colorGroup = Parser.string('{')
      .then(Parser.regex(/^[#\w\s.,()%-]*/))
      .skip(Parser.string('}'));
    return Parser.optWhitespace
      .then(Parser.regex(/^\[[a-zA-Z]+\]/).or(Parser.succeed('')))
      .then(function (model: string) {
        if (model) self.model = model.slice(1, -1);
        return colorGroup;
      })
      .then((frame: string) => {
        self.frameColor = frame;
        return colorGroup;
      })
      .then((bg: string) => {
        self.bgColor = bg;
        self.domView = new DOMView(1, (blocks) =>
          h.block(
            'span',
            {
              class: 'mq-fcolorbox',
              style:
                'border:1px solid ' +
                self.frameColor +
                ';background-color:' +
                bg
            },
            blocks[0]
          )
        );
        return super.parser();
      });
  }
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);
    ctx.uncleanedLatex +=
      '\\fcolorbox' +
      (this.model ? '[' + this.model + ']' : '') +
      '{' +
      this.frameColor +
      '}{' +
      this.bgColor +
      '}{';
    this.blocks![0].latexRecursive(ctx);
    ctx.uncleanedLatex += '}';
    this.checkCursorContextClose(ctx);
  }
  isStyleBlock() {
    return true;
  }
};

// \href{url}{math} — link wrapper; the url arg is raw text.
LatexCmds.href = class extends MathCommand {
  url = '';
  // Parser-only command: typing '\href' in the command input can't
  // supply a url argument, so typed insertion is a no-op (same
  // convention as \textcolor).
  createLeftOf() {}
  numBlocks() {
    return 1 as const;
  }
  parser() {
    var self = this;
    return Parser.optWhitespace
      .then(Parser.string('{'))
      .then(Parser.regex(/^[^{}]*/))
      .skip(Parser.string('}'))
      .then((url: string) => {
        self.url = url;
        self.domView = new DOMView(1, (blocks) =>
          h.block('span', { class: 'mq-href' }, blocks[0])
        );
        return super.parser();
      });
  }
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);
    ctx.uncleanedLatex += '\\href{' + this.url + '}{';
    this.blocks![0].latexRecursive(ctx);
    ctx.uncleanedLatex += '}';
    this.checkCursorContextClose(ctx);
  }
};

// \overset{label}{base} stacks a small label above; \underset below;
// \stackrel is the plain-TeX name for \overset
LatexCmds.overset = class extends MathCommand {
  ctrlSeq = '\\overset';
  domView = new DOMView(2, (blocks) =>
    h('span', { class: 'mq-non-leaf mq-overunderset' }, [
      h.block('span', { class: 'mq-overscript' }, blocks[0]),
      h.block('span', {}, blocks[1])
    ])
  );
};
LatexCmds.stackrel = LatexCmds.overset;
LatexCmds.underset = class extends MathCommand {
  ctrlSeq = '\\underset';
  domView = new DOMView(2, (blocks) =>
    h('span', { class: 'mq-non-leaf mq-overunderset' }, [
      h.block('span', {}, blocks[1]),
      h.block('span', { class: 'mq-overscript' }, blocks[0])
    ])
  );
};

// \pmod{m} / \pod{m} — parenthesized (mod m) / (m); \bmod is the
// binary mod operator
LatexCmds.pmod = () =>
  new MathCommand(
    '\\pmod',
    new DOMView(1, (blocks) =>
      h('span', { class: 'mq-non-leaf' }, [
        h('span', {}, [h.text('(mod\u00a0')]),
        h.block('span', {}, blocks[0]),
        h('span', {}, [h.text(')')])
      ])
    ),
    ['mod(', ')']
  );
LatexCmds.pod = () =>
  new MathCommand(
    '\\pod',
    new DOMView(1, (blocks) =>
      h('span', { class: 'mq-non-leaf' }, [
        h('span', {}, [h.text('(')]),
        h.block('span', {}, blocks[0]),
        h('span', {}, [h.text(')')])
      ])
    ),
    ['(', ')']
  );
LatexCmds.bmod = bindBinaryOperator('\\bmod ', 'mod', 'binary mod');
LatexCmds.mod = bindBinaryOperator('\\mod ', 'mod', 'mod');

// Very similar to the \textcolor command, but will add the given CSS class.
// Usage: \class{classname}{math}
// Note regex that whitelists valid CSS classname characters:
// https://github.com/mathquill/mathquill/pull/191#discussion_r4327442
var Class = (LatexCmds['class'] = class extends MathCommand {
  cls: string | undefined;

  // Parser-only command, see \textcolor.
  createLeftOf() {}
  numBlocks() {
    return 1 as const;
  }

  parser() {
    var string = Parser.string,
      regex = Parser.regex;
    return Parser.optWhitespace
      .then(string('{'))
      .then(regex(/^[-\w\s\\\xA0-\xFF]*/))
      .skip(string('}'))
      .then((cls) => {
        this.cls = cls || '';
        this.domView = new DOMView(1, (blocks) =>
          h.block('span', { class: `mq-class ${cls}` }, blocks[0])
        );
        this.ariaLabel = cls + ' class';
        this.mathspeakTemplate = [
          'Start ' + this.ariaLabel + ',',
          'End ' + this.ariaLabel
        ];
        return super.parser();
      });
  }
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);

    var blocks0 = this.blocks![0];
    ctx.uncleanedLatex += '\\class{' + this.cls + '}{';
    blocks0.latexRecursive(ctx);
    ctx.uncleanedLatex += '}';

    this.checkCursorContextClose(ctx);
  }
  isStyleBlock() {
    return true;
  }
});

// This test is used to determine whether an item may be treated as a whole number
// for shortening the verbalized (mathspeak) forms of some fractions and superscripts.
var intRgx = /^[\+\-]?[\d]+$/;

// Traverses the top level of the passed block's children and returns the concatenation of their ctrlSeq properties.
// Used in shortened mathspeak computations as a block's .text() method can be potentially expensive.
//
function getCtrlSeqsFromBlock(block: NodeRef): string {
  if (!block) return '';

  let chars = '';
  block.eachChild((child) => {
    if (child.ctrlSeq !== undefined) chars += child.ctrlSeq;
  });

  return chars;
}

Options.prototype.charsThatBreakOutOfSupSub = '';

/**
 * A SupSub node is a superscript, subscript, or both. It is possible to edit a SupSub node
 * from being a superscript to a subscript without deleting the node by adding a subscript
 * then deleting the superscript.
 */
class SupSub extends MathCommand {
  sub?: MathBlock;
  sup?: MathBlock;
  /**
   * `supsub` is the current or planned shape of the SupSub node.
   *
   * It is set before intializing to know where to put the first block seen in parsing,
   * either in the superscript or subscript. This is necessary e.g. because the SupSub
   * in both `x_2` and `x^2` have a single MathBlock child, but the child goes to the
   * subscript in one and the exponent in the other.
   *
   * After initialization, either the `sub` or `sup` properties of the `SubSub` are set
   * at all times. If only one is set, the `supsub` property says which one is set.
   * If both are set, the `supsub` property could be either 'sup' or 'sub' (it happens
   * to be whichever state the SupSub was in before the second child block was added).
   */
  supsub: 'sup' | 'sub';

  protected ends: Ends<MathBlock>;

  constructor(supsub: 'sup' | 'sub') {
    const ctrlSeq = '_{...}^{...}';

    let domView;

    // Note this.domView doesn't change if the SupSub is edited to something that has both
    // superscript and subscript. This is correct, since domView is only used for the initial
    // creation of the HTML node, not for any updates.
    if (supsub === 'sub') {
      domView = new DOMView(1, (blocks) =>
        h('span', { class: 'mq-supsub mq-non-leaf' }, [
          h.block('span', { class: 'mq-sub' }, blocks[0]),
          h('span', { style: 'display:inline-block;width:0' }, [
            h.text(U_ZERO_WIDTH_SPACE)
          ])
        ])
      );
    } else {
      domView = new DOMView(1, (blocks) =>
        h('span', { class: 'mq-supsub mq-non-leaf mq-sup-only' }, [
          h.block('span', { class: 'mq-sup' }, blocks[0])
        ])
      );
    }

    super(ctrlSeq, domView);

    // Note the ariaLabel doesn't change if the SupSub is edited between subscript and superscript.
    // That may be a bug, though I don't know where the ariaLabel is actually used; the mathspeak
    // method doesn't reference it.
    this.ariaLabel = supsub === 'sub' ? 'subscript' : 'superscript';
    this.supsub = supsub;
  }

  setEnds(ends: Ends<MathBlock>) {
    pray(
      'SupSub ends must be MathBlocks',
      ends[L] instanceof MathBlock && ends[R] instanceof MathBlock
    );
    this.ends = ends;
  }

  getEnd(dir: Direction): MathBlock {
    return this.ends[dir];
  }

  createLeftOf(cursor: Cursor) {
    if (
      !this.replacedFragment &&
      !cursor[L] &&
      cursor.options.supSubsRequireOperand
    )
      return;
    return super.createLeftOf(cursor);
  }
  contactWeld(cursor: Cursor) {
    // Look on either side for a SupSub, if one is found compare my
    // .sub, .sup with its .sub, .sup. If I have one that it doesn't,
    // then call .addBlock() on it with my block; if I have one that
    // it also has, then insert my block's children into its block,
    // unless my block has none, in which case insert the cursor into
    // its block (and not mine, I'm about to remove myself) in the case
    // I was just typed.
    // TODO: simplify

    // equiv. to [L, R].forEach(function(dir) { ... });
    for (var dir: L | R | false = L; dir; dir = dir === L ? R : false) {
      const thisDir = this[dir];
      let pt;
      if (thisDir instanceof SupSub) {
        // equiv. to 'sub sup'.split(' ').forEach(function(supsub) { ... });
        for (
          var supsub: 'sub' | 'sup' | false = 'sub';
          supsub;
          supsub = supsub === 'sub' ? 'sup' : false
        ) {
          var src = this[supsub],
            dest = thisDir[supsub];
          if (!src) continue;
          if (!dest) thisDir.addBlock(src.disown());
          else if (!src.isEmpty()) {
            // ins src children at -dir end of dest
            src
              .domFrag()
              .children()
              .insAtDirEnd(-dir as Direction, dest.domFrag().oneElement());
            var children = src.children().disown();
            pt = new Point(dest, children.getEnd(R), dest.getEnd(L));
            if (dir === L) children.adopt(dest, dest.getEnd(R), 0);
            else children.adopt(dest, 0, dest.getEnd(L));
          } else {
            pt = new Point(dest, 0, dest.getEnd(L));
          }
          this.placeCursor = (function (dest, src) {
            // TODO: don't monkey-patch
            return function (cursor: Cursor) {
              cursor.insAtDirEnd(-dir as Direction, dest || src);
            };
          })(dest, src);
        }
        this.remove();
        if (cursor && cursor[L] === this) {
          if (dir === R && pt) {
            if (pt[L]) {
              cursor.insRightOf(pt[L] as MQNode);
            } else {
              cursor.insAtLeftEnd(pt.parent);
            }
          } else cursor.insRightOf(thisDir);
        }
        break;
      }
    }
  }
  finalizeTree() {
    if (this.supsub === 'sub') {
      this.downInto = this.sub = this.getEnd(L);
      this.sub.upOutOf = insLeftOfMeUnlessAtEnd;
    } else if (this.supsub === 'sup') {
      this.upInto = this.sup = this.getEnd(R);
      this.sup.downOutOf = insLeftOfMeUnlessAtEnd;
    }
    var endsL = this.getEnd(L);
    endsL.write = function (cursor: Cursor, ch: string) {
      if (
        cursor.options.autoSubscriptNumerals &&
        this === (this.parent as SupSub).sub &&
        '0123456789'.indexOf(ch) >= 0
      ) {
        var cmd = this.chToCmd(ch, cursor.options);
        if (cmd instanceof MQSymbol) cursor.deleteSelection();
        else cursor.clearSelection().insRightOf(this.parent);
        cmd.createLeftOf(cursor.show());
        cursor.controller.aria
          .queue('Baseline')
          .alert(cmd.mathspeak({ createdLeftOf: cursor }));
        return;
      }
      if (
        cursor[L] &&
        !cursor[R] &&
        !cursor.selection &&
        cursor.options.charsThatBreakOutOfSupSub.indexOf(ch) > -1
      ) {
        cursor.insRightOf(this.parent);
        cursor.controller.aria.queue('Baseline');
      }
      MathBlock.prototype.write.call(this, cursor, ch);
    };
  }
  moveTowards(dir: Direction, cursor: Cursor, updown?: 'up' | 'down') {
    if (cursor.options.autoSubscriptNumerals && !this.sup) {
      cursor.insDirOf(dir, this);
    } else super.moveTowards(dir, cursor, updown);
  }
  deleteTowards(dir: Direction, cursor: Cursor) {
    if (cursor.options.autoSubscriptNumerals && this.sub) {
      var cmd = this.sub.getEnd(-dir as Direction);
      if (cmd instanceof MQSymbol) cmd.remove();
      else if (cmd)
        cmd.deleteTowards(dir, cursor.insAtDirEnd(-dir as Direction, this.sub));

      // TODO: factor out a .removeBlock() or something
      if (this.sub.isEmpty()) {
        this.sub.deleteOutOf(L, cursor.insAtLeftEnd(this.sub));
        if (this.sup) cursor.insDirOf(-dir as Direction, this);
        // Note `-dir` because in e.g. x_1^2| want backspacing (leftward)
        // to delete the 1 but to end up rightward of x^2; with non-negated
        // `dir` (try it), the cursor appears to have gone "through" the ^2.
      }
    } else super.deleteTowards(dir, cursor);
  }
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);

    if (this.sub) {
      ctx.uncleanedLatex += '_{';
      const beforeLength = ctx.uncleanedLatex.length;
      this.sub.latexRecursive(ctx);
      const afterLength = ctx.uncleanedLatex.length;
      if (beforeLength === afterLength) {
        // nothing was written. so we write a space
        ctx.uncleanedLatex += ' ';
      }

      ctx.uncleanedLatex += '}';
    }

    if (this.sup) {
      ctx.uncleanedLatex += '^{';
      const beforeLength = ctx.uncleanedLatex.length;
      this.sup.latexRecursive(ctx);
      const afterLength = ctx.uncleanedLatex.length;
      if (beforeLength === afterLength) {
        // nothing was written. so we write a space
        ctx.uncleanedLatex += ' ';
      }

      ctx.uncleanedLatex += '}';
    }

    this.checkCursorContextClose(ctx);
  }
  mathspeak(opts?: MathspeakOptions) {
    // Simplify basic exponent speech for common whole numbers.
    if (this.sup !== undefined) {
      // Calculate this item's inner text to determine whether to shorten the returned speech.
      // Do not calculate its inner mathspeak now until we know that the speech is to be truncated.
      // Since the mathspeak computation is recursive, we want to call it only once in this function to avoid performance bottlenecks.
      var innerText = getCtrlSeqsFromBlock(this.sup);
      // If the superscript is a whole number, shorten the speech that is returned.
      if ((!opts || !opts.ignoreShorthand) && intRgx.test(innerText)) {
        let prefix = '';
        if (this.sub) {
          prefix =
            subMathspeakTemplate[0] +
            ' ' +
            this.sub.mathspeak() +
            ' ' +
            subMathspeakTemplate[1] +
            ' ';
        }
        return prefix + wholeNumberPower(this.sup, innerText);
      }
    }
    this.mathspeakTemplate = this.getMathspeakTemplate();
    return super.mathspeak();
  }
  private getMathspeakTemplate() {
    if (this.sub && this.sup) {
      return supSubMathspeakTemplate;
    } else if (this.sup) {
      return supMathspeakTemplate;
    } else {
      return subMathspeakTemplate;
    }
  }
  text() {
    function text(prefix: string, block: NodeRef | undefined) {
      var l = (block && block.text()) || '';
      return block
        ? prefix + (l.length === 1 ? l : '(' + (l || ' ') + ')')
        : '';
    }
    return text('_', this.sub) + text('^', this.sup);
  }
  // This function is called, for example, when parsing `x_1^2`.
  // In that case, first a `SupSub("sup")` is created (i.e. a superscript) representing `x^2`,
  // (with the superscript `2` being added in `finalizeTree`), then the subscript `1` is added
  // with `addBlock`.
  addBlock(block: MathBlock) {
    if (this.supsub === 'sub') {
      this.sup = this.upInto = (this.sub as MQNode).upOutOf = block;
      block.adopt(this, this.sub as MQNode, 0).downOutOf = this.sub;
      block.setDOM(
        domFrag(h('span', { class: 'mq-sup' }))
          .append(block.domFrag().children())
          .prependTo(this.domFrag().oneElement())
          .oneElement()
      );
      NodeBase.linkElementByBlockNode(block.domFrag().oneElement(), block);
    } else {
      this.sub = this.downInto = (this.sup as MQNode).downOutOf = block;
      block.adopt(this, 0, this.sup as MQNode).upOutOf = this.sup;
      this.domFrag().removeClass('mq-sup-only');
      block.setDOM(
        domFrag(h('span', { class: 'mq-sub' }))
          .append(block.domFrag().children())
          .appendTo(this.domFrag().oneElement())
          .oneElement()
      );
      NodeBase.linkElementByBlockNode(block.domFrag().oneElement(), block);
      this.domFrag().append(
        domFrag(
          h('span', { style: 'display:inline-block;width:0' }, [
            h.text(U_ZERO_WIDTH_SPACE)
          ])
        )
      );
    }

    for (let i = 0; i < 2; i += 1) {
      const cmd: SupSub = this;
      const supsub = (['sub', 'sup'] as const)[i];
      const oppositeSupsub = (['sup', 'sub'] as const)[i];
      const updown = (['down', 'up'] as const)[i];
      const cmdSubSub = cmd[supsub]!;

      cmdSubSub.deleteOutOf = function (dir: Direction, cursor: Cursor) {
        cursor.insDirOf(this[dir] ? (-dir as Direction) : dir, this.parent);
        if (!this.isEmpty()) {
          const end = this.getEnd(dir);
          this.children()
            .disown()
            .withDirAdopt(
              dir,
              cursor.parent,
              cursor[dir],
              cursor[-dir as Direction]
            )
            .domFrag()
            .insDirOf(-dir as Direction, cursor.domFrag());
          cursor[-dir as Direction] = end;
        }
        cmd.supsub = oppositeSupsub;
        delete cmd[supsub];
        delete cmd[`${updown}Into`];
        const cmdOppositeSupsub = cmd[oppositeSupsub]!;
        cmdOppositeSupsub[`${updown}OutOf`] = insLeftOfMeUnlessAtEnd;
        delete (cmdOppositeSupsub as any).deleteOutOf; // TODO - refactor so this method can be optional
        if (supsub === 'sub') {
          cmd.domFrag().addClass('mq-sup-only').children().last().remove();
        }
        this.remove();
      };
    }
  }
}

function insLeftOfMeUnlessAtEnd(this: MQNode, cursor: Cursor) {
  // cursor.insLeftOf(cmd), unless cursor at the end of block, and every
  // ancestor cmd is at the end of every ancestor block
  var cmd = this.parent;
  var ancestorCmd: MQNode | Anticursor | Cursor = cursor;
  do {
    if (ancestorCmd[R]) return cursor.insLeftOf(cmd);
    ancestorCmd = ancestorCmd.parent.parent;
  } while (ancestorCmd !== cmd);
  cursor.insRightOf(cmd);
  return undefined;
}

const subMathspeakTemplate = ['Subscript,', ', Baseline'];
const supMathspeakTemplate = ['Superscript,', ', Baseline'];
const supSubMathspeakTemplate = [
  'Subscript,',
  ', Baseline Superscript,',
  ', Baseline'
];

/** Assumes innerText satisfies the `intRgx` */
function wholeNumberPower(sup: MQNode, innerText: string) {
  // Simple cases
  if (innerText === '0') {
    return 'to the 0 power';
  } else if (innerText === '2') {
    return 'squared';
  } else if (innerText === '3') {
    return 'cubed';
  }

  // More complex cases.
  var suffix = '';
  // Limit suffix addition to exponents < 1000.
  if (/^[+-]?\d{1,3}$/.test(innerText)) {
    if (/(11|12|13|4|5|6|7|8|9|0)$/.test(innerText)) {
      suffix = 'th';
    } else if (/1$/.test(innerText)) {
      suffix = 'st';
    } else if (/2$/.test(innerText)) {
      suffix = 'nd';
    } else if (/3$/.test(innerText)) {
      suffix = 'rd';
    }
  }
  var innerMathspeak = typeof sup === 'object' ? sup.mathspeak() : innerText;
  return 'to the ' + innerMathspeak + suffix + ' power';
}

LatexCmds.subscript = LatexCmds._ = () => new SupSub('sub');

LatexCmds.superscript =
  LatexCmds.supscript =
  LatexCmds['^'] =
    () => new SupSub('sup');

class SummationNotation extends MathCommand {
  constructor(ch: string, symbol: string, ariaLabel?: string) {
    super();

    this.ariaLabel = ariaLabel || ch.replace(/^\\/, '');
    var domView = new DOMView(2, (blocks) =>
      h('span', { class: 'mq-large-operator mq-non-leaf' }, [
        h('span', { class: 'mq-to' }, [h.block('span', {}, blocks[1])]),
        h('big', {}, [h.entityText(symbol)]),
        h('span', { class: 'mq-from' }, [h.block('span', {}, blocks[0])])
      ])
    );

    MQSymbol.prototype.setCtrlSeqHtmlTextAndMathspeak.call(this, ch, domView);
  }
  createLeftOf(cursor: Cursor) {
    super.createLeftOf(cursor);
    if (cursor.options.sumStartsWithNEquals) {
      new Letter('n').createLeftOf(cursor);
      new Equality().createLeftOf(cursor);
    }
  }
  limitsCtrlSeq: string | undefined;
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);

    ctx.uncleanedLatex += this.ctrlSeq + (this.limitsCtrlSeq || '') + '_{';
    let beforeLength = ctx.uncleanedLatex.length;
    this.getEnd(L).latexRecursive(ctx);
    let afterLength = ctx.uncleanedLatex.length;
    if (afterLength === beforeLength) {
      // nothing was written so we write a space
      ctx.uncleanedLatex += ' ';
    }

    ctx.uncleanedLatex += '}^{';
    beforeLength = ctx.uncleanedLatex.length;
    this.getEnd(R).latexRecursive(ctx);
    afterLength = ctx.uncleanedLatex.length;
    if (beforeLength === afterLength) {
      // nothing was written so we write a space
      ctx.uncleanedLatex += ' ';
    }

    ctx.uncleanedLatex += '}';
    this.checkCursorContextClose(ctx);
  }
  mathspeak() {
    return (
      'Start ' +
      this.ariaLabel +
      ' from ' +
      this.getEnd(L).mathspeak() +
      ' to ' +
      this.getEnd(R).mathspeak() +
      ', end ' +
      this.ariaLabel +
      ', '
    );
  }
  parser() {
    var string = Parser.string;
    var optWhitespace = Parser.optWhitespace;
    var succeed = Parser.succeed;
    var block = latexMathParser.block;

    var self = this;
    var blocks = (self.blocks = [new MathBlock(), new MathBlock()]);
    for (var i = 0; i < blocks.length; i += 1) {
      blocks[i].adopt(self, self.getEnd(R), 0);
    }

    // `\sum\limits_{i}^{n}` — an optional \limits/\nolimits between the
    // operator and its bounds is kept on the node so serialization
    // round-trips it instead of dropping it or leaving { } bounds.
    var optLimits = Parser.regex(/^\\(?:no)?limits(?![a-zA-Z])\s*/)
      .map(function (limits) {
        self.limitsCtrlSeq = limits.trim() + ' ';
        return undefined;
      })
      .or(succeed(''));

    return optWhitespace
      .then(optLimits)
      .then(optWhitespace)
      .then(string('_').or(string('^')))
      .then(function (supOrSub) {
        var child = blocks[supOrSub === '_' ? 0 : 1];
        return block.then(function (block) {
          block.children().adopt(child, child.getEnd(R), 0);
          return succeed(self);
        });
      })
      .many()
      .result(self);
  }
  finalizeTree() {
    var endsL = this.getEnd(L);
    var endsR = this.getEnd(R);

    endsL.ariaLabel = 'lower bound';
    endsR.ariaLabel = 'upper bound';
    this.downInto = endsL;
    this.upInto = endsR;
    endsL.upOutOf = endsR;
    endsR.downOutOf = endsL;
  }
}

LatexCmds['∑'] =
  LatexCmds.sum =
  LatexCmds.summation =
    () => new SummationNotation('\\sum ', U_NARY_SUMMATION, 'sum');

LatexCmds['∏'] =
  LatexCmds.prod =
  LatexCmds.product =
    () => new SummationNotation('\\prod ', U_NARY_PRODUCT, 'product');

LatexCmds.coprod = LatexCmds.coproduct = () =>
  new SummationNotation('\\coprod ', U_NARY_COPRODUCT, 'co product');

LatexCmds['∫'] =
  LatexCmds['int'] =
  LatexCmds.integral =
    class extends SummationNotation {
      constructor() {
        super('\\int ', '', 'integral');

        this.ariaLabel = 'integral';
        this.domView = new DOMView(2, (blocks) =>
          h('span', { class: 'mq-int mq-non-leaf' }, [
            h('big', {}, [h.text(U_INTEGRAL)]),
            h('span', { class: 'mq-supsub mq-non-leaf' }, [
              h('span', { class: 'mq-sup' }, [
                h.block('span', { class: 'mq-sup-inner' }, blocks[1])
              ]),
              h.block('span', { class: 'mq-sub' }, blocks[0]),
              h('span', { style: 'display:inline-block;width:0' }, [
                h.text(U_ZERO_WIDTH_SPACE)
              ])
            ])
          ])
        );
      }

      createLeftOf(cursor: Cursor) {
        // FIXME: refactor rather than overriding
        MathCommand.prototype.createLeftOf.call(this, cursor);
      }
    };

// Boundless integral signs for indefinite integrals: `\iint` and
// `\antid` render a bare ∫ — neither carries blocks, so the integrand
// types linearly (`\antid x dx`, `\iint f dx dy`) and `_`/`^` may still
// grow an ordinary sibling SupSub for bounds. `\antid` is a MathCompile
// insertion alias: the app maps it to `\int` at compile time; `\iint`
// parses to Integrate in the compute engine on its own.
//
// BoundlessIntegral is its own class so left-scanning code (a typed `/`
// wrapping the preceding run into a numerator) can stop at the sign —
// for a SummationNotation like `\sum` the scan already breaks there, and
// a boundless ∫ should behave the same way.
class BoundlessIntegral extends MQSymbol {}

const boundlessIntegral = (ctrlSeq: string, glyph: string, speak: string) => {
  return () =>
    new BoundlessIntegral(
      ctrlSeq,
      h('span', { class: 'mq-int' }, [
        h('big', {}, [h.entityText(glyph)])
      ]) as HTMLElement,
      undefined,
      speak
    );
};

LatexCmds['∬'] = LatexCmds.iint = boundlessIntegral(
  '\\iint ',
  U_DOUBLE_INTEGRAL,
  'double integral'
);
LatexCmds.antid = boundlessIntegral('\\antid ', U_INTEGRAL, 'antiderivative');
LatexCmds['∯'] = LatexCmds.oiint = boundlessIntegral(
  '\\oiint ',
  '∯',
  'surface integral'
);
LatexCmds['∰'] = LatexCmds.oiiint = boundlessIntegral(
  '\\oiiint ',
  '∰',
  'volume integral'
);

var Fraction =
  (LatexCmds.frac =
  LatexCmds.dfrac =
  LatexCmds.fraction =
    class FracNode extends MathCommand {
      ctrlSeq = '\\frac';
      domView = new DOMView(2, (blocks) =>
        h('span', { class: 'mq-fraction mq-non-leaf' }, [
          h.block('span', { class: 'mq-numerator' }, blocks[0]),
          h.block('span', { class: 'mq-denominator' }, blocks[1]),
          h('span', { style: 'display:inline-block;width:0' }, [
            h.text(U_ZERO_WIDTH_SPACE)
          ])
        ])
      );
      textTemplate = ['(', ')/(', ')'];
      finalizeTree() {
        const endsL = this.getEnd(L);
        const endsR = this.getEnd(R);
        this.upInto = endsR.upOutOf = endsL;
        this.downInto = endsL.downOutOf = endsR;
        endsL.ariaLabel = 'numerator';
        endsR.ariaLabel = 'denominator';
        if (this.getFracDepth() > 1) {
          this.mathspeakTemplate = [
            'StartNestedFraction,',
            'NestedOver',
            ', EndNestedFraction'
          ];
        } else {
          this.mathspeakTemplate = ['StartFraction,', 'Over', ', EndFraction'];
        }
      }

      mathspeak(opts?: MathspeakOptions) {
        if (opts && opts.createdLeftOf) {
          var cursor = opts.createdLeftOf;
          return cursor.parent.mathspeak();
        }

        var numText = getCtrlSeqsFromBlock(this.getEnd(L));
        var denText = getCtrlSeqsFromBlock(this.getEnd(R));

        // Shorten mathspeak value for whole number fractions whose denominator has a special spoken form.
        if (
          (!opts || !opts.ignoreShorthand) &&
          intRgx.test(numText) &&
          intRgx.test(denText)
        ) {
          var isSingular = numText === '1' || numText === '-1';
          var newDenSpeech = '';
          if (denText === '2') {
            newDenSpeech = isSingular ? 'half' : 'halves';
          } else if (denText === '3') {
            newDenSpeech = isSingular ? 'third' : 'thirds';
          } else if (denText === '4') {
            newDenSpeech = isSingular ? 'fourth' : 'fourths';
          } else if (denText === '5') {
            newDenSpeech = isSingular ? 'fifth' : 'fifths';
          } else if (denText === '6') {
            newDenSpeech = isSingular ? 'sixth' : 'sixths';
          } else if (denText === '7') {
            newDenSpeech = isSingular ? 'seventh' : 'sevenths';
          } else if (denText === '8') {
            newDenSpeech = isSingular ? 'eighth' : 'eighths';
          } else if (denText === '9') {
            newDenSpeech = isSingular ? 'ninth' : 'ninths';
          } else if (denText === '10') {
            newDenSpeech = isSingular ? 'tenth' : 'tenths';
          } else if (denText === '11') {
            newDenSpeech = isSingular ? 'eleventh' : 'elevenths';
          } else if (denText === '12') {
            newDenSpeech = isSingular ? 'twelfth' : 'twelfths';
          } else if (denText === '100') {
            newDenSpeech = isSingular ? 'hundredth' : 'hundredths';
          }
          if (newDenSpeech !== '') {
            var output = '';
            // Handle the case of an integer followed by a simplified fraction such as 1\frac{1}{2}.
            // Such combinations should be spoken aloud as "1 and 1 half."
            // Start at the left sibling of the fraction and continue leftward until something other than a digit or whitespace is found.
            let sawDigit = false;

            let sibling;
            // Scan until you see something other than a digit or space
            for (
              sibling = this[L];
              sibling &&
              sibling.ctrlSeq &&
              (sibling.ctrlSeq === '\\ ' || intRgx.test(sibling.ctrlSeq ?? ''));
              sibling = sibling[L]
            ) {
              if (intRgx.test(sibling.ctrlSeq)) {
                sawDigit = true;
              }
            }
            const lastNodeSeen = sibling;

            // `precededByInteger` is true if everything we saw while scanning is digits and spaces, and
            // we saw at least one digit.
            const precededByInteger =
              sawDigit && !(lastNodeSeen && lastNodeSeen.ctrlSeq === '.');
            if (precededByInteger) {
              output += 'and ';
            }
            output += this.getEnd(L).mathspeak() + ' ' + newDenSpeech;
            return output;
          }
        }

        return super.mathspeak();
      }

      getFracDepth() {
        var level = 0;
        var walkUp = function (item: NodeRef, level: number): number {
          if (
            item instanceof MQNode &&
            item.ctrlSeq &&
            item.ctrlSeq.toLowerCase().search('frac') >= 0
          )
            level += 1;
          if (item && item.parent) return walkUp(item.parent, level);
          else return level;
        };
        return walkUp(this, level);
      }
    });

// \cfrac[lcr] takes an optional alignment arg before the two
// fraction blocks — consume it so [l] can't parse as a { [ } { l ]
// "fraction". Serialized canonically as \frac like \dfrac/\tfrac.
LatexCmds.cfrac = class extends Fraction {
  parser() {
    var self = this;
    return Parser.regex(/^\[(?:[lcr])\]/)
      .or(Parser.succeed(''))
      .then(function () {
        return Fraction.prototype.parser.call(self);
      });
  }
};

var LiveFraction =
  (LatexCmds.over =
  CharCmds['/'] =
    class extends Fraction {
      // Pasted `a\over b` (infix) can't bind `a` — the two-block parse
      // fails. Fall back to a visible `\over` leaf so the input keeps
      // its text instead of blanking the field. The typed `\over`→
      // fraction path is unaffected (it goes through createLeftOf).
      // MathCommand's strict parser is invoked directly: parser()
      // falls back to a bare \frac leaf that would shadow \over's.
      parser() {
        return MathCommand.prototype.strictParser.call(this).or(
          Parser.succeed(
            new VanillaSymbol(
              '\\over ',
              h.text('\\over'),
              'over'
            ) as MQNode | Fragment
          )
        ) as Parser<MQNode | Fragment>;
      }
      createLeftOf(cursor: Cursor) {
        if (!this.replacedFragment) {
          var leftward = cursor[L];

          const dontScan =
            cursor.options.typingSlashCreatesNewFraction &&
            this instanceof Fraction;

          if (!dontScan) {
            // The user is typing "/" or "over" or "choose". Scan left to get content inside it.
            while (
              leftward &&
              !(
                nodeEndsBinaryOperator(leftward) ||
                (leftward instanceof DigitGroupingChar &&
                  leftward._groupingClass === 'mq-ellipsis-end') ||
                leftward instanceof (LatexCmds.text || noop) ||
                leftward instanceof SummationNotation ||
                leftward instanceof BoundlessIntegral ||
                leftward.ctrlSeq === '\\ ' ||
                /^[,;:]$/.test(leftward.ctrlSeq as string)
              ) //lookbehind for operator
            )
              leftward = leftward[L];
          }
          if (
            (leftward instanceof SummationNotation ||
              leftward instanceof BoundlessIntegral) &&
            leftward[R] instanceof SupSub
          ) {
            // The previous step scanned too far. `\sum_1^5` looks like [SummationNotation,SupSub],
            // so scan back right
            leftward = leftward[R] as MQNode;
            let leftwardR = leftward[R];
            if (
              leftwardR instanceof SupSub &&
              leftwardR.ctrlSeq != leftward.ctrlSeq
            )
              leftward = leftward[R];
          }

          // `leftward` is the first node (from-right-to-left) that is broken on, so
          // `leftwardR` is the last node (from right-to-left) that should be included in the
          // top of the Fraction or Binomial.
          if (leftward !== cursor[L] && !cursor.isTooDeep(1)) {
            let leftwardR = (leftward as MQNode)[R] as MQNode;
            let cursorL = cursor[L] as MQNode;

            this.replaces(
              new Fragment(leftwardR || cursor.parent.getEnd(L), cursorL)
            );
            cursor[L] = leftward;
          }
        }
        super.createLeftOf(cursor);
      }
    });

const AnsBuilder = () =>
  new MQSymbol(
    '\\operatorname{ans}',
    h('span', { class: 'mq-ans' }, [h.text('ans')]),
    'ans'
  );
LatexCmds.ans = AnsBuilder;

const PercentOfBuilder = () =>
  new MQSymbol(
    '\\%\\operatorname{of}',
    h('span', { class: 'mq-nonSymbola mq-operator-name' }, [h.text('% of ')]),
    'percent of'
  );
LatexCmds.percent = LatexCmds.percentof = PercentOfBuilder;

/** A Token represents a region in typeset math that is designed to be
 * externally styled and which delegates mousedown events to external
 * handlers.
 *
 * LaTeX syntax: `\token{id}`.
 *
 * Token is designed for similar use cases as EmbedNode. Differences:
 *     * Mousedown events on a Token are not handled by MathQuill (they
 *       are expected to be handled externally).
 *     * The API for Tokens is simpler: they don't require registering
 *       handlers with MathQuill.
 *     * The current syntax for embed (`\embed{name}[id]`) gets the order
 *       of optional and required arguments backwards compared to normal
 *       LaTeX syntax. The syntax of Token is simpler and more in line
 *       with LaTeX
 */
class Token extends MQSymbol {
  tokenId = '';
  ctrlSeq = '\\token';
  textTemplate = ['token(', ')'];
  mathspeakTemplate = ['StartToken,', ', EndToken'];
  ariaLabel = 'token';

  html(): Element | DocumentFragment {
    const out = h('span', {
      class: 'mq-token mq-ignore-mousedown',
      'data-mq-token': this.tokenId
    });
    this.setDOM(out);
    NodeBase.linkElementByCmdNode(out, this);
    return out;
  }

  latexRecursive(ctx: LatexContext): void {
    this.checkCursorContextOpen(ctx);

    ctx.uncleanedLatex += `${this.ctrlSeq}{` + this.tokenId + '}';

    this.checkCursorContextClose(ctx);
  }

  mathspeak() {
    // If the caller responsible for creating this token has set an aria-label attribute for the inner children, use them in the mathspeak calculation.
    let ariaLabelArray: string[] = [];

    this.domFrag()
      .children()
      .eachElement((el) => {
        const label = el.getAttribute('aria-label');
        if (typeof label === 'string' && label !== '')
          ariaLabelArray.push(label);
      });
    return ariaLabelArray.length > 0
      ? ariaLabelArray.join(' ').trim()
      : 'token ' + this.tokenId;
  }

  parser() {
    var self = this;
    return latexMathParser.block.map(function (block) {
      var digit = block.getEnd(L);
      if (digit) {
        self.tokenId += (digit as Digit).ctrlSeq;
        while ((digit = digit[R])) {
          self.tokenId += (digit as Digit).ctrlSeq;
        }
      }

      return self;
    });
  }
}
LatexCmds.token = Token;

/**
 * Similar to Token, but for displaying the name of a token rather than
 * its value. Leverages Token class for functionality allows differentiation
 * for rendering purposes.
 */
class TokenName extends Token {
  ctrlSeq = '\\tokenName';
  textTemplate = ['tokenName(', ')'];
  ariaLabel = 'token name';
}
LatexCmds.tokenName = TokenName;

class SquareRoot extends MathCommand {
  ctrlSeq = '\\sqrt';
  domView = new DOMView(1, (blocks) =>
    h('span', { class: 'mq-non-leaf mq-sqrt-container' }, [
      h('span', { class: 'mq-scaled mq-sqrt-prefix' }, [
        SVG_SYMBOLS.sqrt.html()
      ]),
      h.block('span', { class: 'mq-non-leaf mq-sqrt-stem' }, blocks[0])
    ])
  );
  textTemplate = ['sqrt(', ')'];
  mathspeakTemplate = ['StartRoot,', ', EndRoot'];
  ariaLabel = 'root';
  parser() {
    return latexMathParser.optBlock
      .then(function (optBlock) {
        return latexMathParser.block.map(function (block) {
          var nthroot = new NthRoot();
          nthroot.blocks = [optBlock, block];
          optBlock.adopt(nthroot, 0, 0);
          block.adopt(nthroot, optBlock, 0);
          return nthroot;
        });
      })
      .or(super.parser());
  }
  deleteTowards(dir: Direction, cursor: Cursor) {
    if (!this.isEmpty() && dir === 1) {
      this.moveTowards(R, cursor);
      cursor.parent.deleteOutOf(L, cursor);
      return;
    }
    // Empty sqrt: delete the sqrt.
    // Delete-left ("Backspace") moves into non-empty sqrts.
    super.deleteTowards(dir, cursor);
  }
}
LatexCmds.sqrt = CharCmds['√'] = SquareRoot;

LatexCmds.hat = class Hat extends MathCommand {
  ctrlSeq = '\\hat';
  domView = new DOMView(1, (blocks) =>
    h('span', { class: 'mq-non-leaf' }, [
      h('span', { class: 'mq-hat-prefix' }, [h.text('^')]),
      h.block('span', { class: 'mq-hat-stem' }, blocks[0])
    ])
  );

  textTemplate = ['hat(', ')'];
};

// \widehat is the wide variant of \hat; render it with the same atom
// (serializes back as \hat).
LatexCmds.widehat = LatexCmds.hat;

class NthRoot extends SquareRoot {
  domView = new DOMView(2, (blocks) =>
    h('span', { class: 'mq-nthroot-container mq-non-leaf' }, [
      h.block('sup', { class: 'mq-nthroot mq-non-leaf' }, blocks[0]),
      h('span', { class: 'mq-scaled mq-sqrt-container' }, [
        h('span', { class: 'mq-sqrt-prefix mq-scaled' }, [
          SVG_SYMBOLS.sqrt.html()
        ]),
        h.block('span', { class: 'mq-sqrt-stem mq-non-leaf' }, blocks[1])
      ])
    ])
  );

  textTemplate = ['sqrt[', '](', ')'];
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);

    ctx.uncleanedLatex += '\\sqrt[';
    this.getEnd(L).latexRecursive(ctx);
    ctx.uncleanedLatex += ']{';
    this.getEnd(R).latexRecursive(ctx);
    ctx.uncleanedLatex += '}';

    this.checkCursorContextClose(ctx);
  }
  mathspeak() {
    var indexMathspeak = this.getEnd(L).mathspeak();
    var radicandMathspeak = this.getEnd(R).mathspeak();
    this.getEnd(L).ariaLabel = 'Index';
    this.getEnd(R).ariaLabel = 'Radicand';
    if (indexMathspeak === '3') {
      // cube root
      return 'Start Cube Root, ' + radicandMathspeak + ', End Cube Root';
    } else {
      return (
        'Root Index ' +
        indexMathspeak +
        ', Start Root, ' +
        radicandMathspeak +
        ', End Root'
      );
    }
  }
  deleteTowards(dir: Direction, cursor: Cursor) {
    MathCommand.prototype.deleteTowards.call(this, dir, cursor);
  }
}
LatexCmds.nthroot = NthRoot;

LatexCmds.cbrt = class extends NthRoot {
  createLeftOf(cursor: Cursor) {
    super.createLeftOf(cursor);
    new Digit('3').createLeftOf(cursor);
    cursor.controller.moveRight();
  }
};

class DiacriticAbove extends MathCommand {
  accentHtml: ChildNode;
  constructor(ctrlSeq: string, html: ChildNode, textTemplate?: string[]) {
    var domView = new DOMView(1, (blocks) =>
      h('span', { class: 'mq-non-leaf' }, [
        h('span', { class: 'mq-diacritic-above' }, [html]),
        h.block('span', { class: 'mq-diacritic-stem' }, blocks[0])
      ])
    );
    super(ctrlSeq, domView, textTemplate);
    this.accentHtml = html;
  }
  // An accent with no block following degrades to a standalone mark —
  // `f\'` still parses (as f + a bare ´) instead of failing the field.
  parser() {
    var self = this;
    return latexMathParser.block
      .map(function (b: MathBlock) {
        self.blocks = [b];
        b.adopt(self, 0, 0);
        return self;
      })
      .or(
        Parser.succeed(
          new VanillaSymbol(
            self.ctrlSeq + ' ',
            self.accentHtml.cloneNode(true) as ChildNode
          ) as MQNode
        )
      );
  }
}
LatexCmds.vec = () =>
  new DiacriticAbove('\\vec', h.entityText('&rarr;'), ['vec(', ')']);
LatexCmds.tilde = () =>
  new DiacriticAbove('\\tilde', h.text('~'), ['tilde(', ')']);
LatexCmds.ddot = () =>
  new DiacriticAbove('\\ddot', h.text('¨'), ['ddot(', ')']);
LatexCmds.dddot = () =>
  new DiacriticAbove('\\dddot', h.text('...'), ['dddot(', ')']);

class DiacriticBelow extends DiacriticAbove {
  constructor(ctrlSeq: string, html: ChildNode, textTemplate?: string[]) {
    super(ctrlSeq, html, textTemplate);
    this.domView = new DOMView(1, (blocks) =>
      h('span', { class: 'mq-non-leaf' }, [
        h.block('span', { class: 'mq-diacritic-stem' }, blocks[0]),
        h('span', { class: 'mq-diacritic-below' }, [html])
      ])
    );
  }
}


// \xrightarrow{label} / \xleftarrow / \xmapsto and friends — a small
// label over an extensible-looking arrow; the arrow is a fixed glyph.
// \xrightarrow[under]{over} puts a second label below the arrow
// (amsmath), parsed like \sqrt[n]{x}'s optional block.
class XArrowWithUnder extends MathCommand {
  constructor(ctrlSeq: string, arrow: string) {
    super(
      ctrlSeq,
      new DOMView(2, (blocks) =>
        h('span', { class: 'mq-non-leaf mq-overunderset' }, [
          h.block('span', { class: 'mq-overscript' }, blocks[1]),
          h('span', { class: 'mq-xarrow' }, [h.text(arrow)]),
          h.block('span', { class: 'mq-underscript' }, blocks[0])
        ])
      )
    );
  }
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);
    ctx.uncleanedLatex += this.ctrlSeq + '[';
    this.getEnd(L).latexRecursive(ctx);
    ctx.uncleanedLatex += ']{';
    this.getEnd(R).latexRecursive(ctx);
    ctx.uncleanedLatex += '}';
    this.checkCursorContextClose(ctx);
  }
}
function bindArrowLabelCmd(ctrlSeq: string, arrow: string) {
  return () =>
    new (class extends MathCommand {
      constructor() {
        super(
          ctrlSeq,
          new DOMView(1, (blocks) =>
            h('span', { class: 'mq-non-leaf mq-overunderset' }, [
              h.block('span', { class: 'mq-overscript' }, blocks[0]),
              h('span', { class: 'mq-xarrow' }, [h.text(arrow)])
            ])
          )
        );
      }
      parser() {
        var self = this;
        return latexMathParser.optBlock
          .then(function (optBlock) {
            return latexMathParser.block.map(function (block) {
              var xa = new XArrowWithUnder(ctrlSeq, arrow);
              xa.blocks = [optBlock, block];
              optBlock.adopt(xa, 0, 0);
              block.adopt(xa, optBlock, 0);
              return xa;
            });
          })
          .or(super.parser())
          .or(
            Parser.succeed(
              new VanillaSymbol(
                ctrlSeq + ' ',
                h.text(arrow),
                ctrlSeq.slice(1)
              ) as MQNode | Fragment
            )
          );
      }
    })();
}
LatexCmds.xrightarrow = bindArrowLabelCmd('\\xrightarrow', '⟶');
LatexCmds.xleftarrow = bindArrowLabelCmd('\\xleftarrow', '⟵');
LatexCmds.xmapsto = bindArrowLabelCmd('\\xmapsto', '⟼');
LatexCmds.xRightarrow = bindArrowLabelCmd('\\xRightarrow', '⟹');
LatexCmds.xLeftarrow = bindArrowLabelCmd('\\xLeftarrow', '⟸');
LatexCmds.xLeftrightarrow = bindArrowLabelCmd('\\xLeftrightarrow', '⟺');
LatexCmds.xleftrightarrow = bindArrowLabelCmd('\\xleftrightarrow', '⟷');
LatexCmds.xhookleftarrow = bindArrowLabelCmd('\\xhookleftarrow', '↩');
LatexCmds.xhookrightarrow = bindArrowLabelCmd('\\xhookrightarrow', '↪');
LatexCmds.xrightharpoondown = bindArrowLabelCmd('\\xrightharpoondown', '⇀');
LatexCmds.xrightharpoonup = bindArrowLabelCmd('\\xrightharpoonup', '⇁');
LatexCmds.xleftharpoondown = bindArrowLabelCmd('\\xleftharpoondown', '↽');
LatexCmds.xleftharpoonup = bindArrowLabelCmd('\\xleftharpoonup', '↼');
LatexCmds.xrightleftharpoons = bindArrowLabelCmd('\\xrightleftharpoons', '⇌');
LatexCmds.xleftrightharpoons = bindArrowLabelCmd('\\xleftrightharpoons', '⇋');
LatexCmds.xhookleftarrow = bindArrowLabelCmd('\\xhookleftarrow', '↩');
LatexCmds.xhookrightarrow = bindArrowLabelCmd('\\xhookrightarrow', '↪');
LatexCmds.xLongrightarrow = bindArrowLabelCmd('\\xLongrightarrow', '⟶');
LatexCmds.xLongleftarrow = bindArrowLabelCmd('\\xLongleftarrow', '⟵');
LatexCmds.xtwoheadrightarrow = bindArrowLabelCmd('\\xtwoheadrightarrow', '↠');
LatexCmds.xtwoheadleftarrow = bindArrowLabelCmd('\\xtwoheadleftarrow', '↞');
LatexCmds.xtofrom = bindArrowLabelCmd('\\xtofrom', '⇄');

// \cancel \bcancel \xcancel — struck-through content.
function bindCancelCmd(ctrlSeq: string, cls: string) {
  return () =>
    new MathCommand(
      ctrlSeq,
      new DOMView(1, (blocks) =>
        h('span', { class: 'mq-non-leaf mq-cancel ' + cls }, [
          h.block('span', {}, blocks[0])
        ])
      )
    );
}
// \cancelto{result}{expr} — content struck through with an arrow
// pointing at the result term.
LatexCmds.cancelto = () =>
  new MathCommand(
    '\\cancelto',
    new DOMView(2, (blocks) =>
      h('span', { class: 'mq-non-leaf mq-cancel mq-cancelto' }, [
        h.block('span', { class: 'mq-cancelto-arrow' }, blocks[0]),
        h.block('span', {}, blocks[1])
      ])
    )
  );
LatexCmds.cancel = bindCancelCmd('\\cancel', 'mq-cancel-forward');
LatexCmds.bcancel = bindCancelCmd('\\bcancel', 'mq-cancel-back');
LatexCmds.xcancel = bindCancelCmd('\\xcancel', 'mq-cancel-both');

// \big \Big \bigg \Bigg sized delimiters (with optional l/r/m suffix)
// and \middle — a sized-delimiter prefix consumes the following
// delimiter token and renders that glyph, keeping the prefix in the
// ctrlSeq so `\bigl(` serializes verbatim.
var DELIM_GLYPHS: { [token: string]: string } = {
  '(': '(',
  ')': ')',
  '[': '[',
  ']': ']',
  '{': '{',
  '}': '}',
  '|': '|',
  '<': '⟨',
  '>': '⟩',
  '/': '/',
  '.': '',
  '\\{': '{',
  '\\}': '}',
  '\\|': '‖',
  '\\langle': '⟨',
  '\\rangle': '⟩',
  '\\lVert': '‖',
  '\\rVert': '‖',
  '\\lceil': '⌈',
  '\\rceil': '⌉',
  '\\lfloor': '⌊',
  '\\rfloor': '⌋',
  '\\backslash': '\\',
  '\\ulcorner': '⌜',
  '\\urcorner': '⌝',
  '\\llcorner': '⌞',
  '\\lrcorner': '⌟',
  '\\uparrow': '↑',
  '\\downarrow': '↓',
  '\\updownarrow': '↕',
  '\\Uparrow': '⇑',
  '\\Downarrow': '⇓',
  '\\Updownarrow': '⇕'
};

class SizedDelimiter extends MQSymbol {
  prefix: string;
  constructor(prefix: string) {
    super();
    this.prefix = prefix;
  }
  // Parser-only command: typing '\bigl' in the command input can't
  // supply a delimiter token, so typed insertion is a no-op (same
  // convention as \textcolor / \big).
  createLeftOf() {}
  parser() {
    var self = this;
    return Parser.optWhitespace
      .then(Parser.regex(/^(?:\\[a-zA-Z]+|\\[^a-zA-Z\s]|[.()[\]{}/|<>])/))
      .map(function (delim) {
        // A \langle-style delimiter needs a trailing space in the
        // emitted ctrlSeq — otherwise `\Bigg\langle x` would serialize
        // as `\Bigg\langlex` and glue into an unknown command.
        self.ctrlSeq =
          self.prefix + delim + (/^\\[a-zA-Z]+$/.test(delim) ? ' ' : '');
        var glyph = DELIM_GLYPHS[delim];
        if (glyph === undefined) glyph = delim.replace(/^\\/, '');
        self.domView = new DOMView(0, () =>
          h('span', { class: 'mq-sized-delim' }, [h.text(glyph)])
        );
        return self;
      });
  }
}
(function () {
  ['big', 'Big', 'bigg', 'Bigg'].forEach(function (size) {
    ['l', 'r', 'm', ''].forEach(function (side) {
      LatexCmds[size + side] = function () {
        return new SizedDelimiter('\\' + size + side);
      };
    });
  });
  LatexCmds.middle = function () {
    return new SizedDelimiter('\\middle');
  };
})();

// A bare \\ at any level is a hard line break — the matrix/displaylines
// cell-grid parsers consume \\ as a row delimiter before node parsing
// reaches it, so this only kicks in outside grids (e.g. pasting `x\\ y`).
LatexCmds['\\'] = function () {
  return new VanillaSymbol(
    '\\\\',
    h('br', {}, []) as unknown as HTMLElement,
    'line break'
  );
};

// \cr is the plain-TeX row separator — inside a grid it is cell content
// (the cellsParser only splits on \\), so it round-trips verbatim and
// renders as a line break.
LatexCmds.cr = function () {
  return new VanillaSymbol(
    '\\cr ',
    h('br', {}, []) as unknown as HTMLElement,
    'line break'
  );
};

// Escaped single-char accents (registered under their backslash-escaped
// ctrlSeq). `\'` intentionally falls back to the bare ' prime — TeX's
// acute accent is available as \acute.
LatexCmds['\\`'] = () =>
  new DiacriticAbove('\\`', h.text('`'), ['grave(', ')']);
LatexCmds['\\"'] = () =>
  new DiacriticAbove('\\"', h.text('¨'), ['umlaut(', ')']);
LatexCmds['\\~'] = () =>
  new DiacriticAbove('\\~', h.text('~'), ['tilde(', ')']);
LatexCmds['\\='] = () =>
  new DiacriticAbove('\\=', h.text('¯'), ['bar(', ')']);
LatexCmds['\\.'] = () =>
  new DiacriticAbove('\\.', h.text('˙'), ['dot(', ')']);
LatexCmds['\\^'] = () =>
  new DiacriticAbove('\\^', h.text('^'), ['hat(', ')']);

// Arrow/segment diacritics and group marks.
LatexCmds.overleftharpoon = () =>
  new DiacriticAbove('\\overleftharpoon', h.text('↼'), ['overleft harpoon(', ')']);
LatexCmds.overrightharpoon = () =>
  new DiacriticAbove('\\overrightharpoon', h.text('⇀'), ['overright harpoon(', ')']);
LatexCmds.overlinesegment = () =>
  new DiacriticAbove('\\overlinesegment', h.text('―'), ['overline segment(', ')']);
LatexCmds.underleftarrow = () =>
  new DiacriticBelow('\\underleftarrow', h.text('←'), ['underleftarrow(', ')']);
LatexCmds.underrightarrow = () =>
  new DiacriticBelow('\\underrightarrow', h.text('→'), ['underrightarrow(', ')']);
// One-block under/over marks that draw an arc glyph above or below
// their argument (\overgroup, \overbracket, \wideparen, …).
// \underbrace/\overbrace are NOT registered here — the Style-based
// versions near the top own those names.
class UnderOverBrace extends MathCommand {
  constructor(ctrlSeq: string, below: boolean, glyph?: string) {
    super();
    this.ctrlSeq = ctrlSeq;
    var mark = h('span', { class: 'mq-underbrace-arc' }, [
      h.text(glyph || (below ? '⏟' : '⏞'))
    ]);
    this.domView = new DOMView(1, (blocks) =>
      h('span', { class: 'mq-non-leaf mq-underoverbrace' }, below
        ? [h.block('span', {}, blocks[0]), mark]
        : [mark, h.block('span', {}, blocks[0])]
      )
    );
  }
}
LatexCmds.overgroup = () => new UnderOverBrace('\\overgroup', false);
LatexCmds.undergroup = () => new UnderOverBrace('\\undergroup', true);
LatexCmds.overbracket = () =>
  new UnderOverBrace('\\overbracket', false, '⎴');
LatexCmds.underbracket = () =>
  new UnderOverBrace('\\underbracket', true, '⎵');
LatexCmds.underparen = () =>
  new UnderOverBrace('\\underparen', true, '⏝');
LatexCmds.overparen = () =>
  new UnderOverBrace('\\overparen', false, '⏜');
// \wideparen is amssymb's name for the same glyph as \overparen.
LatexCmds.wideparen = () =>
  new UnderOverBrace('\\wideparen', false, '⏜');

// Word-form accents missing upstream (the bare-word variants of the
// escaped accents \' \` \v \u and \ddddot).
LatexCmds.check = () =>
  new DiacriticAbove('\\check', h.text('ˇ'), ['check(', ')']);
LatexCmds.breve = () =>
  new DiacriticAbove('\\breve', h.text('˘'), ['breve(', ')']);
LatexCmds.acute = () =>
  new DiacriticAbove('\\acute', h.text('´'), ['acute(', ')']);
LatexCmds.grave = () =>
  new DiacriticAbove('\\grave', h.text('`'), ['grave(', ')']);
LatexCmds.ddddot = () =>
  new DiacriticAbove('\\ddddot', h.text('....'), ['ddddot(', ')']);
LatexCmds.overleftharp = () =>
  new DiacriticAbove('\\overleftharp', h.text('↼'), ['overleft harp(', ')']);
LatexCmds.overrightharp = () =>
  new DiacriticAbove('\\overrightharp', h.text('⇀'), ['overright harp(', ')']);

// Physics bra-ket notation: \bra{x} → ⟨x|, \ket{x} → |x⟩,
// \braket{x|y} → ⟨x|y⟩ (one block, | is content), \ketbra → |x⟩⟨y|.
function bindBraKet(ctrlSeq: string, open: string, close: string) {
  return () =>
    new MathCommand(
      ctrlSeq,
      new DOMView(1, (blocks) =>
        h('span', { class: 'mq-non-leaf' }, [
          h('span', {}, [h.entityText(open)]),
          h.block('span', {}, blocks[0]),
          h('span', {}, [h.entityText(close)])
        ])
      )
    );
}
LatexCmds.bra = bindBraKet('\\bra', '&lang;', '|');
LatexCmds.ket = bindBraKet('\\ket', '|', '&rang;');
LatexCmds.braket = () =>
  new MathCommand(
    '\\braket',
    new DOMView(1, (blocks) =>
      h('span', { class: 'mq-non-leaf' }, [
        h('span', {}, [h.entityText('&lang;')]),
        h.block('span', {}, blocks[0]),
        h('span', {}, [h.entityText('&rang;')])
      ])
    )
  );
LatexCmds.ketbra = () =>
  new MathCommand(
    '\\ketbra',
    new DOMView(2, (blocks) =>
      h('span', { class: 'mq-non-leaf' }, [
        h('span', {}, [h.text('|')]),
        h.block('span', {}, blocks[0]),
        h('span', {}, [h.entityText('&rang;'), h.entityText('&lang;')]),
        h.block('span', {}, blocks[1]),
        h('span', {}, [h.text('|')])
      ])
    )
  );

// \[ \] \( \) display-math wrappers parse as bracket glyphs so pasted
// display math keeps its delimiters (registered under the escaped
// ctrlSeq — bare ( ) [ ] still go through the symbol fallback).
LatexCmds['\\['] = function () {
  return new VanillaSymbol('\\[', h.text('['), 'open display math');
};
LatexCmds['\\]'] = function () {
  return new VanillaSymbol('\\]', h.text(']'), 'close display math');
};
LatexCmds['\\('] = function () {
  return new VanillaSymbol('\\(', h.text('('), 'open inline math');
};
LatexCmds['\\)'] = function () {
  return new VanillaSymbol('\\)', h.text(')'), 'close inline math');
};

// style switches (\displaystyle … \nolimits) — invisible atoms that
// serialize their command verbatim. \limits/\nolimits sit between an
// operator and its bounds; the bound then attaches to this zero-width
// atom, so `\sum\limits_{i}` renders like `\sum_{i}` and round-trips.
// NOTE: defined here (not advancedSymbols.ts) so the mathquill-basic
// bundle — which concatenates commands.ts but not advancedSymbols.ts —
// can use it too.
function bindStyleModifier(ctrlSeq: string, mathspeak: string) {
  return () =>
    new VanillaSymbol(
      ctrlSeq,
      h('span', { class: 'mq-style-modifier' }),
      mathspeak
    );
}

// Matrix rules — invisible in the grid, serialize verbatim.
LatexCmds.hline = bindStyleModifier('\\hline ', 'h line');
LatexCmds.hdashline = bindStyleModifier('\\hdashline ', 'h dash line');
LatexCmds.midrule = bindStyleModifier('\\midrule ', 'mid rule');
LatexCmds.toprule = bindStyleModifier('\\toprule ', 'top rule');
LatexCmds.bottomrule = bindStyleModifier('\\bottomrule ', 'bottom rule');
LatexCmds.cline = () =>
  new MathCommand(
    '\\cline',
    new DOMView(1, (blocks) =>
      h('span', { class: 'mq-invisible' }, [
        h.block('span', {}, blocks[0])
      ])
    )
  );
LatexCmds.cmidrule = () =>
  new MathCommand(
    '\\cmidrule',
    new DOMView(1, (blocks) =>
      h('span', { class: 'mq-invisible' }, [
        h.block('span', {}, blocks[0])
      ])
    )
  );

// \llap \rlap \clap \smash — overlap boxes; content renders inline.
function bindOverlapCmd(ctrlSeq: string, cls: string, optRegex?: string) {
  return () =>
    new (class extends MathCommand {
      optText = '';
      constructor() {
        super(
          ctrlSeq,
          new DOMView(1, (blocks) =>
            h('span', { class: 'mq-non-leaf ' + cls }, [
              h.block('span', {}, blocks[0])
            ])
          )
        );
      }
      // An overlap command with no following block degrades to a bare
      // \name leaf instead of failing the parse.
      parser() {
        var self = this;
        return (
          optRegex
            ? Parser.regex(new RegExp('^' + optRegex))
                .or(Parser.succeed(''))
                .then(function (opt: string) {
                  self.optText = opt;
                  return latexMathParser.block;
                })
            : latexMathParser.block
        )
          .map(function (b: MathBlock) {
            self.blocks = [b];
            b.adopt(self, 0, 0);
            return self;
          })
          .or(
            Parser.succeed(
              new VanillaSymbol(
                ctrlSeq + ' ',
                h.text(ctrlSeq),
                ctrlSeq.replace(/\\/g, '')
              ) as MQNode | Fragment
            )
          );
      }
      latexRecursive(ctx: LatexContext) {
        this.checkCursorContextOpen(ctx);
        ctx.uncleanedLatex += this.ctrlSeq + this.optText + '{';
        this.blocks![0].latexRecursive(ctx);
        ctx.uncleanedLatex += '}';
        this.checkCursorContextClose(ctx);
      }
    })();
}
LatexCmds.llap = bindOverlapCmd('\\llap', 'mq-llap');
LatexCmds.rlap = bindOverlapCmd('\\rlap', 'mq-rlap');
LatexCmds.clap = bindOverlapCmd('\\clap', 'mq-clap');
LatexCmds.smash = bindOverlapCmd('\\smash', 'mq-smash', '\\[(?:[tb])\\]');
LatexCmds.mathllap = bindOverlapCmd('\\mathllap', 'mq-llap');
LatexCmds.mathrlap = bindOverlapCmd('\\mathrlap', 'mq-rlap');
LatexCmds.mathclap = bindOverlapCmd('\\mathclap', 'mq-clap');
LatexCmds.mathstrut = bindStyleModifier('\\mathstrut ', 'math strut');
LatexCmds.strut = bindStyleModifier('\\strut ', 'strut');

// \iiint \idotsint \ointctrclockwise \varointclockwise — boundless
// integral signs like \iint.
LatexCmds['∭'] = LatexCmds.iiint = boundlessIntegral(
  '\\iiint ',
  '&#8749;',
  'triple integral'
);
LatexCmds.idotsint = boundlessIntegral(
  '\\idotsint ',
  '&#8944;',
  'dots integral'
);
LatexCmds['∳'] = LatexCmds.ointctrclockwise = boundlessIntegral(
  '\\ointctrclockwise ',
  '&#8755;',
  'counterclockwise contour integral'
);
LatexCmds['∲'] = LatexCmds.varointclockwise = boundlessIntegral(
  '\\varointclockwise ',
  '&#8754;',
  'clockwise contour integral'
);

LatexCmds.bigsqcap = LatexCmds.bigsqcapdot = () =>
  new SummationNotation('\\bigsqcap ', '&#10757;', 'square intersection');

LatexCmds.varinjlim = () =>
  new SummationNotation('\\varinjlim ', 'lim&#8594;', 'direct limit');
LatexCmds.varprojlim = () =>
  new SummationNotation('\\varprojlim ', 'lim&#8592;', 'inverse limit');

// \fbox/\framebox — boxed frames; \nicefrac canonicalizes to \frac.
LatexCmds.fbox = () =>
  new Style(
    '\\fbox',
    'span',
    { class: 'mq-non-leaf mq-fbox' },
    'Boxed'
  );
// \makebox[w][pos]{x} / \framebox[w][pos]{x} / \raisebox{d}[ht][dp]{x}
// — a content block preceded by up to two optional bracket args.
// (defined here, not advancedSymbols.ts, so the mathquill-basic bundle —
// which concatenates commands.ts but not advancedSymbols.ts — can use it)
function bindOptBracketCmd(ctrlSeq: string, maxOpt: number, speak: string) {
  return class extends MathCommand {
    optText = '';
    constructor() {
      super(
        ctrlSeq,
        new DOMView(1, (blocks) =>
          h('span', { class: 'mq-non-leaf' }, [
            h.block('span', {}, blocks[0])
          ])
        )
      );
    }
    parser() {
      var self = this;
      return Parser.regex(
        new RegExp('^(?:\\[[^\\]]*\\]){0,' + maxOpt + '}')
      )
        .then(function (opt: string) {
          self.optText = opt;
          return latexMathParser.block;
        })
        .map(function (b: MathBlock) {
          self.blocks = [b];
          b.adopt(self, 0, 0);
          return self;
        });
    }
    latexRecursive(ctx: LatexContext) {
      this.checkCursorContextOpen(ctx);
      ctx.uncleanedLatex += this.ctrlSeq + this.optText + '{';
      this.blocks![0].latexRecursive(ctx);
      ctx.uncleanedLatex += '}';
      this.checkCursorContextClose(ctx);
    }
  };
}

// \framebox keeps optional [width][pos] args like \makebox.
LatexCmds.framebox = bindOptBracketCmd('\\framebox', 2, 'frame box');
LatexCmds.nicefrac = LatexCmds.frac;

// Bold-symbol font wrappers.
LatexCmds.boldsymbol = () =>
  new Style(
    '\\boldsymbol',
    'span',
    { class: 'mq-non-leaf mq-bf mq-it' },
    'Bold Symbol'
  );
LatexCmds.pmb = () =>
  new Style('\\pmb', 'span', { class: 'mq-non-leaf mq-bf' }, 'Poor Mans Bold');
LatexCmds.bm = () =>
  new Style('\\bm', 'span', { class: 'mq-non-leaf mq-bf mq-it' }, 'Bold');
LatexCmds.mathbfit = () =>
  new Style(
    '\\mathbfit',
    'span',
    { class: 'mq-non-leaf mq-bf mq-it' },
    'Bold Italic'
  );

class DelimsNode extends MathCommand {
  delimFrags: Ends<DOMFragment>;

  setDOM(el: Element | undefined) {
    super.setDOM(el);
    const children = this.domFrag().children();
    if (!children.isEmpty()) {
      this.delimFrags = {
        [L]: children.first(),
        [R]: children.last()
      };
    }
    return this;
  }
}

// Round/Square/Curly/Angle Brackets (aka Parens/Brackets/Braces)
//   first typed as one-sided bracket with matching "ghost" bracket at
//   far end of current block, until you type an opposing one
class Bracket extends DelimsNode {
  side: BracketSide;
  sides: {
    [L]: { ch: string; ctrlSeq: string };
    [R]: { ch: string; ctrlSeq: string };
  };
  constructor(
    side: BracketSide,
    open: string,
    close: string,
    ctrlSeq: string,
    end: string
  ) {
    super('\\left' + ctrlSeq, undefined, [open, close]);
    this.side = side;
    this.sides = {
      [L]: { ch: open, ctrlSeq: ctrlSeq },
      [R]: { ch: close, ctrlSeq: end }
    };
  }
  numBlocks() {
    return 1 as const;
  }
  html() {
    var leftSymbol = this.getSymbol(L);
    var rightSymbol = this.getSymbol(R);

    // wait until now so that .side may
    this.domView = new DOMView(1, (blocks) =>
      h(
        // be set by createLeftOf or parser
        'span',
        { class: 'mq-non-leaf mq-bracket-container' },
        [
          h(
            'span',
            {
              style: 'width:' + leftSymbol.width,
              class:
                'mq-scaled mq-bracket-l mq-paren' +
                (this.side === R ? ' mq-ghost' : '')
            },
            [leftSymbol.html()]
          ),
          h.block(
            'span',
            {
              style:
                'margin-left:' +
                leftSymbol.width +
                ';margin-right:' +
                rightSymbol.width,
              class: 'mq-bracket-middle mq-non-leaf'
            },
            blocks[0]
          ),
          h(
            'span',
            {
              style: 'width:' + rightSymbol.width,
              class:
                'mq-scaled mq-bracket-r mq-paren' +
                (this.side === L ? ' mq-ghost' : '')
            },
            [rightSymbol.html()]
          )
        ]
      )
    );
    return super.html();
  }
  getSymbol(side: BracketSide) {
    var ch = this.sides[side || R].ch as keyof typeof SVG_SYMBOLS;
    // a delimiter with no glyph (the invisible `\left.`/`\right.` null
    // delimiter) renders as a zero-width span
    return SVG_SYMBOLS[ch] || { width: '0', html: () => h.text('') };
  }
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);

    ctx.uncleanedLatex += '\\left' + this.sides[L].ctrlSeq;
    this.getEnd(L).latexRecursive(ctx);
    ctx.uncleanedLatex += '\\right' + this.sides[R].ctrlSeq;

    this.checkCursorContextClose(ctx);
  }
  mathspeak(opts?: MathspeakOptions) {
    var open = this.sides[L].ch,
      close = this.sides[R].ch;
    if (open === '|' && close === '|') {
      this.mathspeakTemplate = ['StartAbsoluteValue,', ', EndAbsoluteValue'];
      this.ariaLabel = 'absolute value';
    } else if (opts && opts.createdLeftOf && this.side) {
      var ch = '';
      if (this.side === L) ch = this.textTemplate[0];
      else if (this.side === R) ch = this.textTemplate[1];
      return (
        (this.side === L ? 'left ' : 'right ') +
        BRACKET_NAMES[ch as keyof typeof BRACKET_NAMES]
      );
    } else {
      this.mathspeakTemplate = [
        'left ' + BRACKET_NAMES[open as keyof typeof BRACKET_NAMES] + ',',
        ', right ' + BRACKET_NAMES[close as keyof typeof BRACKET_NAMES]
      ];
      this.ariaLabel =
        BRACKET_NAMES[open as keyof typeof BRACKET_NAMES] + ' block';
    }
    return super.mathspeak();
  }
  matchBrack(
    opts: CursorOptions,
    expectedSide: BracketSide,
    node: NodeRef | undefined
  ) {
    // return node iff it's a matching 1-sided bracket of expected side (if any)
    return (
      node instanceof Bracket &&
      node.side &&
      node.side !== -expectedSide &&
      (!opts.restrictMismatchedBrackets ||
        OPP_BRACKS[
          this.sides[this.side as Direction].ch as keyof typeof BRACKET_NAMES
        ] === node.sides[node.side].ch ||
        // if restrictMismatchedBrackets is "none" instead of true, don't allow mismatched range brackets
        (opts.restrictMismatchedBrackets !== 'none' &&
          { '(': ']', '[': ')' }[this.sides[L].ch] === node.sides[R].ch)) &&
      node
    );
  }
  closeOpposing(brack: Bracket) {
    brack.side = 0;
    brack.sides[this.side as Direction] = this.sides[this.side as Direction]; // copy over my info (may be
    const brackFrag = brack.delimFrags[this.side === L ? L : R] // mismatched, like [a, b))
      .removeClass('mq-ghost');
    this.replaceBracket(brackFrag, this.side);
  }
  createLeftOf(cursor: Cursor) {
    var brack;
    if (!this.replacedFragment) {
      // unless wrapping seln in brackets,
      // check if next to or inside an opposing one-sided bracket
      var opts = cursor.options;
      if (this.sides[L].ch === '|') {
        // check both sides if I'm a pipe
        brack =
          this.matchBrack(opts, R, cursor[R]) ||
          this.matchBrack(opts, L, cursor[L]) ||
          this.matchBrack(opts, 0, cursor.parent.parent);
      } else {
        brack =
          this.matchBrack(
            opts,
            -this.side as BracketSide,
            cursor[-this.side as Direction]
          ) ||
          this.matchBrack(
            opts,
            -this.side as BracketSide,
            cursor.parent.parent
          );
      }
    }
    if (brack) {
      var side = (this.side = -brack.side as BracketSide); // may be pipe with .side not yet set
      this.closeOpposing(brack);
      if (brack === cursor.parent.parent && cursor[side as Direction]) {
        // move the stuff between
        new Fragment(
          cursor[side as Direction],
          cursor.parent.getEnd(side as Direction),
          -side as Direction
        ) // me and ghost outside
          .disown()
          .withDirAdopt(
            -side as Direction,
            brack.parent,
            brack,
            brack[side as Direction]
          )
          .domFrag()
          .insDirOf(side as Direction, brack.domFrag());
      }
      brack.bubble(function (node) {
        node.reflow();
        return undefined;
      });
    } else {
      (brack = this), (side = brack.side);
      if (brack.replacedFragment) brack.side = 0;
      // wrapping seln, don't be one-sided
      else if (cursor[-side as Direction]) {
        // elsewise, auto-expand so ghost is at far end
        brack.replaces(
          new Fragment(
            cursor[-side as Direction],
            cursor.parent.getEnd(-side as Direction),
            side as Direction
          )
        );
        cursor[-side as Direction] = 0;
      }
      super.createLeftOf(cursor);
    }
    if (side === L) cursor.insAtLeftEnd(brack.getEnd(L));
    else cursor.insRightOf(brack);
  }
  placeCursor() {}
  unwrap() {
    this.getEnd(L)
      .children()
      .disown()
      .adopt(this.parent, this, this[R])
      .domFrag()
      .insertAfter(this.domFrag());
    this.remove();
  }
  deleteSide(side: Direction, outward: boolean, cursor: Cursor) {
    var parent = this.parent,
      sib = this[side],
      farEnd = parent.getEnd(side);

    if (side === this.side) {
      // deleting non-ghost of one-sided bracket, unwrap
      this.unwrap();
      sib
        ? cursor.insDirOf(-side as Direction, sib)
        : cursor.insAtDirEnd(side, parent);
      return;
    }

    var opts = cursor.options,
      wasSolid = !this.side;
    this.side = -side as Direction;
    // if deleting like, outer close-brace of [(1+2)+3} where inner open-paren
    if (this.matchBrack(opts, side, this.getEnd(L).getEnd(this.side))) {
      // is ghost,
      this.closeOpposing(
        this.getEnd(L).getEnd(this.side as Direction) as Bracket
      ); // then become [1+2)+3
      var origEnd = this.getEnd(L).getEnd(side);
      this.unwrap();
      if (origEnd) origEnd.siblingCreated(cursor.options, side);
      if (sib) {
        cursor.insDirOf(-side as Direction, sib);
      } else {
        cursor.insAtDirEnd(side, parent);
      }
    } else {
      // if deleting like, inner close-brace of ([1+2}+3) where outer

      if (this.matchBrack(opts, side, this.parent.parent)) {
        // open-paren is

        (this.parent.parent as Bracket).closeOpposing(this); // ghost, then become [1+2+3)
        (this.parent.parent as Bracket).unwrap();
      } // else if deleting outward from a solid pair, unwrap
      else if (outward && wasSolid) {
        this.unwrap();
        sib
          ? cursor.insDirOf(-side as Direction, sib)
          : cursor.insAtDirEnd(side, parent);
        return;
      } else {
        // else deleting just one of a pair of brackets, become one-sided
        this.sides[side] = getOppBracketSide(this);
        this.delimFrags[L].removeClass('mq-ghost');
        this.delimFrags[R].removeClass('mq-ghost');
        const brackFrag = this.delimFrags[side].addClass('mq-ghost');
        this.replaceBracket(brackFrag, side);
      }
      if (sib) {
        // auto-expand so ghost is at far end
        const leftEnd = this.getEnd(L);
        var origEnd = leftEnd.getEnd(side);
        leftEnd.domFrag().removeClass('mq-empty');
        new Fragment(sib, farEnd, -side as Direction)
          .disown()
          .withDirAdopt(-side as Direction, leftEnd, origEnd, 0)
          .domFrag()
          .insAtDirEnd(side, leftEnd.domFrag().oneElement());
        if (origEnd) origEnd.siblingCreated(cursor.options, side);
        cursor.insDirOf(-side as Direction, sib);
      } // didn't auto-expand, cursor goes just outside or just inside parens
      else
        outward
          ? cursor.insDirOf(side, this)
          : cursor.insAtDirEnd(side, this.getEnd(L));
    }
  }
  replaceBracket(brackFrag: DOMFragment, side: BracketSide) {
    var symbol = this.getSymbol(side);
    brackFrag.children().replaceWith(domFrag(symbol.html()));
    brackFrag.oneElement().style.width = symbol.width;

    if (side === L) {
      const next = brackFrag.next();
      if (!next.isEmpty()) {
        next.oneElement().style.marginLeft = symbol.width;
      }
    } else {
      const prev = brackFrag.prev();
      if (!prev.isEmpty()) {
        prev.oneElement().style.marginRight = symbol.width;
      }
    }
  }
  deleteTowards(dir: Direction, cursor: Cursor) {
    this.deleteSide(-dir as Direction, false, cursor);
  }
  finalizeTree() {
    this.getEnd(L).deleteOutOf = function (dir: Direction, cursor: Cursor) {
      (this.parent as Bracket).deleteSide(dir, true, cursor);
    };
    // FIXME HACK: after initial creation/insertion, finalizeTree would only be
    // called if the paren is selected and replaced, e.g. by LiveFraction
    this.finalizeTree = this.intentionalBlur = function () {
      this.delimFrags[this.side === L ? R : L].removeClass('mq-ghost');
      this.side = 0;
    };
  }
  siblingCreated(_opts: CursorOptions, dir: Direction) {
    // if something typed between ghost and far
    if (dir === -this.side) this.finalizeTree(); // end of its block, solidify
  }
}

function getOppBracketSide(bracket: Bracket) {
  var side = bracket.side as Direction;
  var data = bracket.sides[side];
  return {
    ch: OPP_BRACKS[data.ch as keyof typeof OPP_BRACKS],
    ctrlSeq: OPP_BRACKS[data.ctrlSeq as keyof typeof OPP_BRACKS]
  };
}

var OPP_BRACKS = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '\\{': '\\}',
  '\\}': '\\{',
  '&lang;': '&rang;',
  '&rang;': '&lang;',
  '\\langle ': '\\rangle ',
  '\\rangle ': '\\langle ',
  '|': '|',
  '\\lVert ': '\\rVert ',
  '\\rVert ': '\\lVert '
};

var BRACKET_NAMES = {
  '&lang;': 'angle-bracket',
  '&rang;': 'angle-bracket',
  '|': 'pipe',
  '.': 'null-delimiter'
};

function bindCharBracketPair(
  open: keyof typeof OPP_BRACKS,
  ctrlSeq: string,
  name: string
) {
  var ctrlSeq = ctrlSeq || open;
  var close = OPP_BRACKS[open];
  var end = OPP_BRACKS[ctrlSeq as keyof typeof OPP_BRACKS];
  CharCmds[open] = () => new Bracket(L, open, close, ctrlSeq, end);
  CharCmds[close] = () => new Bracket(R, open, close, ctrlSeq, end);
  BRACKET_NAMES[open as keyof typeof BRACKET_NAMES] = BRACKET_NAMES[
    close as keyof typeof BRACKET_NAMES
  ] = name;
}
bindCharBracketPair('(', '', 'parenthesis');
bindCharBracketPair('[', '', 'bracket');
bindCharBracketPair('{', '\\{', 'brace');
// Typed \langle auto-pairs like every Bracket; a standalone \langle x
// parses as a plain ⟨ symbol because a one-sided Bracket fails its own
// parser and blanks the field. Same for \rangle, \lVert, \rVert below.
class StandaloneBracket extends Bracket {
  parseSymbol: VanillaSymbol;
  constructor(
    side: BracketSide,
    open: string,
    close: string,
    ctrlSeq: string,
    end: string,
    mathspeak: string
  ) {
    super(side, open, close, ctrlSeq, end);
    this.parseSymbol = new VanillaSymbol(
      ctrlSeq,
      h.entityText(side === L ? open : close),
      mathspeak
    );
  }
  parser() {
    return Parser.succeed(this.parseSymbol) as Parser<MQNode | Fragment>;
  }
}
LatexCmds.langle = () =>
  new StandaloneBracket(
    L,
    '&lang;',
    '&rang;',
    '\\langle ',
    '\\rangle ',
    'left angle bracket'
  );
LatexCmds.rangle = () =>
  new StandaloneBracket(
    R,
    '&lang;',
    '&rang;',
    '\\rangle ',
    '\\langle ',
    'right angle bracket'
  );
CharCmds['|'] = () => new Bracket(L, '|', '|', '|', '|');
LatexCmds.lVert = () =>
  new StandaloneBracket(
    L,
    '&#8741;',
    '&#8741;',
    '\\lVert ',
    '\\rVert ',
    'left norm'
  );
LatexCmds.rVert = () =>
  new StandaloneBracket(
    R,
    '&#8741;',
    '&#8741;',
    '\\rVert ',
    '\\lVert ',
    'right norm'
  );

LatexCmds.left = class extends MathCommand {
  // Parser-only command: the delimiter lives in the argument after
  // \left, so a typed '\left' inserts nothing and the following
  // delimiter keystroke auto-pairs the bracket itself.
  createLeftOf() {}
  numBlocks() {
    return 1 as const;
  }

  parser() {
    var regex = Parser.regex;
    var string = Parser.string;
    var optWhitespace = Parser.optWhitespace;

    return optWhitespace
      .then(
        regex(
          /^(?:[([|.]|\\\{|\\langle(?![a-zA-Z])|\\lVert(?![a-zA-Z])|\\\|)/
        )
      )
      .then(function (ctrlSeq) {
        var open = ctrlSeq.replace(/^\\/, '');
        if (ctrlSeq == '\\langle') {
          open = '&lang;';
          ctrlSeq = ctrlSeq + ' ';
        }
        if (ctrlSeq == '\\lVert') {
          open = '&#8741;';
          ctrlSeq = ctrlSeq + ' ';
        }
        if (ctrlSeq == '\\|') {
          open = '&#8741;';
        }
        return latexMathParser.then(function (block) {
          return string('\\right')
            .skip(optWhitespace)
            .then(
              regex(
                /^(?:[\])|.]|\\\}|\\rangle(?![a-zA-Z])|\\rVert(?![a-zA-Z])|\\\|)/
              )
            )
            .map(function (end) {
              var close = end.replace(/^\\/, '');
              if (end == '\\rangle') {
                close = '&rang;';
                end = end + ' ';
              }
              if (end == '\\rVert') {
                close = '&#8741;';
                end = end + ' ';
              }
              if (end == '\\|') {
                close = '&#8741;';
              }
              var cmd = new Bracket(0, open, close, ctrlSeq, end);
              cmd.blocks = [block];
              block.adopt(cmd, 0, 0);
              return cmd;
            });
        });
      });
  }
};

LatexCmds.right = class extends MathCommand {
  // Parser-only command, see \left.
  createLeftOf() {}
  numBlocks() {
    return 1 as const;
  }

  parser() {
    return Parser.fail('unmatched \\right');
  }
};

// \big| \Big| \bigg| \Bigg| — fixed-size delimiters. Parser-only (like
// \left): they render the delimiter glyph at a fixed scale and keep the
// full \big<delim> ctrlSeq so the latex round-trips.
const BIG_DELIM_SCALES: Record<string, string> = {
  big: '1.2',
  Big: '1.6',
  bigg: '2.1',
  Bigg: '2.6'
};
const BIG_DELIM_CHARS: Record<string, string> = {
  '(': '(',
  ')': ')',
  '[': '[',
  ']': ']',
  '|': '|',
  '.': '',
  '\\{': '{',
  '\\}': '}',
  '\\|': '‖',
  '\\langle': '⟨',
  '\\rangle': '⟩',
  '\\lVert': '‖',
  '\\rVert': '‖'
};
const BIG_DELIM_RE =
  /^(?:\\langle(?![a-zA-Z])|\\rangle(?![a-zA-Z])|\\lVert(?![a-zA-Z])|\\rVert(?![a-zA-Z])|\\\{|\\\}|\\[|.]|[()\[\]|.])/;
class BigDelim extends MathCommand {
  sizeSeq = '\\big';
  constructor(sizeSeq: string) {
    super();
    this.sizeSeq = '\\' + sizeSeq;
  }
  createLeftOf() {}
  numBlocks() {
    return 1 as const;
  }
  parser() {
    var self = this;
    return Parser.optWhitespace
      .then(Parser.regex(BIG_DELIM_RE))
      .then(function (delimTok) {
        var ch = BIG_DELIM_CHARS[delimTok];
        if (ch === undefined) return Parser.fail('not a \\big delimiter');
        var ctrlSeq =
          self.sizeSeq + (delimTok.length > 1 ? delimTok + ' ' : delimTok);
        var scale = BIG_DELIM_SCALES[self.sizeSeq.slice(1)];
        var inner =
          ch === ''
            ? h('span', { style: 'width:0' })
            : h('span', { style: 'font-size:' + scale + 'em' }, [
                h.text(ch)
              ]);
        return Parser.succeed(
          new MQSymbol(ctrlSeq, h('span', {}, [inner]), undefined, 'delimiter')
        );
      });
  }
}
LatexCmds.big = () => new BigDelim('big');
LatexCmds.Big = () => new BigDelim('Big');
LatexCmds.bigg = () => new BigDelim('bigg');
LatexCmds.Bigg = () => new BigDelim('Bigg');

var leftBinomialSymbol = SVG_SYMBOLS['('];
var rightBinomialSymbol = SVG_SYMBOLS[')'];
class Binomial extends DelimsNode {
  ctrlSeq = '\\binom';
  domView = new DOMView(2, (blocks) =>
    h('span', { class: 'mq-non-leaf mq-bracket-container' }, [
      h(
        'span',
        {
          style: 'width:' + leftBinomialSymbol.width,
          class: 'mq-paren mq-bracket-l mq-scaled'
        },
        [leftBinomialSymbol.html()]
      ),
      h(
        'span',
        {
          style:
            'margin-left:' +
            leftBinomialSymbol.width +
            '; margin-right:' +
            rightBinomialSymbol.width,
          class: 'mq-non-leaf mq-bracket-middle'
        },
        [
          h('span', { class: 'mq-array mq-non-leaf' }, [
            h.block('span', {}, blocks[0]),
            h.block('span', {}, blocks[1])
          ])
        ]
      ),
      h(
        'span',
        {
          style: 'width:' + rightBinomialSymbol.width,
          class: 'mq-paren mq-bracket-r mq-scaled'
        },
        [rightBinomialSymbol.html()]
      )
    ])
  );

  textTemplate = ['choose(', ',', ')'];
  mathspeakTemplate = ['StartBinomial,', 'Choose', ', EndBinomial'];
  ariaLabel = 'binomial';

  finalizeTree() {
    const endsL = this.getEnd(L);
    const endsR = this.getEnd(R);
    this.upInto = endsR.upOutOf = endsL;
    this.downInto = endsL.downOutOf = endsR;
    // https://math.stackexchange.com/a/1617456 cites Knuth as the source of 'upper index' and 'lower index'
    endsL.ariaLabel = 'upper index';
    endsR.ariaLabel = 'lower index';
  }
}

LatexCmds.binom = LatexCmds.binomial = Binomial;
// \tfrac serializes canonically as \frac (same as \dfrac/\cfrac);
// \dbinom/\tbinom likewise as \binom
LatexCmds.tfrac = LatexCmds.frac;
LatexCmds.dbinom = LatexCmds.tbinom = LatexCmds.binom;

LatexCmds.choose = class extends Binomial {
  createLeftOf(cursor: Cursor) {
    LiveFraction.prototype.createLeftOf.call(this, cursor);
  }
  parser() {
    // DelimsNode's strict two-block parser (Binomial.parser() falls back
    // to a \binom leaf via MathCommand, which would shadow \choose's own
    // fallback).
    return DelimsNode.prototype.strictParser
      .call(this)
      .or(
        Parser.succeed(
          new VanillaSymbol(
            '\\choose ',
            h.text('\\choose'),
            'choose'
          ) as MQNode | Fragment
        )
      ) as Parser<MQNode | Fragment>;
  }
};

class MathFieldNode extends MathCommand {
  name: string;
  ctrlSeq = '\\MathQuillMathField';
  domView = new DOMView(1, (blocks) => {
    const spacingBugAppend = hasSpacingBug() ? ' mq-has-spacing-bug' : '';
    return h('span', { class: 'mq-editable-field' }, [
      h.block(
        'span',
        {
          class: 'mq-root-block' + spacingBugAppend,
          'aria-hidden': 'true'
        },
        blocks[0]
      )
    ]);
  });
  parser() {
    var self = this,
      string = Parser.string,
      regex = Parser.regex,
      succeed = Parser.succeed;
    return string('[')
      .then(regex(/^[a-z][a-z0-9]*/i))
      .skip(string(']'))
      .map(function (name) {
        self.name = name;
      })
      .or(succeed(undefined))
      .then(super.parser());
  }
  finalizeTree(options: CursorOptions) {
    var ctrlr = new Controller(
      this.getEnd(L) as ControllerRoot,
      this.domFrag().oneElement(),
      options
    );
    ctrlr.KIND_OF_MQ = 'MathField';
    ctrlr.editable = true;
    ctrlr.createTextarea();
    ctrlr.editablesTextareaEvents();
    ctrlr.cursor.insAtRightEnd(ctrlr.root);
    RootBlockMixin(ctrlr.root);

    // MathQuill applies aria-hidden to .mq-root-block containers
    // because these contain math notation that screen readers can't
    // interpret directly. MathQuill use an aria-live region as a
    // sibling of these block containers to provide an alternative
    // representation for screen readers
    //
    // MathFieldNodes have their own focusable text aria and aria live
    // region, so it is incorrect for any parent of the editable field
    // to have an aria-hidden property
    //
    // https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-hidden
    //
    // Handle this by recursively walking the parents of this element
    // until we hit a root block, and if we hit any parent with
    // aria-hidden="true", removing the property from the parent and
    // pushing it down to each of the parents children. This should
    // result in no parent of this node having aria-hidden="true", but
    // should keep as much of what was previously hidden hidden as
    // possible while obeying this constraint
    function pushDownAriaHidden(node: ParentNode) {
      if (node.parentNode && !domFrag(node).hasClass('mq-root-block')) {
        pushDownAriaHidden(node.parentNode);
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        if (element.getAttribute('aria-hidden') === 'true') {
          element.removeAttribute('aria-hidden');
          domFrag(node)
            .children()
            .eachElement((child) => {
              child.setAttribute('aria-hidden', 'true');
            });
        }
      }
    }

    pushDownAriaHidden(this.domFrag().parent().oneElement());
    this.domFrag().oneElement().removeAttribute('aria-hidden');
  }
  registerInnerField(innerFields: InnerFields, MathField: InnerMathField) {
    const controller = (this.getEnd(L) as RootMathBlock).controller;
    const newField = new MathField(controller);
    innerFields[this.name] = newField;
    innerFields.push(newField);
  }
  latexRecursive(ctx: LatexContext) {
    this.checkCursorContextOpen(ctx);

    this.getEnd(L).latexRecursive(ctx);

    this.checkCursorContextClose(ctx);
  }
  text() {
    return this.getEnd(L).text();
  }
}
LatexCmds.editable = LatexCmds.MathQuillMathField = MathFieldNode; // backcompat with before cfd3620 on #233

// Embed arbitrary things
// Probably the closest DOM analogue would be an iframe?
// From MathQuill's perspective, it's a MQSymbol, it can be
// anywhere and the cursor can go around it but never in it.
// Create by calling public API method .dropEmbedded(),
// or by calling the global public API method .registerEmbed()
// and rendering LaTeX like \embed{registeredName} (see test).
class EmbedNode extends MQSymbol {
  setOptions(options: EmbedOptions) {
    function noop() {
      return '';
    }
    this.text = options.text || noop;
    this.domView = new DOMView(0, () =>
      h('span', {}, [parseHTML(options.htmlString || '')])
    );
    this.latex = options.latex || noop;
    return this;
  }
  latexRecursive(ctx: LatexContext): void {
    this.checkCursorContextOpen(ctx);

    ctx.uncleanedLatex += this.latex();

    this.checkCursorContextClose(ctx);
  }
  parser() {
    var self = this,
      string = Parser.string,
      regex = Parser.regex,
      succeed = Parser.succeed;
    return string('{')
      .then(regex(/^[a-z][a-z0-9]*/i))
      .skip(string('}'))
      .then(function (name) {
        // the chars allowed in the optional data block are arbitrary other than
        // excluding curly braces and square brackets (which'd be too confusing)
        return string('[')
          .then(regex(/^[-\w\s]*/))
          .skip(string(']'))
          .or(succeed(undefined))
          .map(function (data) {
            return self.setOptions(EMBEDS[name](data));
          });
      });
  }
}
LatexCmds.embed = EmbedNode;
