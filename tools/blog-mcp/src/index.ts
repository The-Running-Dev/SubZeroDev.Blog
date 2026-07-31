#!/usr/bin/env node
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { ensureRepo, ensureRepoOptionsFromEnv } from './bootstrap/repo.js';

async function main(): Promise<void> {
  const repoOptions = ensureRepoOptionsFromEnv();
  const repo = await ensureRepo(repoOptions);
  process.stderr.write(
    `blog-mcp: repo ready at ${repo.repoRoot} (${repo.action}, branch ${repo.branch}${repo.dirty ? ', dirty' : ''})\n`
  );

  // repoOptions.repoPath is always '<workspace>/repo' -- see ensureRepoOptionsFromEnv.
  const stateDir = path.join(path.dirname(repoOptions.repoPath), 'state');
  const auditLogPath = path.join(stateDir, 'audit.log');
  const server = createServer({ repoRoot: repo.repoRoot, auditLogPath, stateDir });
  const transport = new StdioServerTransport();

  // Nothing but MCP framing may reach stdout in stdio mode -- every log
  // line goes to stderr instead, so it never corrupts the protocol stream.
  process.stderr.write(`subzerodev-blog-mcp starting (stdio)\n`);

  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`subzerodev-blog-mcp fatal error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
