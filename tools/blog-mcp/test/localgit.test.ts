import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { git, gitOrThrow, status, isClean, currentBranch, headSha } from '../src/exec/git.js';
import { checkAllowedPaths } from '../src/domain/paths.js';

/**
 * Exercises the local-git primitives against a scratch bare "origin" and a
 * scratch clone -- no network, no real GitHub repo, matching the plan's
 * "local bare remote" verification layer. This proves blog_sync_base /
 * blog_create_branch / blog_stage / blog_commit's underlying git calls work
 * end to end without ever touching this repository's own working tree.
 */
describe('local git primitives against a scratch bare remote', () => {
  let scratchRoot: string;
  let bareRemote: string;
  let clone: string;

  beforeAll(async () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-localgit-'));
    bareRemote = path.join(scratchRoot, 'origin.git');
    clone = path.join(scratchRoot, 'clone');

    fs.mkdirSync(bareRemote);
    await gitOrThrow(['init', '--bare', '-b', 'main'], { repoRoot: bareRemote });

    // Seed the bare remote with one commit on main via a throwaway seed clone.
    const seed = path.join(scratchRoot, 'seed');
    fs.mkdirSync(seed);
    await gitOrThrow(['init', '-b', 'main'], { repoRoot: seed });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: seed });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: seed });
    fs.writeFileSync(path.join(seed, 'README.md'), '# seed\n');
    await gitOrThrow(['add', 'README.md'], { repoRoot: seed });
    await gitOrThrow(['commit', '-m', 'chore: seed'], { repoRoot: seed });
    await gitOrThrow(['remote', 'add', 'origin', bareRemote], { repoRoot: seed });
    await gitOrThrow(['push', 'origin', 'main'], { repoRoot: seed });

    await gitOrThrow(['clone', bareRemote, clone], { repoRoot: scratchRoot });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: clone });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: clone });
  });

  afterAll(() => {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  it('reports a clean tree and the current branch', async () => {
    expect(await isClean({ repoRoot: clone })).toBe(true);
    expect(await currentBranch({ repoRoot: clone })).toBe('main');
  });

  it('fetch, branch, stage, commit, push round-trips against the bare remote', async () => {
    await gitOrThrow(['fetch', 'origin', 'main'], { repoRoot: clone });
    await gitOrThrow(['switch', '-c', 'blog/fixture-post', 'origin/main'], { repoRoot: clone });

    const docsBlogDir = path.join(clone, 'docs', 'blog');
    fs.mkdirSync(docsBlogDir, { recursive: true });
    const postPath = path.join(docsBlogDir, '2099-01-01-fixture-post.md');
    fs.writeFileSync(postPath, '---\ntitle: "Fixture"\n---\nContent.\n');

    const allowlistCheck = checkAllowedPaths(clone, ['docs/blog/2099-01-01-fixture-post.md']);
    expect(allowlistCheck.ok).toBe(true);

    await gitOrThrow(['add', '--', 'docs/blog/2099-01-01-fixture-post.md'], { repoRoot: clone });
    const statusAfterStage = await status({ repoRoot: clone });
    expect(statusAfterStage.some((e) => e.path === 'docs/blog/2099-01-01-fixture-post.md' && e.staged)).toBe(true);

    await gitOrThrow(['commit', '-m', 'feat(blog): add fixture post'], { repoRoot: clone });
    expect(await isClean({ repoRoot: clone })).toBe(true);

    const localSha = await headSha({ repoRoot: clone });
    await gitOrThrow(['push', '--set-upstream', 'origin', 'blog/fixture-post'], { repoRoot: clone });

    const remoteRef = await git(['ls-remote', bareRemote, 'refs/heads/blog/fixture-post'], { repoRoot: clone });
    expect(remoteRef.stdout).toContain(localSha);
  });
});
