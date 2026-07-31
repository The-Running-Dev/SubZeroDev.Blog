import crypto from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, type CreateServerOptions } from './server.js';

export interface HttpServerOptions {
  repoRoot?: string;
  auditLogPath?: string;
  host?: string;
  port?: number;
  /** Bearer token required on every request. If unset, the server logs a warning and allows unauthenticated access -- acceptable only because the default bind is loopback-only. */
  token?: string;
  /** Origins allowed to talk to this server (browser-based clients send Origin; CLI/server clients typically don't). Defaults to the server's own http://<host>:<port>. */
  allowedOrigins?: string[];
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8765;

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function rpcError(res: ServerResponse, status: number, code: number, message: string): void {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
}

function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  // No Origin header at all is normal for non-browser clients (curl, another
  // server, a CLI) -- only browser-issued requests send it, and those are
  // exactly what Origin validation exists to constrain.
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

/**
 * Builds the `/healthz` + `/mcp` request handler, self-contained (its own
 * top-level error handling, never rejects) so it can be mounted either as a
 * whole server's only handler (createHttpServer below) or as one path
 * range inside a bigger handler (src/serve.ts's `/mcp`, alongside `/api` and
 * the static UI, in a later phase). Deliberately stateless: every request
 * gets a fresh McpServer + StreamableHTTPServerTransport (sessionIdGenerator:
 * undefined), matching how this server is already meant to run -- spawned
 * per session by its caller -- rather than adding session-store lifecycle
 * management (resumable SSE streams, an EventStore) that this deployment
 * model doesn't need.
 */
export function createMcpRequestHandler(options: HttpServerOptions = {}): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const token = options.token;
  const allowedOrigins = options.allowedOrigins ?? [`http://${host}:${port}`, `http://localhost:${port}`];
  const serverOptions: CreateServerOptions = {
    ...(options.repoRoot ? { repoRoot: options.repoRoot } : {}),
    ...(options.auditLogPath ? { auditLogPath: options.auditLogPath } : {})
  };

  if (!token) {
    process.stderr.write(
      'blog-mcp http: BLOG_MCP_HTTP_TOKEN is not set -- running without bearer auth. Safe only because the default bind is loopback-only; do not do this while bound to a non-loopback host.\n'
    );
  }

  async function handleIncoming(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Parsing can throw on a malformed request line/Host header; keep this
    // inside the try/catch below rather than letting it throw before any
    // handler is attached.
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`);

    if (url.pathname === '/healthz') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname !== '/mcp') {
      rpcError(res, 404, -32000, 'Not found.');
      return;
    }

    if (!isOriginAllowed(req.headers.origin, allowedOrigins)) {
      rpcError(res, 403, -32000, `Origin '${req.headers.origin}' is not allowed.`);
      return;
    }

    if (token) {
      const authHeader = req.headers.authorization ?? '';
      const expected = `Bearer ${token}`;
      if (!timingSafeEqual(authHeader, expected)) {
        rpcError(res, 401, -32000, 'Unauthorized.');
        return;
      }
    }

    if (req.method !== 'POST') {
      rpcError(res, 405, -32000, 'Method not allowed. This is a stateless server: only POST /mcp is supported.');
      return;
    }

    const server = createServer(serverOptions);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    // Registered before awaiting anything below: an early client disconnect
    // can fire 'close' while connect()/handleRequest() are still in flight,
    // and a listener attached only in a later `finally` would miss it,
    // leaking this request's server/transport.
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      transport.close();
      server.close();
    };
    res.once('close', cleanup);

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      process.stderr.write(`blog-mcp http: request failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      if (!res.headersSent) {
        rpcError(res, 500, -32603, 'Internal server error.');
      }
      cleanup();
    }
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      await handleIncoming(req, res);
    } catch (err) {
      process.stderr.write(`blog-mcp http: unhandled request error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      if (!res.headersSent) {
        rpcError(res, 400, -32000, 'Bad request.');
      }
    }
  };
}

/** Standalone `/mcp`-only server: `createMcpRequestHandler` is the entire handler. */
export function createHttpServer(options: HttpServerOptions = {}): http.Server {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const handler = createMcpRequestHandler(options);

  const httpServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    void handler(req, res);
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    process.stderr.write(`blog-mcp http: failed to start on ${host}:${port}: ${err.message}\n`);
    process.exit(1);
  });

  httpServer.listen(port, host, () => {
    const address = httpServer.address();
    const boundPort = typeof address === 'object' && address ? address.port : port;
    process.stderr.write(`subzerodev-blog-mcp listening on http://${host}:${boundPort}/mcp (health: /healthz)\n`);
  });

  return httpServer;
}
