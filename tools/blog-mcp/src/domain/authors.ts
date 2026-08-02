import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Finding } from '../result.js';
import { escapeYamlScalar, titleCaseKey } from './yamlText.js';

export interface AuthorEntry {
  key: string;
  name: string;
  url: string;
  /** Docusaurus's authorsMapPath `image_url` field. Optional -- no real entry in docs/blog/authors.yml sets one today, and auto-creation never generates one (TODO-NEXT.md sec4.3: "no image unless explicitly supplied"). */
  imageUrl?: string;
}

/**
 * Input shape for a caller-supplied author definition, distinct from
 * AuthorEntry (the loaded/serialized shape): every field but `key` is
 * optional so a caller can supply just enough to disambiguate a new key,
 * with the rest generated deterministically at resolution time. Consumed by
 * resolveAuthors below and by blog_create_post/blog_update_post/
 * blog_add_author (Milestone 11 Phase 2).
 */
export interface AuthorDefinition {
  key: string;
  name?: string;
  url?: string;
  imageUrl?: string;
}

export function authorsYmlPath(repoRoot: string, blogDir: string): string {
  return path.join(repoRoot, blogDir, 'authors.yml');
}

/** Parses authors.yml content already in memory -- no filesystem access. Split out from loadAuthors so a caller with content from somewhere other than the working tree (e.g. `git show <ref>:<path>`) can reuse the exact same parsing rules. */
export function parseAuthorsYaml(raw: string): AuthorEntry[] {
  const parsed: unknown = parseYaml(raw);
  if (typeof parsed !== 'object' || parsed === null) return [];

  const entries: AuthorEntry[] = [];
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const record = value as Record<string, unknown>;
    entries.push({
      key,
      name: typeof record.name === 'string' ? record.name : '',
      url: typeof record.url === 'string' ? record.url : '',
      ...(typeof record.image_url === 'string' ? { imageUrl: record.image_url } : {})
    });
  }
  return entries;
}

export function loadAuthors(repoRoot: string, blogDir: string): AuthorEntry[] {
  const filePath = authorsYmlPath(repoRoot, blogDir);
  if (!fs.existsSync(filePath)) return [];
  return parseAuthorsYaml(fs.readFileSync(filePath, 'utf8'));
}

/** Lowercase kebab-case, same shape blog_add_tag's key input already enforces (authoring.ts) -- author keys follow the same convention. */
export const AUTHOR_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Appends a new author entry in the same blank-line-separated shape appendTagEntry (tags.ts) uses for docs/blog/tags.yml. */
export function appendAuthorEntry(content: string, entry: AuthorEntry): string {
  const trimmed = content.replace(/\s+$/, '');
  const block = [
    `${entry.key}:`,
    `  name: ${escapeYamlScalar(entry.name)}`,
    `  url: ${entry.url}`,
    ...(entry.imageUrl ? [`  image_url: ${entry.imageUrl}`] : [])
  ].join('\n');
  return `${trimmed}\n\n${block}\n`;
}

// Same shape as tags.ts's KEY_LINE, deliberately line-based rather than
// checking Object.keys(parseYaml(content)): a YAML mapping with a genuinely
// duplicate key parses to a JS object that has already silently collapsed
// to one entry (last write wins), so the only way to actually catch the
// duplicate is to scan the raw lines before that collapse happens.
const AUTHOR_KEY_LINE = /^([a-z0-9][a-z0-9-]*):\s*(?:#.*)?$/;

/**
 * Structural integrity check for a candidate docs/blog/authors.yml: unique
 * keys, every key has a non-empty name. Unlike checkTagsYmlIntegrity (tags.ts),
 * this does NOT mirror a CI script -- no repository-owned check currently
 * reads authors.yml at all, so there is no external contract to stay in sync
 * with. This is purely Blog-Bot's own sanity check on a candidate write.
 */
export function checkAuthorsYmlIntegrity(content: string, relativePath: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split(/\r?\n/);

  const keys: string[] = [];
  for (const line of lines) {
    const match = AUTHOR_KEY_LINE.exec(line);
    if (match?.[1]) keys.push(match[1]);
  }

  if (keys.length === 0) {
    return [{ path: relativePath, severity: 'error', rule: 'AuthorsYmlIntegrity', message: 'No author keys were found.' }];
  }

  const seenKeys = new Set<string>();
  for (const key of keys) {
    if (seenKeys.has(key)) {
      findings.push({ path: relativePath, severity: 'error', rule: 'AuthorsYmlIntegrity', message: `Duplicate blog author key: '${key}'.` });
    }
    seenKeys.add(key);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    findings.push({ path: relativePath, severity: 'error', rule: 'AuthorsYmlIntegrity', message: `Could not parse as YAML: ${message}` });
    return findings;
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const record = parsed as Record<string, unknown>;
    for (const key of seenKeys) {
      const value = record[key];
      const entry = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
      if (typeof entry.name !== 'string' || entry.name.trim() === '') {
        findings.push({ path: relativePath, severity: 'error', rule: 'AuthorsYmlIntegrity', message: `Author '${key}' is missing a non-empty 'name'.` });
      }
    }
  }

  return findings;
}

export interface ResolveAuthorsSuccess {
  ok: true;
  authors: string[];
  created: AuthorEntry[];
  defaultAuthorUsed: boolean;
}

export interface ResolveAuthorsFailure {
  ok: false;
  reason: string;
}

export type ResolveAuthorsResult = ResolveAuthorsSuccess | ResolveAuthorsFailure;

/**
 * Pure resolution of a create/update call's requested authors against the
 * currently-loaded authors.yml -- no filesystem access. TODO-NEXT.md sec4.3:
 * a supplied key is authoritative and gets created if missing; an omitted
 * `requested` (not present at all -- the shape Compose's UI sends today)
 * falls back to `defaults.authorId` (reported via defaultAuthorUsed so the
 * fallback is never silent). An explicitly-supplied empty array is left
 * alone rather than silently defaulted -- validatePost's existing 'Authors'
 * rule ("must be a non-empty list") still catches that, matching the
 * pre-Phase-2 nullish-coalescing behavior (`args.authors ?? [default]`) for
 * that corner, which is unrelated to the bug this resolver fixes. A
 * definition may only be supplied for a key present in the (post-fallback)
 * requested list; an existing entry is reused as-is, and a definition that
 * disagrees with it on any explicitly-supplied field is a conflict, not an
 * implicit overwrite.
 */
export function resolveAuthors(
  existing: AuthorEntry[],
  requested: string[] | undefined,
  definitions: AuthorDefinition[] | undefined,
  defaults: { authorId: string; canonicalUrl: string }
): ResolveAuthorsResult {
  const defaultAuthorUsed = requested === undefined;
  const source = defaultAuthorUsed ? [defaults.authorId] : requested;

  const orderedKeys: string[] = [];
  for (const key of source) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
  }

  for (const key of orderedKeys) {
    if (!AUTHOR_KEY_PATTERN.test(key)) {
      return { ok: false, reason: `Author key '${key}' must be lowercase kebab-case.` };
    }
  }

  const definitionByKey = new Map((definitions ?? []).map((d) => [d.key, d]));
  for (const key of definitionByKey.keys()) {
    if (!orderedKeys.includes(key)) {
      return { ok: false, reason: `An author definition was supplied for '${key}', which is not in the requested authors.` };
    }
  }

  const existingByKey = new Map(existing.map((a) => [a.key, a]));
  const created: AuthorEntry[] = [];

  for (const key of orderedKeys) {
    const current = existingByKey.get(key);
    const definition = definitionByKey.get(key);

    if (current) {
      if (definition?.name !== undefined && definition.name !== current.name) {
        return { ok: false, reason: `Author '${key}' already exists with name '${current.name}', which conflicts with the supplied name '${definition.name}'.` };
      }
      if (definition?.url !== undefined && definition.url !== current.url) {
        return { ok: false, reason: `Author '${key}' already exists with url '${current.url}', which conflicts with the supplied url '${definition.url}'.` };
      }
      if (definition?.imageUrl !== undefined && definition.imageUrl !== current.imageUrl) {
        return { ok: false, reason: `Author '${key}' already exists with a different image_url than supplied.` };
      }
      continue;
    }

    created.push({
      key,
      name: definition?.name ?? titleCaseKey(key),
      url: definition?.url ?? defaults.canonicalUrl,
      ...(definition?.imageUrl ? { imageUrl: definition.imageUrl } : {})
    });
  }

  return { ok: true, authors: orderedKeys, created, defaultAuthorUsed };
}
