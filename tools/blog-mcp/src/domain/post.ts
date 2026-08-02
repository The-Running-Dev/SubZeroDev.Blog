import type { AuthorEntry } from './authors.js';
import type { TagEntry } from './tags.js';

export function buildFilename(dateIso: string, slug: string): string {
  const day = dateIso.slice(0, 10);
  return `${day}-${slug}.md`;
}

/**
 * Unified shape a create/update tool should return, so every caller
 * (Compose, the watcher, a direct MCP client) can stage and explain exactly
 * what happened without independently guessing which files changed or
 * whether a default was silently substituted. Not yet returned by any
 * tool -- blog_create_post/blog_update_post currently each shape their own
 * ad hoc result object (see src/tools/authoring.ts); Milestone 11 Phase 2
 * onward migrates them to this.
 */
export interface PostWriteResult {
  path: string;
  previousPath?: string;
  changedPaths: string[];
  canonicalDate: string;
  authors: string[];
  tags: string[];
  createdAuthors: AuthorEntry[];
  createdTags: TagEntry[];
  defaultAuthorUsed: boolean;
  canonicalUrl: string;
}

export function canonicalUrl(canonicalBase: string, slug: string): string {
  return `${canonicalBase.replace(/\/$/, '')}/${slug}/`;
}

const LEADING_HEADING = /^#{1,6}[ \t]+.+(?:\r?\n)*/;
const BLANK_LINE = /\r?\n[ \t]*\r?\n/;

/**
 * Default insertion point when the caller doesn't supply `afterText`: after
 * the first paragraph (skipping a leading H1 heading, if any), not index 0.
 * Matches docs/docs/writing-posts.md's "keep the marker after the
 * introduction so the blog index shows a useful summary" -- an empty
 * `afterText` used to mean "insert before any content at all", producing a
 * blank excerpt on every post published through a caller that never passes
 * an explicit anchor (Compose's Publish flow, the watcher); see PR #49's
 * review finding on a post published exactly that way.
 */
function defaultTruncateIndex(body: string): number {
  let pos = 0;
  const headingMatch = LEADING_HEADING.exec(body);
  if (headingMatch) pos = headingMatch[0].length;

  const blank = BLANK_LINE.exec(body.slice(pos));
  return blank ? pos + blank.index : body.length;
}

/**
 * Inserts `<!-- truncate -->` after the first occurrence of `afterText` in
 * the body (or, if `afterText` is empty, after a sensible default anchor --
 * see defaultTruncateIndex), as its own block (blank line either side).
 * No-op if the marker is already present anywhere in the body -- validation
 * reports duplicates or a missing marker rather than this function silently
 * fixing either.
 */
export function insertTruncateMarker(body: string, afterText: string): string {
  if (body.includes('<!-- truncate -->')) return body;

  let insertAt: number;
  if (afterText) {
    const idx = body.indexOf(afterText);
    if (idx === -1) return body;
    insertAt = idx + afterText.length;
  } else {
    insertAt = defaultTruncateIndex(body);
  }

  const before = body.slice(0, insertAt).replace(/\s+$/, '');
  const after = body.slice(insertAt).replace(/^\s+/, '');
  return `${before}\n\n<!-- truncate -->\n\n${after}`;
}
