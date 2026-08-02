import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { gitOrThrow } from '../src/exec/git.js';
import { callToolInProcess } from '../src/serve/client.js';
import { parseMarkdown } from '../src/domain/frontmatter.js';

/**
 * Milestone 11 Phase 3 integration coverage (TODO-NEXT.md sec6.4/sec6.5):
 * the canonical date service wired into blog_create_post/blog_update_post,
 * plus the filename rename a date change can trigger. Pure parsing-family
 * coverage lives in test/dateService.test.ts -- this file only exercises
 * the tool-level consequences (what gets written, renamed, or refused).
 * Same callToolInProcess + scratch-repo seam as test/authoring-metadata.test.ts.
 */
describe('Milestone 11 Phase 3: canonical date service', () => {
  let repoRoot: string;
  let seq = 0;

  beforeAll(async () => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-authoring-dates-'));
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

  function nextSlug(prefix: string): string {
    seq += 1;
    return `${prefix}-${seq}`;
  }

  function postPath(dateIso: string, slug: string): string {
    return path.join(repoRoot, 'docs', 'blog', `${dateIso.slice(0, 10)}-${slug}.md`);
  }

  it('a date-only input on create normalizes to canonical midnight UTC and matches the filename', async () => {
    const slug = nextSlug('date-only-create');
    const result = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Date Only Create',
      description: 'Exercises normalizeDate on create.',
      slug,
      body: 'Body text.',
      tags: ['test'],
      authors: ['subzerodev'],
      date: '2026-08-02'
    });

    expect(result.ok).toBe(true);
    const data = result.data as { canonicalDate?: string; path?: string } | undefined;
    expect(data?.canonicalDate).toBe('2026-08-02T00:00:00Z');
    expect(data?.path).toBe(`docs/blog/2026-08-02-${slug}.md`);
    expect(fs.existsSync(postPath('2026-08-02', slug))).toBe(true);
  });

  it('an unparseable date on create fails before any write', async () => {
    const slug = nextSlug('unparseable-create');
    const result = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Unparseable Date',
      description: 'The date field is nonsense.',
      slug,
      body: 'Body text.',
      tags: ['test'],
      authors: ['subzerodev'],
      date: 'not a real date'
    });

    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');
    expect((result as { summary: string }).summary).toContain('accepted formats');
    // No file exists anywhere under docs/blog for this slug.
    const files = fs.readdirSync(path.join(repoRoot, 'docs', 'blog'));
    expect(files.some((f) => f.includes(slug))).toBe(false);
  });

  it('a date change that moves the canonical day renames the file and reports previousPath/changedPaths', async () => {
    const slug = nextSlug('rename-on-day-change');
    const created = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Rename On Day Change',
      description: 'Will have its date changed.',
      slug,
      body: 'Original body.',
      tags: ['test'],
      authors: ['subzerodev'],
      date: '2026-08-02'
    });
    expect(created.ok).toBe(true);
    const oldPath = `docs/blog/2026-08-02-${slug}.md`;
    expect(fs.existsSync(path.join(repoRoot, oldPath))).toBe(true);
    await gitOrThrow(['add', '--', oldPath], { repoRoot });
    await gitOrThrow(['commit', '-m', 'chore: track pre-rename post'], { repoRoot });

    const updated = await callToolInProcess({ repoRoot }, 'blog_update_post', {
      slug,
      frontMatter: { date: '2026-08-05' }
    });

    expect(updated.ok).toBe(true);
    const data = updated.data as { path?: string; previousPath?: string; changedPaths?: string[]; canonicalDate?: string } | undefined;
    const newPath = `docs/blog/2026-08-05-${slug}.md`;
    expect(data?.path).toBe(newPath);
    expect(data?.previousPath).toBe(oldPath);
    expect(data?.changedPaths).toContain(newPath);
    expect(data?.changedPaths).toContain(oldPath);
    expect(data?.canonicalDate).toBe('2026-08-05T00:00:00Z');
    const changedPaths = data?.changedPaths;
    if (!changedPaths) throw new Error('blog_update_post did not report changedPaths');

    expect(fs.existsSync(path.join(repoRoot, oldPath))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, newPath))).toBe(true);

    const written = fs.readFileSync(path.join(repoRoot, newPath), 'utf8');
    const parsed = parseMarkdown(written);
    expect(parsed.frontMatter?.date).toBe('2026-08-05T00:00:00Z');
    expect(parsed.frontMatter?.slug).toBe(slug);
    expect(parsed.body).toContain('Original body.');

    // The old path is now a tracked deletion. blog_stage must accept it and
    // stage both sides of the rename using the write result's changedPaths.
    const staged = await callToolInProcess({ repoRoot }, 'blog_stage', { paths: changedPaths });
    expect(staged.ok).toBe(true);
    const stagedNames = (await gitOrThrow(['diff', '--cached', '--name-status', '--no-renames'], { repoRoot })).stdout;
    expect(stagedNames).toContain(`D\t${oldPath}`);
    expect(stagedNames).toContain(`A\t${newPath}`);
  });

  it('a date change within the same canonical day does not rename anything', async () => {
    const slug = nextSlug('same-day-change');
    const created = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Same Day Change',
      description: 'Date changes but stays on the same UTC day.',
      slug,
      body: 'Body text.',
      tags: ['test'],
      authors: ['subzerodev'],
      date: '2026-08-02T09:00:00Z'
    });
    expect(created.ok).toBe(true);
    const path1 = `docs/blog/2026-08-02-${slug}.md`;

    const updated = await callToolInProcess({ repoRoot }, 'blog_update_post', {
      slug,
      frontMatter: { date: '2026-08-02T18:30:00Z' }
    });

    expect(updated.ok).toBe(true);
    const data = updated.data as { path?: string; previousPath?: string; canonicalDate?: string } | undefined;
    expect(data?.path).toBe(path1);
    expect(data?.previousPath).toBeUndefined();
    expect(data?.canonicalDate).toBe('2026-08-02T18:30:00Z');
    expect(fs.existsSync(path.join(repoRoot, path1))).toBe(true);
  });

  it('a rename that would collide with an existing file is refused, and neither file is touched', async () => {
    const slugA = nextSlug('collision-a');
    const slugB = nextSlug('collision-b');

    const postA = await callToolInProcess({ repoRoot }, 'blog_create_post', {
      title: 'Collision A',
      description: 'The post being updated.',
      slug: slugA,
      body: 'Body A.',
      tags: ['test'],
      authors: ['subzerodev'],
      date: '2026-08-02'
    });
    expect(postA.ok).toBe(true);

    // Its date will be changed to 2026-08-09; seed a *different* post that
    // already occupies that exact target filename slot for slugA.
    // (Different slug, so it can't collide on SlugUnique -- the point here
    // is purely the filename collision.)
    fs.writeFileSync(
      path.join(repoRoot, 'docs', 'blog', `2026-08-09-${slugA}.md`),
      ['---', 'title: "Occupying The Target"', 'description: "Pre-existing."', `slug: ${slugB}`, 'authors:', '  - subzerodev', 'date: 2026-08-09T00:00:00Z', 'tags:', '  - test', '---', '', 'Occupant body.', '', '<!-- truncate -->', '', 'More.'].join('\n'),
      'utf8'
    );

    const postABefore = fs.readFileSync(path.join(repoRoot, 'docs', 'blog', `2026-08-02-${slugA}.md`), 'utf8');
    const occupantBefore = fs.readFileSync(path.join(repoRoot, 'docs', 'blog', `2026-08-09-${slugA}.md`), 'utf8');

    const updated = await callToolInProcess({ repoRoot }, 'blog_update_post', {
      slug: slugA,
      frontMatter: { date: '2026-08-09' }
    });

    expect(updated.ok).toBe(false);
    expect(updated.kind).toBe('precondition');
    expect(fs.readFileSync(path.join(repoRoot, 'docs', 'blog', `2026-08-02-${slugA}.md`), 'utf8')).toBe(postABefore);
    expect(fs.readFileSync(path.join(repoRoot, 'docs', 'blog', `2026-08-09-${slugA}.md`), 'utf8')).toBe(occupantBefore);
  });
});
