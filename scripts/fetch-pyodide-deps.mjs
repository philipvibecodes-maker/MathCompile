// Fetches the files make-pyodide-snapshot.cjs needs into
// .pyodide-build/ (gitignored): the pinned pyodide runtime core, the
// pyodide-built-in wheels the calculator loads (sympy + dep mpmath,
// numpy, and plotly's deps narwhals/packaging), plus the plotly wheel
// itself from PyPI — it is a pure-Python package, not a pyodide
// built-in, so it is absent from pyodide-lock.json.
//
// Idempotent: files already on disk are skipped. Nothing here is
// served — this directory only feeds the snapshot generator.
// Usage: node scripts/fetch-pyodide-deps.mjs

import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const PYODIDE_VERSION = '0.29.0';
// pyodide-lock package names; depends edges are followed for the
// closure (sympy -> mpmath).
const PACKAGES = ['sympy', 'numpy', 'narwhals', 'packaging'];
// plotly is pinned here instead of 'latest' so a regenerated snapshot
// does not silently swap the library under unchanged code.
const PLOTLY_VERSION = '7.1.0';
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const DEST = join(
  dirname(fileURLToPath(import.meta.url)),
  '../.pyodide-build',
);

const CORE = [
  'pyodide.js',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

const lock = await (await fetch(`${CDN}pyodide-lock.json`)).json();

const wanted = new Set();
const queue = [...PACKAGES];
while (queue.length > 0) {
  const name = queue.shift();
  if (wanted.has(name)) continue;
  const pkg = lock.packages[name];
  if (!pkg) throw new Error(`${name} not in pyodide-lock.json`);
  wanted.add(name);
  queue.push(...(pkg.depends ?? []));
}

const files = [
  ...CORE,
  ...[...wanted].map((name) => lock.packages[name].file_name),
];

await mkdir(DEST, { recursive: true });
const download = async (url, name) => {
  const out = join(DEST, name);
  if (await stat(out).catch(() => null)) {
    console.log(`skip ${name}`);
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
  console.log(`fetch ${name}`);
};

for (const file of files) await download(`${CDN}${file}`, file);

// Resolve the pinned plotly release's wheel URL from PyPI.
const meta = await (
  await fetch(`https://pypi.org/pypi/plotly/${PLOTLY_VERSION}/json`)
).json();
const wheel = meta.urls.find((u) => u.filename.endsWith('.whl'));
if (!wheel) throw new Error(`no wheel published for plotly ${PLOTLY_VERSION}`);
await download(wheel.url, wheel.filename);

console.log(`pyodide ${PYODIDE_VERSION} + plotly ${PLOTLY_VERSION} staged in .pyodide-build/`);
