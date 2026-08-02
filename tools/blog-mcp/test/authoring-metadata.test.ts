import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { gitOrThrow } from '../src/exec/git.js';
import { callToolInProcess } from '../src/serve/client.js';

/**
 * Milestone 11 Phase 2 acceptance suite (TODO-NEXT.md sec4.5/sec5.5): atomic
 * metadata resolution for blog_create_post/blog_update_post/blog_add_tag/
 * blog_add_author. Same callToolInProcess seam and scratch-repo seeding style
 * as test/authoring-integrity.test.ts, which already covers the two basic
 * "unknown key gets created" cases -- this file covers the transaction
 * properties around that: reuse, conflicts, collisions, dedup, and retry.
 */
describe('Milestone 11 Phase 2: atomic metadata resolution', () => {
  let repoRoot: string;
  let seq = 0;

  beforeAll(async () => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-authoring-metadata-'));
    await gitOrThrow(['init', '-b', 'main'], { repoRoot });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot });

    fs.mkdirSync(path.join(repoRoot, '.config'));
    fs.writeFileSync(path.join(repoRoot, '.config', 'blog.json'), JSON.stringify({ base_branch: 'main' }));
    fs.mkdirSync(path.join(repoRoot, 'docs', 'blog'), { recursive: true });
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

  function countOccurrences(haystack: string, needle: string): number {
    return haystack.split(needle).length - 1;
  }

  /** A fresh slug per call so unrelated tests never collide on SlugUnique. */
  function nextSlug(prefix: string): string {
    seq += 1;
    return `${prefix}-${seq}`;
  }

  it('reuses existing author/tag keys without rewriting authors.yml/tags.yml', async () => {
    const authorsBefore = readAuthorsYml();
    const tagsBefore = readTagsYml();
    const slug = nextSlug('reuse-existing');

    const result = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Reuse Existing Metadata',
      description: 'Both authors and tags are already declared.',
      slug,
      body: 'Body text.',
      tags: ['test'],
      authors: ['subzerodev']
    });

    expect(result.ok).toBe(true);
    const data = result.data as { path?: string; changedPaths?: string[]; createdAuthors?: unknown[]; createdTags?: unknown[] } | undefined;
    expect(data?.changedPaths).toEqual([data?.path]);
    expect(data?.createdAuthors).toEqual([]);
    expect(data?.createdTags).toEqual([]);
    expect(readAuthorsYml()).toBe(authorsBefore);
    expect(readTagsYml()).toBe(tagsBefore);
  });

  it('an explicit definition is serialized exactly once, then reused by a later post with no further write', async () => {
    const firstSlug = nextSlug('explicit-def');
    const first = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Explicit Author Definition',
      description: 'Supplies a full author definition for a new key.',
      slug: firstSlug,
      body: 'Body text.',
      tags: ['test'],
      authors: ['ben'],
      authorDefinitions: [{ key: 'ben', name: 'Ben Richards', url: 'https://ben.example.test' }]
    });
    expect(first.ok).toBe(true);
    const firstData = first.data as { changedPaths?: string[]; createdAuthors?: Array<{ key: string; name: string; url: string }> } | undefined;
    expect(firstData?.createdAuthors).toEqual([{ key: 'ben', name: 'Ben Richards', url: 'https://ben.example.test' }]);
    expect(firstData?.changedPaths).toContain('docs/blog/authors.yml');

    const authorsAfterFirst = readAuthorsYml();
    expect(countOccurrences(authorsAfterFirst, 'ben:')).toBe(1);
    expect(authorsAfterFirst).toContain('name: Ben Richards');

    const secondSlug = nextSlug('explicit-def-reuse');
    const second = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Reuses Ben',
      description: 'Reuses the ben author created above.',
      slug: secondSlug,
      body: 'Body text.',
      tags: ['test'],
      authors: ['ben']
    });
    expect(second.ok).toBe(true);
    const secondData = second.data as { changedPaths?: string[]; createdAuthors?: unknown[] } | undefined;
    expect(secondData?.createdAuthors).toEqual([]);
    expect(secondData?.changedPaths?.some((p) => p === 'docs/blog/authors.yml')).toBe(false);
    expect(readAuthorsYml()).toBe(authorsAfterFirst);
    expect(countOccurrences(readAuthorsYml(), 'ben:')).toBe(1);
  });

  it('a conflicting author definition fails without writing the post or authors.yml', async () => {
    const authorsBefore = readAuthorsYml();
    const slug = nextSlug('conflicting-author-def');
    const relativePath = `docs/blog/${new Date().toISOString().slice(0, 10)}-${slug}.md`;

    const result = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Conflicting Author Definition',
      description: 'subzerodev already exists with a different name.',
      slug,
      body: 'Body text.',
      tags: ['test'],
      authors: ['subzerodev'],
      authorDefinitions: [{ key: 'subzerodev', name: 'Someone Else' }]
    });

    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');
    expect(fs.existsSync(path.join(repoRoot, relativePath))).toBe(false);
    expect(readAuthorsYml()).toBe(authorsBefore);
  });

  it('an invalid author key fails before any write', async () => {
    const authorsBefore = readAuthorsYml();
    const slug = nextSlug('invalid-author-key');
    const relativePath = `docs/blog/${new Date().toISOString().slice(0, 10)}-${slug}.md`;

    const result = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Invalid Author Key',
      description: 'Author key uses an uppercase/underscore key, which is invalid.',
      slug,
      body: 'Body text.',
      tags: ['test'],
      authors: ['Not_Valid']
    });

    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');
    expect(fs.existsSync(path.join(repoRoot, relativePath))).toBe(false);
    expect(readAuthorsYml()).toBe(authorsBefore);
  });

  it('a tag permalink collision fails without writing the post or tags.yml', async () => {
    const tagsBefore = readTagsYml();
    const slug = nextSlug('permalink-collision');
    const relativePath = `docs/blog/${new Date().toISOString().slice(0, 10)}-${slug}.md`;

    const result = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Permalink Collision',
      description: 'The new tag definition reuses the /test permalink already taken by the seeded tag.',
      slug,
      body: 'Body text.',
      tags: ['collides'],
      tagDefinitions: [{ key: 'collides', permalink: '/test' }],
      authors: ['subzerodev']
    });

    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');
    expect(fs.existsSync(path.join(repoRoot, relativePath))).toBe(false);
    expect(readTagsYml()).toBe(tagsBefore);
  });

  it('duplicate requested tags collapse to one metadata entry and one front-matter value', async () => {
    const slug = nextSlug('dup-tags');
    const result = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Duplicate Requested Tags',
      description: 'Requests the same new tag twice in one call.',
      slug,
      body: 'Body text.',
      tags: ['dup-topic', 'dup-topic'],
      authors: ['subzerodev']
    });

    expect(result.ok).toBe(true);
    const data = result.data as { tags?: string[]; createdTags?: unknown[] } | undefined;
    expect(data?.tags).toEqual(['dup-topic']);
    expect(data?.createdTags).toHaveLength(1);
    expect(countOccurrences(readTagsYml(), 'dup-topic:')).toBe(1);

    const written = fs.readFileSync(path.join(repoRoot, 'docs', 'blog', `${new Date().toISOString().slice(0, 10)}-${slug}.md`), 'utf8');
    expect(countOccurrences(written, '- dup-topic')).toBe(1);
  });

  it('a second post requesting an already-auto-created tag does not duplicate the metadata entry', async () => {
    const firstSlug = nextSlug('brand-new-tag');
    const first = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Introduces A Brand New Tag',
      description: 'Auto-creates the brand-new tag.',
      slug: firstSlug,
      body: 'Body text.',
      tags: ['brand-new'],
      authors: ['subzerodev']
    });
    expect(first.ok).toBe(true);
    expect(countOccurrences(readTagsYml(), 'brand-new:')).toBe(1);

    const secondSlug = nextSlug('brand-new-tag-again');
    const second = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Reuses The Brand New Tag',
      description: 'Reuses brand-new instead of recreating it.',
      slug: secondSlug,
      body: 'Body text.',
      tags: ['brand-new'],
      authors: ['subzerodev']
    });
    expect(second.ok).toBe(true);
    const secondData = second.data as { createdTags?: unknown[]; changedPaths?: string[] } | undefined;
    expect(secondData?.createdTags).toEqual([]);
    expect(secondData?.changedPaths?.some((p) => p === 'docs/blog/tags.yml')).toBe(false);
    expect(countOccurrences(readTagsYml(), 'brand-new:')).toBe(1);
  });

  it('creating both a new author and a new tag in the same call writes all three files atomically', async () => {
    const slug = nextSlug('both-new');
    const result = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Both A New Author And A New Tag',
      description: 'Exercises writing post + authors.yml + tags.yml together.',
      slug,
      body: 'Body text.',
      tags: ['both-new-topic'],
      authors: ['both-new-author']
    });

    expect(result.ok).toBe(true);
    const data = result.data as { changedPaths?: string[]; path?: string } | undefined;
    expect(data?.changedPaths).toEqual(expect.arrayContaining([data?.path, 'docs/blog/authors.yml', 'docs/blog/tags.yml']));
    expect(data?.changedPaths).toHaveLength(3);
    expect(readAuthorsYml()).toMatch(/^both-new-author:/m);
    expect(readTagsYml()).toMatch(/^both-new-topic:/m);
  });

  it('blog_update_post resolves authors the same way when authors are changed, and leaves metadata alone when they are not', async () => {
    const slug = nextSlug('update-resolves');
    const created = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Post To Update',
      description: 'Will be updated below.',
      slug,
      body: 'Original body.',
      tags: ['test'],
      authors: ['subzerodev']
    });
    expect(created.ok).toBe(true);

    const authorsBeforeNoOpUpdate = readAuthorsYml();
    const noOpUpdate = await callToolInProcess({ repoRoot }, 'blog_update_post', {
      slug,
      body: 'Updated body, no front matter changes.\n\n<!-- truncate -->\n\nMore.'
    });
    expect(noOpUpdate.ok).toBe(true);
    const noOpData = noOpUpdate.data as { changedPaths?: string[] } | undefined;
    expect(noOpData?.changedPaths?.some((p) => p === 'docs/blog/authors.yml')).toBe(false);
    expect(readAuthorsYml()).toBe(authorsBeforeNoOpUpdate);

    const authorChangeUpdate = await callToolInProcess({ repoRoot }, 'blog_update_post', {
      slug,
      frontMatter: { authors: ['update-new-author'] }
    });
    expect(authorChangeUpdate.ok).toBe(true);
    const authorChangeData = authorChangeUpdate.data as { createdAuthors?: Array<{ key: string }>; changedPaths?: string[] } | undefined;
    expect(authorChangeData?.createdAuthors?.some((a) => a.key === 'update-new-author')).toBe(true);
    expect(authorChangeData?.changedPaths).toContain('docs/blog/authors.yml');
    expect(readAuthorsYml()).toMatch(/^update-new-author:/m);
  });
});
