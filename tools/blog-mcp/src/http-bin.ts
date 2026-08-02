#!/usr/bin/env node
import path from 'node:path';
import { createHttpServer } from './http.js';
import { ensureRepo, ensureRepoOptionsFromEnv } from './bootstrap/repo.js';
import { isRemoteEnabled, isWatcherEnabled, isWatchAutoMergeEnabled } from './tools/context.js';
import { WATCHER_CAPABILITIES } from './serve/capabilities.js';
import { startWatcher, type WatcherHandle } from './watcher/engine.js';

function parseFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index !== -1 ? argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const host = parseFlag(argv, '--host') ?? process.env.BLOG_MCP_HTTP_HOST;
  const portArg = parseFlag(argv, '--port') ?? process.env.BLOG_MCP_HTTP_PORT;
  const port = portArg ? Number(portArg) : undefined;
  const token = process.env.BLOG_MCP_HTTP_TOKEN;
  const readOnlyToken = process.env.BLOG_MCP_HTTP_READONLY_TOKEN;
  const allowedOriginsEnv = process.env.BLOG_MCP_HTTP_ALLOWED_ORIGINS;
  const maxSessionsEnv = process.env.BLOG_MCP_HTTP_MAX_SESSIONS;
  const maxSessions = maxSessionsEnv ? Number(maxSessionsEnv) : undefined;
  const watchIntervalEnv = process.env.BLOG_MCP_WATCH_INTERVAL_MS;
  const watchIntervalMs = watchIntervalEnv ? Number(watchIntervalEnv) : undefined;

  if (portArg && (!Number.isInteger(port) || port === undefined || port <= 0)) {
    process.stderr.write(`blog-mcp http: invalid port '${portArg}'\n`);
    process.exit(1);
  }
  if (maxSessionsEnv && (!Number.isInteger(maxSessions) || maxSessions === undefined || maxSessions <= 0)) {
    process.stderr.write(`blog-mcp http: invalid BLOG_MCP_HTTP_MAX_SESSIONS '${maxSessionsEnv}'\n`);
    process.exit(1);
  }
  if (watchIntervalEnv && (!Number.isInteger(watchIntervalMs) || watchIntervalMs === undefined || watchIntervalMs <= 0)) {
    process.stderr.write(`blog-mcp http: invalid BLOG_MCP_WATCH_INTERVAL_MS '${watchIntervalEnv}'\n`);
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

  const httpServer = createHttpServer({
    repoRoot: repo.repoRoot,
    auditLogPath,
    stateDir,
    ...(host ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(token ? { token } : {}),
    ...(readOnlyToken ? { readOnlyToken } : {}),
    ...(allowedOriginsEnv ? { allowedOrigins: allowedOriginsEnv.split(',').map((s) => s.trim()) } : {}),
    ...(maxSessions !== undefined ? { maxSessions } : {})
  });

  let watcher: WatcherHandle | undefined;
  const watchDir = process.env.BLOG_MCP_WATCH_DIR;
  if (isRemoteEnabled() && isWatcherEnabled() && watchDir) {
    watcher = startWatcher({
      repoRoot: repo.repoRoot,
      watchDir,
      autoMerge: isWatchAutoMergeEnabled(),
      stateDir,
      ...(watchIntervalMs !== undefined ? { tickIntervalMs: watchIntervalMs } : {}),
      serverOptions: { repoRoot: repo.repoRoot, auditLogPath, capabilities: WATCHER_CAPABILITIES }
    });
    process.stderr.write(`blog-mcp: watcher started (watching ${watchDir})\n`);
  } else {
    process.stderr.write(
      'blog-mcp: watcher disabled -- set BLOG_MCP_ALLOW_REMOTE=1, BLOG_MCP_ALLOW_WATCHER=1, and BLOG_MCP_WATCH_DIR to enable\n'
    );
  }

  // http mode had no background subsystem before the watcher -- this is its
  // first shutdown handler. Same drain-not-interrupt shape as serve-bin.ts's.
  const shutdown = (signal: string): void => {
    process.stderr.write(`blog-mcp http: received ${signal}, shutting down\n`);
    void (async () => {
      await watcher?.stop();
      httpServer.close(() => process.exit(0));
    })();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  process.stderr.write(`blog-mcp http: fatal error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
