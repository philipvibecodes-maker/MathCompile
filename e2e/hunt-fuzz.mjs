// Fuzz: random compositions of supported latex constructs through
// mq.latex() set->get->set->get. Flags throws, blanking (non-empty
// input -> empty output), and non-fixpoint serialization.
import { chromium } from 'playwright';

const ATOMS = ['x', 'y', '1', '2', '\\alpha', '\\beta', '\\pi', '\\infty', 'e', '\\imath', '\\ell', '\\hbar',
  '\\lll', '\\ggg', '\\eqsim', '\\intercal', '\\dotsc', '\\iddots', '\\hslash', '\\Bbbk', '\\lozenge',
  '\\bigstar', '\\maltese', '\\ae', '\\ss', '\\i', '\\j', '\\glqq', '\\textemdash', '\\AA', '\\Bumpeq',
  '\\ref{1}', '\\label{a}', '\\cite{k}', '\\mathclap', '\\intercal'];
const BINOPS = ['+', '-', '*', '/', '=', '<', '>', '\\le ', '\\ge ', '\\ne ', '\\times ', '\\div ', '\\cdot ', '\\in ', '\\subset ', '\\cup ', '\\cap ', '\\approx ', '\\sim ', '\\equiv ', '\\to ', '\\otimes ', '\\oplus '];
const UNARY = [
  (g) => `\\sqrt{${g(1)}}`,
  (g) => `\\frac{${g(1)}}{${g(1)}}`,
  (g) => `\\sqrt[3]{${g(1)}}`,
  (g) => `\\sin ${g(1)}`,
  (g) => `\\log_{2} ${g(1)}`,
  (g) => `\\ln ${g(1)}`,
  (g) => `\\bar{${g(1)}}`,
  (g) => `\\hat{${g(1)}}`,
  (g) => `\\vec{${g(1)}}`,
  (g) => `\\dot{${g(1)}}`,
  (g) => `\\overline{${g(1)}}`,
  (g) => `\\underline{${g(1)}}`,
  (g) => `\\boxed{${g(1)}}`,
  (g) => `\\mathbf{${g(1)}}`,
  (g) => `\\mathit{${g(1)}}`,
  (g) => `\\mathrm{${g(1)}}`,
  (g) => `\\mathsf{${g(1)}}`,
  (g) => `\\mathbb{${pick(['N','Z','Q','R','C','H','A','5'])}}`,
  (g) => `\\mathcal{${pick(['A','F','L','Z'])}}`,
  (g) => `\\boldsymbol{${g(1)}}`,
  (g) => `\\pmb{${g(1)}}`,
  (g) => `\\text{${pick(['abc','foo','if x'])}}`,
  (g) => `\\textit{${g(1)}}`,
  (g) => `\\textbf{${g(1)}}`,
  (g) => `\\left(${g(1)}\\right)`,
  (g) => `\\left[${g(1)}\\right]`,
  (g) => `\\left\\{${g(1)}\\right\\}`,
  (g) => `\\left|${g(1)}\\right|`,
  (g) => `\\bigl(${g(1)}\\bigr)`,
  (g) => `\\Bigg\\langle${g(1)}\\Bigg\\rangle`,
  (g) => `\\Bigl\\langle${g(1)}\\Bigr\\rangle`,
  (g) => `${g(1)}_{${g(1)}}`,
  (g) => `${g(1)}^{${g(1)}}`,
  (g) => `${g(1)}_{${g(1)}}^{${g(1)}}`,
  (g) => `\\int_{${g(1)}}^{${g(1)}}${g(1)}`,
  (g) => `\\sum_{${g(1)}}^{${g(1)}}${g(1)}`,
  (g) => `\\sum\\limits_{${g(1)}}^{${g(1)}}${g(1)}`,
  (g) => `\\prod\\nolimits_{${g(1)}}`,
  (g) => `\\iint ${g(1)}`,
  (g) => `\\iiint ${g(1)}`,
  (g) => `\\oint ${g(1)}`,
  (g) => `\\lim_{${g(1)}\\to ${g(1)}}${g(1)}`,
  (g) => `\\underbrace{${g(1)}}_{${g(1)}}`,
  (g) => `\\overbrace{${g(1)}}^{${g(1)}}`,
  (g) => `\\overset{${g(1)}}{${g(1)}}`,
  (g) => `\\xrightarrow{${g(1)}}`,
  (g) => `\\cancel{${g(1)}}`,
  (g) => `\\phantom{${g(1)}}`,
  (g) => `\\bra{${g(1)}}`,
  (g) => `\\ket{${g(1)}}`,
  (g) => `\\binom{${g(1)}}{${g(1)}}`,
  (g) => `\\tfrac{${g(1)}}{${g(1)}}`,
  (g) => `\\pmod{${g(1)}}`,
  (g) => `\\substack{${g(1)}\\\\${g(1)}}`,
  (g) => `\\begin{matrix}${g(1)}&${g(1)}\\\\${g(1)}&${g(1)}\\end{matrix}`,
  (g) => `\\begin{pmatrix}${g(1)}&${g(1)}\\\\${g(1)}&${g(1)}\\end{pmatrix}`,
  (g) => `\\begin{cases}${g(1)}&${g(1)}\\\\${g(1)}&${g(1)}\\end{cases}`,
  (g) => `\\begin{gathered}${g(1)}\\\\${g(1)}\\end{gathered}`,
  (g) => `\\begin{aligned}${g(1)}&=${g(1)}\\\\${g(1)}&=${g(1)}\\end{aligned}`,
  (g) => `\\begin{smallmatrix}${g(1)}\\\\${g(1)}\\end{smallmatrix}`,
  (g) => `\\begin{split}${g(1)}&=${g(1)}\\end{split}`,
  (g) => `\\begin{array}{cc}${g(1)}&${g(1)}\\\\${g(1)}&${g(1)}\\end{array}`,
  (g) => `\\frac{${g(1)}}{${g(1)}}+\\frac{${g(1)}}{${g(1)}}`,
  (g) => `${g(1)}\\choose ${g(1)}`,
  (g) => `${g(1)}\\over ${g(1)}`,
  (g) => `\\genfrac(){}{0}{}{${g(1)}}{${g(1)}}`,
  (g) => `\\xrightarrow[${g(1)}]{${g(1)}}`,
  (g) => `\\colorbox{red}{${g(1)}}`,
  (g) => `\\href{u}{${g(1)}}`,
  (g) => `\\check{${g(1)}}`,
  (g) => `\\underbracket{${g(1)}}`,
  (g) => `\\textsuperscript{${g(1)}}`,
  (g) => `\\newcommand{\\foo}{${g(1)}}`,
];
const SPACING = ['\\,', '\\;', '\\:', '\\!', '\\ ', '\\quad', '\\qquad'];
let seed = 1;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (a) => a[Math.floor(rnd() * a.length)];
function gen(depth = 0) {
  const r = rnd();
  if (depth >= 2 || r < 0.2) return pick(ATOMS);
  if (r < 0.75) return pick(UNARY)(gen);
  return `${gen(depth + 1)}${pick(BINOPS)}${gen(depth + 1)}`;
}
const N = parseInt(process.argv[2] || '600', 10);
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto('http://localhost:5573/e2e/spike.html');
await page.waitForFunction(() => window.spike);
const samples = [];
const sameEnvNested = (s) => {
  const m = s.match(/\\begin\{([a-z]+)\}/g) || [];
  const names = m.map((x) => x.slice(7, -1));
  return new Set(names).size !== names.length;
};
for (let i = 0; i < N; i++) {
  let s = gen();
  let guard = 0;
  while (sameEnvNested(s) && guard++ < 20) s = gen();
  if (sameEnvNested(s)) continue;
  samples.push(s);
}
const bad = await page.evaluate((samples) => {
  const mq = window.spike.mq;
  const out = { threw: [], blanked: [], unstable: [], samples: {} };
  for (const s of samples) {
    try {
      mq.latex(s);
      const once = mq.latex();
      if (s.trim() && !once.trim()) {
        const tags = [];
        if (s.includes('cases')) tags.push('cases(PR18)');
        if (s.includes('\\left.') || s.includes('\\left\\|')) tags.push('left-dot(PR17)');
        if (s.includes('\\{') || s.includes('\\langle') || s.includes('\\lVert')) tags.push('escapes(PR21)');
        if (/\\(text|textit|textbf|mathrm|mathit|mathbf|mathsf|boldsymbol|pmb|bm|mathbfit|emph|textnormal|textup|textsl|textmd|textrm)\{[^}]*[{}_^]/.test(s)) tags.push('textmode');
        if (!tags.length) out.unexplained = (out.unexplained || []).concat(s);
        out.blanked.push(s + ' [' + (tags.join(',') || 'UNEXPLAINED') + ']');
        continue;
      }
      mq.latex(once);
      const twice = mq.latex();
      if (once !== twice) out.unstable.push(`${JSON.stringify(once)} -> ${JSON.stringify(twice)}  [input ${JSON.stringify(s)}]`);
      else out.samples[s] = once;
    } catch (e) { out.threw.push(`${s} :: ${e.message}`); }
  }
  return out;
}, samples);
console.log(`threw(${bad.threw.length})`); bad.threw.slice(0, 15).forEach((s) => console.log('  ', s));
console.log(`blanked(${bad.blanked.length})`); bad.blanked.slice(0, 15).forEach((s) => console.log('  ', s));
console.log(`unstable(${bad.unstable.length})`); bad.unstable.slice(0, 20).forEach((s) => console.log('  ', s));
console.log(`unexplained-blanks(${(bad.unexplained || []).length})`); (bad.unexplained || []).slice(0, 20).forEach((s) => console.log('  ', s));
await browser.close();
