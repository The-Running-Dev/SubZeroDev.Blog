#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

function parseRepoFlag(argv: string[]): string | undefined {
  const index = argv.indexOf('--repo');
  return index !== -1 ? argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const repoRoot = parseRepoFlag(process.argv.slice(2));
  const server = createServer(repoRoot ? { repoRoot } : {});
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
