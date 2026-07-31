import { z } from 'zod';
import { ok, precondition } from '../result.js';
import { git, gitOrThrow, currentBranch, isClean } from '../exec/git.js';
import { wrapTool, type ToolContext } from './context.js';

const DEFAULT_LOG_LIMIT = 20;
const MAX_LOG_LIMIT = 200;

/** Unit separator (0x1f) between fields, NUL between records (git log -z) -- a crafted commit subject cannot spoof either boundary. */
const FIELD_SEP = '\x1f';

interface AheadBehind {
  ahead: number;
  behind: number;
}

/** `git rev-list --left-right --count <base>...<ref>` -> { behind, ahead }, or zeros if the ref/base pair can't be compared (e.g. base not fetched yet). */
async function aheadBehind(repoRoot: string, base: string, ref: string): Promise<AheadBehind> {
  const result = await git(['rev-list', '--left-right', '--count', `${base}...${ref}`], { repoRoot });
  if (result.exitCode !== 0) return { ahead: 0, behind: 0 };
  const [behindStr, aheadStr] = result.stdout.trim().split(/\s+/);
  return { behind: Number(behindStr ?? 0), ahead: Number(aheadStr ?? 0) };
}

/**
 * Read-only local-git introspection, registered unconditionally (like
 * blog_repo_status) so it's available even under BLOG_MCP_READ_ONLY=1 --
 * none of it mutates anything.
 */
export function registerRepoInfoTools(ctx: ToolContext): void {
  const { server, repoRoot, config } = ctx;

  server.registerTool(
    'blog_log',
    {
      title: 'Show recent git history',
      description: `Shows up to ${MAX_LOG_LIMIT} recent commits from a ref. Defaults to origin/<base>, not HEAD -- on a long-lived container the working tree may be parked on a stale branch, and history should reflect what's actually published, not wherever the checkout happens to be sitting. Read-only.`,
      inputSchema: {
        ref: z.string().optional(),
        limit: z.number().int().positive().max(MAX_LOG_LIMIT).optional()
      }
    },
    wrapTool(async (args: { ref?: string; limit?: number }) => {
      const ref = args.ref ?? `origin/${config.baseBranch}`;
      const limit = args.limit ?? DEFAULT_LOG_LIMIT;
      const result = await git(
        ['log', ref, '-n', String(limit), '-z', `--pretty=format:%H${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%aI${FIELD_SEP}%s`],
        { repoRoot }
      );
      if (result.exitCode !== 0) {
        return precondition(`Could not read log for '${ref}': ${result.stderr.trim() || 'unknown ref or not fetched yet.'}`);
      }
      const commits = result.stdout
        .split('\0')
        .filter((entry) => entry.length > 0)
        .map((entry) => {
          const [sha, authorName, authorEmail, authorDate, subject] = entry.split(FIELD_SEP);
          return { sha, authorName, authorEmail, authorDate, subject };
        });
      return ok(`${commits.length} commit(s) on '${ref}'`, { ref, commits });
    })
  );

  server.registerTool(
    'blog_branches',
    {
      title: 'List local branches',
      description: `Lists local branches with ahead/behind counts against origin/<base>, and flags which one is currently checked out. Read-only.`,
      inputSchema: {}
    },
    wrapTool(async () => {
      const current = await currentBranch({ repoRoot });
      const listResult = await gitOrThrow(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], { repoRoot });
      const names = listResult.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
      const base = `origin/${config.baseBranch}`;
      const branches = await Promise.all(
        names.map(async (name) => ({ name, current: name === current, ...(await aheadBehind(repoRoot, base, name)) }))
      );
      return ok(`${branches.length} local branch(es)`, { branches, current });
    })
  );

  server.registerTool(
    'blog_repo_health',
    {
      title: 'Repository health summary',
      description:
        'One consolidated read-only view for dashboards/monitoring: current branch, dirty/clean, whether the working tree is parked off the base branch, and ahead/behind vs origin/<base>. Never used to gate a decision by itself -- callers still validate/preflight before writing.',
      inputSchema: {}
    },
    wrapTool(async () => {
      const branch = await currentBranch({ repoRoot });
      const dirty = !(await isClean({ repoRoot }));
      const parked = branch !== config.baseBranch;
      const { ahead, behind } = await aheadBehind(repoRoot, `origin/${config.baseBranch}`, 'HEAD');
      return ok(`On '${branch}'${dirty ? ' (dirty)' : ''}${parked ? ' (parked off base)' : ''}`, {
        branch,
        baseBranch: config.baseBranch,
        dirty,
        parked,
        ahead,
        behind
      });
    })
  );
}
