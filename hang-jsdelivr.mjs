import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:29229');
const ctx = browser.contexts()[0];
let hung = 0;
await ctx.route(/cdn\.jsdelivr\.net/, (route) => {
  hung++;
  console.log('HANG:', route.request().url().slice(0, 100), 'total:', hung);
  return new Promise(() => {});
});
console.log('route armed');
setInterval(() => {}, 60000);
