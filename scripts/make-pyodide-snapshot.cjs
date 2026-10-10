// Freezes a post-import Pyodide interpreter into public/engine.snapshot
// so the calculator worker restores it (_loadSnapshot) instead of
// cold-booting CPython + SymPy and micropip-installing plotly on every
// first load. The worker falls back to the normal boot when the file is
// absent or stale (BUILD_ID check inside pyodide).
//
// Why zipfile instead of loadPackage for the pre-snapshot install:
// loadPackage records packages in a map that occupies a reserved hiwire
// slot makeMemorySnapshot() refuses to serialize ("Unexpected hiwire
// entry at index 6"). Extracting the wheels into the in-heap FS via
// zipfile resolves the same imports without touching hiwire state. It
// also covers plotly, which is a PyPI wheel, not a pyodide built-in, so
// loadPackage cannot install it either way. The package files
// themselves do not survive a restore (EMFS metadata lives outside the
// heap) — the worker re-runs loadPackage afterwards to repopulate the
// built-ins, and every plotly module the runtime touches is warmed into
// sys.modules below, which the memory image does preserve.
//
// Run via `node -e "require('./scripts/make-pyodide-snapshot.cjs')"`
// (the pyodide:snapshot npm script): pyodide.asm.js mixes require()
// with a top-level await, and only the -e entry context resolves that
// ambiguity to CommonJS — as a .cjs/.mjs entry the wasm glue's
// require() calls crash. Idempotent: skipped when the snapshot is newer
// than its inputs. Deps come from `node scripts/fetch-pyodide-deps.mjs`.
// Usage: npm run pyodide:snapshot

const { readFileSync } = require('node:fs');
const { readdir, stat, writeFile, mkdir } = require('node:fs/promises');
const { dirname, join } = require('node:path');

const ROOT = join(__dirname, '..');
const BUILD = join(ROOT, '.pyodide-build');
// Served gzipped — the heap image is ~75 MB raw but ~22 MB compressed,
// and the worker inflates it with DecompressionStream at boot.
const OUT = join(ROOT, 'public/engine.snapshot.gz');

// pyodide-lock packages whose files the worker repopulates with
// loadPackage after the restore (and whose imports are warmed here).
const BUILTINS = ['sympy', 'numpy', 'narwhals', 'packaging'];

async function main() {
  const wheels = (await readdir(BUILD).catch(() => [])).filter((f) =>
    f.endsWith('.whl'),
  );
  if (wheels.length === 0) {
    throw new Error(
      'no wheels in .pyodide-build — run node scripts/fetch-pyodide-deps.mjs',
    );
  }

  const inputs = [
    'pyodide.asm.js',
    'pyodide.asm.wasm',
    'python_stdlib.zip',
    ...wheels,
  ];
  const newestInput = Math.max(
    ...(await Promise.all(
      inputs.map(async (f) => (await stat(join(BUILD, f))).mtimeMs),
    )),
  );
  const outTime = await stat(OUT)
    .then((s) => s.mtimeMs)
    .catch(() => 0);
  if (outTime > newestInput) {
    console.log('engine.snapshot is up to date');
    return;
  }

  require(join(BUILD, 'pyodide.js')); // defines global loadPyodide
  // Preload the wasm glue so loadPyodide skips its import() path: the
  // package.json "type": "module" makes that import treat the CJS-shaped
  // asm.js as ESM, where its require() calls throw.
  require(join(BUILD, 'pyodide.asm.js'));
  const loadPyodide = globalThis.loadPyodide;

  const py = await loadPyodide({
    indexURL: `${BUILD}/`,
    _makeSnapshot: true,
  });
  for (const w of wheels) {
    py.FS.writeFile(
      `/tmp/${w}`,
      new Uint8Array(readFileSync(join(BUILD, w))),
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
# _mc_row simplifies every result — warm it so sympy.physics (pulled in
# lazily by simplify) is resident in the snapshot.
sp.simplify(x + x); sp.N(sp.pi, 12)
import numpy
# Warm everything _mc_plot_figure calls: the graph_objects validators
# for the traces it builds, plus plotly.io's to_json path. These modules
# must live in sys.modules because plotly's files are not repopulated
# after a restore — plotly is not a pyodide built-in.
import plotly.graph_objects as go
import plotly.io
import numpy as np
fig = go.Figure(
    data=[go.Scatter(x=[0, 1], y=[0, 1]), go.Cone(x=[0], y=[0], z=[0], u=[1], v=[0], w=[0]), go.Surface(z=[[0, 1], [1, 0]]), go.Heatmap(z=[[0, 1], [1, 0]]), go.Scatter3d(x=[0], y=[0], z=[0])],
    layout={'updatemenus': [{'buttons': [{'label': 'a', 'method': 'update', 'args': [{}]}]}]},
)
import json
json.loads(fig.to_json())
`);

  const snap = py.makeMemorySnapshot();
  await mkdir(dirname(OUT), { recursive: true });
  const { gzipSync } = require('node:zlib');
  await writeFile(OUT, gzipSync(Buffer.from(snap), { level: 9 }));
  console.log(`engine.snapshot.gz: ${(snap.byteLength / 1e6).toFixed(1)} MB raw`);

  // Round-trip check mirroring the worker's boot: restore the image,
  // re-run loadPackage to repopulate the built-in package FS, then
  // exercise a lazy sympy subpackage import and the plotly figure path —
  // the plotly .py files are gone post-restore, so this only works when
  // every needed module was warmed into the snapshot.
  const check = await loadPyodide({
    indexURL: `${BUILD}/`,
    _loadSnapshot: snap,
  });
  await check.loadPackage(BUILTINS);
  await check.runPythonAsync(
    `import sympy.physics
import sympy as sp
sp.integrate(sp.Symbol('x')**2, sp.Symbol('x'))
import plotly.graph_objects as go
import json
json.loads(go.Figure(go.Scatter(x=[0, 1], y=[0, 1])).to_json())`,
  );
  console.log('snapshot verified (restore + loadPackage + lazy import ok)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
