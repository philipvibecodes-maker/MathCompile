// Regenerates public/user-guide.pdf from USER-GUIDE.md.
// Markdown -> marked -> MathJax typesetting (CDN) -> headless Chromium
// print-to-PDF via Playwright. Needs network access for the MathJax CDN.
// Usage: node scripts/build-reference-pdf.mjs

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { marked } from 'marked';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(join(root, 'USER-GUIDE.md'), 'utf8');

// marked mangles math content (backslash escapes, \\ -> \). Swap each
// \(…\) span for a plain-text token, restore the raw tex in the HTML.
const spans = [];
const protected_ = md.replace(/\\\((.*?)\\\)/gs, (_, tex) => {
  spans.push(tex);
  return `ZZSPAN${spans.length - 1}ZZ`;
});

let body = marked.parse(protected_, { gfm: true });
spans.forEach((tex, i) => {
  body = body.replace(`ZZSPAN${i}ZZ`, `\\(${tex}\\)`);
});

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @page { margin: 16mm 14mm; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.45; color: #1f2328; max-width: 190mm;
  }
  h1 { font-size: 17pt; border-bottom: 2px solid #d0d7de; padding-bottom: 6px; }
  h2 { font-size: 13pt; margin-top: 1.4em; border-bottom: 1px solid #d8dee4; padding-bottom: 3px; }
  h1, h2 { page-break-after: avoid; }
  code {
    font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;
    font-size: 8.8pt; background: #eff1f3; border-radius: 4px; padding: 1px 4px;
  }
  pre { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px;
        padding: 8px 10px; page-break-inside: avoid; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; font-size: 9.3pt; }
  th, td { border: 1px solid #d0d7de; padding: 4px 7px; vertical-align: top;
            text-align: left; }
  th { background: #f0f3f6; }
  tr { page-break-inside: avoid; }
  li { margin: 2px 0; }
</style>
<script>
  window.MathJax = {
    tex: {
      inlineMath: [['\\\\(', '\\\\)']],
      // antid/dprime/oiint and the b/c/d under-accents aren't in the
      // bundled tex extension set; approximate them.
      macros: {
        antid: '\\\\int', dprime: "{''}", oiint: '\\\\oint\\\\!\\\\oint',
        b: ['\\\\underline{#1}', 1], c: ['\\\\underset{,}{#1}', 1],
        d: ['\\\\underset{.}{#1}', 1],
      }
    },
    svg: { fontCache: 'global' }
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
</head><body>
${body}
</body></html>`;

const htmlPath = join(root, 'public/.user-guide.html');
writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${htmlPath}`);
await page.waitForFunction(
  () => window.MathJax?.startup?.promise,
  { timeout: 30000 },
);
await page.evaluate(() => window.MathJax.startup.promise);
await page.pdf({
  path: join(root, 'public/user-guide.pdf'),
  format: 'Letter',
  printBackground: true,
});
await browser.close();

unlinkSync(htmlPath);
console.log('wrote public/user-guide.pdf');
