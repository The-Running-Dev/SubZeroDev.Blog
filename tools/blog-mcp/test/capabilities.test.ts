import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { gitOrThrow } from '../src/exec/git.js';
import { loadConfig } from '../src/config.js';
import { createServer } from '../src/server.js';
import { registerLocalGitTools } from '../src/tools/localGit.js';
import { registerAuthoringTools } from '../src/tools/authoring.js';
import type { ToolResult } from '../src/result.js';
import { FakeServer, call } from './helpers/fakeServer.js';

/** _registeredTools is private (TS-only), not hidden -- a pragmatic way for a test to introspect a real McpServer without standing up a transport. */
function registeredToolNames(server: McpServer): string[] {
  return Object.keys((server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools);
}

function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const originals: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    originals[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('createServer with an explicit capabilities override', () => {
  let scratchRoot: string;
  let repo: string;

  beforeAll(async () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-capabilities-'));
    repo = path.join(scratchRoot, 'repo');
    fs.mkdirSync(repo);
    await gitOrThrow(['init', '-b', 'main'], { repoRoot: repo });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: repo });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: repo });
    fs.writeFileSync(path.join(repo, 'README.md'), '# scratch\n');
    await gitOrThrow(['add', 'README.md'], { repoRoot: repo });
    await gitOrThrow(['commit', '-m', 'chore: seed'], { repoRoot: repo });
  });

  afterAll(() => {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  it('a read-only-equivalent override omits every write/remote tool even when env says otherwise', () => {
    withEnv({ BLOG_MCP_READ_ONLY: undefined, BLOG_MCP_ALLOW_REMOTE: '1' }, () => {
      const server = createServer({
        repoRoot: repo,
        capabilities: { write: false, remote: false, monitor: true, scheduler: false, writablePathPrefixes: [] }
      });
      const names = registeredToolNames(server);
      expect(names).toContain('blog_repo_status');
      expect(names).toContain('blog_log');
      expect(names).toContain('blog_check_status');
      expect(names).not.toContain('blog_create_post');
      expect(names).not.toContain('blog_restore_paths');
      expect(names).not.toContain('blog_push');
    });
  });

  it('a write+remote override registers them even with BLOG_MCP_READ_ONLY=1 set in env', () => {
    withEnv({ BLOG_MCP_READ_ONLY: '1' }, () => {
      const server = createServer({
        repoRoot: repo,
        capabilities: { write: true, remote: true, monitor: false, scheduler: false, writablePathPrefixes: ['docs/blog/'] }
      });
      const names = registeredToolNames(server);
      expect(names).toContain('blog_create_post');
      expect(names).toContain('blog_restore_paths');
      expect(names).toContain('blog_push');
      expect(names).not.toContain('blog_check_status');
    });
  });

  it('omitting capabilities falls back to the env-derived default, unchanged from before this option existed', () => {
    withEnv({ BLOG_MCP_READ_ONLY: '1' }, () => {
      const readOnlyServer = createServer({ repoRoot: repo });
      expect(registeredToolNames(readOnlyServer)).not.toContain('blog_create_post');
    });
    withEnv({ BLOG_MCP_READ_ONLY: undefined, BLOG_MCP_ALLOW_REMOTE: undefined }, () => {
      const defaultServer = createServer({ repoRoot: repo });
      const names = registeredToolNames(defaultServer);
      expect(names).toContain('blog_create_post');
      expect(names).not.toContain('blog_push'); // BLOG_MCP_ALLOW_REMOTE unset
    });
  });

  it("blog_repo_status reports the session's real ctx.capabilities profile, not process-wide env flags read at call time", async () => {
    const config = loadConfig(repo);
    const fakeServer = new FakeServer();
    registerAuthoringTools({
      server: fakeServer as unknown as McpServer,
      repoRoot: repo,
      config,
      capabilities: { write: false, remote: false, monitor: true, scheduler: false, writablePathPrefixes: [] }
    });

    const originalReadOnly = process.env.BLOG_MCP_READ_ONLY;
    const originalAllowRemote = process.env.BLOG_MCP_ALLOW_REMOTE;
    // Decoy env pointing the opposite direction of the explicit override
    // above (write-enabled, remote-enabled): before this fix, blog_repo_status
    // called isReadOnly()/isRemoteEnabled() directly, which would have
    // reported this decoy instead of the session's real registered profile.
    delete process.env.BLOG_MCP_READ_ONLY;
    process.env.BLOG_MCP_ALLOW_REMOTE = '1';
    let result: ToolResult;
    try {
      result = await call(fakeServer, 'blog_repo_status', {});
    } finally {
      if (originalReadOnly === undefined) delete process.env.BLOG_MCP_READ_ONLY;
      else process.env.BLOG_MCP_READ_ONLY = originalReadOnly;
      if (originalAllowRemote === undefined) delete process.env.BLOG_MCP_ALLOW_REMOTE;
      else process.env.BLOG_MCP_ALLOW_REMOTE = originalAllowRemote;
    }

    expect(result.ok).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.capabilities).toEqual({ write: false, remote: false, monitor: true, scheduler: false });
    expect(data.capabilityProfile).toBe('monitor');
  });
});

describe('writablePathPrefixes actually restricts blog_stage, not just registration', () => {
  let scratchRoot: string;
  let bareRemote: string;
  let clone: string;
  let server: FakeServer;

  beforeAll(async () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-narrow-paths-'));
    bareRemote = path.join(scratchRoot, 'origin.git');
    clone = path.join(scratchRoot, 'clone');

    fs.mkdirSync(bareRemote);
    await gitOrThrow(['init', '--bare', '-b', 'main'], { repoRoot: bareRemote });

    const seed = path.join(scratchRoot, 'seed');
    fs.mkdirSync(seed);
    await gitOrThrow(['init', '-b', 'main'], { repoRoot: seed });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: seed });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: seed });
    fs.mkdirSync(path.join(seed, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(seed, '.github', 'workflows', 'ci.yml'), 'name: ci\n');
    fs.mkdirSync(path.join(seed, 'docs', 'blog'), { recursive: true });
    fs.writeFileSync(path.join(seed, 'docs', 'blog', 'existing.md'), '# existing\n');
    await gitOrThrow(['add', '.'], { repoRoot: seed });
    await gitOrThrow(['commit', '-m', 'chore: seed'], { repoRoot: seed });
    await gitOrThrow(['remote', 'add', 'origin', bareRemote], { repoRoot: seed });
    await gitOrThrow(['push', 'origin', 'main'], { repoRoot: seed });

    await gitOrThrow(['clone', bareRemote, clone], { repoRoot: scratchRoot });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: clone });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: clone });

    const config = loadConfig(clone);
    server = new FakeServer();
    registerLocalGitTools({
      server: server as unknown as McpServer,
      repoRoot: clone,
      config,
      capabilities: { write: true, remote: false, monitor: false, scheduler: false, writablePathPrefixes: ['docs/blog/'] }
    });
  });

  afterAll(() => {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  it('refuses a path outside the narrowed prefix list, even though it is inside the module default', async () => {
    fs.writeFileSync(path.join(clone, '.github', 'workflows', 'ci.yml'), 'name: ci-modified\n');
    const result = await call(server, 'blog_stage', { paths: ['.github/workflows/ci.yml'] });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');
  });

  it('still allows a path inside the narrowed prefix list', async () => {
    fs.writeFileSync(path.join(clone, 'docs', 'blog', 'new-post.md'), '# new\n');
    const result = await call(server, 'blog_stage', { paths: ['docs/blog/new-post.md'] });
    expect(result.ok).toBe(true);
  });
});
