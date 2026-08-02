import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { gitOrThrow, currentBranch } from '../src/exec/git.js';
import { loadConfig } from '../src/config.js';
import { registerLocalGitTools } from '../src/tools/localGit.js';
import { FakeServer, call } from './helpers/fakeServer.js';
import { createScratchRemote, createAdditionalClone, removeScratchRemote, type ScratchRemote } from './helpers/scratchRemote.js';

/**
 * Regression fixtures for Milestone 11 bug 4 (TODO-NEXT.md sec1-14): a commit
 * can land directly on the protected base branch before branch preparation
 * happens, and blog_sync_base({ ffOnly: true }) can report a genuinely
 * refused fast-forward as ok:true. Originally both were `it.fails()` --
 * each body asserted the DESIRED behavior against the then-still-buggy
 * handlers, keeping the suite green while the defect was pinned (see the
 * Milestone 11 Phase 1 plan). Phase 4 (protected branch preparation) fixed
 * both, so `.fails` was removed once each started genuinely passing.
 *
 * Two independent describe blocks, each with its own scratch remote --
 * unlike repoInfo.test.ts (which shares one beforeAll and deliberately
 * mutates branch state across its tests), these two scenarios need precise,
 * non-interacting starting states.
 */

describe('blog_commit: protected base branch', () => {
  let remote: ScratchRemote | undefined;
  let server: FakeServer;

  beforeAll(async () => {
    const created = await createScratchRemote('localgit-integrity-commit');
    remote = created;
    const config = loadConfig(created.clone);
    server = new FakeServer();
    const ctx = {
      server: server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
      repoRoot: created.clone,
      config
    };
    registerLocalGitTools(ctx);
  });

  afterAll(() => {
    if (remote) removeScratchRemote(remote);
  });

  it('blog_commit refuses while the base branch is checked out', async () => {
    const initialized = remote;
    if (!initialized) throw new Error('scratch remote setup did not complete');
    expect(await currentBranch({ repoRoot: initialized.clone })).toBe('main');

    const shaBefore = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: initialized.clone })).stdout.trim();

    fs.mkdirSync(path.join(initialized.clone, 'docs', 'blog'), { recursive: true });
    fs.writeFileSync(path.join(initialized.clone, 'docs', 'blog', 'fixture.md'), 'fixture content\n');
    const staged = await call(server, 'blog_stage', { paths: ['docs/blog/fixture.md'] });
    expect(staged.ok).toBe(true);

    const result = await call(server, 'blog_commit', { type: 'chore', summary: 'add fixture' });

    // Matches blog_push's existing base-branch guard (src/tools/remote.ts:140-142) -- no commit is created.
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');

    const shaAfter = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: initialized.clone })).stdout.trim();
    expect(shaAfter).toBe(shaBefore);
  });
});

describe('blog_sync_base: ffOnly against a genuinely diverged base branch', () => {
  let remote: ScratchRemote | undefined;
  let server: FakeServer;

  beforeAll(async () => {
    const created = await createScratchRemote('localgit-integrity-syncbase');
    remote = created;
    const config = loadConfig(created.clone);
    server = new FakeServer();
    const ctx = {
      server: server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
      repoRoot: created.clone,
      config
    };
    registerLocalGitTools(ctx);

    // Diverge: a local-only commit on the primary clone's 'main' that never
    // gets pushed...
    fs.writeFileSync(path.join(created.clone, 'local-only.txt'), 'local\n');
    await gitOrThrow(['add', 'local-only.txt'], { repoRoot: created.clone });
    await gitOrThrow(['commit', '-m', 'chore: local-only commit'], { repoRoot: created.clone });

    // ...while a second, independent clone pushes a different commit to
    // origin/main. Now local 'main' and origin/main have each moved past
    // their common ancestor -- a real divergence, not just "behind".
    const pushClone = await createAdditionalClone(created, 'push-clone');
    fs.writeFileSync(path.join(pushClone, 'from-origin.txt'), 'origin\n');
    await gitOrThrow(['add', 'from-origin.txt'], { repoRoot: pushClone });
    await gitOrThrow(['commit', '-m', 'chore: origin commit'], { repoRoot: pushClone });
    await gitOrThrow(['push', 'origin', 'main'], { repoRoot: pushClone });
  });

  afterAll(() => {
    if (remote) removeScratchRemote(remote);
  });

  it('blog_sync_base reports a precondition, not ok:true, when a genuine fast-forward is refused', async () => {
    const initialized = remote;
    if (!initialized) throw new Error('scratch remote setup did not complete');
    expect(await currentBranch({ repoRoot: initialized.clone })).toBe('main');

    const result = await call(server, 'blog_sync_base', { ffOnly: true });

    // `git merge --ff-only origin/main` is genuinely attempted and genuinely
    // refused (local main has a commit origin doesn't) -- distinct from the
    // legitimate "parked on a different branch, ff never attempted" case
    // repoInfo.test.ts covers, which still returns ok:true.
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');
  });
});
