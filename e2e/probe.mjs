import { chromium } from '@playwright/test';
const INPUTS = [
  // env variants
  '\\begin{align}a&=b\\\\c&=d\\end{align}', '\\begin{align*}a&=b\\end{align*}',
  '\\begin{split}a&=b\\end{split}', '\\begin{equation}x=1\\end{equation}', '\\begin{gather}a\\end{gather}',
  '\\begin{matrix}a\\\\b\\end{matrix}', '\\begin{matrix}a\\\\ \\hline b\\end{matrix}', '\\begin{smallmatrix}a\\end{smallmatrix}',
  // infix / genfrac
  'a\\choose b', 'a\\atop b', '\\genfrac(){}{}{}', 'a\\over b', 'a\\above1pt b', 'a\\overwithdelims() b',
  // physics
  '\\bra{x}', '\\ket{x}', '\\braket{x|y}', '\\ketbra{x}{y}',
  // hats/lines remaining
  '\\overleftrightarrow{AB}', '\\overleftharpoon{x}', '\\overrightharpoon{x}', '\\underleftarrow{x}', '\\underrightarrow{x}',
  '\\overgroup{x}', '\\undergroup{x}', '\\overlinesegment{AB}', '\\overleftharp{x}', '\\overrightharp{x}',
  // bold symbols
  '\\boldsymbol{x}', '\\pmb{x}', '\\bm{x}', '\\mathbfit{x}',
  // lap/strut
  '\\llap{x}', '\\rlap{x}', '\\clap{x}', '\\mathstrut', '\\strut', '\\smash{x}',
  // limits ops
  '\\varinjlim', '\\varprojlim', '\\projlim', '\\injlim', '\\bigsqcap', '\\iiint', '\\oiiint', '\\oint',
  '\\ointctrclockwise', '\\varointclockwise', '\\oiint',
  // display wrappers
  '\\[x\\]', '\\(x\\)', '$$x$$',
  // accents unbraced + symbols
  '\\^o', "\\'e", '\\~n', '\\={o}', '\\.i', '\\"{o}', '\\`{e}',
  '\\u g', '\\v s', '\\H{o}', '\\t{oo}',
  // remaining gaps
  '\\fbox{x}', '\\framebox{x}', '\\nicefrac{1}{2}', '\\cfrac{1}{2}',
  '\\DeclareMathOperator{\\foo}{foo}', '\\newcommand{\\x}{y}', '\\def\\x{y}',
  '\\left\\{x\\right.', '\\left.x\\right\\}', '\\left\\|x\\right\\|',
  '\\bmod', '\\hdashline', '\\cline{1-2}', '\\cr',
  '\\textsuperscript{2}', '\\emph{x}', '\\textnormal{x}', '\\textup{x}', '\\textsl{x}', '\\textsc{x}', '\\textmd{x}', '\\textsf{x}', '\\textit{x}', '\\textbf{x}',
];
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5573/e2e/spike.html');
await page.waitForFunction(() => (window).spike);
const blanks = [], changed = [], ok = [];
for (const input of INPUTS) {
  const out = await page.evaluate((latex) => {
    const mq = (window).spike.mq;
    try { mq.latex(latex); return mq.latex(); }
    catch (e) { return 'THREW:' + String(e); }
  }, input);
  if (out === '') blanks.push(input);
  else if (out !== input) changed.push([input, out]);
  else ok.push(input);
}
console.log('BLANK(' + blanks.length + '):'); blanks.forEach(s => console.log('  ' + s));
console.log('CHANGED(' + changed.length + '):'); changed.forEach(([i,o]) => console.log('  ' + JSON.stringify(i) + ' => ' + JSON.stringify(o)));
console.log('OK(' + ok.length + '):'); ok.forEach(s => console.log('  ' + s));
await browser.close();
