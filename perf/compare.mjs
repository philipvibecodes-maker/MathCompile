#!/usr/bin/env node
// Diff two perf runs:
//
//   node perf/compare.mjs main candidate       # perf-results/<label>/*.json
//   node perf/compare.mjs main                  # single run, full table
//   node perf/compare.mjs a.json b.json         # individual result files
//
// Prints per-metric p50 (and p95) with the B/A ratio. Metric names are
// identical across runs by construction — they live in perf/*.spec.ts.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.env.PERF_OUT ?? 'perf-results';
const [a, b] = process.argv.slice(2);
if (!a) {
  console.error('usage: node perf/compare.mjs <labelA|fileA> [labelB|fileB]');
  process.exit(1);
}

const filesFor = (labelOrFile) => {
  if (labelOrFile.endsWith('.json')) return [labelOrFile];
  const dir = join(outDir, labelOrFile);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(dir, f));
};

const load = (labelOrFile) => {
  const merged = new Map();
  for (const f of filesFor(labelOrFile)) {
    for (const [k, v] of Object.entries(
      JSON.parse(readFileSync(f, 'utf8')).metrics,
    ))
      merged.set(k, [...(merged.get(k) ?? []), ...v.samples]);
  }
  return merged;
};

const q = (s, p) =>
  s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
const stats = (xs) => {
  const s = [...xs].sort((x, y) => x - y);
  return { n: s.length, p50: q(s, 0.5), p95: q(s, 0.95), min: s[0] };
};

const A = load(a);
const B = b ? load(b) : null;
if (A.size === 0) {
  console.error(`no results for '${a}' under ${outDir}/`);
  process.exit(1);
}

const names = [...new Set([...A.keys(), ...(B ? B.keys() : [])])].sort();
const fmt = (x) => (x == null ? '-' : x.toFixed(1).padStart(9));
console.log(
  B
    ? `${'metric'.padEnd(46)} ${a.padStart(10)} ${b.padStart(10)}    B/A   n`
    : `${'metric'.padEnd(46)} ${a.padStart(10)}   n`,
);
for (const name of names) {
  const sa = A.get(name) ? stats(A.get(name)) : null;
  const sb = B?.get(name) ? stats(B.get(name)) : null;
  const ratio =
    sa && sb ? `${((sb.p50 / sa.p50) * 100 - 100).toFixed(0).padStart(6)}%` : '';
  console.log(
    B
      ? `${name.padEnd(46)} ${fmt(sa?.p50)} ${fmt(sb?.p50)} ${ratio}   ${sa?.n ?? 0}/${sb?.n ?? 0}`
      : `${name.padEnd(46)} ${fmt(sa?.p50)}   ${sa?.n ?? 0}`,
  );
}
