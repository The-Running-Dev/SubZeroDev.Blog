import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createHttpServer } from '../src/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function parseSseOrJson(body: string): JsonRpcResponse {
  // StreamableHTTPServerTransport replies with either a plain JSON body or
  // one `data:` SSE frame per message; both are valid per the spec.
  const dataLine = body.split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(dataLine ? dataLine.slice('data: '.length) : body) as JsonRpcResponse;
}

async function postRpc(baseUrl: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json?: JsonRpcResponse }> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, json: text ? parseSseOrJson(text) : undefined };
}

describe('HTTP transport', () => {
  let baseUrl: string;
  let server: ReturnType<typeof createHttpServer>;

  beforeAll(async () => {
    server = createHttpServer({ repoRoot: REPO_ROOT, host: '127.0.0.1', port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
  });

  it('GET /healthz returns 200 without auth', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('unknown paths return 404', async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });

  it('POST /mcp with no token configured allows the request and initializes', async () => {
    const { status, json } = await postRpc(baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0.0.0' } }
    });
    expect(status).toBe(200);
    expect(json?.error).toBeUndefined();
    expect((json?.result as { serverInfo?: { name?: string } })?.serverInfo?.name).toBe('subzerodev-blog-mcp');
  });

  it('GET /mcp is not allowed (stateless server)', async () => {
    const res = await fetch(`${baseUrl}/mcp`);
    expect(res.status).toBe(405);
  });

  it('DELETE /mcp is not allowed (stateless server)', async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: 'DELETE' });
    expect(res.status).toBe(405);
  });

  it('a full initialize -> tools/list -> tools/call round trip works end to end', async () => {
    const init = await postRpc(baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0.0.0' } }
    });
    expect(init.status).toBe(200);

    const list = await postRpc(baseUrl, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const toolNames = ((list.json?.result as { tools: Array<{ name: string }> })?.tools ?? []).map((t) => t.name);
    expect(toolNames).toContain('blog_validate_posts');

    const call = await postRpc(baseUrl, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'blog_validate_posts', arguments: {} } });
    expect(call.status).toBe(200);
    const structured = (call.json?.result as { structuredContent?: { ok: boolean } })?.structuredContent;
    expect(structured?.ok).toBe(true);
  });
});

describe('HTTP transport with bearer auth', () => {
  let baseUrl: string;
  let server: ReturnType<typeof createHttpServer>;
  const token = 'test-secret-token';

  beforeAll(async () => {
    server = createHttpServer({ repoRoot: REPO_ROOT, host: '127.0.0.1', port: 0, token });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
  });

  const initBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0.0.0' } }
  };

  it('rejects a request with no Authorization header', async () => {
    const { status } = await postRpc(baseUrl, initBody);
    expect(status).toBe(401);
  });

  it('rejects a request with the wrong token', async () => {
    const { status } = await postRpc(baseUrl, initBody, { authorization: 'Bearer wrong-token' });
    expect(status).toBe(401);
  });

  it('accepts a request with the correct token', async () => {
    const { status, json } = await postRpc(baseUrl, initBody, { authorization: `Bearer ${token}` });
    expect(status).toBe(200);
    expect(json?.error).toBeUndefined();
  });
});

describe('HTTP transport Origin validation', () => {
  let baseUrl: string;
  let server: ReturnType<typeof createHttpServer>;

  beforeAll(async () => {
    server = createHttpServer({ repoRoot: REPO_ROOT, host: '127.0.0.1', port: 0, allowedOrigins: ['https://allowed.example'] });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
  });

  const initBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0.0.0' } }
  };

  it('allows a request with no Origin header (non-browser clients)', async () => {
    const { status } = await postRpc(baseUrl, initBody);
    expect(status).toBe(200);
  });

  it('allows a request from an explicitly allowed Origin', async () => {
    const { status } = await postRpc(baseUrl, initBody, { origin: 'https://allowed.example' });
    expect(status).toBe(200);
  });

  it('rejects a request from a disallowed Origin', async () => {
    const { status } = await postRpc(baseUrl, initBody, { origin: 'https://evil.example' });
    expect(status).toBe(403);
  });
});
