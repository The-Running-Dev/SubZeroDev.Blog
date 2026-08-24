import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// ---- GitService contract types (base) --------------------------------------
import type { JsonSchema } from '../../../SubZeroDev.GitService/src/contract/json.ts';
import type { ModuleTargetName, RegistryToolName, BranchName, RepoRelativePath } from '../../../SubZeroDev.GitService/src/shared/brands.ts';
import { repoRelativePath } from '../../../SubZeroDev.GitService/src/shared/brands.ts';
import type { ToolDeclaration } from '../../../SubZeroDev.GitService/src/contract/tool-declaration.ts';
import type { CallContext } from '../../../SubZeroDev.GitService/src/shared/call-context.ts';
import type { Diagnostics, ToolResult } from '../../../SubZeroDev.GitService/src/result/envelope.ts';
import { success, validation, precondition, authorization, infrastructure } from '../../../SubZeroDev.GitService/src/result/envelope.ts';
import type { FileWatcherApplyData, FileWatcherApplyInput, FileWatcherPlanData, FileWatcherPlanInput } from '../../../SubZeroDev.GitService/src/watcher/types.ts';

// ---- blog-mcp domain functions (reused, not reimplemented) -----------------
import { parseMarkdown } from '../blog-mcp/dist/domain/frontmatter.js';
import { buildFilename } from '../blog-mcp/dist/domain/post.js';
import { writeFilesAtomically } from '../blog-mcp/dist/domain/atomicWrite.js';

/**
 * S38: the blog's generic-file-watcher plan/apply pair, satisfying
 * `20-contract.md` § File watcher exactly. A post file dropped in the
 * blog's watcher inbox is a *complete* post file -- front matter fences plus
 * body, the same shape `create_post` (`declarations.ts`) assembles and the
 * same shape `parseMarkdown` (`blog-mcp/dist/domain/frontmatter.js`)
 * already parses -- so the plan tool needs no new parsing of its own.
 *
 * ASSUMPTION (see the S38 report): `watchedPostPlanHandler` is pure per the
 * contract ("dispatch supplies `ctx.cloneRoot: null` for a `fileWatcher:
 * 'plan'` entry") and therefore cannot call blog-mcp's own `loadConfig`,
 * which reads `<repoRoot>/.config/blog.json` off a real checkout. The
 * target directory is hardcoded to `docs/blog` here -- `loadConfig`'s own
 * default when no `.config/blog.json` override is present
 * (`tools/blog-mcp/src/config.ts`). A blog instance that overrides
 * `blog_dir` via that file would need this constant to track it; nothing in
 * S38's scope wires the plan tool to read repository config without a
 * clone.
 */
const BLOG_DIR = 'docs/blog';

/**
 * Copied from `blog-mcp/src/domain/validate.ts`'s own `SLUG_PATTERN` and
 * `FILENAME_PATTERN` date prefix -- neither is exported there for a consumer
 * to import. Presence alone is not enough for these two fields: `slug`
 * becomes a git branch name (`watcher/post-<slug>`) and `date` becomes the
 * filename's date prefix (`buildFilename` slices the first ten characters
 * verbatim), so a value this plan tool accepts but git or the blog's own
 * validator rejects would reach `prepare_branch`, or open a pull request for
 * a file the blog reports as malformed.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}/;

function diag(ctx: CallContext, durationMs = 0): Diagnostics {
  return { operationId: ctx.operationId, declarationId: ctx.declarationId, generation: ctx.generation, durationMs };
}

function requireRepoRoot(ctx: CallContext): { readonly ok: true; readonly repoRoot: string } | { readonly ok: false; readonly result: ToolResult<never> } {
  if (!ctx.cloneRoot) {
    return { ok: false, result: infrastructure('No clone root is available on this call context; the declaration must provide a provisioned checkout.') };
  }
  return { ok: true, repoRoot: ctx.cloneRoot };
}

/**
 * Copied from `src/git/git-operations.ts`'s own `pathMatchesPrefix` (~line
 * 216) -- not exported there for a consumer to import directly. A
 * `PathPrefix` ending in `/` is a directory, matched by `startsWith`; one
 * that does not is a single named file, matched by exact equality only.
 */
function pathMatchesPrefix(candidate: string, prefix: string): boolean {
  return prefix.endsWith('/') ? candidate.startsWith(prefix) : candidate === prefix;
}

// =============================================================================
// Shared plan schema -- referenced (not duplicated) by both tools, so their
// canonical forms are trivially equal, as `watcherValidation`
// (`src/declarations/declarations.ts`) requires.
// =============================================================================

const WATCHED_POST_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    content: { type: 'string' },
  },
  required: ['path', 'content'],
  additionalProperties: false,
};

/** The apply tool's only input beyond `permittedPaths`: the post's target repo-relative path and its complete file content. */
export interface WatchedPostPlan {
  readonly path: string;
  readonly content: string;
}

// =============================================================================
// watched_post_plan -- fileWatcher: 'plan'
// =============================================================================

export const WATCHED_POST_PLAN_TARGET = 'content.watchedPostPlan' as ModuleTargetName;

const WATCHED_POST_PLAN_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    sourceFile: { type: 'string' },
    content: { type: 'string' },
  },
  required: ['sourceFile', 'content'],
  additionalProperties: false,
} as unknown as JsonSchema;

const WATCHED_POST_PLAN_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    commitMessage: { type: 'string' },
    pullRequest: {
      type: 'object',
      properties: { title: { type: 'string' }, body: { type: 'string' } },
      required: ['title', 'body'],
      additionalProperties: false,
    },
    permittedPaths: { type: 'array', items: { type: 'string' } },
    plan: WATCHED_POST_PLAN_SCHEMA,
  },
  required: ['branch', 'commitMessage', 'pullRequest', 'permittedPaths', 'plan'],
  additionalProperties: false,
} as unknown as JsonSchema;

/**
 * Pure: parses `input.content`, computes the plan, and never touches the
 * filesystem or a git command. A file whose front matter is missing or
 * fails these checks returns a `validation` result rather than throwing --
 * `runProtocol` (`src/watcher/watcher.ts`) stops at this step, before
 * `prepare_branch` is ever dispatched, satisfying S38.5's "never reaches a
 * git command" for a bad file.
 */
async function watchedPostPlanHandler(ctx: CallContext, input: FileWatcherPlanInput): Promise<ToolResult<FileWatcherPlanData<WatchedPostPlan>>> {
  const parsed = parseMarkdown(input.content);
  if (!parsed.frontMatterPresent || parsed.frontMatter === null) {
    return validation(`'${input.sourceFile}' has no parseable front matter.`, [
      { path: input.sourceFile as unknown as string, rule: 'FrontMatterPresent', message: 'Expected --- fenced YAML front matter at the top of the file.' },
    ]);
  }

  const fm = parsed.frontMatter;
  const missing: string[] = [];
  if (typeof fm.title !== 'string' || fm.title.length === 0) missing.push('title');
  if (typeof fm.description !== 'string' || fm.description.length === 0) missing.push('description');
  if (typeof fm.slug !== 'string' || fm.slug.length === 0) missing.push('slug');
  if (typeof fm.date !== 'string' || fm.date.length === 0) missing.push('date');
  if (!Array.isArray(fm.tags) || fm.tags.length === 0 || !fm.tags.every((t) => typeof t === 'string')) missing.push('tags');
  // `authors` is one of blog-mcp's own REQUIRED_FIELDS
  // (`src/domain/validate.ts`); a post published without it is one the
  // blog's validator reports as incomplete, so the watcher refuses it here
  // rather than opening a pull request for it.
  if (!Array.isArray(fm.authors) || fm.authors.length === 0 || !fm.authors.every((a) => typeof a === 'string')) missing.push('authors');

  if (missing.length > 0) {
    return validation(
      `'${input.sourceFile}' is missing required front matter field(s): ${missing.join(', ')}.`,
      missing.map((field) => ({
        path: field,
        rule: 'RequiredFrontMatterField',
        message: `'${field}' is required and must be a non-empty ${field === 'tags' || field === 'authors' ? 'array of strings' : 'string'}.`,
      })),
    );
  }

  const slug = fm.slug as string;
  const title = fm.title as string;
  const date = fm.date as string;

  if (!SLUG_PATTERN.test(slug)) {
    return validation(`'${input.sourceFile}' has slug '${slug}', which is not lowercase kebab-case.`, [
      { path: 'slug', rule: 'Slug', message: `Slug '${slug}' must be lowercase kebab-case with no slashes -- it also becomes this post's branch name.` },
    ]);
  }
  if (!DATE_PREFIX_PATTERN.test(date)) {
    return validation(`'${input.sourceFile}' has date '${date}', which does not start with YYYY-MM-DD.`, [
      { path: 'date', rule: 'Date', message: `Date '${date}' must start with YYYY-MM-DD -- it becomes the post filename's date prefix.` },
    ]);
  }

  const filename = buildFilename(date, slug);
  const targetPath = `${BLOG_DIR}/${filename}`;
  const validatedPath = repoRelativePath(targetPath);
  if (!validatedPath.ok) {
    return validation(`Computed path '${targetPath}' is not a valid repo-relative path.`, [
      { path: targetPath, rule: validatedPath.error.rule, message: 'The computed target path failed repo-relative-path validation.' },
    ]);
  }

  const plan: WatchedPostPlan = { path: targetPath, content: input.content };
  const data: FileWatcherPlanData<WatchedPostPlan> = {
    branch: `watcher/post-${slug}` as BranchName,
    commitMessage: `content: publish post '${slug}'`,
    pullRequest: {
      title: `New post: ${title}`,
      body: `Adds \`${targetPath}\`, delivered by the file watcher from \`${input.sourceFile}\`.`,
    },
    permittedPaths: [validatedPath.value],
    plan,
  };
  return success(`Planned '${targetPath}' from '${input.sourceFile}'`, data, diag(ctx));
}

export const WATCHED_POST_PLAN_HANDLER = watchedPostPlanHandler;

// =============================================================================
// watched_post_apply -- fileWatcher: 'apply'
// =============================================================================

export const WATCHED_POST_APPLY_TARGET = 'content.watchedPostApply' as ModuleTargetName;

const WATCHED_POST_APPLY_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    permittedPaths: { type: 'array', items: { type: 'string' } },
    plan: WATCHED_POST_PLAN_SCHEMA,
  },
  required: ['permittedPaths', 'plan'],
  additionalProperties: false,
} as unknown as JsonSchema;

const WATCHED_POST_APPLY_OUTPUT_SCHEMA = {
  type: 'object',
  properties: { changedPaths: { type: 'array', items: { type: 'string' } } },
  required: ['changedPaths'],
  additionalProperties: false,
} as unknown as JsonSchema;

/**
 * Validates every candidate path against `ctx.writablePathPrefixes` before
 * any write -- unconditionally, regardless of who dispatched the call
 * (S38.6: called directly, bypassing the watcher, this still refuses a path
 * outside the declaration's writable prefixes the same way). Only after
 * that check passes does it write, via blog-mcp's own
 * `writeFilesAtomically`. Never stages, commits, pushes, or opens a pull
 * request -- `runProtocol` (`src/watcher/watcher.ts`) does those as
 * separate dispatched tool calls after this returns.
 */
async function watchedPostApplyHandler(ctx: CallContext, input: FileWatcherApplyInput<WatchedPostPlan>): Promise<ToolResult<FileWatcherApplyData>> {
  const permitted = input.permittedPaths as unknown as readonly string[];
  if (!permitted.includes(input.plan.path)) {
    // The watcher's own protocol (`src/watcher/watcher.ts`) rejects the run
    // after this returns if what was written is not a subset of the plan's
    // permitted paths -- but only after the write has already dirtied the
    // clone, which then stalls every later tick at `clone-not-clean`.
    // Refusing here keeps the working tree untouched.
    return validation(`'${input.plan.path}' is not among the plan's permitted paths.`, [
      { path: input.plan.path, rule: 'PlanPathPermitted', message: 'The plan\'s path must be one of permittedPaths.' },
    ]);
  }

  const candidatePaths = [...new Set<string>([...permitted, input.plan.path])];
  const validated: RepoRelativePath[] = [];

  for (const rawPath of candidatePaths) {
    const parsed = repoRelativePath(rawPath);
    if (!parsed.ok) {
      return validation(`'${rawPath}' is not a valid repo-relative path.`, [{ path: rawPath, rule: parsed.error.rule, message: 'malformed path' }]);
    }
    const allowed = ctx.writablePathPrefixes.some((prefix) => pathMatchesPrefix(parsed.value as unknown as string, prefix as unknown as string));
    if (!allowed) {
      return authorization(`'${rawPath}' is outside the declaration's writable path prefixes.`, []);
    }
    validated.push(parsed.value);
  }

  const root = requireRepoRoot(ctx);
  if (!root.ok) return root.result;

  const absolutePath = path.join(root.repoRoot, input.plan.path);
  try {
    // A byte-identical file already in the working tree means this write
    // changes nothing, so the `repo_status` observation `runProtocol`
    // (`src/watcher/watcher.ts`) takes right after this returns would see no
    // changed paths and reject the run with 'the independently observed
    // changed paths do not equal the apply result' -- a message about the
    // symptom, not the cause. Report the cause here instead, before writing.
    if (existsSync(absolutePath) && readFileSync(absolutePath, 'utf8') === input.plan.content) {
      return precondition(`'${input.plan.path}' already has exactly this content; there is nothing to publish.`, [
        { path: input.plan.path, rule: 'AlreadyPublished', message: 'The working tree already carries this file byte for byte.' },
      ]);
    }
    writeFilesAtomically([{ absolutePath, content: input.plan.content }]);
  } catch (err) {
    // blog-mcp's exception-based control flow (`InfrastructureError`), the
    // same conversion `declarations.ts`'s own `fromThrown` performs. Without
    // it the throw escapes the module handler entirely -- dispatch does not
    // envelope it -- stranding the claimed file in `processing/` with no
    // audit entry and no attention notification.
    return infrastructure(err instanceof Error ? err.message : String(err));
  }

  const changedPaths = [input.plan.path as unknown as RepoRelativePath];
  return success(`Wrote '${input.plan.path}'`, { changedPaths }, diag(ctx));
}

export const WATCHED_POST_APPLY_HANDLER = watchedPostApplyHandler;

// =============================================================================
// Declarations
// =============================================================================

const WATCHED_POST_LIMITS = { timeoutSeconds: 30, maxResultBytes: 65_536 };
const WATCHED_POST_PLAN_ANNOTATIONS = { schedulable: false, fileWatcher: 'plan' as const, untrustedOutput: true };
const WATCHED_POST_APPLY_ANNOTATIONS = { schedulable: false, fileWatcher: 'apply' as const, untrustedOutput: true };

export const WATCHED_POST_TOOL_DECLARATIONS: readonly ToolDeclaration[] = [
  {
    name: 'watched_post_plan' as RegistryToolName,
    description:
      "Plans a pull request for a post file dropped in the blog's watcher inbox: parses its front matter, computes the target path under docs/blog, and returns an opaque plan for watched_post_apply. Pure -- touches no filesystem or git state and never reaches a git command on its own; a file that fails validation is reported, not thrown.",
    inputSchema: WATCHED_POST_PLAN_INPUT_SCHEMA,
    outputSchema: WATCHED_POST_PLAN_OUTPUT_SCHEMA,
    scopes: ['write'],
    capabilities: [],
    capabilityScope: 'declaration',
    executionClass: 'read',
    annotations: WATCHED_POST_PLAN_ANNOTATIONS,
    limits: WATCHED_POST_LIMITS,
    target: { kind: 'module', target: WATCHED_POST_PLAN_TARGET },
  },
  {
    name: 'watched_post_apply' as RegistryToolName,
    description:
      "Applies a watched_post_plan plan: validates every candidate path against the declaration's writable path prefixes, then writes the post file to the working tree. Never stages, commits, pushes, or opens a pull request -- the watcher's own protocol does that as separate steps after this returns.",
    inputSchema: WATCHED_POST_APPLY_INPUT_SCHEMA,
    outputSchema: WATCHED_POST_APPLY_OUTPUT_SCHEMA,
    scopes: ['write'],
    capabilities: ['git.local.write'],
    capabilityScope: 'declaration',
    executionClass: 'mutating',
    annotations: WATCHED_POST_APPLY_ANNOTATIONS,
    limits: WATCHED_POST_LIMITS,
    target: { kind: 'module', target: WATCHED_POST_APPLY_TARGET },
  },
];

export const WATCHED_POST_MODULE_HANDLERS: readonly { readonly target: ModuleTargetName; readonly handler: unknown }[] = [
  { target: WATCHED_POST_PLAN_TARGET, handler: WATCHED_POST_PLAN_HANDLER },
  { target: WATCHED_POST_APPLY_TARGET, handler: WATCHED_POST_APPLY_HANDLER },
];
