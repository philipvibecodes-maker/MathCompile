/************************************
 * Symbols for Advanced Mathematics
 ***********************************/

function bindSimpleBinop(latex: string) {
  return bindBinaryOperator('\\' + latex + ' ', '&' + latex + ';', latex);
}

LatexCmds['∉'] = LatexCmds.notin = bindSimpleBinop('notin');
LatexCmds['≡'] = LatexCmds.equiv = bindSimpleBinop('equiv');
LatexCmds['⊕'] = LatexCmds.oplus = bindSimpleBinop('oplus');
LatexCmds['⊗'] = LatexCmds.otimes = bindSimpleBinop('otimes');

LatexCmds['∗'] =
  LatexCmds.ast =
  LatexCmds.star =
  LatexCmds.loast =
  LatexCmds.lowast =
    bindBinaryOperator('\\ast ', '&lowast;', 'low asterisk');

LatexCmds['∴'] =
  LatexCmds.therefor =
  LatexCmds.therefore =
    bindBinaryOperator('\\therefore ', '&there4;', 'therefore');

LatexCmds['∵'] =
  LatexCmds.cuz =
  LatexCmds.because =
    bindBinaryOperator(
      // l33t
      '\\because ',
      '&#8757;',
      'because'
    );

LatexCmds['∝'] =
  LatexCmds.prop =
  LatexCmds.propto =
    bindBinaryOperator('\\propto ', '&prop;', 'proportional to');

// Note "≈" is dupliucated in basicSymbols.
LatexCmds['≈'] =
  LatexCmds.asymp =
  LatexCmds.approx =
    bindBinaryOperator('\\approx ', '&asymp;', 'approximately equal to');

LatexCmds['∈'] =
  LatexCmds.isin =
  LatexCmds['in'] =
    bindBinaryOperator('\\in ', '&isin;', 'is in');

LatexCmds['∋'] =
  LatexCmds.ni =
  LatexCmds.contains =
    bindBinaryOperator('\\ni ', '&ni;', 'contains');

LatexCmds['∌'] =
  LatexCmds.notni =
  LatexCmds.niton =
  LatexCmds.notcontains =
  LatexCmds.doesnotcontain =
    bindBinaryOperator('\\not\\ni ', '&#8716;', 'does not contain');

LatexCmds['⊂'] =
  LatexCmds.sub =
  LatexCmds.subset =
    bindBinaryOperator('\\subset ', '&sub;', 'subset');

LatexCmds['⊃'] =
  LatexCmds.sup =
  LatexCmds.supset =
  LatexCmds.superset =
    bindBinaryOperator('\\supset ', '&sup;', 'superset');

LatexCmds['⊄'] =
  LatexCmds.nsub =
  LatexCmds.notsub =
  LatexCmds.nsubset =
  LatexCmds.notsubset =
    bindBinaryOperator('\\not\\subset ', '&#8836;', 'not a subset');

LatexCmds['⊅'] =
  LatexCmds.nsup =
  LatexCmds.notsup =
  LatexCmds.nsupset =
  LatexCmds.notsupset =
  LatexCmds.nsuperset =
  LatexCmds.notsuperset =
    bindBinaryOperator('\\not\\supset ', '&#8837;', 'not a superset');

LatexCmds['⊆'] =
  LatexCmds.sube =
  LatexCmds.subeq =
  LatexCmds.subsete =
  LatexCmds.subseteq =
    bindBinaryOperator('\\subseteq ', '&sube;', 'subset or equal to');

LatexCmds['⊇'] =
  LatexCmds.supe =
  LatexCmds.supeq =
  LatexCmds.supsete =
  LatexCmds.supseteq =
  LatexCmds.supersete =
  LatexCmds.superseteq =
    bindBinaryOperator('\\supseteq ', '&supe;', 'superset or equal to');

LatexCmds['⊊'] =
  LatexCmds.nsube =
  LatexCmds.nsubeq =
  LatexCmds.notsube =
  LatexCmds.notsubeq =
  LatexCmds.nsubsete =
  LatexCmds.nsubseteq =
  LatexCmds.notsubsete =
  LatexCmds.notsubseteq =
    bindBinaryOperator('\\not\\subseteq ', '&#8840;', 'not subset or equal to');

LatexCmds['⊋'] =
  LatexCmds.nsupe =
  LatexCmds.nsupeq =
  LatexCmds.notsupe =
  LatexCmds.notsupeq =
  LatexCmds.nsupsete =
  LatexCmds.nsupseteq =
  LatexCmds.notsupsete =
  LatexCmds.notsupseteq =
  LatexCmds.nsupersete =
  LatexCmds.nsuperseteq =
  LatexCmds.notsupersete =
  LatexCmds.notsuperseteq =
    bindBinaryOperator(
      '\\not\\supseteq ',
      '&#8841;',
      'not superset or equal to'
    );

//the canonical sets of numbers
// Unicode codepoints for double-struck capitals without a dedicated
// LatexCmds class (the letterlike-symbol letters C/H/N/P/Q/R/Z have
// their own classes below). Digits use the 𝟘-𝟡 block.
var MATHBB_GLYPHS: { [ch: string]: number } = {
  A: 0x1d538,
  B: 0x1d539,
  D: 0x1d53b,
  E: 0x1d53c,
  F: 0x1d53d,
  G: 0x1d53e,
  I: 0x1d540,
  J: 0x1d541,
  K: 0x1d542,
  L: 0x1d543,
  M: 0x1d544,
  O: 0x1d546,
  S: 0x1d54a,
  T: 0x1d54b,
  U: 0x1d54c,
  V: 0x1d54d,
  W: 0x1d54e,
  X: 0x1d54f,
  Y: 0x1d550
};

LatexCmds.mathbb = class extends MathCommand {
  createLeftOf(_cursor: Cursor) {}
  numBlocks() {
    return 1 as const;
  }
  parser() {
    var string = Parser.string;
    var regex = Parser.regex;
    var optWhitespace = Parser.optWhitespace;
    return optWhitespace
      .then(string('{'))
      .then(optWhitespace)
      .then(regex(/^[A-Z0-9]/))
      .skip(optWhitespace)
      .skip(string('}'))
      .map(function (c) {
        // instantiate the class for the matching char
        var cmd = LatexCmds[c];
        if (cmd) {
          if (isMQNodeClass(cmd)) {
            return new cmd();
          } else {
            return (cmd as MQNodeBuilderNoParam)();
          }
        }
        var codepoint =
          MATHBB_GLYPHS[c] || 0x1d7d8 + c.charCodeAt(0) - 48;
        return new VanillaSymbol(
          '\\mathbb{' + c + '}',
          h.text(String.fromCodePoint(codepoint)),
          'mathbb ' + c
        );
      });
  }
};

// \Bbb{R} and \mathds{F} are old/amsmath spellings of \mathbb
LatexCmds.Bbb = LatexCmds.mathds = LatexCmds.mathbb;

LatexCmds['ℕ'] =
  LatexCmds.N =
  LatexCmds.naturals =
  LatexCmds.Naturals =
    bindVanillaSymbol('\\mathbb{N}', '&#8469;', 'naturals');

LatexCmds['ℙ'] =
  LatexCmds.P =
  LatexCmds.primes =
  LatexCmds.Primes =
  LatexCmds.projective =
  LatexCmds.Projective =
  LatexCmds.probability =
  LatexCmds.Probability =
    bindVanillaSymbol('\\mathbb{P}', '&#8473;', 'P');

LatexCmds['ℤ'] =
  LatexCmds.Z =
  LatexCmds.integers =
  LatexCmds.Integers =
    bindVanillaSymbol('\\mathbb{Z}', '&#8484;', 'integers');

LatexCmds['ℚ'] =
  LatexCmds.Q =
  LatexCmds.rationals =
  LatexCmds.Rationals =
    bindVanillaSymbol('\\mathbb{Q}', '&#8474;', 'rationals');

LatexCmds['ℝ'] =
  LatexCmds.R =
  LatexCmds.reals =
  LatexCmds.Reals =
    bindVanillaSymbol('\\mathbb{R}', '&#8477;', 'reals');

LatexCmds['ℂ'] =
  LatexCmds.C =
  LatexCmds.complex =
  LatexCmds.Complex =
  LatexCmds.complexes =
  LatexCmds.Complexes =
  LatexCmds.complexplane =
  LatexCmds.Complexplane =
  LatexCmds.ComplexPlane =
    bindVanillaSymbol('\\mathbb{C}', '&#8450;', 'complexes');

LatexCmds['ℍ'] =
  LatexCmds.H =
  LatexCmds.Hamiltonian =
  LatexCmds.quaternions =
  LatexCmds.Quaternions =
    bindVanillaSymbol('\\mathbb{H}', '&#8461;', 'quaternions');

//spacing
LatexCmds.quad = LatexCmds.emsp = bindVanillaSymbol(
  '\\quad ',
  '    ',
  '4 spaces'
);
LatexCmds.qquad = bindVanillaSymbol('\\qquad ', '        ', '8 spaces');

// style switches (\displaystyle … \nolimits) — invisible atoms that
// serialize their command verbatim. \limits/\nolimits sit between an
// operator and its bounds; the bound then attaches to this zero-width
// atom, so `\sum\limits_{i}` renders like `\sum_{i}` and round-trips.
function bindStyleModifier(ctrlSeq: string, mathspeak: string) {
  return () =>
    new VanillaSymbol(
      ctrlSeq,
      h('span', { class: 'mq-style-modifier' }),
      mathspeak
    );
}
LatexCmds.displaystyle = bindStyleModifier(
  '\\displaystyle ',
  'displaystyle'
);
LatexCmds.textstyle = bindStyleModifier('\\textstyle ', 'textstyle');
LatexCmds.scriptstyle = bindStyleModifier('\\scriptstyle ', 'scriptstyle');
LatexCmds.scriptscriptstyle = bindStyleModifier(
  '\\scriptscriptstyle ',
  'scriptscriptstyle'
);
LatexCmds.limits = bindStyleModifier('\\limits ', 'limits');
LatexCmds.nolimits = bindStyleModifier('\\nolimits ', 'no limits');
/* spacing special characters, gonna have to implement this in LatexCommandInput::onText somehow
case ',':
  return VanillaSymbol('\\, ',' ', 'comma');
case ':':
  return VanillaSymbol('\\: ','  ', 'colon');
case ';':
  return VanillaSymbol('\\; ','   ', 'semicolon');
case '!':
  return MQSymbol('\\! ','<span style="margin-right:-.2em"></span>', 'exclamation point');
*/

//binary operators
LatexCmds['◇'] = LatexCmds.diamond = bindVanillaSymbol(
  '\\diamond ',
  '&#9671;',
  'diamond'
);
LatexCmds.bigtriangleup = bindVanillaSymbol(
  '\\bigtriangleup ',
  '&#9651;',
  'triangle up'
);
LatexCmds['⊖'] = LatexCmds.ominus = bindVanillaSymbol(
  '\\ominus ',
  '&#8854;',
  'o minus'
);
LatexCmds['⊎'] = LatexCmds.uplus = bindVanillaSymbol(
  '\\uplus ',
  '&#8846;',
  'disjoint union'
);
LatexCmds.bigtriangledown = bindVanillaSymbol(
  '\\bigtriangledown ',
  '&#9661;',
  'triangle down'
);
LatexCmds['⊓'] = LatexCmds.sqcap = bindVanillaSymbol(
  '\\sqcap ',
  '&#8851;',
  'greatest lower bound'
);
LatexCmds['⊲'] = LatexCmds.triangleleft = bindVanillaSymbol(
  '\\triangleleft ',
  '&#8882;',
  'triangle left'
);
LatexCmds['⊔'] = LatexCmds.sqcup = bindVanillaSymbol(
  '\\sqcup ',
  '&#8852;',
  'least upper bound'
);
LatexCmds['⊳'] = LatexCmds.triangleright = bindVanillaSymbol(
  '\\triangleright ',
  '&#8883;',
  'triangle right'
);
//circledot is not a not real LaTex command see https://github.com/mathquill/mathquill/pull/552 for more details
LatexCmds['⊙'] =
  LatexCmds.odot =
  LatexCmds.circledot =
    bindVanillaSymbol('\\odot ', '&#8857;', 'circle dot');
LatexCmds['†'] = LatexCmds.dagger = bindVanillaSymbol(
  '\\dagger ',
  '&#0134;',
  'dagger'
);
LatexCmds['‡'] = LatexCmds.ddagger = bindVanillaSymbol(
  '\\ddagger ',
  '&#135;',
  'big dagger'
);
LatexCmds['≀'] = LatexCmds.wr = bindVanillaSymbol('\\wr ', '&#8768;', 'wreath');
LatexCmds['∐'] = LatexCmds.amalg = bindVanillaSymbol(
  '\\amalg ',
  '&#8720;',
  'amalgam'
);

//relationship symbols
LatexCmds['⊨'] = LatexCmds.models = bindVanillaSymbol(
  '\\models ',
  '&#8872;',
  'models'
);
LatexCmds['≺'] = LatexCmds.prec = bindVanillaSymbol(
  '\\prec ',
  '&#8826;',
  'precedes'
);
LatexCmds['≻'] = LatexCmds.succ = bindVanillaSymbol(
  '\\succ ',
  '&#8827;',
  'succeeds'
);
LatexCmds['≼'] = LatexCmds.preceq = bindVanillaSymbol(
  '\\preceq ',
  '&#8828;',
  'precedes or equals'
);
LatexCmds['≽'] = LatexCmds.succeq = bindVanillaSymbol(
  '\\succeq ',
  '&#8829;',
  'succeeds or equals'
);
LatexCmds['≃'] = LatexCmds.simeq = bindVanillaSymbol(
  '\\simeq ',
  '&#8771;',
  'similar or equal to'
);
LatexCmds['∣'] = LatexCmds.mid = bindVanillaSymbol(
  '\\mid ',
  '&#8739;',
  'divides'
);
LatexCmds['≪'] = LatexCmds.ll = bindVanillaSymbol('\\ll ', '&#8810;', 'll');
LatexCmds['≫'] = LatexCmds.gg = bindVanillaSymbol('\\gg ', '&#8811;', 'gg');
LatexCmds.parallel = bindVanillaSymbol(
  '\\parallel ',
  '&#8741;',
  'parallel with'
);
LatexCmds.nparallel = bindVanillaSymbol(
  '\\nparallel ',
  '&#8742;',
  'not parallel with'
);
LatexCmds['⋈'] = LatexCmds.bowtie = bindVanillaSymbol(
  '\\bowtie ',
  '&#8904;',
  'bowtie'
);
LatexCmds['⊏'] = LatexCmds.sqsubset = bindVanillaSymbol(
  '\\sqsubset ',
  '&#8847;',
  'square subset'
);
LatexCmds['⊐'] = LatexCmds.sqsupset = bindVanillaSymbol(
  '\\sqsupset ',
  '&#8848;',
  'square superset'
);
LatexCmds['⌣'] = LatexCmds.smile = bindVanillaSymbol(
  '\\smile ',
  '&#8995;',
  'smile'
);
LatexCmds['⊑'] = LatexCmds.sqsubseteq = bindVanillaSymbol(
  '\\sqsubseteq ',
  '&#8849;',
  'square subset or equal to'
);
LatexCmds['⊒'] = LatexCmds.sqsupseteq = bindVanillaSymbol(
  '\\sqsupseteq ',
  '&#8850;',
  'square superset or equal to'
);
LatexCmds['≐'] = LatexCmds.doteq = bindVanillaSymbol(
  '\\doteq ',
  '&#8784;',
  'dotted equals'
);
LatexCmds['⌢'] = LatexCmds.frown = bindVanillaSymbol(
  '\\frown ',
  '&#8994;',
  'frown'
);
LatexCmds['⊦'] = LatexCmds.vdash = bindVanillaSymbol(
  '\\vdash ',
  '&#8870;',
  'v dash'
);
LatexCmds['⊣'] = LatexCmds.dashv = bindVanillaSymbol(
  '\\dashv ',
  '&#8867;',
  'dash v'
);
LatexCmds['≮'] = LatexCmds.nless = bindVanillaSymbol(
  '\\nless ',
  '&#8814;',
  'not less than'
);
LatexCmds['≯'] = LatexCmds.ngtr = bindVanillaSymbol(
  '\\ngtr ',
  '&#8815;',
  'not greater than'
);

//arrows
LatexCmds.longleftarrow = bindVanillaSymbol(
  '\\longleftarrow ',
  '&#8592;',
  'left arrow'
);
LatexCmds.longrightarrow = bindVanillaSymbol(
  '\\longrightarrow ',
  '&#8594;',
  'right arrow'
);
LatexCmds.Longleftarrow = bindVanillaSymbol(
  '\\Longleftarrow ',
  '&#8656;',
  'left arrow'
);
LatexCmds.Longrightarrow = bindVanillaSymbol(
  '\\Longrightarrow ',
  '&#8658;',
  'right arrow'
);
LatexCmds.longleftrightarrow = bindVanillaSymbol(
  '\\longleftrightarrow ',
  '&#8596;',
  'left and right arrow'
);
LatexCmds['↕'] = LatexCmds.updownarrow = bindVanillaSymbol(
  '\\updownarrow ',
  '&#8597;',
  'up and down arrow'
);
LatexCmds.Longleftrightarrow = bindVanillaSymbol(
  '\\Longleftrightarrow ',
  '&#8660;',
  'left and right arrow'
);
LatexCmds['⇕'] = LatexCmds.Updownarrow = bindVanillaSymbol(
  '\\Updownarrow ',
  '&#8661;',
  'up and down arrow'
);
LatexCmds['↦'] = LatexCmds.mapsto = bindVanillaSymbol(
  '\\mapsto ',
  '&#8614;',
  'maps to'
);
LatexCmds['↗'] = LatexCmds.nearrow = bindVanillaSymbol(
  '\\nearrow ',
  '&#8599;',
  'northeast arrow'
);
LatexCmds['↩'] = LatexCmds.hookleftarrow = bindVanillaSymbol(
  '\\hookleftarrow ',
  '&#8617;',
  'hook left arrow'
);
LatexCmds['↪'] = LatexCmds.hookrightarrow = bindVanillaSymbol(
  '\\hookrightarrow ',
  '&#8618;',
  'hook right arrow'
);
LatexCmds['↘'] = LatexCmds.searrow = bindVanillaSymbol(
  '\\searrow ',
  '&#8600;',
  'southeast arrow'
);
LatexCmds['↼'] = LatexCmds.leftharpoonup = bindVanillaSymbol(
  '\\leftharpoonup ',
  '&#8636;',
  'left harpoon up'
);
LatexCmds['⇀'] = LatexCmds.rightharpoonup = bindVanillaSymbol(
  '\\rightharpoonup ',
  '&#8640;',
  'right harpoon up'
);
LatexCmds['↙'] = LatexCmds.swarrow = bindVanillaSymbol(
  '\\swarrow ',
  '&#8601;',
  'southwest arrow'
);
LatexCmds['↽'] = LatexCmds.leftharpoondown = bindVanillaSymbol(
  '\\leftharpoondown ',
  '&#8637;',
  'left harpoon down'
);
LatexCmds['⇁'] = LatexCmds.rightharpoondown = bindVanillaSymbol(
  '\\rightharpoondown ',
  '&#8641;',
  'right harpoon down'
);
LatexCmds['↖'] = LatexCmds.nwarrow = bindVanillaSymbol(
  '\\nwarrow ',
  '&#8598;',
  'northwest arrow'
);

//Misc
// \dots has the unicode for \ldots
LatexCmds.ldots = bindVanillaSymbol('\\ldots ', '&#8230;', 'l dots');
LatexCmds['⋯'] = LatexCmds.cdots = bindVanillaSymbol(
  '\\cdots ',
  '&#8943;',
  'c dots'
);
LatexCmds['⋮'] = LatexCmds.vdots = bindVanillaSymbol(
  '\\vdots ',
  '&#8942;',
  'v dots'
);
LatexCmds['⋱'] = LatexCmds.ddots = bindVanillaSymbol(
  '\\ddots ',
  '&#8945;',
  'd dots'
);
// LatexCmds['√'] is defined in basicSymbols
LatexCmds.surd = bindVanillaSymbol('\\surd ', '&#8730;', 'unresolved root');
LatexCmds['ℓ'] = LatexCmds.ell = bindVanillaSymbol('\\ell ', '&#8467;', 'ell');
LatexCmds['⊤'] = LatexCmds.top = bindVanillaSymbol('\\top ', '&#8868;', 'top');
LatexCmds['♭'] = LatexCmds.flat = bindVanillaSymbol(
  '\\flat ',
  '&#9837;',
  'flat'
);
LatexCmds['♮'] = LatexCmds.natural = bindVanillaSymbol(
  '\\natural ',
  '&#9838;',
  'natural'
);
LatexCmds['♯'] = LatexCmds.sharp = bindVanillaSymbol(
  '\\sharp ',
  '&#9839;',
  'sharp'
);
LatexCmds['℘'] = LatexCmds.wp = bindVanillaSymbol('\\wp ', '&#8472;', 'wp');
LatexCmds['⊥'] = LatexCmds.bot = bindVanillaSymbol('\\bot ', '&#8869;', 'bot');
LatexCmds['♣'] = LatexCmds.clubsuit = bindVanillaSymbol(
  '\\clubsuit ',
  '&#9827;',
  'club suit'
);
LatexCmds['♢'] = LatexCmds.diamondsuit = bindVanillaSymbol(
  '\\diamondsuit ',
  '&#9826;',
  'diamond suit'
);
LatexCmds['♡'] = LatexCmds.heartsuit = bindVanillaSymbol(
  '\\heartsuit ',
  '&#9825;',
  'heart suit'
);
LatexCmds['♠'] = LatexCmds.spadesuit = bindVanillaSymbol(
  '\\spadesuit ',
  '&#9824;',
  'spade suit'
);
LatexCmds['⬜'] = LatexCmds.square = bindVanillaSymbol(
  '\\square ',
  '&#11036;',
  'square'
);

//variable-sized
// These are not actually variable-sized, and bigX (bigcap...) is the same as X (cap...)
LatexCmds['∮'] = LatexCmds.oint = bindVanillaSymbol(
  '\\oint ',
  '&#8750;',
  'o int'
);
LatexCmds.bigcap = bindVanillaSymbol('\\bigcap ', '&#8745;', 'big cap');
LatexCmds.bigcup = bindVanillaSymbol('\\bigcup ', '&#8746;', 'big cup');
LatexCmds.bigsqcup = bindVanillaSymbol(
  '\\bigsqcup ',
  '&#8852;',
  'big square cup'
);
LatexCmds.bigvee = bindVanillaSymbol('\\bigvee ', '&#8744;', 'big vee');
LatexCmds.bigwedge = bindVanillaSymbol('\\bigwedge ', '&#8743;', 'big wedge');
LatexCmds.bigodot = bindVanillaSymbol('\\bigodot ', '&#8857;', 'big o dot');
LatexCmds.bigotimes = bindVanillaSymbol(
  '\\bigotimes ',
  '&#8855;',
  'big o times'
);
LatexCmds.bigoplus = bindVanillaSymbol('\\bigoplus ', '&#8853;', 'big o plus');
LatexCmds.biguplus = bindVanillaSymbol('\\biguplus ', '&#8846;', 'big u plus');

//delimiters
LatexCmds['⌊'] = LatexCmds.lfloor = bindVanillaSymbol(
  '\\lfloor ',
  '&#8970;',
  'left floor'
);
LatexCmds['⌋'] = LatexCmds.rfloor = bindVanillaSymbol(
  '\\rfloor ',
  '&#8971;',
  'right floor'
);
LatexCmds['⌈'] = LatexCmds.lceil = bindVanillaSymbol(
  '\\lceil ',
  '&#8968;',
  'left ceiling'
);
LatexCmds['⌉'] = LatexCmds.rceil = bindVanillaSymbol(
  '\\rceil ',
  '&#8969;',
  'right ceiling'
);
LatexCmds.opencurlybrace = LatexCmds.lbrace = bindVanillaSymbol(
  '\\lbrace ',
  '{',
  'left brace'
);
LatexCmds.closecurlybrace = LatexCmds.rbrace = bindVanillaSymbol(
  '\\rbrace ',
  '}',
  'right brace'
);
LatexCmds.lbrack = bindVanillaSymbol('[', 'left bracket');
LatexCmds.rbrack = bindVanillaSymbol(']', 'right bracket');

//various symbols
LatexCmds.slash = bindVanillaSymbol('/', 'slash');
LatexCmds.vert = bindVanillaSymbol('|', 'vertical bar');
LatexCmds.perp = LatexCmds.perpendicular = bindVanillaSymbol(
  '\\perp ',
  '&perp;',
  'perpendicular'
);
LatexCmds['∇'] =
  LatexCmds.nabla =
  LatexCmds.del =
    bindVanillaSymbol('\\nabla ', '&nabla;');
LatexCmds['ℏ'] = LatexCmds.hbar = bindVanillaSymbol(
  '\\hbar ',
  '&#8463;',
  'horizontal bar'
);

LatexCmds['Å'] =
  LatexCmds.AA =
  LatexCmds.Angstrom =
  LatexCmds.angstrom =
    bindVanillaSymbol('\\AA ', '&#8491;', 'AA');

LatexCmds['∘'] =
  LatexCmds.circ =
  LatexCmds.circle =
    bindVanillaSymbol('\\circ ', '&#8728;', 'circle');

// \ring/\mathring are LaTeX ring accents (˚ above), not the ∘ operator
LatexCmds.ring = () =>
  new DiacriticAbove('\\ring', h.text('˚'), ['ring(', ')']);
LatexCmds.mathring = () =>
  new DiacriticAbove('\\mathring', h.text('˚'), ['ring(', ')']);

LatexCmds['•'] =
  LatexCmds.bull =
  LatexCmds.bullet =
    bindVanillaSymbol('\\bullet ', '&bull;', 'bullet');

LatexCmds['∖'] =
  LatexCmds.setminus =
  LatexCmds.smallsetminus =
    bindVanillaSymbol('\\setminus ', '&#8726;', 'set minus');

LatexCmds.lnot = // plain negation
  LatexCmds['¬'] =
  LatexCmds.neg =
    bindVanillaSymbol('\\neg ', '&not;', 'not');

// `\not` + a relation produces the negated relation glyph:
// `\not\in` → ∉, `\not=` → ≠, `\not\subset` → ⊄. Relations without a
// known negation keep a standalone \not (∕) so the text round-trips.
const NOT_RELATIONS: { [rel: string]: string } = {
  '=': 'ne',
  '<': 'nless',
  '>': 'ngtr',
  '\\in': 'notin',
  '\\ni': 'notni',
  '\\exists': 'nexists',
  '\\subset': 'nsubset',
  '\\supset': 'nsupset',
  '\\subseteq': 'nsubseteq',
  '\\supseteq': 'nsupseteq',
  '\\cong': 'ncong',
  '\\sim': 'nsim',
  '\\parallel': 'nparallel',
  '\\approx': 'napprox',
  '\\equiv': 'nequiv',
  '\\mid': 'nmid',
  '\\le': 'nleq',
  '\\leq': 'nleq',
  '\\ge': 'ngeq',
  '\\geq': 'ngeq',
  '\\vdash': 'nvdash',
  '\\prec': 'nprec',
  '\\succ': 'nsucc',
  '\\preceq': 'npreceq',
  '\\succeq': 'nsucceq'
};

LatexCmds.not = class extends MathCommand {
  createLeftOf() {}
  numBlocks() {
    return 1 as const;
  }
  parser() {
    return Parser.optWhitespace
      .then(latexMathParser.block)
      .then(function (block) {
        var first = block.getEnd(L) as MQNode | undefined;
        var key = (first && first.ctrlSeq ? first.ctrlSeq : '').replace(
          /\s+$/,
          ''
        );
        var target = key ? NOT_RELATIONS[key] : undefined;
        var cmd = target ? LatexCmds[target] : undefined;
        if (cmd) {
          return Parser.succeed(
            isMQNodeClass(cmd)
              ? new (cmd as typeof MathCommand)()
              : (cmd as MQNodeBuilderNoParam)()
          );
        }
        return Parser.fail('not a negatable relation');
      })
      .or(Parser.succeed(new VanillaSymbol('\\not ', h.text('∕'))));
  }
};

// negated relations needed by the \not mapping (and parsed on their own)
LatexCmds['≉'] = LatexCmds.napprox = bindBinaryOperator(
  '\\not\\approx ',
  '&#8777;',
  'not approximately'
);
LatexCmds['≢'] = LatexCmds.nequiv = bindBinaryOperator(
  '\\not\\equiv ',
  '&#8802;',
  'not equivalent to'
);
LatexCmds['∤'] = LatexCmds.nmid = bindBinaryOperator(
  '\\not\\mid ',
  '&#8740;',
  'does not divide'
);
LatexCmds['≰'] =
  LatexCmds.nle =
  LatexCmds.nleq =
    bindBinaryOperator('\\not\\le ', '&#8816;', 'not less than or equal to');
LatexCmds['≱'] =
  LatexCmds.nge =
  LatexCmds.ngeq =
    bindBinaryOperator(
      '\\not\\ge ',
      '&#8817;',
      'not greater than or equal to'
    );
LatexCmds['⊬'] = LatexCmds.nvdash = bindBinaryOperator(
  '\\not\\vdash ',
  '&#8876;',
  'does not prove'
);
LatexCmds['⊀'] = LatexCmds.nprec = bindBinaryOperator(
  '\\not\\prec ',
  '&#8832;',
  'does not precede'
);
LatexCmds['⊁'] = LatexCmds.nsucc = bindBinaryOperator(
  '\\not\\succ ',
  '&#8833;',
  'does not succeed'
);
LatexCmds['⋠'] = LatexCmds.npreceq = bindBinaryOperator(
  '\\not\\preceq ',
  '&#8928;',
  'not precede or equal'
);
LatexCmds['⋡'] = LatexCmds.nsucceq = bindBinaryOperator(
  '\\not\\succeq ',
  '&#8929;',
  'not succeed or equal'
);

LatexCmds['…'] =
  LatexCmds.dots =
  LatexCmds.ellip =
  LatexCmds.hellip =
  LatexCmds.ellipsis =
  LatexCmds.hellipsis =
    bindVanillaSymbol('\\dots ', '&hellip;', 'ellipsis');

LatexCmds['↓'] =
  LatexCmds.converges =
  LatexCmds.darr =
  LatexCmds.dnarr =
  LatexCmds.dnarrow =
  LatexCmds.downarrow =
    bindVanillaSymbol('\\downarrow ', '&darr;', 'converges with');

LatexCmds['⇓'] =
  LatexCmds.dArr =
  LatexCmds.dnArr =
  LatexCmds.dnArrow =
  LatexCmds.Downarrow =
    bindVanillaSymbol('\\Downarrow ', '&dArr;', 'down arrow');

LatexCmds['↑'] =
  LatexCmds.diverges =
  LatexCmds.uarr =
  LatexCmds.uparrow =
    bindVanillaSymbol('\\uparrow ', '&uarr;', 'diverges from');

LatexCmds['⇑'] =
  LatexCmds.uArr =
  LatexCmds.Uparrow =
    bindVanillaSymbol('\\Uparrow ', '&uArr;', 'up arrow');

LatexCmds.rarr = LatexCmds.rightarrow = bindVanillaSymbol(
  '\\rightarrow ',
  '&rarr;',
  'right arrow'
);

LatexCmds.implies = bindBinaryOperator('\\Rightarrow ', '&rArr;', 'implies');

LatexCmds['⇒'] =
  LatexCmds.rArr =
  LatexCmds.Rightarrow =
    bindVanillaSymbol('\\Rightarrow ', '&rArr;', 'right arrow');

LatexCmds.gets = bindBinaryOperator('\\gets ', '&larr;', 'gets');

LatexCmds['←'] =
  LatexCmds.larr =
  LatexCmds.leftarrow =
    bindVanillaSymbol('\\leftarrow ', '&larr;', 'left arrow');

LatexCmds.impliedby = bindBinaryOperator(
  '\\Leftarrow ',
  '&lArr;',
  'implied by'
);

LatexCmds['⇐'] =
  LatexCmds.lArr =
  LatexCmds.Leftarrow =
    bindVanillaSymbol('\\Leftarrow ', '&lArr;', 'left arrow');

LatexCmds['↔'] =
  LatexCmds.harr =
  LatexCmds.lrarr =
  LatexCmds.leftrightarrow =
    bindVanillaSymbol('\\leftrightarrow ', '&harr;', 'left and right arrow');

LatexCmds.iff = bindBinaryOperator(
  '\\Leftrightarrow ',
  '&hArr;',
  'if and only if'
);

LatexCmds['⇔'];
LatexCmds.hArr =
  LatexCmds.lrArr =
  LatexCmds.Leftrightarrow =
    bindVanillaSymbol('\\Leftrightarrow ', '&hArr;', 'left and right arrow');

LatexCmds.Re =
  LatexCmds.Real =
  LatexCmds.real =
    bindVanillaSymbol('\\Re ', '&real;', 'real');

LatexCmds.Im =
  LatexCmds.imag =
  LatexCmds.image =
  LatexCmds.imagin =
  LatexCmds.imaginary =
  LatexCmds.Imaginary =
    bindVanillaSymbol('\\Im ', '&image;', 'imaginary');

LatexCmds['∂'] =
  LatexCmds.part =
  LatexCmds.partial =
    bindVanillaSymbol('\\partial ', '&part;', 'partial');

LatexCmds['£'] = LatexCmds.pounds = bindVanillaSymbol('\\pounds ', '&pound;');

LatexCmds['ℵ'] =
  LatexCmds.alef =
  LatexCmds.alefsym =
  LatexCmds.aleph =
  LatexCmds.alephsym =
    bindVanillaSymbol('\\aleph ', '&alefsym;', 'alef sym');

LatexCmds['∃'] =
  LatexCmds.xist = //LOL
  LatexCmds.xists =
  LatexCmds.exist =
  LatexCmds.exists =
    bindVanillaSymbol('\\exists ', '&exist;', 'there exists at least 1');
// forall is in basicSymbols.

LatexCmds['∄'] =
  LatexCmds.nexists =
  LatexCmds.nexist =
    bindVanillaSymbol('\\nexists ', '&#8708;', 'there is no');

LatexCmds['∧'] =
  LatexCmds.and =
  LatexCmds.land =
  LatexCmds.wedge =
    bindBinaryOperator('\\wedge ', '&and;', 'and');

LatexCmds['∨'] =
  LatexCmds.or =
  LatexCmds.lor =
  LatexCmds.vee =
    bindBinaryOperator('\\vee ', '&or;', 'or');

LatexCmds['∅'] =
  LatexCmds.o =
  LatexCmds.O =
  LatexCmds.empty =
  LatexCmds.emptyset =
  LatexCmds.oslash =
  LatexCmds.Oslash =
  LatexCmds.nothing =
  LatexCmds.varnothing =
    bindBinaryOperator('\\varnothing ', '&empty;', 'nothing');

LatexCmds['∪'] =
  LatexCmds.cup =
  LatexCmds.union =
    bindBinaryOperator('\\cup ', '&cup;', 'union');

LatexCmds['∩'] =
  LatexCmds.cap =
  LatexCmds.intersect =
  LatexCmds.intersection =
    bindBinaryOperator('\\cap ', '&cap;', 'intersection');

// ===== Round-trip coverage: more commands real LaTeX emits =====
// Each entry below previously failed parse and blanked the field.

// Named spacing commands (the \, \: \; \! single-char forms are in
// basicSymbols). Widths follow LaTeX: enspace .5em, thinspace = \,
// medspace = \:, thickspace = \;, negative med/thick the negatives.
function bindSpacingCmd(ctrlSeq: string, ems: number, speak: string) {
  return () =>
    new VanillaSymbol(
      ctrlSeq + ' ',
      h('span', { style: 'margin-left:' + ems + 'em' }, []),
      speak
    );
}
LatexCmds.enspace = bindSpacingCmd('\\enspace', 0.5, 'en space');
LatexCmds.thinspace = bindSpacingCmd('\\thinspace', 0.1667, 'thin space');
LatexCmds.medspace = bindSpacingCmd('\\medspace', 0.2222, 'medium space');
LatexCmds.thickspace = bindSpacingCmd('\\thickspace', 0.2778, 'thick space');
LatexCmds.negmedspace = bindSpacingCmd('\\negmedspace', -0.2222, 'negative medium space');
LatexCmds.negthickspace = bindSpacingCmd(
  '\\negthickspace',
  -0.2778,
  'negative thick space'
);

// Spacing/phantom commands that take a {size or content} block — the
// argument is kept verbatim; rendered zero-width/invisible.
function bindInvisibleBlockCmd(ctrlSeq: string, cls: string) {
  return () =>
    new MathCommand(
      ctrlSeq,
      new DOMView(1, (blocks) =>
        h('span', { class: 'mq-non-leaf ' + cls }, [
          h.block('span', {}, blocks[0])
        ])
      )
    );
}
LatexCmds.hspace = bindInvisibleBlockCmd('\\hspace', 'mq-invisible');
LatexCmds.mspace = bindInvisibleBlockCmd('\\mspace', 'mq-invisible');
LatexCmds.kern = bindInvisibleBlockCmd('\\kern', 'mq-invisible');
LatexCmds.mkern = bindInvisibleBlockCmd('\\mkern', 'mq-invisible');
LatexCmds.phantom = bindInvisibleBlockCmd('\\phantom', 'mq-phantom');
LatexCmds.vphantom = bindInvisibleBlockCmd('\\vphantom', 'mq-phantom');
LatexCmds.hphantom = bindInvisibleBlockCmd('\\hphantom', 'mq-phantom');
// equation-numbering commands — meaningless in a cell but keep the text
// \tag{1} and the starred variant \tag*{1} (unparenthesized tag).
LatexCmds.tag = class extends MathCommand {
  starred = false;
  constructor() {
    super(
      '\\tag',
      new DOMView(1, (blocks) =>
        h('span', { class: 'mq-non-leaf mq-invisible' }, [
          h.block('span', {}, blocks[0])
        ])
      )
    );
  }
  parser() {
    var self = this;
    return Parser.optWhitespace
      .then(Parser.string('*').or(Parser.succeed('')))
      .then(function (star: string) {
        self.starred = !!star;
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
    ctx.uncleanedLatex += '\\tag' + (this.starred ? '*' : '') + '{';
    this.blocks![0].latexRecursive(ctx);
    ctx.uncleanedLatex += '}';
    this.checkCursorContextClose(ctx);
  }
};
LatexCmds.notag = bindStyleModifier('\\notag ', 'no tag');
LatexCmds.nonumber = bindStyleModifier('\\nonumber ', 'no number');

// \mathord/\mathbin/\mathop/\mathrel/\mathopen/\mathclose/\mathpunct/
// \mathinner/\mathnormal — atom-type wrappers; the wrapper is kept in
// the serialization, content passes through visually.
function bindMathWrap(cmd: string) {
  var ctrlSeq = '\\' + cmd;
  LatexCmds[cmd] = () =>
    new MathCommand(
      ctrlSeq,
      new DOMView(1, (blocks) =>
        h('span', { class: 'mq-non-leaf' }, [
          h.block('span', {}, blocks[0])
        ])
      )
    );
}
[
  'mathord',
  'mathbin',
  'mathop',
  'mathrel',
  'mathopen',
  'mathclose',
  'mathpunct',
  'mathinner',
  'mathnormal'
].forEach(bindMathWrap);

// Text-style accents usable in math mode: above accents \v \u \r
// (caron, breve, ring — \r is the ring accent; \H is already \mathbb{H}
// so the double-acute form is not registered), below accents \d \b \c.
LatexCmds.v = () =>
  new DiacriticAbove('\\v', h.text('ˇ'), ['check(', ')']);
LatexCmds.u = () =>
  new DiacriticAbove('\\u', h.text('˘'), ['breve(', ')']);
LatexCmds.r = () => new DiacriticAbove('\\r', h.text('˚'), ['ring(', ')']);
LatexCmds.d = () =>
  new DiacriticBelow('\\d', h.text('&#803;'), ['dot below(', ')']);
LatexCmds.b = () =>
  new DiacriticBelow('\\b', h.text('&#818;'), ['bar below(', ')']);
LatexCmds.c = () =>
  new DiacriticBelow('\\c', h.text('¸'), ['cedilla(', ')']);

LatexCmds.widehat = () =>
  new DiacriticAbove('\\widehat', h.text('^'), ['widehat(', ')']);
LatexCmds.widetilde = () =>
  new DiacriticAbove('\\widetilde', h.text('~'), ['widetilde(', ')']);

// Relations missing from the table.
LatexCmds['⊊'] = LatexCmds.subsetneq = bindBinaryOperator(
  '\\subsetneq ',
  '&#8842;',
  'subset of, not equal to'
);
LatexCmds['⊋'] = LatexCmds.supsetneq = bindBinaryOperator(
  '\\supsetneq ',
  '&#8843;',
  'superset of, not equal to'
);
LatexCmds['⫋'] = LatexCmds.subsetneqq = bindBinaryOperator(
  '\\subsetneqq ',
  '&#10955;',
  'subset of, not equal to'
);
LatexCmds['⫌'] = LatexCmds.supsetneqq = bindBinaryOperator(
  '\\supsetneqq ',
  '&#10956;',
  'superset of, not equal to'
);
LatexCmds['⊊'] = LatexCmds.varsubsetneq = LatexCmds.varsubsetneqq =
  bindBinaryOperator('\\varsubsetneq ', '&#8842;', 'subset of, not equal to');
LatexCmds['⊋'] = LatexCmds.varsupsetneq = LatexCmds.varsupsetneqq =
  bindBinaryOperator('\\varsupsetneq ', '&#8843;', 'superset of, not equal to');
LatexCmds['≲'] = LatexCmds.lesssim = bindBinaryOperator(
  '\\lesssim ',
  '&#8818;',
  'less than or similar'
);
LatexCmds['≳'] = LatexCmds.gtrsim = bindBinaryOperator(
  '\\gtrsim ',
  '&#8819;',
  'greater than or similar'
);
LatexCmds['≾'] = LatexCmds.precsim = bindBinaryOperator(
  '\\precsim ',
  '&#8830;',
  'precedes or similar'
);
LatexCmds['≿'] = LatexCmds.succsim = bindBinaryOperator(
  '\\succsim ',
  '&#8831;',
  'succeeds or similar'
);
LatexCmds['≶'] = LatexCmds.lessgtr = bindBinaryOperator(
  '\\lessgtr ',
  '&#8822;',
  'less than or greater than'
);
LatexCmds['≷'] = LatexCmds.gtrless = bindBinaryOperator(
  '\\gtrless ',
  '&#8823;',
  'greater than or less than'
);
LatexCmds['≊'] = LatexCmds.approxeq = bindBinaryOperator(
  '\\approxeq ',
  '&#8778;',
  'approximately equal to'
);
LatexCmds['≑'] = LatexCmds.doteqdot = LatexCmds.Doteq = bindBinaryOperator(
  '\\doteqdot ',
  '&#8785;',
  'geometrically equal to'
);
LatexCmds['≓'] = LatexCmds.risingdotseq = bindBinaryOperator(
  '\\risingdotseq ',
  '&#8787;',
  'rising dot equals'
);
LatexCmds['≒'] = LatexCmds.fallingdotseq = bindBinaryOperator(
  '\\fallingdotseq ',
  '&#8786;',
  'falling dot equals'
);
LatexCmds['≖'] = LatexCmds.eqcirc = bindBinaryOperator(
  '\\eqcirc ',
  '&#8790;',
  'equals with circle'
);
LatexCmds['≗'] = LatexCmds.circeq = bindBinaryOperator(
  '\\circeq ',
  '&#8791;',
  'circled equals'
);
LatexCmds['≜'] = LatexCmds.triangleq = bindBinaryOperator(
  '\\triangleq ',
  '&#8796;',
  'triangle equals'
);
LatexCmds['≏'] = LatexCmds.bumpeq = bindBinaryOperator(
  '\\bumpeq ',
  '&#8781;',
  'bump equals'
);
LatexCmds['≎'] = LatexCmds.Bumpeq = bindBinaryOperator(
  '\\Bumpeq ',
  '&#8782;',
  'Bump equals'
);
LatexCmds['⊨'] = LatexCmds.vDash = bindBinaryOperator(
  '\\vDash ',
  '&#8872;',
  'double vertical bar'
);
LatexCmds['⊩'] = LatexCmds.Vdash = bindBinaryOperator(
  '\\Vdash ',
  '&#8873;',
  'vertical bar double bar'
);
LatexCmds['⊪'] = LatexCmds.Vvdash = bindBinaryOperator(
  '\\Vvdash ',
  '&#8874;',
  'triple vertical bar'
);
LatexCmds['≔'] = LatexCmds.coloneqq = LatexCmds.colonequals =
  LatexCmds.assign =
    bindBinaryOperator('\\coloneqq ', '&#8788;', 'colon equals');
LatexCmds['≕'] = LatexCmds.eqqcolon = LatexCmds.equalscolon =
  bindBinaryOperator('\\eqqcolon ', '&#8789;', 'equals colon');

// More letter/misc symbols.
LatexCmds['ı'] = LatexCmds.imath = bindVanillaSymbol(
  '\\imath ',
  '&#305;',
  'dotless i'
);
LatexCmds['ȷ'] = LatexCmds.jmath = bindVanillaSymbol(
  '\\jmath ',
  '&#567;',
  'dotless j'
);
LatexCmds['ב'] = LatexCmds.beth = bindVanillaSymbol(
  '\\beth ',
  '&#1489;',
  'beth'
);
LatexCmds['ג'] = LatexCmds.gimel = LatexCmds.gimmel = bindVanillaSymbol(
  '\\gimel ',
  '&#1490;',
  'gimel'
);
LatexCmds['ד'] = LatexCmds.daleth = LatexCmds.dalethsym = bindVanillaSymbol(
  '\\daleth ',
  '&#1491;',
  'daleth'
);
LatexCmds['ð'] = LatexCmds.eth = bindVanillaSymbol('\\eth ', '&eth;', 'eth');
LatexCmds['℧'] = LatexCmds.mho = bindVanillaSymbol('\\mho ', '&#8487;', 'mho');
LatexCmds['Ⅎ'] = LatexCmds.Finv = bindVanillaSymbol('\\Finv ', '&#8498;', 'Finv');
LatexCmds['⅁'] = LatexCmds.Game = bindVanillaSymbol('\\Game ', '&#8513;', 'Game');
LatexCmds['∍'] = LatexCmds.backepsilon = bindVanillaSymbol(
  '\\backepsilon ',
  '&#8717;',
  'back epsilon'
);
LatexCmds['∁'] = LatexCmds.complement = bindVanillaSymbol(
  '\\complement ',
  '&#8705;',
  'complement'
);
LatexCmds['∢'] = LatexCmds.sphericalangle = bindVanillaSymbol(
  '\\sphericalangle ',
  '&#8738;',
  'spherical angle'
);
LatexCmds['§'] = LatexCmds.S = LatexCmds.sect = bindVanillaSymbol(
  '\\S ',
  '&sect;',
  'section'
);
LatexCmds['†'] = LatexCmds.dag = LatexCmds.dagger = bindVanillaSymbol(
  '\\dag ',
  '&dagger;',
  'dagger'
);
LatexCmds['‡'] = LatexCmds.ddag = LatexCmds.ddagger = bindVanillaSymbol(
  '\\ddag ',
  '&Dagger;',
  'double dagger'
);
LatexCmds['©'] = LatexCmds.copyright = bindVanillaSymbol(
  '\\copyright ',
  '&copy;',
  'copyright'
);
LatexCmds['¥'] = LatexCmds.yen = bindVanillaSymbol('\\yen ', '&yen;', 'yen');
LatexCmds['€'] = LatexCmds.euro = bindVanillaSymbol('\\euro ', '&euro;', 'euro');
LatexCmds.LaTeX = bindVanillaSymbol('\\LaTeX ', 'LaTeX', 'LaTeX');
LatexCmds.TeX = bindVanillaSymbol('\\TeX ', 'TeX', 'TeX');

// ===== Honest verbatim leaves for constructs the field can't structure =====
// Infix operators (\choose/\atop/\above/\overwithdelims/\genfrac),
// macro definitions (\newcommand/\def/\DeclareMathOperator), and the tie
// accent previously blanked the whole expression. Each parses as a leaf
// that shows the literal \name and serializes back verbatim, so pasted
// latex survives as its own text instead of wiping the cell.

// A command that consumes its arguments raw (brace groups / single
// tokens) so unknown macro names inside them can't fail the parse.
class RawArgCommand extends MQSymbol {
  argRe: RegExp;
  constructor(cmdName: string, argRe: RegExp, speak: string) {
    super(cmdName, h.text(cmdName + '…'), speak);
    this.argRe = argRe;
  }
  parser(): Parser<MQNode | Fragment> {
    var self = this;
    return Parser.optWhitespace
      .then(Parser.regex(self.argRe))
      .map(function (args: string) {
        self.ctrlSeq = (self.ctrlSeq as string) + args;
        return self;
      })
      .or(Parser.succeed(self as MQNode | Fragment));
  }
}
// One brace group with a single level of nesting allowed.
var RAW_GROUP = '\\{(?:[^{}]|\\{[^{}]*\\})*\\}';
LatexCmds.newcommand = () =>
  new RawArgCommand(
    '\\newcommand',
    new RegExp(
      '^' + RAW_GROUP + '(?:\\[[0-9]\\])?(?:' + RAW_GROUP + ')?'
    ),
    'new command'
  );
LatexCmds.renewcommand = () =>
  new RawArgCommand(
    '\\renewcommand',
    new RegExp(
      '^' + RAW_GROUP + '(?:\\[[0-9]\\])?(?:' + RAW_GROUP + ')?'
    ),
    'renew command'
  );
LatexCmds.providecommand = () =>
  new RawArgCommand(
    '\\providecommand',
    new RegExp(
      '^' + RAW_GROUP + '(?:\\[[0-9]\\])?(?:' + RAW_GROUP + ')?'
    ),
    'provide command'
  );
LatexCmds.DeclareMathOperator = () =>
  new RawArgCommand(
    '\\DeclareMathOperator',
    new RegExp('^\\*?' + RAW_GROUP + '(?:' + RAW_GROUP + ')?'),
    'declare math operator'
  );
LatexCmds.def = () =>
  new RawArgCommand(
    '\\def',
    new RegExp(
      '^(?:\\\\[a-zA-Z]+|\\S)(?:#[0-9])*(?:' + RAW_GROUP + ')?'
    ),
    'def'
  );

// Literal-marker symbols: a visible \name leaf so a\choose b keeps its
// text and shows the command rather than blanking or silently dropping it.
function bindLiteralCmd(ctrlSeq: string, speak: string) {
  return () =>
    new VanillaSymbol(ctrlSeq + ' ', h.text(ctrlSeq), speak);
}
LatexCmds.choose = bindLiteralCmd('\\choose', 'choose');
LatexCmds.atop = bindLiteralCmd('\\atop', 'atop');
LatexCmds.above = bindLiteralCmd('\\above', 'above');
LatexCmds.overwithdelims = bindLiteralCmd('\\overwithdelims', 'over with delims');
// \genfrac{l}{r}{thick}{style}{num}{denom}: consume the 6 args raw so
// the full signature survives; each arg is a brace group or a single
// delimiter token like ( ) [ ] | .
var RAW_ARG = '(?:' + RAW_GROUP + '|\\\\[a-zA-Z]+|[^\\s{}])';
LatexCmds.genfrac = () =>
  new RawArgCommand(
    '\\genfrac',
    new RegExp('^((?:\\s*' + RAW_ARG + '){1,6})'),
    'gen frac'
  );
LatexCmds.brace = bindLiteralCmd('\\brace', 'brace');
LatexCmds.brack = bindLiteralCmd('\\brack', 'brack');

// Text-mode super/subscripts and the tie accent — kept verbatim.
bindMathWrap('textsuperscript');
bindMathWrap('textsubscript');
// \t{oo}: double inverted breve (tie) over its argument.
LatexCmds.t = () =>
  new (class extends MathCommand {
    constructor() {
      super(
        '\\t',
        new DOMView(1, (blocks) =>
          h('span', { class: 'mq-non-leaf' }, [
            h('span', { class: 'mq-diacritic-above' }, [h.entityText('&#865;')]),
            h.block('span', { class: 'mq-diacritic-stem' }, blocks[0]),
          ])
        )
      );
    }
  })();

// Document-level reference commands — kept verbatim as visible leaves
// rather than blanking the cell (they have no math meaning here, but the
// text survives the round-trip).
var RAW_OPT_GROUP = '(?:\\[[^\\]]*\\])?';
[
  'ref',
  'eqref',
  'pageref',
  'autoref',
  'label',
  'url',
  'footnote',
  'cite',
  'index'
].forEach(function (name) {
  (LatexCmds as LatexCmdsAny)[name] = () =>
    new RawArgCommand(
      '\\' + name,
      new RegExp(
        '^' + RAW_OPT_GROUP + RAW_GROUP + '(?:' + RAW_GROUP + ')?'
      ),
      name
    );
});

// \intertext / \shortintertext — text-mode material between aligned
// lines; render like \text but keep the command name on emit.
LatexCmds.intertext = makeTextBlock('\\intertext', 'Inter text', 'span', {
  class: 'mq-text-mode'
});
LatexCmds.shortintertext = makeTextBlock(
  '\\shortintertext',
  'Short inter text',
  'span',
  { class: 'mq-text-mode' }
);

// \vspace{len} — vertical analogue of \hspace: keep the arg, show a
// gap-ish wrapper rather than dropping the cell.
bindMathWrap('vspace');

// Missing leaves: relations, ellipsis variants, misc glyphs, latin
// letters/ligatures, quotes and dashes.
LatexCmds.lll = LatexCmds.llless = bindBinaryOperator(
  '\\lll ',
  '&#8810;',
  'much less than'
);
LatexCmds.ggg = LatexCmds.gggtr = bindBinaryOperator(
  '\\ggg ',
  '&#8811;',
  'much greater than'
);
LatexCmds.subseteqq = bindBinaryOperator(
  '\\subseteqq ',
  '&#10949;',
  'subset of or equal to variant'
);
LatexCmds.supseteqq = bindBinaryOperator(
  '\\supseteqq ',
  '&#10950;',
  'superset of or equal to variant'
);
LatexCmds.subsetneqq = bindBinaryOperator(
  '\\subsetneqq ',
  '&#10955;',
  'subset of not equal to variant'
);
LatexCmds.supsetneqq = bindBinaryOperator(
  '\\supsetneqq ',
  '&#10956;',
  'superset of not equal to variant'
);
LatexCmds.eqsim = bindBinaryOperator('\\eqsim ', '&#8770;', 'equivalent to');
LatexCmds.intercal = bindBinaryOperator(
  '\\intercal ',
  '&#8890;',
  'intercal'
);
LatexCmds.dotsc = bindBinaryOperator('\\dotsc ', '&#8230;', 'dots c');
LatexCmds.dotsb = bindBinaryOperator('\\dotsb ', '&#8230;', 'dots b');
LatexCmds.dotsm = bindBinaryOperator('\\dotsm ', '&#8230;', 'dots m');
LatexCmds.dotsi = bindBinaryOperator('\\dotsi ', '&#8230;', 'dots i');
LatexCmds.dotso = bindBinaryOperator('\\dotso ', '&#8230;', 'dots o');
LatexCmds.iddots = bindBinaryOperator('\\iddots ', '&#8944;', 'inverse dots');
LatexCmds.hslash = bindVanillaSymbol('\\hslash ', '&#8463;', 'h slash');
LatexCmds.Bbbk = bindVanillaSymbol('\\Bbbk ', '&#120107;', 'bbb k');
LatexCmds.blacktriangledown = bindVanillaSymbol(
  '\\blacktriangledown ',
  '&#9660;',
  'black triangle down'
);
LatexCmds.lozenge = bindVanillaSymbol('\\lozenge ', '&#9674;', 'lozenge');
LatexCmds.blacklozenge = bindVanillaSymbol(
  '\\blacklozenge ',
  '&#10731;',
  'black lozenge'
);
LatexCmds.bigstar = bindVanillaSymbol('\\bigstar ', '&#9733;', 'big star');
LatexCmds.varclubsuit = bindVanillaSymbol(
  '\\varclubsuit ',
  '&#9831;',
  'var club suit'
);
LatexCmds.vardiamondsuit = bindVanillaSymbol(
  '\\vardiamondsuit ',
  '&#9830;',
  'var diamond suit'
);
LatexCmds.varheartsuit = bindVanillaSymbol(
  '\\varheartsuit ',
  '&#9829;',
  'var heart suit'
);
LatexCmds.varspadesuit = bindVanillaSymbol(
  '\\varspadesuit ',
  '&#9828;',
  'var spade suit'
);
LatexCmds.maltese = bindVanillaSymbol('\\maltese ', '&#10016;', 'maltese');

// Latin letters and ligatures that real LaTeX produces (\o/\O stay the
// fork's \varnothing alias by design).
LatexCmds.ae = bindVanillaSymbol('\\ae ', '&#230;', 'ae');
LatexCmds.AE = bindVanillaSymbol('\\AE ', '&#198;', 'AE');
LatexCmds.oe = bindVanillaSymbol('\\oe ', '&#339;', 'oe');
LatexCmds.OE = bindVanillaSymbol('\\OE ', '&#338;', 'OE');
LatexCmds.aa = bindVanillaSymbol('\\aa ', '&#229;', 'aa');
LatexCmds.l = bindVanillaSymbol('\\l ', '&#322;', 'l');
LatexCmds.L = bindVanillaSymbol('\\L ', '&#321;', 'L');
LatexCmds.ss = bindVanillaSymbol('\\ss ', '&#223;', 'ss');
LatexCmds.i = bindVanillaSymbol('\\i ', '&#305;', 'dotless i');
LatexCmds.j = bindVanillaSymbol('\\j ', '&#567;', 'dotless j');

// Quote and dash glyphs.
LatexCmds.glqq = bindVanillaSymbol('\\glqq ', '&#8222;', 'glqq');
LatexCmds.grqq = bindVanillaSymbol('\\grqq ', '&#8220;', 'grqq');
LatexCmds.glq = bindVanillaSymbol('\\glq ', '&#8218;', 'glq');
LatexCmds.lq = bindVanillaSymbol('\\lq ', '&#8216;', 'left quote');
LatexCmds.rq = bindVanillaSymbol('\\rq ', '&#8217;', 'right quote');
LatexCmds.flqq = bindVanillaSymbol('\\flqq ', '&#171;', 'flqq');
LatexCmds.frqq = bindVanillaSymbol('\\frqq ', '&#187;', 'frqq');
LatexCmds.flq = bindVanillaSymbol('\\flq ', '&#8249;', 'flq');
LatexCmds.frq = bindVanillaSymbol('\\frq ', '&#8250;', 'frq');
LatexCmds.textemdash = bindVanillaSymbol(
  '\\textemdash ',
  '&#8212;',
  'em dash'
);
LatexCmds.textendash = bindVanillaSymbol(
  '\\textendash ',
  '&#8211;',
  'en dash'
);

// Arrow family (amssymb/unicode-math).
var ARROWS: [string, string, string][] = [
  ['leftrightharpoons', '&#8651;', 'left right harpoons'],
  ['rightleftharpoons', '&#8652;', 'right left harpoons'],
  ['upuparrows', '&#8648;', 'up up arrows'],
  ['downdownarrows', '&#8650;', 'down down arrows'],
  ['leftleftarrows', '&#8647;', 'left left arrows'],
  ['rightrightarrows', '&#8649;', 'right right arrows'],
  ['leftrightarrows', '&#8646;', 'left right arrows'],
  ['rightleftarrows', '&#8644;', 'right left arrows'],
  ['Lleftarrow', '&#8666;', 'L left arrow'],
  ['Rrightarrow', '&#8667;', 'R right arrow'],
  ['twoheadrightarrow', '&#8608;', 'two head right arrow'],
  ['twoheadleftarrow', '&#8606;', 'two head left arrow'],
  ['rightarrowtail', '&#8611;', 'right arrow tail'],
  ['leftarrowtail', '&#8610;', 'left arrow tail'],
  ['looparrowleft', '&#8619;', 'loop arrow left'],
  ['looparrowright', '&#8620;', 'loop arrow right'],
  ['leftrightsquigarrow', '&#8621;', 'left right squig arrow'],
  ['rightsquigarrow', '&#8601;', 'right squig arrow'],
  ['leadsto', '&#8669;', 'leads to'],
  ['curvearrowleft', '&#8630;', 'curve arrow left'],
  ['curvearrowright', '&#8631;', 'curve arrow right'],
  ['circlearrowleft', '&#8634;', 'circle arrow left'],
  ['circlearrowright', '&#8635;', 'circle arrow right'],
  ['dashrightarrow', '&#8674;', 'dash right arrow'],
  ['dashleftarrow', '&#8672;', 'dash left arrow'],
  ['Lsh', '&#8624;', 'L sh'],
  ['Rsh', '&#8625;', 'R sh'],
  ['upharpoonleft', '&#8638;', 'up harpoon left'],
  ['upharpoonright', '&#8639;', 'up harpoon right'],
  ['downharpoonleft', '&#8642;', 'down harpoon left'],
  ['downharpoonright', '&#8643;', 'down harpoon right']
];
ARROWS.forEach(function (a) {
  (LatexCmds as LatexCmdsAny)[a[0]] = bindBinaryOperator(
    '\\' + a[0] + ' ',
    a[1],
    a[2]
  );
});

// Relation family: stacked comparisons, curly/n-approx negations,
// n-triangle, n-dash variants, and the amssymb binary ops.
var RELS: [string, string, string][] = [
  ['lesseqgtr', '&#8922;', 'less equal greater'],
  ['gtreqless', '&#8923;', 'greater equal less'],
  ['lesseqqgtr', '&#8924;', 'less equal equal greater'],
  ['gtreqqless', '&#8925;', 'greater equal equal less'],
  ['curlyeqprec', '&#8926;', 'curly equal precedes'],
  ['curlyeqsucc', '&#8927;', 'curly equal succeeds'],
  ['preccurlyeq', '&#8828;', 'precedes curly equal'],
  ['succcurlyeq', '&#8829;', 'succeeds curly equal'],
  ['precnapprox', '&#10937;', 'precedes not approximately'],
  ['succnapprox', '&#10938;', 'succeeds not approximately'],
  ['lnapprox', '&#10889;', 'less not approximately'],
  ['gnapprox', '&#10890;', 'greater not approximately'],
  ['lneqq', '&#8808;', 'less not equal equal'],
  ['gneqq', '&#8809;', 'greater not equal equal'],
  ['lnsim', '&#8934;', 'less not similar'],
  ['gnsim', '&#8935;', 'greater not similar'],
  ['precnsim', '&#8936;', 'precedes not similar'],
  ['succnsim', '&#8937;', 'succeeds not similar'],
  ['ntriangleleft', '&#8938;', 'not triangle left'],
  ['ntriangleright', '&#8939;', 'not triangle right'],
  ['ntrianglelefteq', '&#8940;', 'not triangle left equal'],
  ['ntrianglerighteq', '&#8941;', 'not triangle right equal'],
  ['nvDash', '&#8877;', 'not v dash'],
  ['nVdash', '&#8878;', 'not V dash'],
  ['nVDash', '&#8879;', 'not V Dash']
];
RELS.forEach(function (a) {
  (LatexCmds as LatexCmdsAny)[a[0]] = bindBinaryOperator(
    '\\' + a[0] + ' ',
    a[1],
    a[2]
  );
});

var BINOPS: [string, string, string][] = [
  ['circledcirc', '&#8858;', 'circled circle'],
  ['circledast', '&#8859;', 'circled asterisk'],
  ['circleddash', '&#8861;', 'circled dash'],
  ['divideontimes', '&#8903;', 'divide on times'],
  ['dotplus', '&#8724;', 'dot plus'],
  ['boxplus', '&#8862;', 'box plus'],
  ['boxminus', '&#8863;', 'box minus'],
  ['boxtimes', '&#8864;', 'box times'],
  ['boxdot', '&#8865;', 'box dot'],
  ['boxbar', '&#9531;', 'box bar'],
  ['merge', '&#x2A24;', 'merge'],
  ['Cap', '&#8914;', 'cap'],
  ['Cup', '&#8915;', 'cup'],
  ['doublecap', '&#8914;', 'double cap'],
  ['doublecup', '&#8915;', 'double cup'],
  ['barwedge', '&#8892;', 'bar wedge'],
  ['veebar', '&#8891;', 'vee bar'],
  ['curlywedge', '&#8910;', 'curly wedge'],
  ['curlyvee', '&#8911;', 'curly vee'],
  ['ltimes', '&#8905;', 'left times'],
  ['rtimes', '&#8906;', 'right times'],
  ['centerdot', '&#8901;', 'center dot'],
  ['smallsetminus', '&#8726;', 'small set minus']
];
BINOPS.forEach(function (a) {
  (LatexCmds as LatexCmdsAny)[a[0]] = bindBinaryOperator(
    '\\' + a[0] + ' ',
    a[1],
    a[2]
  );
});

// Old-style environment names kept as visible leaves (the \begin{...}
// dispatch for the same names lives at the end of environments.ts).
LatexCmds.eqnarray = bindLiteralCmd('\\eqnarray', 'eqn array');
LatexCmds.eqalign = bindLiteralCmd('\\eqalign', 'eq align');
