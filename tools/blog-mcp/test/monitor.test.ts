import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { gitOrThrow } from '../src/exec/git.js';
import { registerMonitorTools } from '../src/tools/monitor.js';
import { loadConfig } from '../src/config.js';
import { FakeServer, call } from './helpers/fakeServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GH_SHIM_SCRIPT = path.join(__dirname, 'fixtures-bin', 'gh-shim.mjs');

function checkRun(name: string, status: string, conclusion: string | null): unknown {
  return { name, status, conclusion, html_url: `https://github.com/test-owner/test-repo/runs/1`, started_at: new Date().toISOString() };
}

describe('monitor tools against a gh shim (no real GitHub involved)', () => {
  let scratchRoot: string;
  let repo: string;
  let server: FakeServer;
  let originalGhCommand: string | undefined;
  const requiredChecks = ['Documentation links and terminology', 'Verify Documentation Build'];

  beforeAll(async () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-monitor-'));
    repo = path.join(scratchRoot, 'repo');
    fs.mkdirSync(repo);
    await gitOrThrow(['init', '-b', 'main'], { repoRoot: repo });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: repo });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: repo });
    fs.writeFileSync(path.join(repo, 'README.md'), '# fixture\n');
    await gitOrThrow(['add', 'README.md'], { repoRoot: repo });
    await gitOrThrow(['commit', '-m', 'chore: fixture'], { repoRoot: repo });
    await gitOrThrow(['remote', 'add', 'origin', 'https://github.com/test-owner/test-repo.git'], { repoRoot: repo });

    originalGhCommand = process.env.BLOG_MCP_GH_COMMAND;
    process.env.BLOG_MCP_GH_COMMAND = JSON.stringify(['node', GH_SHIM_SCRIPT]);

    const config = loadConfig(repo);
    server = new FakeServer();
    registerMonitorTools({ server: server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer, repoRoot: repo, config });
  });

  afterAll(() => {
    if (originalGhCommand !== undefined) {
      process.env.BLOG_MCP_GH_COMMAND = originalGhCommand;
    } else {
      delete process.env.BLOG_MCP_GH_COMMAND;
    }
    delete process.env.GH_SHIM_CHECK_RUNS_JSON;
    delete process.env.GH_SHIM_DEPLOY_RUNS_JSON;
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    delete process.env.GH_SHIM_CHECK_RUNS_JSON;
    delete process.env.GH_SHIM_DEPLOY_RUNS_JSON;
  });

  describe('blog_check_status', () => {
    it('reports allRequiredPassed when both required checks succeeded', async () => {
      process.env.GH_SHIM_CHECK_RUNS_JSON = JSON.stringify([
        checkRun('Documentation links and terminology', 'completed', 'success'),
        checkRun('Verify Documentation Build', 'completed', 'success')
      ]);
      const result = await call(server, 'blog_check_status', { ref: 'a'.repeat(40), required: requiredChecks });
      expect(result.ok).toBe(true);
      expect((result.data as { allRequiredPassed: boolean }).allRequiredPassed).toBe(true);
    });

    it('distinguishes a missing check (not yet run) from a failing one', async () => {
      // Verify Documentation Build only runs on pull_request -- absent on a
      // push-to-main SHA is expected, not a failure.
      process.env.GH_SHIM_CHECK_RUNS_JSON = JSON.stringify([checkRun('Documentation links and terminology', 'completed', 'success')]);
      const result = await call(server, 'blog_check_status', { ref: 'a'.repeat(40), required: requiredChecks });
      const data = result.data as { allRequiredPassed: boolean; requiredMissing: string[]; requiredFailed: string[] };
      expect(data.allRequiredPassed).toBe(false);
      expect(data.requiredMissing).toEqual(['Verify Documentation Build']);
      expect(data.requiredFailed).toEqual([]);
    });

    it('reports a required check that ran and failed', async () => {
      process.env.GH_SHIM_CHECK_RUNS_JSON = JSON.stringify([
        checkRun('Documentation links and terminology', 'completed', 'success'),
        checkRun('Verify Documentation Build', 'completed', 'failure')
      ]);
      const result = await call(server, 'blog_check_status', { ref: 'a'.repeat(40), required: requiredChecks });
      const data = result.data as { allRequiredPassed: boolean; requiredFailed: string[] };
      expect(data.allRequiredPassed).toBe(false);
      expect(data.requiredFailed).toEqual(['Verify Documentation Build']);
    });
  });

  describe('blog_wait_for_checks', () => {
    it('returns immediately (not timed out) when checks already pass', async () => {
      process.env.GH_SHIM_CHECK_RUNS_JSON = JSON.stringify([
        checkRun('Documentation links and terminology', 'completed', 'success'),
        checkRun('Verify Documentation Build', 'completed', 'success')
      ]);
      const result = await call(server, 'blog_wait_for_checks', { ref: 'a'.repeat(40), required: requiredChecks, timeoutSeconds: 5, pollSeconds: 1 });
      expect((result.data as { timedOut: boolean; allRequiredPassed: boolean }).timedOut).toBe(false);
      expect((result.data as { allRequiredPassed: boolean }).allRequiredPassed).toBe(true);
    });

    it('returns as soon as a required check fails, without waiting out the timeout', async () => {
      process.env.GH_SHIM_CHECK_RUNS_JSON = JSON.stringify([checkRun('Verify Documentation Build', 'completed', 'failure')]);
      const start = Date.now();
      const result = await call(server, 'blog_wait_for_checks', { ref: 'a'.repeat(40), required: ['Verify Documentation Build'], timeoutSeconds: 20, pollSeconds: 1 });
      expect(Date.now() - start).toBeLessThan(5000);
      expect((result.data as { timedOut: boolean }).timedOut).toBe(false);
      expect(result.summary).toContain('failed');
    }, 10000);
  });

  describe('blog_deploy_status', () => {
    it('found:false is distinct from a failure when no run matches yet', async () => {
      process.env.GH_SHIM_DEPLOY_RUNS_JSON = JSON.stringify([]);
      const result = await call(server, 'blog_deploy_status', { mergeCommitSha: 'b'.repeat(40) });
      expect(result.ok).toBe(true);
      expect((result.data as { found: boolean }).found).toBe(false);
    });

    it('finds a run matching the exact merge commit SHA', async () => {
      const sha = 'c'.repeat(40);
      process.env.GH_SHIM_DEPLOY_RUNS_JSON = JSON.stringify([{ databaseId: 1, headSha: sha, status: 'completed', conclusion: 'success', url: 'https://x/1' }]);
      const result = await call(server, 'blog_deploy_status', { mergeCommitSha: sha });
      expect((result.data as { found: boolean }).found).toBe(true);
    });
  });

  describe('blog_verify_published_url -- the hard rule, enforced structurally', () => {
    const sha = 'd'.repeat(40);

    it('never reports success while the deploy run is still in_progress', async () => {
      process.env.GH_SHIM_DEPLOY_RUNS_JSON = JSON.stringify([{ databaseId: 1, headSha: sha, status: 'in_progress', conclusion: null, url: 'https://x/1' }]);
      const result = await call(server, 'blog_verify_published_url', { mergeCommitSha: sha, url: 'https://example.test/should-never-be-fetched/', timeoutSeconds: 1 });
      expect(result.ok).toBe(true); // a correctly-reported non-verification, not a tool crash
      const data = result.data as Record<string, unknown>;
      expect(data.verified).toBe(false);
      expect(data.reason).toBe('deploy-not-confirmed');
      expect('url' in data).toBe(false);
      expect(JSON.stringify(data)).not.toContain('example.test');
    }, 10000);

    it('never reports success when the deploy run completed with conclusion=failure', async () => {
      process.env.GH_SHIM_DEPLOY_RUNS_JSON = JSON.stringify([{ databaseId: 1, headSha: sha, status: 'completed', conclusion: 'failure', url: 'https://x/1' }]);
      const result = await call(server, 'blog_verify_published_url', { mergeCommitSha: sha, url: 'https://example.test/should-never-be-fetched/', timeoutSeconds: 1 });
      const data = result.data as Record<string, unknown>;
      expect(data.verified).toBe(false);
      expect(data.reason).toBe('deploy-not-confirmed');
      expect('url' in data).toBe(false);
    });

    it('never reports success when no deploy run exists for the merge commit at all', async () => {
      process.env.GH_SHIM_DEPLOY_RUNS_JSON = JSON.stringify([]);
      const result = await call(server, 'blog_verify_published_url', { mergeCommitSha: sha, url: 'https://example.test/should-never-be-fetched/', timeoutSeconds: 1 });
      const data = result.data as Record<string, unknown>;
      expect(data.verified).toBe(false);
      expect(data.reason).toBe('deploy-not-confirmed');
      expect('url' in data).toBe(false);
    }, 10000);

    it('verifies successfully once the deploy is confirmed success and the route returns 200 with expected content', async () => {
      const httpServer = http.createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><body><h1>Fixture Post Title</h1></body></html>');
      });
      await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
      const address = httpServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const url = `http://127.0.0.1:${port}/`;

      try {
        process.env.GH_SHIM_DEPLOY_RUNS_JSON = JSON.stringify([{ databaseId: 1, headSha: sha, status: 'completed', conclusion: 'success', url: 'https://x/1' }]);
        const result = await call(server, 'blog_verify_published_url', { mergeCommitSha: sha, url, expectStrings: ['Fixture Post Title'], timeoutSeconds: 5 });
        expect(result.ok).toBe(true);
        const data = result.data as Record<string, unknown>;
        expect(data.verified).toBe(true);
        expect(data.url).toBe(url);
        expect(data.status).toBe(200);
      } finally {
        httpServer.close();
      }
    });

    it('reports content-mismatch (not verified) when the deploy succeeded but expected content is missing', async () => {
      const httpServer = http.createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><body>Something else entirely</body></html>');
      });
      await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
      const address = httpServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const url = `http://127.0.0.1:${port}/`;

      try {
        process.env.GH_SHIM_DEPLOY_RUNS_JSON = JSON.stringify([{ databaseId: 1, headSha: sha, status: 'completed', conclusion: 'success', url: 'https://x/1' }]);
        const result = await call(server, 'blog_verify_published_url', { mergeCommitSha: sha, url, expectStrings: ['Text That Is Not There'], timeoutSeconds: 5 });
        const data = result.data as Record<string, unknown>;
        expect(data.verified).toBe(false);
        expect(data.reason).toBe('content-mismatch');
      } finally {
        httpServer.close();
      }
    });

    it('requires either slug or url', async () => {
      const result = await call(server, 'blog_verify_published_url', { mergeCommitSha: sha });
      expect(result.ok).toBe(false);
      expect(result.kind).toBe('precondition');
    });
  });

  describe('blog_publish_report', () => {
    it('assembles PR status, checks, and deploy without a published URL when not merged', async () => {
      process.env.GH_SHIM_PR_NUMBER = '99';
      process.env.GH_SHIM_STATE = 'OPEN';
      process.env.GH_SHIM_HEAD_SHA = 'e'.repeat(40);
      process.env.GH_SHIM_CHECK_RUNS_JSON = JSON.stringify([checkRun('Documentation links and terminology', 'completed', 'success')]);
      const result = await call(server, 'blog_publish_report', { pr: 99 });
      expect(result.ok).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.pr).toBe(99);
      expect(data.mergeCommitSha).toBeUndefined();
      expect(data.publishedUrl).toBeUndefined();
      delete process.env.GH_SHIM_PR_NUMBER;
      delete process.env.GH_SHIM_STATE;
    });
  });
});
