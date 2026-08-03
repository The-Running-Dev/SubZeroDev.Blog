import http, { type IncomingMessage, type ServerResponse } from 'node:http';

/**
 * Mutable, in-memory state for test/deployment-verifier.test.ts's fake
 * /healthz + /mcp server -- a test mutates this object directly (same
 * process, no IPC needed) to simulate a deployment transitioning between
 * revisions/instances mid-poll, going unauthorized, or serving a malformed
 * payload, then asserts how build/Confirm-BlogMcpDeployment.ps1 reacts.
 */
export interface FakeDeploymentState {
  token: string;
  revision: string;
  instanceId: string;
  healthStatusCode: number;
  /** When set, served verbatim in place of the constructed health payload -- for the malformed/missing-field scenario. */
  healthBodyOverride?: unknown;
  toolNames: string[];
  /** Splits tools/list into two pages (nextCursor) instead of one. */
  paginate: boolean;
  /** Frames every /mcp JSON-RPC response as one `data: ` SSE line instead of a plain JSON body. */
  useSse: boolean;
  /** Defaults to `revision` -- set differently to simulate a runtime/catalog identity mismatch between /healthz and blog_repo_status. */
  repoStatusRevision?: string;
  repoStatusWrite: boolean;
  deleteReceived: boolean;
  requireAuth: boolean;
}

export function defaultFakeDeploymentState(overrides: Partial<FakeDeploymentState> = {}): FakeDeploymentState {
  return {
    token: 'fake-deploy-token',
    revision: 'a'.repeat(40),
    instanceId: 'instance-1',
    healthStatusCode: 200,
    toolNames: ['blog_repo_status', 'blog_prepare_publish_branch', 'blog_restore_paths', 'blog_create_post'],
    paginate: false,
    useSse: false,
    repoStatusWrite: true,
    deleteReceived: false,
    requireAuth: true,
    ...overrides
  };
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: { cursor?: string; name?: string };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown, useSse: boolean): void {
  const text = JSON.stringify(body);
  if (useSse) {
    res.writeHead(status, { 'content-type': 'text/event-stream' });
    res.end(`data: ${text}\n\n`);
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(text);
}

/** Builds a fake server instance around one mutable state object; call .close() on the returned server when done. */
export function createFakeDeploymentServer(state: FakeDeploymentState): http.Server {
  return http.createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const bodyText = await readBody(req);

      if (url.pathname === '/healthz' && req.method === 'GET') {
        if (state.healthBodyOverride !== undefined) {
          send(res, state.healthStatusCode, state.healthBodyOverride, false);
          return;
        }
        send(
          res,
          state.healthStatusCode,
          {
            schema: 'blog-mcp-health/v1',
            ok: true,
            service: 'subzerodev-blog-mcp',
            version: '0.1.0',
            revision: state.revision,
            catalogRevision: state.revision,
            startedAt: new Date(0).toISOString(),
            instanceId: state.instanceId
          },
          false
        );
        return;
      }

      if (url.pathname !== '/mcp') {
        res.writeHead(404);
        res.end();
        return;
      }

      const authorization = req.headers.authorization;
      if (state.requireAuth && authorization !== `Bearer ${state.token}`) {
        send(res, 401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'unauthorized' } }, state.useSse);
        return;
      }

      if (req.method === 'DELETE') {
        state.deleteReceived = true;
        res.writeHead(204);
        res.end();
        return;
      }

      let rpc: JsonRpcRequest;
      try {
        rpc = JSON.parse(bodyText) as JsonRpcRequest;
      } catch {
        send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, state.useSse);
        return;
      }

      if (rpc.method === 'initialize') {
        res.setHeader('Mcp-Session-Id', `fake-session-${Math.random().toString(36).slice(2)}`);
        send(
          res,
          200,
          { jsonrpc: '2.0', id: rpc.id, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fake', version: '0.0.0' } } },
          state.useSse
        );
        return;
      }

      if (rpc.method === 'notifications/initialized') {
        res.writeHead(202);
        res.end();
        return;
      }

      if (rpc.method === 'tools/list') {
        const cursor = rpc.params?.cursor;
        const asTool = (name: string) => ({ name, inputSchema: {} });
        if (state.paginate) {
          const mid = Math.ceil(state.toolNames.length / 2);
          const page = cursor ? state.toolNames.slice(mid) : state.toolNames.slice(0, mid);
          const result: Record<string, unknown> = { tools: page.map(asTool) };
          if (!cursor) result.nextCursor = 'page2';
          send(res, 200, { jsonrpc: '2.0', id: rpc.id, result }, state.useSse);
          return;
        }
        send(res, 200, { jsonrpc: '2.0', id: rpc.id, result: { tools: state.toolNames.map(asTool) } }, state.useSse);
        return;
      }

      if (rpc.method === 'tools/call' && rpc.params?.name === 'blog_repo_status') {
        const revision = state.repoStatusRevision ?? state.revision;
        const write = state.repoStatusWrite;
        send(
          res,
          200,
          {
            jsonrpc: '2.0',
            id: rpc.id,
            result: {
              structuredContent: {
                ok: true,
                kind: 'success',
                summary: 'Repository status',
                data: {
                  revision,
                  catalogRevision: revision,
                  capabilities: { write, remote: true, monitor: true, scheduler: false },
                  capabilityProfile: write ? 'write+remote+monitor' : 'remote+monitor'
                }
              }
            }
          },
          state.useSse
        );
        return;
      }

      send(res, 404, { jsonrpc: '2.0', id: rpc.id ?? null, error: { code: -32601, message: `method not found: ${rpc.method}` } }, state.useSse);
    })();
  });
}
