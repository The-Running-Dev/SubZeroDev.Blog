import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, type CreateServerOptions } from '../server.js';
import type { ToolResult } from '../result.js';

const CLIENT_INFO = { name: 'blog-mcp-serve', version: '0.1.0' };

/**
 * Builds a fresh linked McpServer + Client pair, calls exactly one tool, and
 * tears both down -- per call, not a long-lived pair. `createServer`
 * captures `repoRoot`/`config` at construction (src/http.ts does the same
 * per-request for the same reason), so a fetch that changes
 * `.config/blog.json` is visible on the very next call rather than only
 * after some future reconnect.
 *
 * This is the seam that makes "every mutation of this repo happened as a
 * `tools/call`" literally true for the UI and (a later phase) the
 * scheduler: neither one ever calls a registered tool's handler function
 * directly, so the audit log and the repo mutex (both wired at the tool
 * layer) see every one of their actions the same way an external MCP
 * client's would.
 */
export async function callToolInProcess(
  serverOptions: CreateServerOptions,
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const server = createServer(serverOptions);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(CLIENT_INFO, { capabilities: {} });

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({ name: toolName, arguments: args });
    return result.structuredContent as ToolResult;
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
