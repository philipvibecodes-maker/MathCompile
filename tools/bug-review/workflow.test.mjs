import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from '@playwright/test';

// A separate port and temporary review file keep tests away from real annotations.
test('review workflow loads mixed worksheets, captures observations, saves and reopens decisions', {timeout:120000}, async t => {
  const folder = await mkdtemp(join(tmpdir(),'mc-bug-review-'));
  const file = join(folder,'reviews.json');
  const port = Number(process.env.BUG_REVIEW_TEST_PORT ?? 5575);
  const base = `http://localhost:${port}`;
  const server = spawn(process.execPath,['tools/bug-review/server.mjs'], {cwd:new URL('../../',import.meta.url),env:{...process.env,BUG_REVIEW_PORT:String(port),BUG_REVIEW_FILE:file,BUG_REVIEW_HOST:'0.0.0.0'},stdio:['ignore','pipe','pipe']});
  let logs = ''; server.stdout.on('data',chunk=>logs+=chunk); server.stderr.on('data',chunk=>logs+=chunk);
  let browser;
  t.after(async()=>{if(browser)await browser.close(); const closed=once(server,'exit');server.kill('SIGTERM');await closed;await rm(folder,{recursive:true,force:true});});
  for (let n=0;n<200;n++) {
    try {if((await fetch(`${base}/__bug-review/catalog`)).ok)break;}catch{}
    if(server.exitCode!==null)throw new Error(logs);
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const catalog = await (await fetch(`${base}/__bug-review/catalog`)).json();
  assert.equal(catalog.findings.length,124);
  assert.ok(['CG-02','CG-16','CG-21'].every(id => !catalog.findings.some(f => f.id === id)));
  const landing = await fetch(base, { redirect: 'manual' });
  assert.equal(landing.status, 302);
  assert.equal(landing.headers.get('location'), '/tools/bug-review/');
  // Shared browsers reach the executor through its network interface, not its loopback.
  const address = Object.values(networkInterfaces()).flat().find(a => a && !a.internal && a.family === 'IPv4')?.address;
  if (address) {
    const response = await fetch(`http://${address}:${port}/tools/bug-review/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /MathCompile · Bug review/);
  }
  const invalid = await fetch(`${base}/__bug-review/annotations`,{method:'PUT',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:'{}'});
  assert.equal(invalid.status,403);
  browser = await chromium.launch({...(process.env.BUG_REVIEW_CHROMIUM ? {executablePath:process.env.BUG_REVIEW_CHROMIUM}:{}),headless:true});
  const page = await browser.newPage({viewport:{width:1700,height:1000}});
  // A browser draft from the previous 127-finding catalog must not make the
  // review page fatal after fixed findings are retired.
  await page.goto(`${base}/tools/bug-review/style.css`);
  await page.evaluate(() => localStorage.setItem('mathcompile-bug-review-draft-v1', JSON.stringify({
    version: 1,
    findings: {
      'CG-02': {status:'reproduced',behavior:'unspecified',observed:'old',desired:'',notes:''},
    },
  })));
  page.once('dialog', dialog => dialog.accept());
  await page.goto(`${base}/tools/bug-review/#CG-06`);
  await page.locator('#title').filter({hasText:'CG-06'}).waitFor();
  await page.locator('#fatal').waitFor({state:'hidden'});
  await page.frameLocator('#app').locator('math-field').first().waitFor({timeout:60000});
  await page.locator('#target').selectOption('python');
  await page.locator('#load').click();
  await page.locator('#run-state').filter({hasText:'Setup loaded for CG-06'}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#app').contentWindow.__mc.store.cells[0].latex==='1-(2+2)');
  // Verify the generated output is reachable without pinning the historical bug.
  // A later product fix must not break the review-workflow test.
  await page.frameLocator('#app').locator('.cell-python').first().waitFor();
  const generated = await page.frameLocator('#app').locator('.cell-python').first().innerText();
  assert.ok(generated.trim().length > 0);
  await page.locator('#capture').click();
  assert.equal(await page.locator('#status').inputValue(),'unreviewed');
  await page.locator('#observed').fill('Subtraction loses parentheses.');
  await page.locator('#desired').fill('1-(2+2) must evaluate to -3.');
  await page.locator('#behavior').selectOption('describe');
  await page.locator('#status').selectOption('reproduced');
  await page.locator('#save-state').filter({hasText:'Saved to annotations.json'}).waitFor();
  let saved = JSON.parse(await readFile(file,'utf8'));
  assert.equal(saved.findings['CG-06'].evidence.worksheet.cells[0].latex,'1-(2+2)');
  assert.equal(saved.findings['CG-06'].status,'reproduced');
  assert.equal(saved.findings['CG-06'].evidence.revision,catalog.current.revision);
  assert.equal(saved.findings['CG-06'].desired,'1-(2+2) must evaluate to -3.');
  await page.reload();
  await page.locator('#desired').filter({visible:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#desired').value==='1-(2+2) must evaluate to -3.');
  await page.frameLocator('#app').locator('math-field').first().waitFor();
  await page.locator('#search').click();
  await page.locator('#search').fill('CG-11');
  await page.locator('#findings button').filter({hasText:'CG-11 ·'}).click();
  await page.locator('#target').selectOption('latex');
  await page.locator('#load').click();
  await page.locator('#run-state').filter({hasText:'Setup loaded for CG-11'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>document.querySelector('#app').contentWindow.__mc.store.cells.map(c=>({kind:c.kind,latex:c.latex}))),[{kind:'python',latex:'a=2'},{kind:'math',latex:'a+1'}]);
  // Invalid import must leave the saved decisions untouched.
  await page.locator('#import').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"findings":{"FAKE":{}}}')});
  await page.locator('#save-state').filter({hasText:'Import failed'}).waitFor();
  saved = JSON.parse(await readFile(file,'utf8'));
  assert.equal(saved.findings['CG-06'].desired,'1-(2+2) must evaluate to -3.');
  await page.screenshot({path:join(folder,'review.png')});
});
