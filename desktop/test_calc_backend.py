"""Contract tests for the PythonSafeEval calculator backend.

The SafeEval sandbox is stubbed — a real docker/nsjail boot only runs
under the opt-in integration test at the bottom (MC_DOCKER_TEST=1).
"""

import json
import subprocess
from pathlib import Path

import calc_backend
import pytest


class FakeSandbox:
    def __init__(self, stdout: bytes = b'[]\n', exc=None):
        self.stdout = stdout
        self.exc = exc
        self.calls = []

    def eval(self, code=None, time_limit=0):
        self.calls.append({'code': code, 'time_limit': time_limit})
        if self.exc is not None:
            raise self.exc
        return subprocess.CompletedProcess(args=[], returncode=0, stdout=self.stdout)


def make_backend(sf=None, boot_error: Exception | None = None):
    backend = calc_backend.CalcBackend()
    if boot_error is not None:

        def boom():
            raise boot_error

        backend._make_sandbox = boom
    else:
        backend._make_sandbox = lambda: sf if sf is not None else FakeSandbox()
    return backend


def test_runner_embeds_program_and_runtime():
    src = calc_backend._runner_source('{"cells": [], "prelude": ["a\\nb"]}')
    assert 'def mc_run' in src
    # repr() quoting keeps the JSON one literal — a newline inside the
    # program can't break out into injected source.
    assert src.rstrip().endswith(
        "print(mc_run('{\"cells\": [], \"prelude\": [\"a\\\\nb\"]}'))"
    )


def test_calc_eval_returns_rows_from_last_stdout_line():
    rows = [{'ok': True, 'latex': 'x + 1'}]
    sf = FakeSandbox(stdout=('warning noise\n' + json.dumps(rows) + '\n').encode())
    backend = make_backend(sf)
    assert backend.calc_eval('{"cells": []}') == rows
    # The whole program rides inside the sandboxed source, and evals run
    # under the nsjail time limit.
    call = sf.calls[0]
    assert '{"cells": []}' in call['code']
    assert call['time_limit'] == calc_backend.TIME_LIMIT


def test_calc_eval_surfaces_sandbox_failure_as_error_row():
    sf = FakeSandbox(
        exc=subprocess.CalledProcessError(
            1, 'nsjail', stderr=b'killed by time limit'
        )
    )
    backend = make_backend(sf)
    assert backend.calc_eval('{}') == [
        {'ok': False, 'error': 'killed by time limit'}
    ]


def test_engine_status_flips_ready_then_serves_evals():
    backend = make_backend()
    assert backend.engine_status()['status'] == 'idle'
    backend.prewarm()
    assert backend.engine_status()['status'] in ('loading', 'ready')
    backend._boot.join()
    assert backend.engine_status()['status'] == 'ready'


def test_boot_failure_reports_error_and_evals_fail_clean():
    backend = make_backend(boot_error=RuntimeError('docker missing'))
    backend.prewarm()
    backend._boot.join()
    s = backend.engine_status()
    assert s['status'] == 'error'
    assert 'docker missing' in s['error']
    assert backend.calc_eval('{}') == [
        {'ok': False, 'error': 'failed to start the SymPy sandbox: docker missing'}
    ]


def test_failed_boot_retries_on_next_call():
    backend = calc_backend.CalcBackend()
    attempts = []

    def flaky():
        attempts.append(1)
        if len(attempts) == 1:
            raise RuntimeError('docker not up yet')
        return FakeSandbox(stdout=b'[{"ok": true, "text": "2"}]\n')

    backend._make_sandbox = flaky
    backend.prewarm()
    backend._boot.join()
    assert backend.engine_status()['status'] == 'error'
    # The next call boots again — a transient failure must not wedge
    # the app until a restart.
    assert backend.calc_eval('{}') == [{'ok': True, 'text': '2'}]
    assert backend.engine_status()['status'] == 'ready'
    assert len(attempts) == 2


def test_runtime_file_stays_the_single_source(tmp_path):
    # The backend and the Pyodide worker share mc_runtime.py — the
    # worker must keep importing it via ?raw rather than re-inlining.
    worker = (calc_backend.RUNTIME_PY.parent / 'calculator.worker.ts').read_text()
    assert "mc_runtime.py?raw" in worker
    assert 'const SETUP_PY' not in worker


@pytest.mark.skipif(
    not __import__('os').environ.get('MC_DOCKER_TEST'),
    reason='real docker+nsjail boot — set MC_DOCKER_TEST=1',
)
def test_real_sandbox_evaluates():
    backend = calc_backend.CalcBackend()
    program = {
        'prelude': ['import sympy as sp', 'def clean_and_simplify(v):\n    return v'],
        'cells': [
            {
                'key': 'k',
                'defs': [],
                'statements': [{'code': 'clean_and_simplify(sp.Integer(1) + 1)'}],
            }
        ],
    }
    rows = backend.calc_eval(json.dumps(program))
    assert rows[0]['ok'] is True
