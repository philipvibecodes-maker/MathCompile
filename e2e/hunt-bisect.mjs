// SCRATCH — bisect failing tokens via mq.latex one at a time.
import { chromium } from '@playwright/test';

const INPUTS = [
  // spacing family
  '\\,', '\\;', '\\:', '\\!', '\\ ', '~', '\\quad', '\\qquad', '\\emsp',
  'x\\,dx', 'x\\;dx', 'x\\:dx', 'x\\!dx',
  // left/right forms
  '\\left.', '\\right|', '\\left.x\\right|', '\\left(x\\right.',
  '\\left|x\\right.', '\\left\\{x\\right\\}', '\\left.x\\right.',
  // misc constructs
  '\\{x\\}', '\\{1,2,3\\}', '\\pmod{n}', 'a\\pmod{n}', '\\pmod',
  '\\displaystyle', '\\limits', '\\dbinom{n}{k}', '\\tbinom{n}{k}',
  '\\tfrac{1}{2}', '\\dfrac{1}{2}', '\\cfrac{1}{2}',
  '\\color{red}{x}', '\\boxed{x}', '\\mathcal{F}', '\\mathcal',
  '\\ddot{x}', '\\dddot{x}', '\\dot{x}', '\\hat{x}', '\\bar{x}',
  '\\lnot', '\\land', '\\lor',
  '\\%', '\\$', '\\&', '\\_', '\\#', '\\{', '\\}',
  '\\\\', 'x\\\\y',
  'x^', 'x_', 'x^ ', 'x_ ',
  '\\begin{cases}\\end{cases}', '\\begin{cases}x&x>0\\end{cases}',
  '\\begin{foo}x\\end{foo}', '\\begin{aligned}x&=1\\end{aligned}',
  '\\operatorname{foo}', '\\operatorname*{foo}',
  '\\not', '\\not\\in', 'x\\not\\in S',
  '\\vert', '\\lVert', '\\rVert', '\\|',
  '\\sqrt{}', '\\frac{}{}', '\\frac{ }',
  '\\prime', "x\\prime", "f\\prime(x)",
  '\\subscript{x}', '\\superscript{x}', '\\sup', '\\sub',
  '\\min', '\\min_{x}', '\\sup_{x}', '\\inf_{x}',
  '\\arg', '\\deg', '\\det', '\\gcd', '\\Pr', '\\ker', '\\dim',
  '\\overarc{x}', '\\ring{x}',
  '\\therefore', '\\because',
  '\\hbar', '\\ell', '\\wp', '\\Re', '\\Im',
  '\\partial', '\\nabla', '\\aleph',
  '\\top', '\\bot', '\\models', '\\vdash', '\\dashv',
  '\\cong', '\\ncong', '\\simeq', '\\sim', '\\nsim',
  '\\prec', '\\preceq', '\\succ', '\\succeq',
  '\\perp', '\\parallel', '\\nparallel',
  '\\oplus', '\\otimes', '\\ominus', '\\odot',
  '\\cup', '\\cap', '\\uplus', '\\sqcap', '\\sqcup',
  '\\wedge', '\\vee', '\\oplus',
  '\\bigcup', '\\bigcap', '\\bigvee', '\\bigwedge',
  '\\coprod', '\\bigsqcup',
  '\\oint', '\\oiint',
  'x \\times y', 'x \\cdot y', 'x \\div y',
  'x\\overset{def}{=}y', 'x\\underset{a}{=}y',
  '\\sqrt[n]{x}', '\\nthroot{n}{x}',
  '\\frac ab', '\\frac12', 'x^\\alpha', 'x_\\alpha',
  '{x}', '{{x}}',
  'x_{i_{j}}', 'x^{2}_{i}',
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5573/e2e/spike.html');
await page.waitForFunction(() => (window).spike);
for (const input of INPUTS) {
  const out = await page.evaluate((latex) => {
    const mq = (window).spike.mq;
    try {
      mq.latex(latex);
      return mq.latex();
    } catch (e) {
      return 'THREW:' + String(e);
    }
  }, input);
  const mark = out === '' ? ' <<< BLANK' : out !== input ? ' changed' : '';
  console.log(`${JSON.stringify(input)} => ${JSON.stringify(out)}${mark}`);
}
await browser.close();
