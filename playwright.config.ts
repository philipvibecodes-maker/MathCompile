import { defineConfig } from '@playwright/test';

// PW_PORT lets a worktree run the suite on its own dev server
// (PW_PORT=5574 npx playwright test) while the main checkout's :5573
// keeps serving — default behavior is unchanged.
const port = Number(process.env.PW_PORT ?? 5573);

// PW_PREVIEW=1 runs the suite against the production bundle (vite
// build + preview) instead of dev-server modules — closer to what
// ships, and the page boot drops to a handful of static files. The
// build bakes VITE_BRANCH_BADGE (keeps the badge test working) and
// VITE_E2E_HOOK (keeps window.__mc/resetApp working); vendor.spec.ts
// skips itself because the mocha page isn't part of dist/.
const preview = !!process.env.PW_PREVIEW;

export default defineConfig({
  testDir: 'e2e',
  // Most tests run <3s against a shared warm page — fail fast instead of
  // letting a stuck page spin for 30s. Engine-boot tests raise their own
  // ceiling with test.setTimeout; beforeAll boot gets 90s via sharedPage.
  timeout: 10_000,
  // 2 workers keeps Chromium + Pyodide memory off the swap ceiling on
  // this box; PW_WORKERS overrides it on a bigger machine.
  workers: Number(process.env.PW_WORKERS ?? 2),
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: preview
      ? `VITE_BRANCH_BADGE=1 VITE_E2E_HOOK=1 npm run build && npx vite preview --port ${port} --strictPort`
      : `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    timeout: 180_000, // preview mode builds first
    // Never reuse an existing preview server — it would serve a stale
    // dist/ and test yesterday's build without telling you.
    reuseExistingServer: !preview,
  },
});
