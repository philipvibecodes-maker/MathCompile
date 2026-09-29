import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['e2e/**', 'perf/**', 'node_modules/**', 'dist/**'],
  },
});
