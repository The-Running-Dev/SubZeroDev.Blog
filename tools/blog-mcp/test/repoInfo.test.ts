import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { gitOrThrow, currentBranch } from '../src/exec/git.js';
import { loadConfig } from '../src/config.js';
import { registerRepoInfoTools } from '../src/tools/repoInfo.js';
import { registerLocalGitTools } from '../src/tools/localGit.js';
import { FakeServer, call } from './helpers/fakeServer.js';

describe('repoInfo and blog_sync_base against a scratch bare remote', () => {
  let scratchRoot: string;
  let bareRemote: string;
  let clone: string;
  let server: FakeServer;
  let auditLogPath: string;

  beforeAll(async () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-repoinfo-'));
    bareRemote = path.join(scratchRoot, 'origin.git');
    clone = path.join(scratchRoot, 'clone');
    auditLogPath = path.join(scratchRoot, 'state', 'audit.log');

    fs.mkdirSync(bareRemote);
    await gitOrThrow(['init', '--bare', '-b', 'main'], { repoRoot: bareRemote });

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

    const config = loadConfig(clone);
    server = new FakeServer();
    const ctx = {
      server: server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
      repoRoot: clone,
      config,
      auditLogPath
    };
    registerRepoInfoTools(ctx);
    registerLocalGitTools(ctx);
  });

  afterAll(() => {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  it('blog_log reads the seed commit from origin/main by default (not HEAD)', async () => {
    const result = await call(server, 'blog_log', {});
    expect(result.ok).toBe(true);
    const data = result.data as { ref: string; commits: Array<{ sha: string; subject: string; authorEmail: string }> };
    expect(data.ref).toBe('origin/main');
    expect(data.commits).toHaveLength(1);
    expect(data.commits[0]?.subject).toBe('chore: seed');
    expect(data.commits[0]?.authorEmail).toBe('test@example.test');
    expect(data.commits[0]?.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('blog_log honors an explicit ref and a limit', async () => {
    // Add a second commit on origin/main via a push from a throwaway push clone.
    const pushClone = path.join(scratchRoot, 'push-clone');
    await gitOrThrow(['clone', bareRemote, pushClone], { repoRoot: scratchRoot });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: pushClone });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: pushClone });
    fs.writeFileSync(path.join(pushClone, 'second.txt'), 'x');
    await gitOrThrow(['add', 'second.txt'], { repoRoot: pushClone });
    await gitOrThrow(['commit', '-m', 'chore: second commit'], { repoRoot: pushClone });
    await gitOrThrow(['push', 'origin', 'main'], { repoRoot: pushClone });
    await gitOrThrow(['fetch', 'origin'], { repoRoot: clone });

    const full = await call(server, 'blog_log', { ref: 'origin/main' });
    expect((full.data as { commits: unknown[] }).commits).toHaveLength(2);

    const limited = await call(server, 'blog_log', { ref: 'origin/main', limit: 1 });
    const limitedCommits = (limited.data as { commits: Array<{ subject: string }> }).commits;
    expect(limitedCommits).toHaveLength(1);
    expect(limitedCommits[0]?.subject).toBe('chore: second commit');
  });

  it('blog_log reports a precondition (not a crash) for an unresolvable ref', async () => {
    const result = await call(server, 'blog_log', { ref: 'origin/does-not-exist' });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');
  });

  it('blog_sync_base with ffOnly fast-forwards local main when clean and checked out on it', async () => {
    expect(await currentBranch({ repoRoot: clone })).toBe('main');

    const result = await call(server, 'blog_sync_base', { ffOnly: true });
    expect(result.ok).toBe(true);
    expect((result.data as { fastForwarded: boolean }).fastForwarded).toBe(true);

    const log = await call(server, 'blog_log', { ref: 'main', limit: 1 });
    expect((log.data as { commits: Array<{ subject: string }> }).commits[0]?.subject).toBe('chore: second commit');
  });

  it('blog_branches lists local branches with current flagged and ahead/behind vs origin/main', async () => {
    await gitOrThrow(['switch', '-c', 'blog/fixture'], { repoRoot: clone });
    fs.writeFileSync(path.join(clone, 'fixture.txt'), 'x');
    await gitOrThrow(['add', 'fixture.txt'], { repoRoot: clone });
    await gitOrThrow(['commit', '-m', 'chore: fixture'], { repoRoot: clone });

    const result = await call(server, 'blog_branches', {});
    expect(result.ok).toBe(true);
    const data = result.data as { current: string; branches: Array<{ name: string; current: boolean; ahead: number; behind: number }> };
    expect(data.current).toBe('blog/fixture');

    const feature = data.branches.find((b) => b.name === 'blog/fixture');
    expect(feature?.current).toBe(true);
    expect(feature?.ahead).toBe(1);
    expect(feature?.behind).toBe(0);

    const main = data.branches.find((b) => b.name === 'main');
    expect(main?.current).toBe(false);
  });

  it('blog_sync_base with ffOnly does not switch or fast-forward while parked on a feature branch', async () => {
    expect(await currentBranch({ repoRoot: clone })).toBe('blog/fixture');
    const result = await call(server, 'blog_sync_base', { ffOnly: true });
    expect(result.ok).toBe(true);
    expect((result.data as { fastForwarded: boolean }).fastForwarded).toBe(false);
    expect(await currentBranch({ repoRoot: clone })).toBe('blog/fixture');
  });

  it('blog_repo_health reports parked and clean while on the feature branch', async () => {
    const result = await call(server, 'blog_repo_health', {});
    expect(result.ok).toBe(true);
    const data = result.data as { branch: string; baseBranch: string; dirty: boolean; parked: boolean; ahead: number; behind: number };
    expect(data.branch).toBe('blog/fixture');
    expect(data.baseBranch).toBe('main');
    expect(data.parked).toBe(true);
    expect(data.dirty).toBe(false);
    expect(data.ahead).toBeGreaterThanOrEqual(1);
  });

  it('blog_repo_health reports dirty when the working tree has uncommitted changes', async () => {
    fs.writeFileSync(path.join(clone, 'fixture.txt'), 'changed, uncommitted');
    const result = await call(server, 'blog_repo_health', {});
    expect((result.data as { dirty: boolean }).dirty).toBe(true);

    // Restore cleanliness for any subsequent test in this file.
    await gitOrThrow(['checkout', '--', 'fixture.txt'], { repoRoot: clone });
  });

  it('mutating tool calls (blog_sync_base) append a scrubbed audit line', async () => {
    expect(fs.existsSync(auditLogPath)).toBe(true);
    const lines = fs.readFileSync(auditLogPath, 'utf8').trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    const entries = lines.map((l) => JSON.parse(l) as { tool: string; ok: boolean });
    expect(entries.some((e) => e.tool === 'blog_sync_base' && e.ok === true)).toBe(true);
    // blog_log is read-only and must never appear in the audit log.
    expect(entries.some((e) => e.tool === 'blog_log')).toBe(false);
  });
});
