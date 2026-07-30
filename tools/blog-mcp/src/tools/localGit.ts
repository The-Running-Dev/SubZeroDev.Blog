import { z } from 'zod';
import { ok, precondition, infrastructureFailure } from '../result.js';
import { PreconditionError } from '../errors.js';
import { git, gitOrThrow, status } from '../exec/git.js';
import { checkAllowedPaths } from '../domain/paths.js';
import { wrapTool, type ToolContext } from './context.js';

const COMMIT_SUBJECT_PATTERN = /^(feat|fix|docs|chore|refactor|style|test|build|ci)(\([a-z0-9-]+\))?: .{1,72}$/;

function deriveBranchName(kind: string, slug: string): string {
  return `${kind}/${slug}`;
}

export function registerLocalGitTools(ctx: ToolContext): void {
  const { server, repoRoot, config } = ctx;

  server.registerTool(
    'blog_sync_base',
    {
      title: 'Fetch the base branch',
      description: 'Runs `git fetch origin <base>`. Network read only; never merges or checks out anything.',
      inputSchema: {
        base: z.string().optional()
      }
    },
    wrapTool(async (args: { base?: string }) => {
      const base = args.base ?? config.baseBranch;
      await gitOrThrow(['fetch', 'origin', base], { repoRoot });
      return ok(`Fetched origin/${base}`, { base });
    })
  );

  server.registerTool(
    'blog_create_branch',
    {
      title: 'Create a working branch',
      description:
        'Creates and switches to a new branch from the latest origin/<base>. Derives `<kind>/<slug>` when name is omitted, matching this repo\'s branch-naming convention. Refuses if anything is already staged.',
      inputSchema: {
        name: z.string().optional(),
        slug: z.string().optional(),
        kind: z.enum(['blog', 'content', 'fix', 'feature', 'docs']).optional(),
        checkoutExisting: z.boolean().optional()
      }
    },
    wrapTool(async (args: { name?: string; slug?: string; kind?: string; checkoutExisting?: boolean }) => {
      if (!args.name && !args.slug) {
        throw new PreconditionError('Provide either name, or slug (with optional kind).');
      }
      const branchName = args.name ?? deriveBranchName(args.kind ?? 'blog', args.slug as string);

      const entries = await status({ repoRoot });
      const stagedPaths = entries.filter((e) => e.staged).map((e) => e.path);
      if (stagedPaths.length > 0) {
        return precondition(`Refusing to create a branch with staged changes present: ${stagedPaths.join(', ')}.`);
      }

      const existsLocally = (await git(['rev-parse', '--verify', '--quiet', branchName], { repoRoot })).exitCode === 0;
      if (existsLocally) {
        if (!args.checkoutExisting) {
          return precondition(`Branch '${branchName}' already exists locally; pass checkoutExisting to switch to it.`);
        }
        await gitOrThrow(['switch', branchName], { repoRoot });
        return ok(`Switched to existing branch '${branchName}'`, { branch: branchName, created: false });
      }

      await gitOrThrow(['fetch', 'origin', config.baseBranch], { repoRoot });
      await gitOrThrow(['switch', '-c', branchName, `origin/${config.baseBranch}`], { repoRoot });
      return ok(`Created and switched to '${branchName}' from origin/${config.baseBranch}`, { branch: branchName, created: true });
    })
  );

  server.registerTool(
    'blog_stage',
    {
      title: 'Stage files',
      description:
        'Stages an explicit, non-empty list of repo-relative paths. Never accepts -A, --all, or "." -- every path is checked against the publishing-path allowlist before staging.',
      inputSchema: {
        paths: z.array(z.string()).min(1)
      }
    },
    wrapTool(async (args: { paths: string[] }) => {
      const check = checkAllowedPaths(repoRoot, args.paths);
      if (!check.ok) return precondition(check.reason ?? 'One or more paths are not allowed.');

      await gitOrThrow(['add', '--', ...args.paths], { repoRoot });
      return ok(`Staged ${args.paths.length} path(s)`, { paths: args.paths });
    })
  );

  server.registerTool(
    'blog_commit',
    {
      title: 'Commit staged changes',
      description:
        'Creates a commit from whatever is currently staged. Enforces a conventional-commit subject line and refuses an empty stage. Never passes --no-verify.',
      inputSchema: {
        type: z.enum(['feat', 'fix', 'docs', 'chore', 'refactor', 'style', 'test', 'build', 'ci']).optional(),
        scope: z.string().optional(),
        summary: z.string().optional(),
        body: z.string().optional(),
        message: z.string().optional(),
        coAuthor: z.string().optional()
      }
    },
    wrapTool(async (args: { type?: string; scope?: string; summary?: string; body?: string; message?: string; coAuthor?: string }) => {
      let subject: string;
      if (args.message) {
        subject = args.message.split('\n')[0] ?? args.message;
      } else if (args.type && args.summary) {
        subject = `${args.type}${args.scope ? `(${args.scope})` : ''}: ${args.summary}`;
      } else {
        return precondition('Provide either message, or type + summary.');
      }

      if (!COMMIT_SUBJECT_PATTERN.test(subject)) {
        return precondition(
          `Commit subject '${subject}' does not match '<type>(scope?): summary' (types: feat, fix, docs, chore, refactor, style, test, build, ci).`
        );
      }

      const entries = await status({ repoRoot });
      const stagedCount = entries.filter((e) => e.staged).length;
      if (stagedCount === 0) {
        return precondition('Nothing is staged; call blog_stage first.');
      }

      const messageParts = [subject];
      if (args.body) messageParts.push('', args.body);
      if (args.coAuthor) messageParts.push('', `Co-Authored-By: ${args.coAuthor}`);
      const message = messageParts.join('\n');

      const result = await git(['commit', '-m', message], { repoRoot });
      if (result.exitCode !== 0) {
        return infrastructureFailure('git commit failed', { command: ['git', 'commit', '-m', subject], exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
      }

      const sha = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot })).stdout.trim();
      return ok(`Committed ${sha.slice(0, 12)}: ${subject}`, { sha, subject });
    })
  );

  server.registerTool(
    'blog_diff',
    {
      title: 'Show a diff',
      description: 'Shows a unified diff (staged or working tree) plus a whitespace/no-newline-at-eof check via `git diff --check`.',
      inputSchema: {
        staged: z.boolean().optional(),
        paths: z.array(z.string()).optional()
      }
    },
    wrapTool(async (args: { staged?: boolean; paths?: string[] }) => {
      const diffArgs = ['diff', ...(args.staged ? ['--cached'] : []), ...(args.paths ? ['--', ...args.paths] : [])];
      const diff = await gitOrThrow(diffArgs, { repoRoot });
      const checkArgs = ['diff', '--check', ...(args.staged ? ['--cached'] : []), ...(args.paths ? ['--', ...args.paths] : [])];
      const check = await git(checkArgs, { repoRoot });
      return ok(diff.stdout.trim() === '' ? 'No changes' : `${diff.stdout.split('\n').length} diff line(s)`, {
        diff: diff.stdout,
        checkClean: check.exitCode === 0,
        checkOutput: check.stdout
      });
    })
  );

  server.registerTool(
    'blog_reset_stage',
    {
      title: 'Unstage files',
      description: 'Unstages specific paths via `git restore --staged --`. Never touches the working tree.',
      inputSchema: {
        paths: z.array(z.string()).min(1)
      }
    },
    wrapTool(async (args: { paths: string[] }) => {
      await gitOrThrow(['restore', '--staged', '--', ...args.paths], { repoRoot });
      return ok(`Unstaged ${args.paths.length} path(s)`, { paths: args.paths });
    })
  );
}
