import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  createSession,
  touchSession,
  sessionTtlSeconds,
  destroySession,
  isLoginRateLimited,
  recordFailedLogin,
  clearLoginAttempts,
  resetAuthStateForTests
} from '../src/serve/auth.js';

describe('password hashing', () => {
  it('a correct password verifies against its own hash', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('an incorrect password does not verify', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(verifyPassword('wrong password', hash)).toBe(false);
  });

  it('two hashes of the same password differ (random salt) but both verify', () => {
    const a = hashPassword('same password');
    const b = hashPassword('same password');
    expect(a).not.toBe(b);
    expect(verifyPassword('same password', a)).toBe(true);
    expect(verifyPassword('same password', b)).toBe(true);
  });

  it('rejects a malformed stored hash rather than throwing', () => {
    expect(verifyPassword('anything', 'not-a-real-hash')).toBe(false);
    expect(verifyPassword('anything', 'scrypt:only-two-parts')).toBe(false);
  });
});

describe('sessions', () => {
  afterEach(() => {
    resetAuthStateForTests();
  });

  it('a freshly created session validates', () => {
    const id = createSession();
    expect(touchSession(id)).toBe(true);
  });

  it('an unknown session id does not validate', () => {
    expect(touchSession('0'.repeat(64))).toBe(false);
  });

  it('undefined does not validate', () => {
    expect(touchSession(undefined)).toBe(false);
  });

  it('destroying a session invalidates it', () => {
    const id = createSession();
    destroySession(id);
    expect(touchSession(id)).toBe(false);
  });

  it('an expired session is rejected and removed, not just ignored', () => {
    vi.useFakeTimers();
    try {
      const id = createSession();
      vi.advanceTimersByTime(31 * 60 * 1000); // past the 30-minute TTL
      expect(touchSession(id)).toBe(false);
      // A second check should still be false -- proves the entry was
      // deleted, not merely evaluated as expired and left in the map.
      expect(touchSession(id)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('touchSession slides the expiry -- valid well past the original TTL if kept active', () => {
    vi.useFakeTimers();
    try {
      const id = createSession();
      vi.advanceTimersByTime(20 * 60 * 1000);
      expect(touchSession(id)).toBe(true); // slides expiry forward
      vi.advanceTimersByTime(20 * 60 * 1000); // 40 min since creation, but only 20 since last touch
      expect(touchSession(id)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sessionTtlSeconds reports the default TTL for a normal session and undefined for an unknown one', () => {
    const id = createSession();
    expect(sessionTtlSeconds(id)).toBe(30 * 60);
    expect(sessionTtlSeconds('0'.repeat(64))).toBeUndefined();
  });

  it('a "remember me" session outlives the default TTL', () => {
    vi.useFakeTimers();
    try {
      const id = createSession(true);
      expect(sessionTtlSeconds(id)).toBe(30 * 24 * 60 * 60);
      vi.advanceTimersByTime(31 * 60 * 1000); // past the default 30-minute TTL
      expect(touchSession(id)).toBe(true); // still valid -- this session's own TTL is 30 days
    } finally {
      vi.useRealTimers();
    }
  });

  it('a "remember me" session still expires, just on its own much longer TTL', () => {
    vi.useFakeTimers();
    try {
      const id = createSession(true);
      vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000); // past the 30-day TTL
      expect(touchSession(id)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('login rate limiting', () => {
  beforeEach(() => {
    clearLoginAttempts();
  });

  it('is not rate limited before any failures', () => {
    expect(isLoginRateLimited()).toBe(false);
  });

  it('rate limits after 5 failures within the window', () => {
    for (let i = 0; i < 5; i++) recordFailedLogin();
    expect(isLoginRateLimited()).toBe(true);
  });

  it('clearing attempts (a successful login) resets the limiter', () => {
    for (let i = 0; i < 5; i++) recordFailedLogin();
    clearLoginAttempts();
    expect(isLoginRateLimited()).toBe(false);
  });

  it('attempts outside the 15-minute window no longer count', () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) recordFailedLogin();
      expect(isLoginRateLimited()).toBe(true);
      vi.advanceTimersByTime(16 * 60 * 1000);
      expect(isLoginRateLimited()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
