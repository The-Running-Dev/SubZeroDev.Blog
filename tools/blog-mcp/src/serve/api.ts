import type { CreateServerOptions } from '../server.js';
import { callToolInProcess } from './client.js';
import type { ToolResult } from '../result.js';

export interface ApiResponse {
  status: number;
  body: unknown;
}

/**
 * Read-only route table for Phase 4 (`serve` mode's read-only-first UI):
 * list posts, show a post, git log/branches, repo health, and PR/check/
 * deploy status. Every route is an explicit `tools/call`, never a generic
 * "call any tool by name" proxy -- that would silently re-expose whatever
 * capabilities.write/.remote later phases register, defeating the entire
 * "the UI can only do what an MCP client's tool list allows" property this
 * design exists for. Phase 5 adds the write routes as new entries here, not
 * by widening this into a passthrough.
 */
async function callTool(serverOptions: CreateServerOptions, tool: string, args: Record<string, unknown>): Promise<ApiResponse> {
  let result: ToolResult;
  try {
    result = await callToolInProcess(serverOptions, tool, args);
  } catch (err) {
    // Only reachable for a genuinely unregistered/malformed call (a bug in
    // this route table, or a capabilities mismatch) -- normal validation/
    // precondition failures come back as a ToolResult with ok:false, not a
    // thrown error, and are returned as 200 below like any other MCP client
    // would see them.
    return { status: 502, body: { error: err instanceof Error ? err.message : String(err) } };
  }
  return { status: result.kind === 'infrastructure' ? 502 : 200, body: result };
}

function queryString(url: URL, name: string): string | undefined {
  return url.searchParams.get(name) ?? undefined;
}

function queryNumber(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Returns undefined for any path/method this route table doesn't recognize -- the caller falls through to a 404. */
export async function handleApiRequest(pathname: string, method: string, url: URL, serverOptions: CreateServerOptions): Promise<ApiResponse | undefined> {
  if (method !== 'GET') return undefined;

  if (pathname === '/api/posts') {
    const tag = queryString(url, 'tag');
    const limit = queryNumber(url, 'limit');
    return callTool(serverOptions, 'blog_list_posts', { ...(tag ? { tag } : {}), ...(limit !== undefined ? { limit } : {}) });
  }

  const postMatch = /^\/api\/posts\/([^/]+)$/.exec(pathname);
  if (postMatch) {
    return callTool(serverOptions, 'blog_get_post', { slug: decodeURIComponent(postMatch[1] as string) });
  }

  if (pathname === '/api/repo/status') {
    return callTool(serverOptions, 'blog_repo_status', {});
  }

  if (pathname === '/api/repo/health') {
    return callTool(serverOptions, 'blog_repo_health', {});
  }

  if (pathname === '/api/log') {
    const ref = queryString(url, 'ref');
    const limit = queryNumber(url, 'limit');
    return callTool(serverOptions, 'blog_log', { ...(ref ? { ref } : {}), ...(limit !== undefined ? { limit } : {}) });
  }

  if (pathname === '/api/branches') {
    return callTool(serverOptions, 'blog_branches', {});
  }

  const prMatch = /^\/api\/pr\/(\d+)$/.exec(pathname);
  if (prMatch) {
    return callTool(serverOptions, 'blog_pr_status', { pr: Number(prMatch[1]) });
  }

  if (pathname === '/api/checks') {
    const ref = queryString(url, 'ref');
    return callTool(serverOptions, 'blog_check_status', { ...(ref ? { ref } : {}) });
  }

  if (pathname === '/api/deploy') {
    const mergeCommitSha = queryString(url, 'mergeCommitSha');
    if (!mergeCommitSha) return { status: 400, body: { error: 'mergeCommitSha query parameter is required.' } };
    return callTool(serverOptions, 'blog_deploy_status', { mergeCommitSha });
  }

  return undefined;
}
