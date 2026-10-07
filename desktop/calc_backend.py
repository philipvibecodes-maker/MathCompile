"""PythonSafeEval-backed calculator engine for the desktop shell.

In the browser the calculator runs the emitted SymPy program inside a
Pyodide (WASM) worker. In the desktop shell the same program runs on the
host through PythonSafeEval — each eval is a `docker exec` into an
nsjail-sandboxed interpreter, so untrusted worksheet code never touches
the host Python.

The executed source is identical to the worker's: mc_runtime.py (shared,
`?raw`-imported by calculator.worker.ts) + one `print(mc_run(prog))`
call. Results come back on the last stdout line as the rows JSON.

Boot note: the first-ever SafeEval() clones nsjail and builds the image
(minutes); later boots hit the docker layer cache (seconds). Docker and
git must be reachable from the host.
"""

import json
import subprocess
import threading
from pathlib import Path

# The jail session dir lives outside the repo — the sandboxed code runs
# with uid 99999, so anything it writes stays out of the checkout.
JAIL_DIR = Path.home() / '.mathcompile' / 'jailfs'
RUNTIME_PY = Path(__file__).resolve().parent.parent / 'src' / 'calc' / 'mc_runtime.py'

# PythonSafeEval clones nsjail HEAD into its package dir on first use;
# HEAD needs -std=c++20, which the image's gcc 7.5 (ubuntu:18.04) can't
# build. 3.0 is the release the package was written against.
NSJAIL_REF = '3.0'

# nsjail kills the eval process past this — the frontend's own watchdog
# mirrors it (a still-booting engine re-arms instead of firing).
TIME_LIMIT = 30


def _runner_source(program_json: str) -> str:
    # repr() makes the JSON a python string literal — the same embedding
    # the worker uses (mc_run takes the program as a json string).
    return RUNTIME_PY.read_text() + f'\nprint(mc_run({program_json!r}))\n'


class CalcBackend:
    """js_api object exposed to the webview as window.pywebview.api."""

    def __init__(self) -> None:
        self._status = 'idle'
        self._error = ''
        self._sf = None
        self._boot: threading.Thread | None = None
        self._boot_lock = threading.Lock()

    # --- js_api surface (called from JS as pywebview.api.<name>) ---

    def prewarm(self) -> None:
        self._ensure_boot()

    def engine_status(self) -> dict:
        return {'status': self._status, 'error': self._error}

    def calc_eval(self, program_json: str) -> list:
        """Run the worksheet program; returns the row list the worker
        would have posted back."""
        self._ensure_boot()
        assert self._boot is not None
        self._boot.join()
        if self._status != 'ready':
            return [{'ok': False, 'error': self._error or 'engine failed to start'}]
        source = _runner_source(program_json)
        try:
            # Each eval is a fresh sandboxed interpreter — the whole
            # worksheet prefix re-runs (mc_runtime's _snaps always
            # starts empty, so mc_run evaluates every cell). Evals run
            # concurrently: there's no shared state in the sandbox, and
            # serializing behind one request would let a slow cell eat
            # the queued cells' frontend watchdog budget.
            result = self._sf.eval(code=source, time_limit=TIME_LIMIT)
        except subprocess.CalledProcessError as e:
            detail = (e.stderr or b'').decode('utf-8', 'replace').strip()
            return [
                {
                    'ok': False,
                    'error': detail or f'sandbox exited {e.returncode}',
                }
            ]
        line = result.stdout.decode('utf-8', 'replace').strip().rsplit('\n', 1)[-1]
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            return [{'ok': False, 'error': f'unreadable engine output: {line[:200]}'}]

    # --- boot ---

    def _ensure_boot(self) -> None:
        with self._boot_lock:
            # A finished, failed boot is retried on the next call — a
            # transient docker hiccup shouldn't wedge the app until a
            # restart. An in-flight or succeeded boot is left alone.
            if self._boot is not None and (
                self._boot.is_alive() or self._status != 'error'
            ):
                return
            self._status = 'loading'
            self._error = ''
            self._boot = threading.Thread(target=self._boot_engine, daemon=True)
            self._boot.start()

    def _boot_engine(self) -> None:
        try:
            self._sf = self._make_sandbox()
            self._status = 'ready'
        except Exception as e:  # noqa: BLE001 — the error surfaces as a row
            self._status = 'error'
            self._error = f'failed to start the SymPy sandbox: {e}'

    def _make_sandbox(self):
        import PythonSafeEval

        _seed_nsjail(PythonSafeEval)
        JAIL_DIR.mkdir(parents=True, exist_ok=True)
        # The template's ubuntu:18.04 image installs python3.8 alongside
        # its stock python3 (the eval interpreter); sympy lands via pip.
        return PythonSafeEval.SafeEval(
            version='3.8', modules=['sympy'], tmp_dir=str(JAIL_DIR)
        )


def _seed_nsjail(mod) -> None:
    """Pre-clone nsjail at NSJAIL_REF into the package's .nsjail dir —
    SafeEval only clones when it's absent, and HEAD no longer builds on
    the image's old gcc."""
    pkg_dir = Path(mod.__file__).parent
    dest = pkg_dir / '.nsjail'
    if dest.is_dir():
        return
    subprocess.run(
        [
            'git',
            'clone',
            '--depth',
            '1',
            '--branch',
            NSJAIL_REF,
            'https://github.com/google/nsjail.git',
            str(dest),
        ],
        check=True,
    )
