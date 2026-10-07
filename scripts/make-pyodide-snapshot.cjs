// Freezes a post-`import sympy` Pyodide interpreter into
// dist/pyodide/engine.snapshot so the desktop app's calculator worker
// restores memory (~0.1s) instead of cold-booting CPython + SymPy (~4s).
// The worker falls back to a normal boot when the file is absent or
// stale (BUILD_ID check inside pyodide), so dev/Pages builds — which
// don't run this script — are unaffected and the web bundle stays small.
//
// Why not loadPackage before snapshotting: pyodide mounts wheel contents
// in a JS-side filesystem outside the WASM heap, so only modules already
// imported survive a memory snapshot — lazy imports (e.g.
// sympy.tensor.tensor) fail after restore. This script instead unzips
// the vendored wheels into the in-heap FS via zipfile, so every file is
// inside the snapshot.
//
// Loaded via `node -e "require('...')"` (see the pyodide:snapshot npm
// script): pyodide.asm.js mixes require() with a top-level await, and
// only the -e entry context resolves that ambiguity to CommonJS —
// as a .cjs/.mjs entry the wasm glue's require() calls crash.
// Idempotent: skipped when the snapshot is newer than its inputs.
// Usage: npm run pyodide:snapshot

const { readFileSync } = require('node:fs');
const { readdir, stat, writeFile, mkdir } = require('node:fs/promises');
const { dirname, join } = require('node:path');

const ROOT = join(__dirname, '..');
const VENDOR = join(ROOT, 'public/pyodide');
const OUT = join(ROOT, 'dist/pyodide/engine.snapshot');

async function main() {
  const wheels = (await readdir(VENDOR).catch(() => [])).filter((f) =>
    f.endsWith('.whl'),
  );
  if (wheels.length === 0) {
    throw new Error('no wheels in public/pyodide — run npm run pyodide:fetch');
  }

  const inputs = [
    'pyodide.asm.js',
    'pyodide.asm.wasm',
    'python_stdlib.zip',
    ...wheels,
  ];
  const newestInput = Math.max(
    ...(await Promise.all(
      inputs.map(async (f) => (await stat(join(VENDOR, f))).mtimeMs),
    )),
  );
  const outTime = await stat(OUT)
    .then((s) => s.mtimeMs)
    .catch(() => 0);
  if (outTime > newestInput) {
    console.log('engine.snapshot is up to date');
    return;
  }

  require(join(VENDOR, 'pyodide.js')); // defines global loadPyodide
  // Preload the wasm glue so loadPyodide skips its import() path: the
  // package.json "type": "module" makes that import treat the CJS-shaped
  // asm.js as ESM, where its require() calls throw.
  require(join(VENDOR, 'pyodide.asm.js'));
  const loadPyodide = globalThis.loadPyodide;

  const py = await loadPyodide({ indexURL: `${VENDOR}/`, _makeSnapshot: true });
  for (const w of wheels) {
    py.FS.writeFile(
      `/tmp/${w}`,
      new Uint8Array(readFileSync(join(VENDOR, w))),
    );
  }
  await py.runPythonAsync(`
import glob, os, sysconfig, zipfile
purelib = sysconfig.get_paths()['purelib']
for w in glob.glob('/tmp/*.whl'):
    zipfile.ZipFile(w).extractall(purelib)
    os.unlink(w)
import sympy as sp
# Warm the lazy-import paths the calculator exercises so the snapshot
# carries them pre-resolved (restored evals skip the import cost too).
x = sp.Symbol('x')
sp.integrate(x**2, x); sp.diff(sp.sin(x), x); sp.summation(x, (x, 1, 5))
sp.Matrix([[1, 2], [3, 4]]).det(); sp.solve(x**2 - 1, x)
sp.series(sp.sin(x), x); sp.latex(sp.sqrt(2))
`);

  const snap = py.makeMemorySnapshot();
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, Buffer.from(snap));
  console.log(`engine.snapshot: ${(snap.byteLength / 1e6).toFixed(1)} MB`);

  // Round-trip check: a second interpreter restores the snapshot and
  // runs a lazy sympy subpackage import that only passes if the
  // unpacked wheel files really made it into the image.
  const check = await loadPyodide({
    indexURL: `${VENDOR}/`,
    _loadSnapshot: snap,
  });
  await check.runPythonAsync(
    'import sympy.tensor.tensor; sp.integrate(sp.Symbol("x")**2, sp.Symbol("x"))',
  );
  console.log('snapshot verified (restore + lazy import ok)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
