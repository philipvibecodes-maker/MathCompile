import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCatalog, validateAnnotations } from './catalog.mjs';
import { recipes } from './recipes.js';
const root = new URL('../../', import.meta.url);

test('all 127 report sections retain full reproduction details and exact source lines', async () => {
  const catalog = await readCatalog(root);
  assert.deepEqual(Object.fromEntries(['UI','CG','RENDER','PLOT'].map(area => [area,catalog.filter(f=>f.area===area).length])), {UI:34,CG:39,RENDER:36,PLOT:18});
  assert.match(catalog.find(f=>f.id==='CG-06').markdown, /1-\(2\+2\)/);
  assert.match(catalog.find(f=>f.id==='CG-01').markdown, /Further CG-01/);
  assert.ok(!catalog.find(f=>f.id==='RENDER-05').markdown.includes('## Excluded observations'));
  assert.ok(catalog.every(f=>['high','medium','low'].includes(f.severity)));
  for (const id of Object.keys(recipes)) assert.ok(catalog.some(f=>f.id===id), id);
  for (const recipe of Object.values(recipes)) {
    for (const cell of recipe.cells) {
      assert.ok(['math','python'].includes(cell.kind)); assert.equal(typeof cell.latex,'string');
    }
  }
  assert.equal(recipes['CG-01'].cells.length,2);
  assert.match(recipes['CG-03'].cells[0].latex, /^\\displaylines\{/);
  assert.equal(recipes['CG-18'].target,'python');
  assert.equal(recipes['CG-27'].importAll,false);
  assert.equal(recipes['CG-07'].cells.length,0);
  assert.equal(recipes['PLOT-02'].cells.length,0);
});

test('import validation rejects malformed records and unknown report IDs', () => {
  const ids = new Set(['CG-06']);
  const record = {status:'needs-decision',behavior:'not-applicable',observed:'Observed',desired:'',notes:''};
  assert.equal(validateAnnotations({version:1,findings:{'CG-06':record}}, ids).findings['CG-06'].behavior,'not-applicable');
  for (const value of [null, {}, {version:1,findings:[]}, {version:1,findings:{'CG-99':record}}, {version:1,findings:{'CG-06':{...record,status:'fixed'}}}, {version:1,findings:{'CG-06':{...record,notes:null}}}, {version:1,findings:{'CG-06':{...record,setup:{cells:'invalid'}}}}, {version:1,findings:{'CG-06':{...record,evidence:{revision:4}}}}])
    assert.throws(()=>validateAnnotations(value,ids));
});
