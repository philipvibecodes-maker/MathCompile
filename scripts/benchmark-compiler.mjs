// Compare the same captured corpus in two checkouts with identical installed
// dependencies. Run serially, without browser tests/builds competing for CPU:
// node scripts/benchmark-compiler.mjs /path/to/baseline /path/to/candidate
import { build } from 'vite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const corpus = JSON.parse(readFileSync(new URL('../src/compile/fixtures/compiler-baseline.json', import.meta.url), 'utf8'));
const roots = process.argv.slice(2);
if (roots.length !== 2) throw new Error('Provide baseline and candidate checkout paths');
const fixtureRoot = fileURLToPath(new URL('../', import.meta.url));

for (const root of roots) {
  const scratch = mkdtempSync(path.join(tmpdir(), 'mathcompile-benchmark-'));
  try {
    // Bundle before timing. Vite SSR's live import wrappers charge per-module
    // access overhead that the deployed app's production bundle does not have.
    const entry = path.join(scratch, 'entry.mjs');
    writeFileSync(entry, ['ir', 'codegen'].map((name) =>
      `export * from ${JSON.stringify(path.resolve(root, 'src/compile', `${name}.ts`))};`,
    ).join('\n'));
    await build({
      configFile: false, root: path.resolve(root), logLevel: 'error',
      build: {
        outDir: path.join(scratch, 'dist'), emptyOutDir: true, minify: true,
        lib: { entry, formats: ['es'], fileName: () => 'compiler.mjs' },
      },
    });
    const compiler = await import(pathToFileURL(path.join(scratch, 'dist/compiler.mjs')).href);
    const jobs = {
      parse: () => {
        for (const fixture of corpus.cases)
          for (const source of fixture.sources)
            if (typeof source === 'string') compiler.parseCellLatex(source);
      },
      worksheet: () => {
        for (const fixture of corpus.cases)
          for (const { options } of fixture.variants)
            compiler.compileWorksheet(fixture.raw, 'python', options);
      },
      calculator: () => {
        for (const fixture of corpus.cases)
          for (const { options } of fixture.variants)
            compiler.compileCellsForCalc(fixture.raw, options);
      },
    };
    const metrics = {};
    for (const [name, run] of Object.entries(jobs)) {
      for (let i = 0; i < 200; i++) run();
      const samples = [];
      for (let i = 0; i < 200; i++) {
        const start = performance.now();
        run();
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      metrics[name] = { p50: samples[99], p95: samples[189], samples: 200 };
    }
    console.log(JSON.stringify({
      root: path.relative(fixtureRoot, path.resolve(root)) || '.',
      node: process.version, mode: 'production-bundle',
      unit: 'ms per corpus batch', metrics,
    }));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
