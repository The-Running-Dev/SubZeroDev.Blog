import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { BlogConfig } from '../config.js';
import { toCallToolResult, infrastructureFailure, precondition, type ToolResult } from '../result.js';
import { PreconditionError, InfrastructureError } from '../errors.js';

export interface ToolContext {
  server: McpServer;
  repoRoot: string;
  config: BlogConfig;
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
