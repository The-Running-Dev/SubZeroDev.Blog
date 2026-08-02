import { isClean, currentBranch } from '../exec/git.js';
import { loadSchedule, saveSchedule, type ScheduledJob } from './store.js';
import { callToolInProcess } from '../serve/client.js';
import type { CreateServerOptions } from '../server.js';

export interface TickDeps {
  repoRoot: string;
  baseBranch: string;
  stateDir: string;
  /** Must carry the cron Capabilities profile (src/serve/capabilities.ts's CRON_CAPABILITIES) -- the engine only ever calls blog_pr_status and blog_auto_merge. */
  serverOptions: CreateServerOptions;
  /** Injectable clock for tests; defaults to the real time. */
  now?: () => Date;
}

export interface TickResult {
  /** True when the tick did nothing because the repo wasn't clean and on base -- fail-safe, not an error. */
  skippedRepoNotReady: boolean;
  jobsConsidered: number;
  jobsAdvanced: number;
}

interface PrStatusData {
  state: string;
  mergeable?: string;
  headRefOid: string;
}

function clock(deps: Pick<TickDeps, 'now'>): Date {
  return (deps.now ?? (() => new Date()))();
}

/**
 * One scheduler tick: advances every due 'pending' job by exactly one step
 * (never blocks on blog_wait_for_* -- those poll internally for up to 30
 * minutes, which a 60s tick cannot host). Never mutates the working tree
 * itself; every GitHub-facing action goes through `callToolInProcess` so it
 * is audited and mutex-serialized exactly like a human or the UI's action.
 */
export async function runTick(deps: TickDeps): Promise<TickResult> {
  const now = clock(deps);

  const [clean, branch] = await Promise.all([isClean({ repoRoot: deps.repoRoot }), currentBranch({ repoRoot: deps.repoRoot })]);
  if (!clean || branch !== deps.baseBranch) {
    // Fail-safe, not an error: an unattended actor must never act while the
    // tree is dirty or parked off base. blog_create_branch only checks
    // staged changes, so this check is stricter on purpose.
    return { skippedRepoNotReady: true, jobsConsidered: 0, jobsAdvanced: 0 };
  }

  const schedule = loadSchedule(deps.stateDir);
  const pendingDue = schedule.jobs.filter((job) => job.status === 'pending' && Date.parse(job.scheduledAt) <= now.getTime());

  let advanced = 0;
  for (const job of pendingDue) {
    if (applyMissedTickPolicy(job, now)) {
      advanced++;
      continue;
    }
    if (await processJob(deps, job, now)) {
      advanced++;
    }
  }

  if (advanced > 0) saveSchedule(deps.stateDir, schedule);
  return { skippedRepoNotReady: false, jobsConsidered: pendingDue.length, jobsAdvanced: advanced };
}

/** Returns true (job mutated) when the job was abandoned as too stale. Never mutates a job whose policy is 'catch_up' -- that policy means "run no matter how late." */
function applyMissedTickPolicy(job: ScheduledJob, now: Date): boolean {
  if (job.onMissed.mode !== 'skip_if_older_than') return false;
  const ageSeconds = (now.getTime() - Date.parse(job.scheduledAt)) / 1000;
  if (ageSeconds <= job.onMissed.seconds) return false;
  job.status = 'skipped';
  job.reason = `Missed by ${Math.round(ageSeconds)}s, exceeding skip_if_older_than (${job.onMissed.seconds}s).`;
  job.updatedAt = now.toISOString();
  return true;
}

/**
 * Re-derives the job's next action from GitHub's current state every tick
 * -- never from a locally cached "already enabled" flag -- so a crash
 * between enabling auto-merge and persisting that status self-heals on the
 * next tick instead of silently re-enabling it (idempotent) or getting stuck.
 */
async function processJob(deps: TickDeps, job: ScheduledJob, now: Date): Promise<boolean> {
  const statusResult = await callToolInProcess(deps.serverOptions, 'blog_pr_status', { pr: job.pr });
  if (!statusResult.ok) {
    // Infrastructure failure (gh unreachable, rate-limited, etc.) -- leave
    // pending and retry next tick. Never a permanent verdict from a
    // transient failure.
    return false;
  }
  const data = statusResult.data as PrStatusData;

  if (data.state === 'MERGED') {
    // Reconcile immediately, in the same tick that observes the merge --
    // this is "deferred reconciliation for unattended publishers" for the
    // scheduler specifically: it already runs periodically, so there's no
    // separate queue to maintain, ScheduledJob already carries job.headSha.
    const reconcileResult = await callToolInProcess(deps.serverOptions, 'blog_reconcile_after_merge', { pr: job.pr, expectedHeadSha: job.headSha });
    if (reconcileResult.ok) {
      job.status = 'merged';
      job.reason = reconcileResult.summary;
    } else {
      // Merged but not reconciled must surface, not silently look identical
      // to a clean merge -- a human needs to know the checkout may still
      // reference this branch.
      job.status = 'needs-attention';
      job.reason = `PR #${job.pr} merged, but reconciliation failed: ${reconcileResult.summary}`;
    }
    job.updatedAt = now.toISOString();
    return true;
  }
  if (data.state === 'CLOSED') {
    job.status = 'needs-attention';
    job.reason = `PR #${job.pr} was closed without merging.`;
    job.updatedAt = now.toISOString();
    return true;
  }
  if (data.mergeable === 'CONFLICTING') {
    // Terminal: there is no rebase tool and by design never will be (see
    // tools/blog-mcp/README.md's "What is deliberately not a tool").
    job.status = 'needs-attention';
    job.reason = `PR #${job.pr} has a merge conflict; a human must resolve it.`;
    job.updatedAt = now.toISOString();
    return true;
  }

  const autoMergeResult = await callToolInProcess(deps.serverOptions, 'blog_auto_merge', { pr: job.pr, headSha: job.headSha });
  if (autoMergeResult.ok) {
    job.status = 'auto-merge-enabled';
    job.updatedAt = now.toISOString();
    return true;
  }
  if (autoMergeResult.kind === 'precondition') {
    // A SHA mismatch (the branch moved) or a draft PR. blog_auto_merge's own
    // message says "revalidate and retry" -- that means a human decision,
    // not this loop silently substituting a SHA nobody told it to trust.
    job.status = 'needs-attention';
    job.reason = autoMergeResult.summary;
    job.updatedAt = now.toISOString();
    return true;
  }
  // Infrastructure failure enabling auto-merge -- leave pending, retry next tick.
  return false;
}

export interface SchedulerHandle {
  /** Stops the tick timer and waits for any in-flight tick to finish -- never interrupts a tick mid-write. */
  stop: () => Promise<void>;
}

/**
 * Starts the 60s (default) tick loop. A single in-process `inFlight` guard
 * is sufficient: this is one Node process with one scheduler, and ticks run
 * sequentially off one timer -- there is no multi-process/multi-replica
 * lease protocol here, matching the existing single-instance assumption
 * already implicit in the in-process repo mutex (exec/repoLock.ts).
 */
export function startScheduler(
  deps: TickDeps & { tickIntervalMs?: number; /** Injectable for tests -- defaults to the real runTick. */ tickFn?: (deps: TickDeps) => Promise<TickResult> }
): SchedulerHandle {
  const intervalMs = deps.tickIntervalMs ?? 60_000;
  const tick = deps.tickFn ?? runTick;
  let inFlight = false;
  let stopped = false;
  let currentTick: Promise<unknown> = Promise.resolve();

  const timer = setInterval(() => {
    if (stopped || inFlight) return;
    inFlight = true;
    currentTick = tick(deps)
      .catch((err) => {
        process.stderr.write(`blog-mcp scheduler: tick failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      })
      .finally(() => {
        inFlight = false;
      });
  }, intervalMs);
  timer.unref();

  return {
    async stop(): Promise<void> {
      stopped = true;
      clearInterval(timer);
      await currentTick;
    }
  };
}
