import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5573/');
const out = await page.evaluate(async () => {
  const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.mjs');
  const py = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/' });
  await py.loadPackage(['sympy', 'micropip']);
  await py.runPythonAsync(
    "import micropip\nawait micropip.install('antlr4-python3-runtime==4.11.1')",
  );
  return py.runPythonAsync(`
import json
from sympy.parsing.latex import parse_latex
import sympy as sp
from sympy.printing.python import python as pycode
res = {}
for name, src in [
  ('raw_dbl', '1+1 \\\\\\\\ 2+3'),
  ('comma', '1+1, 2+3'),
  ('displaylines', '\\\\displaylines{1+1 \\\\\\\\ 2+3}'),
  ('aligned', '\\\\begin{aligned} a &= b \\\\\\\\ c &= d \\\\end{aligned}'),
]:
    try:
        e = parse_latex(src)
        res[name] = {'ok': True, 'type': type(e).__name__, 'sstr': sp.sstr(e)}
        try: res[name]['latex'] = sp.latex(e)
        except Exception as x: res[name]['latex'] = 'ERR '+str(x)
        try: res[name]['simp'] = sp.sstr(sp.simplify(e))
        except Exception as x: res[name]['simp'] = 'ERR '+str(x)
        try: res[name]['doit'] = sp.sstr(e.doit())
        except Exception as x: res[name]['doit'] = 'ERR '+str(x)
        try: res[name]['code'] = pycode(e)
        except Exception as x: res[name]['code'] = 'ERR '+str(x)
    except Exception as x:
        res[name] = {'ok': False, 'error': str(x)[:200]}
json.dumps(res)`);
});
console.log(JSON.stringify(JSON.parse(out), null, 1));
await browser.close();
