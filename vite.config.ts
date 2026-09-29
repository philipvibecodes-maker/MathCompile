import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // Dedicated port (not vite's 5173, nor the Solid worktree's 5273) so this
  // checkout can run alongside the other worktrees; playwright.config.ts
  // targets the same port.
  server: { port: 5373, strictPort: true },
});
