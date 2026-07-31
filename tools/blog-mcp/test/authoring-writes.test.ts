import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { gitOrThrow } from '../src/exec/git.js';
import { callToolInProcess } from '../src/serve/client.js';

/**
 * Exercises blog_update_post directly in-process (src/serve/client.ts's
 * callToolInProcess), the same seam serve mode's /api/posts/:slug route
 * uses -- no HTTP server needed since this tool never touches git remote.
 */
describe('blog_update_post: pre-existing files missing required front matter fields', () => {
  let repoRoot: string;

  beforeAll(async () => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-authoring-writes-'));
    await gitOrThrow(['init', '-b', 'main'], { repoRoot });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot });

    fs.mkdirSync(path.join(repoRoot, '.config'));
    fs.writeFileSync(path.join(repoRoot, '.config', 'blog.json'), JSON.stringify({ base_branch: 'main' }));
    fs.mkdirSync(path.join(repoRoot, 'docs', 'blog'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'docs', 'blog', 'tags.yml'), 'test:\n  label: Test\n  permalink: /test\n  description: Fixture tag for tests.\n');
    fs.writeFileSync(path.join(repoRoot, 'docs', 'blog', 'authors.yml'), 'subzerodev:\n  name: SubZeroDev\n  url: https://blog.subzerodev.com/\n');
    await gitOrThrow(['add', '.'], { repoRoot });
    await gitOrThrow(['commit', '-m', 'chore: seed'], { repoRoot });
  });

  afterAll(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  // Not written via blog_create_post -- simulates a hand-edited or malformed
  // file that predates validation, sitting directly in the repo with no
  // `authors:` field at all.
  function seedPost(filename: string, frontMatterLines: string[], body: string): string {
    const relativePath = `docs/blog/${filename}`;
    fs.writeFileSync(
      path.join(repoRoot, relativePath),
      ['---', ...frontMatterLines, '---', '', body].join('\n'),
      'utf8'
    );
    return relativePath;
  }

  it('returns a clean validation failure, not a crash, when the existing file is missing authors', async () => {
    seedPost(
      '2020-01-01-no-authors.md',
      ['title: "No Authors"', 'description: "Missing the authors field entirely."', 'slug: no-authors', 'date: 2020-01-01T00:00:00Z', 'tags:', '  - test'],
      'Body.\n\n<!-- truncate -->\n\nMore.'
    );

    const result = await callToolInProcess({ repoRoot }, 'blog_update_post', { slug: 'no-authors', body: 'Updated body.\n\n<!-- truncate -->\n\nMore.' });

    expect(result.ok).toBe(false);
    expect(result.kind).toBe('validation');
    expect(result.findings?.some((f) => f.rule === 'FrontMatterFields' && f.message.includes('authors'))).toBe(true);

    // Never wrote the corrupted merge to disk.
    const onDisk = fs.readFileSync(path.join(repoRoot, 'docs', 'blog', '2020-01-01-no-authors.md'), 'utf8');
    expect(onDisk).toContain('Body.');
    expect(onDisk).not.toContain('Updated body.');
  });

  it('succeeds when the caller supplies the missing field explicitly', async () => {
    seedPost(
      '2020-01-02-no-authors-2.md',
      ['title: "No Authors 2"', 'description: "Missing the authors field entirely."', 'slug: no-authors-2', 'date: 2020-01-02T00:00:00Z', 'tags:', '  - test'],
      'Body.\n\n<!-- truncate -->\n\nMore.'
    );

    const result = await callToolInProcess({ repoRoot }, 'blog_update_post', {
      slug: 'no-authors-2',
      frontMatter: { authors: ['subzerodev'] }
    });

    expect(result.ok).toBe(true);
    const onDisk = fs.readFileSync(path.join(repoRoot, 'docs', 'blog', '2020-01-02-no-authors-2.md'), 'utf8');
    expect(onDisk).toContain('authors:');
    expect(onDisk).toContain('  - subzerodev');
  });

  it('reports every missing required field at once, not just the first', async () => {
    seedPost('2020-01-03-many-missing.md', ['slug: many-missing'], 'Body.\n\n<!-- truncate -->\n\nMore.');

    const result = await callToolInProcess({ repoRoot }, 'blog_update_post', { slug: 'many-missing', body: 'x\n\n<!-- truncate -->\n\ny' });

    expect(result.ok).toBe(false);
    expect(result.kind).toBe('validation');
    const message = result.findings?.find((f) => f.rule === 'FrontMatterFields')?.message ?? '';
    for (const field of ['title', 'description', 'authors', 'date', 'tags']) {
      expect(message).toContain(field);
    }
  });
});
