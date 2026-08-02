import fs from 'node:fs';
import path from 'node:path';
import { scrubSecrets } from './scrub.js';

export interface AuditEntry {
  tool: string;
  ok: boolean;
  kind?: string;
  summary?: string;
  /** Every repo-relative path a write actually touched -- PostWriteResult.changedPaths, or blog_add_tag's/blog_add_author's single `path`, when the tool returned one. TODO-NEXT.md sec3.3: generated metadata defaults must be visible, not silent. */
  changedPaths?: string[];
  /** Author/tag keys the tool auto-created (PostWriteResult.createdAuthors/createdTags, or blog_add_tag/blog_add_author's own `key`), so a generated entry shows up in the audit trail even though it wasn't explicitly requested. */
  generatedKeys?: string[];
}

/**
 * Appends one scrubbed, best-effort JSON line. `auditLogPath` is optional --
 * tests and any caller that never threads a workspace path through simply
 * get no audit log, rather than a hard requirement leaking into every unit
 * test. Never throws: a logging failure must never fail the tool call it
 * describes.
 */
export function appendAuditLog(auditLogPath: string | undefined, entry: AuditEntry): void {
  if (!auditLogPath) return;
  try {
    fs.mkdirSync(path.dirname(auditLogPath), { recursive: true });
    const line = `${scrubSecrets(JSON.stringify({ ts: new Date().toISOString(), ...entry }))}\n`;
    fs.appendFileSync(auditLogPath, line, 'utf8');
  } catch {
    // Best-effort by design -- see doc comment above.
  }
}
