import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
await p.goto('http://localhost:5576/e2e/spike.html');
await p.waitForFunction(() => window.spike);
const r = await p.evaluate(() => {
  const mq = window.spike.adapter.mq ?? window.spike.mq;
  mq.latex('\\begin{matrix}&a\\\\&b\\end{matrix}');
  mq.moveToLeftEnd();
  const cur = mq.__controller.cursor;
  const name = (n) => (n ? n.constructor.name : null);
  const info = { parent: name(cur.parent) };
  mq.keystroke('Backspace');
  return { info, after: mq.latex() };
});
console.log(JSON.stringify(r));
await b.close();
