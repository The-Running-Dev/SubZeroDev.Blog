import fs from 'node:fs';
import path from 'node:path';
import { scrubSecrets } from './scrub.js';

export interface AuditEntry {
  tool: string;
  ok: boolean;
  kind?: string;
  summary?: string;
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
