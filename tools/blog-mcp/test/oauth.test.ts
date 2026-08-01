import crypto from 'node:crypto';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServeServer } from '../src/serve.js';
import { hashPassword, resetAuthStateForTests } from '../src/serve/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PASSWORD = 'correct horse battery staple';
const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abc';

function cookieFrom(res: Response): string {
  const header = res.headers.get('set-cookie');
  if (!header) throw new Error('Expected an OAuth login session cookie.');
  return header.split(';')[0] as string;
}

function requestIdFrom(html: string): string {
  const value = /name="request_id" value="([^"]+)"/.exec(html)?.[1];
  if (!value) throw new Error('Expected an authorization request id.');
  return value;
}

async function responseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text.split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(data ? data.slice('data: '.length) : text) as T;
}

async function registerClient(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Claude test client',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    })
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { client_id: string }).client_id;
}

async function authorize(baseUrl: string, clientId: string, grant: 'requested' | 'read' = 'requested'): Promise<{ code: string; state: string }> {
  const challenge = crypto.createHash('sha256').update(VERIFIER).digest('base64url');
  const authorizeUrl = new URL(`${baseUrl}/oauth/authorize`);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeUrl.searchParams.set('scope', 'blog-mcp:read blog-mcp:write');
  authorizeUrl.searchParams.set('state', 'state-from-client');
  authorizeUrl.searchParams.set('resource', 'http://127.0.0.1/mcp');
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  const initial = await fetch(authorizeUrl);
  expect(initial.status).toBe(200);
  const loginRequestId = requestIdFrom(await initial.text());
  const login = await fetch(`${baseUrl}/oauth/authorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ action: 'login', request_id: loginRequestId, password: PASSWORD })
  });
  expect(login.status).toBe(200);
  const cookie = cookieFrom(login);
  const approvalRequestId = requestIdFrom(await login.text());
  const approval = await fetch(`${baseUrl}/oauth/authorize`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({ action: 'approve', request_id: approvalRequestId, grant })
  });
  expect(approval.status).toBe(302);
  const callback = new URL(approval.headers.get('location') ?? '');
  return { code: callback.searchParams.get('code') as string, state: callback.searchParams.get('state') as string };
}

async function exchangeCode(baseUrl: string, clientId: string, code: string): Promise<{ access_token: string; refresh_token: string; scope: string }> {
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      resource: 'http://127.0.0.1/mcp',
      code,
      code_verifier: VERIFIER
    })
  });
  expect(response.status).toBe(200);
  return await response.json() as { access_token: string; refresh_token: string; scope: string };
}

describe('OAuth remote MCP authorization', () => {
  let baseUrl: string;
  let server: ReturnType<typeof createServeServer>;

  beforeAll(async () => {
    resetAuthStateForTests();
    server = createServeServer({
      repoRoot: REPO_ROOT,
      host: '127.0.0.1',
      port: 0,
      mcpToken: 'legacy-static-token',
      uiPasswordHash: hashPassword(PASSWORD),
      oauthIssuer: 'http://127.0.0.1'
    });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
    resetAuthStateForTests();
  });

  it('publishes OAuth discovery metadata and challenges unauthenticated MCP calls', async () => {
    const metadata = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`);
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({ resource: 'http://127.0.0.1/mcp', authorization_servers: ['http://127.0.0.1'] });

    const mcp = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })
    });
    expect(mcp.status).toBe(401);
    expect(mcp.headers.get('www-authenticate')).toContain('resource_metadata="http://127.0.0.1/.well-known/oauth-protected-resource/mcp"');
  });

  it('uses dynamic registration, PKCE, and an operator login to issue a scoped token', async () => {
    const clientId = await registerClient(baseUrl);
    const authorization = await authorize(baseUrl, clientId);
    expect(authorization.code).toBeTruthy();
    expect(authorization.state).toBe('state-from-client');

    const tokens = await exchangeCode(baseUrl, clientId, authorization.code);
    expect(tokens.scope).toBe('blog-mcp:read blog-mcp:write');
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();

    const initialize = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })
    });
    expect(initialize.status).toBe(200);

    const refreshed = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, resource: 'http://127.0.0.1/mcp', refresh_token: tokens.refresh_token })
    });
    expect(refreshed.status).toBe(200);
    expect(((await refreshed.json()) as { access_token: string }).access_token).not.toBe(tokens.access_token);
  });

  it('can grant only read access and keeps legacy bearer clients compatible', async () => {
    const clientId = await registerClient(baseUrl);
    const authorization = await authorize(baseUrl, clientId, 'read');
    const tokens = await exchangeCode(baseUrl, clientId, authorization.code);
    expect(tokens.scope).toBe('blog-mcp:read');

    const initialize = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'read-only', version: '0' } } })
    });
    expect(initialize.status).toBe(200);
    const sessionId = initialize.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    const listed = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        'mcp-session-id': sessionId as string,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    });
    const listedBody = await responseJson<{ result: { tools: Array<{ name: string }> } }>(listed);
    const names = listedBody.result.tools.map((tool) => tool.name);
    expect(names).toContain('blog_list_posts');
    expect(names).not.toContain('blog_create_post');

    const legacy = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { authorization: 'Bearer legacy-static-token', 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'legacy', version: '0' } } })
    });
    expect(legacy.status).toBe(200);
  });
});
