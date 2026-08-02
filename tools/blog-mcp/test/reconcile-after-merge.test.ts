import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { gitOrThrow, git, currentBranch } from '../src/exec/git.js';
import { loadConfig } from '../src/config.js';
import { registerRemoteTools } from '../src/tools/remote.js';
import { FakeServer, call } from './helpers/fakeServer.js';
import { createScratchRemote, createAdditionalClone, removeScratchRemote, type ScratchRemote } from './helpers/scratchRemote.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GH_SHIM_SCRIPT = path.join(__dirname, 'fixtures-bin', 'gh-shim.mjs');

/**
 * Milestone 11 Phase 6 acceptance suite (TODO-NEXT.md sec7.5/sec7.6):
 * blog_reconcile_after_merge. Real scratch bare remotes (test/helpers/
 * scratchRemote.ts, same seam test/prepare-publish-branch.test.ts uses) plus
 * the gh-shim.mjs seam test/watcher.test.ts already established, so a
 * "PR merged" observation is genuinely simulated end to end, not mocked.
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
  registerRemoteTools(ctx);
  return { remote, server };
}

describe('blog_reconcile_after_merge', () => {
  beforeAll(() => {
    process.env.BLOG_MCP_GH_COMMAND = JSON.stringify(['node', GH_SHIM_SCRIPT]);
  });

  afterAll(() => {
    delete process.env.BLOG_MCP_GH_COMMAND;
  });

  beforeEach(() => {
    delete process.env.GH_SHIM_STATE;
    delete process.env.GH_SHIM_HEAD_SHA;
    delete process.env.GH_SHIM_MERGE_COMMIT;
    delete process.env.GH_SHIM_HEAD_REF_NAME;
  });

  it('switches to base, fast-forwards it, and force-deletes the merged local branch', async () => {
    const { remote, server } = await setUp('reconcile-happy');
    try {
      await gitOrThrow(['switch', '-c', 'blog/test-post', 'main'], { repoRoot: remote.clone });
      fs.writeFileSync(path.join(remote.clone, 'post.md'), 'content\n');
      await gitOrThrow(['add', 'post.md'], { repoRoot: remote.clone });
      await gitOrThrow(['commit', '-m', 'feat: add post'], { repoRoot: remote.clone });
      const featureHeadSha = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: remote.clone })).stdout.trim();

      // Simulates GitHub's own squash-merge landing on origin/main -- a real,
      // independently-pushed commit, not a merge of the feature branch's own history.
      const pushClone = await createAdditionalClone(remote, 'push-clone');
      fs.writeFileSync(path.join(pushClone, 'post.md'), 'content\n');
      await gitOrThrow(['add', 'post.md'], { repoRoot: pushClone });
      await gitOrThrow(['commit', '-m', 'feat: add post (squashed)'], { repoRoot: pushClone });
      await gitOrThrow(['push', 'origin', 'main'], { repoRoot: pushClone });
      const mergeCommitSha = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: pushClone })).stdout.trim();

      process.env.GH_SHIM_STATE = 'MERGED';
      process.env.GH_SHIM_HEAD_SHA = featureHeadSha;
      process.env.GH_SHIM_MERGE_COMMIT = mergeCommitSha;
      process.env.GH_SHIM_HEAD_REF_NAME = 'blog/test-post';

      const result = await call(server, 'blog_reconcile_after_merge', { pr: 42, expectedHeadSha: featureHeadSha });

      expect(result.ok).toBe(true);
      const data = result.data as { pr: number; mergeCommitSha: string; reconciledBaseSha: string; branch: string; branchDeleted: boolean };
      expect(data.mergeCommitSha).toBe(mergeCommitSha);
      expect(data.reconciledBaseSha).toBe(mergeCommitSha);
      expect(data.branch).toBe('blog/test-post');
      expect(data.branchDeleted).toBe(true);

      expect(await currentBranch({ repoRoot: remote.clone })).toBe('main');
      const branchStillExists = (await git(['rev-parse', '--verify', '--quiet', 'blog/test-post'], { repoRoot: remote.clone })).exitCode === 0;
      expect(branchStillExists).toBe(false);
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('refuses when the PR has not merged yet, touching nothing', async () => {
    const { remote, server } = await setUp('reconcile-not-merged');
    try {
      const shaBefore = (await gitOrThrow(['rev-parse', 'main'], { repoRoot: remote.clone })).stdout.trim();
      process.env.GH_SHIM_STATE = 'OPEN';

      const result = await call(server, 'blog_reconcile_after_merge', { pr: 42 });

      expect(result.ok).toBe(false);
      expect(result.kind).toBe('precondition');
      expect(await currentBranch({ repoRoot: remote.clone })).toBe('main');
      expect((await gitOrThrow(['rev-parse', 'main'], { repoRoot: remote.clone })).stdout.trim()).toBe(shaBefore);
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('refuses when expectedHeadSha no longer matches the PR head, touching nothing', async () => {
    const { remote, server } = await setUp('reconcile-sha-mismatch');
    try {
      const shaBefore = (await gitOrThrow(['rev-parse', 'main'], { repoRoot: remote.clone })).stdout.trim();
      process.env.GH_SHIM_STATE = 'MERGED';
      process.env.GH_SHIM_HEAD_SHA = 'a'.repeat(40);
      process.env.GH_SHIM_MERGE_COMMIT = 'b'.repeat(40);

      const result = await call(server, 'blog_reconcile_after_merge', { pr: 42, expectedHeadSha: 'c'.repeat(40) });

      expect(result.ok).toBe(false);
      expect(result.kind).toBe('precondition');
      expect((await gitOrThrow(['rev-parse', 'main'], { repoRoot: remote.clone })).stdout.trim()).toBe(shaBefore);
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('refuses with a dirty working tree, before ever fetching', async () => {
    const { remote, server } = await setUp('reconcile-dirty');
    try {
      fs.writeFileSync(path.join(remote.clone, 'uncommitted.txt'), 'x\n');
      process.env.GH_SHIM_STATE = 'MERGED';
      process.env.GH_SHIM_HEAD_SHA = 'a'.repeat(40);
      process.env.GH_SHIM_MERGE_COMMIT = 'b'.repeat(40);

      const result = await call(server, 'blog_reconcile_after_merge', { pr: 42, expectedHeadSha: 'a'.repeat(40) });

      expect(result.ok).toBe(false);
      expect(result.kind).toBe('precondition');
      expect(fs.existsSync(path.join(remote.clone, 'uncommitted.txt'))).toBe(true);
      expect(await currentBranch({ repoRoot: remote.clone })).toBe('main');
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('is idempotent: succeeds with branchDeleted:false when the local branch is already gone', async () => {
    const { remote, server } = await setUp('reconcile-idempotent');
    try {
      const baseSha = (await gitOrThrow(['rev-parse', 'main'], { repoRoot: remote.clone })).stdout.trim();
      process.env.GH_SHIM_STATE = 'MERGED';
      process.env.GH_SHIM_HEAD_SHA = 'a'.repeat(40);
      process.env.GH_SHIM_MERGE_COMMIT = baseSha; // main's own current tip -- trivially its own ancestor
      process.env.GH_SHIM_HEAD_REF_NAME = 'blog/never-existed-locally';

      const result = await call(server, 'blog_reconcile_after_merge', { pr: 42, expectedHeadSha: 'a'.repeat(40) });

      expect(result.ok).toBe(true);
      const data = result.data as { branchDeleted: boolean; branch: string };
      expect(data.branchDeleted).toBe(false);
      expect(data.branch).toBe('blog/never-existed-locally');
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('refuses without deleting anything when the fast-forward is genuinely refused', async () => {
    const { remote, server } = await setUp('reconcile-ff-refused');
    try {
      // A local-only commit on main that never got pushed...
      fs.writeFileSync(path.join(remote.clone, 'local-only.txt'), 'local\n');
      await gitOrThrow(['add', 'local-only.txt'], { repoRoot: remote.clone });
      await gitOrThrow(['commit', '-m', 'chore: local-only commit'], { repoRoot: remote.clone });
      const localOnlySha = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: remote.clone })).stdout.trim();

      // ...while origin/main independently moved via a second clone -- a genuine divergence.
      const pushClone = await createAdditionalClone(remote, 'push-clone');
      fs.writeFileSync(path.join(pushClone, 'from-origin.txt'), 'origin\n');
      await gitOrThrow(['add', 'from-origin.txt'], { repoRoot: pushClone });
      await gitOrThrow(['commit', '-m', 'chore: origin commit'], { repoRoot: pushClone });
      await gitOrThrow(['push', 'origin', 'main'], { repoRoot: pushClone });

      process.env.GH_SHIM_STATE = 'MERGED';
      process.env.GH_SHIM_MERGE_COMMIT = 'f'.repeat(40); // never reached -- ff fails first

      const result = await call(server, 'blog_reconcile_after_merge', { pr: 42 });

      expect(result.ok).toBe(false);
      expect(result.kind).toBe('precondition');
      expect((await gitOrThrow(['rev-parse', 'main'], { repoRoot: remote.clone })).stdout.trim()).toBe(localOnlySha);
    } finally {
      removeScratchRemote(remote);
    }
  });
});
