import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { gitOrThrow } from '../src/exec/git.js';
import { createHttpServer } from '../src/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GH_SHIM_SCRIPT = path.join(__dirname, 'fixtures-bin', 'gh-shim.mjs');

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function parseSseOrJson(body: string): JsonRpcResponse {
  const dataLine = body.split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(dataLine ? dataLine.slice('data: '.length) : body) as JsonRpcResponse;
}

async function postRpc(baseUrl: string, body: unknown): Promise<JsonRpcResponse> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  return parseSseOrJson(text);
}

/**
 * Regression test for a real bug: `stateDir` was threaded into the
 * scheduler *engine*'s own serverOptions (serve-bin.ts) but not into
 * createMcpRequestHandler/createHttpServer's serverOptions, so
 * blog_schedule_publish failed with "no state directory configured" the
 * moment it was called over a real `/mcp` request -- a gap the unit tests
 * in test/tools-scheduler.test.ts never caught, because they build a
 * ToolContext by hand (with stateDir set directly) rather than going
 * through this wiring at all. Caught by a real Docker container run, not
 * by any test that existed before this file.
 */
describe('blog_schedule_publish over a real /mcp request (env-derived capabilities, real wiring)', () => {
  let scratchRoot: string;
  let repo: string;
  let stateDir: string;
  let baseUrl: string;
  let server: ReturnType<typeof createHttpServer>;
  let originalReadOnly: string | undefined;
  let originalRemote: string | undefined;
  let originalScheduler: string | undefined;

  beforeAll(async () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-http-scheduler-'));
    repo = path.join(scratchRoot, 'repo');
    stateDir = path.join(scratchRoot, 'state');

    fs.mkdirSync(repo);
    await gitOrThrow(['init', '-b', 'main'], { repoRoot: repo });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: repo });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: repo });
    fs.writeFileSync(path.join(repo, 'README.md'), '# seed\n');
    await gitOrThrow(['add', 'README.md'], { repoRoot: repo });
    await gitOrThrow(['commit', '-m', 'chore: seed'], { repoRoot: repo });
    await gitOrThrow(['remote', 'add', 'origin', 'https://github.com/test-owner/test-repo.git'], { repoRoot: repo });

    process.env.BLOG_MCP_GH_COMMAND = JSON.stringify(['node', GH_SHIM_SCRIPT]);
    process.env.GH_SHIM_HEAD_SHA = 'c'.repeat(40);

    // Env-derived capabilities (the real /mcp path), not an explicit override.
    originalReadOnly = process.env.BLOG_MCP_READ_ONLY;
    originalRemote = process.env.BLOG_MCP_ALLOW_REMOTE;
    originalScheduler = process.env.BLOG_MCP_ALLOW_SCHEDULER;
    delete process.env.BLOG_MCP_READ_ONLY;
    process.env.BLOG_MCP_ALLOW_REMOTE = '1';
    process.env.BLOG_MCP_ALLOW_SCHEDULER = '1';

    server = createHttpServer({ repoRoot: repo, stateDir, host: '127.0.0.1', port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
    delete process.env.BLOG_MCP_GH_COMMAND;
    delete process.env.GH_SHIM_HEAD_SHA;
    if (originalReadOnly !== undefined) process.env.BLOG_MCP_READ_ONLY = originalReadOnly;
    if (originalRemote !== undefined) process.env.BLOG_MCP_ALLOW_REMOTE = originalRemote;
    else delete process.env.BLOG_MCP_ALLOW_REMOTE;
    if (originalScheduler !== undefined) process.env.BLOG_MCP_ALLOW_SCHEDULER = originalScheduler;
    else delete process.env.BLOG_MCP_ALLOW_SCHEDULER;
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  it('blog_schedule_publish succeeds over a real HTTP /mcp call, not "no state directory configured"', async () => {
    const init = await postRpc(baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0.0.0' } }
    });
    expect(init.error).toBeUndefined();

    const list = await postRpc(baseUrl, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const toolNames = ((list.result as { tools: Array<{ name: string }> })?.tools ?? []).map((t) => t.name);
    expect(toolNames).toContain('blog_schedule_publish');

    const future = new Date(Date.now() + 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const call = await postRpc(baseUrl, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'blog_schedule_publish',
        arguments: { pr: 42, headSha: 'c'.repeat(40), scheduledAt: future, onMissed: { mode: 'catch_up' } }
      }
    });
    const structured = (call.result as { structuredContent?: { ok: boolean; summary: string } })?.structuredContent;
    expect(structured?.summary).not.toContain('no state directory');
    expect(structured?.ok).toBe(true);
    expect(fs.existsSync(path.join(stateDir, 'schedule.json'))).toBe(true);
  });
});
