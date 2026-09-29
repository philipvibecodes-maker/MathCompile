import solid from 'vite-plugin-solid'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [solid()],
  // Dedicated port so this checkout can run alongside the other worktrees'
  // dev servers (5173 main, 5273 solid-mathlive, 5373 svelte);
  // playwright.config.ts targets the same port.
  server: { port: 5473, strictPort: true },
})
