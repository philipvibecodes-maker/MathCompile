// Performance battery — complementary to the behavioral suite in e2e/.
//
//   npm run test:perf                        # this repo: builds + previews
//   PERF_BASE_URL=http://localhost:3000 \
//     PERF_LABEL=candidate npm run test:perf # another impl on any stack/port
//   node perf/compare.mjs main candidate     # diff two labeled runs
//
// Dev-mode numbers are meaningless (unoptimized code, JIT state) — the
// default webServer builds and serves the production bundle. Point
// PERF_BASE_URL at a production build of each implementation for comparable
// runs; PERF_LABEL names the results directory under perf-results/.

import { defineConfig } from '@playwright/test';

const baseURL = process.env.PERF_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: 'perf',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results-perf',
  // Timing runs are inherently noisy under parallel workers — keep it serial.
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
          'npm run build && npm run preview -- --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
