// ============================================================================
//  extraCommands.ts — MathCompile's added LaTeX commands
// ============================================================================
//
// Everything in this file is a *pure addition* on top of upstream MathQuill:
// whole new LatexCmds/CharCmds and their helper classes, concatenated after
// every upstream source in SOURCES_FULL so it can reference any upstream
// symbol (MathCommand, Style, Fraction, Bracket, Parser, ...). It sits before
// environments.ts because environments registers boundless integrals via the
// boundlessIntegral() helper defined here — keep this order.
//
// Modifications *inside* upstream code can't live here — those stay inline in
// their files and are tagged `// MATHCOMPILE:` (grep that marker, plus this
// file and environments.ts, for the complete local patch surface).
//
// NOTE: this file is in SOURCES_BASIC too — anything in it must only use
// symbols from BASE_SOURCES + math.ts + basicSymbols.ts + commands.ts (the
// "defined here, not advancedSymbols.ts" comments flag that constraint).

//======================================================================
//  Fonts (\mathcal \mathfrak \boldsymbol \mathbfit …)
//======================================================================

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

//======================================================================
//  Boxes, colors, links (\boxed \fbox \framebox \color \colorbox \fcolorbox \href)
//======================================================================

// \boxed{...} — content with a drawn frame.
LatexCmds.boxed = () =>
  new Style(
    '\\boxed',
    'span',
    { class: 'mq-non-leaf mq-boxed' },
    'Boxed'
  );

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
// (defined here, not advancedSymbols.ts: extraCommands.ts is in
// SOURCES_BASIC too, so the mathquill-basic bundle can use it)
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

//======================================================================
//  Under/over scripts and braces (\underbrace \overset \underset \stackrel)
//======================================================================

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

//======================================================================
//  Modular arithmetic (\pmod \pod \bmod \mod)
//======================================================================

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

//======================================================================
//  Integrals — boundless signs (\iint \antid \oiint \oiiint \iiint …)
//======================================================================

const U_DOUBLE_INTEGRAL = '\u222C';

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

//======================================================================
//  Fractions (\cfrac \tfrac \nicefrac \dbinom \tbinom)
//======================================================================

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

// \tfrac serializes canonically as \frac (same as \dfrac/\cfrac);
// \dbinom/\tbinom likewise as \binom
LatexCmds.tfrac = LatexCmds.frac;
LatexCmds.dbinom = LatexCmds.tbinom = LatexCmds.binom;

LatexCmds.nicefrac = LatexCmds.frac;

//======================================================================
//  Accents and diacritics (\ddot \widehat \` \~ \check \breve …)
//======================================================================

LatexCmds.ddot = () =>
  new DiacriticAbove('\\ddot', h.text('¨'), ['ddot(', ')']);
LatexCmds.dddot = () =>
  new DiacriticAbove('\\dddot', h.text('...'), ['dddot(', ')']);

// \widehat is the wide variant of \hat; render it with the same atom
// (serializes back as \hat).
LatexCmds.widehat = LatexCmds.hat;

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

//======================================================================
//  Extensible arrows (\xrightarrow \xmapsto \xRightarrow …)
//======================================================================

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
LatexCmds.xLongrightarrow = bindArrowLabelCmd('\\xLongrightarrow', '⟶');
LatexCmds.xLongleftarrow = bindArrowLabelCmd('\\xLongleftarrow', '⟵');
LatexCmds.xtwoheadrightarrow = bindArrowLabelCmd('\\xtwoheadrightarrow', '↠');
LatexCmds.xtwoheadleftarrow = bindArrowLabelCmd('\\xtwoheadleftarrow', '↞');
LatexCmds.xtofrom = bindArrowLabelCmd('\\xtofrom', '⇄');

// \cancel \bcancel \xcancel — struck-through content.

//======================================================================
//  Cancels (\cancel \bcancel \xcancel \cancelto)
//======================================================================

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

//======================================================================
//  Delimiters (\langle \lVert \bra \big \bigl \middle \[)
//======================================================================

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

function bindBraKet(ctrlSeq: string, open: string, close: string) {
  return () =>
    new MathCommand(
      ctrlSeq,
      new DOMView(1, (blocks) =>
        h('span', { class: 'mq-non-leaf' }, [
          h('span', { class: 'mq-bra-ket-delim' }, [h.entityText(open)]),
          h.block('span', {}, blocks[0]),
          h('span', { class: 'mq-bra-ket-delim' }, [h.entityText(close)])
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
        h('span', { class: 'mq-bra-ket-delim' }, [h.entityText('&lang;')]),
        h.block('span', {}, blocks[0]),
        h('span', { class: 'mq-bra-ket-delim' }, [h.entityText('&rang;')])
      ])
    )
  );
LatexCmds.ketbra = () =>
  new MathCommand(
    '\\ketbra',
    new DOMView(2, (blocks) =>
      h('span', { class: 'mq-non-leaf' }, [
        h('span', { class: 'mq-bra-ket-delim' }, [h.text('|')]),
        h.block('span', {}, blocks[0]),
        h('span', { class: 'mq-bra-ket-delim' }, [
          h.entityText('&rang;'),
          h.entityText('&lang;')
        ]),
        h.block('span', {}, blocks[1]),
        h('span', { class: 'mq-bra-ket-delim' }, [h.text('|')])
      ])
    )
  );

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

//======================================================================
//  Line breaks and layout atoms (\\ \cr \hline \smash \strut)
//======================================================================

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

// style switches (\displaystyle … \nolimits) — invisible atoms that
// serialize their command verbatim. \limits/\nolimits sit between an
// operator and its bounds; the bound then attaches to this zero-width
// atom, so `\sum\limits_{i}` renders like `\sum_{i}` and round-trips.
// NOTE: defined here (not advancedSymbols.ts): extraCommands.ts is in
// SOURCES_BASIC too, so the mathquill-basic bundle can use it.
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

//======================================================================
//  Misc large operators (\bigsqcap \varinjlim \varprojlim)
//======================================================================

LatexCmds.bigsqcap = LatexCmds.bigsqcapdot = () =>
  new SummationNotation('\\bigsqcap ', '&#10757;', 'square intersection');

LatexCmds.varinjlim = () =>
  new SummationNotation('\\varinjlim ', 'lim&#8594;', 'direct limit');
LatexCmds.varprojlim = () =>
  new SummationNotation('\\varprojlim ', 'lim&#8592;', 'inverse limit');
