import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { BlogConfig } from '../config.js';
import { toCallToolResult, infrastructureFailure, precondition, type ToolResult } from '../result.js';
import { PreconditionError, InfrastructureError } from '../errors.js';
import { withRepoLock } from '../exec/repoLock.js';
import { appendAuditLog } from '../exec/auditLog.js';
import { DEFAULT_ALLOWED_PREFIXES } from '../domain/paths.js';

/**
 * A consumer's registration profile. `POST /mcp` (and stdio) always uses
 * defaultCapabilities() below, computed fresh from env on every server
 * construction -- unchanged from before this existed. A later phase's UI or
 * scheduler session instead builds its own Capabilities and passes it into
 * createServer() explicitly, so BLOG_MCP_READ_ONLY keeps meaning something
 * even once multiple consumer profiles share one process.
 */
export interface Capabilities {
  write: boolean;
  remote: boolean;
  monitor: boolean;
  scheduler: boolean;
  writablePathPrefixes: string[];
}

export interface ToolContext {
  server: McpServer;
  repoRoot: string;
  config: BlogConfig;
  /** Optional -- unset in tests and any caller with no workspace concept. See exec/auditLog.ts. */
  auditLogPath?: string;
  /** Optional -- unset in tests that build a ToolContext by hand; every check that reads it falls back to the default (env-derived, or DEFAULT_ALLOWED_PREFIXES) when absent. */
  capabilities?: Capabilities;
  /** Optional -- directory for scheduler state (schedule.json). Unset in tests and any caller with no workspace concept, same as auditLogPath. */
  stateDir?: string;
  /**
   * Optional -- unset in tests and any caller with no need to pin time;
   * falls back to the real clock (`new Date()`) when absent. Mirrors the
   * `now?: () => Date` precedent in scheduler/engine.ts and
   * watcher/engine.ts, added ahead of Milestone 11 Phase 3's canonical date
   * service so authoring.ts's date-defaulting can become deterministically
   * testable without a global time-mocking dependency. Not yet read
   * anywhere.
   */
  clock?: () => Date;
}

export function isReadOnly(): boolean {
  return process.env.BLOG_MCP_READ_ONLY === '1' || process.env.BLOG_MCP_READ_ONLY === 'true';
}

export function isRemoteEnabled(): boolean {
  return process.env.BLOG_MCP_ALLOW_REMOTE === '1' || process.env.BLOG_MCP_ALLOW_REMOTE === 'true';
}

/**
 * Monitoring (Tier D: check/deploy status, the hard-rule URL verifier) is
 * read-only -- it never writes to the repo or to GitHub -- so it defaults
 * on, independent of BLOG_MCP_READ_ONLY. Set BLOG_MCP_ALLOW_MONITOR=0 to
 * unregister it explicitly.
 */
export function isMonitorEnabled(): boolean {
  return process.env.BLOG_MCP_ALLOW_MONITOR !== '0' && process.env.BLOG_MCP_ALLOW_MONITOR !== 'false';
}

/** Gates registration of the blog_schedule_* tools (src/tools/scheduler.ts). Requires BLOG_MCP_ALLOW_REMOTE too -- see defaultCapabilities. */
export function isSchedulerEnabled(): boolean {
  return process.env.BLOG_MCP_ALLOW_SCHEDULER === '1' || process.env.BLOG_MCP_ALLOW_SCHEDULER === 'true';
}

/** Gates the directory watcher subsystem (src/watcher/engine.ts). Requires BLOG_MCP_ALLOW_REMOTE too, same reasoning as the scheduler -- publishing a dropped file needs push/PR/auto-merge, not just a local write. */
export function isWatcherEnabled(): boolean {
  return process.env.BLOG_MCP_ALLOW_WATCHER === '1' || process.env.BLOG_MCP_ALLOW_WATCHER === 'true';
}

/** Default-on, matching isMonitorEnabled's shape -- an operator opts OUT of auto-merge for watcher-published PRs, not in. */
export function isWatchAutoMergeEnabled(): boolean {
  return process.env.BLOG_MCP_WATCH_AUTO_MERGE !== '0' && process.env.BLOG_MCP_WATCH_AUTO_MERGE !== 'false';
}

/**
 * The env-derived profile used whenever a caller doesn't pass an explicit
 * `capabilities` override -- i.e. every stdio and `/mcp` HTTP server today.
 * `remote` mirrors createServer's previous inline gating exactly (only
 * meaningful when write is also on, matching the old nested
 * `if (!isReadOnly()) { ...; if (isRemoteEnabled()) ... }` shape) --
 * unchanged from before this field existed. `scheduler` is new in Phase 6
 * and deliberately NOT tied to write: the scheduler only ever needs
 * blog_pr_status/blog_auto_merge (Tier C, gated by `remote`), never a
 * local-write tool, so requiring `BLOG_MCP_ALLOW_SCHEDULER=1` +
 * `BLOG_MCP_ALLOW_REMOTE=1` is both necessary and sufficient -- exactly what
 * the milestone plan specifies.
 */
export function defaultCapabilities(): Capabilities {
  const write = !isReadOnly();
  return {
    write,
    remote: write && isRemoteEnabled(),
    monitor: isMonitorEnabled(),
    // Deliberately isRemoteEnabled() directly, not the `remote` field above:
    // blog_schedule_publish/_list/_cancel only ever need Tier C
    // (blog_pr_status/blog_auto_merge), never a local-write tool, so
    // gating scheduler behind `write` too would block the useful
    // "read-only content session, but this one can still enqueue a merge"
    // combination for no reason tied to what these tools actually touch.
    scheduler: isRemoteEnabled() && isSchedulerEnabled(),
    writablePathPrefixes: DEFAULT_ALLOWED_PREFIXES
  };
}

/**
 * Forced onto an `/mcp` session authenticated with a caller's read-only
 * bearer token instead of its primary one (see src/http.ts's `readOnlyToken`
 * option). Lets a deployment hand a separate, capped credential to a
 * third-party MCP client (a ChatGPT Developer Mode connector, for example)
 * without granting it the same repo-mutating capability as the deployment's
 * own tooling -- regardless of what BLOG_MCP_READ_ONLY/BLOG_MCP_ALLOW_REMOTE/
 * etc. are set to for the primary token. `monitor` stays on: checking CI/
 * deploy status is read-only and useful even for a capped credential.
 */
export const READONLY_CAPABILITIES: Capabilities = {
  write: false,
  remote: false,
  monitor: true,
  scheduler: false,
  writablePathPrefixes: []
};

/**
 * Wraps a tool handler so PreconditionError/InfrastructureError become the
 * matching envelope kind, and any other thrown error is treated as
 * infrastructure (a bug, not a validation outcome) rather than silently
 * dropped by the SDK's own error handling.
 */
export function wrapTool<A>(handler: (args: A) => Promise<ToolResult>) {
  return async (args: A, _extra?: unknown): Promise<CallToolResult> => {
    try {
      const result = await handler(args);
      return toCallToolResult(result) as CallToolResult;
    } catch (err) {
      if (err instanceof PreconditionError) {
        return toCallToolResult(precondition(err.message)) as CallToolResult;
      }
      if (err instanceof InfrastructureError) {
        return toCallToolResult(
          infrastructureFailure(err.message, {
            ...(err.command ? { command: err.command } : {}),
            ...(err.exitCode !== undefined ? { exitCode: err.exitCode } : {}),
            ...(err.stdout !== undefined ? { stdout: err.stdout } : {}),
            ...(err.stderr !== undefined ? { stderr: err.stderr } : {})
          })
        ) as CallToolResult;
      }
      const message = err instanceof Error ? err.message : String(err);
      return toCallToolResult(infrastructureFailure(`Unexpected error: ${message}`)) as CallToolResult;
    }
  };
}

/**
 * Best-effort extraction of "what changed" from a write tool's result `data`,
 * for the audit log (TODO-NEXT.md sec3.3: generated metadata defaults must be
 * visible, not silent). Two result shapes exist today: PostWriteResult's
 * `changedPaths`/`createdAuthors`/`createdTags` (blog_create_post,
 * blog_update_post), and blog_add_tag/blog_add_author's own single `key`/
 * `path`. Neither shape is required -- most write tools' `data` has neither
 * field, and that's fine, this just returns nothing for them.
 */
function auditFieldsFromData(data: unknown): { changedPaths?: string[]; generatedKeys?: string[] } {
  if (typeof data !== 'object' || data === null) return {};
  const record = data as Record<string, unknown>;

  const changedPaths =
    Array.isArray(record.changedPaths) && record.changedPaths.every((p) => typeof p === 'string')
      ? (record.changedPaths as string[])
      : typeof record.path === 'string'
        ? [record.path]
        : undefined;

  const generatedKeys: string[] = [];
  for (const field of ['createdAuthors', 'createdTags'] as const) {
    const list = record[field];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const key = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>).key : undefined;
      if (typeof key === 'string') generatedKeys.push(key);
    }
  }
  if (typeof record.key === 'string') generatedKeys.push(record.key);

  return {
    ...(changedPaths ? { changedPaths } : {}),
    ...(generatedKeys.length > 0 ? { generatedKeys } : {})
  };
}

/**
 * Like wrapTool, but for tools that mutate the repo's working tree, git
 * state, or a PR/merge on GitHub: serializes them behind the repo mutex
 * (exec/repoLock.ts) and appends a scrubbed, best-effort audit line
 * (exec/auditLog.ts) once the call completes. `wrapTool` never throws --
 * every outcome, including a validation/precondition failure, resolves to a
 * CallToolResult -- so the lock only ever needs to serialize, never retry.
 */
export function wrapMutatingTool<A>(ctx: ToolContext, toolName: string, handler: (args: A) => Promise<ToolResult>) {
  const inner = wrapTool(handler);
  return async (args: A, extra?: unknown): Promise<CallToolResult> => {
    return withRepoLock(async () => {
      const result = await inner(args, extra);
      const structured = result.structuredContent as { ok?: boolean; kind?: string; summary?: string; data?: unknown } | undefined;
      appendAuditLog(ctx.auditLogPath, {
        tool: toolName,
        ok: structured?.ok === true,
        ...(structured?.kind ? { kind: structured.kind } : {}),
        ...(structured?.summary ? { summary: structured.summary } : {}),
        ...auditFieldsFromData(structured?.data)
      });
      return result;
    });
  };
}
