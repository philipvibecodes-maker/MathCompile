// Compare the same captured corpus in two checkouts with identical installed
// dependencies. Run serially, without browser tests/builds competing for CPU:
// node scripts/benchmark-compiler.mjs /path/to/baseline /path/to/candidate
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const corpus = JSON.parse(readFileSync(new URL('../src/compile/fixtures/compiler-baseline.json', import.meta.url), 'utf8'));
const roots = process.argv.slice(2);
if (roots.length !== 2) throw new Error('Provide baseline and candidate checkout paths');
const fixtureRoot = fileURLToPath(new URL('../', import.meta.url));

for (const root of roots) {
  const server = await createServer({
    root: path.resolve(root), server: { middlewareMode: true }, appType: 'custom',
  });
  try {
    const ir = await server.ssrLoadModule('/src/compile/ir.ts');
    const codegen = await server.ssrLoadModule('/src/compile/codegen.ts');
    const jobs = {
      parse: () => {
        for (const fixture of corpus.cases)
          for (const source of fixture.sources)
            if (typeof source === 'string') ir.parseCellLatex(source);
      },
      worksheet: () => {
        for (const fixture of corpus.cases)
          for (const { options } of fixture.variants)
            codegen.compileWorksheet(fixture.raw, 'python', options);
      },
      calculator: () => {
        for (const fixture of corpus.cases)
          for (const { options } of fixture.variants)
            codegen.compileCellsForCalc(fixture.raw, options);
      },
    };
    const metrics = {};
    for (const [name, run] of Object.entries(jobs)) {
      for (let i = 0; i < 30; i++) run();
      const samples = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        run();
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      metrics[name] = { p50: samples[49], p95: samples[94], samples: 100 };
    }
    console.log(JSON.stringify({
      root: path.relative(fixtureRoot, path.resolve(root)) || '.',
      node: process.version, unit: 'ms per corpus batch', metrics,
    }));
  } finally {
    await server.close();
  }
}
