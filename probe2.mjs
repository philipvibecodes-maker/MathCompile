import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5573/');
const out = await page.evaluate(async () => {
  const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.mjs');
  const py = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/' });
  await py.loadPackage(['sympy', 'micropip']);
  return py.runPythonAsync(`
import json
import sympy as sp
from sympy.printing.python import python as pycode
from sympy.parsing.latex import parse_latex
res = {}
t = sp.Tuple(sp.Integral(sp.Symbol('x'), sp.Symbol('x')), sp.Eq(sp.Symbol('a'), 2))
for k, fn in [('doit', lambda: t.doit()), ('simplify', lambda: sp.simplify(t)),
              ('latex', lambda: sp.latex(t.doit())), ('code', lambda: pycode(t.doit())),
              ('is_number', lambda: getattr(t, 'is_number', 'NA'))]:
    try: res[k] = sp.sstr(fn())
    except Exception as x: res[k] = 'ERR '+str(x)[:150]
json.dumps(res)`);
});
console.log(JSON.stringify(JSON.parse(out), null, 1));
await browser.close();
