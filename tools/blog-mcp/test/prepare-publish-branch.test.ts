import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gitOrThrow, git } from '../src/exec/git.js';
import { loadConfig } from '../src/config.js';
import { registerLocalGitTools } from '../src/tools/localGit.js';
import { FakeServer, call } from './helpers/fakeServer.js';
import { createScratchRemote, createAdditionalClone, removeScratchRemote, type ScratchRemote } from './helpers/scratchRemote.js';

/**
 * Milestone 11 Phase 4 acceptance suite (TODO-NEXT.md sec7.3/sec7.6):
 * blog_prepare_publish_branch's ancestry-preserving algorithm. Each test
 * gets its own scratch remote -- unlike test/repoInfo.test.ts's shared
 * beforeAll, these scenarios mutate branch/ref state too heavily to share.
 */

async function setUp(prefix: string): Promise<{ remote: ScratchRemote; server: FakeServer }> {
  const remote = await createScratchRemote(prefix);
  const config = loadConfig(remote.clone);
  const server = new FakeServer();
  const ctx = {
    server: server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
    repoRoot: remote.clone,
    config
  };
  registerLocalGitTools(ctx);
  return { remote, server };
}

describe('blog_prepare_publish_branch', () => {
  it('creates the branch directly from base when local and remote are already in sync', async () => {
    const { remote, server } = await setUp('ppb-in-sync');
    try {
      const result = await call(server, 'blog_prepare_publish_branch', { slug: 'in-sync', kind: 'blog' });
      expect(result.ok).toBe(true);
      const data = result.data as { branch: string; action: string; resultingSha: string; remoteBaseSha: string; preservedCommits: unknown[] };
      expect(data.branch).toBe('blog/in-sync');
      expect(data.action).toBe('created-from-remote-base');
      expect(data.resultingSha).toBe(data.remoteBaseSha);
      expect(data.preservedCommits).toEqual([]);
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('fast-forwards local base and creates the branch when local base is purely behind', async () => {
    const { remote, server } = await setUp('ppb-behind');
    try {
      const pushClone = await createAdditionalClone(remote, 'push-clone');
      fs.writeFileSync(path.join(pushClone, 'origin-only.txt'), 'x\n');
      await gitOrThrow(['add', 'origin-only.txt'], { repoRoot: pushClone });
      await gitOrThrow(['commit', '-m', 'chore: origin commit'], { repoRoot: pushClone });
      await gitOrThrow(['push', 'origin', 'main'], { repoRoot: pushClone });

      const result = await call(server, 'blog_prepare_publish_branch', { slug: 'behind', kind: 'blog' });
      expect(result.ok).toBe(true);
      const data = result.data as { action: string; resultingSha: string; remoteBaseSha: string };
      expect(data.action).toBe('fast-forwarded-and-created');
      expect(data.resultingSha).toBe(data.remoteBaseSha);

      const localBaseSha = (await gitOrThrow(['rev-parse', 'main'], { repoRoot: remote.clone })).stdout.trim();
      expect(localBaseSha).toBe(data.remoteBaseSha);
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('preserves a local-only commit and rebases it onto origin when origin has not moved', async () => {
    const { remote, server } = await setUp('ppb-local-only');
    try {
      fs.writeFileSync(path.join(remote.clone, 'local-only.txt'), 'local\n');
      await gitOrThrow(['add', 'local-only.txt'], { repoRoot: remote.clone });
      await gitOrThrow(['commit', '-m', 'chore: local-only commit'], { repoRoot: remote.clone });
      const localOnlySha = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: remote.clone })).stdout.trim();

      const result = await call(server, 'blog_prepare_publish_branch', { slug: 'local-only', kind: 'blog' });
      expect(result.ok).toBe(true);
      const data = result.data as { branch: string; action: string; preservedCommits: Array<{ sha: string; subject: string }> };
      expect(data.action).toBe('preserved-and-rebased');
      expect(data.preservedCommits).toHaveLength(1);
      expect(data.preservedCommits[0]?.sha).toBe(localOnlySha);
      expect(data.preservedCommits[0]?.subject).toBe('chore: local-only commit');

      const localBaseSha = (await gitOrThrow(['rev-parse', 'main'], { repoRoot: remote.clone })).stdout.trim();
      const originBaseSha = (await gitOrThrow(['rev-parse', 'origin/main'], { repoRoot: remote.clone })).stdout.trim();
      expect(localBaseSha).toBe(originBaseSha);

      const log = await gitOrThrow(['log', '--format=%s', data.branch], { repoRoot: remote.clone });
      expect(log.stdout).toContain('chore: local-only commit');
      expect(fs.readFileSync(path.join(remote.clone, 'local-only.txt'), 'utf8')).toBe('local\n');
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('preserves a local-only commit and rebases it onto a diverged origin', async () => {
    const { remote, server } = await setUp('ppb-diverged');
    try {
      fs.writeFileSync(path.join(remote.clone, 'local-only.txt'), 'local\n');
      await gitOrThrow(['add', 'local-only.txt'], { repoRoot: remote.clone });
      await gitOrThrow(['commit', '-m', 'chore: local-only commit'], { repoRoot: remote.clone });

      const pushClone = await createAdditionalClone(remote, 'push-clone');
      fs.writeFileSync(path.join(pushClone, 'from-origin.txt'), 'origin\n');
      await gitOrThrow(['add', 'from-origin.txt'], { repoRoot: pushClone });
      await gitOrThrow(['commit', '-m', 'chore: origin commit'], { repoRoot: pushClone });
      await gitOrThrow(['push', 'origin', 'main'], { repoRoot: pushClone });

      const result = await call(server, 'blog_prepare_publish_branch', { slug: 'diverged', kind: 'blog' });
      expect(result.ok).toBe(true);
      const data = result.data as { branch: string; action: string; preservedCommits: unknown[] };
      expect(data.action).toBe('preserved-and-rebased');
      expect(data.preservedCommits).toHaveLength(1);

      expect(fs.existsSync(path.join(remote.clone, 'local-only.txt'))).toBe(true);
      expect(fs.existsSync(path.join(remote.clone, 'from-origin.txt'))).toBe(true);

      const localBaseSha = (await gitOrThrow(['rev-parse', 'main'], { repoRoot: remote.clone })).stdout.trim();
      const originBaseSha = (await gitOrThrow(['rev-parse', 'origin/main'], { repoRoot: remote.clone })).stdout.trim();
      expect(localBaseSha).toBe(originBaseSha);
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('aborts safely on a genuine rebase conflict, leaving the original commit reachable from the preserved branch', async () => {
    const { remote, server } = await setUp('ppb-conflict');
    try {
      fs.writeFileSync(path.join(remote.clone, 'README.md'), '# local change\n');
      await gitOrThrow(['add', 'README.md'], { repoRoot: remote.clone });
      await gitOrThrow(['commit', '-m', 'chore: local edit'], { repoRoot: remote.clone });
      const localOnlySha = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: remote.clone })).stdout.trim();

      // Same line, same file, incompatible edit -- pushed from a second clone.
      const pushClone = await createAdditionalClone(remote, 'push-clone');
      fs.writeFileSync(path.join(pushClone, 'README.md'), '# origin change\n');
      await gitOrThrow(['add', 'README.md'], { repoRoot: pushClone });
      await gitOrThrow(['commit', '-m', 'chore: origin edit'], { repoRoot: pushClone });
      await gitOrThrow(['push', 'origin', 'main'], { repoRoot: pushClone });

      const result = await call(server, 'blog_prepare_publish_branch', { slug: 'conflict', kind: 'blog' });
      expect(result.ok).toBe(false);
      expect(result.kind).toBe('precondition');
      const data = result.data as { branch: string; preservedCommits: Array<{ sha: string }> } | undefined;
      expect(data?.branch).toBe('blog/conflict');
      expect(data?.preservedCommits?.[0]?.sha).toBe(localOnlySha);

      const status = await git(['status'], { repoRoot: remote.clone });
      expect(status.stdout).not.toContain('rebase in progress');

      const branchLog = await gitOrThrow(['log', '--format=%H', 'blog/conflict'], { repoRoot: remote.clone });
      expect(branchLog.stdout.split('\n')).toContain(localOnlySha);
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('switches to an already-existing local branch without touching or rebasing it', async () => {
    const { remote, server } = await setUp('ppb-exists-local');
    try {
      await gitOrThrow(['switch', '-c', 'blog/exists-local', 'main'], { repoRoot: remote.clone });
      fs.writeFileSync(path.join(remote.clone, 'existing.txt'), 'x\n');
      await gitOrThrow(['add', 'existing.txt'], { repoRoot: remote.clone });
      await gitOrThrow(['commit', '-m', 'chore: pre-existing commit'], { repoRoot: remote.clone });
      const existingSha = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: remote.clone })).stdout.trim();
      await gitOrThrow(['switch', 'main'], { repoRoot: remote.clone });

      const refused = await call(server, 'blog_prepare_publish_branch', { slug: 'exists-local', kind: 'blog' });
      expect(refused.ok).toBe(false);
      expect(refused.kind).toBe('precondition');

      const switched = await call(server, 'blog_prepare_publish_branch', { slug: 'exists-local', kind: 'blog', checkoutExisting: true });
      expect(switched.ok).toBe(true);
      const data = switched.data as { action: string; resultingSha: string };
      expect(data.action).toBe('switched-existing');
      expect(data.resultingSha).toBe(existingSha);
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('switches to a branch that exists on origin but not locally, without rebasing it', async () => {
    const { remote, server } = await setUp('ppb-exists-remote');
    try {
      const pushClone = await createAdditionalClone(remote, 'push-clone');
      await gitOrThrow(['switch', '-c', 'blog/exists-remote', 'main'], { repoRoot: pushClone });
      fs.writeFileSync(path.join(pushClone, 'remote-only.txt'), 'x\n');
      await gitOrThrow(['add', 'remote-only.txt'], { repoRoot: pushClone });
      await gitOrThrow(['commit', '-m', 'chore: pushed elsewhere'], { repoRoot: pushClone });
      await gitOrThrow(['push', 'origin', 'blog/exists-remote'], { repoRoot: pushClone });
      const pushedSha = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: pushClone })).stdout.trim();

      // The primary clone never fetched this branch -- its local
      // refs/remotes/origin/* has no idea it exists yet, which is exactly
      // what exercises the live ls-remote check rather than a stale ref.
      const refused = await call(server, 'blog_prepare_publish_branch', { slug: 'exists-remote', kind: 'blog' });
      expect(refused.ok).toBe(false);
      expect(refused.kind).toBe('precondition');

      const switched = await call(server, 'blog_prepare_publish_branch', { slug: 'exists-remote', kind: 'blog', checkoutExisting: true });
      expect(switched.ok).toBe(true);
      const data = switched.data as { action: string; resultingSha: string };
      expect(data.action).toBe('switched-existing');
      expect(data.resultingSha).toBe(pushedSha);
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('reports infrastructure failure when the live remote branch check cannot run', async () => {
    const { remote, server } = await setUp('ppb-remote-check-failure');
    try {
      await gitOrThrow(['remote', 'set-url', 'origin', path.join(remote.scratchRoot, 'missing-origin.git')], { repoRoot: remote.clone });
      const result = await call(server, 'blog_prepare_publish_branch', { slug: 'remote-check-failure', kind: 'blog' });
      expect(result.ok).toBe(false);
      expect(result.kind).toBe('infrastructure');
      expect(result.summary).toContain('Could not verify');
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('refuses when staged, unstaged, or untracked changes are present, before touching anything', async () => {
    const { remote, server } = await setUp('ppb-dirty');
    try {
      fs.writeFileSync(path.join(remote.clone, 'untracked.txt'), 'x\n');
      const untrackedResult = await call(server, 'blog_prepare_publish_branch', { slug: 'dirty-untracked', kind: 'blog' });
      expect(untrackedResult.ok).toBe(false);
      expect(untrackedResult.kind).toBe('precondition');

      await gitOrThrow(['add', 'untracked.txt'], { repoRoot: remote.clone });
      const stagedResult = await call(server, 'blog_prepare_publish_branch', { slug: 'dirty-staged', kind: 'blog' });
      expect(stagedResult.ok).toBe(false);
      expect(stagedResult.kind).toBe('precondition');

      await gitOrThrow(['commit', '-m', 'chore: add tracked file'], { repoRoot: remote.clone });
      fs.writeFileSync(path.join(remote.clone, 'untracked.txt'), 'changed\n');
      const unstagedResult = await call(server, 'blog_prepare_publish_branch', { slug: 'dirty-unstaged', kind: 'blog' });
      expect(unstagedResult.ok).toBe(false);
      expect(unstagedResult.kind).toBe('precondition');

      // None of the three refused calls created a branch.
      const branchesResult = await gitOrThrow(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], { repoRoot: remote.clone });
      expect(branchesResult.stdout.trim().split('\n')).toEqual(['main']);
    } finally {
      removeScratchRemote(remote);
    }
  });
});
