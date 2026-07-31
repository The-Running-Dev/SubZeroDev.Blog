import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveRepoRoot, loadConfig } from './config.js';
import { registerAuthoringTools, registerAuthoringWriteTools } from './tools/authoring.js';
import { registerLocalGitTools } from './tools/localGit.js';
import { registerRemoteTools } from './tools/remote.js';
import { registerMonitorTools } from './tools/monitor.js';
import { registerRepoInfoTools } from './tools/repoInfo.js';
import { isReadOnly, isRemoteEnabled, isMonitorEnabled } from './tools/context.js';

export interface CreateServerOptions {
  repoRoot?: string;
  /** Optional path to an append-only audit log for mutating tool calls. See exec/auditLog.ts. */
  auditLogPath?: string;
}

const SERVER_VERSION = '0.1.0';

/**
 * Builds a fully-registered McpServer. Transport-agnostic: callers (stdio in
 * src/index.ts, HTTP in a later PR) connect this to whichever transport they
 * need. Capability tiers gate tool *registration*: BLOG_MCP_READ_ONLY omits
 * every write tool from the list the client ever sees, rather than
 * registering them and refusing at call time.
 */
export function createServer(options: CreateServerOptions = {}): McpServer {
  const repoRoot = resolveRepoRoot(options.repoRoot);
  const config = loadConfig(repoRoot);

  const server = new McpServer({
    name: 'subzerodev-blog-mcp',
    version: SERVER_VERSION
  });

  const ctx = { server, repoRoot, config, ...(options.auditLogPath ? { auditLogPath: options.auditLogPath } : {}) };

  registerAuthoringTools(ctx);
  registerRepoInfoTools(ctx);
  if (!isReadOnly()) {
    registerAuthoringWriteTools(ctx);
    registerLocalGitTools(ctx);
    if (isRemoteEnabled()) {
      registerRemoteTools(ctx);
    }
  }
  if (isMonitorEnabled()) {
    // Read-only against GitHub, so available independent of BLOG_MCP_READ_ONLY.
    registerMonitorTools(ctx);
  }

  return server;
}
