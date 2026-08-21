import type { JsonSchema } from '../../../SubZeroDev.GitService/src/contract/json.ts';
import type { ModuleTargetName, RegistryToolName } from '../../../SubZeroDev.GitService/src/shared/brands.ts';
import type { ToolDeclaration } from '../../../SubZeroDev.GitService/src/contract/tool-declaration.ts';
import type { CallContext } from '../../../SubZeroDev.GitService/src/shared/call-context.ts';
import type { ToolResult, Diagnostics } from '../../../SubZeroDev.GitService/src/result/envelope.ts';
import { success, infrastructure } from '../../../SubZeroDev.GitService/src/result/envelope.ts';

import { loadConfig } from '../blog-mcp/dist/config.js';
import { gitOrThrow } from '../blog-mcp/dist/exec/git.js';
import { ghJson } from '../blog-mcp/dist/exec/gh.js';
import { canonicalUrl } from '../blog-mcp/dist/domain/post.js';
import {
  clampTimeout,
  sleep,
  deployStatus,
  checkStatus,
  fetchWithBoundedRedirects,
  DEFAULT_POLL_SECONDS,
  type PrMergeView,
} from '../blog-mcp/dist/tools/monitor.js';

/**
 * S20's decision (2026-08-21, "How should the 4 blog tools with no base
 * equivalent be handled") is to re-declare these four unchanged rather than
 * accept them as losses: `blog_reset_stage`, `blog_wait_for_merge`,
 * `blog_deploy_status`, `blog_wait_for_deploy` have no `PRODUCTION_TOOL_DECLARATIONS`
 * counterpart (confirmed against `src/composition-root/production-declarations.ts`'s
 * 25 tool names) and are not among the 16 content-authoring tools in
 * `declarations.ts`. They are blog-owned extension tools in their own right,
 * reusing blog-mcp's existing implementations verbatim (via exports added to
 * `tools/blog-mcp/src/tools/monitor.ts` for this purpose) -- no behaviour
 * change, same synchronous-poll shape as today.
 */

function diag(ctx: CallContext, durationMs = 0): Diagnostics {
  return { operationId: ctx.operationId, declarationId: ctx.declarationId, generation: ctx.generation, durationMs };
}

function requireRepoRoot(ctx: CallContext): { readonly ok: true; readonly repoRoot: string } | { readonly ok: false; readonly result: ToolResult<never> } {
  if (!ctx.cloneRoot) {
    return { ok: false, result: infrastructure('No clone root is available on this call context; the declaration must provide a provisioned checkout.') };
  }
  return { ok: true, repoRoot: ctx.cloneRoot };
}

// =============================================================================
// 17. unstage_paths — content.gitUtility.write (was blog_reset_stage)
// =============================================================================

export const UNSTAGE_PATHS_TARGET = 'content.unstagePaths' as ModuleTargetName;

const UNSTAGE_PATHS_INPUT_SCHEMA = {
  type: 'object',
  properties: { paths: { type: 'array', items: { type: 'string' }, minItems: 1 } },
  required: ['paths'],
  additionalProperties: false,
} as unknown as JsonSchema;

const UNSTAGE_PATHS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: { paths: { type: 'array', items: { type: 'string' } } },
  required: ['paths'],
} as unknown as JsonSchema;

async function unstagePathsHandler(ctx: CallContext, input: { readonly paths: readonly string[] }): Promise<ToolResult<{ paths: readonly string[] }>> {
  const root = requireRepoRoot(ctx);
  if (!root.ok) return root.result;
  await gitOrThrow(['restore', '--staged', '--', ...input.paths], { repoRoot: root.repoRoot });
  return success(`Unstaged ${input.paths.length} path(s)`, { paths: input.paths }, diag(ctx));
}

export const UNSTAGE_PATHS_HANDLER = unstagePathsHandler;

// =============================================================================
// 18. wait_for_merge — content.gitUtility.read (was blog_wait_for_merge)
// =============================================================================

export const WAIT_FOR_MERGE_TARGET = 'content.waitForMerge' as ModuleTargetName;

const WAIT_FOR_MERGE_INPUT_SCHEMA = {
  type: 'object',
  properties: { pr: { type: 'integer', minimum: 1 }, timeoutSeconds: { type: 'integer', minimum: 1 } },
  required: ['pr'],
  additionalProperties: false,
} as unknown as JsonSchema;

interface WaitForMergeOutput {
  readonly merged: boolean;
  readonly reason?: string;
  readonly mergeCommitSha?: string;
  readonly mergedAt?: string | null;
  readonly timedOut: boolean;
}

async function waitForMergeHandler(ctx: CallContext, input: { readonly pr: number; readonly timeoutSeconds?: number }): Promise<ToolResult<WaitForMergeOutput>> {
  const root = requireRepoRoot(ctx);
  if (!root.ok) return root.result;
  const timeoutMs = clampTimeout(input.timeoutSeconds, 600) * 1000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const view = await ghJson<PrMergeView>(['pr', 'view', String(input.pr), '--json', 'state,mergeCommit,mergedAt'], { repoRoot: root.repoRoot });
    if (view.state === 'MERGED') {
      return success(`PR #${input.pr} merged`, { merged: true, mergeCommitSha: view.mergeCommit?.oid, mergedAt: view.mergedAt, timedOut: false }, diag(ctx));
    }
    if (view.state === 'CLOSED') {
      return success(`PR #${input.pr} closed without merging`, { merged: false, reason: 'closed', timedOut: false }, diag(ctx));
    }
    if (Date.now() >= deadline) {
      return success(`Timed out waiting for PR #${input.pr} to merge`, { merged: false, reason: 'timeout', timedOut: true }, diag(ctx));
    }
    await sleep(Math.min(DEFAULT_POLL_SECONDS * 1000, Math.max(0, deadline - Date.now())));
  }
}

export const WAIT_FOR_MERGE_HANDLER = waitForMergeHandler;

// =============================================================================
// 19. deploy_status — content.gitUtility.read (was blog_deploy_status)
// =============================================================================

export const DEPLOY_STATUS_TARGET = 'content.deployStatus' as ModuleTargetName;

const DEPLOY_STATUS_INPUT_SCHEMA = {
  type: 'object',
  properties: { mergeCommitSha: { type: 'string' } },
  required: ['mergeCommitSha'],
  additionalProperties: false,
} as unknown as JsonSchema;

async function deployStatusHandler(ctx: CallContext, input: { readonly mergeCommitSha: string }): Promise<ToolResult<unknown>> {
  const root = requireRepoRoot(ctx);
  if (!root.ok) return root.result;
  const config = loadConfig(root.repoRoot);
  const result = await deployStatus({ repoRoot: root.repoRoot, config } as Parameters<typeof deployStatus>[0], input.mergeCommitSha);
  return success(
    result.found ? `Found ${config.deployWorkflow} run for ${input.mergeCommitSha.slice(0, 12)}` : `No ${config.deployWorkflow} run yet for ${input.mergeCommitSha.slice(0, 12)}`,
    result,
    diag(ctx),
  );
}

export const DEPLOY_STATUS_HANDLER = deployStatusHandler;

// =============================================================================
// 20. wait_for_deploy — content.gitUtility.read (was blog_wait_for_deploy)
// =============================================================================

export const WAIT_FOR_DEPLOY_TARGET = 'content.waitForDeploy' as ModuleTargetName;

const WAIT_FOR_DEPLOY_INPUT_SCHEMA = {
  type: 'object',
  properties: { mergeCommitSha: { type: 'string' }, timeoutSeconds: { type: 'integer', minimum: 1 } },
  required: ['mergeCommitSha'],
  additionalProperties: false,
} as unknown as JsonSchema;

async function waitForDeployHandler(ctx: CallContext, input: { readonly mergeCommitSha: string; readonly timeoutSeconds?: number }): Promise<ToolResult<unknown>> {
  const root = requireRepoRoot(ctx);
  if (!root.ok) return root.result;
  const config = loadConfig(root.repoRoot);
  const toolCtx = { repoRoot: root.repoRoot, config } as Parameters<typeof deployStatus>[0];
  const timeoutMs = clampTimeout(input.timeoutSeconds, 1200) * 1000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const result = await deployStatus(toolCtx, input.mergeCommitSha);
    if (result.found && result.run?.status === 'completed') {
      const deployed = result.run.conclusion === 'success';
      return success(
        deployed ? `Deploy succeeded for ${input.mergeCommitSha.slice(0, 12)}` : `Deploy finished with conclusion '${result.run.conclusion}'`,
        { deployed, runId: result.run.databaseId, url: result.run.url, conclusion: result.run.conclusion, timedOut: false },
        diag(ctx),
      );
    }
    if (Date.now() >= deadline) {
      return success(`Timed out waiting for ${config.deployWorkflow} on ${input.mergeCommitSha.slice(0, 12)}`, { deployed: false, timedOut: true }, diag(ctx));
    }
    await sleep(Math.min(DEFAULT_POLL_SECONDS * 1000, Math.max(0, deadline - Date.now())));
  }
}

export const WAIT_FOR_DEPLOY_HANDLER = waitForDeployHandler;

// =============================================================================
// 21. publish_report — content.gitUtility.read (was blog_publish_report)
// =============================================================================

export const PUBLISH_REPORT_TARGET = 'content.publishReport' as ModuleTargetName;

const PUBLISH_REPORT_INPUT_SCHEMA = {
  type: 'object',
  properties: { pr: { type: 'integer', minimum: 1 }, slug: { type: 'string' } },
  required: ['pr'],
  additionalProperties: false,
} as unknown as JsonSchema;

interface PrView {
  readonly number: number;
  readonly url: string;
  readonly state: string;
  readonly headRefOid: string;
  readonly mergeCommit: { readonly oid: string } | null;
  readonly baseRefName: string;
}

async function publishReportHandler(ctx: CallContext, input: { readonly pr: number; readonly slug?: string }): Promise<ToolResult<Record<string, unknown>>> {
  const root = requireRepoRoot(ctx);
  if (!root.ok) return root.result;
  const config = loadConfig(root.repoRoot);
  const toolCtx = { repoRoot: root.repoRoot, config } as Parameters<typeof deployStatus>[0];

  const prView = await ghJson<PrView>(['pr', 'view', String(input.pr), '--json', 'number,url,state,headRefOid,mergeCommit,baseRefName'], { repoRoot: root.repoRoot });
  const checks = await checkStatus(toolCtx, prView.headRefOid, config.requiredChecks);

  const report: Record<string, unknown> = {
    pr: prView.number,
    url: prView.url,
    state: prView.state,
    baseBranch: prView.baseRefName,
    headSha: prView.headRefOid,
    checks,
    mergeCommitSha: prView.mergeCommit?.oid,
  };

  if (prView.mergeCommit?.oid) {
    const deploy = await deployStatus(toolCtx, prView.mergeCommit.oid);
    report.deploy = deploy;

    if (input.slug && deploy.found && deploy.run?.status === 'completed' && deploy.run.conclusion === 'success') {
      const target = canonicalUrl(config.canonicalUrl, input.slug);
      const fetchResult = await fetchWithBoundedRedirects(target, 3);
      report.publishedUrl = fetchResult.status === 200 ? target : undefined;
      report.publishedUrlVerified = fetchResult.status === 200;
    }
  }

  return success(`Publish report for PR #${prView.number}`, report, diag(ctx));
}

export const PUBLISH_REPORT_HANDLER = publishReportHandler;

// =============================================================================
// Declarations
// =============================================================================

const DEFAULT_LIMITS = { timeoutSeconds: 30, maxResultBytes: 65_536 };
const WAIT_LIMITS = { timeoutSeconds: 1800, maxResultBytes: 65_536 };
const DEFAULT_ANNOTATIONS = { schedulable: false, fileWatcher: false as const, untrustedOutput: false };

export const EXTRA_GIT_UTILITY_DECLARATIONS: readonly ToolDeclaration[] = [
  {
    name: 'unstage_paths' as RegistryToolName,
    description: 'Unstages specific paths via `git restore --staged --`. Never touches the working tree.',
    inputSchema: UNSTAGE_PATHS_INPUT_SCHEMA,
    outputSchema: UNSTAGE_PATHS_OUTPUT_SCHEMA,
    scopes: ['write'],
    capabilities: ['content.gitUtility.write'],
    capabilityScope: 'declaration',
    executionClass: 'mutating',
    annotations: DEFAULT_ANNOTATIONS,
    limits: DEFAULT_LIMITS,
    target: { kind: 'module', target: UNSTAGE_PATHS_TARGET },
  },
  {
    name: 'wait_for_merge' as RegistryToolName,
    description: 'Polls a PR until it merges or closes, or the timeout elapses. Bounded: timeoutSeconds is capped at 1800.',
    inputSchema: WAIT_FOR_MERGE_INPUT_SCHEMA,
    outputSchema: { type: 'object' } as unknown as JsonSchema,
    scopes: ['read'],
    capabilities: ['content.gitUtility.read'],
    capabilityScope: 'declaration',
    executionClass: 'monitoring-wait',
    annotations: DEFAULT_ANNOTATIONS,
    limits: WAIT_LIMITS,
    target: { kind: 'module', target: WAIT_FOR_MERGE_TARGET },
  },
  {
    name: 'deploy_status' as RegistryToolName,
    description: 'Finds the deploy workflow run matching a merge commit SHA. `found:false` is a distinct, expected state, not a failure. Read-only.',
    inputSchema: DEPLOY_STATUS_INPUT_SCHEMA,
    outputSchema: { type: 'object' } as unknown as JsonSchema,
    scopes: ['read'],
    capabilities: ['content.gitUtility.read'],
    capabilityScope: 'declaration',
    executionClass: 'read',
    annotations: DEFAULT_ANNOTATIONS,
    limits: DEFAULT_LIMITS,
    target: { kind: 'module', target: DEPLOY_STATUS_TARGET },
  },
  {
    name: 'wait_for_deploy' as RegistryToolName,
    description: "Polls deploy_status until the run reaches status=completed or the timeout elapses. 'deployed' is only true when the run completed with conclusion=success. Bounded: timeoutSeconds is capped at 1800.",
    inputSchema: WAIT_FOR_DEPLOY_INPUT_SCHEMA,
    outputSchema: { type: 'object' } as unknown as JsonSchema,
    scopes: ['read'],
    capabilities: ['content.gitUtility.read'],
    capabilityScope: 'declaration',
    executionClass: 'monitoring-wait',
    annotations: DEFAULT_ANNOTATIONS,
    limits: WAIT_LIMITS,
    target: { kind: 'module', target: WAIT_FOR_DEPLOY_TARGET },
  },
  {
    name: 'publish_report' as RegistryToolName,
    description: 'Assembles PR status, required-check outcomes, merge commit, deploy result, and (only if verified) the published URL into one report. Read-only.',
    inputSchema: PUBLISH_REPORT_INPUT_SCHEMA,
    outputSchema: { type: 'object' } as unknown as JsonSchema,
    scopes: ['read'],
    capabilities: ['content.gitUtility.read'],
    capabilityScope: 'declaration',
    executionClass: 'read',
    annotations: DEFAULT_ANNOTATIONS,
    limits: DEFAULT_LIMITS,
    target: { kind: 'module', target: PUBLISH_REPORT_TARGET },
  },
];

export const EXTRA_GIT_UTILITY_MODULE_HANDLERS: readonly { readonly target: ModuleTargetName; readonly handler: unknown }[] = [
  { target: UNSTAGE_PATHS_TARGET, handler: UNSTAGE_PATHS_HANDLER },
  { target: WAIT_FOR_MERGE_TARGET, handler: WAIT_FOR_MERGE_HANDLER },
  { target: DEPLOY_STATUS_TARGET, handler: DEPLOY_STATUS_HANDLER },
  { target: WAIT_FOR_DEPLOY_TARGET, handler: WAIT_FOR_DEPLOY_HANDLER },
  { target: PUBLISH_REPORT_TARGET, handler: PUBLISH_REPORT_HANDLER },
];
