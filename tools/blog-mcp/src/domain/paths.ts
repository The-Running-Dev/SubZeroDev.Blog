import fs from 'node:fs';
import path from 'node:path';

/**
 * Directories/files a write tool (create/update post, add tag, add hub
 * entry, stage) is allowed to touch, relative to the repo root, by default.
 * This is the single safety boundary reused by every write tool -- nothing
 * outside it can be written or staged, no matter what a caller asks for.
 *
 * Callers with a narrower per-consumer profile (the cron scheduler, a later
 * phase) pass their own list into checkAllowedPath(s) instead of this
 * default -- e.g. dropping `.github/workflows/`, `.config/`, `tools/`, and
 * `build/` for an unattended actor that should only ever touch post content.
 */
export const DEFAULT_ALLOWED_PREFIXES = [
  'docs/blog/',
  'docs/src/',
  'docs/docs/',
  '.agents/',
  '.config/',
  '.github/workflows/',
  'build/',
  'tools/'
];

const ALLOWED_EXACT = ['docs/docusaurus.config.ts', 'docs/sidebar.ts'];

const REJECTED_LITERALS = new Set(['-A', '--all', '.', ':/']);

export interface PathCheckResult {
  ok: boolean;
  reason?: string;
}

export interface PathCheckOptions {
  allowMissing?: boolean;
}

/**
 * Validates a single repo-relative path against the write/staging allowlist.
 * Rejects traversal, absolute paths, drive letters, shell-meaningful
 * literals (the `-A` / `.` class that would silently widen a `git add`),
 * and anything outside the allowed prefixes. Write callers require the path
 * to exist by default; deletion-aware staging may opt out of that final check
 * and separately prove a missing path is tracked.
 */
export function checkAllowedPath(
  repoRoot: string,
  relativePath: string,
  allowedPrefixes: string[] = DEFAULT_ALLOWED_PREFIXES,
  options: PathCheckOptions = {}
): PathCheckResult {
  if (REJECTED_LITERALS.has(relativePath)) {
    return { ok: false, reason: `'${relativePath}' is not an allowed path; pass explicit file paths, not a wildcard.` };
  }
  if (relativePath.includes('..')) {
    return { ok: false, reason: `'${relativePath}' contains '..'; path traversal is not allowed.` };
  }
  if (relativePath.includes(';')) {
    return { ok: false, reason: `'${relativePath}' contains ';'; rejected on principle.` };
  }
  if (path.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) {
    return { ok: false, reason: `'${relativePath}' is an absolute path; only repo-relative paths are allowed.` };
  }

  const normalized = relativePath.replace(/\\/g, '/');

  const isAllowedPrefix = allowedPrefixes.some((prefix) => normalized.startsWith(prefix));
  const isAllowedExact = ALLOWED_EXACT.includes(normalized);
  const isRootMarkdown = /^[^/]+\.md$/.test(normalized);
  if (!isAllowedPrefix && !isAllowedExact && !isRootMarkdown) {
    return { ok: false, reason: `'${relativePath}' is outside the allowed publishing paths.` };
  }

  if (normalized.includes('node_modules/') || normalized.includes('/dist/') || normalized.startsWith('dist/')) {
    return { ok: false, reason: `'${relativePath}' is inside a build/dependency directory.` };
  }

  const fullPath = path.join(repoRoot, normalized);
  if (!options.allowMissing && !fs.existsSync(fullPath)) {
    return { ok: false, reason: `'${relativePath}' does not exist.` };
  }

  return { ok: true };
}

export function checkAllowedPaths(
  repoRoot: string,
  relativePaths: string[],
  allowedPrefixes: string[] = DEFAULT_ALLOWED_PREFIXES,
  options: PathCheckOptions = {}
): PathCheckResult {
  for (const p of relativePaths) {
    const result = checkAllowedPath(repoRoot, p, allowedPrefixes, options);
    if (!result.ok) return result;
  }
  return { ok: true };
}
