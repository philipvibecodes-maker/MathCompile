import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:5573/e2e/spike.html');
await p.waitForFunction(() => window.spike);
const r = await p.evaluate(() => {
  const { adapter } = window.spike;
  const events = [];
  adapter.addEventListener('delete-out', (e) => events.push(e.detail.direction));
  adapter.value = '';
  const mq = adapter._mq;
  mq.keystroke('Backspace');
  mq.keystroke('Delete');
  adapter.value = '\\displaylines{ }';
  mq.moveToRightEnd();
  mq.keystroke('Backspace');
  // non-empty field at start
  adapter.value = 'x';
  mq.moveToLeftEnd();
  mq.keystroke('Backspace');
  return { events, final: adapter.value };
});
console.log(JSON.stringify(r));
await b.close();
