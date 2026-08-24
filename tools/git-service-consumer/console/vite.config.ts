import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// S37's build entry, consuming the base's published `@subzerodev-git/console`
// package via a sibling-checkout `file:` dependency (2026-08-21 decision,
// same convention `server.ts`'s relative imports already use) rather than
// forking it. Same `outDir`/`manifest: true` shape the base's own
// `console/vite.config.ts` uses, so `console-integrity.ts`'s hash covers
// this workspace's own output.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    manifest: true,
  },
});
