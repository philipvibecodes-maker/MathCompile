"""MathCompile desktop shell.

Serves the production bundle (npm run build -> dist/) over a local HTTP
server — ES-module bundles and web storage don't work off file://, so
the app needs a real http://127.0.0.1 origin. private_mode=False keeps
the webview profile on disk across launches and makes pywebview pin a
fixed port (42001): a stable origin means the worksheet localStorage and
site caches survive restarts.

The window gets a js_api CalcBackend. The calculator's default engine
stays the Pyodide wasm worker (fully vendored — the shell is offline);
only after the user accepts the disclaimer in the app does the frontend
call api.calc_eval, which runs the emitted program through PythonSafeEval
(an nsjail'd docker sandbox). The sandbox image build (minutes, first
time) therefore never starts unless the user opted in.
"""

import sys
from pathlib import Path

import webview

from calc_backend import CalcBackend

INDEX = Path(__file__).resolve().parent.parent / 'dist' / 'index.html'


def main() -> None:
    if not INDEX.exists():
        sys.exit(f'{INDEX} not found — run `npm run build` first')
    webview.create_window(
        'MathCompile',
        str(INDEX),
        width=1100,
        height=760,
        min_size=(640, 480),
        js_api=CalcBackend(),
    )
    webview.start(http_server=True, private_mode=False)


if __name__ == '__main__':
    main()
