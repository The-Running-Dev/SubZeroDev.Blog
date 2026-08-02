import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Finding } from '../result.js';
import { escapeYamlScalar, titleCaseKey } from './yamlText.js';

export interface TagEntry {
  key: string;
  label: string;
  permalink: string;
  description: string;
}

/**
 * Input shape for a caller-supplied tag definition, distinct from TagEntry
 * (the loaded/serialized shape): every field but `key` is optional so a
 * caller can supply just enough to disambiguate a new key, with the rest
 * generated deterministically at resolution time. Not yet consumed
 * anywhere -- a future auto-creation resolver (Milestone 11 Phase 2)
 * accepts this as input, extracting the policy that currently lives inline
 * in blog_add_tag's handler (tools/authoring.ts) rather than writing it
 * from scratch -- appendTagEntry/checkTagsYmlIntegrity below already do the
 * serialization and validation that resolver will call.
 */
export interface TagDefinition {
  key: string;
  label?: string;
  permalink?: string;
  description?: string;
}

export function tagsYmlPath(repoRoot: string, blogDir: string): string {
  return path.join(repoRoot, blogDir, 'tags.yml');
}

/** Parses tags.yml content already in memory -- no filesystem access. Split out from loadTags so a caller with content from somewhere other than the working tree (e.g. `git show <ref>:<path>`) can reuse the exact same parsing rules. */
export function parseTagsYaml(raw: string): TagEntry[] {
  const parsed: unknown = parseYaml(raw);
  if (typeof parsed !== 'object' || parsed === null) return [];

  const entries: TagEntry[] = [];
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const record = value as Record<string, unknown>;
    entries.push({
      key,
      label: typeof record.label === 'string' ? record.label : '',
      permalink: typeof record.permalink === 'string' ? record.permalink : '',
      description: typeof record.description === 'string' ? record.description : ''
    });
  }
  return entries;
}

export function loadTags(repoRoot: string, blogDir: string): TagEntry[] {
  const filePath = tagsYmlPath(repoRoot, blogDir);
  if (!fs.existsSync(filePath)) return [];
  return parseTagsYaml(fs.readFileSync(filePath, 'utf8'));
}

// Exact regexes from build/Test-DocumentationArtifact.ps1 lines 63 and 70,
// translated 1:1 from PowerShell -cmatch (case-sensitive) semantics. A tag
// entry this pair cannot read is precisely the entry that would fail CI's
// key-count-equals-permalink-count assertion -- reproducing them here (not
// re-deriving equivalent-looking regexes) is what keeps this validator and
// CI structurally unable to disagree.
const KEY_LINE = /^([a-z0-9][a-z0-9-]*):\s*(?:#.*)?$/;
const PERMALINK_LINE = /^\s+permalink:\s+['"]?\/?([a-z0-9][a-z0-9-]*)['"]?\s*(?:#.*)?$/;

/**
 * Reimplements Test-DocumentationArtifact.ps1's tag integrity check without
 * needing a production build artifact: unique keys, unique permalinks, and
 * key count == permalink count (an entry the shared regex can't read fails
 * this rather than being silently skipped).
 */
export function checkTagsYmlIntegrity(content: string, relativePath: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split(/\r?\n/);

  const keys: string[] = [];
  const permalinks: string[] = [];
  for (const line of lines) {
    const keyMatch = KEY_LINE.exec(line);
    if (keyMatch?.[1]) keys.push(keyMatch[1]);
    const permalinkMatch = PERMALINK_LINE.exec(line);
    if (permalinkMatch?.[1]) permalinks.push(permalinkMatch[1]);
  }

  if (keys.length === 0) {
    findings.push({
      path: relativePath,
      severity: 'error',
      rule: 'TagsYmlIntegrity',
      message: 'No tag keys were found.'
    });
    return findings;
  }

  if (keys.length !== permalinks.length) {
    findings.push({
      path: relativePath,
      severity: 'error',
      rule: 'TagsYmlIntegrity',
      message: `Every tag must declare one simple permalink (found ${keys.length} key(s), ${permalinks.length} permalink(s)).`
    });
  }

  const seenKeys = new Set<string>();
  for (const key of keys) {
    if (seenKeys.has(key)) {
      findings.push({ path: relativePath, severity: 'error', rule: 'TagsYmlIntegrity', message: `Duplicate blog tag key: '${key}'.` });
    }
    seenKeys.add(key);
  }

  const seenPermalinks = new Set<string>();
  for (const permalink of permalinks) {
    if (seenPermalinks.has(permalink)) {
      findings.push({
        path: relativePath,
        severity: 'error',
        rule: 'TagsYmlIntegrity',
        message: `Duplicate blog tag permalink: '${permalink}'.`
      });
    }
    seenPermalinks.add(permalink);
  }

  return findings;
}

/** Appends a new tag entry in the exact blank-line-separated shape docs/blog/tags.yml already uses. */
export function appendTagEntry(content: string, entry: { key: string; label: string; permalink: string; description: string }): string {
  const trimmed = content.replace(/\s+$/, '');
  const block = [
    `${entry.key}:`,
    `  label: ${escapeYamlScalar(entry.label)}`,
    `  permalink: ${entry.permalink}`,
    `  description: ${escapeYamlScalar(entry.description)}`
  ].join('\n');
  return `${trimmed}\n\n${block}\n`;
}

/** Lowercase kebab-case -- the same pattern blog_add_tag's `key` input schema already enforces (authoring.ts). */
const TAG_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export interface ResolveTagsSuccess {
  ok: true;
  tags: string[];
  created: TagEntry[];
}

export interface ResolveTagsFailure {
  ok: false;
  reason: string;
}

export type ResolveTagsResult = ResolveTagsSuccess | ResolveTagsFailure;

/**
 * Pure resolution of a create/update call's requested tags against the
 * currently-loaded tags.yml -- no filesystem access. TODO-NEXT.md sec5.3:
 * requested keys are deduplicated while preserving first-occurrence order; a
 * definition may only be supplied for a key present in `requested`; an
 * existing tag is reused as-is, and a definition that disagrees with it on
 * any explicitly-supplied field is a conflict; a permalink collision (against
 * an existing tag or another tag created in this same call) fails the whole
 * operation.
 */
export function resolveTags(existing: TagEntry[], requested: string[], definitions?: TagDefinition[]): ResolveTagsResult {
  const orderedKeys: string[] = [];
  for (const key of requested) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
  }

  for (const key of orderedKeys) {
    if (!TAG_KEY_PATTERN.test(key)) {
      return { ok: false, reason: `Tag key '${key}' must be lowercase kebab-case.` };
    }
  }

  const definitionByKey = new Map((definitions ?? []).map((d) => [d.key, d]));
  for (const key of definitionByKey.keys()) {
    if (!orderedKeys.includes(key)) {
      return { ok: false, reason: `A tag definition was supplied for '${key}', which is not in the requested tags.` };
    }
  }

  const existingByKey = new Map(existing.map((t) => [t.key, t]));
  const usedPermalinks = new Set(existing.map((t) => t.permalink));
  const created: TagEntry[] = [];

  for (const key of orderedKeys) {
    const current = existingByKey.get(key);
    const definition = definitionByKey.get(key);

    if (current) {
      if (definition?.label !== undefined && definition.label !== current.label) {
        return { ok: false, reason: `Tag '${key}' already exists with label '${current.label}', which conflicts with the supplied label '${definition.label}'.` };
      }
      if (definition?.permalink !== undefined && definition.permalink !== current.permalink) {
        return { ok: false, reason: `Tag '${key}' already exists with permalink '${current.permalink}', which conflicts with the supplied permalink '${definition.permalink}'.` };
      }
      if (definition?.description !== undefined && definition.description !== current.description) {
        return { ok: false, reason: `Tag '${key}' already exists with a different description than supplied.` };
      }
      continue;
    }

    const label = definition?.label ?? titleCaseKey(key);
    const permalink = definition?.permalink ?? `/${key}`;
    const description = definition?.description ?? `Posts related to ${label}.`;

    if (usedPermalinks.has(permalink)) {
      return { ok: false, reason: `Permalink '${permalink}' for new tag '${key}' is already used by another tag.` };
    }
    usedPermalinks.add(permalink);

    created.push({ key, label, permalink, description });
  }

  return { ok: true, tags: orderedKeys, created };
}
