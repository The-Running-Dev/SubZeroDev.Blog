import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appendAuthorEntry, checkAuthorsYmlIntegrity, resolveAuthors, type AuthorEntry } from '../src/domain/authors.js';
import { resolveTags } from '../src/domain/tags.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// tools/blog-mcp/test -> repo root is three levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const DEFAULTS = { authorId: 'subzerodev', canonicalUrl: 'https://blog.subzerodev.com' };

describe('appendAuthorEntry', () => {
  it('appends in the blank-line-separated shape docs/blog/authors.yml uses', () => {
    const content = 'subzerodev:\n  name: SubZeroDev\n  url: https://blog.subzerodev.com/\n';
    const updated = appendAuthorEntry(content, { key: 'ben', name: 'Ben', url: 'https://blog.subzerodev.com' });
    expect(updated).toBe(
      'subzerodev:\n  name: SubZeroDev\n  url: https://blog.subzerodev.com/\n\nben:\n  name: Ben\n  url: https://blog.subzerodev.com\n'
    );
  });

  it('includes image_url only when supplied', () => {
    const updated = appendAuthorEntry('', { key: 'ben', name: 'Ben', url: 'https://example.test', imageUrl: 'https://example.test/ben.png' });
    expect(updated).toContain('  image_url: https://example.test/ben.png');
  });

  it('quotes a name that would otherwise change YAML parsing', () => {
    const updated = appendAuthorEntry('', { key: 'ben', name: 'Ben: The Engineer', url: 'https://example.test' });
    expect(updated).toContain('  name: "Ben: The Engineer"');
  });
});

describe('checkAuthorsYmlIntegrity', () => {
  it('accepts a well-formed authors.yml', () => {
    const content = 'subzerodev:\n  name: SubZeroDev\n  url: https://blog.subzerodev.com/\n';
    expect(checkAuthorsYmlIntegrity(content, 'docs/blog/authors.yml')).toEqual([]);
  });

  it('rejects a duplicate author key', () => {
    const content = 'ben:\n  name: Ben\n  url: https://example.test\n\nben:\n  name: Ben Again\n  url: https://example.test\n';
    const findings = checkAuthorsYmlIntegrity(content, 'docs/blog/authors.yml');
    expect(findings.some((f) => f.message.includes("Duplicate blog author key"))).toBe(true);
  });

  it('rejects an entry with no name', () => {
    const content = 'ben:\n  url: https://example.test\n';
    const findings = checkAuthorsYmlIntegrity(content, 'docs/blog/authors.yml');
    expect(findings.some((f) => f.message.includes("missing a non-empty 'name'"))).toBe(true);
  });

  it('rejects an empty file', () => {
    expect(checkAuthorsYmlIntegrity('', 'docs/blog/authors.yml').length).toBeGreaterThan(0);
  });

  it('the real docs/blog/authors.yml passes cleanly', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'docs/blog/authors.yml'), 'utf8');
    expect(checkAuthorsYmlIntegrity(content, 'docs/blog/authors.yml')).toEqual([]);
  });
});

describe('resolveAuthors', () => {
  const existing: AuthorEntry[] = [{ key: 'subzerodev', name: 'SubZeroDev', url: 'https://blog.subzerodev.com/' }];

  it('creates a deterministic minimal entry for an unknown requested key', () => {
    const result = resolveAuthors(existing, ['ben'], undefined, DEFAULTS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.authors).toEqual(['ben']);
    expect(result.created).toEqual([{ key: 'ben', name: 'Ben', url: DEFAULTS.canonicalUrl }]);
    expect(result.defaultAuthorUsed).toBe(false);
  });

  it('falls back to the configured default author when requested is omitted, and reports it', () => {
    const result = resolveAuthors(existing, undefined, undefined, DEFAULTS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.authors).toEqual(['subzerodev']);
    expect(result.created).toEqual([]);
    expect(result.defaultAuthorUsed).toBe(true);
  });

  it('reuses an existing entry without recreating it', () => {
    const result = resolveAuthors(existing, ['subzerodev'], undefined, DEFAULTS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.created).toEqual([]);
  });

  it('an explicit definition wins over the generated default for a new key', () => {
    const result = resolveAuthors(existing, ['ben'], [{ key: 'ben', name: 'Ben Richards', url: 'https://ben.example.test' }], DEFAULTS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.created).toEqual([{ key: 'ben', name: 'Ben Richards', url: 'https://ben.example.test' }]);
  });

  it('fails when a definition conflicts with an existing entry', () => {
    const result = resolveAuthors(existing, ['subzerodev'], [{ key: 'subzerodev', name: 'Someone Else' }], DEFAULTS);
    expect(result.ok).toBe(false);
  });

  it('fails when a definition is supplied for a key not in the requested list', () => {
    const result = resolveAuthors(existing, ['subzerodev'], [{ key: 'ben', name: 'Ben' }], DEFAULTS);
    expect(result.ok).toBe(false);
  });

  it('fails on an invalid key before creating anything', () => {
    const result = resolveAuthors(existing, ['Not_Valid'], undefined, DEFAULTS);
    expect(result.ok).toBe(false);
  });

  it('deduplicates repeated requested keys', () => {
    const result = resolveAuthors(existing, ['ben', 'ben'], undefined, DEFAULTS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.authors).toEqual(['ben']);
    expect(result.created).toHaveLength(1);
  });
});

describe('resolveTags', () => {
  const existing = [{ key: 'stories', label: 'Stories', permalink: '/stories', description: 'Test.' }];

  it('creates a deterministic minimal entry for an unknown requested key', () => {
    const result = resolveTags(existing, ['new-topic']);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.created).toEqual([{ key: 'new-topic', label: 'New Topic', permalink: '/new-topic', description: 'Posts related to New Topic.' }]);
  });

  it('reuses a known tag and creates only the missing one', () => {
    const result = resolveTags(existing, ['stories', 'new-topic']);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.tags).toEqual(['stories', 'new-topic']);
    expect(result.created.map((t) => t.key)).toEqual(['new-topic']);
  });

  it('collapses duplicate requested tags to one metadata entry and one front-matter value', () => {
    const result = resolveTags(existing, ['new-topic', 'new-topic']);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.tags).toEqual(['new-topic']);
    expect(result.created).toHaveLength(1);
  });

  it('fails on a permalink collision with an existing tag', () => {
    const result = resolveTags(existing, ['dup'], [{ key: 'dup', permalink: '/stories' }]);
    expect(result.ok).toBe(false);
  });

  it('fails when a definition conflicts with an existing entry', () => {
    const result = resolveTags(existing, ['stories'], [{ key: 'stories', label: 'Something Else' }]);
    expect(result.ok).toBe(false);
  });

  it('fails on an invalid key before creating anything', () => {
    const result = resolveTags(existing, ['Not Valid']);
    expect(result.ok).toBe(false);
  });
});
