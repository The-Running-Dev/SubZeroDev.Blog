import { z } from 'zod';
import { ok, precondition, type Finding } from '../result.js';
import { PreconditionError } from '../errors.js';
import { headSha as gitHeadSha } from '../exec/git.js';
import { ghJson } from '../exec/gh.js';
import { resolveOwnerRepoFromGit } from '../domain/github.js';
import { listPostFiles, loadPost } from '../domain/validate.js';
import { canonicalUrl } from '../domain/post.js';
import { wrapTool, type ToolContext } from './context.js';

export const DEFAULT_POLL_SECONDS = 15;
const MAX_TIMEOUT_SECONDS = 1800;

/** Exported (unchanged) for tools/git-service-consumer/extra-declarations.ts's wait_for_merge/wait_for_deploy -- S20's cutover reuses this poll/timeout shape rather than reimplementing it. */
export function clampTimeout(requested: number | undefined, fallback: number): number {
  return Math.min(requested ?? fallback, MAX_TIMEOUT_SECONDS);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  started_at: string;
}

interface CheckRunsResponse {
  total_count: number;
  check_runs: CheckRun[];
}

export interface CheckStatusResult {
  ref: string;
  checks: Array<{ name: string; status: string; conclusion: string | null; url: string }>;
  requiredMissing: string[];
  requiredFailed: string[];
  allRequiredPassed: boolean;
}

const TERMINAL_FAILURE_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'stale']);

/** Exported for src/tools/repoInfo.ts's blog_repo_health, which samples this over several recent commits for a required-check pass rate -- reuses the same GitHub check-run fetch and per-name dedup rather than reimplementing it. */
export async function checkStatus(ctx: ToolContext, ref: string, required: string[]): Promise<CheckStatusResult> {
  const { owner, repo } = await resolveRepo(ctx);
  const response = await ghJson<CheckRunsResponse>(['api', `repos/${owner}/${repo}/commits/${ref}/check-runs`], { repoRoot: ctx.repoRoot });

  // Multiple runs can share a name across retries; keep only the most recent per name.
  const latestByName = new Map<string, CheckRun>();
  for (const run of response.check_runs) {
    const existing = latestByName.get(run.name);
    if (!existing || run.started_at > existing.started_at) {
      latestByName.set(run.name, run);
    }
  }

  const checks = [...latestByName.values()].map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion, url: r.html_url }));
  const requiredMissing = required.filter((name) => !latestByName.has(name));
  const requiredFailed = required.filter((name) => {
    const run = latestByName.get(name);
    return run ? run.conclusion !== null && run.conclusion !== 'success' : false;
  });
  const allRequiredPassed =
    requiredMissing.length === 0 && required.every((name) => latestByName.get(name)?.status === 'completed' && latestByName.get(name)?.conclusion === 'success');

  return { ref, checks, requiredMissing, requiredFailed, allRequiredPassed };
}

export interface PrMergeView {
  state: string;
  mergeCommit: { oid: string } | null;
  mergedAt: string | null;
}

export interface DeployRun {
  databaseId: number;
  headSha: string;
  status: string;
  conclusion: string | null;
  url: string;
}

/** Exported (unchanged) for tools/git-service-consumer/extra-declarations.ts's deploy_status/wait_for_deploy -- see the DEFAULT_POLL_SECONDS export note above. */
export async function deployStatus(ctx: ToolContext, mergeCommitSha: string): Promise<{ found: boolean; run?: DeployRun }> {
  const runs = await ghJson<DeployRun[]>(
    ['run', 'list', '--workflow', ctx.config.deployWorkflow, '--json', 'databaseId,headSha,status,conclusion,url', '--limit', '30'],
    { repoRoot: ctx.repoRoot }
  );
  const run = runs.find((r) => r.headSha === mergeCommitSha);
  return run ? { found: true, run } : { found: false };
}

async function resolveRepo(ctx: ToolContext): Promise<{ owner: string; repo: string }> {
  return resolveOwnerRepoFromGit(ctx.repoRoot, ctx.config.cloneUrl);
}

/**
 * Tier D: CI check status and deploy monitoring. Read-only against GitHub;
 * registered whenever monitoring is enabled (default on), independent of
 * BLOG_MCP_READ_ONLY. See server.ts.
 */
export function registerMonitorTools(ctx: ToolContext): void {
  const { server, repoRoot, config } = ctx;

  server.registerTool(
    'blog_check_status',
    {
      title: 'Get required-check status for a commit',
      description:
        "Reads GitHub check-runs for a commit SHA and evaluates them against the required-check list. Distinguishes a check that hasn't run yet (e.g. Verify Documentation Build, which only runs on pull_request) from one that failed. Read-only.",
      inputSchema: {
        ref: z.string().optional(),
        required: z.array(z.string()).optional()
      }
    },
    wrapTool(async (args: { ref?: string; required?: string[] }) => {
      const ref = args.ref ?? (await gitHeadSha({ repoRoot }));
      const required = args.required ?? config.requiredChecks;
      const result = await checkStatus(ctx, ref, required);
      return ok(result.allRequiredPassed ? `All required checks passed for ${ref.slice(0, 12)}` : `Not all required checks passed for ${ref.slice(0, 12)}`, result);
    })
  );

  server.registerTool(
    'blog_wait_for_checks',
    {
      title: 'Wait for required checks to reach a terminal state',
      description: 'Polls blog_check_status until every required check passes, one fails, or the timeout elapses. Bounded: timeoutSeconds is capped at 1800.',
      inputSchema: {
        ref: z.string().optional(),
        required: z.array(z.string()).optional(),
        timeoutSeconds: z.number().int().positive().optional(),
        pollSeconds: z.number().int().positive().optional()
      }
    },
    wrapTool(async (args: { ref?: string; required?: string[]; timeoutSeconds?: number; pollSeconds?: number }) => {
      const ref = args.ref ?? (await gitHeadSha({ repoRoot }));
      const required = args.required ?? config.requiredChecks;
      const timeoutMs = clampTimeout(args.timeoutSeconds, 900) * 1000;
      const pollMs = (args.pollSeconds ?? DEFAULT_POLL_SECONDS) * 1000;
      const deadline = Date.now() + timeoutMs;

      let last = await checkStatus(ctx, ref, required);
      while (Date.now() < deadline) {
        if (last.allRequiredPassed) {
          return ok(`All required checks passed for ${ref.slice(0, 12)}`, { ...last, timedOut: false });
        }
        if (last.requiredFailed.length > 0) {
          return ok(`Required check(s) failed for ${ref.slice(0, 12)}: ${last.requiredFailed.join(', ')}`, { ...last, timedOut: false });
        }
        await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())));
        last = await checkStatus(ctx, ref, required);
      }
      return ok(`Timed out waiting for required checks on ${ref.slice(0, 12)}`, { ...last, timedOut: true });
    })
  );

  server.registerTool(
    'blog_wait_for_merge',
    {
      title: 'Wait for a PR to merge',
      description: 'Polls a PR until it merges or closes, or the timeout elapses. Bounded: timeoutSeconds is capped at 1800.',
      inputSchema: {
        pr: z.number().int().positive(),
        timeoutSeconds: z.number().int().positive().optional()
      }
    },
    wrapTool(async (args: { pr: number; timeoutSeconds?: number }) => {
      const timeoutMs = clampTimeout(args.timeoutSeconds, 600) * 1000;
      const deadline = Date.now() + timeoutMs;

      while (true) {
        const view = await ghJson<PrMergeView>(['pr', 'view', String(args.pr), '--json', 'state,mergeCommit,mergedAt'], { repoRoot });
        if (view.state === 'MERGED') {
          return ok(`PR #${args.pr} merged`, { merged: true, mergeCommitSha: view.mergeCommit?.oid, mergedAt: view.mergedAt, timedOut: false });
        }
        if (view.state === 'CLOSED') {
          return ok(`PR #${args.pr} closed without merging`, { merged: false, reason: 'closed', timedOut: false });
        }
        if (Date.now() >= deadline) {
          return ok(`Timed out waiting for PR #${args.pr} to merge`, { merged: false, reason: 'timeout', timedOut: true });
        }
        await sleep(Math.min(DEFAULT_POLL_SECONDS * 1000, Math.max(0, deadline - Date.now())));
      }
    })
  );

  server.registerTool(
    'blog_deploy_status',
    {
      title: 'Get the deploy workflow run for a merge commit',
      description: 'Finds the deploy workflow run matching a merge commit SHA. `found:false` is a distinct, expected state (the run often does not exist yet) -- not a failure. Read-only.',
      inputSchema: {
        mergeCommitSha: z.string()
      }
    },
    wrapTool(async (args: { mergeCommitSha: string }) => {
      const result = await deployStatus(ctx, args.mergeCommitSha);
      return ok(result.found ? `Found ${config.deployWorkflow} run for ${args.mergeCommitSha.slice(0, 12)}` : `No ${config.deployWorkflow} run yet for ${args.mergeCommitSha.slice(0, 12)}`, result);
    })
  );

  server.registerTool(
    'blog_wait_for_deploy',
    {
      title: 'Wait for the deploy workflow to finish',
      description:
        'Polls blog_deploy_status until the run reaches status=completed or the timeout elapses. `deployed` is only true when the run completed with conclusion=success. Bounded: timeoutSeconds is capped at 1800.',
      inputSchema: {
        mergeCommitSha: z.string(),
        timeoutSeconds: z.number().int().positive().optional()
      }
    },
    wrapTool(async (args: { mergeCommitSha: string; timeoutSeconds?: number }) => {
      const timeoutMs = clampTimeout(args.timeoutSeconds, 1200) * 1000;
      const deadline = Date.now() + timeoutMs;

      while (true) {
        const result = await deployStatus(ctx, args.mergeCommitSha);
        if (result.found && result.run?.status === 'completed') {
          const deployed = result.run.conclusion === 'success';
          return ok(deployed ? `Deploy succeeded for ${args.mergeCommitSha.slice(0, 12)}` : `Deploy finished with conclusion '${result.run.conclusion}'`, {
            deployed,
            runId: result.run.databaseId,
            url: result.run.url,
            conclusion: result.run.conclusion,
            timedOut: false
          });
        }
        if (Date.now() >= deadline) {
          return ok(`Timed out waiting for ${config.deployWorkflow} on ${args.mergeCommitSha.slice(0, 12)}`, { deployed: false, timedOut: true });
        }
        await sleep(Math.min(DEFAULT_POLL_SECONDS * 1000, Math.max(0, deadline - Date.now())));
      }
    })
  );

  server.registerTool(
    'blog_verify_published_url',
    {
      title: 'Verify a route is actually published (the hard rule, as code)',
      description:
        'Never reports a URL as published without first confirming the Docs Deploy run for the exact merge commit succeeded. mergeCommitSha is required; there is no code path that returns a published URL in a success position without a confirmed completed/success deploy. Waits for deploy internally (bounded), then HTTPS-GETs the canonical route.',
      inputSchema: {
        mergeCommitSha: z.string(),
        slug: z.string().optional(),
        url: z.string().optional(),
        expectStrings: z.array(z.string()).optional(),
        timeoutSeconds: z.number().int().positive().optional()
      }
    },
    wrapTool(async (args: { mergeCommitSha: string; slug?: string; url?: string; expectStrings?: string[]; timeoutSeconds?: number }) => {
      if (!args.slug && !args.url) {
        return precondition('Provide either slug or url.');
      }

      const timeoutMs = clampTimeout(args.timeoutSeconds, 1200) * 1000;
      const deadline = Date.now() + timeoutMs;
      let deployResult: { found: boolean; run?: DeployRun } = { found: false };
      while (true) {
        deployResult = await deployStatus(ctx, args.mergeCommitSha);
        if (deployResult.found && deployResult.run?.status === 'completed') break;
        if (Date.now() >= deadline) {
          return ok(`Deploy not confirmed for ${args.mergeCommitSha.slice(0, 12)} within the timeout`, {
            verified: false,
            reason: 'deploy-not-confirmed',
            deploy: deployResult
          });
        }
        await sleep(Math.min(DEFAULT_POLL_SECONDS * 1000, Math.max(0, deadline - Date.now())));
      }

      if (deployResult.run?.conclusion !== 'success') {
        return ok(`Deploy for ${args.mergeCommitSha.slice(0, 12)} finished with conclusion '${deployResult.run?.conclusion}', not success`, {
          verified: false,
          reason: 'deploy-not-confirmed',
          deploy: deployResult
        });
      }

      // Deploy confirmed success -- only past this point may the URL appear
      // in a success-position field of the result.
      const target = args.url ?? canonicalUrl(config.canonicalUrl, args.slug as string);

      let expectedTitle: string | undefined;
      if (args.slug) {
        const post = listPostFiles(repoRoot, config.blogDir)
          .map((p) => loadPost(repoRoot, p))
          .find((p) => p.frontMatter?.slug === args.slug);
        expectedTitle = typeof post?.frontMatter?.title === 'string' ? post.frontMatter.title : undefined;
      }

      const fetchResult = await fetchWithBoundedRedirects(target, 3);
      const findings: Finding[] = [];
      if (fetchResult.status !== 200) {
        return ok(`GET ${target} returned ${fetchResult.status}, not 200`, {
          verified: false,
          reason: 'http-status',
          status: fetchResult.status,
          deploy: deployResult
        });
      }

      const mustContain = [...(args.expectStrings ?? []), ...(expectedTitle ? [expectedTitle] : [])];
      const missing = mustContain.filter((s) => !fetchResult.body.includes(s));
      if (missing.length > 0) {
        return ok(`GET ${target} succeeded but is missing expected content: ${missing.join(', ')}`, {
          verified: false,
          reason: 'content-mismatch',
          missing,
          deploy: deployResult
        });
      }
      if (!expectedTitle && args.slug) {
        findings.push({ severity: 'warning', rule: 'TitleCheckSkipped', message: `Could not find post '${args.slug}' locally; title content was not verified.` });
      }

      return ok(`Verified ${target}`, { verified: true, url: target, status: 200, deploy: deployResult }, findings);
    })
  );

  server.registerTool(
    'blog_publish_report',
    {
      title: 'Assemble a publish report',
      description: 'Assembles PR status, required-check outcomes, merge commit, deploy result, and (only if verified) the published URL into one report. Read-only.',
      inputSchema: {
        pr: z.number().int().positive(),
        slug: z.string().optional()
      }
    },
    wrapTool(async (args: { pr: number; slug?: string }) => {
      const prView = await ghJson<{ number: number; url: string; state: string; headRefOid: string; mergeCommit: { oid: string } | null; baseRefName: string }>(
        ['pr', 'view', String(args.pr), '--json', 'number,url,state,headRefOid,mergeCommit,baseRefName'],
        { repoRoot }
      );
      const checks = await checkStatus(ctx, prView.headRefOid, config.requiredChecks);

      const report: Record<string, unknown> = {
        pr: prView.number,
        url: prView.url,
        state: prView.state,
        baseBranch: prView.baseRefName,
        headSha: prView.headRefOid,
        checks,
        mergeCommitSha: prView.mergeCommit?.oid
      };

      if (prView.mergeCommit?.oid) {
        const deploy = await deployStatus(ctx, prView.mergeCommit.oid);
        report.deploy = deploy;

        if (args.slug && deploy.found && deploy.run?.status === 'completed' && deploy.run.conclusion === 'success') {
          const target = canonicalUrl(config.canonicalUrl, args.slug);
          const fetchResult = await fetchWithBoundedRedirects(target, 3);
          report.publishedUrl = fetchResult.status === 200 ? target : undefined;
          report.publishedUrlVerified = fetchResult.status === 200;
        }
      }

      return ok(`Publish report for PR #${prView.number}`, report);
    })
  );
}

export interface FetchResult {
  status: number;
  body: string;
}

/** Exported (unchanged) for tools/git-service-consumer/extra-declarations.ts's publish_report -- see the DEFAULT_POLL_SECONDS export note above. Follows at most maxRedirects hops manually so a redirect chain can never be unbounded. */
export async function fetchWithBoundedRedirects(url: string, maxRedirects: number): Promise<FetchResult> {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const response = await fetch(current, {
      redirect: 'manual',
      cache: 'no-store',
      headers: { 'user-agent': 'subzerodev-blog-mcp' },
      signal: AbortSignal.timeout(30_000)
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { status: response.status, body: '' };
      current = new URL(location, current).toString();
      continue;
    }
    const body = await response.text();
    return { status: response.status, body };
  }
  throw new PreconditionError(`Too many redirects fetching '${url}' (> ${maxRedirects}).`);
}
