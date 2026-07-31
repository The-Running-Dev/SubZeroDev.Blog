import fs from 'node:fs';
import path from 'node:path';
import { git, gitOrThrow, currentBranch, remoteUrl, isClean } from '../exec/git.js';
import { gh } from '../exec/gh.js';
import { parseOwnerRepo, type OwnerRepo } from '../domain/github.js';
import { loadConfig } from '../config.js';
import { PreconditionError } from '../errors.js';

export interface EnsureRepoOptions {
  /** Directory the managed clone lives in, e.g. `<workspace>/repo`. */
  repoPath: string;
  cloneUrl: string;
  gitUserName: string;
  gitUserEmail: string;
}

export type EnsureRepoAction =
  | 'cloned'
  | 'fast-forwarded'
  | 'switched-to-base'
  | 'left-on-feature-branch'
  | 'left-dirty'
  | 'diverged';

export interface EnsureRepoResult {
  repoRoot: string;
  action: EnsureRepoAction;
  branch: string;
  dirty: boolean;
}

const CLONE_TIMEOUT_MS = 300_000;

function tryParseOwnerRepo(url: string): OwnerRepo | undefined {
  try {
    return parseOwnerRepo(url);
  } catch {
    return undefined;
  }
}

/**
 * True when `a` and `b` name the same remote. GitHub-shaped URLs (https or
 * ssh) are compared as owner/repo, so https vs ssh and a trailing `.git`
 * never cause a false mismatch. When *neither* string is GitHub-shaped --
 * cloning from a local bare repo, as tests and local dev do -- falls back to
 * comparing normalized absolute paths rather than refusing outright. If only
 * one side parses as a GitHub URL, that is a genuine mismatch.
 */
function sameOwnerRepo(a: string, b: string): boolean {
  const pa = tryParseOwnerRepo(a);
  const pb = tryParseOwnerRepo(b);

  if (pa && pb) {
    return pa.owner.toLowerCase() === pb.owner.toLowerCase() && pa.repo.toLowerCase() === pb.repo.toLowerCase();
  }
  if (!pa && !pb) {
    const normalize = (value: string): string => path.resolve(value.replace(/[\\/]+$/, '')).toLowerCase();
    return normalize(a) === normalize(b);
  }
  return false;
}

async function isValidGitRepo(repoPath: string): Promise<boolean> {
  const result = await git(['rev-parse', '--git-dir'], { repoRoot: repoPath });
  return result.exitCode === 0;
}

async function setIdentity(repoRoot: string, name: string, email: string): Promise<void> {
  // Repo-local (no --global), so identity lives in the volume and is
  // auditable rather than in $HOME, which a restored volume would not carry.
  await gitOrThrow(['config', 'user.name', name], { repoRoot });
  await gitOrThrow(['config', 'user.email', email], { repoRoot });
}

/**
 * `blog_arm_auto_merge` squash-merges (src/tools/remote.ts), which rewrites
 * commits -- a squash-merged branch's commits are never ancestors of
 * origin/<base>, so `git merge-base --is-ancestor` would say "unmerged"
 * forever. Ask GitHub instead. Best-effort: if `gh` is unavailable or
 * unauthenticated, treat the branch as unmerged -- the safe direction, since
 * it only costs "left parked one extra boot," never a wrongful switch away
 * from work that isn't actually published.
 */
async function isBranchMergedViaGitHub(repoRoot: string, branch: string): Promise<boolean> {
  try {
    const result = await gh(['pr', 'list', '--head', branch, '--state', 'merged', '--json', 'number'], { repoRoot });
    if (result.exitCode !== 0) return false;
    const parsed: unknown = JSON.parse(result.stdout || '[]');
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

/**
 * Makes `repoPath` a clean, reconciled checkout of `cloneUrl`, cloning it if
 * absent. Never discards uncommitted work: no `reset --hard`, no `clean`, no
 * `rm -rf` of anything already there. See tools/blog-mcp/README.md's
 * "What is deliberately not a tool" section -- the same rule applies here.
 *
 * `cloneUrl` is operator intent (env-supplied); `.config/blog.json`'s own
 * `clone_url` is repo-controlled data checked separately, at tool-call time,
 * by `resolveOwnerRepo` (src/domain/github.ts). Together the two checks give
 * the effect of a three-way cross-check without duplicating either one.
 */
export async function ensureRepo(options: EnsureRepoOptions): Promise<EnsureRepoResult> {
  const { repoPath, cloneUrl, gitUserName, gitUserEmail } = options;

  const exists = fs.existsSync(repoPath);
  const entries = exists ? fs.readdirSync(repoPath) : [];

  if (!exists || entries.length === 0) {
    const parent = path.dirname(repoPath);
    fs.mkdirSync(parent, { recursive: true });
    await gitOrThrow(['clone', cloneUrl, repoPath], { repoRoot: parent, timeoutMs: CLONE_TIMEOUT_MS });
    await setIdentity(repoPath, gitUserName, gitUserEmail);
    const branch = await currentBranch({ repoRoot: repoPath });
    return { repoRoot: repoPath, action: 'cloned', branch, dirty: false };
  }

  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    throw new PreconditionError(
      `'${repoPath}' exists, is non-empty, and is not a git repository. Refusing to clone over it -- move or remove it first.`
    );
  }

  if (!(await isValidGitRepo(repoPath))) {
    throw new PreconditionError(
      `'${repoPath}' has a '.git' entry but is not a valid git repository (corrupt or interrupted clone). Refusing to continue -- inspect or remove the volume.`
    );
  }

  const actualRemote = await remoteUrl({ repoRoot: repoPath }).catch(() => undefined);
  if (!actualRemote || !sameOwnerRepo(actualRemote, cloneUrl)) {
    throw new PreconditionError(
      `'${repoPath}' origin ('${actualRemote ?? '(none)'}') does not match BLOG_MCP_CLONE_URL ('${cloneUrl}'). Refusing to repoint an existing checkout -- move it aside or fix BLOG_MCP_CLONE_URL.`
    );
  }

  if (fs.existsSync(path.join(repoPath, '.git', 'shallow'))) {
    const unshallow = await git(['fetch', '--unshallow'], { repoRoot: repoPath, timeoutMs: CLONE_TIMEOUT_MS });
    if (unshallow.exitCode !== 0) {
      throw new PreconditionError(`'${repoPath}' is a shallow clone and 'git fetch --unshallow' failed; refusing to continue.`);
    }
  }

  await setIdentity(repoPath, gitUserName, gitUserEmail);

  const config = loadConfig(repoPath);
  const baseBranch = config.baseBranch;

  await gitOrThrow(['fetch', '--prune', 'origin'], { repoRoot: repoPath, timeoutMs: CLONE_TIMEOUT_MS });

  if (!(await isClean({ repoRoot: repoPath }))) {
    // Refusing to boot here would make the container unrecoverable -- there
    // would be no tool to inspect or fix it. Boot succeeds, flagged dirty;
    // the scheduler (Phase 6) refuses to act while dirty is true.
    const branch = await currentBranch({ repoRoot: repoPath });
    return { repoRoot: repoPath, action: 'left-dirty', branch, dirty: true };
  }

  const branch = await currentBranch({ repoRoot: repoPath });

  if (branch === baseBranch) {
    const ff = await git(['merge', '--ff-only', `origin/${baseBranch}`], { repoRoot: repoPath });
    if (ff.exitCode !== 0) {
      // Impossible via this server's own tool surface (blog_push refuses the
      // base branch), but not impossible in the world -- report and change
      // nothing rather than guessing at a resolution.
      return { repoRoot: repoPath, action: 'diverged', branch, dirty: false };
    }
    return { repoRoot: repoPath, action: 'fast-forwarded', branch: baseBranch, dirty: false };
  }

  if (await isBranchMergedViaGitHub(repoPath, branch)) {
    await gitOrThrow(['switch', baseBranch], { repoRoot: repoPath });
    const ff = await git(['merge', '--ff-only', `origin/${baseBranch}`], { repoRoot: repoPath });
    if (ff.exitCode !== 0) {
      return { repoRoot: repoPath, action: 'diverged', branch: baseBranch, dirty: false };
    }
    return { repoRoot: repoPath, action: 'switched-to-base', branch: baseBranch, dirty: false };
  }

  return { repoRoot: repoPath, action: 'left-on-feature-branch', branch, dirty: false };
}

export interface EnsureRepoEnv {
  BLOG_MCP_CLONE_URL?: string;
  BLOG_MCP_GIT_USER_NAME?: string;
  BLOG_MCP_GIT_USER_EMAIL?: string;
  BLOG_MCP_WORKSPACE?: string;
}

/** Resolves EnsureRepoOptions from the environment, throwing PreconditionError listing every missing var at once. */
export function ensureRepoOptionsFromEnv(env: EnsureRepoEnv = process.env): EnsureRepoOptions {
  const missing = (['BLOG_MCP_CLONE_URL', 'BLOG_MCP_GIT_USER_NAME', 'BLOG_MCP_GIT_USER_EMAIL'] as const).filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new PreconditionError(`Missing required environment variable(s): ${missing.join(', ')}.`);
  }

  const workspace = env.BLOG_MCP_WORKSPACE ?? '/workspace';
  return {
    repoPath: path.join(workspace, 'repo'),
    cloneUrl: env.BLOG_MCP_CLONE_URL as string,
    gitUserName: env.BLOG_MCP_GIT_USER_NAME as string,
    gitUserEmail: env.BLOG_MCP_GIT_USER_EMAIL as string
  };
}
