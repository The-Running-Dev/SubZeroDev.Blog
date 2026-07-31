#!/usr/bin/env node
import path from 'node:path';
import { createServeServer } from './serve.js';
import { ensureRepo, ensureRepoOptionsFromEnv } from './bootstrap/repo.js';
import { loadConfig } from './config.js';
import { isRemoteEnabled, isSchedulerEnabled } from './tools/context.js';
import { CRON_CAPABILITIES } from './serve/capabilities.js';
import { startScheduler, type SchedulerHandle } from './scheduler/engine.js';

function parseFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index !== -1 ? argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const host = parseFlag(argv, '--host') ?? process.env.BLOG_MCP_HTTP_HOST;
  const portArg = parseFlag(argv, '--port') ?? process.env.BLOG_MCP_HTTP_PORT;
  const port = portArg ? Number(portArg) : undefined;
  const mcpToken = process.env.BLOG_MCP_HTTP_TOKEN;
  const allowedOriginsEnv = process.env.BLOG_MCP_HTTP_ALLOWED_ORIGINS;
  const uiPasswordHash = process.env.BLOG_MCP_UI_PASSWORD_HASH;

  if (portArg && (!Number.isInteger(port) || port === undefined || port <= 0)) {
    process.stderr.write(`blog-mcp serve: invalid port '${portArg}'\n`);
    process.exit(1);
  }

  const repoOptions = ensureRepoOptionsFromEnv();
  const repo = await ensureRepo(repoOptions);
  process.stderr.write(
    `blog-mcp: repo ready at ${repo.repoRoot} (${repo.action}, branch ${repo.branch}${repo.dirty ? ', dirty' : ''})\n`
  );

  // repoOptions.repoPath is always '<workspace>/repo' -- see ensureRepoOptionsFromEnv.
  const stateDir = path.join(path.dirname(repoOptions.repoPath), 'state');
  const auditLogPath = path.join(stateDir, 'audit.log');

  const httpServer = createServeServer({
    repoRoot: repo.repoRoot,
    auditLogPath,
    stateDir,
    ...(host ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(mcpToken ? { mcpToken } : {}),
    ...(allowedOriginsEnv ? { mcpAllowedOrigins: allowedOriginsEnv.split(',').map((s) => s.trim()) } : {}),
    ...(uiPasswordHash ? { uiPasswordHash } : {})
  });

  let scheduler: SchedulerHandle | undefined;
  if (isRemoteEnabled() && isSchedulerEnabled()) {
    const config = loadConfig(repo.repoRoot);
    scheduler = startScheduler({
      repoRoot: repo.repoRoot,
      baseBranch: config.baseBranch,
      stateDir,
      serverOptions: { repoRoot: repo.repoRoot, auditLogPath, capabilities: CRON_CAPABILITIES }
    });
    process.stderr.write('blog-mcp: scheduler started (60s tick)\n');
  } else {
    process.stderr.write('blog-mcp: scheduler disabled -- set BLOG_MCP_ALLOW_REMOTE=1 and BLOG_MCP_ALLOW_SCHEDULER=1 to enable\n');
  }

  // Drain, never interrupt: wait for any in-flight tick before the process
  // exits, so a SIGTERM mid-tick can never kill git mid-index-write.
  const shutdown = (signal: string): void => {
    process.stderr.write(`blog-mcp serve: received ${signal}, shutting down\n`);
    void (async () => {
      await scheduler?.stop();
      httpServer.close(() => process.exit(0));
    })();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  process.stderr.write(`blog-mcp serve: fatal error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
