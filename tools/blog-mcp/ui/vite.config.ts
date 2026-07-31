import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run dev` proxies API calls to a real `serve`-mode backend
    // (`npm run start:serve` in the package root) instead of Vite's own
    // dev server -- there's no mock backend, this app always talks to the
    // real thing, just via a different port during development.
    proxy: {
      '/api': 'http://127.0.0.1:8765',
      '/mcp': 'http://127.0.0.1:8765',
      '/healthz': 'http://127.0.0.1:8765',
      '/login': 'http://127.0.0.1:8765',
      '/logout': 'http://127.0.0.1:8765'
    }
  },
  build: {
    // Default hashed filenames (assets/index-<hash>.js/css) are kept
    // deliberately -- src/serve/static.ts (Milestone 9 §2) serves this
    // directory through a scoped, traversal-safe file server rather than
    // the old fixed route->file allowlist, specifically so these hashed
    // names can get long-lived immutable Cache-Control.
    outDir: 'dist'
  }
})
