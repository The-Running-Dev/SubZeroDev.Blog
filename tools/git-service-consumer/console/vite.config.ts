import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// S37's build entry, consuming the base's published `@subzerodev-git/console`
// package via a sibling-checkout `file:` dependency (2026-08-24 decision log
// entry -- a narrower, separate call from the 2026-08-21 --build-context
// entry, which covers raw source copying, not an npm package dependency)
// rather than forking it. Same `outDir`/`manifest: true` shape the base's own
// `console/vite.config.ts` uses, so `console-integrity.ts`'s hash covers
// this workspace's own output.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    manifest: true,
  },
});
