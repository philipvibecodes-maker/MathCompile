// SymPy evaluation engine on Pyodide (WASM CPython), running off the main
// thread so heavy simplifications can't freeze the editor. Spawned lazily
// by calculator.svelte.ts on the first evaluation; one-time startup loads
// the pyodide runtime + wheels vendored under public/pyodide/ (see
// scripts/fetch-pyodide-deps.mjs) — no runtime network.
//
// The LaTeX -> SymPy translation happens on the main thread by
// compileCellForCalc (the shared codegen pipeline), so the worker only
// exec/evals emitted Python — no latex parser (parse_latex/antlr) needed.
//
// Built as a classic (iife) worker — importScripts pulls the pyodide
// loader; package assets stream from the same vendored indexURL.
// The runtime it execs lives in mc_runtime.py — shared with the desktop
// shell's sandboxed backend, which runs the identical source.

import MC_RUNTIME from './mc_runtime.py?raw';

declare function importScripts(...urls: string[]): void;
declare function loadPyodide(opts: {
  indexURL: string;
  _loadSnapshot?: ArrayBuffer;
}): Promise<PyodideLike>;

interface PyodideLike {
  loadPackage(pkgs: string | string[]): Promise<void>;
  runPythonAsync(code: string): Promise<unknown>;
  FS: { writeFile(path: string, data: Uint8Array): void };
}

interface CalcStatementMsg {
  code: string;
  display?: string;
  /** Exec-only statements (defs-only python source) — the code execs
   * for its bindings and the row is a marker the client drops, so
   * nothing displays. */
  silent?: boolean;
  /** Statements that failed to emit keep their error — the row reports
   * it in place instead of vanishing. */
  error?: string;
}

interface EvalCellMsg {
  /** Stable content hash of {defs, statements} — the snapshot chain
   * rewinds to the first cell whose key changed. */
  key: string;
  /** Symbol/Function decl lines exec'd before this cell's statements. */
  defs: string[];
  statements: CalcStatementMsg[];
}

interface EvalRequest {
  id: number;
  type?: never;
  // The worksheet prefix ending at the requesting cell: shared prelude
  // plus every cell's program in order. The reply's `rows` are the last
  // cell's results.
  program: { prelude: string[]; cells: EvalCellMsg[] };
}

// First message the main thread sends — the page knows BASE_URL (the
// base public assets are served under); a classic worker can't read
// import.meta.env itself.
interface InitRequest {
  type: 'init';
  assetBase: string;
}

type WorkerMessage =
  | { type: 'ready' }
  | { type: 'init-error'; error: string }
  | { id: number; ok: true; rows: unknown }
  | { id: number; ok: false; error: string };

const scope = self as unknown as {
  postMessage(msg: WorkerMessage): void;
  onmessage:
    | ((e: MessageEvent<InitRequest | EvalRequest>) => void)
    | null;
};

// The vendored wheel the boot repopulates plotly's files
// from — pinned to the same version scripts/fetch-pyodide-deps.mjs
// stages into public/wheels/.
const PLOTLY_WHEEL = 'plotly-7.1.0-py3-none-any.whl';

// The python runtime the interpreter boots with (see mc_runtime.py —
// mc_run + the plot-helper source strings the shown program quotes).
const SETUP_PY = MC_RUNTIME;

let boot: Promise<PyodideLike> | undefined;

// engine.snapshot(.gz) in public/ is a frozen post-import memory image
// (scripts/make-pyodide-snapshot.cjs) with sympy already loaded —
// restoring it skips the multi-second imports; numpy and plotly are
// repopulated on top of it at boot (numpy via loadPackage, plotly by
// unzipping the vendored wheel), so no micropip/PyPI install runs.
// The base public assets are served under — set by the 'init' message.
// Undefined means no init arrived (shouldn't happen: the main thread
// posts init right after construction) — engine boot is skipped rather
// than guessing a URL.
let assetBase: string | undefined;

// Everything the engine loads lives under assetBase: the vendored
// runtime + built-in wheels in pyodide/ (the indexURL — loadPackage
// resolves filenames via the pyodide-lock.json beside them), the
// optional engine.snapshot(.gz), and the committed plotly wheel in
// wheels/.

async function fetchSnapshot(): Promise<ArrayBuffer | undefined> {
  if (assetBase === undefined) return undefined;
  for (const file of ['engine.snapshot.gz', 'engine.snapshot']) {
    const resp = await fetch(`${assetBase}${file}`).catch(
      () => undefined,
    );
    if (!resp?.ok) continue;
    let buf: ArrayBuffer;
    try {
      buf = await resp.arrayBuffer();
      // Some dev servers tag .gz assets with Content-Encoding: gzip and
      // fetch has then already decoded for us; sniff the bytes instead
      // of trusting the filename or headers — gzip starts 1f 8b, a
      // snapshot starts with its own magic.
      if (
        buf.byteLength > 2 &&
        new DataView(buf).getUint16(0, true) === 0x8b1f &&
        typeof DecompressionStream !== 'undefined'
      )
        buf = await new Response(
          new Blob([buf])
            .stream()
            .pipeThrough(new DecompressionStream('gzip')),
        ).arrayBuffer();
    } catch (err) {
      console.warn(`[calc] snapshot ${file} unusable:`, err);
      continue;
    }
    // Check the snapshot magic before handing bytes to _loadSnapshot:
    // servers that fall back to index.html answer 200 with HTML, and
    // feeding that to _loadSnapshot hangs the boot instead of throwing.
    const SNAPSHOT_MAGIC = 1886286592;
    if (
      buf.byteLength > 48 &&
      new Uint32Array(buf, 0, 4)[0] === SNAPSHOT_MAGIC
    )
      return buf;
  }
  return undefined;
}

// plotly is a pure-Python PyPI package, not a pyodide built-in, so
// loadPackage can't install it — unzip the vendored wheel into the
// site dir the same way loadPackage would.
async function installPlotly(py: PyodideLike): Promise<void> {
  const wheelResp = await fetch(`${assetBase}wheels/${PLOTLY_WHEEL}`);
  if (!wheelResp.ok) throw new Error('plotly wheel fetch failed');
  py.FS.writeFile(
    `/tmp/${PLOTLY_WHEEL}`,
    new Uint8Array(await wheelResp.arrayBuffer()),
  );
  await py.runPythonAsync(
    `import sysconfig, zipfile\nzipfile.ZipFile('/tmp/${PLOTLY_WHEEL}').extractall(sysconfig.get_paths()['purelib'])`,
  );
}

async function bootEngine(): Promise<PyodideLike> {
  if (assetBase === undefined) throw new Error('engine init missing');
  const indexURL = `${assetBase}pyodide/`;
  importScripts(`${indexURL}pyodide.js`);
  const snap = await fetchSnapshot();
  if (snap) {
    try {
      const py = await loadPyodide({
        indexURL,
        _loadSnapshot: snap,
      });
      // Package files never survive a snapshot — the EMFS tree lives
      // outside the wasm heap — so the built-ins must be repopulated
      // for lazy imports (numpy stays out of the image on purpose —
      // its .so modules would be dead pointers after the restore).
      await py.loadPackage(['sympy', 'numpy', 'narwhals', 'packaging']);
      await installPlotly(py);
      await py.runPythonAsync(SETUP_PY);
      return py;
    } catch (err) {
      console.warn('[calc] snapshot restore failed, cold-booting:', err);
    }
  }
  const py = await loadPyodide({ indexURL });
  await py.loadPackage(['sympy', 'numpy', 'narwhals', 'packaging']);
  await installPlotly(py);
  await py.runPythonAsync(SETUP_PY);
  return py;
}

function ensureEngine(): Promise<PyodideLike> {
  if (!boot) {
    boot = bootEngine().then((py) => {
      scope.postMessage({ type: 'ready' });
      return py;
    });
    boot.catch((err) => {
      console.error('[calc] boot failed:', err);
      // Report once, then allow the next eval to retry a failed boot
      // (e.g. a transient CDN fetch error).
      boot = undefined;
      scope.postMessage({
        type: 'init-error',
        error: 'failed to load the SymPy engine',
      });
    });
  }
  return boot;
}

scope.onmessage = (e) => {
  const msg = e.data as InitRequest | EvalRequest;
  if (msg.type === 'init') {
    assetBase = msg.assetBase;
    // The main thread posts init right after construction, so boot
    // still overlaps the wasm download with the user's menu
    // interaction the same way an unconditional boot on spawn did.
    void ensureEngine();
    return;
  }
  const { id, program } = msg;
  void ensureEngine()
    .then(async (py) => {
      // The program travels inside the python source as a quoted literal —
      // a shared globals slot would race when evals overlap.
      const call = `mc_run(${JSON.stringify(JSON.stringify(program))})`;
      const json = await py.runPythonAsync(call);
      scope.postMessage({ id, ok: true, rows: JSON.parse(json as string) });
    })
    .catch((err: unknown) => {
      scope.postMessage({
        id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
};
