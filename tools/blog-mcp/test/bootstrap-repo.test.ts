import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { gitOrThrow, currentBranch, isClean } from '../src/exec/git.js';
import { ensureRepo, ensureRepoOptionsFromEnv } from '../src/bootstrap/repo.js';

const GIT_USER_NAME = 'blog-bot';
const GIT_USER_EMAIL = 'blog-bot@example.test';

describe('ensureRepo against a scratch bare remote', () => {
  let scratchRoot: string;
  let bareRemote: string;

  beforeAll(async () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-ensure-repo-'));
    bareRemote = path.join(scratchRoot, 'origin.git');

    fs.mkdirSync(bareRemote);
    await gitOrThrow(['init', '--bare', '-b', 'main'], { repoRoot: bareRemote });

    const seed = path.join(scratchRoot, 'seed');
    fs.mkdirSync(seed);
    await gitOrThrow(['init', '-b', 'main'], { repoRoot: seed });
    await gitOrThrow(['config', 'user.email', 'seed@example.test'], { repoRoot: seed });
    await gitOrThrow(['config', 'user.name', 'Seed'], { repoRoot: seed });
    fs.writeFileSync(path.join(seed, 'README.md'), '# seed\n');
    fs.mkdirSync(path.join(seed, '.config'));
    fs.writeFileSync(path.join(seed, '.config', 'blog.json'), JSON.stringify({ base_branch: 'main' }));
    await gitOrThrow(['add', '.'], { repoRoot: seed });
    await gitOrThrow(['commit', '-m', 'chore: seed'], { repoRoot: seed });
    await gitOrThrow(['remote', 'add', 'origin', bareRemote], { repoRoot: seed });
    await gitOrThrow(['push', 'origin', 'main'], { repoRoot: seed });
  });

  afterAll(() => {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  it('clones fresh into an absent path', async () => {
    const repoPath = path.join(scratchRoot, 'fresh-absent', 'repo');
    const result = await ensureRepo({ repoPath, cloneUrl: bareRemote, gitUserName: GIT_USER_NAME, gitUserEmail: GIT_USER_EMAIL });

    expect(result.action).toBe('cloned');
    expect(result.dirty).toBe(false);
    expect(fs.existsSync(path.join(repoPath, 'README.md'))).toBe(true);

    const email = await gitOrThrow(['config', 'user.email'], { repoRoot: repoPath });
    expect(email.stdout.trim()).toBe(GIT_USER_EMAIL);
  });

  it('clones fresh into an existing empty directory', async () => {
    const repoPath = path.join(scratchRoot, 'fresh-empty-dir', 'repo');
    fs.mkdirSync(repoPath, { recursive: true });

    const result = await ensureRepo({ repoPath, cloneUrl: bareRemote, gitUserName: GIT_USER_NAME, gitUserEmail: GIT_USER_EMAIL });
    expect(result.action).toBe('cloned');
  });

  it('re-running against the same clone is idempotent (fast-forwards, stays clean)', async () => {
    const repoPath = path.join(scratchRoot, 'idempotent', 'repo');
    await ensureRepo({ repoPath, cloneUrl: bareRemote, gitUserName: GIT_USER_NAME, gitUserEmail: GIT_USER_EMAIL });

    const second = await ensureRepo({ repoPath, cloneUrl: bareRemote, gitUserName: GIT_USER_NAME, gitUserEmail: GIT_USER_EMAIL });
    expect(second.action).toBe('fast-forwarded');
    expect(second.branch).toBe('main');
    expect(await isClean({ repoRoot: repoPath })).toBe(true);
  });

  it('refuses a non-empty, non-git directory', async () => {
    const repoPath = path.join(scratchRoot, 'not-a-repo', 'repo');
    fs.mkdirSync(repoPath, { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'stray-file.txt'), 'not a repo');

    await expect(
      ensureRepo({ repoPath, cloneUrl: bareRemote, gitUserName: GIT_USER_NAME, gitUserEmail: GIT_USER_EMAIL })
    ).rejects.toThrow(/is not a git repository/);
  });

  it('refuses when origin does not match BLOG_MCP_CLONE_URL, and never repoints the remote', async () => {
    const repoPath = path.join(scratchRoot, 'wrong-remote', 'repo');
    fs.mkdirSync(repoPath, { recursive: true });
    await gitOrThrow(['init', '-b', 'main'], { repoRoot: repoPath });
    await gitOrThrow(['remote', 'add', 'origin', 'https://github.com/someone-else/other-repo.git'], { repoRoot: repoPath });

    await expect(
      ensureRepo({ repoPath, cloneUrl: bareRemote, gitUserName: GIT_USER_NAME, gitUserEmail: GIT_USER_EMAIL })
    ).rejects.toThrow(/does not match/);

    const remote = await gitOrThrow(['remote', 'get-url', 'origin'], { repoRoot: repoPath });
    expect(remote.stdout.trim()).toBe('https://github.com/someone-else/other-repo.git');
  });

  it('boots successfully but reports dirty, and never switches branch, when the tree has uncommitted changes', async () => {
    const repoPath = path.join(scratchRoot, 'dirty-tree', 'repo');
    await ensureRepo({ repoPath, cloneUrl: bareRemote, gitUserName: GIT_USER_NAME, gitUserEmail: GIT_USER_EMAIL });
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# seed\nlocal edit\n');

    const result = await ensureRepo({ repoPath, cloneUrl: bareRemote, gitUserName: GIT_USER_NAME, gitUserEmail: GIT_USER_EMAIL });
    expect(result.action).toBe('left-dirty');
    expect(result.dirty).toBe(true);
    expect(await currentBranch({ repoRoot: repoPath })).toBe('main');

    const content = fs.readFileSync(path.join(repoPath, 'README.md'), 'utf8');
    expect(content).toContain('local edit');
  });

  it('leaves an unmerged feature branch parked and does not switch to base', async () => {
    const repoPath = path.join(scratchRoot, 'feature-branch', 'repo');
    await ensureRepo({ repoPath, cloneUrl: bareRemote, gitUserName: GIT_USER_NAME, gitUserEmail: GIT_USER_EMAIL });
    await gitOrThrow(['switch', '-c', 'blog/unmerged-fixture'], { repoRoot: repoPath });
    fs.writeFileSync(path.join(repoPath, 'draft.txt'), 'wip');
    await gitOrThrow(['add', 'draft.txt'], { repoRoot: repoPath });
    await gitOrThrow(['commit', '-m', 'chore: draft'], { repoRoot: repoPath });

    const result = await ensureRepo({ repoPath, cloneUrl: bareRemote, gitUserName: GIT_USER_NAME, gitUserEmail: GIT_USER_EMAIL });
    expect(result.action).toBe('left-on-feature-branch');
    expect(result.branch).toBe('blog/unmerged-fixture');
    expect(await currentBranch({ repoRoot: repoPath })).toBe('blog/unmerged-fixture');
  });
});

describe('ensureRepoOptionsFromEnv', () => {
  it('throws listing every missing required var at once', () => {
    expect(() => ensureRepoOptionsFromEnv({})).toThrow(
      /BLOG_MCP_CLONE_URL.*BLOG_MCP_GIT_USER_NAME.*BLOG_MCP_GIT_USER_EMAIL/s
    );
  });

  it('defaults BLOG_MCP_WORKSPACE to /workspace', () => {
    const options = ensureRepoOptionsFromEnv({
      BLOG_MCP_CLONE_URL: 'https://github.com/x/y.git',
      BLOG_MCP_GIT_USER_NAME: 'bot',
      BLOG_MCP_GIT_USER_EMAIL: 'bot@example.test'
    });
    expect(options.repoPath).toBe(path.join('/workspace', 'repo'));
  });

  it('honors an explicit BLOG_MCP_WORKSPACE', () => {
    const options = ensureRepoOptionsFromEnv({
      BLOG_MCP_CLONE_URL: 'https://github.com/x/y.git',
      BLOG_MCP_GIT_USER_NAME: 'bot',
      BLOG_MCP_GIT_USER_EMAIL: 'bot@example.test',
      BLOG_MCP_WORKSPACE: '/custom'
    });
    expect(options.repoPath).toBe(path.join('/custom', 'repo'));
  });
});
