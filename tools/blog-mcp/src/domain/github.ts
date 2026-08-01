import { PreconditionError } from '../errors.js';
import { remoteUrl } from '../exec/git.js';

export interface OwnerRepo {
  owner: string;
  repo: string;
}

/** Parses `owner/repo` out of an HTTPS or SSH GitHub remote URL. */
export function parseOwnerRepo(url: string): OwnerRepo {
  const httpsMatch = /^https:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  const sshMatch = /^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  throw new PreconditionError(`Could not parse an owner/repo pair out of remote URL '${url}'.`);
}

function tryParseOwnerRepo(url: string): OwnerRepo | undefined {
  try {
    return parseOwnerRepo(url);
  } catch {
    return undefined;
  }
}

/**
 * Resolves owner/repo, cross-checking the configured clone_url against the
 * actual `git remote get-url origin` when both are available -- a stale
 * .config/blog.json (this repo was renamed, or the config was copied into a
 * fork) is exactly the kind of drift that should surface as an error rather
 * than silently target the wrong repository.
 *
 * "Available" means parseable as a GitHub URL, not merely present: a remote
 * that isn't GitHub-shaped at all (a local bare path, as in this package's
 * own scratch-remote tests) is treated the same as an absent one, falling
 * through to whichever source *does* parse, rather than throwing.
 */
export function resolveOwnerRepo(configuredCloneUrl: string, actualRemoteUrl: string | undefined): OwnerRepo {
  const configured = configuredCloneUrl ? tryParseOwnerRepo(configuredCloneUrl) : undefined;
  const actual = actualRemoteUrl ? tryParseOwnerRepo(actualRemoteUrl) : undefined;

  if (configured && actual) {
    if (configured.owner !== actual.owner || configured.repo !== actual.repo) {
      throw new PreconditionError(
        `.config/blog.json's clone_url (${configured.owner}/${configured.repo}) disagrees with 'git remote get-url origin' (${actual.owner}/${actual.repo}).`
      );
    }
    return configured;
  }

  if (actual) return actual;
  if (configured) return configured;

  throw new PreconditionError('Could not resolve owner/repo from either .config/blog.json or the git remote.');
}

/**
 * `resolveOwnerRepo`, but reading the actual git remote itself first --
 * the one call every tool needing owner/repo (remote.ts, monitor.ts,
 * authoring.ts's blog_repo_status) otherwise duplicated locally. A repo
 * with no `origin` remote at all (freshly `git init`, no push yet) is
 * treated the same as a remote that fails to resolve -- `actualRemoteUrl`
 * simply stays undefined, falling through to `configuredCloneUrl` alone.
 */
export async function resolveOwnerRepoFromGit(repoRoot: string, configuredCloneUrl: string): Promise<OwnerRepo> {
  const actualRemoteUrl = await remoteUrl({ repoRoot }).catch(() => undefined);
  return resolveOwnerRepo(configuredCloneUrl, actualRemoteUrl);
}
