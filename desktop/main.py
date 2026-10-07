"""MathCompile desktop shell.

Serves the production bundle (npm run build -> dist/) over a local HTTP
server — a real http://127.0.0.1 origin where the pyodide service worker
can register (file:// can't). private_mode=False keeps the webview
profile on disk across launches and makes pywebview pin a fixed port
(42001), so the origin stays stable and both the SW's cached SymPy
engine and the worksheet localStorage survive restarts.
"""

import sys
from pathlib import Path

import webview

INDEX = Path(__file__).resolve().parent.parent / 'dist' / 'index.html'


def main() -> None:
    if not INDEX.exists():
        sys.exit(f'{INDEX} not found — run `npm run build` first')
    webview.create_window(
        'MathCompile', str(INDEX), width=1100, height=760, min_size=(640, 480)
    )
    webview.start(http_server=True, private_mode=False)


if __name__ == '__main__':
    main()
