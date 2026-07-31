#!/usr/bin/env node
import path from 'node:path';
import { createHttpServer } from './http.js';
import { ensureRepo, ensureRepoOptionsFromEnv } from './bootstrap/repo.js';

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
  const allowedOriginsEnv = process.env.BLOG_MCP_HTTP_ALLOWED_ORIGINS;

  if (portArg && (!Number.isInteger(port) || port === undefined || port <= 0)) {
    process.stderr.write(`blog-mcp http: invalid port '${portArg}'\n`);
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

  createHttpServer({
    repoRoot: repo.repoRoot,
    auditLogPath,
    stateDir,
    ...(host ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(token ? { token } : {}),
    ...(allowedOriginsEnv ? { allowedOrigins: allowedOriginsEnv.split(',').map((s) => s.trim()) } : {})
  });
}

main().catch((err) => {
  process.stderr.write(`blog-mcp http: fatal error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
