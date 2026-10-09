// Standalone build for the editor-engine benchmark: two entries, one per
// backend, so each page loads only its own engine and startup/byte
// metrics stay apples-to-apples.
//
//   npx vite build -c perf/editor/vite.config.ts
//   npx vite preview -c perf/editor/vite.config.ts --port 4573
//
// Driven by perf/editor/editor.spec.ts via playwright.editor-perf.config.ts.

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const dir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: dir,
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        mq: resolve(dir, 'mq.html'),
        ml: resolve(dir, 'ml.html'),
      },
    },
  },
});
