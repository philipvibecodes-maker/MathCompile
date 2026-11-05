import { marked } from 'marked';
import { recipes } from './recipes.js';
import { validateAnnotations } from './schema.js';

const $ = id => document.getElementById(id);
const blank = () => ({ status: 'unreviewed', behavior: 'unspecified', observed: '', desired: '', notes: '' });
let catalog, documentData, selected, saveTimer, pending = false, saving = false;
const draftKey = 'mathcompile-bug-review-draft-v1';
const fields = ['status', 'behavior', 'observed', 'desired', 'notes'];
const statusLabels = { unreviewed: 'Unreviewed', reproduced: 'Reproduced', 'not-reproduced': 'Not reproduced', 'needs-decision': 'Needs decision', 'not-a-bug': 'Not a bug' };
const escape = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const renderer = new marked.Renderer();
renderer.html = ({ text }) => /^<br\s*\/?>$/i.test(text) ? '<br>' : escape(text);
const displaySave = (message, error = false) => { $('save-state').textContent = message; $('save-state').dataset.error = String(error); };
async function api(path, options) {
  const response = await fetch(`/__bug-review/${path}`, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? response.statusText);
  return result;
}
function changed() {
  pending = true;
  try { localStorage.setItem(draftKey, JSON.stringify(documentData)); }
  catch { displaySave('Browser backup unavailable; saving to file…', true); }
  displaySave('Unsaved changes…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 350);
}
async function save() {
  if (saving || !pending) return;
  saving = true;
  pending = false;
  const snapshot = JSON.stringify(documentData);
  displaySave('Saving…');
  try {
    await api('annotations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: snapshot });
    if (!pending) {
      localStorage.removeItem(draftKey);
      displaySave('Saved to annotations.json');
    }
  } catch (error) { pending = true; displaySave(`Save failed: ${error.message}. Export reviews to keep a copy.`, true); }
  finally { saving = false; }
  // A fresh edit during the request gets its own save. A failed request
  // stays visible and retries on the next edit or explicit export.
  if (pending && snapshot !== JSON.stringify(documentData)) await save();
}
function currentRecord() {
  return documentData.findings[selected.id] ??= blank();
}
function readSetup() {
  return {
    cells: [...$('cells').children].map(row => ({ kind: row.querySelector('select').value, latex: row.querySelector('textarea').value })),
    target: $('target').value,
    importAll: $('import-all').checked,
  };
}
function storeSetup() { currentRecord().setup = readSetup(); changed(); }
function addCell(cell = { kind: 'math', latex: '' }, persist = true) {
  const row = document.createElement('div'); row.className = 'cell-editor';
  const heading = document.createElement('div'); heading.className = 'cell-heading';
  const label = document.createElement('span'); label.textContent = 'Input cell';
  const kind = document.createElement('select'); kind.setAttribute('aria-label', 'Cell kind');
  for (const value of ['math', 'python']) { const option = document.createElement('option'); option.value = value; option.textContent = value; kind.append(option); }
  kind.value = cell.kind;
  const remove = document.createElement('button'); remove.textContent = 'Remove'; remove.onclick = () => { row.remove(); storeSetup(); };
  const source = document.createElement('textarea'); source.value = cell.latex; source.setAttribute('aria-label', 'Cell source');
  kind.onchange = storeSetup; source.oninput = storeSetup;
  heading.append(label, kind, remove); row.append(heading, source); $('cells').append(row);
  if (persist) storeSetup();
}
function filtered() {
  const query = $('search').value.toLowerCase();
  return catalog.findings.filter(f => (!$('area').value || f.area === $('area').value)
    && (!$('filter-status').value || (documentData.findings[f.id]?.status ?? 'unreviewed') === $('filter-status').value)
    && (!query || `${f.id} ${f.markdown}`.toLowerCase().includes(query)));
}
function renderList() {
  const list = filtered();
  const reviewed = Object.values(documentData.findings).filter(f => f.status !== 'unreviewed').length;
  $('progress').textContent = `${reviewed} / 127 reviewed · ${list.length} shown`;
  $('findings').replaceChildren();
  for (const finding of list) {
    const button = document.createElement('button');
    button.setAttribute('aria-current', String(finding.id === selected?.id));
    const title = document.createElement('span'); title.textContent = `${finding.id} · ${finding.title}`;
    const state = document.createElement('small'); state.textContent = `${finding.severity} · ${statusLabels[documentData.findings[finding.id]?.status ?? 'unreviewed']}`;
    button.append(title, state); button.onclick = () => select(finding.id); $('findings').append(button);
  }
}
function select(id) {
  selected = catalog.findings.find(f => f.id === id) ?? catalog.findings[0];
  history.replaceState(null, '', `#${selected.id}`);
  const record = documentData.findings[selected.id] ?? blank();
  const recipe = recipes[selected.id];
  const setup = record.setup ?? recipe ?? { cells: [] };
  $('title').textContent = `${selected.id} · ${selected.title}`;
  $('source').textContent = `${selected.severity} · ${selected.path}:${selected.line}`;
  $('recipe-note').textContent = recipe?.note ?? (recipe ? 'Representative worksheet setup. Follow the original finding below for additional actions, expected results, and validation limits.' : 'Manual reproduction. Follow the original finding below. Add cells yourself or choose input snippets; some findings require typing, browser configuration, pure-helper checks, or fault injection.');
  $('cells').replaceChildren();
  for (const cell of setup.cells ?? []) addCell(cell, false);
  $('target').value = setup.target ?? 'calculator'; $('import-all').checked = setup.importAll ?? true;
  fields.forEach(key => { $(key).value = record[key]; });
  $('capture-info').textContent = record.evidence ? `Captured ${record.evidence.at} · ${record.evidence.revision.slice(0, 8)} · ${record.evidence.target}` : 'No observation captured yet. Capture records the current worksheet, settings, visible app text, and code revision.';
  $('report').innerHTML = marked.parse(selected.markdown, { renderer });
  for (const link of $('report').querySelectorAll('a')) {
    const raw = link.getAttribute('href') ?? '';
    if (raw.startsWith('/workspace/')) { link.removeAttribute('href'); link.title = 'Historical artifact path; not present in this checkout'; }
    else if (!/^(https?:|#)/i.test(raw)) { link.removeAttribute('href'); }
    else { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  }
  $('snippets').replaceChildren();
  const snippets = new Map();
  marked.walkTokens(marked.lexer(selected.markdown), token => {
    if (token.type === 'codespan' && token.text.length < 2500) snippets.set(token.text, 'math');
    if (token.type === 'code' && token.text.length < 10000) snippets.set(token.text, token.lang === 'python' ? 'python' : 'math');
  });
  for (const [text, kind] of snippets) {
    const button = document.createElement('button'); button.textContent = `${kind}: ${text}`; button.onclick = () => addCell({ kind, latex: text }); $('snippets').append(button);
  }
  $('run-state').textContent = 'Loading inputs prepares the worksheet; follow the report’s actions to reproduce the finding.';
  renderList();
}
function appHook() {
  const hook = $('app').contentWindow?.__mc;
  if (!hook) throw new Error('App is still loading or unavailable. Wait for the worksheet, or restart the app.');
  return hook;
}
async function loadSetup() {
  const setup = readSetup();
  if (!setup.cells.length) { $('run-state').textContent = 'Add an input cell, or follow the manual reproduction instructions.'; return; }
  try {
    const { store, flushPendingCells } = appHook();
    store.paletteOpen = false; store.helpSearchOpen = false;
    store.target = 'latex'; store.importAll = setup.importAll; store.pairTuple = 'interval'; store.smartMode = true;
    store.importWorksheet(`${selected.id} review`, setup.cells.map((cell, index) => ({ id: index + 1, latex: cell.latex, ...(cell.kind === 'python' ? { kind: 'python' } : {}) })));
    store.target = setup.target;
    flushPendingCells();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    store.focusCell(store.cells[0].id);
    currentRecord().lastLoaded = { at: new Date().toISOString(), ...catalog.current, setup };
    changed();
    $('run-state').textContent = `Setup loaded for ${selected.id}. Complete the report’s actions, observe the result, then record your review. This does not mark the bug reproduced.`;
  } catch (error) { $('run-state').textContent = `Setup failed: ${error.message}`; }
}
function capture() {
  try {
    const { store } = appHook();
    const win = $('app').contentWindow;
    const evidence = {
      at: new Date().toISOString(), ...catalog.current,
      target: store.target, importAll: store.importAll, pairTuple: store.pairTuple,
      worksheet: store.worksheetSnapshot(),
      viewport: { width: win.innerWidth, height: win.innerHeight },
      visibleText: win.document.body.innerText.slice(0, 30000),
    };
    currentRecord().evidence = evidence; changed();
    $('capture-info').textContent = `Captured ${evidence.at} · ${evidence.revision.slice(0, 8)} · ${evidence.target}. Saved with the review; your verdict remains unchanged.`;
  } catch (error) { $('capture-info').textContent = `Capture failed: ${error.message}`; }
}
function navigate(offset, unreviewed = false) {
  const list = filtered(); if (!list.length) return;
  const index = list.findIndex(f => f.id === selected.id);
  for (let n = 1; n <= list.length; n++) {
    const finding = list[((index + offset * n) % list.length + list.length) % list.length];
    if (!unreviewed || !documentData.findings[finding.id] || documentData.findings[finding.id].status === 'unreviewed') { select(finding.id); return; }
  }
  $('run-state').textContent = 'No unreviewed findings in the current filters.';
}
function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function start() {
  [catalog, documentData] = await Promise.all([api('catalog'), api('annotations')]);
  const ids = new Set(catalog.findings.map(f => f.id));
  validateAnnotations(documentData, ids);
  documentData.source ??= catalog.source;
  const backup = localStorage.getItem(draftKey);
  if (backup) {
    const recovered = validateAnnotations(JSON.parse(backup), ids);
    if (confirm('A browser draft from an unfinished save is available. Restore it over the saved review file?')) {
      documentData = recovered; changed();
    } else { localStorage.removeItem(draftKey); }
  }
  // The editor treats pointerless blur as Vimium Escape and reclaims focus.
  // Pointer events in the outer review document do not reach the iframe.
  // Forward only the outer focus-transfer signal; app-local key/focus behavior
  // remains intact for reproductions.
  const outerInteraction = () => {
    const win = $('app').contentWindow;
    win?.document.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true }));
  };
  document.addEventListener('pointerdown', outerInteraction, true);
  const connectFrame = () => {
    const win = $('app').contentWindow;
    win.addEventListener('blur', event => { if (event.target === win) outerInteraction(); });
  };
  $('app').addEventListener('load', connectFrame);
  connectFrame();
  $('provenance').textContent = `Reports: ${catalog.source.branch} · Reviewing: ${catalog.current.branch} @ ${catalog.current.revision.slice(0, 8)}`;
  for (const id of ['search', 'area', 'filter-status']) $(id).addEventListener('input', renderList);
  fields.forEach(key => $(key).addEventListener('input', () => {
    const record = currentRecord(); fields.forEach(field => record[field] = $(field).value); record.updatedAt = new Date().toISOString(); changed(); renderList();
  }));
  $('annotation').onsubmit = event => event.preventDefault();
  $('target').onchange = storeSetup; $('import-all').onchange = storeSetup;
  $('add-math').onclick = () => addCell(); $('add-python').onclick = () => addCell({ kind: 'python', latex: '' });
  $('load').onclick = loadSetup; $('capture').onclick = capture;
  $('restart').onclick = () => { $('app').contentWindow.location.reload(); $('run-state').textContent = 'App and worker restarted. The current review worksheet is retained; snapshot caches have been reset.'; };
  $('prev').onclick = () => navigate(-1); $('next').onclick = () => navigate(1); $('next-unreviewed').onclick = () => navigate(1, true);
  $('export').onclick = () => { download('mathcompile-bug-reviews.json', { ...documentData, source: catalog.source }); save(); };
  $('import-button').onclick = () => $('import').click();
  $('import').onchange = async () => {
    try {
      const file = $('import').files[0]; if (!file) return;
      const incoming = validateAnnotations(JSON.parse(await file.text()), ids);
      if (!confirm(`Merge ${Object.keys(incoming.findings).length} reviews? Imported entries replace matching IDs. Other reviews are kept.`)) return;
      Object.assign(documentData.findings, incoming.findings); changed(); select(selected.id);
    } catch (error) { displaySave(`Import failed: ${error.message}`, true); }
    finally { $('import').value = ''; }
  };
  window.addEventListener('beforeunload', event => { if (pending || saving) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('hashchange', () => select(location.hash.slice(1)));
  select(location.hash.slice(1));
  if (!pending) displaySave('Reviews loaded · changes save to file');
}
start().catch(error => { $('fatal').hidden = false; $('fatal').textContent = `Unable to start bug review: ${error.message}. Run npm run bugs and open the printed URL.`; displaySave('Review unavailable', true); });
