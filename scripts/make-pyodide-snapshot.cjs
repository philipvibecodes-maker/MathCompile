// Freezes a post-import SymPy interpreter into public/engine.snapshot.gz
// so the calculator worker restores it (_loadSnapshot) instead of
// cold-booting CPython + SymPy on every first load. numpy and plotly
// are deliberately kept out of the image (see the warm block below):
// the worker repopulates them at boot — numpy via loadPackage, plotly
// by unzipping the vendored wheel in public/wheels/. The worker falls
// back to the normal micropip boot when the file is absent or stale
// (BUILD_ID check inside pyodide).
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
import glob, os, sys, sysconfig, zipfile
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
# plotly and numpy are deliberately NOT warmed. numpy carries .so
# modules and makeMemorySnapshot captures the wasm heap but not the
# indirect-call table — a .so loaded now is dead after the restore and
# dlopening a new one post-restore crashes with 'table index is out of
# bounds'. plotly is pure python, but the import is ~0.2s anyway, so it
# is repopulated from a vendored wheel at boot instead (cheaper than
# pinning the whole package into the image). Both must stay out of
# sys.modules here so they install and import fresh post-restore.
for _pinned in ('numpy', 'plotly', 'narwhals'):
    assert _pinned not in sys.modules, f'snapshot would pin {_pinned} — it must not be imported pre-snapshot'
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
  // Mirror the worker's plotly repopulation: drop the vendored wheel
  // into the FS and unzip it into purelib, then fresh-import.
  const plotlyWheel = wheels.find((w) => w.startsWith('plotly-'));
  if (!plotlyWheel) throw new Error('plotly wheel missing from .pyodide-build');
  check.FS.writeFile(
    `/tmp/${plotlyWheel}`,
    new Uint8Array(readFileSync(join(BUILD, plotlyWheel))),
  );
  await check.runPythonAsync(
    `import glob, sysconfig, zipfile
for w in glob.glob('/tmp/plotly-*.whl'):
    zipfile.ZipFile(w).extractall(sysconfig.get_paths()['purelib'])
import sympy.physics
import sympy as sp
sp.integrate(sp.Symbol('x')**2, sp.Symbol('x'))
import plotly.graph_objects as go
import json
fig = go.Figure()
fig.add_scatter(x=[0, 1], y=[0, 1])
fig.update_xaxes(zeroline=True)
json.loads(fig.to_json())
# The .so path numpy takes post-restore (numpy was never imported at
# snapshot time, so these are fresh installs and dlopens) — the
# numpy.random lazy import + a numpy lambdify are what _mc_plot_figure
# hits on its first real eval.
import numpy
import numpy.random
import numpy as np
sp.lambdify(sp.Symbol('x'), sp.Symbol('x')**2, 'numpy')(np.array([1.0]))`,
  );
  console.log('snapshot verified (restore + loadPackage + lazy import ok)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
