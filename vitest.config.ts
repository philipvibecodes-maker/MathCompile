import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// The svelte plugin lets vitest compile `*.svelte.ts` rune modules
// (src/state/store.svelte.ts) in the node test environment.
export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'node',
    exclude: ['e2e/**', 'perf/**', 'node_modules/**', 'dist/**', 'vendor/**'],
  },
});
