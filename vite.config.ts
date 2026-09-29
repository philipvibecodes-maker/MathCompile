import solid from 'vite-plugin-solid'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [solid()],
  // Dedicated port (not vite's 5173) so this checkout can run alongside the
  // main worktree's dev server; playwright.config.ts targets the same port.
  server: { port: 5273, strictPort: true },
})
