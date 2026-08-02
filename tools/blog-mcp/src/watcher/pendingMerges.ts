import fs from 'node:fs';
import path from 'node:path';

/** A PR the watcher opened (and possibly enabled auto-merge on) that hasn't been observed as merged or closed yet. */
export interface PendingMerge {
  pr: number;
  headSha: string;
  slug: string;
}

export interface PendingMergesFile {
  pending: PendingMerge[];
}

function pendingMergesPath(stateDir: string): string {
  return path.join(stateDir, 'pending-merges.json');
}

/** A missing or corrupted file is treated as empty rather than thrown -- a bad read must never crash a watch tick, and the next successful save repairs it. Mirrors scheduler/store.ts's loadSchedule exactly. */
export function loadPendingMerges(stateDir: string): PendingMergesFile {
  const file = pendingMergesPath(stateDir);
  if (!fs.existsSync(file)) return { pending: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<PendingMergesFile>;
    return { pending: Array.isArray(parsed.pending) ? parsed.pending : [] };
  } catch {
    return { pending: [] };
  }
}

/** Write-temp-then-rename so a SIGKILL mid-write can never leave a half-written pending-merges.json. Mirrors scheduler/store.ts's saveSchedule exactly. */
export function savePendingMerges(stateDir: string, file: PendingMergesFile): void {
  fs.mkdirSync(stateDir, { recursive: true });
  const target = pendingMergesPath(stateDir);
  const tmp = path.join(stateDir, `.pending-merges.json.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}
