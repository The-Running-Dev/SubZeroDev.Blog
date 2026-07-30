import type { ToolResult } from '../../src/result.js';

/** Minimal stand-in for McpServer: captures each registered tool's callback so tests can invoke it directly, without going through MCP JSON-RPC framing. */
export class FakeServer {
  tools = new Map<string, (args: unknown) => Promise<{ structuredContent: ToolResult }>>();
  registerTool(name: string, _config: unknown, cb: (args: unknown) => Promise<{ structuredContent: ToolResult }>): void {
    this.tools.set(name, cb);
  }
}

export async function call(server: FakeServer, name: string, args: unknown): Promise<ToolResult> {
  const cb = server.tools.get(name);
  if (!cb) throw new Error(`tool '${name}' was not registered`);
  const result = await cb(args);
  return result.structuredContent;
}
