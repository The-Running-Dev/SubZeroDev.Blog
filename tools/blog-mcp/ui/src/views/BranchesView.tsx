import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Table from '../lib/Table';
import { useRepoOwner } from '../lib/useRepoOwner';

// GitHub's /tree/<branch> route accepts literal slashes in a branch name
// (e.g. /tree/blog/some-slug is a valid ref path) -- encoding the whole
// name as one segment (encodeURIComponent('blog/x') -> 'blog%2Fx') 404s.
// Encoding per path segment preserves the slashes while still escaping
// anything else (#, ?, spaces) that would otherwise break the URL.
function branchTreeUrl(owner: string, repo: string, name: string): string {
  const encodedPath = name.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${owner}/${repo}/tree/${encodedPath}`;
}

interface Branch {
  name: string;
  current: boolean;
  ahead: number;
  behind: number;
}

export default function BranchesView() {
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { owner, repo } = useRepoOwner();

  useEffect(() => {
    api<{ branches: Branch[] }>('/api/branches')
      .then((data) => setBranches(data.data?.branches ?? []))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!branches) return <h2>Branches</h2>;

  return (
    <>
      <h2>Branches</h2>
      <Table
        headers={['Name', 'Current', 'Ahead', 'Behind']}
        rows={branches.map((b) => [
          owner && repo ? (
            <a key="name" href={branchTreeUrl(owner, repo, b.name)} target="_blank" rel="noopener noreferrer">
              {b.name}
            </a>
          ) : (
            b.name
          ),
          b.current ? 'yes' : '',
          b.ahead,
          b.behind
        ])}
      />
    </>
  );
}
