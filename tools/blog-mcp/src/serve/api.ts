import type { CreateServerOptions } from '../server.js';
import { callToolInProcess } from './client.js';
import type { ToolResult } from '../result.js';

export interface ApiResponse {
  status: number;
  body: unknown;
}

/**
 * Route table for `serve` mode's `/api/*`. Every route is an explicit
 * `tools/call`, never a generic "call any tool by name" proxy -- that would
 * silently re-expose whatever the UI's capabilities profile
 * (src/serve/capabilities.ts) registers, defeating the entire "the UI can
 * only do what an MCP client's tool list allows" property this design
 * exists for. Phase 4 shipped only the GET (read) routes below; Phase 5
 * adds the POST (write) ones as new entries here, not by widening this into
 * a passthrough.
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

/** Body is whatever JSON the caller sent; the underlying tool's own zod schema is the real validator, so this just needs an object to spread fields from. */
function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

/** A malformed percent-encoding (e.g. a lone '%') makes decodeURIComponent throw URIError -- caught here so a bad URL is a 400, not an uncaught exception that falls through to the top-level 500 handler. */
function safeDecodeSlug(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

/** Returns undefined for any path/method this route table doesn't recognize -- the caller falls through to a 404. */
export async function handleApiRequest(
  pathname: string,
  method: string,
  url: URL,
  serverOptions: CreateServerOptions,
  body?: unknown
): Promise<ApiResponse | undefined> {
  if (method === 'GET') {
    if (pathname === '/api/posts') {
      const tag = queryString(url, 'tag');
      const limit = queryNumber(url, 'limit');
      return callTool(serverOptions, 'blog_list_posts', { ...(tag ? { tag } : {}), ...(limit !== undefined ? { limit } : {}) });
    }

    const getPostMatch = /^\/api\/posts\/([^/]+)$/.exec(pathname);
    if (getPostMatch) {
      const slug = safeDecodeSlug(getPostMatch[1] as string);
      if (slug === undefined) return { status: 400, body: { error: 'Malformed slug in URL path.' } };
      return callTool(serverOptions, 'blog_get_post', { slug });
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

    if (pathname === '/api/tags') {
      return callTool(serverOptions, 'blog_list_tags', {});
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

  if (method === 'POST') {
    const args = asRecord(body);

    if (pathname === '/api/parse-markdown') {
      return callTool(serverOptions, 'blog_parse_markdown', args);
    }

    if (pathname === '/api/posts') {
      return callTool(serverOptions, 'blog_create_post', args);
    }

    if (pathname === '/api/tags') {
      return callTool(serverOptions, 'blog_add_tag', args);
    }

    const updatePostMatch = /^\/api\/posts\/([^/]+)$/.exec(pathname);
    if (updatePostMatch) {
      const slug = safeDecodeSlug(updatePostMatch[1] as string);
      if (slug === undefined) return { status: 400, body: { error: 'Malformed slug in URL path.' } };
      return callTool(serverOptions, 'blog_update_post', { ...args, slug });
    }

    const deletePostMatch = /^\/api\/posts\/([^/]+)\/delete$/.exec(pathname);
    if (deletePostMatch) {
      const slug = safeDecodeSlug(deletePostMatch[1] as string);
      if (slug === undefined) return { status: 400, body: { error: 'Malformed slug in URL path.' } };
      return callTool(serverOptions, 'blog_delete_post', { slug });
    }

    if (pathname === '/api/branch') {
      return callTool(serverOptions, 'blog_create_branch', args);
    }

    if (pathname === '/api/stage') {
      return callTool(serverOptions, 'blog_stage', args);
    }

    if (pathname === '/api/commit') {
      return callTool(serverOptions, 'blog_commit', args);
    }

    if (pathname === '/api/push') {
      return callTool(serverOptions, 'blog_push', args);
    }

    if (pathname === '/api/pr') {
      return callTool(serverOptions, 'blog_create_pr', args);
    }

    const autoMergeMatch = /^\/api\/pr\/(\d+)\/auto-merge$/.exec(pathname);
    if (autoMergeMatch) {
      return callTool(serverOptions, 'blog_auto_merge', { ...args, pr: Number(autoMergeMatch[1]) });
    }

    return undefined;
  }

  return undefined;
}
