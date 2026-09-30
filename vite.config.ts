import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // Dedicated port (not vite's 5173, nor the other worktrees' 5273/5373) so
  // this checkout can run alongside them; playwright.config.ts targets the
  // same port. strictPort makes a collision fail loudly.
  server: { port: 5573, strictPort: true },
});
