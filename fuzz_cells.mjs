// Multi-cell + persistence fuzz: random cell ops (type, new cell via
// Shift+Enter, ArrowUp/Down hops, delete, duplicate via palette-less API,
// reload) then verify hydration restores exactly the stored cells and
// no errors surface.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

let seed = Number(process.env.FUZZ_SEED ?? 3) >>> 0;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (xs) => xs[Math.floor(rand() * xs.length)];

const browser = await chromium.launch();
const page = await browser.newPage();
const anomalies = [];
page.on('pageerror', (e) => anomalies.push({ kind: 'pageerror', err: String(e).slice(0, 300), stack: String(e.stack).slice(0, 600) }));
page.on('console', (m) => {
  if (m.type() === 'error') anomalies.push({ kind: 'console.error', err: m.text().slice(0, 300) });
});

const stored = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('mathcompile-cells') || 'null'));
const fieldValues = () =>
  page.evaluate(() => [...document.querySelectorAll('math-field')].map((el) => el.value));
const waitForCells = () =>
  page.waitForFunction(() => localStorage.getItem('mathcompile-cells') !== null);

await page.goto('http://localhost:5573/');
await page.waitForSelector('math-field');
await page.evaluate(() => {
  localStorage.setItem('mathcompile-prefs', JSON.stringify({ smartMode: true, target: 'python', guideOpen: false }));
});
await page.reload();
await page.waitForSelector('math-field');

const SNIPPETS = [
  'x+1', 'y^2', '\\frac{1}{2}', '\\int_{0}^{1}xdx', 'a\\mid b',
  '\\boxed{z}', '\\sum_{i=1}^{n}i', '\\|v\\|', '\\{1,2\\}',
  'a_{-}', '\\text{hi}', '\\underbrace{u}_{k}', 'e^{i\\pi}',
];
const KEY_ACTS = [
  { k: 'Shift+Enter', w: 3 }, { k: 'ArrowDown', w: 3 }, { k: 'ArrowUp', w: 3 },
  { k: 'Backspace', w: 4 }, { k: 'Delete', w: 2 }, { k: 'Enter', w: 1 },
  { k: 'Home' }, { k: 'End' }, { k: 'Tab' },
];

const N = Number(process.env.FUZZ_ROUNDS ?? 60);
for (let round = 0; round < N; round++) {
  // pick a cell (or make one)
  const cells = page.locator('math-field');
  const n = await cells.count();
  const idx = n === 0 || rand() < 0.15 ? -1 : Math.floor(rand() * n);
  if (idx === -1) {
    // new cell via Shift+Enter from an existing cell or the add button
    if (n > 0) {
      await cells.nth(Math.floor(rand() * n)).click();
      await page.keyboard.press('Shift+Enter');
    } else {
      await page.locator('.cell-add, button:has-text("expression")').first().click().catch(() => {});
    }
  } else {
    const c = cells.nth(idx);
    await c.click();
    const r = rand();
    if (r < 0.55) {
      // type a snippet
      await page.keyboard.type(pick(SNIPPETS).replace(/\\/g, ''), { delay: 5 });
    } else if (r < 0.8) {
      // set latex directly (hydration-style)
      await c.evaluate((el, v) => (el.value = v), pick(SNIPPETS));
    } else {
      const a = pick(KEY_ACTS);
      await page.keyboard.press(a.k);
    }
  }

  // every ~6 rounds: reload and verify persistence fidelity
  if (round % 6 === 5) {
    await waitForCells().catch(() => {});
    // give the debounced write a beat to land
    await page.waitForTimeout(400);
    const before = await fieldValues();
    const saved = await stored();
    await page.reload();
    await page.waitForSelector('math-field');
    const after = await fieldValues();
    const savedLatex = (saved?.cells ?? saved ?? []).map((c) => c.latex);
    if (JSON.stringify(savedLatex) !== JSON.stringify(before))
      anomalies.push({ kind: 'lost-before-save', before, savedLatex });
    if (JSON.stringify(after) !== JSON.stringify(savedLatex))
      anomalies.push({ kind: 'hydrate-mismatch', savedLatex, after });
    // latex ids must be numbers for loadCells filter
    for (const c of saved?.cells ?? saved ?? [])
      if (typeof c.id !== 'number') anomalies.push({ kind: 'bad-id', c });
  }
}

await page.waitForTimeout(400);
const saved = await stored();
await page.reload();
await page.waitForSelector('math-field');
const after = await fieldValues();
const savedLatex = (saved?.cells ?? saved ?? []).map((c) => c.latex);
if (JSON.stringify(after) !== JSON.stringify(savedLatex))
  anomalies.push({ kind: 'final-hydrate-mismatch', savedLatex, after });

console.log(`done. ${anomalies.length} anomalies, ${(saved?.cells ?? saved ?? []).length} cells final`);
for (const a of anomalies.slice(0, 25)) console.log('ANOMALY:', JSON.stringify(a).slice(0, 400));
writeFileSync('/home/ubuntu/scratch/cells_anomalies.json', JSON.stringify({ anomalies }, null, 1));
await browser.close();
