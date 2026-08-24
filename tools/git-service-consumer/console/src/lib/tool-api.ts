/**
 * S37's own fetch wrapper for the base's generic tool-dispatch route
 * (`20-contract.md` § *The HTTP API route table*,
 * `POST /declarations/{declarationId}/tools/{toolName}`). Same
 * CSRF-cookie/`credentials: 'same-origin'` shape as the base console's own
 * `console/src/api.ts`, duplicated rather than imported because that module
 * is internal to the base console app, not part of `@subzerodev-git/console`'s
 * published surface (`console/src/index.ts`).
 */

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)szg_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * The base's own wire shape (`ToolResult.findings`), not blog-mcp's original
 * `{path?, line?, severity, rule, message}` client type: `declarations.ts`'s
 * `toEnvelopeFindings` collapses `severity` into a `[error]`/`[warning]`
 * prefix on `message` rather than carrying it as a field
 * (`git-service-consumer/declarations.ts:78-89`).
 */
export interface Finding {
  readonly path: string;
  readonly rule: string;
  readonly message: string;
}

export interface ToolResult<TData = unknown> {
  readonly ok: boolean;
  readonly kind: string;
  readonly summary: string;
  readonly data?: TData;
  readonly findings?: readonly Finding[];
}

/** Thrown by `dispatch()` on a non-ok `ToolResult` -- carries `findings` so callers can show which rule failed, not just the summary. */
export class ToolCallError extends Error {
  readonly findings?: readonly Finding[];
  constructor(message: string, findings?: readonly Finding[]) {
    super(message);
    this.name = 'ToolCallError';
    this.findings = findings;
  }
}

async function callTool<TInput, TOutput>(declarationId: string, toolName: string, input: TInput): Promise<ToolResult<TOutput>> {
  const res = await fetch(`/declarations/${encodeURIComponent(declarationId)}/tools/${encodeURIComponent(toolName)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  return (text.length > 0 ? JSON.parse(text) : {}) as ToolResult<TOutput>;
}

/** Dispatches a tool call scoped to `declarationId` and returns its data, or throws `ToolCallError` when the result is not ok. */
export async function dispatch<TInput, TOutput>(declarationId: string, toolName: string, input: TInput): Promise<TOutput> {
  const result = await callTool<TInput, TOutput>(declarationId, toolName, input);
  if (!result.ok) throw new ToolCallError(result.summary || `${toolName} failed`, result.findings);
  return result.data as TOutput;
}

// --- Blog content tool payload shapes (SubZeroDev.Blog/tools/git-service-consumer/declarations.ts) ---

export interface PostSummary {
  readonly path: string;
  readonly filename: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly authors: readonly string[];
  readonly tags: readonly string[];
  readonly canonicalUrl: string;
  readonly hasTruncate: boolean;
}

export interface PostFrontMatter {
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly authors?: readonly string[];
  readonly date?: string;
  readonly slug?: string;
}

export interface GetPostResult {
  readonly path: string;
  readonly frontMatter: PostFrontMatter | null;
  readonly body: string;
  readonly canonicalUrl?: string;
}

export interface PostWriteResult {
  readonly path: string;
  readonly previousPath?: string;
  readonly changedPaths: readonly string[];
  readonly canonicalDate: string;
  readonly authors: readonly string[];
  readonly tags: readonly string[];
  readonly createdAuthors: readonly { key: string; name: string }[];
  readonly createdTags: readonly { key: string; label: string }[];
  readonly defaultAuthorUsed: boolean;
  readonly canonicalUrl: string;
}

export interface TagRecord {
  readonly key: string;
  readonly label: string;
  readonly permalink: string;
  readonly description: string;
  readonly postCount: number;
}

export interface AuthorRecord {
  readonly key: string;
  readonly name: string;
  readonly url: string;
  readonly imageUrl?: string;
}

export interface ParseMarkdownResult {
  readonly frontMatter: Record<string, unknown> | null;
  readonly frontMatterPresent: boolean;
  readonly body: string;
}

export function listPosts(declarationId: string): Promise<{ posts: readonly PostSummary[] }> {
  return dispatch(declarationId, 'list_posts', {});
}

export function getPost(declarationId: string, slug: string): Promise<GetPostResult> {
  return dispatch(declarationId, 'get_post', { slug });
}

export function listTags(declarationId: string): Promise<{ tags: readonly TagRecord[] }> {
  return dispatch(declarationId, 'list_tags', {});
}

export function listAuthors(declarationId: string): Promise<{ authors: readonly AuthorRecord[] }> {
  return dispatch(declarationId, 'list_authors', {});
}

export function parseMarkdown(declarationId: string, content: string): Promise<ParseMarkdownResult> {
  return dispatch(declarationId, 'parse_markdown', { content });
}

export interface CreatePostInput {
  readonly title: string;
  readonly description: string;
  readonly slug: string;
  readonly body: string;
  readonly tags: readonly string[];
  readonly date?: string;
  readonly authors?: readonly string[];
}

export function createPost(declarationId: string, input: CreatePostInput): Promise<PostWriteResult> {
  return dispatch(declarationId, 'create_post', input);
}

export interface UpdatePostInput {
  readonly slug: string;
  readonly body?: string;
  readonly frontMatter?: PostFrontMatter;
}

export function updatePost(declarationId: string, input: UpdatePostInput): Promise<PostWriteResult> {
  return dispatch(declarationId, 'update_post', input);
}

export function deletePost(declarationId: string, slug: string): Promise<{ path: string }> {
  return dispatch(declarationId, 'delete_post', { slug });
}

export function addTag(declarationId: string, key: string, label: string, description: string): Promise<{ key: string; permalink: string; path: string }> {
  return dispatch(declarationId, 'add_tag', { key, label, description });
}

export function addAuthor(declarationId: string, key: string, name: string): Promise<{ key: string; name: string; url: string; path: string }> {
  return dispatch(declarationId, 'add_author', { key, name });
}

// --- Base git/PR publish-pipeline tools (SubZeroDev.Git/src/composition-root/production-declarations.ts) ---

export interface PullRequestRef {
  readonly number: number;
  readonly url: string;
  readonly branch: string;
}

export interface PullRequestStatus {
  readonly ref: PullRequestRef;
  readonly state: string;
  readonly headSha: string;
  readonly baseSha: string;
  readonly mergeCommitSha: string | null;
  readonly mergeable: boolean | null;
  readonly autoMergeEnabled: boolean;
}

export function prepareBranch(declarationId: string, branch: string): Promise<{ branch: string; baseBranch: string; branchHeadSha: string; baseSha: string; action: string }> {
  return dispatch(declarationId, 'prepare_branch', { branch });
}

export function stagePaths(declarationId: string, paths: readonly string[]): Promise<{ staged: readonly string[] }> {
  return dispatch(declarationId, 'git_stage', { paths });
}

export function commit(declarationId: string, message: string): Promise<{ sha: string; branch: string; changedPaths: readonly string[] }> {
  return dispatch(declarationId, 'git_commit', { message });
}

export function push(declarationId: string, branch: string | null): Promise<{ branch: string; headSha: string; alreadyUpToDate: boolean }> {
  return dispatch(declarationId, 'git_push', { branch });
}

export function openPullRequest(declarationId: string, title: string, body: string, headBranch: string | null): Promise<{ ref: PullRequestRef }> {
  return dispatch(declarationId, 'pr_open', { title, body, headBranch, draft: false });
}

export function enableAutoMerge(declarationId: string, number: number): Promise<{ number: number; autoMergeEnabled: boolean }> {
  return dispatch(declarationId, 'pr_enable_auto_merge', { number });
}

export function prStatus(declarationId: string, number: number): Promise<{ status: PullRequestStatus }> {
  return dispatch(declarationId, 'pr_status', { number });
}
