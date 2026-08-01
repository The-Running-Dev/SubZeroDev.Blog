import { useEffect, useState } from 'react';
import { api } from './api';

interface RepoOwner {
  owner?: string;
  repo?: string;
}

// Module-scope, not component state: every view that needs owner/repo (Log,
// Branches) shares one fetch of /api/repo/status instead of each firing its
// own on mount. No React Context -- this app has none yet, and a single
// cached promise is simpler than introducing the first one for one value.
let cached: Promise<RepoOwner> | null = null;

function fetchRepoOwner(): Promise<RepoOwner> {
  if (!cached) {
    cached = api<RepoOwner>('/api/repo/status')
      .then((res) => ({ owner: res.data?.owner, repo: res.data?.repo }))
      .catch(() => ({}));
  }
  return cached;
}

/** owner/repo are undefined until the fetch resolves, and stay undefined if this checkout's remote isn't GitHub-shaped -- callers should render plain text as a fallback rather than a broken link. */
export function useRepoOwner(): RepoOwner {
  const [repoOwner, setRepoOwner] = useState<RepoOwner>({});

  useEffect(() => {
    let cancelled = false;
    void fetchRepoOwner().then((result) => {
      if (!cancelled) setRepoOwner(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return repoOwner;
}
