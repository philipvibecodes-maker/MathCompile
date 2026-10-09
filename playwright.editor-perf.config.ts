// Editor-engine perf battery — MathQuill vs MathLive on the shared
// perf/editor/ bench harness. Same serial, production-only discipline as
// playwright.perf.config.ts.
//
//   npm run test:perf:editor                # build bench + run
//   PERF_BASE_URL=http://localhost:4573 \   # against an already-served
//     PERF_LABEL=x npm run test:perf:editor #   bench build
//   node perf/compare.mjs editor-bench      # table of both backends

import { defineConfig } from '@playwright/test';

const baseURL = process.env.PERF_BASE_URL ?? 'http://localhost:4573';

export default defineConfig({
  testDir: 'perf/editor',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results-editor-perf',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 300_000,
  use: { baseURL },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: process.env.PERF_BASE_URL
    ? undefined
    : {
        command:
          'npx vite build -c perf/editor/vite.config.ts && npx vite preview -c perf/editor/vite.config.ts --port 4573 --strictPort',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
