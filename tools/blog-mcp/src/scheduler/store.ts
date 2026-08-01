import fs from 'node:fs';
import path from 'node:path';

export type JobStatus = 'pending' | 'auto-merge-enabled' | 'merged' | 'skipped' | 'cancelled' | 'needs-attention';

/**
 * Explicit per-job missed-tick policy -- never an implicit default. A job
 * that was due while the scheduler was down (or the repo was dirty) either
 * runs whenever next noticed (`catch_up`) or is abandoned past a staleness
 * bound (`skip_if_older_than`), and the caller must say which.
 */
export type MissedTickPolicy = { mode: 'catch_up' } | { mode: 'skip_if_older_than'; seconds: number };

export interface ScheduledJob {
  id: string;
  pr: number;
  /** The commit SHA validated at schedule time -- never re-derived from whatever GitHub reports later, since that would make the enable-time cross-check tautological (see src/serve/api.ts's Compose-UI equivalent bug). */
  headSha: string;
  /** ISO 8601, UTC, `Z` suffix -- same contract as post frontmatter dates (src/domain/validate.ts's DATE_PATTERN_Z). */
  scheduledAt: string;
  onMissed: MissedTickPolicy;
  status: JobStatus;
  /** Set on 'needs-attention' or 'skipped' -- human-readable reason. */
  reason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleFile {
  jobs: ScheduledJob[];
}

function schedulePath(stateDir: string): string {
  return path.join(stateDir, 'schedule.json');
}

/** A missing or corrupted file is treated as empty rather than thrown -- a bad read must never crash the tick loop, and the next successful save repairs it. */
export function loadSchedule(stateDir: string): ScheduleFile {
  const file = schedulePath(stateDir);
  if (!fs.existsSync(file)) return { jobs: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ScheduleFile>;
    const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
    // Back-compat: a schedule.json written before the 'armed' -> 'auto-merge-enabled'
    // rename still has the old status on disk. Normalize on read so old and new
    // files behave identically; saveSchedule only ever writes the new value.
    for (const job of jobs) {
      if ((job.status as string) === 'armed') job.status = 'auto-merge-enabled';
    }
    return { jobs };
  } catch {
    return { jobs: [] };
  }
}

/** Write-temp-then-rename so a SIGKILL mid-write can never leave a half-written schedule.json (rename is atomic on the same filesystem, both POSIX and NTFS). */
export function saveSchedule(stateDir: string, schedule: ScheduleFile): void {
  fs.mkdirSync(stateDir, { recursive: true });
  const file = schedulePath(stateDir);
  const tmp = path.join(stateDir, `.schedule.json.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(schedule, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}
