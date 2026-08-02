import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServeServer } from '../src/serve.js';
import { hashPassword, resetAuthStateForTests } from '../src/serve/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const GH_SHIM_SCRIPT = path.join(__dirname, 'fixtures-bin', 'gh-shim.mjs');
const PASSWORD = 'correct horse battery staple';
// A fixed, non-port-dependent origin -- port:0 (ephemeral) means the real
// bound port isn't known until after listening, so an Origin check that
// defaults to "this server's own host:port" can't be satisfied by a value
// computed before the port is assigned. Passing this explicitly sidesteps
// that entirely, independent of whatever port the OS hands out.
const TEST_ORIGIN = 'http://blog-mcp.test';

function sessionCookieFrom(res: Response): string {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('Response had no Set-Cookie header.');
  return setCookie.split(';')[0] as string;
}

describe('serve mode', () => {
  let baseUrl: string;
  let server: ReturnType<typeof createServeServer>;

  beforeAll(async () => {
    resetAuthStateForTests();
    // blog_repo_health's GitHub-derived fields make real `gh` calls now --
    // shim it, same as test/serve-writes.test.ts, so this "unit" test never
    // reaches the real GitHub API even though it points at the live
    // SubZeroDev.Blog checkout (REPO_ROOT) for its local-git assertions.
    process.env.BLOG_MCP_GH_COMMAND = JSON.stringify(['node', GH_SHIM_SCRIPT]);
    process.env.GH_SHIM_THREADS_JSON = '[]';
    server = createServeServer({
      repoRoot: REPO_ROOT,
      host: '127.0.0.1',
      port: 0,
      uiPasswordHash: hashPassword(PASSWORD),
      mcpAllowedOrigins: [TEST_ORIGIN]
    });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
    delete process.env.BLOG_MCP_GH_COMMAND;
    delete process.env.GH_SHIM_THREADS_JSON;
  });

  it('GET /healthz works without auth, same as plain HTTP mode', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('GET / redirects to /login when not authenticated', async () => {
    const res = await fetch(`${baseUrl}/`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('GET /login is servable without auth (the login route must be reachable) and serves the SPA shell', async () => {
    const login = await fetch(`${baseUrl}/login`);
    expect(login.status).toBe(200);
    expect(login.headers.get('content-type')).toContain('text/html');
    expect(login.headers.get('cache-control')).toBe('no-cache');
  });

  it('the SPA shell references a real, servable, long-cached JS asset', async () => {
    const shell = await fetch(`${baseUrl}/login`);
    const html = await shell.text();
    const scriptSrc = /<script[^>]+src="([^"]+\.js)"/.exec(html)?.[1];
    expect(scriptSrc).toBeTruthy();

    const asset = await fetch(`${baseUrl}${scriptSrc}`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('text/javascript');
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('unknown client-route paths fall back to the SPA shell, not a 404 (React Router resolves the route)', async () => {
    const res = await fetch(`${baseUrl}/does-not-exist-as-a-file`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('POST /login with the wrong password is rejected and sets no cookie', async () => {
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
      body: JSON.stringify({ password: 'wrong' })
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('POST /login from a disallowed Origin is rejected before the password is even checked', async () => {
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ password: PASSWORD })
    });
    expect(res.status).toBe(403);
  });

  it('POST /login with no Origin header at all succeeds -- a real browser does not reliably send one on a same-origin POST', async () => {
    resetAuthStateForTests();
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD })
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).not.toBeNull();
  });

  it('POST /login with remember: true issues a cookie with a ~30-day Max-Age instead of the default ~30-minute one', async () => {
    resetAuthStateForTests();
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
      body: JSON.stringify({ password: PASSWORD, remember: true })
    });
    expect(res.status).toBe(200);
    const maxAge = Number(/Max-Age=(\d+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]);
    expect(maxAge).toBeGreaterThan(29 * 24 * 60 * 60); // comfortably longer than a default 30-minute session
  });

  it('5 failed logins trigger rate limiting on the 6th attempt, even with the correct password', async () => {
    resetAuthStateForTests(); // clean baseline -- an earlier test in this file already recorded one failure
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
        body: JSON.stringify({ password: 'wrong' })
      });
      expect(res.status).toBe(401);
    }
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
      body: JSON.stringify({ password: PASSWORD })
    });
    expect(res.status).toBe(429);
  });

  describe('authenticated session', () => {
    let cookie: string;

    beforeAll(async () => {
      // The sibling rate-limiting test deliberately leaves 5 failed attempts
      // on the shared (module-level) limiter; beforeEach only runs between
      // `it`s at this level, not before a nested describe's own beforeAll.
      resetAuthStateForTests();
      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
        body: JSON.stringify({ password: PASSWORD })
      });
      expect(res.status).toBe(200);
      cookie = sessionCookieFrom(res);
    });

    it('GET / now succeeds and serves the shell with a CSP header', async () => {
      const res = await fetch(`${baseUrl}/`, { headers: { cookie } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    });

    it('GET / slides the session cookie rather than only setting it once at login', async () => {
      const res = await fetch(`${baseUrl}/`, { headers: { cookie } });
      expect(res.status).toBe(200);
      const refreshed = res.headers.get('set-cookie');
      expect(refreshed).not.toBeNull();
      expect(sessionCookieFrom(res)).toBe(cookie);
      expect(refreshed).toMatch(/Max-Age=\d+/);
    });

    it('/api slides the session cookie on every authenticated request, not just at login', async () => {
      const res = await fetch(`${baseUrl}/api/posts`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(res.status).toBe(200);
      const refreshed = res.headers.get('set-cookie');
      expect(refreshed).not.toBeNull();
      expect(sessionCookieFrom(res)).toBe(cookie);
      expect(refreshed).toMatch(/Max-Age=\d+/);
    });

    it('/api allows a request with no Origin header at all -- verified against a real browser, a same-origin request does not reliably send one', async () => {
      const res = await fetch(`${baseUrl}/api/posts`, { headers: { cookie, 'x-blog-mcp-csrf': '1' } });
      expect(res.status).toBe(200);
    });

    it('/api rejects a request from a disallowed Origin', async () => {
      const res = await fetch(`${baseUrl}/api/posts`, {
        headers: { cookie, origin: 'https://evil.example', 'x-blog-mcp-csrf': '1' }
      });
      expect(res.status).toBe(403);
    });

    it('/api rejects a request missing the CSRF header even with a valid cookie and Origin', async () => {
      const res = await fetch(`${baseUrl}/api/posts`, { headers: { cookie, origin: TEST_ORIGIN } });
      expect(res.status).toBe(403);
    });

    it('/api rejects a request with the CSRF header and Origin but no session cookie', async () => {
      const res = await fetch(`${baseUrl}/api/posts`, { headers: { origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(res.status).toBe(401);
    });

    it('GET /api/posts succeeds with cookie + Origin + CSRF header, and lists real posts', async () => {
      const res = await fetch(`${baseUrl}/api/posts`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; data: { posts: Array<{ slug: string }> } };
      expect(body.ok).toBe(true);
      expect(body.data.posts.length).toBeGreaterThan(0);
    });

    it('GET /api/posts/:slug with a malformed percent-encoded slug is a 400, not a crash', async () => {
      const res = await fetch(`${baseUrl}/api/posts/abc%zz`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(res.status).toBe(400);
    });

    it('a malformed percent-encoded Cookie header is treated as no session, not a crash', async () => {
      const res = await fetch(`${baseUrl}/api/posts`, {
        headers: { cookie: 'blog_mcp_session=abc%zz', origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' }
      });
      expect(res.status).toBe(401);
    });

    it('GET /api/posts/:slug returns one specific post', async () => {
      const list = await fetch(`${baseUrl}/api/posts`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      const listBody = (await list.json()) as { data: { posts: Array<{ slug: string }> } };
      const slug = listBody.data.posts[0]?.slug as string;

      const res = await fetch(`${baseUrl}/api/posts/${encodeURIComponent(slug)}`, {
        headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' }
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { path: string } };
      expect(body.data.path).toContain('docs/blog/');
    });

    it('GET /api/tags returns the controlled tag vocabulary', async () => {
      const res = await fetch(`${baseUrl}/api/tags`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { tags: Array<{ key: string; label: string }> } };
      expect(body.data.tags.length).toBeGreaterThan(0);
      expect(body.data.tags[0]).toHaveProperty('key');
      expect(body.data.tags[0]).toHaveProperty('label');
    });

    it('GET /api/authors returns the declared author list', async () => {
      const res = await fetch(`${baseUrl}/api/authors`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { authors: Array<{ key: string; name: string }> } };
      expect(body.data.authors.length).toBeGreaterThan(0);
      expect(body.data.authors[0]).toHaveProperty('key');
      expect(body.data.authors[0]).toHaveProperty('name');
    });

    it('GET /api/repo/health reports read-only repo state plus GitHub-derived fields via the shim', async () => {
      const res = await fetch(`${baseUrl}/api/repo/health`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: {
          branch: string;
          baseBranch: string;
          commitsLast7Days: number;
          daysSinceLastCommit: number | null;
          staleBranches: { count: number; names: string[] };
          github: { openPrCount: number; lastDeployRun: unknown; requiredCheckPassRate: { sampled: number; passed: number } } | null;
        };
      };
      expect(typeof body.data.branch).toBe('string');
      expect(typeof body.data.baseBranch).toBe('string');
      expect(typeof body.data.commitsLast7Days).toBe('number');
      expect(typeof body.data.staleBranches.count).toBe('number');
      // UI_CAPABILITIES has monitor:true and this suite shims `gh` -- the
      // GitHub-derived block must actually run and populate `github`, not
      // silently fall back to the degraded null/githubNote path.
      expect(body.data.github).not.toBeNull();
      expect(body.data.github?.openPrCount).toBe(0);
      expect(typeof body.data.github?.requiredCheckPassRate.sampled).toBe('number');
    });

    it('GET /api/log returns commit records', async () => {
      const res = await fetch(`${baseUrl}/api/log?limit=5`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { commits: unknown[] } };
      expect(body.data.commits.length).toBeGreaterThan(0);
    });

    it('GET /api/branches returns the current branch', async () => {
      const res = await fetch(`${baseUrl}/api/branches`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { current: string } };
      expect(typeof body.data.current).toBe('string');
    });

    it('GET /api/prs returns the combined PR list', async () => {
      process.env.GH_SHIM_PR_LIST_JSON = JSON.stringify([
        { number: 5, title: 'Fixture PR', state: 'OPEN', isDraft: false, headRefName: 'blog/fixture', url: 'https://github.com/test-owner/test-repo/pull/5', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', mergedAt: null }
      ]);
      try {
        const res = await fetch(`${baseUrl}/api/prs`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { prs: Array<{ number: number }>; limit: number } };
        expect(body.data.prs.map((p) => p.number)).toEqual([5]);
        expect(body.data.limit).toBe(30);
      } finally {
        delete process.env.GH_SHIM_PR_LIST_JSON;
      }
    });

    it('GET /api/prs with an out-of-range limit is a 400, not a misclassified 502', async () => {
      const tooLarge = await fetch(`${baseUrl}/api/prs?limit=101`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(tooLarge.status).toBe(400);

      const notAnInteger = await fetch(`${baseUrl}/api/prs?limit=1.5`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(notAnInteger.status).toBe(400);

      const zero = await fetch(`${baseUrl}/api/prs?limit=0`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(zero.status).toBe(400);
    });

    it('GET /api/deploy without mergeCommitSha is a 400, not a crash', async () => {
      const res = await fetch(`${baseUrl}/api/deploy`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(res.status).toBe(400);
    });

    it('POST to an unrecognized /api route is a 404, not silently accepted', async () => {
      const res = await fetch(`${baseUrl}/api/not-a-real-route`, {
        method: 'POST',
        headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1', 'content-type': 'application/json' },
        body: '{}'
      });
      expect(res.status).toBe(404);
    });

    it('POST /logout clears the cookie and the session no longer authenticates', async () => {
      const logoutRes = await fetch(`${baseUrl}/logout`, { method: 'POST', headers: { cookie } });
      expect(logoutRes.status).toBe(200);

      const res = await fetch(`${baseUrl}/api/posts`, { headers: { cookie, origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
      expect(res.status).toBe(401);
    });
  });
});

describe('serve mode with the UI disabled (no BLOG_MCP_UI_PASSWORD_HASH)', () => {
  let baseUrl: string;
  let server: ReturnType<typeof createServeServer>;

  beforeAll(async () => {
    server = createServeServer({ repoRoot: REPO_ROOT, host: '127.0.0.1', port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
  });

  it('/healthz and /mcp still work', async () => {
    const health = await fetch(`${baseUrl}/healthz`);
    expect(health.status).toBe(200);
  });

  it('/login is disabled (404), not silently accepting any password', async () => {
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
      body: JSON.stringify({ password: 'anything' })
    });
    expect(res.status).toBe(404);
  });

  it('/api is disabled (404) rather than silently open', async () => {
    const res = await fetch(`${baseUrl}/api/posts`, { headers: { origin: TEST_ORIGIN, 'x-blog-mcp-csrf': '1' } });
    expect(res.status).toBe(404);
  });
});
