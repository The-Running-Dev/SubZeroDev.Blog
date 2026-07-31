import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// dist/serve/static.js -> dist -> package root ('/app' in the container,
// 'tools/blog-mcp' in local dev). ui/dist/ is the React admin UI's Vite
// build output -- see tools/blog-mcp/ui/README.md. Built by `npm run
// build:ui` locally, or the Dockerfile's `ui-build` stage in the image;
// this module never builds it itself.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST_DIR = path.resolve(packageRoot, 'ui', 'dist');
const DIST_DIR_WITH_SEP = DIST_DIR.endsWith(path.sep) ? DIST_DIR : `${DIST_DIR}${path.sep}`;
const INDEX_HTML = path.join(DIST_DIR, 'index.html');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function mimeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export interface ResolvedStaticFile {
  body: Buffer;
  contentType: string;
  /** 'immutable' for hashed build assets (safe to cache forever -- a new deploy gets a new filename); 'no-cache' for index.html itself (served both directly and via the SPA fallback below), so a redeployed hash always gets picked up on next load. */
  cacheControl: 'immutable' | 'no-cache';
}

/**
 * Resolves `pathname` to an absolute path strictly inside DIST_DIR, or
 * `undefined` if it doesn't (a `../` traversal attempt, or a malformed
 * percent-encoding). The comparison is on the *resolved* absolute path, not
 * the raw request string -- checking containment before resolving `..`
 * segments is the classic traversal bypass this exists to avoid.
 */
function resolveWithinDist(pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0')) return undefined;

  const relative = decoded.replace(/^\/+/, '');
  const resolved = path.resolve(DIST_DIR, relative);
  if (resolved === DIST_DIR || resolved.startsWith(DIST_DIR_WITH_SEP)) return resolved;
  return undefined;
}

function readIndexHtml(): ResolvedStaticFile {
  return { body: fs.readFileSync(INDEX_HTML), contentType: MIME_TYPES['.html'] as string, cacheControl: 'no-cache' };
}

// Cached lazily (not at module load, when a fresh checkout may not have run
// `npm run build:ui` yet) and only once it succeeds -- DIST_DIR doesn't move
// for the life of the process once the build output exists.
let distDirRealCache: string | undefined;
function distDirReal(): string | undefined {
  if (distDirRealCache === undefined) {
    try {
      distDirRealCache = fs.realpathSync(DIST_DIR);
    } catch {
      return undefined;
    }
  }
  return distDirRealCache;
}

/**
 * `resolveWithinDist` only checks *lexical* containment of the requested
 * path. If something inside ui/dist/ is a symlink pointing outside it (not
 * something Vite's own build produces, but defense-in-depth against a
 * tampered or unexpected build output), the lexical check alone would still
 * pass and the target file would get read. This resolves both sides through
 * the filesystem (following symlinks) and checks containment again on the
 * real paths.
 */
function isWithinRealDist(resolved: string): boolean {
  const realDist = distDirReal();
  if (realDist === undefined) return false;
  let real: string;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    return false;
  }
  const realDistWithSep = realDist.endsWith(path.sep) ? realDist : `${realDist}${path.sep}`;
  return real === realDist || real.startsWith(realDistWithSep);
}

/**
 * Serves the React admin UI's Vite build. Three outcomes:
 * - a real file strictly inside ui/dist/ -> served as-is, long-lived cache
 *   (Vite's own hashed filenames make that safe -- a redeploy changes the
 *   name, never the content behind an existing one);
 * - a path that resolves inside ui/dist/ but isn't a real file (a client
 *   route like `/posts` or `/compose/some-slug`, or `/login`, none of which
 *   exist as files) -> index.html, no-cache, so React Router can render the
 *   right view client-side, including on a hard refresh;
 * - a path that does NOT resolve inside ui/dist/ (a traversal attempt) ->
 *   `undefined`, which the caller turns into a 404 -- deliberately NOT the
 *   SPA fallback, so a traversal attempt gets an explicit rejection rather
 *   than silently falling through to "looks like a valid unmatched route".
 */
export function resolveStaticFile(pathname: string): ResolvedStaticFile | undefined {
  const resolved = resolveWithinDist(pathname);
  if (resolved === undefined) return undefined;

  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    if (resolved === INDEX_HTML) return readIndexHtml();
    if (!isWithinRealDist(resolved)) return undefined;
    return { body: fs.readFileSync(resolved), contentType: mimeFor(resolved), cacheControl: 'immutable' };
  }

  return readIndexHtml();
}
