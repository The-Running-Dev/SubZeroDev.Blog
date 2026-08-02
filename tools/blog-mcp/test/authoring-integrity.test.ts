import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { gitOrThrow } from '../src/exec/git.js';
import { callToolInProcess } from '../src/serve/client.js';
import { parseMarkdown } from '../src/domain/frontmatter.js';

/**
 * Regression fixtures for Milestone 11's four documented publishing-integrity
 * defects (TODO-NEXT.md sec1-14) as they manifest in blog_create_post.
 * Originally all five were `it.fails` -- each body asserted the DESIRED,
 * post-fix behavior against the then-still-buggy handler, so the suite
 * stayed green while the defect was pinned (see the Milestone 11 Phase 1
 * plan). Phase 2 (atomic metadata resolution) fixed the first three -- the
 * unknown-author, omitted-authors, and unknown-tag cases. Phase 3 (the
 * canonical date service) fixed the remaining two -- `.fails` was removed
 * from each once it started genuinely passing; leaving `.fails` on a fixed
 * case would make the suite fail on an "unexpected pass" instead.
 *
 * Uses callToolInProcess (the same seam authoring-writes.test.ts uses for
 * this exact tool), not FakeServer -- these fixtures care about real zod
 * schema validation on the wire. A plain `git init` scratch repo is enough;
 * none of these defects touch git remote state.
 */
describe('blog_create_post: publishing integrity (Milestone 11)', () => {
  let repoRoot: string;

  beforeAll(async () => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-authoring-integrity-'));
    await gitOrThrow(['init', '-b', 'main'], { repoRoot });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot });

    fs.mkdirSync(path.join(repoRoot, '.config'));
    fs.writeFileSync(path.join(repoRoot, '.config', 'blog.json'), JSON.stringify({ base_branch: 'main' }));
    fs.mkdirSync(path.join(repoRoot, 'docs', 'blog'), { recursive: true });
    // Only one declared tag and one declared author -- every fixture below
    // that needs a "known" key uses these; every fixture that needs an
    // "unknown" key uses something else entirely.
    fs.writeFileSync(path.join(repoRoot, 'docs', 'blog', 'tags.yml'), 'test:\n  label: Test\n  permalink: /test\n  description: Fixture tag for tests.\n');
    fs.writeFileSync(path.join(repoRoot, 'docs', 'blog', 'authors.yml'), 'subzerodev:\n  name: SubZeroDev\n  url: https://blog.subzerodev.com/\n');
    await gitOrThrow(['add', '--', '.config/blog.json', 'docs/blog/tags.yml', 'docs/blog/authors.yml'], { repoRoot });
    await gitOrThrow(['commit', '-m', 'chore: seed'], { repoRoot });
  });

  afterAll(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  function readAuthorsYml(): string {
    return fs.readFileSync(path.join(repoRoot, 'docs', 'blog', 'authors.yml'), 'utf8');
  }

  function readTagsYml(): string {
    return fs.readFileSync(path.join(repoRoot, 'docs', 'blog', 'tags.yml'), 'utf8');
  }

  it('creating a post with an unknown author key creates the author instead of failing validation', async () => {
    const result = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'A Post By A New Author',
      description: 'Exercises author auto-creation.',
      slug: 'new-author-post',
      body: 'Body text for the new author post.',
      tags: ['test'],
      authors: ['ben']
    });

    expect(result.ok).toBe(true);
    expect(result.kind).toBe('success');
    expect(readAuthorsYml()).toMatch(/^ben:/m);
    const data = result.data as { createdAuthors?: Array<{ key: string }> } | undefined;
    expect(data?.createdAuthors?.some((a) => a.key === 'ben')).toBe(true);
  });

  it('omitting authors reports that the configured default was used', async () => {
    const result = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'A Post With No Authors Field',
      description: 'Exercises the default-author fallback, shaped exactly like Compose\'s create request.',
      slug: 'default-author-post',
      body: 'Body text for the default author post.',
      tags: ['test']
      // No `authors` field at all -- this is exactly the shape Compose's UI sends.
    });

    expect(result.ok).toBe(true);
    const data = result.data as { defaultAuthorUsed?: boolean; authors?: string[] } | undefined;
    expect(data?.defaultAuthorUsed).toBe(true);
    expect(data?.authors).toEqual(['subzerodev']);
  });

  it('creating a post with an unknown tag key creates the tag instead of failing validation', async () => {
    const result = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'A Post About A New Topic',
      description: 'Exercises tag auto-creation.',
      slug: 'new-topic-post',
      body: 'Body text for the new topic post.',
      tags: ['new-topic'],
      authors: ['subzerodev']
    });

    expect(result.ok).toBe(true);
    expect(result.kind).toBe('success');
    const tagsYml = readTagsYml();
    expect(tagsYml).toMatch(/^new-topic:/m);
    expect(tagsYml).toContain('label: New Topic');
    expect(tagsYml).toContain('permalink: /new-topic');
    const data = result.data as { createdTags?: Array<{ key: string }> } | undefined;
    expect(data?.createdTags?.some((t) => t.key === 'new-topic')).toBe(true);
  });

  it('a date-only YYYY-MM-DD input normalizes to canonical midnight UTC', async () => {
    const result = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'A Date-Only Post',
      description: 'Exercises date-format normalization.',
      slug: 'date-only-post',
      body: 'Body text for the date-only post.',
      tags: ['test'],
      authors: ['subzerodev'],
      date: '2026-08-02'
    });

    expect(result.ok).toBe(true);
    const written = fs.readFileSync(path.join(repoRoot, 'docs', 'blog', '2026-08-02-date-only-post.md'), 'utf8');
    const parsed = parseMarkdown(written);
    expect(parsed.frontMatter?.date).toBe('2026-08-02T00:00:00Z');
  });

  it('a month-name date input normalizes to canonical UTC', async () => {
    const result = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'A Month-Name Date Post',
      description: 'Exercises date-format normalization for a human-readable input.',
      slug: 'month-name-date-post',
      body: 'Body text for the month-name date post.',
      tags: ['test'],
      authors: ['subzerodev'],
      date: 'August 2, 2026'
    });

    expect(result.ok).toBe(true);
    const written = fs.readFileSync(path.join(repoRoot, 'docs', 'blog', '2026-08-02-month-name-date-post.md'), 'utf8');
    const parsed = parseMarkdown(written);
    expect(parsed.frontMatter?.date).toBe('2026-08-02T00:00:00Z');
  });
});
