import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ok, precondition, infrastructureFailure } from '../result.js';
import { PreconditionError } from '../errors.js';
import { git, gitOrThrow, status, currentBranch, isClean, headSha, aheadBehind } from '../exec/git.js';
import { checkAllowedPaths } from '../domain/paths.js';
import { wrapTool, wrapMutatingTool, type ToolContext } from './context.js';

const COMMIT_SUBJECT_PATTERN = /^(feat|fix|docs|chore|refactor|style|test|build|ci)(\([a-z0-9-]+\))?: .{1,72}$/;

function deriveBranchName(kind: string, slug: string): string {
  return `${kind}/${slug}`;
}

interface PreservedCommit {
  sha: string;
  subject: string;
}

type PreparePublishBranchAction = 'switched-existing' | 'created-from-remote-base' | 'fast-forwarded-and-created' | 'preserved-and-rebased';

interface PreparePublishBranchResult {
  branch: string;
  action: PreparePublishBranchAction;
  originalBaseSha: string;
  resultingSha: string;
  remoteBaseSha: string;
  preservedCommits: PreservedCommit[];
}

export function registerLocalGitTools(ctx: ToolContext): void {
  const { server, repoRoot, config } = ctx;

  server.registerTool(
    'blog_sync_base',
    {
      title: 'Fetch the base branch',
      description:
        'Runs `git fetch --prune origin <base>`. With ffOnly, additionally fast-forwards the local base branch -- but only when it is currently checked out and the working tree is clean; never switches branches, never touches a feature branch, never merges anything but a fast-forward.',
      inputSchema: {
        base: z.string().optional(),
        ffOnly: z.boolean().optional()
      }
    },
    wrapMutatingTool(ctx, 'blog_sync_base', async (args: { base?: string; ffOnly?: boolean }) => {
      const base = args.base ?? config.baseBranch;
      await gitOrThrow(['fetch', '--prune', 'origin', base], { repoRoot });

      if (!args.ffOnly) {
        return ok(`Fetched origin/${base}`, { base, fastForwarded: false });
      }

      const branch = await currentBranch({ repoRoot });
      if (branch !== base) {
        return ok(`Fetched origin/${base}; not fast-forwarding -- currently on '${branch}', not '${base}'.`, {
          base,
          fastForwarded: false,
          branch
        });
      }
      if (!(await isClean({ repoRoot }))) {
        return ok(`Fetched origin/${base}; not fast-forwarding -- working tree is dirty.`, { base, fastForwarded: false, branch });
      }

      const ff = await git(['merge', '--ff-only', `origin/${base}`], { repoRoot });
      if (ff.exitCode !== 0) {
        return precondition(
          `Fetched origin/${base}; fast-forward refused (local '${base}' has commits not on origin). Use blog_prepare_publish_branch to preserve them on a feature branch.`,
          { base, fastForwarded: false, branch }
        );
      }
      return ok(`Fetched and fast-forwarded '${base}' to origin/${base}`, { base, fastForwarded: true, branch });
    })
  );

  server.registerTool(
    'blog_create_branch',
    {
      title: 'Create a working branch',
      description:
        "Creates and switches to a new branch from the latest origin/<base>. Derives `<kind>/<slug>` when name is omitted, matching this repo's branch-naming convention. Refuses if anything is already staged. Prefer blog_prepare_publish_branch instead: same inputs, but it also preserves a clean local-only commit already on the base branch (rebasing it onto the new branch) rather than cutting straight from origin/<base> and abandoning it. Kept as-is, unchanged, for any caller that already depends on this exact behavior.",
      inputSchema: {
        name: z.string().optional(),
        slug: z.string().optional(),
        kind: z.enum(['blog', 'content', 'fix', 'feature', 'docs']).optional(),
        checkoutExisting: z.boolean().optional()
      }
    },
    wrapMutatingTool(ctx, 'blog_create_branch', async (args: { name?: string; slug?: string; kind?: string; checkoutExisting?: boolean }) => {
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
    'blog_prepare_publish_branch',
    {
      title: 'Prepare a branch for publishing',
      description:
        "The first mutating step of publishing (TODO-NEXT.md sec7): creates or switches to a feature branch based on the latest origin/<base>, without abandoning a clean local-only commit that might already be sitting on <base> -- that commit is preserved on the requested branch and rebased onto the latest remote state instead of being left behind. Requires a fully clean working tree, including untracked files, when creating a new branch: uncommitted changes are never moved implicitly. Never rewrites a branch that already exists locally or on origin -- switches to it as-is instead.",
      inputSchema: {
        name: z.string().optional(),
        slug: z.string().optional(),
        kind: z.enum(['blog', 'content', 'fix', 'feature', 'docs']).optional(),
        checkoutExisting: z.boolean().optional()
      }
    },
    wrapMutatingTool(ctx, 'blog_prepare_publish_branch', async (args: { name?: string; slug?: string; kind?: string; checkoutExisting?: boolean }) => {
      if (!args.name && !args.slug) {
        throw new PreconditionError('Provide either name, or slug (with optional kind).');
      }
      const branchName = args.name ?? deriveBranchName(args.kind ?? 'blog', args.slug as string);
      const base = config.baseBranch;

      const existsLocally = (await git(['rev-parse', '--verify', '--quiet', branchName], { repoRoot })).exitCode === 0;
      // A live remote check, not a local origin/<branchName> tracking ref
      // (which would be stale if some other clone pushed this branch after
      // our last fetch, wrongly reporting "doesn't exist" and letting the
      // new-branch algorithm run over it).
      const remoteCheck = await git(['ls-remote', '--exit-code', 'origin', `refs/heads/${branchName}`], { repoRoot });
      if (remoteCheck.exitCode !== 0 && remoteCheck.exitCode !== 2) {
        return infrastructureFailure(`Could not verify whether branch '${branchName}' exists on origin.`, {
          command: ['git', 'ls-remote', '--exit-code', 'origin', `refs/heads/${branchName}`],
          exitCode: remoteCheck.exitCode,
          stdout: remoteCheck.stdout,
          stderr: remoteCheck.stderr
        });
      }
      const existsRemotely = remoteCheck.exitCode === 0;
      if (existsLocally || existsRemotely) {
        if (!args.checkoutExisting) {
          return precondition(
            `Branch '${branchName}' already ${existsLocally ? 'exists locally' : 'exists on origin'}; pass checkoutExisting to switch to it. It will not be rebased or otherwise rewritten.`
          );
        }
        if (existsLocally) {
          await gitOrThrow(['switch', branchName], { repoRoot });
        } else {
          await gitOrThrow(['fetch', 'origin', branchName], { repoRoot });
          await gitOrThrow(['switch', '-c', branchName, `origin/${branchName}`], { repoRoot });
        }
        const resultingSha = await headSha({ repoRoot });
        const baseRev = await git(['rev-parse', base], { repoRoot });
        const remoteBaseRev = await git(['rev-parse', `origin/${base}`], { repoRoot });
        const result: PreparePublishBranchResult = {
          branch: branchName,
          action: 'switched-existing',
          originalBaseSha: baseRev.exitCode === 0 ? baseRev.stdout.trim() : '',
          resultingSha,
          remoteBaseSha: remoteBaseRev.exitCode === 0 ? remoteBaseRev.stdout.trim() : '',
          preservedCommits: []
        };
        return ok(`Switched to existing branch '${branchName}'; left untouched (not rebased).`, result);
      }

      if (!(await isClean({ repoRoot }))) {
        return precondition(
          'Refusing to prepare a publish branch with uncommitted changes present (staged, unstaged, or untracked); commit, stash, or discard them first -- branch preparation never moves uncommitted work implicitly.'
        );
      }

      await gitOrThrow(['fetch', '--prune', 'origin', base], { repoRoot });
      const originalBaseSha = (await gitOrThrow(['rev-parse', base], { repoRoot })).stdout.trim();
      const remoteBaseSha = (await gitOrThrow(['rev-parse', `origin/${base}`], { repoRoot })).stdout.trim();
      const { ahead, behind } = await aheadBehind({ repoRoot }, `origin/${base}`, base, 'throw');

      if (ahead > 0) {
        // Local base has commit(s) origin doesn't -- preserve them on the
        // new branch and rebase onto the latest remote state, rather than
        // cutting the branch from origin/<base> and abandoning them
        // (the exact Milestone 11 incident this tool exists to prevent).
        const mergeBase = (await gitOrThrow(['merge-base', base, `origin/${base}`], { repoRoot })).stdout.trim();
        const logResult = await gitOrThrow(['log', '--format=%H\x1f%s', '-z', `${mergeBase}..${originalBaseSha}`], { repoRoot });
        const preservedCommits: PreservedCommit[] = logResult.stdout
          .split('\0')
          .filter((entry) => entry.length > 0)
          .map((entry) => {
            const [sha, subject] = entry.split('\x1f');
            return { sha: sha ?? '', subject: subject ?? '' };
          });

        await gitOrThrow(['branch', branchName, base], { repoRoot });
        await gitOrThrow(['switch', branchName], { repoRoot });
        await gitOrThrow(['branch', '-f', base, `origin/${base}`], { repoRoot });

        const rebase = await git(['rebase', '--onto', `origin/${base}`, mergeBase], { repoRoot });
        if (rebase.exitCode !== 0) {
          const abort = await git(['rebase', '--abort'], { repoRoot });
          if (abort.exitCode !== 0) {
            return infrastructureFailure(`Rebase failed and 'git rebase --abort' also failed; repository cleanup requires manual intervention.`, {
              command: ['git', 'rebase', '--abort'],
              exitCode: abort.exitCode,
              stdout: abort.stdout,
              stderr: [`Original rebase failure: ${rebase.stderr || rebase.stdout}`, `Abort failure: ${abort.stderr || abort.stdout}`].join('\n')
            });
          }
          const shaList = preservedCommits.map((c) => c.sha.slice(0, 12)).join(', ');
          return precondition(
            `Rebasing preserved commit(s) from '${base}' onto origin/${base} conflicted; aborted safely. The original commit(s) are still reachable from '${branchName}' (currently checked out, not rebased): ${shaList}. Resolve the conflict manually.`,
            { branch: branchName, originalBaseSha, remoteBaseSha, preservedCommits }
          );
        }

        const resultingSha = await headSha({ repoRoot });
        const result: PreparePublishBranchResult = {
          branch: branchName,
          action: 'preserved-and-rebased',
          originalBaseSha,
          resultingSha,
          remoteBaseSha,
          preservedCommits
        };
        return ok(
          `Created '${branchName}', preserving ${preservedCommits.length} local-only commit(s) from '${base}' rebased onto origin/${base}`,
          result
        );
      }

      if (behind > 0) {
        const onBase = (await currentBranch({ repoRoot })) === base;
        if (onBase) {
          await gitOrThrow(['merge', '--ff-only', `origin/${base}`], { repoRoot });
        } else {
          await gitOrThrow(['branch', '-f', base, `origin/${base}`], { repoRoot });
        }
        await gitOrThrow(['switch', '-c', branchName, base], { repoRoot });
        const resultingSha = await headSha({ repoRoot });
        const result: PreparePublishBranchResult = {
          branch: branchName,
          action: 'fast-forwarded-and-created',
          originalBaseSha,
          resultingSha,
          remoteBaseSha,
          preservedCommits: []
        };
        return ok(`Fast-forwarded '${base}' to origin/${base} and created '${branchName}'`, result);
      }

      await gitOrThrow(['switch', '-c', branchName, base], { repoRoot });
      const resultingSha = await headSha({ repoRoot });
      const result: PreparePublishBranchResult = {
        branch: branchName,
        action: 'created-from-remote-base',
        originalBaseSha,
        resultingSha,
        remoteBaseSha,
        preservedCommits: []
      };
      return ok(`Created '${branchName}' from '${base}' (already in sync with origin/${base})`, result);
    })
  );

  server.registerTool(
    'blog_stage',
    {
      title: 'Stage files',
      description:
        'Stages an explicit, non-empty list of repo-relative paths, including tracked deletions. Never accepts -A, --all, or "." as caller paths -- every path is checked against the publishing-path allowlist before staging.',
      inputSchema: {
        paths: z.array(z.string()).min(1)
      }
    },
    wrapMutatingTool(ctx, 'blog_stage', async (args: { paths: string[] }) => {
      const check = checkAllowedPaths(repoRoot, args.paths, ctx.capabilities?.writablePathPrefixes, { allowMissing: true });
      if (!check.ok) return precondition(check.reason ?? 'One or more paths are not allowed.');

      for (const relativePath of args.paths) {
        const normalized = relativePath.replace(/\\/g, '/');
        if (fs.existsSync(path.join(repoRoot, normalized))) continue;
        const tracked = await git(['ls-files', '--error-unmatch', '--', normalized], { repoRoot });
        if (tracked.exitCode !== 0) {
          return precondition(`'${relativePath}' does not exist and is not a tracked deletion.`);
        }
      }

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
    wrapMutatingTool(ctx, 'blog_commit', async (args: { type?: string; scope?: string; summary?: string; body?: string; message?: string; coAuthor?: string }) => {
      const branch = await currentBranch({ repoRoot });
      if (branch === config.baseBranch) {
        return precondition(`Refusing to commit directly on '${branch}'; it is the base branch. Use blog_prepare_publish_branch first.`);
      }

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
    wrapMutatingTool(ctx, 'blog_reset_stage', async (args: { paths: string[] }) => {
      await gitOrThrow(['restore', '--staged', '--', ...args.paths], { repoRoot });
      return ok(`Unstaged ${args.paths.length} path(s)`, { paths: args.paths });
    })
  );
}
