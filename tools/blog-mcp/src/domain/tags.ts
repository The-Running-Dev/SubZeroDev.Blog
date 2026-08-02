import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Finding } from '../result.js';

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

export function loadTags(repoRoot: string, blogDir: string): TagEntry[] {
  const filePath = tagsYmlPath(repoRoot, blogDir);
  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, 'utf8');
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

function escapeYamlScalar(value: string): string {
  if (/^[a-zA-Z0-9 .,'()-]*$/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
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
