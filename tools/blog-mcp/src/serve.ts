import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { createMcpRequestHandler, defaultAllowedOrigins } from './http.js';
import { handleApiRequest } from './serve/api.js';
import { resolveStaticFile } from './serve/static.js';
import { UI_CAPABILITIES } from './serve/capabilities.js';
import { verifyPassword, isLoginRateLimited, recordFailedLogin, clearLoginAttempts, createSession, touchSession, destroySession } from './serve/auth.js';
import type { CreateServerOptions } from './server.js';

export interface ServeServerOptions {
  repoRoot?: string;
  auditLogPath?: string;
  /** Directory for scheduler state (schedule.json). Threaded into both /mcp (env-derived capabilities, which can include scheduler) and /api's serverOptions. */
  stateDir?: string;
  host?: string;
  port?: number;
  /** Bearer token for /mcp -- same meaning as src/http.ts's. */
  mcpToken?: string;
  /** Read-only bearer token for /mcp -- same meaning as src/http.ts's HttpServerOptions.readOnlyToken. */
  mcpReadOnlyToken?: string;
  /** Origins allowed on /mcp. Defaults to this server's own origin. */
  mcpAllowedOrigins?: string[];
  /** Caps concurrent /mcp sessions -- same meaning as src/http.ts's HttpServerOptions.maxSessions. */
  mcpMaxSessions?: number;
  /** scrypt hash (see src/serve/auth.ts's hashPassword) required for /login. Unset means the UI and /api are entirely disabled -- see the startup warning. */
  uiPasswordHash?: string;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8765;
const SESSION_TTL_SECONDS = 30 * 60; // must match auth.ts's SESSION_TTL_MS -- the cookie's Max-Age is cosmetic (the server-side map is what actually enforces expiry), but a shorter cookie TTL would log a user out client-side before the server session actually expires
const SESSION_COOKIE = 'blog_mcp_session';
const CSRF_HEADER = 'x-blog-mcp-csrf';
const MAX_LOGIN_BODY_BYTES = 4096;
const MAX_API_BODY_BYTES = 2 * 1024 * 1024; // generous for a full post body; still bounded

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text), ...extraHeaders });
  res.end(text);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!key) continue;
    // A malformed percent-encoding (e.g. a stray '%' from a hand-crafted or
    // corrupted Cookie header) makes decodeURIComponent throw URIError --
    // treated as an absent cookie (so touchSession() below just fails auth)
    // rather than crashing the request with an uncaught exception.
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      // skip this cookie
    }
  }
  return cookies;
}

function sessionCookieHeader(id: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function clearedSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

async function readBoundedBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('Request body too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * A same-origin browser request does not reliably send `Origin` (verified
 * against a real browser: a same-origin POST from login.html arrived with
 * no Origin header at all) -- so, same as src/http.ts's `isOriginAllowed`,
 * a *missing* Origin is allowed and only a *present, disallowed* one is
 * rejected. The header this function's name refers to is not the main
 * defense here: `SameSite=Strict` on the session cookie is (the cookie is
 * simply never attached to a cross-site request by a modern browser), and
 * the required custom `X-Blog-Mcp-Csrf` header is the second layer -- a
 * cross-site form/image/script tag cannot set a custom header, so those
 * classic CSRF vectors are blocked regardless of what Origin does or
 * doesn't say. Applied uniformly to every /api method (including GET)
 * rather than only mutating ones, so a later phase's write routes don't
 * need this file touched again.
 */
function isAllowedApiOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  return origin === undefined || allowedOrigins.includes(origin);
}

export function createServeServer(options: ServeServerOptions = {}): http.Server {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const allowedOrigins = options.mcpAllowedOrigins ?? defaultAllowedOrigins(host, port);
  const uiPasswordHash = options.uiPasswordHash;
  const serverOptions: CreateServerOptions = {
    ...(options.repoRoot ? { repoRoot: options.repoRoot } : {}),
    ...(options.auditLogPath ? { auditLogPath: options.auditLogPath } : {}),
    ...(options.stateDir ? { stateDir: options.stateDir } : {}),
    capabilities: UI_CAPABILITIES
  };

  if (!uiPasswordHash) {
    process.stderr.write(
      'blog-mcp serve: BLOG_MCP_UI_PASSWORD_HASH is not set -- /login, the UI, and /api are all disabled. /mcp and /healthz still work.\n'
    );
  }

  const { handler: mcpHandler, close: closeMcp } = createMcpRequestHandler({
    ...(options.repoRoot ? { repoRoot: options.repoRoot } : {}),
    ...(options.auditLogPath ? { auditLogPath: options.auditLogPath } : {}),
    ...(options.stateDir ? { stateDir: options.stateDir } : {}),
    host,
    port,
    ...(options.mcpToken ? { token: options.mcpToken } : {}),
    ...(options.mcpReadOnlyToken ? { readOnlyToken: options.mcpReadOnlyToken } : {}),
    ...(options.mcpMaxSessions !== undefined ? { maxSessions: options.mcpMaxSessions } : {}),
    allowedOrigins
  });

  async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!uiPasswordHash) {
      sendJson(res, 404, { error: 'The UI is disabled -- BLOG_MCP_UI_PASSWORD_HASH is not set.' });
      return;
    }
    // No CSRF-header requirement here (there is no session yet to protect,
    // and a forged cross-site login POST can't do anything useful to the
    // victim -- the resulting Set-Cookie is only readable by the victim's
    // own browser). Origin is still checked, so an untrusted page can't ride
    // a visitor's browser to hammer the login endpoint at all.
    if (!isAllowedApiOrigin(req.headers.origin, allowedOrigins)) {
      sendJson(res, 403, { error: `Origin '${req.headers.origin ?? '(none)'}' is not allowed.` });
      return;
    }
    if (isLoginRateLimited()) {
      sendJson(res, 429, { error: 'Too many failed login attempts. Try again later.' });
      return;
    }

    let password: unknown;
    try {
      const body = await readBoundedBody(req, MAX_LOGIN_BODY_BYTES);
      password = (JSON.parse(body || '{}') as { password?: unknown }).password;
    } catch {
      sendJson(res, 400, { error: 'Invalid request body.' });
      return;
    }

    if (typeof password !== 'string' || !verifyPassword(password, uiPasswordHash)) {
      recordFailedLogin();
      sendJson(res, 401, { error: 'Incorrect password.' });
      return;
    }

    clearLoginAttempts();
    const sessionId = createSession();
    sendJson(res, 200, { ok: true }, { 'set-cookie': sessionCookieHeader(sessionId, SESSION_TTL_SECONDS) });
  }

  function handleLogout(req: IncomingMessage, res: ServerResponse): void {
    const cookies = parseCookies(req.headers.cookie);
    destroySession(cookies[SESSION_COOKIE]);
    sendJson(res, 200, { ok: true }, { 'set-cookie': clearedSessionCookieHeader() });
  }

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (!uiPasswordHash) {
      sendJson(res, 404, { error: 'The UI is disabled -- BLOG_MCP_UI_PASSWORD_HASH is not set.' });
      return;
    }
    if (!isAllowedApiOrigin(req.headers.origin, allowedOrigins)) {
      sendJson(res, 403, { error: `Origin '${req.headers.origin ?? '(none)'}' is not allowed.` });
      return;
    }
    if (!req.headers[CSRF_HEADER]) {
      sendJson(res, 403, { error: `Missing required '${CSRF_HEADER}' header.` });
      return;
    }
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[SESSION_COOKIE];
    if (!sessionId || !touchSession(sessionId)) {
      sendJson(res, 401, { error: 'Not authenticated.' });
      return;
    }
    // Slides the cookie's own Max-Age to match the server-side expiry that
    // touchSession() just extended -- without this, the browser would
    // silently drop the cookie 30 minutes after login regardless of
    // continued activity, even though the server still considers the
    // session valid.
    const refreshedCookie = sessionCookieHeader(sessionId, SESSION_TTL_SECONDS);

    let parsedBody: unknown;
    if (req.method === 'POST') {
      try {
        const raw = await readBoundedBody(req, MAX_API_BODY_BYTES);
        parsedBody = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body.' }, { 'set-cookie': refreshedCookie });
        return;
      }
    }

    const result = await handleApiRequest(url.pathname, req.method ?? 'GET', url, serverOptions, parsedBody);
    if (!result) {
      sendJson(res, 404, { error: 'Not found.' }, { 'set-cookie': refreshedCookie });
      return;
    }
    sendJson(res, result.status, result.body, { 'set-cookie': refreshedCookie });
  }

  function handleStatic(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const file = resolveStaticFile(pathname);
    if (!file) return false;
    res.writeHead(200, {
      'content-type': file.contentType,
      'content-length': file.body.length,
      // Static UI only -- no inline scripts, no CDN assets (src/serve/api.ts
      // is same-origin JSON, and PR/review-thread bodies rendered into the
      // page are author-controlled text that must never execute).
      'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'"
    });
    res.end(req.method === 'HEAD' ? undefined : file.body);
    return true;
  }

  const httpServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`);

        if (url.pathname === '/mcp' || url.pathname === '/healthz') {
          await mcpHandler(req, res);
          return;
        }
        if (url.pathname === '/login' && req.method === 'POST') {
          await handleLogin(req, res);
          return;
        }
        if (url.pathname === '/logout' && req.method === 'POST') {
          handleLogout(req, res);
          return;
        }
        if (url.pathname.startsWith('/api/')) {
          await handleApi(req, res, url);
          return;
        }
        if (url.pathname === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
          // Server-side gate on the shell itself, in addition to app.js's
          // client-side redirect on a 401 from /api -- defense in depth, not
          // a replacement for the /api auth check, which is what actually
          // protects repo data.
          const cookies = parseCookies(req.headers.cookie);
          const sessionId = cookies[SESSION_COOKIE];
          if (!sessionId || !touchSession(sessionId)) {
            res.writeHead(302, { location: '/login' });
            res.end();
            return;
          }
          // Same sliding-expiry refresh as handleApi -- otherwise a user who
          // only ever reloads '/' (never hitting /api) would still get
          // logged out client-side after 30 minutes despite staying active.
          res.setHeader('set-cookie', sessionCookieHeader(sessionId, SESSION_TTL_SECONDS));
        }
        if (handleStatic(req, res, url.pathname)) {
          return;
        }

        sendJson(res, 404, { error: 'Not found.' });
      } catch (err) {
        process.stderr.write(`blog-mcp serve: unhandled request error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
        if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error.' });
      }
    })();
  });

  // Same reasoning as src/http.ts's createHttpServer: stop the idle-session
  // sweeper and drain any open /mcp sessions once this server actually
  // closes, rather than leaking both.
  httpServer.on('close', closeMcp);

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    process.stderr.write(`blog-mcp serve: failed to start on ${host}:${port}: ${err.message}\n`);
    process.exit(1);
  });

  httpServer.listen(port, host, () => {
    const address = httpServer.address();
    const boundPort = typeof address === 'object' && address ? address.port : port;
    process.stderr.write(`subzerodev-blog-mcp serve listening on http://${host}:${boundPort}/ (mcp: /mcp, health: /healthz)\n`);
  });

  return httpServer;
}
