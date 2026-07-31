import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { gitOrThrow, headSha as gitHeadSha } from '../src/exec/git.js';
import { createServeServer } from '../src/serve.js';
import { hashPassword } from '../src/serve/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GH_SHIM_SCRIPT = path.join(__dirname, 'fixtures-bin', 'gh-shim.mjs');
const PASSWORD = 'write-path-password';
const TEST_ORIGIN = 'http://blog-mcp.test';

interface Envelope<T = unknown> {
  ok: boolean;
  kind: string;
  summary: string;
  data?: T;
}

/**
 * Exercises Phase 5's write routes end to end over real HTTP against a real
 * createServeServer instance -- never against the live SubZeroDev.Blog
 * checkout (test/localgit.test.ts and test/remote.test.ts's own scratch
 * bare remote pattern, reused here). Local git (branch/stage/commit/push)
 * runs for real against a scratch bare remote; PR/auto-merge run against
 * test/fixtures-bin/gh-shim.mjs, never real GitHub -- consistent with how
 * every other remote-tool test in this package works.
 */
describe('serve mode write routes', () => {
  let scratchRoot: string;
  let bareRemote: string;
  let clone: string;
  let ghShimLog: string;
  let baseUrl: string;
  let server: ReturnType<typeof createServeServer>;
  let cookie: string;

  beforeAll(async () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-serve-writes-'));
    bareRemote = path.join(scratchRoot, 'origin.git');
    clone = path.join(scratchRoot, 'clone');
    ghShimLog = path.join(scratchRoot, 'gh-shim.log');

    fs.mkdirSync(bareRemote);
    await gitOrThrow(['init', '--bare', '-b', 'main'], { repoRoot: bareRemote });

    const seed = path.join(scratchRoot, 'seed');
    fs.mkdirSync(seed);
    await gitOrThrow(['init', '-b', 'main'], { repoRoot: seed });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: seed });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: seed });
    fs.writeFileSync(path.join(seed, 'README.md'), '# seed\n');
    fs.mkdirSync(path.join(seed, '.config'));
    // clone_url is a GitHub-shaped URL so blog_arm_auto_merge's review-thread
    // check can resolve owner/repo -- the real git remote below is a local
    // bare path (needed for real push testing), which cannot resolve to one.
    fs.writeFileSync(path.join(seed, '.config', 'blog.json'), JSON.stringify({ base_branch: 'main', clone_url: 'https://github.com/test-owner/test-repo.git' }));
    fs.mkdirSync(path.join(seed, 'docs', 'blog'), { recursive: true });
    fs.writeFileSync(
      path.join(seed, 'docs', 'blog', 'tags.yml'),
      'test:\n  label: Test\n  permalink: /test\n  description: Fixture tag for tests.\n'
    );
    fs.writeFileSync(path.join(seed, 'docs', 'blog', 'authors.yml'), 'subzerodev:\n  name: SubZeroDev\n  url: https://blog.subzerodev.com/\n');
    await gitOrThrow(['add', '.'], { repoRoot: seed });
    await gitOrThrow(['commit', '-m', 'chore: seed'], { repoRoot: seed });
    await gitOrThrow(['remote', 'add', 'origin', bareRemote], { repoRoot: seed });
    await gitOrThrow(['push', 'origin', 'main'], { repoRoot: seed });

    await gitOrThrow(['clone', bareRemote, clone], { repoRoot: scratchRoot });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: clone });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: clone });

    process.env.BLOG_MCP_GH_COMMAND = JSON.stringify(['node', GH_SHIM_SCRIPT]);
    process.env.GH_SHIM_LOG = ghShimLog;

    server = createServeServer({
      repoRoot: clone,
      host: '127.0.0.1',
      port: 0,
      uiPasswordHash: hashPassword(PASSWORD),
      mcpAllowedOrigins: [TEST_ORIGIN]
    });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
      body: JSON.stringify({ password: PASSWORD })
    });
    expect(loginRes.status).toBe(200);
    cookie = (loginRes.headers.get('set-cookie') ?? '').split(';')[0] as string;
  });

  afterAll(() => {
    server.close();
    delete process.env.BLOG_MCP_GH_COMMAND;
    delete process.env.GH_SHIM_LOG;
    delete process.env.GH_SHIM_HEAD_SHA;
    delete process.env.GH_SHIM_PR_NUMBER;
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  async function post<T = unknown>(routePath: string, body: unknown): Promise<{ status: number; envelope: Envelope<T> }> {
    const res = await fetch(`${baseUrl}${routePath}`, {
      method: 'POST',
      headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: res.status, envelope: (await res.json()) as Envelope<T> };
  }

  let postPath: string;
  const branchName = 'blog/write-path-fixture';

  it('POST /api/parse-markdown splits front matter and body from a pasted file, read-only', async () => {
    const raw = [
      '---',
      'title: "Pasted"',
      'description: "desc"',
      'slug: pasted-slug',
      'authors:',
      '  - subzerodev',
      'date: 2026-01-01T00:00:00Z',
      'tags:',
      '  - test',
      '---',
      '',
      'Body text.'
    ].join('\n');
    const { status, envelope } = await post<{
      frontMatter: { title?: string; slug?: string; tags?: string[] } | null;
      frontMatterPresent: boolean;
      body: string;
    }>('/api/parse-markdown', { content: raw });
    expect(status).toBe(200);
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.frontMatterPresent).toBe(true);
    expect(envelope.data?.frontMatter?.title).toBe('Pasted');
    expect(envelope.data?.frontMatter?.slug).toBe('pasted-slug');
    expect(envelope.data?.frontMatter?.tags).toEqual(['test']);
    expect(envelope.data?.body.trim()).toBe('Body text.');
  });

  it('POST /api/parse-markdown with no front matter fences returns the whole input as body', async () => {
    const { status, envelope } = await post<{ frontMatterPresent: boolean; body: string }>('/api/parse-markdown', {
      content: 'Just a body, no fences.'
    });
    expect(status).toBe(200);
    expect(envelope.data?.frontMatterPresent).toBe(false);
    expect(envelope.data?.body).toBe('Just a body, no fences.');
  });

  it('POST /api/branch creates and switches to a new branch from origin/main', async () => {
    const { status, envelope } = await post<{ branch: string; created: boolean }>('/api/branch', { name: branchName });
    expect(status).toBe(200);
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.branch).toBe(branchName);
    expect(envelope.data?.created).toBe(true);
  });

  it('POST /api/posts creates a new post file (blog_create_post)', async () => {
    const { status, envelope } = await post<{ path: string; canonicalUrl: string }>('/api/posts', {
      title: 'Write Path Fixture',
      description: 'A fixture post proving the Phase 5 write path end to end.',
      slug: 'write-path-fixture',
      body: 'This is a fixture post body with no headings, just prose.',
      tags: ['test'],
      authors: ['subzerodev'],
      date: '2099-01-01T00:00:00Z'
    });
    expect(status).toBe(200);
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.path).toContain('docs/blog/');
    postPath = envelope.data?.path as string;
  });

  it('a malformed create-post request (missing required fields) fails validation, not a crash', async () => {
    const { status, envelope } = await post('/api/posts', { title: 'Missing everything else' });
    // The MCP SDK rejects this at the schema layer before the handler runs,
    // so this exercises the client.ts fallback path (no structuredContent).
    expect(status).toBe(502);
    expect(envelope.ok).toBe(false);
  });

  it('POST /api/stage stages the new post', async () => {
    const { status, envelope } = await post<{ paths: string[] }>('/api/stage', { paths: [postPath] });
    expect(status).toBe(200);
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.paths).toEqual([postPath]);
  });

  it('POST /api/commit commits the staged post', async () => {
    const { status, envelope } = await post<{ sha: string }>('/api/commit', { type: 'feat', scope: 'blog', summary: 'add write-path fixture' });
    expect(status).toBe(200);
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.sha).toMatch(/^[0-9a-f]{12}/);
  });

  it('POST /api/push pushes the branch and verifies the remote matches local HEAD', async () => {
    const { status, envelope } = await post<{ branch: string; verified: boolean }>('/api/push', {});
    expect(status).toBe(200);
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.branch).toBe(branchName);
    expect(envelope.data?.verified).toBe(true);
  });

  it('POST /api/push refuses to push the base branch directly, even over HTTP', async () => {
    const { status, envelope } = await post('/api/push', { branch: 'main' });
    expect(status).toBe(200); // a precondition result, not an infrastructure one -- still 200
    expect(envelope.ok).toBe(false);
    expect(envelope.kind).toBe('precondition');
  });

  it('POST /api/pr opens a PR via the gh shim (never touching real GitHub)', async () => {
    process.env.GH_SHIM_PR_NUMBER = '99';
    const { status, envelope } = await post<{ pr: number; url: string }>('/api/pr', {
      title: 'Write path fixture',
      body: 'Opened by the Phase 5 write-path test.',
      head: branchName
    });
    expect(status).toBe(200);
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.pr).toBe(99);

    const invocations = fs
      .readFileSync(ghShimLog, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
    const createCall = invocations.find((argv) => argv[0] === 'pr' && argv[1] === 'create');
    expect(createCall).toBeDefined();
    expect(createCall).toContain('--body-file');
    expect(createCall?.join(' ')).not.toContain('Opened by the Phase 5 write-path test.');
  });

  it('POST /api/pr/:number/merge arms auto-merge once the head SHA matches and there are no unresolved review threads', async () => {
    const localSha = await gitHeadSha({ repoRoot: clone });
    process.env.GH_SHIM_HEAD_SHA = localSha;
    process.env.GH_SHIM_THREADS_JSON = '[]';

    const { status, envelope } = await post<{ pr: number }>('/api/pr/99/merge', { headSha: localSha });
    delete process.env.GH_SHIM_THREADS_JSON;
    expect(status).toBe(200);
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.pr).toBe(99);

    const invocations = fs
      .readFileSync(ghShimLog, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
    const mergeCall = invocations.find((argv) => argv[0] === 'pr' && argv[1] === 'merge');
    expect(mergeCall).toEqual(['pr', 'merge', '99', '--auto', '--squash', '--match-head-commit', localSha]);
  });

  it('POST /api/pr/:number/merge refuses when the supplied SHA does not match the PR head', async () => {
    process.env.GH_SHIM_HEAD_SHA = 'a'.repeat(40);
    const { status, envelope } = await post('/api/pr/99/merge', { headSha: 'b'.repeat(40) });
    expect(status).toBe(200);
    expect(envelope.ok).toBe(false);
    expect(envelope.kind).toBe('precondition');
  });

  it('POST /api/posts/:slug with a malformed percent-encoded slug is a 400, not a crash', async () => {
    const res = await fetch(`${baseUrl}/api/posts/abc%zz`, {
      method: 'POST',
      headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'irrelevant' })
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/posts/:slug updates the post', async () => {
    // Unlike blog_create_post, blog_update_post does not insert the
    // truncate marker automatically -- the caller supplies a full body.
    const { status, envelope } = await post<{ path: string }>('/api/posts/write-path-fixture', {
      body: 'Updated fixture body.\n\n<!-- truncate -->\n\nMore content after the fold.'
    });
    expect(status).toBe(200);
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.path).toBe(postPath);
  });

  it('POST /api/posts/:slug/delete removes the post via git rm (deletes and stages in one step)', async () => {
    const { status, envelope } = await post<{ path: string }>('/api/posts/write-path-fixture/delete', {});
    expect(status).toBe(200);
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.path).toBe(postPath);

    expect(fs.existsSync(path.join(clone, postPath))).toBe(false);

    const statusResult = await gitOrThrow(['status', '--short'], { repoRoot: clone });
    const line = statusResult.stdout.split('\n').find((l) => l.includes(postPath));
    expect(line?.trim().startsWith('D')).toBe(true);
  });

  it('POST /api/posts/:slug/delete for an unknown slug is a precondition failure, not a crash', async () => {
    const { status, envelope } = await post('/api/posts/does-not-exist/delete', {});
    expect(status).toBe(200);
    expect(envelope.ok).toBe(false);
    expect(envelope.kind).toBe('precondition');
  });
});
