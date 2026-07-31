import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveRepoRoot, loadConfig } from './config.js';
import { registerAuthoringTools, registerAuthoringWriteTools } from './tools/authoring.js';
import { registerLocalGitTools } from './tools/localGit.js';
import { registerRemoteTools } from './tools/remote.js';
import { registerMonitorTools } from './tools/monitor.js';
import { registerRepoInfoTools } from './tools/repoInfo.js';
import { defaultCapabilities, type Capabilities, type ToolContext } from './tools/context.js';

export interface CreateServerOptions {
  repoRoot?: string;
  /** Optional path to an append-only audit log for mutating tool calls. See exec/auditLog.ts. */
  auditLogPath?: string;
  /** Overrides the env-derived registration profile. Omit for stdio/`/mcp` HTTP -- both keep using defaultCapabilities(), unchanged. A later phase's UI/scheduler session passes its own narrower profile explicitly. */
  capabilities?: Capabilities;
}

const SERVER_VERSION = '0.1.0';

/**
 * Builds a fully-registered McpServer. Transport-agnostic: callers (stdio in
 * src/index.ts, HTTP in src/http.ts) connect this to whichever transport
 * they need. Capabilities gate tool *registration*, not just behavior: an
 * unregistered tool cannot be invoked at all, which is a stronger guarantee
 * than a registered tool that merely refuses at call time.
 */
export function createServer(options: CreateServerOptions = {}): McpServer {
  const repoRoot = resolveRepoRoot(options.repoRoot);
  const config = loadConfig(repoRoot);
  const capabilities = options.capabilities ?? defaultCapabilities();

  const server = new McpServer({
    name: 'subzerodev-blog-mcp',
    version: SERVER_VERSION
  });

  const ctx: ToolContext = {
    server,
    repoRoot,
    config,
    capabilities,
    ...(options.auditLogPath ? { auditLogPath: options.auditLogPath } : {})
  };

  registerAuthoringTools(ctx);
  registerRepoInfoTools(ctx);
  if (capabilities.write) {
    registerAuthoringWriteTools(ctx);
    registerLocalGitTools(ctx);
    if (capabilities.remote) {
      registerRemoteTools(ctx);
    }
  }
  if (capabilities.monitor) {
    // Read-only against GitHub, so available independent of capabilities.write.
    registerMonitorTools(ctx);
  }

  return server;
}
