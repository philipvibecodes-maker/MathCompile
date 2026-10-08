// Load-time cost of adding scipy to the Pyodide worker, measured cold
// (fresh browser context per run — no HTTP cache): boot + loadPackage +
// first import. Run with `node perf/measure-scipy.mjs`.
import { chromium } from 'playwright-core';

const BASE = 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/';
const RUNS = 3;

async function measure(packages) {
  const browser = await chromium.launch();
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    // fresh context each run -> cold HTTP cache, same wasm compile cost
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('about:blank');
    const t = await page.evaluate(async ({ base, packages }) => {
      const t0 = performance.now();
      await import(`${base}pyodide.js`);
      const py = await loadPyodide({ indexURL: base });
      const tBoot = performance.now();
      await py.loadPackage(packages);
      const tPkgs = performance.now();
      // exercise import so scipy actually initializes
      await py.runPythonAsync('import ' + (packages.includes('scipy') ? 'scipy.stats' : 'sympy'));
      const tImport = performance.now();
      return { boot: tBoot - t0, pkgs: tPkgs - tBoot, import: tImport - tPkgs, total: tImport - t0 };
    }, { base: BASE, packages });
    times.push(t);
    await ctx.close();
  }
  await browser.close();
  return times;
}

const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

for (const pkgs of [['sympy'], ['sympy', 'scipy']]) {
  const rs = await measure(pkgs);
  console.log(`packages: ${pkgs.join('+')}`);
  for (const r of rs) console.log(`  boot=${r.boot.toFixed(0)}ms pkg=${r.pkgs.toFixed(0)}ms import=${r.import.toFixed(0)}ms total=${r.total.toFixed(0)}ms`);
  console.log(`  median total=${med(rs.map(r => r.total)).toFixed(0)}ms median pkg=${med(rs.map(r => r.pkgs)).toFixed(0)}ms`);
}
