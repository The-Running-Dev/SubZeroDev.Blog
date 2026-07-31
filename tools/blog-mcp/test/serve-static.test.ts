import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveStaticFile } from '../src/serve/static.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'ui', 'dist');

/**
 * Unit-level coverage for src/serve/static.ts's rewrite from a fixed
 * route->file allowlist (the old vanilla UI) to serving the React admin
 * UI's Vite build directory -- see MILESTONES.md's Milestone 9 §2. The
 * traversal-rejection case here is the load-bearing one: it must exist
 * before this ships, not after.
 */
describe('serve/static: resolveStaticFile', () => {
  it('serves index.html for / with a no-cache directive', () => {
    const file = resolveStaticFile('/');
    expect(file).toBeDefined();
    expect(file?.contentType).toContain('text/html');
    expect(file?.cacheControl).toBe('no-cache');
    expect(file?.body.toString('utf8')).toBe(fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8'));
  });

  it('serves a real hashed asset referenced by index.html, long-cached and immutable', () => {
    const html = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8');
    const scriptSrc = /<script[^>]+src="([^"]+\.js)"/.exec(html)?.[1];
    expect(scriptSrc).toBeTruthy();

    const file = resolveStaticFile(scriptSrc as string);
    expect(file).toBeDefined();
    expect(file?.contentType).toContain('text/javascript');
    expect(file?.cacheControl).toBe('immutable');
  });

  it('falls back to index.html for a client-route path that is not a real file (React Router resolves it)', () => {
    const file = resolveStaticFile('/posts');
    expect(file).toBeDefined();
    expect(file?.contentType).toContain('text/html');
    expect(file?.cacheControl).toBe('no-cache');
  });

  it('falls back to index.html for /login (a route within the SPA, not a separate static entry)', () => {
    const file = resolveStaticFile('/login');
    expect(file).toBeDefined();
    expect(file?.contentType).toContain('text/html');
  });

  it('falls back to index.html for a nested, non-existent client route (e.g. /compose/some-slug)', () => {
    const file = resolveStaticFile('/compose/some-slug');
    expect(file).toBeDefined();
    expect(file?.contentType).toContain('text/html');
  });

  it('rejects a literal ../ traversal attempt outright, rather than falling back to the SPA shell', () => {
    expect(resolveStaticFile('/../../../../../../etc/passwd')).toBeUndefined();
  });

  it('rejects a percent-encoded traversal attempt (checked after decoding, not before)', () => {
    expect(resolveStaticFile('/..%2f..%2f..%2fetc%2fpasswd')).toBeUndefined();
    expect(resolveStaticFile('/%2e%2e/%2e%2e/etc/passwd')).toBeUndefined();
  });

  it('rejects a malformed percent-encoding, not a crash', () => {
    expect(resolveStaticFile('/abc%zz')).toBeUndefined();
  });

  it('rejects a path containing a NUL byte', () => {
    expect(resolveStaticFile('/assets/index.js\0.png')).toBeUndefined();
  });

  it('falls back to index.html rather than serving a directory as a file (e.g. /assets itself)', () => {
    const file = resolveStaticFile('/assets');
    expect(file).toBeDefined();
    expect(file?.contentType).toContain('text/html');
  });

  it('rejects a symlink inside dist that resolves outside it, rather than serving the real target', () => {
    const outside = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'blog-mcp-static-escape-'));
    const secretFile = path.join(outside, 'secret.txt');
    fs.writeFileSync(secretFile, 'outside dist');
    const linkPath = path.join(DIST_DIR, '__test-symlink-escape.txt');
    try {
      fs.symlinkSync(secretFile, linkPath, 'file');
    } catch {
      // Creating a symlink requires elevated privileges or Developer Mode on
      // Windows -- skip rather than fail the suite in that environment; CI
      // runs on Linux, where this reliably exercises the real protection.
      fs.rmSync(outside, { recursive: true, force: true });
      return;
    }
    try {
      expect(resolveStaticFile('/__test-symlink-escape.txt')).toBeUndefined();
    } finally {
      fs.rmSync(linkPath, { force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
