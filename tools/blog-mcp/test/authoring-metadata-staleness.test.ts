import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gitOrThrow } from '../src/exec/git.js';
import { callToolInProcess } from '../src/serve/client.js';
import { createScratchRemote, createAdditionalClone, removeScratchRemote, type ScratchRemote } from './helpers/scratchRemote.js';

/**
 * Regression coverage for a real incident: a long-running container's local
 * checkout can drift behind origin/<base> for as long as it runs
 * (bootstrap/repo.ts's ensureRepo() only reconciles once, at startup --
 * TODO-NEXT.md sec2's documented gap). Before this fix, blog_create_post's
 * author/tag auto-creation (Milestone 11 Phase 2) only ever consulted the
 * local authors.yml/tags.yml, so a key added by a since-merged PR looked
 * "unknown" locally and got auto-created a second time with placeholder
 * data -- silently clobbering the real entry once written. These fixtures
 * use a real scratch bare remote (test/helpers/scratchRemote.ts), same seam
 * test/prepare-publish-branch.test.ts uses, so the divergence is genuine.
 */

async function seedBlogDir(repoRoot: string): Promise<void> {
  fs.mkdirSync(path.join(repoRoot, '.config'));
  fs.writeFileSync(path.join(repoRoot, '.config', 'blog.json'), JSON.stringify({ base_branch: 'main' }));
  fs.mkdirSync(path.join(repoRoot, 'docs', 'blog'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'docs', 'blog', 'tags.yml'), 'test:\n  label: Test\n  permalink: /test\n  description: Fixture tag for tests.\n');
  fs.writeFileSync(path.join(repoRoot, 'docs', 'blog', 'authors.yml'), 'subzerodev:\n  name: SubZeroDev\n  url: https://blog.subzerodev.com/\n');
  await gitOrThrow(['add', '.'], { repoRoot });
  await gitOrThrow(['commit', '-m', 'chore: seed blog dir'], { repoRoot });
  await gitOrThrow(['push', 'origin', 'main'], { repoRoot });
}

function readTagsYml(repoRoot: string): string {
  return fs.readFileSync(path.join(repoRoot, 'docs', 'blog', 'tags.yml'), 'utf8');
}

function readAuthorsYml(repoRoot: string): string {
  return fs.readFileSync(path.join(repoRoot, 'docs', 'blog', 'authors.yml'), 'utf8');
}

describe('metadata auto-creation consults origin/<base>, not just the local checkout', () => {
  it('reuses a tag/author that was added on origin by a since-merged PR, instead of recreating it with placeholder data', async () => {
    const remote = await createScratchRemote('staleness-reuse');
    try {
      await seedBlogDir(remote.clone);

      // A second clone lands "PR #89": a proper gitops tag and ben author,
      // pushed to origin -- the primary clone never fetches this.
      const pushClone = await createAdditionalClone(remote, 'push-clone');
      const tagsAtOrigin = readTagsYml(pushClone).replace(
        /$/,
        '\ngitops:\n  label: GitOps\n  permalink: /gitops\n  description: Real, hand-written description.\n'
      );
      fs.writeFileSync(path.join(pushClone, 'docs', 'blog', 'tags.yml'), tagsAtOrigin);
      const authorsAtOrigin = readAuthorsYml(pushClone).replace(/$/, '\nben:\n  name: Ben Richards\n  url: https://ben.example.test\n');
      fs.writeFileSync(path.join(pushClone, 'docs', 'blog', 'authors.yml'), authorsAtOrigin);
      await gitOrThrow(['add', '.'], { repoRoot: pushClone });
      await gitOrThrow(['commit', '-m', 'chore: add gitops tag and ben author'], { repoRoot: pushClone });
      await gitOrThrow(['push', 'origin', 'main'], { repoRoot: pushClone });

      // The primary clone's local tags.yml/authors.yml are still exactly
      // what they were at seed time -- neither gitops nor ben exist there.
      const localTagsBefore = readTagsYml(remote.clone);
      const localAuthorsBefore = readAuthorsYml(remote.clone);
      expect(localTagsBefore).not.toContain('gitops');
      expect(localAuthorsBefore).not.toContain('ben:');

      const result = await callToolInProcess({ repoRoot: remote.clone }, 'blog_create_post', {
        title: 'A Post Using Already-Published Metadata',
        description: 'Requests gitops and ben, both of which already exist on origin.',
        slug: 'reuses-published-metadata',
        body: 'Body text.',
        tags: ['gitops'],
        authors: ['ben']
      });

      expect(result.ok).toBe(true);
      const data = result.data as {
        createdAuthors?: unknown[];
        createdTags?: unknown[];
        changedPaths?: string[];
      };
      // Reused, not recreated: nothing written to either metadata file.
      expect(data.createdAuthors).toEqual([]);
      expect(data.createdTags).toEqual([]);
      expect(data.changedPaths?.some((p) => p.endsWith('tags.yml'))).toBe(false);
      expect(data.changedPaths?.some((p) => p.endsWith('authors.yml'))).toBe(false);

      // The local files are untouched -- no placeholder duplicate, no
      // clobbering of the real (still-unfetched) origin content.
      expect(readTagsYml(remote.clone)).toBe(localTagsBefore);
      expect(readAuthorsYml(remote.clone)).toBe(localAuthorsBefore);
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('still creates a key that is genuinely unknown to both local and origin', async () => {
    const remote = await createScratchRemote('staleness-genuinely-new');
    try {
      await seedBlogDir(remote.clone);

      const result = await callToolInProcess({ repoRoot: remote.clone }, 'blog_create_post', {
        title: 'A Post With A Brand New Tag',
        description: 'brand-new-topic exists nowhere yet.',
        slug: 'genuinely-new-tag',
        body: 'Body text.',
        tags: ['brand-new-topic'],
        authors: ['subzerodev']
      });

      expect(result.ok).toBe(true);
      const data = result.data as { createdTags?: Array<{ key: string }> };
      expect(data.createdTags?.some((t) => t.key === 'brand-new-topic')).toBe(true);
      expect(readTagsYml(remote.clone)).toMatch(/^brand-new-topic:/m);
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('prefers the local definition when a key exists both locally and on origin with different content', async () => {
    const remote = await createScratchRemote('staleness-local-wins');
    try {
      await seedBlogDir(remote.clone);

      // Origin gains a *different* description for the already-seeded 'test' tag.
      const pushClone = await createAdditionalClone(remote, 'push-clone');
      fs.writeFileSync(
        path.join(pushClone, 'docs', 'blog', 'tags.yml'),
        'test:\n  label: Test\n  permalink: /test\n  description: A different description from origin.\n'
      );
      await gitOrThrow(['add', '.'], { repoRoot: pushClone });
      await gitOrThrow(['commit', '-m', 'chore: change test tag description'], { repoRoot: pushClone });
      await gitOrThrow(['push', 'origin', 'main'], { repoRoot: pushClone });

      const result = await callToolInProcess({ repoRoot: remote.clone }, 'blog_create_post', {
        title: 'Uses The Locally-Known Tag',
        description: 'Local tags.yml still has the original description.',
        slug: 'local-definition-wins',
        body: 'Body text.',
        tags: ['test'],
        authors: ['subzerodev']
      });

      expect(result.ok).toBe(true);
      const data = result.data as { createdTags?: unknown[] };
      expect(data.createdTags).toEqual([]);
      // Local tags.yml is untouched -- no attempt to reconcile the differing description.
      expect(readTagsYml(remote.clone)).toContain('Fixture tag for tests.');
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('falls back to local-only behavior when origin is unreachable, instead of failing the call', async () => {
    const remote = await createScratchRemote('staleness-unreachable-origin');
    try {
      await seedBlogDir(remote.clone);
      await gitOrThrow(['remote', 'set-url', 'origin', path.join(remote.scratchRoot, 'does-not-exist.git')], { repoRoot: remote.clone });

      const result = await callToolInProcess({ repoRoot: remote.clone }, 'blog_create_post', {
        title: 'Publishes Despite An Unreachable Origin',
        description: 'origin cannot be fetched, but the call must still succeed against local data.',
        slug: 'unreachable-origin',
        body: 'Body text.',
        tags: ['test'],
        authors: ['subzerodev']
      });

      expect(result.ok).toBe(true);
    } finally {
      removeScratchRemote(remote);
    }
  });
});
