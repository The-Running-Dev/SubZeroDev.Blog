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

/** No scheduler tools exist yet (a later phase adds them); reads the env var now so that phase doesn't also have to touch this resolver. */
export function isSchedulerEnabled(): boolean {
  return process.env.BLOG_MCP_ALLOW_SCHEDULER === '1' || process.env.BLOG_MCP_ALLOW_SCHEDULER === 'true';
}

/**
 * The env-derived profile used whenever a caller doesn't pass an explicit
 * `capabilities` override -- i.e. every stdio and `/mcp` HTTP server today.
 * Mirrors createServer's previous inline gating exactly: remote and
 * scheduler are only meaningful when write is also on, matching the old
 * nested `if (!isReadOnly()) { ...; if (isRemoteEnabled()) ... }` shape.
 */
export function defaultCapabilities(): Capabilities {
  const write = !isReadOnly();
  return {
    write,
    remote: write && isRemoteEnabled(),
    monitor: isMonitorEnabled(),
    scheduler: write && isSchedulerEnabled(),
    writablePathPrefixes: DEFAULT_ALLOWED_PREFIXES
  };
}

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
      const structured = result.structuredContent as { ok?: boolean; kind?: string; summary?: string } | undefined;
      appendAuditLog(ctx.auditLogPath, {
        tool: toolName,
        ok: structured?.ok === true,
        ...(structured?.kind ? { kind: structured.kind } : {}),
        ...(structured?.summary ? { summary: structured.summary } : {})
      });
      return result;
    });
  };
}
