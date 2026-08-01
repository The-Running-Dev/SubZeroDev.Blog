import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { gitOrThrow } from '../src/exec/git.js';
import { registerRemoteTools } from '../src/tools/remote.js';
import { loadConfig } from '../src/config.js';
import { FakeServer, call } from './helpers/fakeServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GH_SHIM_SCRIPT = path.join(__dirname, 'fixtures-bin', 'gh-shim.mjs');

describe('blog_push against a real scratch bare remote', () => {
  let scratchRoot: string;
  let bareRemote: string;
  let clone: string;
  let server: FakeServer;

  beforeAll(async () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-push-'));
    bareRemote = path.join(scratchRoot, 'origin.git');
    clone = path.join(scratchRoot, 'clone');

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
    registerRemoteTools({ server: server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer, repoRoot: clone, config });
  });

  afterAll(() => {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  it('refuses to push the base branch directly', async () => {
    const result = await call(server, 'blog_push', { branch: 'main' });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');
  });

  it('pushes a feature branch and verifies the remote matches local HEAD', async () => {
    await gitOrThrow(['switch', '-c', 'blog/remote-fixture'], { repoRoot: clone });
    fs.writeFileSync(path.join(clone, 'fixture.txt'), 'x');
    await gitOrThrow(['add', 'fixture.txt'], { repoRoot: clone });
    await gitOrThrow(['commit', '-m', 'chore: fixture'], { repoRoot: clone });

    const result = await call(server, 'blog_push', { branch: 'blog/remote-fixture' });
    expect(result.ok).toBe(true);
    expect((result.data as { verified: boolean }).verified).toBe(true);
  });
});

describe('remote tools against a gh shim (no real GitHub involved)', () => {
  let scratchRoot: string;
  let ghRepo: string;
  let ghShimLog: string;
  let server: FakeServer;
  let originalGhCommand: string | undefined;

  beforeAll(async () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-gh-'));
    ghRepo = path.join(scratchRoot, 'gh-repo');
    ghShimLog = path.join(scratchRoot, 'gh-shim.log');

    // gh-shim tools resolve owner/repo from this remote's URL shape, not
    // its reachability -- they never actually fetch/push through it, so
    // this repo need not be a real clone of anything.
    fs.mkdirSync(ghRepo);
    await gitOrThrow(['init', '-b', 'main'], { repoRoot: ghRepo });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: ghRepo });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: ghRepo });
    fs.writeFileSync(path.join(ghRepo, 'README.md'), '# fixture\n');
    await gitOrThrow(['add', 'README.md'], { repoRoot: ghRepo });
    await gitOrThrow(['commit', '-m', 'chore: fixture'], { repoRoot: ghRepo });
    await gitOrThrow(['remote', 'add', 'origin', 'https://github.com/test-owner/test-repo.git'], { repoRoot: ghRepo });

    originalGhCommand = process.env.BLOG_MCP_GH_COMMAND;
    process.env.BLOG_MCP_GH_COMMAND = JSON.stringify(['node', GH_SHIM_SCRIPT]);
    process.env.GH_SHIM_LOG = ghShimLog;

    const config = loadConfig(ghRepo);
    server = new FakeServer();
    registerRemoteTools({ server: server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer, repoRoot: ghRepo, config });
  });

  afterAll(() => {
    if (originalGhCommand !== undefined) {
      process.env.BLOG_MCP_GH_COMMAND = originalGhCommand;
    } else {
      delete process.env.BLOG_MCP_GH_COMMAND;
    }
    delete process.env.GH_SHIM_LOG;
    delete process.env.GH_SHIM_HEAD_SHA;
    delete process.env.GH_SHIM_IS_DRAFT;
    delete process.env.GH_SHIM_PR_NUMBER;
    delete process.env.GH_SHIM_THREADS_JSON;
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    fs.writeFileSync(ghShimLog, '');
    delete process.env.GH_SHIM_HEAD_SHA;
    delete process.env.GH_SHIM_IS_DRAFT;
    delete process.env.GH_SHIM_THREADS_JSON;
  });

  it('blog_create_pr calls `gh pr create` with a --body-file (never body on argv) and returns the parsed PR', async () => {
    process.env.GH_SHIM_PR_NUMBER = '7';
    const result = await call(server, 'blog_create_pr', {
      title: 'Test PR',
      body: 'Body content that could be arbitrarily long.',
      base: 'main',
      head: 'blog/remote-fixture'
    });
    expect(result.ok).toBe(true);
    expect((result.data as { pr: number }).pr).toBe(7);

    const invocations = fs
      .readFileSync(ghShimLog, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
    const createCall = invocations.find((argv) => argv[0] === 'pr' && argv[1] === 'create');
    expect(createCall).toBeDefined();
    expect(createCall).toContain('--body-file');
    expect(createCall?.join(' ')).not.toContain('Body content that could be arbitrarily long.');
    delete process.env.GH_SHIM_PR_NUMBER;
  });

  it('blog_auto_merge refuses when the validated SHA does not match the PR head', async () => {
    process.env.GH_SHIM_HEAD_SHA = 'a'.repeat(40);
    const result = await call(server, 'blog_auto_merge', { pr: 42, headSha: 'b'.repeat(40) });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');
    expect(result.summary).toContain('does not match');
  });

  it('blog_auto_merge refuses a draft PR', async () => {
    process.env.GH_SHIM_IS_DRAFT = 'true';
    process.env.GH_SHIM_HEAD_SHA = 'c'.repeat(40);
    const result = await call(server, 'blog_auto_merge', { pr: 42, headSha: 'c'.repeat(40) });
    expect(result.ok).toBe(false);
    expect(result.summary.toLowerCase()).toContain('draft');
  });

  it('blog_auto_merge refuses when there are unresolved review threads', async () => {
    process.env.GH_SHIM_HEAD_SHA = 'd'.repeat(40);
    // The shim's default thread list (used by the pagination tests below)
    // includes one unresolved thread.
    const result = await call(server, 'blog_auto_merge', { pr: 42, headSha: 'd'.repeat(40) });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');
    expect(result.summary).toContain('unresolved review thread');
  });

  it('blog_auto_merge enables auto-merge when the SHA matches, no unresolved threads, and calls the exact match-head-commit argv', async () => {
    process.env.GH_SHIM_HEAD_SHA = 'd'.repeat(40);
    process.env.GH_SHIM_THREADS_JSON = '[]';
    const result = await call(server, 'blog_auto_merge', { pr: 42, headSha: 'd'.repeat(40) });
    delete process.env.GH_SHIM_THREADS_JSON;
    expect(result.ok).toBe(true);

    const invocations = fs
      .readFileSync(ghShimLog, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
    const mergeCall = invocations.find((argv) => argv[0] === 'pr' && argv[1] === 'merge');
    expect(mergeCall).toEqual(['pr', 'merge', '42', '--auto', '--squash', '--match-head-commit', 'd'.repeat(40)]);
  });

  it('blog_pr_status reads the full PR JSON', async () => {
    const result = await call(server, 'blog_pr_status', { pr: 42 });
    expect(result.ok).toBe(true);
    expect((result.data as { number: number }).number).toBe(42);
  });

  it('blog_pr_comments returns review threads and honors unresolvedOnly', async () => {
    const all = await call(server, 'blog_pr_comments', { pr: 42 });
    expect(all.ok).toBe(true);
    expect((all.data as { threads: unknown[] }).threads.length).toBe(2);

    const unresolved = await call(server, 'blog_pr_comments', { pr: 42, unresolvedOnly: true });
    const threads = (unresolved.data as { threads: Array<{ isResolved: boolean }> }).threads;
    expect(threads.length).toBe(1);
    expect(threads[0]?.isResolved).toBe(false);
  });

  it('blog_pr_comments paginates until hasNextPage is false, not just the first page', async () => {
    // A page-1-only bug would report 1 thread here instead of 3 -- exactly
    // the failure mode a reviewer flagged against a first:100-with-no-pagination
    // query: a PR with more unresolved threads than fit on one page would
    // silently look clean. Cursors are opaque strings (not sequential
    // indices) to prove the client round-trips whatever the API hands back,
    // rather than happening to work only because a numeric cursor lined up
    // with an array index.
    process.env.GH_SHIM_THREADS_PAGES_JSON = JSON.stringify([
      {
        nodes: [{ id: 'thread-page0', isResolved: false, comments: { nodes: [{ path: 'a.md', line: 1, body: 'page 0', url: 'x' }] } }],
        pageInfo: { hasNextPage: true, endCursor: 'cursor-after-page-0-xyz' }
      },
      {
        nodes: [{ id: 'thread-page1', isResolved: false, comments: { nodes: [{ path: 'a.md', line: 2, body: 'page 1', url: 'x' }] } }],
        pageInfo: { hasNextPage: true, endCursor: 'cursor-after-page-1-abc' }
      },
      {
        nodes: [{ id: 'thread-page2', isResolved: true, comments: { nodes: [{ path: 'a.md', line: 3, body: 'page 2', url: 'x' }] } }],
        pageInfo: { hasNextPage: false, endCursor: null }
      }
    ]);
    try {
      const result = await call(server, 'blog_pr_comments', { pr: 42 });
      const threads = (result.data as { threads: Array<{ threadId: string }> }).threads;
      expect(threads.map((t) => t.threadId)).toEqual(['thread-page0', 'thread-page1', 'thread-page2']);
    } finally {
      delete process.env.GH_SHIM_THREADS_PAGES_JSON;
    }
  });

  it('blog_pr_comments fails loudly (does not silently under-report) when hasNextPage is true but endCursor is missing', async () => {
    process.env.GH_SHIM_THREADS_PAGES_JSON = JSON.stringify([
      {
        nodes: [{ id: 'thread-only', isResolved: false, comments: { nodes: [{ path: 'a.md', line: 1, body: 'x', url: 'x' }] } }],
        pageInfo: { hasNextPage: true, endCursor: null } // API claims more exist but gives nothing to continue from.
      }
    ]);
    try {
      const result = await call(server, 'blog_pr_comments', { pr: 42 });
      expect(result.ok).toBe(false);
      expect(result.kind).toBe('infrastructure');
    } finally {
      delete process.env.GH_SHIM_THREADS_PAGES_JSON;
    }
  });

  it('blog_pr_comments fails loudly when pagination exceeds the page cap', async () => {
    // 21 pages that all claim hasNextPage: true -- exceeds MAX_REVIEW_THREAD_PAGES (20).
    const pages = Array.from({ length: 21 }, (_, i) => ({
      nodes: [{ id: `thread-${i}`, isResolved: false, comments: { nodes: [{ path: 'a.md', line: 1, body: 'x', url: 'x' }] } }],
      pageInfo: { hasNextPage: true, endCursor: `cursor-${i}` }
    }));
    process.env.GH_SHIM_THREADS_PAGES_JSON = JSON.stringify(pages);
    try {
      const result = await call(server, 'blog_pr_comments', { pr: 42 });
      expect(result.ok).toBe(false);
      expect(result.kind).toBe('infrastructure');
    } finally {
      delete process.env.GH_SHIM_THREADS_PAGES_JSON;
    }
  });
});
