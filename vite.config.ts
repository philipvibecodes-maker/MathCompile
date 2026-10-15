import { execSync } from 'node:child_process';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Branch badge: the header shows the checked-out branch on dev-server
// and e2e runs. Production builds bake in '' so it can never render
// there; VITE_BRANCH_BADGE=1 opts a `vite build` in (test deployments).
const gitRef = (): string => {
  try {
    const stdio = ['ignore', 'pipe', 'ignore'] as const;
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      stdio: [...stdio],
    })
      .toString()
      .trim();
    if (branch && branch !== 'HEAD') return branch;
    // Detached HEAD — fall back to the short sha.
    return execSync('git rev-parse --short HEAD', { stdio: [...stdio] })
      .toString()
      .trim();
  } catch {
    return '';
  }
};

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  plugins: [svelte()],
  define: {
    __APP_BRANCH__: JSON.stringify(
      (command === 'serve' && !isPreview) || process.env.VITE_BRANCH_BADGE
        ? gitRef()
        : '',
    ),
  },
  // GitHub Pages serves the site at /<repo>/ — the deploy workflow passes
  // BASE_PATH=/MathCompile/. Unset for dev/preview so e2e (:5573) and the
  // perf battery (:4173) keep working at the root.
  base: process.env.BASE_PATH ?? '/',
  // Non-default port so sibling checkouts or other dev servers can run
  // alongside; playwright.config.ts targets the same port. strictPort
  // makes a collision fail loudly.
  server: { port: 5573, strictPort: true },
}));
