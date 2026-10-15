import { defineConfig } from '@playwright/test';

// PW_PORT lets a worktree run the suite on its own dev server
// (PW_PORT=5574 npx playwright test) while the main checkout's :5573
// keeps serving — default behavior is unchanged.
const port = Number(process.env.PW_PORT ?? 5573);

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
  },
});
