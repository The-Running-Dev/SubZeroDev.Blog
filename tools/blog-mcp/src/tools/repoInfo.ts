import { z } from 'zod';
import { ok, precondition } from '../result.js';
import { git, gitOrThrow, currentBranch, isClean } from '../exec/git.js';
import { ghJson } from '../exec/gh.js';
import { checkStatus } from './monitor.js';
import { wrapTool, type ToolContext } from './context.js';

const DEFAULT_LOG_LIMIT = 20;
const MAX_LOG_LIMIT = 200;

/** A local branch with no commit in this many days counts as stale in blog_repo_health's summary. */
const STALE_BRANCH_DAYS = 30;

/** How many of the most recently merged PRs blog_repo_health samples for a required-check pass rate -- enough to be representative without turning a dashboard load into a long chain of GitHub API calls. */
const CHECK_SAMPLE_SIZE = 5;

/** How many merged PRs to fetch before sorting by mergedAt and taking CHECK_SAMPLE_SIZE -- gh pr list's default order for --state merged is not guaranteed to be most-recently-merged-first (same caveat as blog_list_prs), so this over-fetches a bit and sorts client-side rather than trusting it. */
const MERGED_PR_FETCH_LIMIT = 20;

/** GitHub calls in blog_repo_health are best-effort (see its handler) -- bounded so an unauthenticated/unreachable `gh` can't stall a dashboard load. */
const GITHUB_FIELD_TIMEOUT_MS = 15_000;

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

/** `git log -1 --format=%cI <ref>` -> that commit's committer date, or null if the ref has no commits / can't be read. */
async function lastCommitDate(repoRoot: string, ref: string): Promise<string | null> {
  const result = await git(['log', '-1', '--format=%cI', ref], { repoRoot });
  if (result.exitCode !== 0) return null;
  const date = result.stdout.trim();
  return date || null;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
}

interface BranchMetadata {
  name: string;
  current: boolean;
  ahead: number;
  behind: number;
  lastCommitDate: string | null;
}

/** Shared by blog_branches and blog_repo_health's stale-branch count so the two can't drift on what "a local branch" or "its last commit" means. */
async function listBranchesWithMetadata(repoRoot: string, base: string): Promise<{ branches: BranchMetadata[]; current: string }> {
  const current = await currentBranch({ repoRoot });
  const listResult = await gitOrThrow(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], { repoRoot });
  const names = listResult.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  const branches = await Promise.all(
    names.map(async (name) => ({
      name,
      current: name === current,
      ...(await aheadBehind(repoRoot, base, name)),
      lastCommitDate: await lastCommitDate(repoRoot, name)
    }))
  );
  return { branches, current };
}

interface LatestDeployRun {
  status: string;
  conclusion: string | null;
  createdAt: string;
  url: string;
}

/** Most recent Docs Deploy run regardless of which commit triggered it -- deliberately separate from src/tools/monitor.ts's deployStatus(), which is scoped to one specific merge SHA and must stay that way: that SHA-scoping is load-bearing for the published-URL hard rule (blog_verify_published_url). This answers a different question ("is CI healthy right now") that deployStatus cannot. */
async function latestDeployRun(ctx: ToolContext): Promise<LatestDeployRun | null> {
  const runs = await ghJson<LatestDeployRun[]>(
    ['run', 'list', '--workflow', ctx.config.deployWorkflow, '--json', 'status,conclusion,createdAt,url', '--limit', '1'],
    { repoRoot: ctx.repoRoot, timeoutMs: GITHUB_FIELD_TIMEOUT_MS }
  );
  return runs[0] ?? null;
}

interface MergedPrHead {
  headRefOid: string;
  mergedAt: string | null;
}

/**
 * Samples the required-check outcome of the CHECK_SAMPLE_SIZE most recently
 * merged PRs' own head SHAs via monitor.ts's checkStatus (reused, not
 * reimplemented, so the "most recent run per check name" dedup logic lives
 * in one place). Deliberately NOT origin/<base>'s own commit log: this
 * repository's PRs are squash-merged, and required checks are configured to
 * run on pull_request (the PR's own head commit) -- the resulting merge
 * commit on <base> is a brand-new SHA that never had those checks run
 * against it directly, so sampling <base>'s log would show a near-100%
 * *failure* rate regardless of how healthy CI actually is. The PR's own
 * head SHA, by contrast, genuinely has that check-run history recorded.
 */
async function requiredCheckPassRate(ctx: ToolContext): Promise<{ sampled: number; passed: number }> {
  const merged = await ghJson<MergedPrHead[]>(
    ['pr', 'list', '--state', 'merged', '--json', 'headRefOid,mergedAt', '--limit', String(MERGED_PR_FETCH_LIMIT)],
    { repoRoot: ctx.repoRoot, timeoutMs: GITHUB_FIELD_TIMEOUT_MS }
  );
  const shas = merged
    .filter((pr): pr is MergedPrHead & { mergedAt: string } => pr.mergedAt !== null)
    .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt))
    .slice(0, CHECK_SAMPLE_SIZE)
    .map((pr) => pr.headRefOid);
  const results = await Promise.all(shas.map((sha) => checkStatus(ctx, sha, ctx.config.requiredChecks)));
  return { sampled: results.length, passed: results.filter((r) => r.allRequiredPassed).length };
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
      description: `Lists local branches with ahead/behind counts against origin/<base>, each one's last commit date, and flags which one is currently checked out. Read-only.`,
      inputSchema: {}
    },
    wrapTool(async () => {
      const base = `origin/${config.baseBranch}`;
      const { branches, current } = await listBranchesWithMetadata(repoRoot, base);
      return ok(`${branches.length} local branch(es)`, { branches, current });
    })
  );

  server.registerTool(
    'blog_repo_health',
    {
      title: 'Repository health summary',
      description:
        'One consolidated read-only view for dashboards/monitoring: current branch, dirty/clean, parked-off-base, ahead/behind vs origin/<base>, recent commit activity, and a stale-branch count -- plus, best-effort when GitHub is reachable, open PR count, the most recent Docs Deploy run, and a required-check pass rate sampled over the most recently merged PRs (their own head commits, not origin/<base>\'s squash-merge commits, which never carry that check-run history). Never used to gate a decision by itself -- callers still validate/preflight before writing.',
      inputSchema: {}
    },
    wrapTool(async () => {
      const branch = await currentBranch({ repoRoot });
      const dirty = !(await isClean({ repoRoot }));
      const parked = branch !== config.baseBranch;
      const baseRef = `origin/${config.baseBranch}`;
      const { ahead, behind } = await aheadBehind(repoRoot, baseRef, 'HEAD');

      const commitsLast7DaysResult = await git(['rev-list', '--count', '--since=7.days', baseRef], { repoRoot });
      const commitsLast7Days = commitsLast7DaysResult.exitCode === 0 ? Number(commitsLast7DaysResult.stdout.trim()) || 0 : 0;
      const daysSinceLastCommit = daysSince(await lastCommitDate(repoRoot, baseRef));

      const { branches } = await listBranchesWithMetadata(repoRoot, baseRef);
      const staleBranches = branches.filter((b) => {
        const age = daysSince(b.lastCommitDate);
        return age !== null && age > STALE_BRANCH_DAYS;
      });

      // Best-effort: this tool is registered unconditionally (works under
      // BLOG_MCP_READ_ONLY=1 with zero GitHub dependency today), so the
      // GitHub-derived fields must never turn an otherwise-healthy local
      // summary into a failed call -- gated on the same `monitor` capability
      // that already means "this consumer may make read-only GitHub calls",
      // wrapped in one try/catch, and bounded so an unauthenticated `gh`
      // can't stall a dashboard load.
      let github: { openPrCount: number; lastDeployRun: LatestDeployRun | null; requiredCheckPassRate: { sampled: number; passed: number } } | null = null;
      let githubNote: string | undefined;
      if (ctx.capabilities?.monitor) {
        try {
          const [openPrCount, deployRun, passRate] = await Promise.all([
            ghJson<Array<{ number: number }>>(['pr', 'list', '--state', 'open', '--json', 'number', '--limit', '100'], {
              repoRoot,
              timeoutMs: GITHUB_FIELD_TIMEOUT_MS
            }).then((prs) => prs.length),
            latestDeployRun(ctx),
            requiredCheckPassRate(ctx)
          ]);
          github = { openPrCount, lastDeployRun: deployRun, requiredCheckPassRate: passRate };
        } catch (err) {
          githubNote = `GitHub-derived fields unavailable: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      return ok(`On '${branch}'${dirty ? ' (dirty)' : ''}${parked ? ' (parked off base)' : ''}`, {
        branch,
        baseBranch: config.baseBranch,
        dirty,
        parked,
        ahead,
        behind,
        commitsLast7Days,
        daysSinceLastCommit,
        staleBranches: { count: staleBranches.length, names: staleBranches.map((b) => b.name) },
        github,
        ...(githubNote ? { githubNote } : {})
      });
    })
  );
}
