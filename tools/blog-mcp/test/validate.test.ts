import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll } from 'vitest';
import { parseMarkdown } from '../src/domain/frontmatter.js';
import { loadAuthors } from '../src/domain/authors.js';
import { loadTags, checkTagsYmlIntegrity } from '../src/domain/tags.js';
import { validateAllPosts, validatePost, type LoadedPost } from '../src/domain/validate.js';
import { loadConfig } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// tools/blog-mcp/test -> repo root is three levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

let authorKeys: Set<string>;
let tagKeys: Set<string>;

beforeAll(() => {
  authorKeys = new Set(loadAuthors(REPO_ROOT, 'docs/blog').map((a) => a.key));
  tagKeys = new Set(loadTags(REPO_ROOT, 'docs/blog').map((t) => t.key));
  expect(authorKeys.has('subzerodev')).toBe(true);
  expect(tagKeys.has('stories')).toBe(true);
});

function makeLoadedPost(filename: string, content: string): LoadedPost {
  const parsed = parseMarkdown(content);
  return {
    absolutePath: path.join(REPO_ROOT, 'docs/blog', filename),
    relativePath: `docs/blog/${filename}`,
    filename,
    content,
    frontMatter: parsed.frontMatter,
    frontMatterPresent: parsed.frontMatterPresent,
    body: parsed.body
  };
}

const VALID_FRONT_MATTER = `---
title: "Fixture Post"
description: "A fixture post used only by the test suite."
slug: fixture-post
authors:
  - subzerodev
date: 2099-01-01T00:00:00Z
tags:
  - stories
---`;

const VALID_BODY = `
# Fixture Post

Intro paragraph.

<!-- truncate -->

Body content.
`;

const VALID_CONTENT = `${VALID_FRONT_MATTER}\n${VALID_BODY}`;
const VALID_FILENAME = '2099-01-01-fixture-post.md';

describe('golden anchor: real repository content', () => {
  it('reports zero error-severity findings against every real post', async () => {
    const config = loadConfig(REPO_ROOT);
    const findings = await validateAllPosts(REPO_ROOT, config);
    const errors = findings.filter((f) => f.severity === 'error');
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
  });
});

describe('blog_validate_posts: baseline fixture', () => {
  it('the valid fixture itself produces zero findings', async () => {
    const post = makeLoadedPost(VALID_FILENAME, VALID_CONTENT);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    expect(findings).toEqual([]);
  });
});

describe('blog_validate_posts: negative fixtures, one per rule', () => {
  it('Filename: rejects a filename with no YYYY-MM-DD prefix', async () => {
    const post = makeLoadedPost('fixture-post.md', VALID_CONTENT);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    expect(findings.map((f) => f.rule)).toContain('Filename');
  });

  it('FrontMatterFields: rejects a post missing the tags field', async () => {
    const content = VALID_CONTENT.replace(/tags:\n  - stories\n/, '');
    const post = makeLoadedPost(VALID_FILENAME, content);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    expect(findings.map((f) => f.rule)).toContain('FrontMatterFields');
  });

  it('Slug: rejects a non-kebab-case slug', async () => {
    const content = VALID_CONTENT.replace('slug: fixture-post', 'slug: Not Valid Slug!');
    const post = makeLoadedPost(VALID_FILENAME, content);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    expect(findings.map((f) => f.rule)).toContain('Slug');
  });

  it('SlugMatchesFilename: warns when slug and filename disagree', async () => {
    const post = makeLoadedPost('2099-01-01-different-slug.md', VALID_CONTENT);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    const finding = findings.find((f) => f.rule === 'SlugMatchesFilename');
    expect(finding?.severity).toBe('warning');
  });

  it('Date: rejects a malformed date', async () => {
    const content = VALID_CONTENT.replace('date: 2099-01-01T00:00:00Z', 'date: not-a-date');
    const post = makeLoadedPost(VALID_FILENAME, content);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    expect(findings.map((f) => f.rule)).toContain('Date');
  });

  it('DateNoZ: warns on a valid ISO date missing the Z suffix', async () => {
    const content = VALID_CONTENT.replace('date: 2099-01-01T00:00:00Z', 'date: 2099-01-01T00:00:00');
    const post = makeLoadedPost(VALID_FILENAME, content);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    const finding = findings.find((f) => f.rule === 'DateNoZ');
    expect(finding?.severity).toBe('warning');
  });

  it('DateMatchesFilename: rejects a date whose day differs from the filename prefix', async () => {
    const content = VALID_CONTENT.replace('date: 2099-01-01T00:00:00Z', 'date: 2099-02-02T00:00:00Z');
    const post = makeLoadedPost(VALID_FILENAME, content);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    expect(findings.map((f) => f.rule)).toContain('DateMatchesFilename');
  });

  it('Authors: rejects an author key not in authors.yml', async () => {
    const content = VALID_CONTENT.replace('  - subzerodev', '  - nonexistent-author');
    const post = makeLoadedPost(VALID_FILENAME, content);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    expect(findings.map((f) => f.rule)).toContain('Authors');
  });

  it('Tags: rejects a tag key not in tags.yml', async () => {
    const content = VALID_CONTENT.replace('  - stories', '  - nonexistent-tag');
    const post = makeLoadedPost(VALID_FILENAME, content);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    expect(findings.map((f) => f.rule)).toContain('Tags');
  });

  it('TruncateMarker: rejects a post with no truncate marker', async () => {
    const content = VALID_CONTENT.replace('<!-- truncate -->\n\n', '');
    const post = makeLoadedPost(VALID_FILENAME, content);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    expect(findings.map((f) => f.rule)).toContain('TruncateMarker');
  });

  it('TruncateMarker: rejects two truncate markers', async () => {
    const content = VALID_CONTENT.replace('<!-- truncate -->', '<!-- truncate -->\n\n<!-- truncate -->');
    const post = makeLoadedPost(VALID_FILENAME, content);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    expect(findings.map((f) => f.rule)).toContain('TruncateMarker');
  });

  it('SingleH1: rejects a second top-level heading before the truncate marker', async () => {
    const content = VALID_CONTENT.replace('# Fixture Post\n', '# Fixture Post\n\n# A Second Heading\n');
    const post = makeLoadedPost(VALID_FILENAME, content);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    expect(findings.map((f) => f.rule)).toContain('SingleH1');
  });

  it('SingleH1: allows extra top-level headings after the truncate marker (docs/blog/2026-07-30-lucifer-chronicles.md pattern)', async () => {
    const content = `${VALID_CONTENT}\n# A Later Section\n\nMore content.\n`;
    const post = makeLoadedPost(VALID_FILENAME, content);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    expect(findings.map((f) => f.rule)).not.toContain('SingleH1');
  });

  it('TemplatePlaceholder: rejects an unfilled template placeholder', async () => {
    const content = VALID_CONTENT.replace('slug: fixture-post', 'slug: post-slug');
    const post = makeLoadedPost(VALID_FILENAME, content);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    expect(findings.map((f) => f.rule)).toContain('TemplatePlaceholder');
  });

  it('LineEndings: warns on CRLF content', async () => {
    const content = VALID_CONTENT.replace(/\n/g, '\r\n');
    const post = makeLoadedPost(VALID_FILENAME, content);
    const findings = await validatePost(REPO_ROOT, post, authorKeys, tagKeys);
    const finding = findings.find((f) => f.rule === 'LineEndings');
    expect(finding?.severity).toBe('warning');
  });
});

describe('SlugUnique: cross-post duplicate detection', () => {
  it('flags two posts that declare the same slug, via a real validateAllPosts run in a scratch directory', async () => {
    const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-slug-unique-'));
    const blogDir = path.join(scratchRoot, 'docs', 'blog');
    fs.mkdirSync(blogDir, { recursive: true });

    // authors.yml/tags.yml so the only expected finding is SlugUnique.
    fs.writeFileSync(path.join(blogDir, 'authors.yml'), 'subzerodev:\n  name: SubZeroDev\n  url: https://example.test/\n');
    fs.writeFileSync(path.join(blogDir, 'tags.yml'), 'stories:\n  label: Stories\n  permalink: /stories\n  description: Test.\n');

    fs.writeFileSync(path.join(blogDir, VALID_FILENAME), VALID_CONTENT);
    fs.writeFileSync(
      path.join(blogDir, '2099-01-02-fixture-post-two.md'),
      VALID_CONTENT.replace('date: 2099-01-01T00:00:00Z', 'date: 2099-01-02T00:00:00Z')
    );

    try {
      const config = loadConfig(scratchRoot);
      const findings = await validateAllPosts(scratchRoot, config);
      const slugUniqueFindings = findings.filter((f) => f.rule === 'SlugUnique');
      expect(slugUniqueFindings.length).toBe(2); // one per offending file
      expect(slugUniqueFindings.every((f) => f.severity === 'error')).toBe(true);
    } finally {
      fs.rmSync(scratchRoot, { recursive: true, force: true });
    }
  });
});

describe('TagsYmlIntegrity: parity with build/Test-DocumentationArtifact.ps1', () => {
  it('accepts a well-formed tags.yml', () => {
    const content = `stories:\n  label: Stories\n  permalink: /stories\n  description: Test.\n\nabsurd:\n  label: Absurd\n  permalink: /absurd\n  description: Test.\n`;
    expect(checkTagsYmlIntegrity(content, 'docs/blog/tags.yml')).toEqual([]);
  });

  it('rejects a duplicate tag key', () => {
    const content = `stories:\n  label: Stories\n  permalink: /stories\n  description: Test.\n\nstories:\n  label: Stories Again\n  permalink: /stories-2\n  description: Test.\n`;
    const findings = checkTagsYmlIntegrity(content, 'docs/blog/tags.yml');
    expect(findings.some((f) => f.message.includes('Duplicate blog tag key'))).toBe(true);
  });

  it('rejects a duplicate permalink', () => {
    const content = `stories:\n  label: Stories\n  permalink: /same\n  description: Test.\n\nabsurd:\n  label: Absurd\n  permalink: /same\n  description: Test.\n`;
    const findings = checkTagsYmlIntegrity(content, 'docs/blog/tags.yml');
    expect(findings.some((f) => f.message.includes('Duplicate blog tag permalink'))).toBe(true);
  });

  it('rejects a key with no matching permalink', () => {
    const content = `stories:\n  label: Stories\n  description: Test.\n`;
    const findings = checkTagsYmlIntegrity(content, 'docs/blog/tags.yml');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('the real docs/blog/tags.yml passes cleanly', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'docs/blog/tags.yml'), 'utf8');
    expect(checkTagsYmlIntegrity(content, 'docs/blog/tags.yml')).toEqual([]);
  });
});
