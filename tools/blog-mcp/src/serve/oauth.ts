import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTHORIZATION_REQUEST_TTL_MS = 10 * 60 * 1000;
// A client with no valid refresh token left is already useless, so tying
// registration lifetime to the refresh token TTL bounds how long an
// abandoned registration lingers without inventing a second policy to reason
// about.
const CLIENT_REGISTRATION_TTL_MS = REFRESH_TOKEN_TTL_MS;
// /oauth/register and /oauth/authorize (GET) are unauthenticated by design --
// required for Dynamic Client Registration and for an unauthenticated client
// to start a login flow -- so without a cap a remote caller could grow these
// process-local Maps without bound and OOM the server. Generous enough for
// real single-operator usage (a handful of MCP clients), tight enough to
// keep worst-case memory bounded.
const MAX_REGISTERED_CLIENTS = 500;
const MAX_PENDING_AUTHORIZATIONS = 500;
const READ_SCOPE = 'blog-mcp:read';
const WRITE_SCOPE = 'blog-mcp:write';
const SUPPORTED_SCOPES = new Set([READ_SCOPE, WRITE_SCOPE]);
const SUPPORTED_GRANT_TYPES = new Set(['authorization_code', 'refresh_token']);

export type OAuthScope = typeof READ_SCOPE | typeof WRITE_SCOPE;

interface RegisteredClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  expiresAt: number;
}

interface PendingAuthorization {
  clientId: string;
  redirectUri: string;
  state?: string;
  requestedScopes: OAuthScope[];
  codeChallenge: string;
  resource: string;
  expiresAt: number;
}

interface AuthorizationCode {
  clientId: string;
  redirectUri: string;
  scopes: OAuthScope[];
  codeChallenge: string;
  resource: string;
  expiresAt: number;
}

interface AccessToken {
  clientId: string;
  scopes: OAuthScope[];
  resource: string;
  expiresAt: number;
}

interface RefreshToken extends AccessToken {}

export interface OAuthLoginResult {
  ok: boolean;
  cookie?: string;
  status?: number;
  error?: string;
}

export interface OAuthServiceOptions {
  /** Public origin of this server, e.g. https://blogging.subzerodev.com. */
  issuer: string;
  /** Uses the existing single-operator UI password and rate limit. */
  login: (password: string) => OAuthLoginResult;
  /** Validates and slides the existing browser session. */
  hasSession: (req: IncomingMessage) => boolean;
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(text)),
    'cache-control': 'no-store',
    ...headers
  });
  res.end(text);
}

function sendHtml(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    ...headers
  });
  res.end(body);
}

async function readBody(req: IncomingMessage, maxBytes = 16 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('Request body too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] as string);
}

function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseScopes(raw: string | null): OAuthScope[] | undefined {
  const scopes = (raw ?? READ_SCOPE).split(' ').filter(Boolean);
  if (scopes.length === 0 || scopes.some((scope) => !SUPPORTED_SCOPES.has(scope))) return undefined;
  return [...new Set(scopes)] as OAuthScope[];
}

function isSafeRedirectUri(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.hash || url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  } catch {
    return false;
  }
}

function normalizeIssuer(raw: string): string {
  const url = new URL(raw);
  const isLocalHttp = url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) throw new Error('OAuth issuer must use HTTPS, except for a loopback development host.');
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('OAuth issuer must be a bare public origin without a path, query, fragment, or credentials.');
  }
  return url.origin;
}

function pkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function isValidVerifier(verifier: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}

function pruneExpired<T extends { expiresAt: number }>(items: Map<string, T>): void {
  const now = Date.now();
  for (const [key, value] of items) {
    if (value.expiresAt <= now) items.delete(key);
  }
}

/**
 * A compact OAuth 2.1 authorization server for this single-operator MCP
 * service. It intentionally issues opaque, process-local tokens: a restart
 * invalidates every code and token, forcing a clean reauthorization rather
 * than leaving durable credentials in the workspace volume.
 */
export class OAuthService {
  readonly issuer: string;
  readonly resource: string;
  readonly protectedResourceMetadataUrl: string;
  private readonly clients = new Map<string, RegisteredClient>();
  private readonly pending = new Map<string, PendingAuthorization>();
  private readonly codes = new Map<string, AuthorizationCode>();
  private readonly accessTokens = new Map<string, AccessToken>();
  private readonly refreshTokens = new Map<string, RefreshToken>();
  private readonly options: OAuthServiceOptions;

  constructor(options: OAuthServiceOptions) {
    this.issuer = normalizeIssuer(options.issuer);
    this.resource = `${this.issuer}/mcp`;
    this.protectedResourceMetadataUrl = `${this.issuer}/.well-known/oauth-protected-resource/mcp`;
    this.options = options;
  }

  authenticate(authorizationHeader: string | undefined): OAuthScope[] | undefined {
    if (!authorizationHeader?.startsWith('Bearer ')) return undefined;
    pruneExpired(this.accessTokens);
    const token = authorizationHeader.slice('Bearer '.length);
    const record = this.accessTokens.get(token);
    if (!record || record.resource !== this.resource) return undefined;
    return record.scopes;
  }

  wwwAuthenticate(): string {
    return `Bearer realm="blog-mcp", resource_metadata="${this.protectedResourceMetadataUrl}"`;
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname === '/.well-known/oauth-protected-resource/mcp' || url.pathname === '/.well-known/oauth-protected-resource') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return true;
      }
      sendJson(res, 200, {
        resource: this.resource,
        authorization_servers: [this.issuer],
        scopes_supported: [READ_SCOPE, WRITE_SCOPE],
        bearer_methods_supported: ['header']
      });
      return true;
    }

    if (url.pathname === '/.well-known/oauth-authorization-server') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return true;
      }
      sendJson(res, 200, {
        issuer: this.issuer,
        authorization_endpoint: `${this.issuer}/oauth/authorize`,
        token_endpoint: `${this.issuer}/oauth/token`,
        registration_endpoint: `${this.issuer}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['none'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: [READ_SCOPE, WRITE_SCOPE]
      });
      return true;
    }

    if (url.pathname === '/oauth/register') {
      await this.handleRegistration(req, res);
      return true;
    }
    if (url.pathname === '/oauth/token') {
      await this.handleToken(req, res);
      return true;
    }
    if (url.pathname === '/oauth/authorize') {
      await this.handleAuthorize(req, res, url);
      return true;
    }
    return false;
  }

  private async handleRegistration(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'POST' });
      return;
    }
    pruneExpired(this.clients);
    if (this.clients.size >= MAX_REGISTERED_CLIENTS) {
      sendJson(res, 503, { error: 'temporarily_unavailable' });
      return;
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req)) as Record<string, unknown>;
    } catch {
      sendJson(res, 400, { error: 'invalid_client_metadata' });
      return;
    }

    const redirectUris = body.redirect_uris;
    const clientName = body.client_name;
    const grantTypes = body.grant_types;
    const responseTypes = body.response_types;
    const tokenAuth = body.token_endpoint_auth_method;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 16 || redirectUris.some((uri) => typeof uri !== 'string' || !isSafeRedirectUri(uri))) {
      sendJson(res, 400, { error: 'invalid_redirect_uri' });
      return;
    }
    const validGrantTypes = grantTypes === undefined ||
      (Array.isArray(grantTypes) && grantTypes.includes('authorization_code') && grantTypes.every((grant) => SUPPORTED_GRANT_TYPES.has(grant)));
    if (!validGrantTypes ||
        (responseTypes !== undefined && (!Array.isArray(responseTypes) || responseTypes.some((response) => response !== 'code'))) ||
        (tokenAuth !== undefined && tokenAuth !== 'none')) {
      sendJson(res, 400, { error: 'invalid_client_metadata' });
      return;
    }

    const clientId = randomToken();
    const client: RegisteredClient = {
      clientId,
      clientName: typeof clientName === 'string' && clientName.length <= 200 ? clientName : 'MCP client',
      redirectUris: redirectUris as string[],
      expiresAt: Date.now() + CLIENT_REGISTRATION_TTL_MS
    };
    this.clients.set(clientId, client);
    sendJson(res, 201, {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    });
  }

  private validateAuthorization(params: URLSearchParams): PendingAuthorization | { error: string } {
    pruneExpired(this.pending);
    const clientId = params.get('client_id');
    const redirectUri = params.get('redirect_uri');
    const responseType = params.get('response_type');
    const codeChallenge = params.get('code_challenge');
    const codeChallengeMethod = params.get('code_challenge_method');
    const resource = params.get('resource') ?? this.resource;
    const scopes = parseScopes(params.get('scope'));
    const client = clientId ? this.clients.get(clientId) : undefined;
    if (!client || !redirectUri || !client.redirectUris.includes(redirectUri)) return { error: 'Unknown client or redirect URI.' };
    if (responseType !== 'code') return { error: 'Only response_type=code is supported.' };
    if (!codeChallenge || codeChallengeMethod !== 'S256') return { error: 'PKCE with code_challenge_method=S256 is required.' };
    if (resource !== this.resource) return { error: 'The requested resource is not this MCP server.' };
    if (!scopes) return { error: `Only ${READ_SCOPE} and ${WRITE_SCOPE} scopes are supported.` };
    return {
      clientId: client.clientId,
      redirectUri,
      ...(params.get('state') ? { state: params.get('state') as string } : {}),
      requestedScopes: scopes,
      codeChallenge,
      resource,
      expiresAt: Date.now() + AUTHORIZATION_REQUEST_TTL_MS
    };
  }

  private authorizationForm(requestId: string, request: PendingAuthorization, error?: string): string {
    const client = this.clients.get(request.clientId);
    const scopes = request.requestedScopes.includes(WRITE_SCOPE)
      ? '<li><strong>Write</strong>: create and update content, branches, commits, and—when enabled by the server—remote publishing.</li><li><strong>Read</strong>: inspect repository and deployment status.</li>'
      : '<li><strong>Read</strong>: inspect repository and deployment status.</li>';
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize Blog-Bot</title><style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1rem;line-height:1.5}button{padding:.65rem 1rem;font:inherit}.warning{color:#9b1c1c}</style><main><h1>Authorize Blog-Bot</h1><p><strong>${escapeHtml(client?.clientName ?? 'MCP client')}</strong> requests access to Blog-Bot.</p>${error ? `<p class="warning">${escapeHtml(error)}</p>` : ''}<ul>${scopes}</ul><form method="post" action="/oauth/authorize"><input type="hidden" name="request_id" value="${escapeHtml(requestId)}"><input type="hidden" name="action" value="approve">${request.requestedScopes.includes(WRITE_SCOPE) ? '<p><label><input type="radio" name="grant" value="requested" checked> Allow requested write access</label><br><label><input type="radio" name="grant" value="read"> Limit to read-only access</label></p>' : ''}<button type="submit">Authorize</button></form><p>Only continue if you started this connection in a client you trust.</p></main></html>`;
  }

  private loginForm(requestId: string, request: PendingAuthorization, error?: string): string {
    const client = this.clients.get(request.clientId);
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in to Blog-Bot</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5}input,button{font:inherit;padding:.65rem;width:100%;box-sizing:border-box}button{margin-top:1rem}.warning{color:#9b1c1c}</style><main><h1>Sign in to Blog-Bot</h1><p>Sign in to authorize <strong>${escapeHtml(client?.clientName ?? 'MCP client')}</strong>.</p>${error ? `<p class="warning">${escapeHtml(error)}</p>` : ''}<form method="post" action="/oauth/authorize"><input type="hidden" name="request_id" value="${escapeHtml(requestId)}"><input type="hidden" name="action" value="login"><label>Password<input type="password" name="password" autocomplete="current-password" required autofocus></label><button type="submit">Sign in</button></form></main></html>`;
  }

  private async handleAuthorize(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (req.method === 'GET') {
      const valid = this.validateAuthorization(url.searchParams);
      if ('error' in valid) {
        sendHtml(res, 400, `<!doctype html><title>Authorization error</title><p>${escapeHtml(valid.error)}</p>`);
        return;
      }
      if (this.pending.size >= MAX_PENDING_AUTHORIZATIONS) {
        sendHtml(res, 503, '<!doctype html><title>Server busy</title><p>Too many pending authorization requests. Try again shortly.</p>');
        return;
      }
      const requestId = randomToken();
      this.pending.set(requestId, valid);
      sendHtml(res, 200, this.options.hasSession(req) ? this.authorizationForm(requestId, valid) : this.loginForm(requestId, valid));
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET, POST' });
      return;
    }

    let params: URLSearchParams;
    try {
      params = new URLSearchParams(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'invalid_request' });
      return;
    }
    pruneExpired(this.pending);
    const requestId = params.get('request_id') ?? '';
    const pending = this.pending.get(requestId);
    if (!pending) {
      sendHtml(res, 400, '<!doctype html><title>Authorization expired</title><p>This authorization request expired. Return to your MCP client and try again.</p>');
      return;
    }

    if (params.get('action') === 'login') {
      const result = this.options.login(params.get('password') ?? '');
      if (!result.ok) {
        sendHtml(res, result.status ?? 401, this.loginForm(requestId, pending, result.error ?? 'Incorrect password.'));
        return;
      }
      sendHtml(res, 200, this.authorizationForm(requestId, pending), result.cookie ? { 'set-cookie': result.cookie } : {});
      return;
    }

    if (params.get('action') !== 'approve' || !this.options.hasSession(req)) {
      sendHtml(res, 401, this.loginForm(requestId, pending, 'Sign in before authorizing this client.'));
      return;
    }
    const grant = params.get('grant') ?? 'requested';
    const scopes: OAuthScope[] = grant === 'read' ? [READ_SCOPE] : pending.requestedScopes;
    if (grant !== 'read' && grant !== 'requested') {
      sendHtml(res, 400, this.authorizationForm(requestId, pending, 'Invalid scope selection.'));
      return;
    }
    this.pending.delete(requestId);
    const code = randomToken();
    this.codes.set(code, {
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      scopes,
      codeChallenge: pending.codeChallenge,
      resource: pending.resource,
      expiresAt: Date.now() + AUTHORIZATION_CODE_TTL_MS
    });
    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set('code', code);
    if (pending.state) redirect.searchParams.set('state', pending.state);
    res.writeHead(302, { location: redirect.toString(), 'cache-control': 'no-store' });
    res.end();
  }

  private issueTokens(record: { clientId: string; scopes: OAuthScope[]; resource: string }): Record<string, unknown> {
    const accessToken = randomToken();
    const refreshToken = randomToken();
    this.accessTokens.set(accessToken, { ...record, expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS });
    this.refreshTokens.set(refreshToken, { ...record, expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refreshToken,
      scope: record.scopes.join(' ')
    };
  }

  private async handleToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'POST' });
      return;
    }
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'invalid_request' });
      return;
    }
    pruneExpired(this.codes);
    pruneExpired(this.refreshTokens);
    const grantType = params.get('grant_type');
    const clientId = params.get('client_id');
    const resource = params.get('resource') ?? this.resource;
    if (!clientId || resource !== this.resource) {
      sendJson(res, 400, { error: 'invalid_request' });
      return;
    }

    if (grantType === 'authorization_code') {
      const code = params.get('code') ?? '';
      const record = this.codes.get(code);
      this.codes.delete(code); // code is one-use even when PKCE verification fails
      const verifier = params.get('code_verifier') ?? '';
      if (!record || record.clientId !== clientId || record.redirectUri !== params.get('redirect_uri') || !isValidVerifier(verifier) || !constantTimeEqual(record.codeChallenge, pkceChallenge(verifier))) {
        sendJson(res, 400, { error: 'invalid_grant' });
        return;
      }
      sendJson(res, 200, this.issueTokens(record));
      return;
    }

    if (grantType === 'refresh_token') {
      const token = params.get('refresh_token') ?? '';
      const record = this.refreshTokens.get(token);
      this.refreshTokens.delete(token); // rotate refresh tokens
      if (!record || record.clientId !== clientId || record.resource !== resource) {
        sendJson(res, 400, { error: 'invalid_grant' });
        return;
      }
      sendJson(res, 200, this.issueTokens(record));
      return;
    }
    sendJson(res, 400, { error: 'unsupported_grant_type' });
  }
}

export const OAUTH_SCOPES = { read: READ_SCOPE, write: WRITE_SCOPE } as const;
