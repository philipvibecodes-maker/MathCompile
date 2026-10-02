// Focused sweep round 2: entity-family + accents + bra-ket + crashes.
// Simulates user typing: typedText chars, then Enter if a latex command
// input is still open (that is what a user does to accept \command).
// Checks rendered DOM for literal &#; entities, glyph ink clipped by
// overflow:hidden ancestors (via Range rects on text nodes), and cursor
// gap to the preceding glyph.
import { chromium } from '@playwright/test';

const INPUTS = [
  // boundless-integral / large-op family registered with &#; strings
  '\\iiint', '\\idotsint', '\\ointctrclockwise', '\\varointclockwise',
  '\\oiint', '\\oiiint', '\\smallint', '\\ointclockwise', '\\intop', '\\ointop',
  '\\bigsqcap', '\\bigsqcapdot', '\\varinjlim', '\\varprojlim',
  // diacritic accents (above + below)
  '\\^o', '\\~n', "\\'e", '\\`e', '\\"o', '\\=o', '\\.i', '\\v{s}', '\\u{g}',
  '\\H{o}', '\\c{c}', '\\d{u}', '\\b{o}', '\\k{x}', '\\r{a}', '\\t{oo}',
  '\\vec{v}', '\\dot{x}', '\\ddot{x}', '\\dddot{x}', '\\ddddot{x}',
  '\\hat{x}', '\\tilde{z}', '\\bar{x}', '\\check{s}', '\\breve{o}',
  '\\acute{e}', '\\grave{a}', '\\overleftharpoon{x}', '\\overrightharpoon{x}',
  '\\overlinesegment{x}', '\\underleftarrow{x}', '\\underrightarrow{x}',
  '\\overline{xy}', '\\underline{xy}', '\\widetilde{xy}', '\\widehat{xy}',
  // bra-ket
  '\\bra{x}', '\\ket{x}', '\\braket{x|y}', '\\ketbra{x}{y}',
  // misc glyphs
  '\\oiint', '\\oiiint', '\\oint', '\\sum_{i=0}^{n}', '\\prod_{k=1}^{n}',
  '\\varliminf_{x}', '\\varlimsup_{x}',
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.goto('http://localhost:5573/e2e/spike.html');
await page.waitForFunction(() => window.spike);

const INSPECT = `function inspect() {
  var el = window.spike.el;
  var res = { text: el.innerText, entities: [], clips: [], cursor: null };
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  var n;
  while ((n = walker.nextNode())) {
    var m = n.nodeValue && n.nodeValue.match(/&(#\\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/);
    if (m) res.entities.push(m[0]);
  }
  // glyph ink clipped: text-node range rect outside an overflow-hidden ancestor
  var root = el.querySelector('.mq-root-block');
  if (root) {
    var rr = root.getBoundingClientRect();
    walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while ((n = walker.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      var range = document.createRange();
      range.selectNodeContents(n);
      var r = range.getBoundingClientRect();
      var host = n.parentElement;
      // skip if any non-clipping wrapper fully contains it; check vs root
      if (r.top < rr.top - 0.5 || r.bottom > rr.bottom + 0.5) {
        res.clips.push({ ch: n.nodeValue.slice(0,12), cls: host.className,
                         dy: [+(rr.top - r.top).toFixed(1), +(r.bottom - rr.bottom).toFixed(1)] });
      }
    }
  }
  // cursor gap: distance from cursor's left edge to preceding glyph's right edge
  var cur = el.querySelector('.mq-cursor');
  if (cur) {
    var cr = cur.getBoundingClientRect();
    var prev = cur.previousElementSibling;
    if (prev) {
      var pr = prev.getBoundingClientRect();
      res.cursor = { gap: +(cr.left - pr.right).toFixed(2), prevCls: prev.className || prev.tagName };
    }
  }
  return res;
}`;

const rows = [];
for (const input of INPUTS) {
  const r = await page.evaluate(
    ([input, src]) => {
      const { mq, el } = window.spike;
      const inspect = eval('(' + src + ')');
      const out = { input };
      try {
        mq.latex('');
        mq.typedText(input);
        // accept a still-open \command input the way a user would
        if (el.querySelector('.mq-latex-command-input')) mq.keystroke('Enter');
        mq.moveToRightEnd();
        out.typed = { latex: mq.latex(), ...inspect() };
      } catch (e) {
        out.typed = { threw: String(e) };
      }
      try {
        mq.latex('zzz');
        mq.latex(input);
        out.parsed = { latex: mq.latex(), ...inspect() };
      } catch (e) {
        out.parsed = { threw: String(e) };
      }
      return out;
    },
    [input, INSPECT],
  );
  rows.push(r);
}
await browser.close();

for (const r of rows) {
  const probs = [];
  for (const mode of ['typed', 'parsed']) {
    const m = r[mode];
    if (!m) continue;
    if (m.threw) probs.push(`${mode}:THREW ${m.threw}`);
    if (m.entities?.length) probs.push(`${mode}:entities ${[...new Set(m.entities)]}`);
    if (m.clips?.length) probs.push(`${mode}:clips ${JSON.stringify(m.clips)}`);
  }
  const gap = r.typed?.cursor?.gap;
  console.log(
    JSON.stringify(r.input).padEnd(34),
    'typed=' + JSON.stringify(r.typed?.latex ?? r.typed?.threw),
    'gap=' + JSON.stringify(gap ?? (r.typed?.cursor ? 'NOPREV' : 'NOCUR')),
    probs.length ? '  <<< ' + probs.join(' | ') : '',
  );
}
