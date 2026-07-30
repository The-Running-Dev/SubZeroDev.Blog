#!/usr/bin/env node
import { createHttpServer } from './http.js';

function parseFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index !== -1 ? argv[index + 1] : undefined;
}

const argv = process.argv.slice(2);
const repoRoot = parseFlag(argv, '--repo');
const host = parseFlag(argv, '--host') ?? process.env.BLOG_MCP_HTTP_HOST;
const portArg = parseFlag(argv, '--port') ?? process.env.BLOG_MCP_HTTP_PORT;
const port = portArg ? Number(portArg) : undefined;
const token = process.env.BLOG_MCP_HTTP_TOKEN;
const allowedOriginsEnv = process.env.BLOG_MCP_HTTP_ALLOWED_ORIGINS;

if (portArg && (!Number.isInteger(port) || port === undefined || port <= 0)) {
  process.stderr.write(`blog-mcp http: invalid port '${portArg}'\n`);
  process.exit(1);
}

createHttpServer({
  ...(repoRoot ? { repoRoot } : {}),
  ...(host ? { host } : {}),
  ...(port !== undefined ? { port } : {}),
  ...(token ? { token } : {}),
  ...(allowedOriginsEnv ? { allowedOrigins: allowedOriginsEnv.split(',').map((s) => s.trim()) } : {})
});
