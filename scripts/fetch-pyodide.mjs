// Vendors the pinned Pyodide runtime + the packages the calculator
// engine loads into public/pyodide/, so the shipped bundle needs no
// network at runtime (the worker's importScripts/loadPackage read from
// this directory instead of the jsDelivr CDN).
//
// Only the needed files are fetched — the full/ dist carries every
// pyodide package (~hundreds of MB); pyodide-lock.json resolves sympy's
// dependency closure (sympy -> mpmath).
//
// Idempotent: files already on disk are skipped, so the predev/prebuild
// hooks stay cheap after the first run.
// Usage: node scripts/fetch-pyodide.mjs

import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const PYODIDE_VERSION = '0.29.0';
const PACKAGES = ['sympy'];
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const DEST = join(
  dirname(fileURLToPath(import.meta.url)),
  '../public/pyodide',
);

// Runtime core: the loader importScripts'd by the worker plus the files
// it then loads itself (asm glue, wasm, stdlib, package lock).
const CORE = [
  'pyodide.js',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

const lock = await (await fetch(`${CDN}pyodide-lock.json`)).json();

// Dependency closure of PACKAGES over the lock's depends edges.
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
for (const file of files) {
  const out = join(DEST, file);
  const existing = await stat(out).catch(() => null);
  if (existing) {
    console.log(`skip ${file}`);
    continue;
  }
  const res = await fetch(`${CDN}${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
  console.log(`fetch ${file}`);
}
console.log(`pyodide ${PYODIDE_VERSION} vendored into public/pyodide/`);
