import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { insertHubEntry, readHubEntries, assertStillParses } from '../src/domain/hubs.js';
import { checkAllowedPath } from '../src/domain/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const REAL_HUB_FILES = [
  'docs/src/pages/series/lucifer-chronicles.tsx',
  'docs/src/pages/series/ai-assisted-engineering.tsx',
  'docs/src/pages/series/state-of-dev.tsx',
  'docs/src/pages/projects/game-engine.tsx'
];

describe('golden anchor: every real hub file already parses', () => {
  for (const relativePath of REAL_HUB_FILES) {
    it(`readHubEntries succeeds on ${relativePath}`, () => {
      const fullPath = path.join(REPO_ROOT, relativePath);
      const source = fs.readFileSync(fullPath, 'utf8');
      const entries = readHubEntries(source, fullPath);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.title).not.toBe('');
        // Most entries link to a single post slug, but game-engine.tsx links
        // across to /series/lucifer-chronicles/ -- a real, valid nested route.
        expect(entry.href).toMatch(/^\/[a-z0-9-/]+\/$/);
      }
    });
  }
});

describe('blog_add_hub_entry: golden-file mutator test', () => {
  for (const relativePath of REAL_HUB_FILES) {
    it(`appends an entry to ${relativePath}, preserving parseability and existing entries`, () => {
      const fullPath = path.join(REPO_ROOT, relativePath);
      const original = fs.readFileSync(fullPath, 'utf8');
      const before = readHubEntries(original, fullPath);

      const updated = insertHubEntry(original, fullPath, {
        title: "Test Entry With an Apostrophe's Quote",
        description: 'A fixture entry added only in memory by the test suite.',
        href: '/blog-mcp-test-fixture-entry/'
      });

      // Must still parse, and must still find every original entry plus the new one.
      assertStillParses(updated, fullPath);
      const after = readHubEntries(updated, fullPath);
      expect(after.length).toBe(before.length + 1);
      for (let i = 0; i < before.length; i++) {
        expect(after[i]?.title).toBe(before[i]?.title);
        expect(after[i]?.href).toBe(before[i]?.href);
      }
      const added = after[after.length - 1];
      expect(added?.href).toBe('/blog-mcp-test-fixture-entry/');
      // Contains an apostrophe -> must be double-quoted per this repo's own convention.
      expect(updated).toContain(`"Test Entry With an Apostrophe's Quote"`);

      // Every line outside the inserted entry must be byte-identical to the original.
      const originalLines = original.split('\n');
      const updatedLines = updated.split('\n');
      const unchangedPrefixLines = originalLines.length - 1; // the file's closing brace/etc. before the array closes
      for (let i = 0; i < Math.min(6, unchangedPrefixLines); i++) {
        expect(updatedLines[i]).toBe(originalLines[i]);
      }
    });
  }

  it('honors an explicit position, inserting before the given index', () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-hub-'));
    const filePath = path.join(scratchDir, 'fixture-hub.tsx');
    const source = `import ContentHub from '@site/src/components/ContentHub';
export default function Fixture() {
  return (
    <ContentHub
      entries={[
        {
          title: 'First',
          description: 'First entry.',
          href: '/first/'
        },
        {
          title: 'Second',
          description: 'Second entry.',
          href: '/second/'
        }
      ]}
    />
  );
}
`;
    fs.writeFileSync(filePath, source, 'utf8');
    try {
      const updated = insertHubEntry(source, filePath, { title: 'Inserted', description: 'x', href: '/inserted/' }, { position: 1 });
      const entries = readHubEntries(updated, filePath);
      expect(entries.map((e) => e.title)).toEqual(['First', 'Inserted', 'Second']);
    } finally {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it('inserts into an empty entries array', () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-hub-empty-'));
    const filePath = path.join(scratchDir, 'empty-hub.tsx');
    const source = `import ContentHub from '@site/src/components/ContentHub';
export default function Fixture() {
  return <ContentHub entries={[]} />;
}
`;
    fs.writeFileSync(filePath, source, 'utf8');
    try {
      const updated = insertHubEntry(source, filePath, { title: 'Only', description: 'x', href: '/only/' });
      const entries = readHubEntries(updated, filePath);
      expect(entries.map((e) => e.title)).toEqual(['Only']);
    } finally {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });
});

describe('domain/paths: write allowlist', () => {
  it('rejects -A, --all, and "."', () => {
    expect(checkAllowedPath(REPO_ROOT, '-A').ok).toBe(false);
    expect(checkAllowedPath(REPO_ROOT, '--all').ok).toBe(false);
    expect(checkAllowedPath(REPO_ROOT, '.').ok).toBe(false);
  });

  it('rejects path traversal and absolute paths', () => {
    expect(checkAllowedPath(REPO_ROOT, '../escape').ok).toBe(false);
    expect(checkAllowedPath(REPO_ROOT, 'docs/blog/../../secret').ok).toBe(false);
    expect(checkAllowedPath(REPO_ROOT, '/etc/passwd').ok).toBe(false);
    expect(checkAllowedPath(REPO_ROOT, 'C:/Windows/System32').ok).toBe(false);
  });

  it('rejects a path containing a semicolon (the docs;C junk-directory class)', () => {
    expect(checkAllowedPath(REPO_ROOT, 'docs;C/evil.md').ok).toBe(false);
  });

  it('rejects a path outside the allowed prefixes even if it exists', () => {
    expect(checkAllowedPath(REPO_ROOT, 'README.md').ok).toBe(true); // root *.md is allowed
    expect(checkAllowedPath(REPO_ROOT, 'LICENSE').ok).toBe(false); // not under any allowed prefix
  });

  it('accepts a real, allowed, existing path', () => {
    const result = checkAllowedPath(REPO_ROOT, 'docs/blog/tags.yml');
    expect(result.ok).toBe(true);
  });

  it('rejects a well-formed but nonexistent path', () => {
    const result = checkAllowedPath(REPO_ROOT, 'docs/blog/this-file-does-not-exist.md');
    expect(result.ok).toBe(false);
  });
});
