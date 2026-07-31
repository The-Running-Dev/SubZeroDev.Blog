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

async function postRpc(
  baseUrl: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; json?: JsonRpcResponse; sessionId?: string }> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, json: text ? parseSseOrJson(text) : undefined, sessionId: res.headers.get('mcp-session-id') ?? undefined };
}

const initBody = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0.0.0' } }
};

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

  it('GET /mcp with no Mcp-Session-Id header is a 400, not a 405', async () => {
    const res = await fetch(`${baseUrl}/mcp`, { headers: { accept: 'text/event-stream' } });
    expect(res.status).toBe(400);
  });

  it('DELETE /mcp with no Mcp-Session-Id header is a 400, not a 405', async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: 'DELETE' });
    expect(res.status).toBe(400);
  });

  it('GET /mcp with an unknown session id is a 404', async () => {
    const res = await fetch(`${baseUrl}/mcp`, { headers: { accept: 'text/event-stream', 'mcp-session-id': 'not-a-real-session' } });
    expect(res.status).toBe(404);
  });

  it('DELETE /mcp with an unknown session id is a 404', async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: 'DELETE', headers: { 'mcp-session-id': 'not-a-real-session' } });
    expect(res.status).toBe(404);
  });

  it('a full initialize -> tools/list -> tools/call round trip works end to end, threading the session id like a real client', async () => {
    const init = await postRpc(baseUrl, initBody);
    expect(init.status).toBe(200);
    expect(init.sessionId).toBeTruthy();
    const sessionHeader = { 'mcp-session-id': init.sessionId as string };

    const list = await postRpc(baseUrl, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sessionHeader);
    const toolNames = ((list.json?.result as { tools: Array<{ name: string }> })?.tools ?? []).map((t) => t.name);
    expect(toolNames).toContain('blog_validate_posts');

    const call = await postRpc(
      baseUrl,
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'blog_validate_posts', arguments: {} } },
      sessionHeader
    );
    expect(call.status).toBe(200);
    const structured = (call.json?.result as { structuredContent?: { ok: boolean } })?.structuredContent;
    expect(structured?.ok).toBe(true);
  });

  it('a POST reusing an unknown session id is a 404, not silently starting a new session', async () => {
    const res = await postRpc(baseUrl, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, { 'mcp-session-id': 'not-a-real-session' });
    expect(res.status).toBe(404);
  });

  it('GET opens a live SSE stream for an initialized session', async () => {
    const init = await postRpc(baseUrl, initBody);
    const sessionId = init.sessionId as string;
    expect(sessionId).toBeTruthy();

    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/mcp`, {
      headers: { accept: 'text/event-stream', 'mcp-session-id': sessionId },
      signal: controller.signal
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    controller.abort();
  });

  it('DELETE terminates a session, and it is unusable afterward', async () => {
    const init = await postRpc(baseUrl, initBody);
    const sessionId = init.sessionId as string;
    expect(sessionId).toBeTruthy();

    const del = await fetch(`${baseUrl}/mcp`, { method: 'DELETE', headers: { 'mcp-session-id': sessionId } });
    expect(del.status).toBe(200);

    const after = await postRpc(baseUrl, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, { 'mcp-session-id': sessionId });
    expect(after.status).toBe(404);
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

describe('HTTP transport session admission control and shutdown', () => {
  it('rejects a new session with 503 once maxSessions is reached, and admits one again after the existing session is deleted', async () => {
    const server = createHttpServer({ repoRoot: REPO_ROOT, host: '127.0.0.1', port: 0, maxSessions: 1 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const first = await postRpc(baseUrl, initBody);
    expect(first.status).toBe(200);
    expect(first.sessionId).toBeTruthy();

    const second = await postRpc(baseUrl, { ...initBody, id: 2 });
    expect(second.status).toBe(503);

    const del = await fetch(`${baseUrl}/mcp`, { method: 'DELETE', headers: { 'mcp-session-id': first.sessionId as string } });
    expect(del.status).toBe(200);

    const third = await postRpc(baseUrl, { ...initBody, id: 3 });
    expect(third.status).toBe(200);
    expect(third.sessionId).toBeTruthy();

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('closing the server tears down the idle-session sweeper and any open sessions without hanging', async () => {
    const server = createHttpServer({ repoRoot: REPO_ROOT, host: '127.0.0.1', port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const init = await postRpc(baseUrl, initBody);
    expect(init.sessionId).toBeTruthy();

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server.close() did not complete in time')), 2000);
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  });
});
