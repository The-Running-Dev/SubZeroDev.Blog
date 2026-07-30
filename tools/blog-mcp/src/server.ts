import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveRepoRoot, loadConfig } from './config.js';
import { registerAuthoringTools, registerAuthoringWriteTools } from './tools/authoring.js';
import { registerLocalGitTools } from './tools/localGit.js';
import { isReadOnly } from './tools/context.js';

export interface CreateServerOptions {
  repoRoot?: string;
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

  const ctx = { server, repoRoot, config };

  registerAuthoringTools(ctx);
  if (!isReadOnly()) {
    registerAuthoringWriteTools(ctx);
    registerLocalGitTools(ctx);
  }

  // Tier C (remote: push/PR/auto-merge) and Tier D (CI/deploy monitoring)
  // are not implemented in this PR. BLOG_MCP_ALLOW_REMOTE exists as an env
  // var so the capability boundary is already in place when they land.

  return server;
}
