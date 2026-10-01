import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // GitHub Pages serves the site at /<repo>/ — the deploy workflow passes
  // BASE_PATH=/MathCompile/. Unset for dev/preview so e2e (:5573) and the
  // perf battery (:4173) keep working at the root.
  base: process.env.BASE_PATH ?? '/',
  // Non-default port so sibling checkouts or other dev servers can run
  // alongside; playwright.config.ts targets the same port. strictPort
  // makes a collision fail loudly.
  server: { port: 5573, strictPort: true },
});
