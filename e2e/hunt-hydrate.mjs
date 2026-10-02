import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addInitScript(() => {
  localStorage.setItem('mathcompile-cells', JSON.stringify([
    { id: 1, latex: 'a\\over b' },
    { id: 2, latex: 'x+1' }
  ]));
  localStorage.setItem('mathcompile-prefs', JSON.stringify({ target: 'latex' }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5573/', { waitUntil: 'networkidle' });
const out = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.expr-row')];
  return rows.map((r) => ({
    fieldLatex: r.querySelector('math-field')?.value,
    shown: r.querySelector('.cell-latex')?.textContent,
    cells: localStorage.getItem('mathcompile-cells'),
  }));
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
