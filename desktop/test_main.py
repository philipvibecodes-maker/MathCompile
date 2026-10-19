"""Contract tests for the desktop shell's static serving.

desktop/main.py relies on pywebview's http_server mode serving the entry
file's *directory* as the site root — vite emits absolute /assets/* URLs,
so this has to hold. No GUI needed: webview.http.start_server is the same
server webview.start(http_server=True) runs.
"""

import urllib.error
import urllib.request
from pathlib import Path

import main
import pytest
from webview import http


def fetch(address: str, path: str) -> int:
    try:
        return urllib.request.urlopen(address + path, timeout=5).status
    except urllib.error.HTTPError as e:
        return e.code


@pytest.fixture
def served_dist(tmp_path: Path):
    dist = tmp_path / 'dist'
    (dist / 'assets').mkdir(parents=True)
    (dist / 'index.html').write_text('<html>mc</html>')
    (dist / 'assets' / 'app.js').write_text('x=1')
    (dist / 'pyodide').mkdir()
    (dist / 'pyodide' / 'pyodide.js').write_text('// engine')
    address, _, server = http.start_server(urls=[str(dist / 'index.html')])
    yield address
    server.running = False


def test_entry_served_at_its_relative_path(served_dist: str):
    assert fetch(served_dist, 'index.html') == 200


def test_absolute_vite_asset_paths_resolve(served_dist: str):
    assert fetch(served_dist, 'assets/app.js') == 200


def test_vendored_engine_files_served(served_dist: str):
    assert fetch(served_dist, 'pyodide/pyodide.js') == 200


def test_main_exits_without_build(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(main, 'INDEX', tmp_path / 'dist' / 'index.html')
    with pytest.raises(SystemExit, match='npm run build'):
        main.main()
