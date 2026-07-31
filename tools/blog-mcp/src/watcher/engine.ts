import fs from 'node:fs';
import path from 'node:path';
import { isClean } from '../exec/git.js';
import { callToolInProcess } from '../serve/client.js';
import { appendAuditLog } from '../exec/auditLog.js';
import { insertTruncateMarker } from '../domain/post.js';
import type { CreateServerOptions } from '../server.js';
import type { ResultKind } from '../result.js';

export interface WatchTickDeps {
  repoRoot: string;
  /** Directory polled for new *.md files -- typically a bind mount (see README.md's "Watcher (directory)" section). */
  watchDir: string;
  /** Whether a successfully opened PR also gets blog_arm_auto_merge called on it. */
  autoMerge: boolean;
  /** Must carry the watcher Capabilities profile (src/serve/capabilities.ts's WATCHER_CAPABILITIES). */
  serverOptions: CreateServerOptions;
  /** Injectable clock for tests; defaults to the real time. */
  now?: () => Date;
}

export interface WatchTickResult {
  /** True when the tick did nothing because the repo wasn't clean -- fail-safe, not an error. */
  skippedRepoNotReady: boolean;
  filesConsidered: number;
  filesPublished: number;
  filesFailed: number;
}

function clock(deps: Pick<WatchTickDeps, 'now'>): Date {
  return (deps.now ?? (() => new Date()))();
}

const PROCESSING_DIR = 'processing';
const PROCESSED_DIR = 'processed';
const FAILED_DIR = 'failed';

function ensureWatchDirs(watchDir: string): void {
  for (const sub of [PROCESSING_DIR, PROCESSED_DIR, FAILED_DIR]) {
    fs.mkdirSync(path.join(watchDir, sub), { recursive: true });
  }
}

function timestampPrefix(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

function moveToFailed(watchDir: string, currentPath: string, originalName: string, now: Date, reason: string): void {
  const dest = path.join(watchDir, FAILED_DIR, `${timestampPrefix(now)}-${originalName}`);
  fs.renameSync(currentPath, dest);
  fs.writeFileSync(`${dest}.error.txt`, `${reason}\n`, 'utf8');
}

function moveToProcessed(watchDir: string, currentPath: string, originalName: string, now: Date): void {
  const dest = path.join(watchDir, PROCESSED_DIR, `${timestampPrefix(now)}-${originalName}`);
  fs.renameSync(currentPath, dest);
}

/**
 * Anything left in processing/ at startup means a prior run died mid-file
 * (killed, crashed, container restarted). Never silently reprocess a claimed
 * file -- by the time it was claimed it may already have an open PR, and
 * re-running the pipeline against it could double-publish. Move it to
 * failed/ with an explanation instead; a human decides what to do next.
 */
function recoverInterrupted(watchDir: string, now: Date): void {
  const processingDir = path.join(watchDir, PROCESSING_DIR);
  if (!fs.existsSync(processingDir)) return;
  for (const name of fs.readdirSync(processingDir)) {
    const full = path.join(processingDir, name);
    if (!fs.statSync(full).isFile()) continue;
    moveToFailed(
      watchDir,
      full,
      name,
      now,
      'Processing was interrupted (a prior run crashed or was stopped while handling this file). ' +
        'Check GitHub for a possibly-already-opened PR before dropping this file in again.'
    );
  }
}

interface ParsedFrontMatter {
  title?: unknown;
  description?: unknown;
  slug?: unknown;
  tags?: unknown;
  date?: unknown;
  authors?: unknown;
}

interface RequiredFields {
  title: string;
  description: string;
  slug: string;
  tags: string[];
  date?: string;
  authors?: string[];
}

/**
 * The watcher requires COMPLETE front matter -- unlike Compose's Markdown
 * tab, there is no human here to catch a bad heading-detection guess, so an
 * incomplete file is rejected outright rather than best-effort filled in.
 */
function extractRequiredFields(frontMatter: ParsedFrontMatter | null): RequiredFields | string {
  if (!frontMatter) {
    return 'No usable front matter (missing "---" fences, or the YAML inside failed to parse).';
  }
  const { title, description, slug, tags, date, authors } = frontMatter;
  const missing: string[] = [];
  if (typeof title !== 'string' || !title.trim()) missing.push('title');
  if (typeof description !== 'string' || !description.trim()) missing.push('description');
  if (typeof slug !== 'string' || !slug.trim()) missing.push('slug');
  if (!Array.isArray(tags) || tags.length === 0 || !tags.every((t) => typeof t === 'string')) missing.push('tags (at least one)');
  if (missing.length > 0) {
    return `Missing or empty required front matter field(s): ${missing.join(', ')}.`;
  }
  return {
    title: title as string,
    description: description as string,
    slug: slug as string,
    tags: tags as string[],
    ...(typeof date === 'string' ? { date } : {}),
    ...(Array.isArray(authors) && authors.every((a) => typeof a === 'string') ? { authors: authors as string[] } : {})
  };
}

interface PublishOutcome {
  ok: boolean;
  kind: ResultKind;
  summary: string;
}

/**
 * Branch -> create/update -> stage -> commit -> push -> open PR -> (if
 * autoMerge) arm auto-merge. Mirrors the sequence ui/src/views/ComposeView.tsx
 * drives from the browser, one tools/call at a time via callToolInProcess --
 * every mutating step gets the repo mutex and audit log for free, exactly
 * like a human clicking through the UI would. Deliberately does NOT wrap
 * this whole sequence in withRepoLock itself: each callToolInProcess call
 * already acquires that lock for its own single tool call, so locking again
 * around the outer sequence would deadlock.
 */
async function publishFile(deps: WatchTickDeps, filePath: string, originalName: string): Promise<PublishOutcome> {
  const content = fs.readFileSync(filePath, 'utf8');

  const parseResult = await callToolInProcess(deps.serverOptions, 'blog_parse_markdown', { content });
  if (!parseResult.ok) return { ok: false, kind: parseResult.kind, summary: `blog_parse_markdown failed: ${parseResult.summary}` };
  const parsed = parseResult.data as { frontMatter: ParsedFrontMatter | null; frontMatterPresent: boolean; body: string };
  if (!parsed.frontMatterPresent) {
    return {
      ok: false,
      kind: 'precondition',
      summary: 'No "---" front matter fences found. The watcher requires complete front matter (title/description/slug/tags) -- unlike Compose\'s Markdown tab, there is no human here to fill in a blank field.'
    };
  }

  const fields = extractRequiredFields(parsed.frontMatter);
  if (typeof fields === 'string') return { ok: false, kind: 'precondition', summary: fields };

  const listResult = await callToolInProcess(deps.serverOptions, 'blog_list_posts', {});
  if (!listResult.ok) return { ok: false, kind: listResult.kind, summary: `blog_list_posts failed: ${listResult.summary}` };
  const posts = (listResult.data as { posts: Array<{ slug: string }> }).posts;
  const exists = posts.some((p) => p.slug === fields.slug);

  const branchResult = await callToolInProcess(deps.serverOptions, 'blog_create_branch', {
    slug: fields.slug,
    kind: 'blog',
    checkoutExisting: true
  });
  if (!branchResult.ok) return { ok: false, kind: branchResult.kind, summary: `blog_create_branch failed: ${branchResult.summary}` };
  const branch = (branchResult.data as { branch: string }).branch;

  // blog_create_post auto-inserts a <!-- truncate --> marker when the body
  // doesn't already have one; blog_update_post does NOT (it expects the
  // caller to have one already, matching how Compose's Body field placeholder
  // says "include <!-- truncate --> when updating"). insertTruncateMarker is
  // idempotent (a no-op if the marker's already present), so applying it here
  // for both paths keeps behavior consistent regardless of which tool ends
  // up being called, without touching either tool's own contract.
  const body = insertTruncateMarker(parsed.body, '');

  const writeResult = exists
    ? await callToolInProcess(deps.serverOptions, 'blog_update_post', {
        slug: fields.slug,
        body,
        frontMatter: {
          title: fields.title,
          description: fields.description,
          tags: fields.tags,
          ...(fields.date ? { date: fields.date } : {}),
          ...(fields.authors ? { authors: fields.authors } : {})
        }
      })
    : await callToolInProcess(deps.serverOptions, 'blog_create_post', {
        title: fields.title,
        description: fields.description,
        slug: fields.slug,
        body,
        tags: fields.tags,
        ...(fields.date ? { date: fields.date } : {}),
        ...(fields.authors ? { authors: fields.authors } : {})
      });
  const writeTool = exists ? 'blog_update_post' : 'blog_create_post';
  if (!writeResult.ok) return { ok: false, kind: writeResult.kind, summary: `${writeTool} failed: ${writeResult.summary}` };
  const writtenPath = (writeResult.data as { path: string }).path;

  const stageResult = await callToolInProcess(deps.serverOptions, 'blog_stage', { paths: [writtenPath] });
  if (!stageResult.ok) return { ok: false, kind: stageResult.kind, summary: `blog_stage failed: ${stageResult.summary}` };

  const commitResult = await callToolInProcess(deps.serverOptions, 'blog_commit', {
    type: exists ? 'chore' : 'feat',
    scope: 'blog',
    summary: `${exists ? 'update' : 'add'} ${fields.slug}`
  });
  if (!commitResult.ok) return { ok: false, kind: commitResult.kind, summary: `blog_commit failed: ${commitResult.summary}` };

  const pushResult = await callToolInProcess(deps.serverOptions, 'blog_push', {});
  if (!pushResult.ok) return { ok: false, kind: pushResult.kind, summary: `blog_push failed: ${pushResult.summary}` };
  const localSha = (pushResult.data as { localSha: string }).localSha;

  const prResult = await callToolInProcess(deps.serverOptions, 'blog_create_pr', {
    title: `${exists ? 'Update' : 'Add'} ${fields.title}`,
    body: `Published via blog-mcp's directory watcher from \`${originalName}\`.`,
    head: branch
  });
  if (!prResult.ok) return { ok: false, kind: prResult.kind, summary: `blog_create_pr failed: ${prResult.summary}` };
  const { pr, url } = prResult.data as { pr: number; url: string };

  if (!deps.autoMerge) {
    return { ok: true, kind: 'success', summary: `Published '${fields.slug}' as PR #${pr} (${url}); auto-merge not armed (BLOG_MCP_WATCH_AUTO_MERGE=0).` };
  }

  // Deliberately the SHA this run itself just pushed, not whatever
  // /api/pr-equivalent currently reports -- fetching the "expected" value
  // from the same place the check validates against would make the
  // cross-check tautological (same rule Compose and the scheduler follow).
  const armResult = await callToolInProcess(deps.serverOptions, 'blog_arm_auto_merge', { pr, headSha: localSha });
  if (!armResult.ok) {
    return { ok: false, kind: armResult.kind, summary: `Opened PR #${pr} (${url}) but blog_arm_auto_merge failed: ${armResult.summary}` };
  }
  return { ok: true, kind: 'success', summary: `Published '${fields.slug}' as PR #${pr} (${url}), auto-merge armed.` };
}

/**
 * One watcher tick: claims every *.md file sitting directly in watchDir (not
 * its processing/processed/failed subdirectories) and publishes them one at
 * a time -- there is only one working tree, so no parallelism. Same
 * fail-safe spirit as the cron scheduler's pre-flight check, but narrower:
 * the watcher only requires a clean tree, not also being parked on the base
 * branch, since blog_create_branch always branches fresh from
 * origin/<base> regardless of what's currently checked out -- being parked
 * on a previous file's feature branch between ticks is harmless.
 */
export async function runWatchTick(deps: WatchTickDeps): Promise<WatchTickResult> {
  const now = clock(deps);
  ensureWatchDirs(deps.watchDir);
  recoverInterrupted(deps.watchDir, now);

  if (!(await isClean({ repoRoot: deps.repoRoot }))) {
    return { skippedRepoNotReady: true, filesConsidered: 0, filesPublished: 0, filesFailed: 0 };
  }

  const names = fs
    .readdirSync(deps.watchDir)
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .filter((name) => fs.statSync(path.join(deps.watchDir, name)).isFile())
    .sort();

  let published = 0;
  let failed = 0;
  for (const name of names) {
    const rootPath = path.join(deps.watchDir, name);
    const processingPath = path.join(deps.watchDir, PROCESSING_DIR, name);
    // Claim the file before any git/gh work starts -- the instant it's gone
    // from the root, no future tick will look at it again, regardless of
    // how this file's processing turns out.
    fs.renameSync(rootPath, processingPath);

    let outcome: PublishOutcome;
    try {
      outcome = await publishFile(deps, processingPath, name);
    } catch (err) {
      outcome = { ok: false, kind: 'infrastructure', summary: err instanceof Error ? (err.stack ?? err.message) : String(err) };
    }

    if (outcome.ok) {
      moveToProcessed(deps.watchDir, processingPath, name, now);
      published++;
    } else {
      moveToFailed(deps.watchDir, processingPath, name, now, outcome.summary);
      failed++;
    }
    appendAuditLog(deps.serverOptions.auditLogPath, { tool: 'blog_watch_publish', ok: outcome.ok, kind: outcome.kind, summary: outcome.summary });
  }

  return { skippedRepoNotReady: false, filesConsidered: names.length, filesPublished: published, filesFailed: failed };
}

export interface WatcherHandle {
  /** Stops the tick timer and waits for any in-flight tick to finish -- never interrupts a tick mid-write. */
  stop: () => Promise<void>;
}

/**
 * Starts the poll loop (15s default). A single in-process `inFlight` guard
 * is sufficient -- one Node process, one watcher, ticks run sequentially off
 * one timer, matching the same single-instance assumption the scheduler and
 * the in-process repo mutex both already make. Polling rather than
 * fs.watch/inotify is deliberate: bind mounts under Docker Desktop
 * (osxfs/gRPC-FUSE/virtiofs) and Windows WSL2 mounts are notoriously
 * unreliable for native change-notification events across the VM boundary.
 */
export function startWatcher(
  deps: WatchTickDeps & { tickIntervalMs?: number; /** Injectable for tests -- defaults to the real runWatchTick. */ tickFn?: (deps: WatchTickDeps) => Promise<WatchTickResult> }
): WatcherHandle {
  const intervalMs = deps.tickIntervalMs ?? 15_000;
  const tick = deps.tickFn ?? runWatchTick;
  let inFlight = false;
  let stopped = false;
  let currentTick: Promise<unknown> = Promise.resolve();

  const timer = setInterval(() => {
    if (stopped || inFlight) return;
    inFlight = true;
    currentTick = tick(deps)
      .catch((err) => {
        process.stderr.write(`blog-mcp watcher: tick failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      })
      .finally(() => {
        inFlight = false;
      });
  }, intervalMs);
  timer.unref();

  return {
    async stop(): Promise<void> {
      stopped = true;
      clearInterval(timer);
      await currentTick;
    }
  };
}
