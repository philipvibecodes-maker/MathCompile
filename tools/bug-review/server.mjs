import { createServer } from 'vite';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { readCatalog, SOURCE, validateAnnotations } from './catalog.mjs';

const root = new URL('../../', import.meta.url);
const findings = await readCatalog(root);
const ids = new Set(findings.map(f => f.id));
const annotations = process.env.BUG_REVIEW_FILE
  ? pathToFileURL(resolve(process.env.BUG_REVIEW_FILE))
  : new URL('reports/bug-hunt/annotations.json', root);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim();
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim();
let saveQueue = Promise.resolve();
const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: process.env.BUG_REVIEW_HOST ?? '0.0.0.0', port: Number(process.env.BUG_REVIEW_PORT ?? 5574), strictPort: true, open: false },
  plugins: [{ name: 'local-bug-review', configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (req.method === 'GET' && (req.url === '/' || req.url?.startsWith('/?'))) {
        res.writeHead(302, { Location: '/tools/bug-review/' });
        return res.end();
      }
      next();
    });
    vite.middlewares.use('/__bug-review', async (req, res) => {
      try {
        if (req.method === 'GET' && req.url === '/catalog') return send(res, 200, { findings, source: SOURCE, current: { revision, branch } });
        if (req.url !== '/annotations') return send(res, 404, { error: 'Unknown review endpoint' });
        if (req.method === 'GET') {
          await saveQueue;
          try { return send(res, 200, JSON.parse(await readFile(annotations, 'utf8'))); }
          catch (error) { if (error.code !== 'ENOENT') throw error; return send(res, 200, { version: 1, findings: {} }); }
        }
        if (req.method !== 'PUT') return send(res, 405, { error: 'Method not allowed' });
        if (req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'Same-origin requests required' });
        if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'JSON required' });
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 4_000_000) return send(res, 413, { error: 'Annotation document too large' });
        }
        const data = validateAnnotations(JSON.parse(body), ids);
        const save = saveQueue.then(async () => {
          await mkdir(dirname(fileURLToPath(annotations)), { recursive: true });
          const temporary = pathToFileURL(fileURLToPath(annotations) + '.tmp');
          await writeFile(temporary, JSON.stringify(data, null, 2) + '\n');
          await rename(temporary, annotations);
        });
        saveQueue = save.catch(() => {});
        await save;
        return send(res, 200, { saved: true });
      } catch (error) { send(res, 400, { error: error.message }); }
    });
  } }],
});
await server.listen();
console.log(`Bug review: http://localhost:${server.config.server.port}/tools/bug-review/`);
server.printUrls();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await saveQueue; await server.close(); process.exit(0); });
