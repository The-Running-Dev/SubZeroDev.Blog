import { run, type RunResult } from './run.js';
import { InfrastructureError } from '../errors.js';

const GIT_TIMEOUT_MS = 60_000;

export interface GitOptions {
  repoRoot: string;
  timeoutMs?: number;
}

/** Runs git with an explicit argv array (never a shell string) and returns the raw result. */
export async function git(args: string[], options: GitOptions): Promise<RunResult> {
  return run('git', args, {
    cwd: options.repoRoot,
    timeoutMs: options.timeoutMs ?? GIT_TIMEOUT_MS
  });
}

/** Runs git and throws InfrastructureError on non-zero exit -- for calls with no meaningful validation outcome. */
export async function gitOrThrow(args: string[], options: GitOptions): Promise<RunResult> {
  const result = await git(args, options);
  if (result.exitCode !== 0) {
    throw new InfrastructureError(`git ${args.join(' ')} failed (exit ${result.exitCode})`, {
      command: ['git', ...args],
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr
    });
  }
  return result;
}

export async function currentBranch(options: GitOptions): Promise<string> {
  const result = await gitOrThrow(['rev-parse', '--abbrev-ref', 'HEAD'], options);
  return result.stdout.trim();
}

export async function headSha(options: GitOptions): Promise<string> {
  const result = await gitOrThrow(['rev-parse', 'HEAD'], options);
  return result.stdout.trim();
}

export async function remoteUrl(options: GitOptions, remote = 'origin'): Promise<string> {
  const result = await gitOrThrow(['remote', 'get-url', remote], options);
  return result.stdout.trim();
}

/** Porcelain v2 status, one entry per changed/untracked path. */
export interface StatusEntry {
  path: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export async function status(options: GitOptions): Promise<StatusEntry[]> {
  const result = await gitOrThrow(['status', '--porcelain=v2', '--untracked-files=all'], options);
  const entries: StatusEntry[] = [];
  for (const line of result.stdout.split('\n')) {
    if (!line) continue;
    if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const parts = line.split(' ');
      const xy = parts[1] ?? '..';
      const path = line.startsWith('2 ') ? (parts[parts.length - 2] ?? '') : (parts[parts.length - 1] ?? '');
      entries.push({
        path,
        staged: xy[0] !== '.',
        unstaged: xy[1] !== '.',
        untracked: false
      });
    } else if (line.startsWith('? ')) {
      entries.push({ path: line.slice(2), staged: false, unstaged: false, untracked: true });
    }
  }
  return entries;
}

export async function isClean(options: GitOptions): Promise<boolean> {
  const entries = await status(options);
  return entries.length === 0;
}

export interface AheadBehind {
  ahead: number;
  behind: number;
}

/** `git rev-list --left-right --count <base>...<ref>` -> { behind, ahead }, or zeros if the ref/base pair can't be compared (e.g. base not fetched yet). */
export async function aheadBehind(options: GitOptions, base: string, ref: string): Promise<AheadBehind> {
  const result = await git(['rev-list', '--left-right', '--count', `${base}...${ref}`], options);
  if (result.exitCode !== 0) return { ahead: 0, behind: 0 };
  const [behindStr, aheadStr] = result.stdout.trim().split(/\s+/);
  return { behind: Number(behindStr ?? 0), ahead: Number(aheadStr ?? 0) };
}
