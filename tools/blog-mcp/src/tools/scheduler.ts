import crypto from 'node:crypto';
import { z } from 'zod';
import { ok, precondition } from '../result.js';
import { ghJson } from '../exec/gh.js';
import { loadSchedule, saveSchedule, type ScheduledJob, type MissedTickPolicy } from '../scheduler/store.js';
import { wrapTool, wrapMutatingTool, type ToolContext } from './context.js';

/** Same UTC contract as post frontmatter dates (src/domain/validate.ts's DATE_PATTERN_Z). */
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const ON_MISSED_SCHEMA = z.union([
  z.object({ mode: z.literal('catch_up') }),
  z.object({ mode: z.literal('skip_if_older_than'), seconds: z.number().int().positive() })
]);

interface PrViewJson {
  number: number;
  state: string;
  isDraft: boolean;
  headRefOid: string;
}

function requireStateDir(ctx: ToolContext): string | undefined {
  return ctx.stateDir;
}

/**
 * Tier E: the cron scheduler's own tools, gated behind capabilities.scheduler
 * (BLOG_MCP_ALLOW_SCHEDULER=1 and BLOG_MCP_ALLOW_REMOTE=1 -- see
 * tools/context.ts's defaultCapabilities). Model (i) only: "hold the
 * branch/PR, merge at time T." The PR already exists (opened via
 * blog_create_pr, by a human or the UI's Compose flow) -- these tools only
 * ever hold it and arm auto-merge once the scheduled time arrives. There is
 * no tool here that creates a post or opens a PR on its own schedule; see
 * MILESTONES.md Milestone 8's scheduling-model discussion for why "merge
 * now, publish later via a future frontmatter date" was rejected outright.
 */
export function registerSchedulerTools(ctx: ToolContext): void {
  const { server, repoRoot } = ctx;

  server.registerTool(
    'blog_schedule_publish',
    {
      title: 'Schedule an already-open PR to auto-merge at a future time',
      description:
        "Holds an open PR and arms GitHub's auto-merge once scheduledAt arrives (hold-then-merge). Validates the PR is open, not a draft, and that headSha matches its actual current head before accepting the job -- the same cross-check blog_arm_auto_merge performs at arm time, done again up front so a stale SHA is rejected immediately rather than silently sitting in the schedule. onMissed is required, not defaulted: 'catch_up' runs the job whenever next noticed; 'skip_if_older_than' abandons it past a staleness bound.",
      inputSchema: {
        pr: z.number().int().positive(),
        headSha: z.string().regex(/^[0-9a-f]{40}$/i, 'headSha must be a full 40-character commit SHA'),
        scheduledAt: z.string().regex(ISO_UTC_PATTERN, 'scheduledAt must be UTC, e.g. 2026-01-01T00:00:00Z'),
        onMissed: ON_MISSED_SCHEMA
      }
    },
    wrapMutatingTool(ctx, 'blog_schedule_publish', async (args: { pr: number; headSha: string; scheduledAt: string; onMissed: MissedTickPolicy }) => {
      const stateDir = requireStateDir(ctx);
      if (!stateDir) return precondition('Scheduler is enabled but no state directory is configured.');

      const prView = await ghJson<PrViewJson>(['pr', 'view', String(args.pr), '--json', 'number,state,isDraft,headRefOid'], { repoRoot });
      if (prView.state !== 'OPEN') {
        return precondition(`PR #${args.pr} is not open (state: ${prView.state}); refusing to schedule.`);
      }
      if (prView.isDraft) {
        return precondition(`PR #${args.pr} is a draft; refusing to schedule.`);
      }
      if (prView.headRefOid.toLowerCase() !== args.headSha.toLowerCase()) {
        return precondition(`Supplied headSha (${args.headSha}) does not match PR #${args.pr}'s actual head (${prView.headRefOid}).`);
      }

      const schedule = loadSchedule(stateDir);
      const timestamp = new Date().toISOString();
      const job: ScheduledJob = {
        id: crypto.randomUUID(),
        pr: args.pr,
        headSha: args.headSha,
        scheduledAt: args.scheduledAt,
        onMissed: args.onMissed,
        status: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp
      };
      schedule.jobs.push(job);
      saveSchedule(stateDir, schedule);
      return ok(`Scheduled PR #${args.pr} to auto-merge at ${args.scheduledAt}`, { job });
    })
  );

  server.registerTool(
    'blog_list_scheduled_jobs',
    {
      title: 'List scheduled publish jobs',
      description: 'Lists every job in the schedule store, including terminal ones (merged/skipped/cancelled/needs-attention). Read-only.',
      inputSchema: {
        status: z.enum(['pending', 'armed', 'merged', 'skipped', 'cancelled', 'needs-attention']).optional()
      }
    },
    wrapTool(async (args: { status?: string }) => {
      const stateDir = requireStateDir(ctx);
      if (!stateDir) return precondition('Scheduler is enabled but no state directory is configured.');
      const schedule = loadSchedule(stateDir);
      const jobs = args.status ? schedule.jobs.filter((j) => j.status === args.status) : schedule.jobs;
      return ok(`${jobs.length} job(s)`, { jobs });
    })
  );

  server.registerTool(
    'blog_cancel_scheduled_job',
    {
      title: 'Cancel a pending scheduled job',
      description:
        "Cancels a job that hasn't started running yet. Refuses on any job that has already been armed, merged, or otherwise reached a terminal state -- an already-armed PR's auto-merge must be disabled directly (via GitHub or blog_arm_auto_merge's own gh surface), not through this tool.",
      inputSchema: {
        id: z.string()
      }
    },
    wrapMutatingTool(ctx, 'blog_cancel_scheduled_job', async (args: { id: string }) => {
      const stateDir = requireStateDir(ctx);
      if (!stateDir) return precondition('Scheduler is enabled but no state directory is configured.');

      const schedule = loadSchedule(stateDir);
      const job = schedule.jobs.find((j) => j.id === args.id);
      if (!job) return precondition(`No scheduled job with id '${args.id}'.`);
      if (job.status !== 'pending') {
        return precondition(`Job '${args.id}' is '${job.status}', not 'pending'; it can no longer be cancelled here.`);
      }
      job.status = 'cancelled';
      job.updatedAt = new Date().toISOString();
      saveSchedule(stateDir, schedule);
      return ok(`Cancelled job '${args.id}'`, { job });
    })
  );
}
