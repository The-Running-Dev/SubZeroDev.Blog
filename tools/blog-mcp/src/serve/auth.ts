import crypto from 'node:crypto';

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes, sliding on every authenticated request
const REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, sliding the same way, opted into via /login's "remember me"
const SCRYPT_KEYLEN = 64;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * Deliberately a separate secret from BLOG_MCP_HTTP_TOKEN: one is a machine
 * bearer token for /mcp, the other is a password a human types into a
 * browser login form. Conflating the two would mean the same value sits in
 * shell history/ps *and* a browser's autofill store -- two very different
 * exposure profiles for one secret.
 */
export interface Session {
  expiresAt: number;
  /** Fixed at creation by the "remember me" choice; each touchSession() slide re-applies this same duration rather than the global default. */
  ttlMs: number;
}

const sessions = new Map<string, Session>();
let loginAttempts: number[] = [];

/** Format: `scrypt:<saltHex>:<hashHex>`. Generate one with `node -e "console.log(require('./dist/serve/auth.js').hashPassword(process.argv[1]))" '<password>'` after building, and set it as BLOG_MCP_UI_PASSWORD_HASH -- never the raw password. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1] as string, 'hex');
  const expected = Buffer.from(parts[2] as string, 'hex');
  if (expected.length === 0) return false;
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function pruneLoginAttempts(): void {
  const cutoff = Date.now() - LOGIN_WINDOW_MS;
  loginAttempts = loginAttempts.filter((t) => t > cutoff);
}

/** A single global counter, not per-IP -- this is a single-operator tool meant to be bound to loopback or fronted by a trusted proxy, not a multi-tenant service, so the simple version is proportionate. */
export function isLoginRateLimited(): boolean {
  pruneLoginAttempts();
  return loginAttempts.length >= MAX_LOGIN_ATTEMPTS;
}

export function recordFailedLogin(): void {
  pruneLoginAttempts();
  loginAttempts.push(Date.now());
}

export function clearLoginAttempts(): void {
  loginAttempts = [];
}

/** 256 bits of randomness, never derived from or equal to the password/hash. `remember` picks a 30-day TTL over the default 30-minute one; it never changes what's stored (still just an opaque id), only how long the server will honor it. */
export function createSession(remember = false): string {
  const id = crypto.randomBytes(32).toString('hex');
  const ttlMs = remember ? REMEMBER_SESSION_TTL_MS : SESSION_TTL_MS;
  sessions.set(id, { expiresAt: Date.now() + ttlMs, ttlMs });
  return id;
}

/** Validates and slides the session's expiry in one step, using whichever TTL was fixed at creation. Deletes (rather than merely ignoring) an expired entry so the map doesn't grow unbounded with stale sessions. */
export function touchSession(id: string | undefined): boolean {
  if (!id) return false;
  const session = sessions.get(id);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    sessions.delete(id);
    return false;
  }
  session.expiresAt = Date.now() + session.ttlMs;
  return true;
}

/** The cookie Max-Age (seconds) that matches this session's own TTL, for keeping the client-side cookie lifetime in sync with server-side expiry -- callers should use this instead of assuming the default TTL, since a "remembered" session's is much longer. Returns undefined for an unknown session. */
export function sessionTtlSeconds(id: string | undefined): number | undefined {
  if (!id) return undefined;
  const session = sessions.get(id);
  return session ? Math.round(session.ttlMs / 1000) : undefined;
}

export function destroySession(id: string | undefined): void {
  if (id) sessions.delete(id);
}

/** Test-only: session/rate-limit state is otherwise process-lifetime, module-level. */
export function resetAuthStateForTests(): void {
  sessions.clear();
  loginAttempts = [];
}
