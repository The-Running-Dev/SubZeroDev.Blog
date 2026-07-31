import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { appendAuditLog } from '../src/exec/auditLog.js';

describe('appendAuditLog', () => {
  let scratchRoot: string | undefined;

  afterEach(() => {
    if (scratchRoot) fs.rmSync(scratchRoot, { recursive: true, force: true });
    scratchRoot = undefined;
  });

  it('is a no-op when no path is given (unset in tests and any caller with no workspace)', () => {
    expect(() => appendAuditLog(undefined, { tool: 'blog_commit', ok: true })).not.toThrow();
  });

  it('creates parent directories and appends a JSON line per call', () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-audit-'));
    const auditLogPath = path.join(scratchRoot, 'state', 'audit.log');

    appendAuditLog(auditLogPath, { tool: 'blog_commit', ok: true, kind: 'success', summary: 'Committed abc123' });
    appendAuditLog(auditLogPath, { tool: 'blog_push', ok: false, kind: 'precondition', summary: 'FAILED: refused' });

    const lines = fs.readFileSync(auditLogPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0] as string);
    expect(first.tool).toBe('blog_commit');
    expect(first.ok).toBe(true);
    expect(typeof first.ts).toBe('string');

    const second = JSON.parse(lines[1] as string);
    expect(second.tool).toBe('blog_push');
    expect(second.ok).toBe(false);
  });

  it('scrubs anything shaped like a GitHub token before it reaches disk', () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-audit-'));
    const auditLogPath = path.join(scratchRoot, 'audit.log');

    appendAuditLog(auditLogPath, {
      tool: 'blog_push',
      ok: false,
      summary: `FAILED: ghp_${'a'.repeat(36)} leaked in a git error`
    });

    const content = fs.readFileSync(auditLogPath, 'utf8');
    expect(content).not.toMatch(/ghp_[A-Za-z0-9]{20,}/);
    expect(content).toContain('[REDACTED]');
  });

  it('never throws even when the path cannot be written to', () => {
    // A path whose parent is a *file*, not a directory -- mkdirSync must fail.
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-audit-'));
    const blocker = path.join(scratchRoot, 'blocker');
    fs.writeFileSync(blocker, 'not a directory');
    const auditLogPath = path.join(blocker, 'nested', 'audit.log');

    expect(() => appendAuditLog(auditLogPath, { tool: 'blog_commit', ok: true })).not.toThrow();
  });
});
