// SCRATCH — MQ latex set->get round-trip harness. Not committed.
// Usage: node e2e/hunt-roundtrip.mjs  (dev server must be up on :5573)
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const INPUTS = [
  '\\text{hello world}',
  'x\\text{ if }x>0',
  '\\textit{hi} \\textbf{b}',
  '\\left(x+1\\right)',
  '\\left[0,1\\right]',
  '\\left(0,1\\right]',
  '\\left\\{0,1\\right\\}',
  '\\left.x\\right|_{a}',
  '\\left.\\frac{a}{b}\\right|_{x=1}',
  '\\left|x\\right|',
  '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}',
  '\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}',
  '\\begin{Bmatrix}a&b\\\\c&d\\end{Bmatrix}',
  '\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}',
  '\\begin{Vmatrix}a&b\\\\c&d\\end{Vmatrix}',
  '\\begin{matrix}a&b\\\\c&d\\end{matrix}',
  '\\pmatrix{a&b\\\\c&d}',
  '\\bmatrix{a&b\\\\c&d}',
  '\\Bmatrix{a&b\\\\c&d}',
  '\\vmatrix{a&b\\\\c&d}',
  '\\Vmatrix{a&b\\\\c&d}',
  '\\matrix{a&b\\\\c&d}',
  '\\begin{cases}x&x>0\\\\-x&x\\le0\\end{cases}',
  '\\hat{x}',
  '\\bar{y}',
  '\\vec{v}',
  '\\dot{x}',
  '\\ddot{x}',
  '\\tilde{z}',
  '\\overline{AB}',
  '\\underline{x}',
  '\\mathbb{R}',
  '\\mathcal{F}',
  '\\mathrm{d}',
  '\\mathbf{x}',
  '\\mathit{y}',
  '\\operatorname{foo}(x)',
  '\\alpha\\beta\\gamma\\varphi\\phi\\varepsilon\\epsilon',
  'x^2',
  'x_1',
  'x^{2}',
  'x_{1}',
  'x_{ }^{ }',
  '\\int_{a}^{b}x\\,dx',
  '\\int x dx',
  '\\antid xdx',
  '\\iint xdx',
  '\\sum_{i=0}^{n}i',
  '\\prod_{k=1}^{n}k',
  '\\lim_{x\\to0}f(x)',
  '\\sqrt[3]{x}',
  '\\frac{1}{2}',
  'f\'(x)',
  'x!',
  '\\, \\; \\: \\! \\quad \\qquad \\ ',
  'a\\equiv b\\pmod{n}',
  '\\infty \\pm \\mp \\times \\div \\cdot \\leq \\geq \\neq \\approx \\propto',
  '\\forall \\exists \\nexists \\in \\notin \\ni \\subset \\supset \\cup \\cap \\setminus \\emptyset',
  '\\to \\rightarrow \\leftarrow \\Rightarrow \\Leftarrow \\mapsto \\implies \\iff',
  'x\\\\y',
  '\\displaylines{x\\\\ y}',
  '\\displaylines{a\\pmatrix{x\\\\y}\\\\ b}',
  '\\displaystyle\\sum_{i=0}^{n}',
  '\\sum\\limits_{i=0}^{n}',
  '\\int\\limits_{a}^{b}',
  '\\binom{n}{k}',
  '\\dbinom{n}{k}',
  '\\tbinom{n}{k}',
  '\\dfrac{1}{2}',
  '\\tfrac{1}{2}',
  '\\cfrac{1}{2}',
  '\\color{red}{x}',
  '\\textcolor{red}{x}',
  '\\boxed{x}',
  'e^{i\\pi}+1=0',
  '\\frac{d}{dx}x^2',
  '\\frac{\\partial}{\\partial x}f',
  '\\log_{2}x',
  '\\ln x',
  '\\sin^2 x + \\cos^2 x',
  '\\sec x \\csc x \\cot x',
  '\\arcsin x \\arctan x',
  '\\sinh x \\cosh x',
  '\\det A',
  '\\gcd(a,b)',
  '\\min_{x} f(x)',
  '\\max f',
  '\\arg z',
  '\\deg f',
  '\\Pr(X)',
  '\\mathrm{Hom}(A,B)',
  '\\overrightarrow{AB}',
  '\\overleftarrow{AB}',
  '\\overleftrightarrow{AB}',
  'x\\in\\mathbb{R}',
  'x\\notin S',
  'A\\subseteq B',
  'A\\not\\subseteq B',
  '\\{1,2,3\\}',
  'a\\land b\\lor c\\lnot d',
  '\\neg p',
  '\\therefore \\because',
  '\\ldots \\cdots \\vdots \\ddots',
  '\\% \\$ \\& \\_ \\# \\{ \\}',
  'x^{y^{z}}',
  '{}^{2}x',
  'x^ ',
  'x_ ',
  '^2 x',
  '_i x',
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5573/e2e/spike.html');
await page.waitForFunction(() => (window).spike);

const rows = [];
for (const input of INPUTS) {
  const out = await page.evaluate((latex) => {
    const mq = (window).spike.mq;
    try {
      mq.latex(latex);
      return { ok: true, value: mq.latex() };
    } catch (e) {
      return { ok: false, value: String(e) };
    }
  }, input);
  rows.push({ input, out: out.value, ok: out.ok, changed: out.value !== input });
}
await browser.close();
writeFileSync('/tmp/roundtrip.json', JSON.stringify(rows, null, 2));
for (const r of rows) {
  const mark = !r.ok ? ' THREW' : r.changed ? ' CHANGED' : '';
  console.log(`${JSON.stringify(r.input)} => ${JSON.stringify(r.out)}${mark}`);
}
