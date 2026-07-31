import crypto from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, type CreateServerOptions } from './server.js';
import { READONLY_CAPABILITIES, type Capabilities } from './tools/context.js';

export interface HttpServerOptions {
  repoRoot?: string;
  auditLogPath?: string;
  /** Directory for scheduler state (schedule.json). Required for blog_schedule_* tools to work when registered (BLOG_MCP_ALLOW_SCHEDULER=1). */
  stateDir?: string;
  host?: string;
  port?: number;
  /** Bearer token required on every request. If unset, the server logs a warning and allows unauthenticated access -- acceptable only because the default bind is loopback-only. */
  token?: string;
  /**
   * A second, more restricted bearer token. A session initialized with this
   * token instead of `token` gets READONLY_CAPABILITIES forced onto it
   * (write/remote/scheduler off) regardless of BLOG_MCP_READ_ONLY/
   * BLOG_MCP_ALLOW_REMOTE/etc. -- lets you hand a separate, capped credential
   * to a third-party MCP client (a ChatGPT Developer Mode connector, for
   * example) without granting it the same repo-mutating capability as your
   * own tooling's token. Both tokens are independently valid on every
   * request; only session *creation* (the initialize POST) is where the
   * capability tier is decided and then locked in for that session's
   * lifetime.
   */
  readOnlyToken?: string;
  /** Origins allowed to talk to this server (browser-based clients send Origin; CLI/server clients typically don't). Defaults to the server's own http://<host>:<port>. */
  allowedOrigins?: string[];
  /** Caps concurrent MCP sessions (each holds its own McpServer instance). A POST that would create a session beyond this limit is rejected with 503 rather than admitted -- otherwise a reachable client (more likely if BLOG_MCP_HTTP_TOKEN is unset) could keep initializing new sessions and hold them all open until the 30-minute idle reap. */
  maxSessions?: number;
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
 * Default Origin allowlist when the caller doesn't pass one explicitly.
 * Deliberately NOT `http://${host}:${port}` alone: `host` is frequently
 * `0.0.0.0` (docker-compose.yml fixes it there, since Docker's port
 * publishing cannot forward into a container's loopback interface) or
 * `::`, and no browser ever sends `Origin: http://0.0.0.0:<port>` -- that's
 * a bind address, not a URL a client navigates to. Always include
 * `127.0.0.1` and `localhost` (the two ways a browser actually reaches a
 * published port) in addition to whatever `host` literally is, so the
 * default doesn't silently reject every real browser request the moment
 * the server binds to a wildcard address.
 */
export function defaultAllowedOrigins(host: string, port: number): string[] {
  return [...new Set([`http://${host}:${port}`, `http://127.0.0.1:${port}`, `http://localhost:${port}`])];
}

interface McpSession {
  server: ReturnType<typeof createServer>;
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

/** No request (POST reusing the session, or GET) for this long reaps the session -- matches src/serve/auth.ts's UI session TTL for consistency, not a spec requirement. Guards against a crashed/disappeared client that never sends DELETE leaking its McpServer forever. */
const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
const SESSION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 100;

function extractSessionId(req: IncomingMessage): string | undefined {
  const header = req.headers['mcp-session-id'];
  return Array.isArray(header) ? header[0] : header;
}

/**
 * Builds the `/healthz` + `/mcp` request handler, self-contained (its own
 * top-level error handling, never rejects) so it can be mounted either as a
 * whole server's only handler (createHttpServer below) or as one path
 * range inside a bigger handler (src/serve.ts's `/mcp`, alongside `/api` and
 * the static UI).
 *
 * Session-based, per the MCP Streamable HTTP spec: a `POST` with no
 * `Mcp-Session-Id` header either is an `initialize` request (a new session is
 * created and its id returned) or isn't (StreamableHTTPServerTransport itself
 * makes that call and responds 400) -- see
 * node_modules/@modelcontextprotocol/sdk's webStandardStreamableHttp.js
 * `handlePostRequest`. A `POST`/`GET`/`DELETE` with a known `Mcp-Session-Id`
 * reuses that session's transport; `GET` opens a live SSE stream for
 * server-to-client notifications, `DELETE` terminates the session. There is
 * deliberately no `EventStore`: a dropped `GET` stream does not replay missed
 * messages, the client just reissues a fresh `GET` -- full resumability is a
 * separate feature this deployment model (a handful of long-lived clients,
 * not thousands of flaky mobile ones) doesn't need yet.
 */
export interface McpRequestHandler {
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  /** Stops the idle-session sweeper and closes every live session's transport + McpServer. Call when the owning HTTP server closes, so repeated handler construction (tests, hot reload) doesn't accumulate background timers and abandoned sessions. */
  close: () => void;
}

export function createMcpRequestHandler(options: HttpServerOptions = {}): McpRequestHandler {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const token = options.token;
  const readOnlyToken = options.readOnlyToken;
  const allowedOrigins = options.allowedOrigins ?? defaultAllowedOrigins(host, port);
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const serverOptions: CreateServerOptions = {
    ...(options.repoRoot ? { repoRoot: options.repoRoot } : {}),
    ...(options.auditLogPath ? { auditLogPath: options.auditLogPath } : {}),
    ...(options.stateDir ? { stateDir: options.stateDir } : {})
  };

  if (!token && !readOnlyToken) {
    process.stderr.write(
      'blog-mcp http: BLOG_MCP_HTTP_TOKEN is not set -- running without bearer auth. Safe only because the default bind is loopback-only; do not do this while bound to a non-loopback host.\n'
    );
  }

  const sessions = new Map<string, McpSession>();

  const sweep = setInterval(() => {
    const cutoff = Date.now() - SESSION_IDLE_TTL_MS;
    for (const session of sessions.values()) {
      // transport.close() fires the onclose handler below, which removes it
      // from `sessions` -- deleting here too would just be redundant.
      if (session.lastActivity < cutoff) void session.transport.close();
    }
  }, SESSION_SWEEP_INTERVAL_MS);
  sweep.unref(); // never keeps the process alive on its own

  async function handleNewSession(req: IncomingMessage, res: ServerResponse, capabilities: Capabilities | undefined): Promise<void> {
    const server = createServer(capabilities ? { ...serverOptions, capabilities } : serverOptions);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, { server, transport, lastActivity: Date.now() });
      }
    });

    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      transport.close();
      server.close();
    };
    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId) sessions.delete(sessionId);
      // server.close() just delegates to transport.close() (see Protocol.close
      // in the SDK), which is idempotent (guarded by _closed) -- so this is
      // always safe here, whether onclose fired from a DELETE, the idle
      // sweep, or cleanup() below, and never double-frees anything.
      void server.close();
    };
    // Registered before awaiting anything below: an early client disconnect
    // can fire 'close' while connect()/handleRequest() are still in flight.
    // Only tears down here if this request never actually established a
    // session (disconnected mid-initialize, or turned out not to be an
    // initialize request at all) -- a genuinely new session must survive
    // past its own first response closing, since later POST/GET/DELETE
    // calls reuse this same transport by session id.
    res.once('close', () => {
      if (!transport.sessionId) cleanup();
    });

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

  async function handleExistingSession(req: IncomingMessage, res: ServerResponse, session: McpSession): Promise<void> {
    session.lastActivity = Date.now();
    try {
      await session.transport.handleRequest(req, res);
    } catch (err) {
      process.stderr.write(`blog-mcp http: request failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      if (!res.headersSent) {
        rpcError(res, 500, -32603, 'Internal server error.');
      }
    }
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

    // Read-only checked first: if an operator ever sets both tokens to the
    // same value by mistake, a match should resolve to the *less* privileged
    // outcome, not silently grant full capabilities.
    let capabilitiesOverride: Capabilities | undefined;
    if (token || readOnlyToken) {
      const authHeader = req.headers.authorization ?? '';
      const matchesReadOnly = readOnlyToken !== undefined && timingSafeEqual(authHeader, `Bearer ${readOnlyToken}`);
      const matchesFull = token !== undefined && timingSafeEqual(authHeader, `Bearer ${token}`);
      if (!matchesReadOnly && !matchesFull) {
        rpcError(res, 401, -32000, 'Unauthorized.');
        return;
      }
      if (matchesReadOnly) {
        capabilitiesOverride = READONLY_CAPABILITIES;
      }
    }

    const sessionId = extractSessionId(req);

    // GET (open the SSE stream) and DELETE (terminate) both only make sense
    // against an already-initialized session -- there is no "create a
    // session via GET/DELETE" in the spec, unlike POST.
    if (req.method === 'GET' || req.method === 'DELETE') {
      if (!sessionId) {
        rpcError(res, 400, -32000, 'Mcp-Session-Id header is required.');
        return;
      }
      const session = sessions.get(sessionId);
      if (!session) {
        rpcError(res, 404, -32001, 'Session not found.');
        return;
      }
      await handleExistingSession(req, res, session);
      return;
    }

    if (req.method !== 'POST') {
      rpcError(res, 405, -32000, 'Method not allowed. Supported methods: GET, POST, DELETE.');
      return;
    }

    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        rpcError(res, 404, -32001, 'Session not found.');
        return;
      }
      await handleExistingSession(req, res, session);
      return;
    }

    // A reachable, unauthenticated client (or just a misbehaving one) could
    // otherwise keep initializing sessions forever, each holding its own
    // McpServer, until the 30-minute idle reap -- cap admission instead.
    if (sessions.size >= maxSessions) {
      rpcError(res, 503, -32000, 'Too many concurrent sessions. Try again later.');
      return;
    }

    await handleNewSession(req, res, capabilitiesOverride);
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      await handleIncoming(req, res);
    } catch (err) {
      process.stderr.write(`blog-mcp http: unhandled request error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      if (!res.headersSent) {
        rpcError(res, 400, -32000, 'Bad request.');
      }
    }
  };

  const close = (): void => {
    clearInterval(sweep);
    for (const session of sessions.values()) {
      void session.transport.close();
    }
  };

  return { handler, close };
}

/** Standalone `/mcp`-only server: `createMcpRequestHandler` is the entire handler. */
export function createHttpServer(options: HttpServerOptions = {}): http.Server {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const { handler, close } = createMcpRequestHandler(options);

  const httpServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    void handler(req, res);
  });

  // Fires once, after the server stops accepting connections and all
  // existing ones have ended -- the right moment to stop the idle-session
  // sweeper and drain any sessions still open, rather than leaking both.
  httpServer.on('close', close);

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
