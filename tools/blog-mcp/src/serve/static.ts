import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// dist/serve/static.js -> dist -> package root ('/app' in the container,
// 'tools/blog-mcp' in local dev). public/ sits next to dist/, copied into
// the image directly (Dockerfile), not compiled by tsc.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC_DIR = path.join(packageRoot, 'public');

interface StaticFile {
  file: string;
  contentType: string;
}

/**
 * Explicit route -> file map, not a directory scan. A hand-rolled static
 * server over an arbitrary directory is a path-traversal footgun; this can
 * only ever serve exactly these entries, consistent with the allowlist
 * philosophy already used for the write-path check (src/domain/paths.ts).
 */
const STATIC_FILES: Record<string, StaticFile> = {
  '/': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/login': { file: 'login.html', contentType: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', contentType: 'text/css; charset=utf-8' }
};

export interface ResolvedStaticFile {
  body: Buffer;
  contentType: string;
}

export function resolveStaticFile(pathname: string): ResolvedStaticFile | undefined {
  const entry = STATIC_FILES[pathname];
  if (!entry) return undefined;
  const body = fs.readFileSync(path.join(PUBLIC_DIR, entry.file));
  return { body, contentType: entry.contentType };
}
